import { clientInspectionBusy, createClientInspectionController } from '../inspection/client-controller.ts';
import { createPublicationController, publicationBusy } from '../publication/controller.ts';
import { applyAvailability } from './events.ts';
import { loadDashboard, loadInspectionTargets, loadStoredInspections } from './loaders.ts';
import { render } from './render.ts';
import { addActivity, api, demo, property, selectedClient, store } from './store.ts';
import type { GuiEngine } from '../inspection/client-controller.ts';
import type { PublicationInput } from '../publication/controller.ts';
import type { PageCreateResult, PageOutcome } from '../types.ts';

// 전체 색인 조회·글 발행 컨트롤러 인스턴스와, 그 결과를 화면 상태에 반영하는 함수들

export const clientInspections = createClientInspectionController(api, (): void => {
  if (store.state.view === 'inspect' || store.state.view === 'dashboard') render();
  else applyAvailability();
});

export const publications = createPublicationController({
  submit: (input, article): Promise<PageCreateResult> => input.demo
    ? Promise.resolve({
        page: { id: crypto.randomUUID(), name: article.name, url: article.url },
        submission: { status: 'skipped', error_code: 'DEMO_MODE', upstream_http_status: null },
      })
    : api.addPage(input.siteId, article, input.notify),
  blocked: (): boolean => store.pending || clientInspectionBusy(clientInspections.getState()) ||
    !!clientInspections.getState().naverPreview?.loading,
  report: recordPublicationOutcomes,
  changed: publicationChanged,
  listPages: api.listPages,
  notifyExisting: (input, page): Promise<PageCreateResult> => api.notifyPage(input.siteId, page),
});

// 발행 시작 사이트의 결과만 갱신하고 저장 확인·불명 URL의 자동 재전송을 막습니다.
function recordPublicationOutcomes(input: PublicationInput, results: readonly PageOutcome[]): void {
  const currentUrls = new Set(input.articles.map((article): string => article.url));
  const previous = store.outcomeHistory.get(input.siteId) ?? [];
  const combined = [...results, ...previous.filter((item): boolean => !currentUrls.has(item.article.url))];
  store.outcomeHistory = new Map([...store.outcomeHistory, [input.siteId, combined]]);
  const known = new Set(results.filter((item): boolean => ['saved', 'existing'].includes(item.saveStatus))
    .map((item): string => `${input.siteId}:${item.article.url}`));
  store.uncertainSaves = new Set([...store.uncertainSaves].filter((key): boolean => !known.has(key)).concat(
    results.filter((item): boolean => item.saveStatus === 'unknown')
      .map((item): string => `${input.siteId}:${item.article.url}`)));
  if (property().id === input.siteId) store.outcomes = combined;
}

// 발행 진행을 다시 그리되 다른 사이트 화면에는 시작 사이트의 완료 안내를 섞지 않습니다.
function publicationChanged(): void {
  const run = publications.getState();
  if (['finished', 'cancelled', 'failed'].includes(run.phase) &&
      store.completedPublicationScope !== run.scope) {
    store.completedPublicationScope = run.scope;
    addActivity(`글 ${run.outcomes.filter((item): boolean => item.saveStatus === 'saved').length}개 저장 결과 확인`);
    store.dashboardData = null;
    if (property().id === run.siteId) {
      store.state = { ...store.state, notice: run.message,
        noticeTone: run.phase === 'finished' ? 'info' : 'warning' };
      if (!demo) void loadInspectionTargets();
    }
  }
  render();
}

// 화면 필터와 독립적으로 시작 고객사의 전체 작업을 실행하고 저장 상태를 다시 읽습니다.
export async function refreshClientInspections(): Promise<void> {
  if (
    demo ||
    store.pending ||
    store.loading ||
    !store.state.clientId ||
    clientInspectionBusy(clientInspections.getState()) ||
    publicationBusy(publications.getState())
  )
    return;

  const clientId = store.state.clientId;
  const clientName = selectedClient()?.name ?? '';

  await clientInspections.start(clientId, clientName);
  await refreshFinishedClientInspection();
}

// 탭 선택 대기 중에는 저장 결과를 갱신하지 않고 실행 종료 후 현재 고객사만 다시 읽습니다.
async function refreshFinishedClientInspection(): Promise<void> {
  const run = clientInspections.getState();
  if (!clientInspectionBusy(run) && store.state.clientId === run.clientId) {
    await Promise.all([loadDashboard(), loadStoredInspections()]);
  }
}

// 현재 실행의 엔진별 탭 선택·목록 갱신을 전달하고 자동 재개된 실행 결과를 반영합니다.
export async function prepareClientWorkTab(
  scope: string,
  engine: GuiEngine,
  candidateId?: string,
): Promise<void> {
  await clientInspections.chooseTab(scope, engine, candidateId);
  await refreshFinishedClientInspection();
}

// 탭이 없는 환경에서도 사용자가 명시적으로 선택하면 기존 API 경로만 계속합니다.
export async function continueClientApiOnly(scope: string): Promise<void> {
  await clientInspections.continueApiOnly(scope);
  await refreshFinishedClientInspection();
}
