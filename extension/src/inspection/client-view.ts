import { clientInspectionBusy, SETTLED_RUN_PHASES } from './client-controller.ts';
import type { ClientInspectionRun } from './client-controller';
import type { ClientInspectionTask } from './client-plan';
import { renderWorkTabPanel } from '../tabs/view.ts';
import { renderNaverPreview } from '../engines/naver/view.ts';
import { escapeHtml } from '../html.ts';
import { ENGINE_NAMES, engineSymbol } from '../engines/labels.ts';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 작업 상태별 표시 문구
const STATUS_NAMES: Readonly<Record<ClientInspectionTask['status'], string>> = {
  queued: '조회 대기',
  running: '조회 중',
  saving: 'GUI 관측 저장 중',
  save_failed: 'GUI 저장 확인 실패',
  succeeded: '관측 저장',
  partial: '크롤링 관측 저장',
  observed: 'GUI 관측 · DB 미저장',
  gui_required: 'GUI 조회 미실행',
  skipped: '지원 범위 제외',
  failed: '조회 실패',
  blocked: '실행 중단',
  cancelled: '취소',
};

// 실행 단계별 표시 문구
const PHASE_NAMES: Readonly<Record<ClientInspectionRun['phase'], string>> = {
  idle: '실행 전',
  collecting: '대상 수집 중',
  preparing_tabs: '탭 확인 중',
  awaiting_tabs: '탭 선택 필요',
  running: '조회 진행 중',
  finished: '처리 종료',
  cancelled: '취소됨',
  failed: '실행 실패',
};

// 아직 끝나지 않은 API 작업 상태
const ACTIVE_STATUSES: readonly string[] = ['queued', 'running'];
// 실패로 집계하는 상태
const FAILED_STATUSES: readonly string[] = ['failed', 'save_failed'];
// GUI 작업이 이 상태 중 하나면 결과 표를 처음부터 펼쳐 보여줍니다.
const OPEN_RESULTS_STATUSES: readonly string[] = ['succeeded', 'saving', 'save_failed', 'observed', 'failed', 'blocked'];
// GUI 작업 탭을 보여줄 엔진 순서
const GUI_ENGINES = ['naver', 'bing'] as const;

// ─────────────────────────────────────────────────────────────
// 집계
// ─────────────────────────────────────────────────────────────

// 진행 지표에 쓰는 숫자들
interface RunMetrics {
  readonly apiTotal: number;
  readonly apiDone: number;
  readonly saved: number;
  readonly failed: number;
  readonly blocked: number;
  readonly gui: number;
  readonly guiSaved: number;
  readonly naverTasks: readonly ClientInspectionTask[];
  readonly naverDone: number;
  readonly bingTasks: readonly ClientInspectionTask[];
  readonly bingDone: number;
}

// 조건에 맞는 작업 수를 셉니다.
function count(tasks: readonly ClientInspectionTask[], predicate: (task: ClientInspectionTask) => boolean): number {
  return tasks.filter(predicate).length;
}

// 작업 목록에서 진행 지표를 계산합니다.
function computeMetrics(tasks: readonly ClientInspectionTask[]): RunMetrics {
  const apiTasks = tasks.filter((task): boolean => task.route === 'api' && task.status !== 'skipped');
  const naverTasks = tasks.filter((task): boolean => task.engine === 'naver');
  const bingTasks = tasks.filter((task): boolean => task.engine === 'bing' && task.route === 'gui');
  const hasObservation = (task: ClientInspectionTask): boolean => Boolean(task.guiObservation);

  return {
    apiTotal: apiTasks.length,
    apiDone: count(apiTasks, (task): boolean => !ACTIVE_STATUSES.includes(task.status)),
    saved: count(tasks, (task): boolean => task.status === 'succeeded' || task.status === 'partial'),
    failed: count(tasks, (task): boolean => FAILED_STATUSES.includes(task.status)),
    blocked: count(tasks, (task): boolean => task.status === 'blocked'),
    gui: count(tasks, (task): boolean => task.route === 'gui' && hasObservation(task)),
    guiSaved: count(tasks, (task): boolean => task.route === 'gui' && task.status === 'succeeded'),
    naverTasks,
    naverDone: count(naverTasks, hasObservation),
    bingTasks,
    bingDone: count(bingTasks, hasObservation),
  };
}

