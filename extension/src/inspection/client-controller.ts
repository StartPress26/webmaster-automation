import { ApiError } from '../errors.ts';
import { buildClientInspectionTasks, collectClientInspectionTargets, InspectionCollectionCancelled } from './client-plan.ts';
import type { ClientInspectionTask } from './client-plan';
import type { ApiClient } from '../api';
import { createWorkTabController } from '../tabs/controller.ts';
import type { WorkTabController, WorkTabState } from '../tabs/controller';
import { readNaverPreview } from '../engines/naver/preview.ts';
import type { NaverPreviewState } from '../engines/naver/preview';
import { runNaverAutomation } from '../engines/naver/automation.ts';
import { runBingAutomation } from '../engines/bing/automation.ts';
import { BingAutomationError, BING_STAGE_LABELS } from '../engines/bing/observation.ts';
import { NaverAutomationError } from '../engines/naver/observation.ts';

export type GuiEngine = 'naver' | 'bing';

export interface ClientInspectionRun {
  readonly clientId: string;
  readonly clientName: string;
  readonly scope: string;
  readonly phase: 'idle' | 'collecting' | 'preparing_tabs' | 'awaiting_tabs' | 'running' | 'finished' | 'cancelled' | 'failed';
  readonly tabs: Readonly<Partial<Record<GuiEngine, WorkTabState>>>;
  readonly cancelRequested: boolean;
  readonly targetCount: number;
  readonly tasks: readonly ClientInspectionTask[];
  readonly message: string;
  readonly naverPreview?: NaverPreviewState;
}

export interface ClientInspectionController {
  readonly getState: () => ClientInspectionRun;
  readonly start: (clientId: string, clientName: string) => Promise<void>;
  readonly cancel: () => void;
  readonly chooseTab: (scope: string, engine: GuiEngine, candidateId?: string) => Promise<void>;
  readonly continueApiOnly: (scope: string) => Promise<void>;
  readonly readNaver: (scope: string) => Promise<void>;
}

// 수집·실행 중에는 다른 고객사의 중복 실행도 시작하지 않습니다.
export function clientInspectionBusy(run: ClientInspectionRun): boolean {
  return ['collecting', 'preparing_tabs', 'awaiting_tabs', 'running'].includes(run.phase);
}

