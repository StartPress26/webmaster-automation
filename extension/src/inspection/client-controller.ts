import { ApiError, isUncertainFailure } from '../errors.ts';
import {
  buildClientInspectionTasks,
  collectClientInspectionTargets,
  InspectionCollectionCancelled,
} from './client-plan.ts';
import type { ClientInspectionTarget, ClientInspectionTask } from './client-plan';
import type { ApiClient } from '../api';
import type { WorkTab } from '../tabs/client';
import { createWorkTabController } from '../tabs/controller.ts';
import type { WorkTabController, WorkTabState } from '../tabs/controller';
import { readNaverPreview } from '../engines/naver/preview.ts';
import type { NaverPreviewState } from '../engines/naver/preview';
import { runNaverAutomation } from '../engines/naver/automation.ts';
import { runBingAutomation } from '../engines/bing/automation.ts';
import { BingAutomationError, BING_STAGE_LABELS } from '../engines/bing/observation.ts';
import { NaverAutomationError } from '../engines/naver/observation.ts';
import { withNaverFocus } from '../focus/client.ts';
import { actualFailure } from '../focus/naver-runner.ts';
import type { FocusClientOptions } from '../focus/client.ts';
import { NaverFocusError } from '../focus/protocol.ts';
import { naverFocusErrorMessage } from '../focus/messages.ts';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 브라우저 GUI로 조회하는 엔진
export type GuiEngine = 'naver' | 'bing';

// GUI 관측을 DB에 저장하지 못했음을 나타내는 예외 (조회 실패와 구분)
class GuiInspectionSaveError extends Error {}

// 고객사 전체 조회 실행 1회의 상태
export interface ClientInspectionRun {
  readonly clientId: string;
  readonly clientName: string;
  readonly scope: string;
  readonly phase:
    | 'idle'
    | 'collecting'
    | 'preparing_tabs'
    | 'awaiting_tabs'
    | 'running'
    | 'finished'
    | 'cancelled'
    | 'failed';
  readonly tabs: Readonly<Partial<Record<GuiEngine, WorkTabState>>>;
  readonly cancelRequested: boolean;
  readonly targetCount: number;
  readonly tasks: readonly ClientInspectionTask[];
  readonly message: string;
  readonly naverPreview?: NaverPreviewState;
}

// 화면이 쓰는 컨트롤러 기능
export interface ClientInspectionController {
  readonly getState: () => ClientInspectionRun;
  readonly start: (clientId: string, clientName: string) => Promise<void>;
  readonly cancel: () => void;
  readonly chooseTab: (scope: string, engine: GuiEngine, candidateId?: string) => Promise<void>;
  readonly continueApiOnly: (scope: string) => Promise<void>;
  readonly readNaver: (scope: string) => Promise<void>;
}

type GuiObservation = NonNullable<ClientInspectionTask['guiObservation']>;
type ApiEngine = 'google' | 'bing';
type RunApi = Pick<ApiClient, 'listSites' | 'listPages' | 'inspect' | 'saveGuiInspection'>;