// ─────────────────────────────────────────────────────────────
// 조각 렌더링
// ─────────────────────────────────────────────────────────────

// 엔진별로 검증된 관측만 표시하고 Bing의 크롤링과 색인 상태를 구분합니다.
function observationDetails(task: ClientInspectionTask): string {
  const result = task.guiObservation;
  if (!result) return '';

  let extra: readonly string[] = [];
  if (result.kind === 'verified_bing_gui') {
    extra = [
      result.reason,
      result.canonicalUrl ? `대표 URL: ${result.canonicalUrl}` : null,
      result.crawlStatus === 'succeeded' ? '페이지 가져오기: 성공' : null,
      result.lastCrawledText ? `마지막 크롤링 시도: ${result.lastCrawledText}` : null,
    ].filter((value): value is string => Boolean(value));
  }

  return [result.message, ...extra]
    .map((value): string => `<br><span class="small">${escapeHtml(value)}</span>`)
    .join('');
}

// 작업 결과는 저장 성공과 실제 색인 확인 여부가 구분되도록 표시합니다.
function taskRow(task: ClientInspectionTask): string {
  const kind = task.target.id === task.target.siteId ? '메인 사이트' : '개별 글';
  const routeSuffix = task.engine === 'bing' ? ` ${task.route.toUpperCase()}` : '';
  return `<tr><td><span class="inspection-result-site">${escapeHtml(task.target.siteName)} · ${kind}</span><span class="inspection-result-url">${escapeHtml(task.target.url)}</span></td>
    <td><span class="inspection-engine-name"><span class="engine-symbol ${task.engine}" aria-hidden="true">${engineSymbol(task.engine)}</span>${ENGINE_NAMES[task.engine]}${routeSuffix}</span></td>
    <td><span class="inspection-result-status ${task.status}">${STATUS_NAMES[task.status]}</span></td><td class="inspection-result-message">${escapeHtml(task.message)}${observationDetails(task)}</td></tr>`;
}

// 범위와 제한사항은 실행 영역을 방해하지 않는 접이식 안내로 제공합니다.
function inspectionHelp(): string {
  return `<details class="inspection-help"><summary>조회 범위 및 주의사항</summary><div>
    <p>선택 고객사의 활성 메인 사이트와 등록된 활성 글을 모두 조회합니다. 아래 블로그·엔진 필터는 저장 결과를 보는 용도입니다.</p>
    <p>Google은 색인 상태, Bing은 크롤링 상태를 API로 조회합니다. 네이버·Bing은 사이트 선택과 URL별 GUI 색인 조회를 수행하고 결과를 URL별로 DB에 저장합니다. GUI 저장 실패는 조회 실패와 구분하며, 해당 엔진의 후속 조회를 중단합니다. 탭 준비나 저장 성공이 색인 완료를 뜻하지 않습니다.</p>
    <p>취소하면 현재 요청의 결과를 확인한 뒤 중단합니다. 실행 목록은 이 관리 탭에서만 유지되며, 탭을 닫거나 새로고침하면 자동 재개하지 않습니다.</p>
  </div></details>`;
}

// 헤더의 취소·실행 버튼
function actionButtons(run: ClientInspectionRun, busy: boolean, clientId: string, demo: boolean): string {
  let cancelButton = '';
  if (busy) {
    const disabled = run.cancelRequested ? 'disabled' : '';
    const label = run.cancelRequested ? '취소 대기 중' : '실행 취소';
    cancelButton = `<button class="inspection-text-button" id="cancel-client-inspection" ${disabled}>${label}</button>`;
  }
  const refreshDisabled = busy || !clientId || demo ? 'disabled' : '';
  const refreshLabel = busy ? '전체 조회 진행 중' : '고객사 전체 색인 조회';
  return `${cancelButton}
      <button class="button primary" id="refresh-index" ${refreshDisabled}>${refreshLabel}</button>`;
}