// 전체 조회의 스냅샷과 취소를 관리하고 기존 단일 URL API를 순차 호출합니다.
export function createClientInspectionController(
  api: Pick<ApiClient, 'listSites' | 'listPages' | 'inspect'>,
  changed: () => void = (): void => {},
  tabControllers: Readonly<Record<GuiEngine, WorkTabController>> = { naver: createWorkTabController(), bing: createWorkTabController() },
  naverAutomation: typeof runNaverAutomation = runNaverAutomation,
  bingAutomation: typeof runBingAutomation = runBingAutomation,
): ClientInspectionController {
  let state: ClientInspectionRun = { clientId: '', clientName: '', scope: '', tabs: {}, phase: 'idle', cancelRequested: false, targetCount: 0, tasks: [], message: '' };
  let sequence = 0;
  let naverAbort = new AbortController();
  let bingAbort = new AbortController();

  // 실행 상태를 새 객체로 교체하고 화면에 변경을 알립니다.
  function update(patch: Partial<ClientInspectionRun>): void {
    state = { ...state, ...patch };
    changed();
  }

  // 특정 작업의 상태만 교체하며 다른 엔진의 성공·오류를 유지합니다.
  function updateTask(id: string, patch: Partial<ClientInspectionTask>): void {
    update({ tasks: state.tasks.map((task): ClientInspectionTask => task.id === id ? { ...task, ...patch } : task) });
  }

  // 진행 중인 서버 요청은 끝까지 확인하고 다음 요청부터 취소합니다.
  function cancel(): void {
    if (!clientInspectionBusy(state)) return;

    const waiting = state.phase === 'awaiting_tabs';

    update({ cancelRequested: true, message: '현재 요청이 끝나면 중단합니다. 이미 저장된 결과는 유지됩니다.' });
    naverAbort.abort();
    bingAbort.abort();

    if (waiting) finishCancelled();
  }

  // 현재 실행의 네이버 탭에서 보이는 관측만 읽고 작업 상태·DB는 변경하지 않습니다.
  async function readNaver(scope: string): Promise<void> {
    const selected = state.tabs.naver?.selected;
    if (scope !== state.scope || !selected || state.naverPreview?.loading || !['awaiting_tabs', 'finished', 'cancelled', 'failed'].includes(state.phase)) return;

    update({ naverPreview: { loading: true } });

    try {
      const observation = await readNaverPreview(selected, state.tasks.filter((task): boolean => task.engine === 'naver').map((task) => task.target));
      if (scope === state.scope) update({ naverPreview: { loading: false, observation } });
    } catch (error: unknown) {
      if (scope === state.scope) update({ naverPreview: { loading: false, error: error instanceof Error ? error.message : '네이버 화면을 읽지 못했습니다.' } });
    }
  }

  // 미실행 작업을 취소 상태로 바꾸고 탭 선택 대기 중에도 즉시 종료합니다.
  function finishCancelled(): void {
    update({
      tasks: state.tasks.map((task): ClientInspectionTask => ['queued', 'running', 'gui_required'].includes(task.status) ? { ...task, status: 'cancelled', message: '사용자가 실행을 취소했습니다.' } : task),
      phase: 'cancelled', message: '조회 실행을 취소했습니다. 완료된 요청의 저장 결과는 유지됩니다.',
    });
  }

  // 엔진별 선택 결과는 개별 URL이 아니라 현재 전체 실행에 보관합니다.
  async function prepareEngineTab(engine: GuiEngine, candidateId?: string): Promise<void> {
    const controller = tabControllers[engine];
    const preparation = controller.prepare(state.scope, engine, candidateId);

    update({ tabs: { ...state.tabs, [engine]: controller.getState() } });
    await preparation;
    update({ tabs: { ...state.tabs, [engine]: controller.getState() } });
  }

  // 탭이 모두 준비되면 자동 진행하고 부족하면 명시적인 선택·건너뛰기를 기다립니다.
  async function finishTabPreparation(): Promise<void> {
    if (state.cancelRequested) { finishCancelled(); return; }

    if (Object.values(state.tabs).some((tab): boolean => !tab.selected)) {
      update({ phase: 'awaiting_tabs', message: '네이버·Bing 작업 탭을 준비하세요. 탭 준비를 건너뛰면 API 조회만 실행합니다.' });
      return;
    }

    await runTasks(true);
  }

  // 현재 실행에서 제공한 후보만 선택받고 이전 실행에서 늦게 온 폼은 무시합니다.
  async function chooseTab(scope: string, engine: GuiEngine, candidateId?: string): Promise<void> {
    if (state.phase !== 'awaiting_tabs' || scope !== state.scope || !state.tabs[engine]) return;
    update({ phase: 'preparing_tabs', message: '선택한 작업 탭을 다시 확인합니다.' });
    await prepareEngineTab(engine, candidateId);
    await finishTabPreparation();
  }

  // 사용자가 요청한 경우 준비되지 않은 GUI 탭은 남겨두고 API 작업만 진행합니다.
  async function continueApiOnly(scope: string): Promise<void> {
    if (state.phase !== 'awaiting_tabs' || scope !== state.scope) return;
    await runTasks(false);
  }

  // API 관측 이후 선택한 네이버 탭에서 사이트별 GUI 검사를 순차 실행합니다.
  async function runTasks(includeGui: boolean): Promise<void> {
    update({ phase: 'running', message: '확정된 대상의 API 조회를 순차 실행합니다.' });

    for (const task of state.tasks) {
      if (state.cancelRequested) break;

      const current = state.tasks.find((item): boolean => item.id === task.id);
      if (current?.status !== 'queued' || task.route !== 'api' || task.engine === 'naver') continue;

      updateTask(task.id, { status: 'running', message: 'API 조회 중' });

      try {
        const result = await api.inspect(task.target.id, task.engine);
        if (result.site_id !== task.target.id || result.engine !== task.engine) throw new ApiError(0, '검사 응답의 대상·엔진을 확인하지 못했습니다.', { code: 'INVALID_RESPONSE' });

        updateTask(task.id, {
          status: task.engine === 'bing' ? 'partial' : 'succeeded',
          message: task.engine === 'bing'
            ? 'API 관측을 저장했습니다. 크롤링 관측이며 GUI 색인 관측과 구분합니다.'
            : 'API 관측을 저장했습니다. 조회 성공은 색인 완료를 의미하지 않습니다.',
        });
      } catch (error: unknown) {
        const known = error instanceof ApiError;
        const uncertain = !known || error.status === 0 || (error.status >= 500 && !error.code.startsWith('ENGINE_') && !error.code.startsWith('GOOGLE_AUTH_'));

        updateTask(task.id, { status: 'failed', message: uncertain
          ? '응답을 확인하지 못했습니다. 저장 결과를 다시 읽어 확인하세요. 자동 재시도하지 않습니다.'
          : error.message });

        const stopEngine = known && ['authentication', 'rate_limit', 'timeout', 'network'].includes(error.kind);

        if (uncertain || stopEngine) update({ tasks: state.tasks.map((item): ClientInspectionTask => item.route === 'api' && item.status === 'queued' && (uncertain || item.engine === task.engine)
          ? { ...item, status: 'blocked', message: uncertain ? '서버 연결·응답 확인이 필요해 실행을 중단했습니다.' : '해당 엔진의 인증·조회 한도·연결 확인이 필요해 중단했습니다.' } : item) });
      }
    }

    const naverTasks = state.tasks.filter((task): boolean => task.engine === 'naver' && task.status === 'queued');
    const naverTab = state.tabs.naver?.selected;

    if (!state.cancelRequested && includeGui && naverTab && naverTasks.length) {
      try {
        await naverAutomation(naverTab, naverTasks.map((task) => task.target), {
          signal: naverAbort.signal,
          onStart: (target): void => {
            update({ message: `네이버: ${target.siteName} 사이트 선택·URL 검사 중` });
            updateTask(`${target.id}:naver`, { status: 'running', message: '네이버 사이트·검사 화면 확인 및 새 결과 대기' });
          },
          onResult: (target, observation): void => {
            updateTask(`${target.id}:naver`, { status: 'observed', guiObservation: observation,
              message: `${observation.indexStatus === 'indexed' ? '색인됨 확인' : '수집 확인 안 됨 · 검사 결과 없음(수집 데이터 또는 URL 확인 필요)'} · 새 GUI 응답 관측 · DB 미저장` });
          },
        });
      } catch (error: unknown) {
        if (!state.cancelRequested) update({ tasks: state.tasks.map((task): ClientInspectionTask => task.engine === 'naver' && ['queued', 'running'].includes(task.status)
          ? { ...task, status: task.status === 'running' ? 'failed' : 'blocked', message: error instanceof NaverAutomationError ? error.message : '네이버 탭 연결 또는 화면 전환에 실패해 중단했습니다.' } : task) });
      }
    } else if (!state.cancelRequested) {
      update({ tasks: state.tasks.map((task): ClientInspectionTask => task.engine === 'naver' && task.status === 'queued'
        ? { ...task, status: 'gui_required', message: 'GUI 탭 준비를 건너뛰어 네이버 조회는 실행하지 않았습니다.' } : task) });
    }

    const bingTasks = state.tasks.filter((task): boolean => task.engine === 'bing' && task.route === 'gui' && task.status === 'queued');
    const bingTab = state.tabs.bing?.selected;

    if (!state.cancelRequested && includeGui && bingTab && bingTasks.length) {
      try {
        await bingAutomation(bingTab, bingTasks.map((task) => task.target), {
          signal: bingAbort.signal,
          onStart: (target): void => {
            update({ message: `Bing: ${target.siteName} 사이트 선택·URL 검사 중` });
            updateTask(`${target.id}:bing-gui`, { status: 'running', message: 'Bing 사이트·검사 URL 확인 및 새 결과 대기' });
          },
          onStage: (target, stage): void => {
            const message = `Bing ${BING_STAGE_LABELS[stage]} 중`;
            update({ message: `${message} · ${target.siteName}` });
            updateTask(`${target.id}:bing-gui`, { message });
          },
          onResult: (target, observation): void => {
            const status = { indexed: '색인됨 확인', not_indexed: '색인되지 않음', unknown: '색인 상태 미확인' }[observation.indexStatus];
            updateTask(`${target.id}:bing-gui`, { status: 'observed', guiObservation: observation, message: `${status} · 새 GUI 응답 관측 · DB 미저장` });
          },
        });
      } catch (error: unknown) {
        if (!state.cancelRequested) update({ tasks: state.tasks.map((task): ClientInspectionTask => task.engine === 'bing' && task.route === 'gui' && ['queued', 'running'].includes(task.status)
          ? { ...task, status: task.status === 'running' ? 'failed' : 'blocked', message: error instanceof BingAutomationError ? error.message : 'Bing 탭 연결 또는 화면 전환에 실패해 중단했습니다.' } : task) });
      }
    } else if (!state.cancelRequested) {
      update({ tasks: state.tasks.map((task): ClientInspectionTask => task.engine === 'bing' && task.route === 'gui' && task.status === 'queued'
        ? { ...task, status: 'gui_required', message: 'GUI 탭 준비를 건너뛰어 Bing 색인 조회는 실행하지 않았습니다.' } : task) });
    }

    if (state.cancelRequested) { finishCancelled(); return; }

    update({ phase: 'finished', message: state.targetCount ? '전체 조회 처리가 끝났습니다. 네이버·Bing GUI 관측은 이 화면에서만 보관하며 실패·미지원 항목을 확인하세요.' : '조회할 활성 사이트·글이 없습니다.' });
  }

  // 시작 고객사·실행 ID를 고정하고 전체 대상 확정 후 엔진별 탭을 먼저 준비합니다.
  async function start(clientId: string, clientName: string): Promise<void> {
    if (!clientId || clientInspectionBusy(state)) return;

    tabControllers.naver.reset();
    tabControllers.bing.reset();
    naverAbort = new AbortController();
    bingAbort = new AbortController();
    update({ clientId, clientName, scope: `${++sequence}:${clientId}`, tabs: {}, naverPreview: undefined, phase: 'collecting', cancelRequested: false, targetCount: 0, tasks: [], message: '고객사의 활성 사이트·등록 글 목록을 수집하고 있습니다.' });

    try {
      const targets = await collectClientInspectionTargets(api, clientId, (): boolean => state.cancelRequested);
      if (state.cancelRequested) throw new InspectionCollectionCancelled();

      update({ phase: 'preparing_tabs', targetCount: targets.length, tasks: buildClientInspectionTasks(targets), message: '네이버·Bing 작업 탭을 준비합니다.' });

      for (const engine of ['naver', 'bing'] as const) {
        if (state.cancelRequested) break;
        if (state.tasks.some((task): boolean => task.engine === engine)) await prepareEngineTab(engine);
      }

      await finishTabPreparation();
    } catch (error: unknown) {
      update({ phase: state.cancelRequested || error instanceof InspectionCollectionCancelled ? 'cancelled' : 'failed', message: state.cancelRequested ? '대상 수집을 취소했습니다. 새 검사를 실행하지 않았습니다.' : '전체 대상 목록을 확정하지 못해 검사를 시작하지 않았습니다. 목록 연결과 고객사 소속을 확인하세요.' });
    }
  }

  return { getState: (): ClientInspectionRun => state, start, cancel, chooseTab, continueApiOnly, readNaver };
}