// 엔진별 GUI 조회 실행에 필요한 설정
interface GuiRunConfig {
  readonly engine: GuiEngine;
  readonly startMessage: string;
  readonly skippedMessage: string;
  readonly failureFallback: string;
  readonly isAutomationError: (error: unknown) => boolean;
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 실행이 멈춰 있어 네이버 화면 읽기나 사이트맵 제출 같은 부가 작업을 허용하는 단계
export const SETTLED_RUN_PHASES: readonly ClientInspectionRun['phase'][] = [
  'awaiting_tabs', 'finished', 'cancelled', 'failed',
];

// 다른 실행을 시작할 수 없는 "진행 중" 단계
const BUSY_PHASES: readonly ClientInspectionRun['phase'][] = ['collecting', 'preparing_tabs', 'awaiting_tabs', 'running'];
// 아직 끝나지 않은 작업 상태
const ACTIVE_STATUSES: readonly string[] = ['queued', 'running'];
// 취소 시 "취소"로 바꾸는 상태
const CANCELLABLE_STATUSES: readonly string[] = ['queued', 'running', 'gui_required'];
// 이 종류의 API 오류가 나면 같은 엔진의 남은 조회를 중단합니다.
const STOP_ENGINE_KINDS: readonly string[] = ['authentication', 'rate_limit', 'timeout', 'network'];
// GUI 조회를 하는 엔진 순서
const GUI_ENGINES: readonly GuiEngine[] = ['naver', 'bing'];

// 서버가 돌려준 색인 상태의 짧은 표시
const INDEX_STATUS_LABELS: Readonly<Record<string, string>> = {
  indexed: '색인됨',
  not_indexed: '미색인',
  unknown: '미확인',
  crawled: '크롤링됨',
  submitted: '제출됨',
  failed: '실패',
};

const EMPTY_RUN: ClientInspectionRun = {
  clientId: '',
  clientName: '',
  scope: '',
  tabs: {},
  phase: 'idle',
  cancelRequested: false,
  targetCount: 0,
  tasks: [],
  message: '',
};

const GUI_RUN_CONFIGS: Readonly<Record<GuiEngine, GuiRunConfig>> = {
  naver: {
    engine: 'naver',
    startMessage: '네이버 사이트·검사 화면 확인 및 새 결과 대기',
    skippedMessage: 'GUI 탭 준비를 건너뛰어 네이버 조회는 실행하지 않았습니다.',
    failureFallback: '네이버 탭 연결 또는 화면 전환에 실패해 중단했습니다.',
    isAutomationError: (error): boolean => error instanceof NaverAutomationError,
  },
  bing: {
    engine: 'bing',
    startMessage: 'Bing 사이트·검사 URL 확인 및 새 결과 대기',
    skippedMessage: 'GUI 탭 준비를 건너뛰어 Bing 색인 조회는 실행하지 않았습니다.',
    failureFallback: 'Bing 탭 연결 또는 화면 전환에 실패해 중단했습니다.',
    isAutomationError: (error): boolean => error instanceof BingAutomationError,
  },
};

// ─────────────────────────────────────────────────────────────
// 순수 함수
// ─────────────────────────────────────────────────────────────

// 수집·실행 중에는 다른 고객사의 중복 실행도 시작하지 않습니다.
export function clientInspectionBusy(run: ClientInspectionRun): boolean {
  return BUSY_PHASES.includes(run.phase);
}

// 엔진의 GUI 작업 ID
function guiTaskId(engine: GuiEngine, targetId: string): string {
  return engine === 'bing' ? `${targetId}:bing-gui` : `${targetId}:naver`;
}

// 이 엔진의 GUI 작업인지 확인합니다.
function isGuiTaskOf(task: ClientInspectionTask, engine: GuiEngine): boolean {
  return task.engine === engine && task.route === 'gui';
}

// 조건에 맞는 작업만 바꿔 새 목록을 만듭니다.
function patchTasks(
  tasks: readonly ClientInspectionTask[],
  matches: (task: ClientInspectionTask) => boolean,
  patch: (task: ClientInspectionTask) => Partial<ClientInspectionTask>,
): readonly ClientInspectionTask[] {
  return tasks.map((task): ClientInspectionTask => (matches(task) ? { ...task, ...patch(task) } : task));
}

// API 조회 실패가 "서버에 닿았는지 모르는" 종류인지 판단합니다. 엔진·인증 쪽 5xx 코드는 명확한 실패로 봅니다.
function isUncertainApiFailure(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  if (error.status === 0) return true;
  if (error.status < 500) return false;
  return !error.code.startsWith('ENGINE_') && !error.code.startsWith('GOOGLE_AUTH_');
}

// 이 오류가 나면 같은 엔진의 남은 API 조회를 멈춰야 하는지 판단합니다.
function shouldStopEngine(error: unknown): boolean {
  return error instanceof ApiError && STOP_ENGINE_KINDS.includes(error.kind);
}

// GUI 조회가 실패했을 때 작업에 남길 메시지. 저장 실패·자동화 예외는 그 메시지를, 그 밖에는 기본 문구를 씁니다.
function guiFailureMessage(error: unknown, config: GuiRunConfig): string {
  if (error instanceof NaverFocusError) {
    return naverFocusErrorMessage(error);
  }
  if (error instanceof GuiInspectionSaveError || config.isAutomationError(error)) {
    return (error as Error).message;
  }
  return config.failureFallback;
}

// 서버가 저장한 결과가 GUI 관측보다 더 최신인지 확인합니다.
function isNewerThanObservation(lastCheckedAt: string | null, observation: GuiObservation): boolean {
  return Date.parse(lastCheckedAt ?? '') > Date.parse(observation.readAt);
}

// ─────────────────────────────────────────────────────────────
// 컨트롤러
// ─────────────────────────────────────────────────────────────

// 전체 조회의 스냅샷과 취소를 관리하고 기존 단일 URL API를 순차 호출합니다.
export function createClientInspectionController(
  api: RunApi,
  changed: () => void = (): void => {},
  tabControllers: Readonly<Record<GuiEngine, WorkTabController>> = {
    naver: createWorkTabController(),
    bing: createWorkTabController(),
  },
  naverAutomation: typeof runNaverAutomation = runNaverAutomation,
  bingAutomation: typeof runBingAutomation = runBingAutomation,
  naverFocusConnection: Pick<FocusClientOptions, 'runtime' | 'timeoutMs'> = {},
): ClientInspectionController {
  let state: ClientInspectionRun = EMPTY_RUN;
  // 조회 결과와 별개로 연결 정리가 실패했을 때 완료 안내에 함께 남깁니다.
  let naverCleanupWarning: string | undefined;
  // 실행 ID(scope)를 만들 때 쓰는 일련번호
  let sequence = 0;
  // 엔진별 GUI 자동화 취소 신호
  let aborts: Readonly<Record<GuiEngine, AbortController>> = {
    naver: new AbortController(),
    bing: new AbortController(),
  };

  // ── 상태 변경 ──────────────────────────────────────────────

  // 실행 상태를 새 객체로 교체하고 화면에 변경을 알립니다.
  function update(patch: Partial<ClientInspectionRun>): void {
    state = { ...state, ...patch };
    changed();
  }

  // 특정 작업의 상태만 교체하며 다른 엔진의 성공·오류를 유지합니다.
  function updateTask(id: string, patch: Partial<ClientInspectionTask>): void {
    update({ tasks: patchTasks(state.tasks, (task): boolean => task.id === id, (): Partial<ClientInspectionTask> => patch) });
  }

  // 미실행 작업을 취소 상태로 바꾸고 탭 선택 대기 중에도 즉시 종료합니다.
  function finishCancelled(): void {
    let message = '조회 실행을 취소했습니다. 완료된 요청의 저장 결과는 유지됩니다.';

    if (naverCleanupWarning) {
      message = `${message} ${naverCleanupWarning}`;
    }

    update({
      tasks: patchTasks(
        state.tasks,
        (task): boolean => CANCELLABLE_STATUSES.includes(task.status),
        (): Partial<ClientInspectionTask> => ({ status: 'cancelled', message: '사용자가 실행을 취소했습니다.' }),
      ),
      phase: 'cancelled',
      message,
    });
  }

  // ── 취소·네이버 미리보기 ──────────────────────────────────

  // 진행 중인 서버 요청은 끝까지 확인하고 다음 요청부터 취소합니다.
  function cancel(): void {
    if (!clientInspectionBusy(state)) return;

    const waiting = state.phase === 'awaiting_tabs';
    update({
      cancelRequested: true,
      message: '현재 요청이 끝나면 중단합니다. 이미 저장된 결과는 유지됩니다.',
    });
    aborts.naver.abort();
    aborts.bing.abort();

    // 탭 선택을 기다리는 중이었다면 기다릴 요청이 없으니 바로 끝냅니다.
    if (waiting) finishCancelled();
  }

  // 현재 실행의 네이버 탭에서 보이는 관측만 읽고 작업 상태·DB는 변경하지 않습니다.
  async function readNaver(scope: string): Promise<void> {
    const selected = state.tabs.naver?.selected;
    if (scope !== state.scope) return;
    if (!selected) return;
    if (state.naverPreview?.loading) return;
    if (!SETTLED_RUN_PHASES.includes(state.phase)) return;

    update({ naverPreview: { loading: true } });

    const naverTargets = state.tasks
      .filter((task): boolean => task.engine === 'naver')
      .map((task): ClientInspectionTarget => task.target);

    try {
      const observation = await readNaverPreview(selected, naverTargets);
      if (scope === state.scope) update({ naverPreview: { loading: false, observation } });
    } catch (error: unknown) {
      if (scope !== state.scope) return;
      const message = error instanceof Error ? error.message : '네이버 화면을 읽지 못했습니다.';
      update({ naverPreview: { loading: false, error: message } });
    }
  }

  // ── 탭 준비 ───────────────────────────────────────────────

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
    if (state.cancelRequested) {
      finishCancelled();
      return;
    }

    const hasUnselectedTab = Object.values(state.tabs).some((tab): boolean => !tab.selected);
    if (hasUnselectedTab) {
      update({
        phase: 'awaiting_tabs',
        message: '네이버·Bing 작업 탭을 준비하세요. 탭 준비를 건너뛰면 API 조회만 실행합니다.',
      });
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

  // ── GUI 관측 저장 ─────────────────────────────────────────

  // 검증된 GUI 관측을 URL별로 저장하고 저장 오류를 GUI 조회 오류와 구분합니다.
  async function saveGuiObservation(
    engine: GuiEngine,
    target: ClientInspectionTarget,
    observation: GuiObservation,
  ): Promise<void> {
    const id = guiTaskId(engine, target.id);
    if (state.cancelRequested) {
      updateTask(id, { status: 'observed', guiObservation: observation, message: 'GUI 조회 성공 · 취소 요청으로 DB 저장은 실행하지 않았습니다.' });
      return;
    }

    updateTask(id, { status: 'saving', guiObservation: observation, message: 'GUI 조회 성공 · DB 저장 중' });
    try {
      const stored = await api.saveGuiInspection(target.id, {
        engine,
        site_url: observation.siteUrl,
        target_url: observation.targetUrl,
        index_status: observation.indexStatus,
        queried_at: observation.queriedAt,
        observed_at: observation.readAt,
      });
      const status = INDEX_STATUS_LABELS[stored.index_status];
      const message = isNewerThanObservation(stored.last_checked_at, observation)
        ? `더 최신의 서버 상태를 유지했습니다 · ${status}`
        : `GUI 관측 DB 저장 확인 · ${status}`;
      updateTask(id, { status: 'succeeded', message });
    } catch (error: unknown) {
      const uncertain = isUncertainFailure(error);
      // 불확실하지 않은 실패는 항상 ApiError이므로 서버가 준 메시지를 그대로 보여줍니다.
      const detail = error instanceof ApiError ? error.message : '';
      const message = uncertain
        ? 'GUI 조회 성공 · DB 저장 응답 미확인. 자동 재시도하지 않습니다.'
        : `GUI 조회 성공 · DB 저장 실패: ${detail}`;
      updateTask(id, { status: 'save_failed', message });
      throw new GuiInspectionSaveError('GUI 결과 저장을 확인하지 못해 해당 엔진의 후속 조회를 중단했습니다.');
    }
  }

  // ── GUI 조회 ──────────────────────────────────────────────

  // 엔진의 GUI 자동화를 실행합니다. 네이버와 Bing은 콜백 모양(Bing은 단계 알림 추가)만 다릅니다.
  function runAutomation(
    engine: GuiEngine,
    tab: WorkTab,
    targets: readonly ClientInspectionTarget[],
    startMessage: string,
  ): Promise<void> {
    const onStart = (target: ClientInspectionTarget): void => {
      updateTask(guiTaskId(engine, target.id), { status: 'running', message: startMessage });
    };
    const onResult = (target: ClientInspectionTarget, observation: GuiObservation): Promise<void> =>
      saveGuiObservation(engine, target, observation);

    if (engine === 'naver') {
      // 네이버만 기존 포커스 모듈로 감싸고 Bing의 병렬 실행은 그대로 유지합니다.
      return withNaverFocus(
        tab.tabId,
        aborts.naver.signal,
        async (focusSignal): Promise<void> => {
          try {
            await naverAutomation(tab, targets, {
              signal: focusSignal,
              onStart,
              onResult,
            });
          } catch (error: unknown) {
            // 연결이 끊겨 멈춘 것을 사용자 취소로 표시하지 않습니다.
            throw actualFailure(error, aborts.naver.signal, focusSignal);
          }
        },
        {
          ...naverFocusConnection,
          // 원래 조회 오류가 있어도 연결 정리 실패 안내를 따로 보존합니다.
          onCleanupError: (error): void => {
            naverCleanupWarning = naverFocusErrorMessage(error);
          },
        },
      );
    }
    return bingAutomation(tab, targets, {
      signal: aborts.bing.signal,
      onStart,
      onStage: (target, stage): void => {
        updateTask(guiTaskId('bing', target.id), { message: `Bing ${BING_STAGE_LABELS[stage]} 중` });
      },
      onResult,
    });
  }

  // GUI 조회가 실패하면 조회 중이던 작업은 실패, 대기 중이던 작업은 중단으로 표시합니다.
  function failGuiTasks(engine: GuiEngine, error: unknown): void {
    const message = guiFailureMessage(error, GUI_RUN_CONFIGS[engine]);
    update({
      tasks: patchTasks(
        state.tasks,
        (task): boolean => isGuiTaskOf(task, engine) && ACTIVE_STATUSES.includes(task.status),
        (task): Partial<ClientInspectionTask> => ({
          status: task.status === 'running' ? 'failed' : 'blocked',
          message,
        }),
      ),
    });
  }

  // 탭 준비를 건너뛴 엔진의 대기 작업을 "GUI 조회 미실행"으로 표시합니다.
  function skipGuiTasks(engine: GuiEngine): void {
    update({
      tasks: patchTasks(
        state.tasks,
        (task): boolean => isGuiTaskOf(task, engine) && task.status === 'queued',
        (): Partial<ClientInspectionTask> => ({ status: 'gui_required', message: GUI_RUN_CONFIGS[engine].skippedMessage }),
      ),
    });
  }

  // 엔진 탭의 사이트·URL은 순차 검사하며 오류는 그 엔진의 GUI 작업에만 반영합니다.
  async function runGui(engine: GuiEngine, includeGui: boolean): Promise<void> {
    const config = GUI_RUN_CONFIGS[engine];
    const queued = state.tasks.filter((task): boolean => isGuiTaskOf(task, engine) && task.status === 'queued');
    const tab = state.tabs[engine]?.selected;

    if (state.cancelRequested) return;

    if (!includeGui || !tab || !queued.length) {
      skipGuiTasks(engine);
      return;
    }

    try {
      const targets = queued.map((task): ClientInspectionTarget => task.target);
      await runAutomation(engine, tab, targets, config.startMessage);
    } catch (error: unknown) {
      if (!state.cancelRequested) failGuiTasks(engine, error);
    }
  }

  // ── API 조회 ──────────────────────────────────────────────

  // API 조회 실패 뒤 남은 대기 작업을 중단합니다. 불확실한 실패면 모든 엔진, 아니면 같은 엔진만.
  function blockQueuedApiTasks(uncertain: boolean, engine: ApiEngine): void {
    const message = uncertain
      ? '서버 연결·응답 확인이 필요해 실행을 중단했습니다.'
      : '해당 엔진의 인증·조회 한도·연결 확인이 필요해 중단했습니다.';
    update({
      tasks: patchTasks(
        state.tasks,
        (item): boolean => item.route === 'api' && item.status === 'queued' && (uncertain || item.engine === engine),
        (): Partial<ClientInspectionTask> => ({ status: 'blocked', message }),
      ),
    });
  }

  // API 작업 하나를 조회하고 결과를 작업에 반영합니다. 실패하면 남은 작업 중단 여부도 정합니다.
  async function runApiTask(task: ClientInspectionTask, engine: ApiEngine): Promise<void> {
    updateTask(task.id, { status: 'running', message: 'API 조회 중' });

    try {
      const result = await api.inspect(task.target.id, engine);
      if (result.site_id !== task.target.id || result.engine !== engine) {
        throw new ApiError(0, '검사 응답의 대상·엔진을 확인하지 못했습니다.', { code: 'INVALID_RESPONSE' });
      }

      // Bing API는 크롤링 상태만 알려주므로 "부분" 저장으로 표시합니다.
      if (engine === 'bing') {
        updateTask(task.id, { status: 'partial', message: 'API 크롤링 관측을 저장했습니다. 이후 더 최신의 GUI 관측으로 갱신될 수 있습니다.' });
      } else {
        updateTask(task.id, { status: 'succeeded', message: 'API 관측을 저장했습니다. 조회 성공은 색인 완료를 의미하지 않습니다.' });
      }
    } catch (error: unknown) {
      const uncertain = isUncertainApiFailure(error);
      const message = uncertain
        ? '응답을 확인하지 못했습니다. 저장 결과를 다시 읽어 확인하세요. 자동 재시도하지 않습니다.'
        : (error as ApiError).message;
      updateTask(task.id, { status: 'failed', message });

      if (uncertain || shouldStopEngine(error)) blockQueuedApiTasks(uncertain, engine);
    }
  }

  // API는 순차 조회하고 두 GUI는 동시에 시작해 모두 종료된 후 실행을 마칩니다.
  async function runTasks(includeGui: boolean): Promise<void> {
    update({ phase: 'running', message: '확정된 대상의 API 조회를 순차 실행합니다.' });

    // 1. Google·Bing API 조회를 하나씩 실행합니다. (앞선 실패로 blocked된 작업은 건너뜁니다.)
    for (const task of state.tasks) {
      if (state.cancelRequested) break;

      const current = state.tasks.find((item): boolean => item.id === task.id);
      if (current?.status !== 'queued' || task.route !== 'api' || task.engine === 'naver') continue;

      await runApiTask(task, task.engine);
    }

    // 2. 네이버·Bing GUI 조회를 병렬로 실행합니다.
    if (includeGui && !state.cancelRequested) {
      update({ message: '네이버·Bing 작업 탭에서 GUI 조회를 병렬 실행합니다.' });
    }
    await Promise.all(GUI_ENGINES.map((engine): Promise<void> => runGui(engine, includeGui)));

    if (state.cancelRequested) {
      finishCancelled();
      return;
    }

    let message = state.targetCount
      ? '전체 조회 처리가 끝났습니다. API·GUI 관측의 저장 결과와 실패·미지원 항목을 확인하세요.'
      : '조회할 활성 사이트·글이 없습니다.';

    if (naverCleanupWarning) {
      message = `${message} ${naverCleanupWarning}`;
    }

    update({ phase: 'finished', message });
  }

  // ── 시작 ──────────────────────────────────────────────────

  // 대상 수집이 실패·취소됐을 때의 단계와 안내
  function collectionFailure(error: unknown): Pick<ClientInspectionRun, 'phase' | 'message'> {
    const cancelled = state.cancelRequested || error instanceof InspectionCollectionCancelled;
    const message = state.cancelRequested
      ? '대상 수집을 취소했습니다. 새 검사를 실행하지 않았습니다.'
      : '전체 대상 목록을 확정하지 못해 검사를 시작하지 않았습니다. 목록 연결과 고객사 소속을 확인하세요.';
    return { phase: cancelled ? 'cancelled' : 'failed', message };
  }

  // 시작 고객사·실행 ID를 고정하고 전체 대상 확정 후 엔진별 탭을 먼저 준비합니다.
  async function start(clientId: string, clientName: string): Promise<void> {
    if (!clientId || clientInspectionBusy(state) || state.naverPreview?.loading) return;

    naverCleanupWarning = undefined;
    tabControllers.naver.reset();
    tabControllers.bing.reset();
    aborts = { naver: new AbortController(), bing: new AbortController() };

    sequence += 1;
    update({
      clientId,
      clientName,
      scope: `${sequence}:${clientId}`,
      tabs: {},
      naverPreview: undefined,
      phase: 'collecting',
      cancelRequested: false,
      targetCount: 0,
      tasks: [],
      message: '고객사의 활성 사이트·등록 글 목록을 수집하고 있습니다.',
    });

    try {
      // 1. 조회 대상을 모두 모읍니다.
      const targets = await collectClientInspectionTargets(api, clientId, (): boolean => state.cancelRequested);
      if (state.cancelRequested) throw new InspectionCollectionCancelled();

      // 2. 대상마다 엔진별 작업을 만듭니다.
      update({
        phase: 'preparing_tabs',
        targetCount: targets.length,
        tasks: buildClientInspectionTasks(targets),
        message: '네이버·Bing 작업 탭을 준비합니다.',
      });

      // 3. GUI 조회할 작업이 있는 엔진의 작업 탭을 준비합니다.
      for (const engine of GUI_ENGINES) {
        if (state.cancelRequested) break;
        if (state.tasks.some((task): boolean => task.engine === engine)) {
          await prepareEngineTab(engine);
        }
      }

      await finishTabPreparation();
    } catch (error: unknown) {
      update(collectionFailure(error));
    }
  }

  // 현재 상태를 돌려줍니다.
  function getState(): ClientInspectionRun {
    return state;
  }

  return { getState, start, cancel, chooseTab, continueApiOnly, readNaver };
}