// 다른 고객사의 실행이 진행 중일 때의 안내
function otherClientNotice(run: ClientInspectionRun, busy: boolean, visible: boolean): string {
  if (!busy || visible) return '';
  const hint = run.phase === 'awaiting_tabs'
    ? ' 해당 고객사에서 작업 탭을 선택하세요.'
    : ' 현재 고객사의 데이터와 분리해 처리합니다.';
  return `<div class="inspection-run-notice" role="status"><span class="inspection-state-dot"></span><p>${escapeHtml(run.clientName)} 작업이 진행 중입니다.${hint}</p></div>`;
}

// 실행 중·종료 후의 진행 지표
function progressPanel(run: ClientInspectionRun, metrics: RunMetrics): string {
  const { apiTotal, apiDone } = metrics;
  const bar = apiTotal
    ? `<progress class="inspection-progress-bar" value="${apiDone}" max="${apiTotal}" aria-label="API 요청 처리 진행률">${apiDone}/${apiTotal}</progress>`
    : '';
  return `<div class="inspection-progress" id="client-inspection-progress" role="status">
      <div class="inspection-progress-heading"><span class="inspection-phase ${run.phase}"><span class="inspection-state-dot"></span>${PHASE_NAMES[run.phase]}</span><p>${escapeHtml(run.message)}</p></div>
      <dl class="inspection-metrics">
        <div aria-label="대상 URL ${run.targetCount}개"><dt>조회 대상</dt><dd>${run.targetCount}<span>개 URL</span></dd></div>
        <div aria-label="API 처리 ${apiDone}/${apiTotal}건"><dt>API 처리</dt><dd>${apiDone}<span>/ ${apiTotal}건</span></dd></div>
        <div aria-label="관측 저장 ${metrics.saved}건"><dt>관측 저장</dt><dd>${metrics.saved}<span>건</span></dd></div>
        <div aria-label="GUI 관측 ${metrics.gui}건"><dt>GUI 관측</dt><dd>${metrics.gui}<span>건</span></dd></div>
      </dl>
      <div class="inspection-progress-footer"><span>처리 현황이며, 색인 완료율이 아닙니다.</span><span>실패 ${metrics.failed}건 <span aria-hidden="true">·</span> 중단 ${metrics.blocked}건 <span aria-hidden="true">·</span> 엔진 작업 ${run.tasks.length}건</span><span>네이버 GUI 관측 ${metrics.naverDone}/${metrics.naverTasks.length}건 · Bing GUI 관측 ${metrics.bingDone}/${metrics.bingTasks.length}건 · GUI 저장 확인 ${metrics.guiSaved}건</span></div>
      ${bar}
    </div>`;
}

// 실행 전에 보여주는 검색엔진별 조회 범위 안내
function coveragePanel(demo: boolean): string {
  const demoNote = demo ? '<span class="inspection-demo-note">예시 모드 · 실행하지 않음</span>' : '';
  return `<div class="inspection-coverage" aria-label="검색엔진별 조회 범위"><span class="inspection-engine-name"><span class="engine-symbol google" aria-hidden="true">G</span>Google <span>색인 상태</span></span><span class="inspection-engine-name"><span class="engine-symbol naver" aria-hidden="true">N</span>네이버 <span>GUI 색인 조회</span></span><span class="inspection-engine-name"><span class="engine-symbol bing" aria-hidden="true">b</span>Bing <span>GUI 색인 조회 · API 크롤링</span></span>${demoNote}</div>`;
}

// 네이버·Bing 작업 탭 패널을 이어 붙입니다.
function tabPanels(run: ClientInspectionRun): string {
  return GUI_ENGINES
    .map((engine): string => {
      const tab = run.tabs[engine];
      return tab ? renderWorkTabPanel(tab, run.scope, ENGINE_NAMES[engine]) : '';
    })
    .join('');
}

