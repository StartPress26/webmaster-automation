import { clientInspectionBusy, createClientInspectionController } from '../inspection/client-controller.ts';
import { createPublicationController, publicationBusy } from '../publication/controller.ts';
import { createFocusedNaverRunner } from '../focus/naver-runner.ts';
import { naverFocusErrorMessage } from '../focus/messages.ts';
import type { NaverFocusError } from '../focus/protocol.ts';
import { applyAvailability } from './events.ts';
import { loadDashboard, loadInspectionTargets, loadStoredInspections } from './loaders.ts';
import { render } from './render.ts';
import { addActivity, api, demo, property, selectedClient, store } from './store.ts';
import type { GuiEngine } from '../inspection/client-controller.ts';
import type { PublicationInput, PublicationState } from '../publication/controller.ts';
import type { Article, PageCreateResult, PageOutcome } from '../types.ts';

// 전체 색인 조회·글 발행 컨트롤러 인스턴스와, 그 결과를 화면 상태에 반영하는 함수들

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 발행 작업이 끝난 것으로 보는 단계
const FINISHED_PHASES: readonly PublicationState['phase'][] = ['finished', 'cancelled', 'failed'];
// 저장이 확인된 것으로 보는 글 상태
const CONFIRMED_SAVE_STATUSES: readonly PageOutcome['saveStatus'][] = ['saved', 'existing'];

// 작업 오류와 연결 해제 오류가 함께 나면 두 안내를 모두 보존합니다.
let focusCleanupWarning: string | undefined;

// 원래 발행 오류를 바꾸지 않고 연결 해제 실패 안내를 완료 시점까지 보관합니다.
function rememberFocusCleanupError(error: NaverFocusError): void {
  focusCleanupWarning = naverFocusErrorMessage(error);
}

// ─────────────────────────────────────────────────────────────
// 발행 결과 반영 (순수 계산)
// ─────────────────────────────────────────────────────────────

// "사이트ID:URL" 형태의 키. 저장 여부가 불명확한 글을 기억하는 데 씁니다.
function saveKey(siteId: string, url: string): string {
  return `${siteId}:${url}`;
}

// 이번 결과를 앞에 두고, 이전 결과 중 이번에 다시 다룬 URL은 뺀 목록을 만듭니다.
function mergeOutcomes(
  results: readonly PageOutcome[],
  previous: readonly PageOutcome[],
  currentUrls: ReadonlySet<string>,
): readonly PageOutcome[] {
  const kept = previous.filter((item): boolean => !currentUrls.has(item.article.url));
  return [...results, ...kept];
}

// 저장이 확인된 글은 불명확 목록에서 빼고, 이번에 불명확해진 글은 더합니다.
function nextUncertainSaves(
  current: ReadonlySet<string>,
  results: readonly PageOutcome[],
  siteId: string,
): ReadonlySet<string> {
  const confirmed = new Set(
    results
      .filter((item): boolean => CONFIRMED_SAVE_STATUSES.includes(item.saveStatus))
      .map((item): string => saveKey(siteId, item.article.url)),
  );
  const stillUncertain = [...current].filter((key): boolean => !confirmed.has(key));
  const newlyUncertain = results
    .filter((item): boolean => item.saveStatus === 'unknown')
    .map((item): string => saveKey(siteId, item.article.url));
  return new Set([...stillUncertain, ...newlyUncertain]);
}

// 데모 모드에서 실제 저장 대신 돌려주는 가짜 저장 결과
function demoSubmitResult(article: Article): PageCreateResult {
  return {
    page: { id: crypto.randomUUID(), name: article.name, url: article.url },
    submission: { status: 'skipped', error_code: 'DEMO_MODE', upstream_http_status: null },
  };
}

// ─────────────────────────────────────────────────────────────
// 컨트롤러 인스턴스
// ─────────────────────────────────────────────────────────────

// 고객사 전체 색인 조회. 상태가 바뀌면 관련 화면이면 다시 그리고, 아니면 버튼 활성 상태만 맞춥니다.
export const clientInspections = createClientInspectionController(api, (): void => {
  if (store.state.view === 'inspect' || store.state.view === 'dashboard') render();
  else applyAvailability();
});

// 다른 작업이 진행 중이라 발행을 시작할 수 없는지 확인합니다.
function isPublicationBlocked(): boolean {
  const run = clientInspections.getState();
  return store.pending || clientInspectionBusy(run) || Boolean(run.naverPreview?.loading);
}

// 새 글 발행(저장 + IndexNow + 네이버 GUI 수집 요청)
export const publications = createPublicationController({
  runner: createFocusedNaverRunner(rememberFocusCleanupError),
  submit: (input, article): Promise<PageCreateResult> =>
    input.demo ? Promise.resolve(demoSubmitResult(article)) : api.addPage(input.siteId, article, input.notify),
  blocked: isPublicationBlocked,
  report: recordPublicationOutcomes,
  changed: publicationChanged,
  listPages: api.listPages,
  notifyExisting: (input, page): Promise<PageCreateResult> => api.notifyPage(input.siteId, page),
});

// ─────────────────────────────────────────────────────────────
// 발행 콜백
// ─────────────────────────────────────────────────────────────

// 발행 시작 사이트의 결과만 갱신하고 저장 확인·불명 URL의 자동 재전송을 막습니다.
function recordPublicationOutcomes(input: PublicationInput, results: readonly PageOutcome[]): void {
  const currentUrls = new Set(input.articles.map((article): string => article.url));
  const previous = store.outcomeHistory.get(input.siteId) ?? [];
  const combined = mergeOutcomes(results, previous, currentUrls);

  store.outcomeHistory = new Map([...store.outcomeHistory, [input.siteId, combined]]);
  store.uncertainSaves = nextUncertainSaves(store.uncertainSaves, results, input.siteId);
  if (property().id === input.siteId) store.outcomes = combined;
}

// 발행이 끝났을 때 한 번만 이력·안내를 남기고, 저장된 글 목록을 다시 읽습니다.
function recordPublicationFinished(run: PublicationState): void {
  const cleanupWarning = focusCleanupWarning;
  focusCleanupWarning = undefined;

  store.completedPublicationScope = run.scope;
  const savedCount = run.outcomes.filter((item): boolean => item.saveStatus === 'saved').length;
  addActivity(`글 ${savedCount}개 저장 결과 확인`);
  if (cleanupWarning) {
    addActivity(cleanupWarning);
  }
  store.dashboardData = null;

  // 다른 사이트 화면에는 시작 사이트의 완료 안내를 섞지 않습니다.
  if (property().id !== run.siteId) return;
  const completedWithoutWarning = run.phase === 'finished' && !cleanupWarning;
  let noticeTone: 'info' | 'warning' = 'warning';
  let notice = run.message;

  if (completedWithoutWarning) {
    noticeTone = 'info';
  }

  if (cleanupWarning) {
    notice = `${run.message} ${cleanupWarning}`;
  }

  store.state = { ...store.state, notice, noticeTone };
  if (!demo) void loadInspectionTargets();
}

// 발행 상태가 바뀔 때마다 화면을 다시 그립니다. 끝났으면 완료 처리를 먼저 합니다.
function publicationChanged(): void {
  const run = publications.getState();
  const justFinished = FINISHED_PHASES.includes(run.phase) && store.completedPublicationScope !== run.scope;
  if (justFinished) recordPublicationFinished(run);
  render();
}

// ─────────────────────────────────────────────────────────────
// 전체 색인 조회 실행
// ─────────────────────────────────────────────────────────────

// 전체 조회를 시작할 수 없는 상태인지 확인합니다. (데모, 처리 중, 로딩 중, 고객사 없음, 다른 작업 진행 중)
function cannotStartInspection(): boolean {
  if (demo || store.pending || store.loading || !store.state.clientId) return true;
  return clientInspectionBusy(clientInspections.getState()) || publicationBusy(publications.getState());
}

// 탭 선택 대기 중에는 저장 결과를 갱신하지 않고 실행 종료 후 현재 고객사만 다시 읽습니다.
async function refreshFinishedClientInspection(): Promise<void> {
  const run = clientInspections.getState();
  if (!clientInspectionBusy(run) && store.state.clientId === run.clientId) {
    await Promise.all([loadDashboard(), loadStoredInspections()]);
  }
}

// 화면 필터와 독립적으로 시작 고객사의 전체 작업을 실행하고 저장 상태를 다시 읽습니다.
export async function refreshClientInspections(): Promise<void> {
  if (cannotStartInspection()) return;

  const clientId = store.state.clientId;
  const clientName = selectedClient()?.name ?? '';
  await clientInspections.start(clientId, clientName);
  await refreshFinishedClientInspection();
}

// 현재 실행의 엔진별 탭 선택·목록 갱신을 전달하고 자동 재개된 실행 결과를 반영합니다.
export async function prepareClientWorkTab(scope: string, engine: GuiEngine, candidateId?: string): Promise<void> {
  await clientInspections.chooseTab(scope, engine, candidateId);
  await refreshFinishedClientInspection();
}

// 탭이 없는 환경에서도 사용자가 명시적으로 선택하면 기존 API 경로만 계속합니다.
export async function continueClientApiOnly(scope: string): Promise<void> {
  await clientInspections.continueApiOnly(scope);
  await refreshFinishedClientInspection();
}