// 작업 탭 섹션. 탭을 고르는 중이거나 네이버 미리보기가 있으면 펼쳐 보여줍니다.
function tabSection(run: ClientInspectionRun, panels: string): string {
  if (!panels) return '';

  const selecting = run.phase === 'awaiting_tabs' || run.phase === 'preparing_tabs';
  const awaiting = run.phase === 'awaiting_tabs';
  const expanded = selecting || Boolean(run.naverPreview) ? 'open' : '';
  const caption = selecting ? '엔진별로 사용할 탭을 확인하세요' : '선택한 탭 확인';
  const naverPreview = run.tabs.naver?.selected
    ? renderNaverPreview(run.scope, run.naverPreview, SETTLED_RUN_PHASES.includes(run.phase))
    : '';
  const footer = awaiting
    ? `<div class="inspection-tab-footer"><p>탭이 하나면 자동 선택합니다. 네이버·Bing은 선택한 탭에서 사이트와 URL을 순차 조회합니다.</p><button class="inspection-text-button" id="continue-api-only" data-scope="${escapeHtml(run.scope)}">탭 없이 API 조회만 계속</button></div>`
    : '';

  return `<details class="inspection-tab-section" ${expanded}><summary><span>작업 탭</span><span class="inspection-tab-caption">${caption}</span></summary>
      <fieldset class="work-tab-preparation" ${awaiting ? '' : 'disabled'}><legend class="visually-hidden">엔진별 작업 탭 준비</legend>${panels}</fieldset>
      ${naverPreview}
      ${footer}
    </details>`;
}

// 사이트·URL·엔진별 작업 결과 표. GUI 작업에 결과가 나오기 시작하면 펼쳐 보여줍니다.
function resultsSection(run: ClientInspectionRun, metrics: RunMetrics): string {
  if (!run.tasks.length) return '';

  const guiTasks = [...metrics.naverTasks, ...metrics.bingTasks];
  const open = guiTasks.some((task): boolean => OPEN_RESULTS_STATUSES.includes(task.status)) ? 'open' : '';
  return `<details class="inspection-results" ${open}><summary><span>사이트·URL·엔진별 작업 결과</span><span>${run.tasks.length}건</span></summary><div class="table-scroll"><table class="inspection-results-table"><thead><tr><th scope="col">사이트 / URL</th><th scope="col">검색엔진</th><th scope="col">처리 상태</th><th scope="col">안내</th></tr></thead><tbody>${run.tasks.map(taskRow).join('')}</tbody></table></div></details>`;
}

// ─────────────────────────────────────────────────────────────
// 전체 콘솔
// ─────────────────────────────────────────────────────────────

// 고객사 전체 실행을 헤더·진행 지표·탭 준비·결과 표의 동일한 여백 체계로 표시합니다.
export function renderClientInspection(
  run: ClientInspectionRun,
  clientId: string,
  clientName: string,
  demo: boolean,
): string {
  const busy = clientInspectionBusy(run);
  // 이 고객사의 실행이 시작된 뒤에만 진행 상황·탭·결과를 보여줍니다.
  const visible = run.clientId === clientId && run.phase !== 'idle';
  const metrics = computeMetrics(visible ? run.tasks : []);
  const activePhase = visible ? run.phase : 'idle';
  const heading = `${escapeHtml(clientName || '고객사를 선택하세요')}${clientId ? '의 모든 활성 사이트와 등록 글을 확인합니다.' : ''}`;

  return `<section class="report inspection-console" id="client-inspection" aria-labelledby="client-inspection-title" data-phase="${activePhase}">
    <header class="inspection-console-header"><div class="inspection-console-heading">
      <span class="inspection-console-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/></svg></span>
      <div><h2 id="client-inspection-title">전체 색인 조회</h2><p>${heading}</p></div>
    </div><div class="inspection-console-actions">
      ${actionButtons(run, busy, clientId, demo)}
    </div></header>
    ${otherClientNotice(run, busy, visible)}
    ${visible ? progressPanel(run, metrics) : coveragePanel(demo)}
    ${tabSection(run, visible ? tabPanels(run) : '')}
    ${visible ? resultsSection(run, metrics) : ''}
    ${inspectionHelp()}
  </section>`;
}
