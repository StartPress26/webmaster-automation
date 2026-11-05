import './styles.css';
import { initialClients, initialInspections, initialProperties } from './mocks/data';
import { validateIndexNowSettings } from './indexnow';
import { createApi } from './api';
import { submitPageBatch } from './batch';
import { inspectionStatusNames, inspectionTime, inspectionUnavailable } from './inspection';
import { ApiError, asAppError, presentError, uncertainWrite } from './errors';
import { captureFormDrafts, restoreFormDrafts } from './forms';
import { clientProperties, clientSelection, dashboardContent, demoDashboard } from './dashboard';
import type { ClientDashboard } from './types';
import type { FormDrafts } from './forms';
import type { Activity, AppState, Client, Engine, IndexStatus, Inspection, NotifyRoute, Property, View, SiteRead, PageOutcome, PageCreateResult, InspectionTarget, InspectionRead } from './types';

type Icon = 'dashboard' | 'menu' | 'search' | 'chevron' | 'globe' | 'plus' | 'send' | 'inspect' | 'users' | 'refresh' | 'external' | 'check' | 'clock' | 'info' | 'close' | 'arrow' | 'link' | 'mail';
const iconPaths: Record<Icon, string> = {
  dashboard: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="18" width="7" height="3" rx="1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  inspect: '<rect x="4" y="3" width="13" height="17" rx="2"/><path d="M8 7h5M8 11h3"/><circle cx="16" cy="16" r="4"/><path d="m19 19 3 3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  external: '<path d="M14 3h7v7m0-7L11 13M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  link: '<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 4 1-1a4 4 0 0 0 6-6l-1-1a4 4 0 0 0-6 0l-2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
};
const viewTitles: Record<View, string> = { dashboard: '대시보드', inspect: '색인 상태 확인', register: '사이트 등록', notify: '새 글 발행 알림', clients: '고객사 관리' };
const statusNames: Record<IndexStatus, string> = { indexed: '색인됨', waiting: '수집 대기', crawled: '크롤링됨', not_indexed: '색인되지 않음' };
const engineNames: Record<Engine, string> = { google: 'Google', naver: '네이버', bing: 'Bing' };
const demo = new URLSearchParams(window.location.search).get('mode') === 'demo';
const api = createApi();
const emptyProperty: Property = { id: '', clientId: '', name: '사이트를 선택하세요', origin: '', siteUrl: '', owned: false, active: false, indexNow: null };
let clients: readonly Client[] = demo ? initialClients : [];
let properties: readonly Property[] = demo ? initialProperties : [];
let inspections: readonly Inspection[] = initialInspections;
let activities: readonly Activity[] = [];
let state: AppState = { view: 'dashboard', clientId: demo ? 'otter' : '', propertyId: demo ? 'otter-site' : '', engine: 'google', filter: 'all', route: 'direct', selectedId: null, mobileNav: false, notice: '' };
let dashboardData: ClientDashboard | null = null;
let dashboardLoading = false;
let dashboardError: ApiError | null = null;
let dashboardVersion = 0;
let loading = !demo;
let loadError: ApiError | null = null;
let settingsLoading = false;
let settingsError: ApiError | null = null;
let settingsRequest = 0;
let pending = false;
let outcomes: readonly PageOutcome[] = [];
let outcomeHistory: ReadonlyMap<string, readonly PageOutcome[]> = new Map();
let outcomesError: ApiError | null = null;
let attempted: ReadonlySet<string> = new Set();
let inspectionTargets: readonly InspectionTarget[] = [];
let inspectionTargetId = '';
let storedInspections: readonly InspectionRead[] = [];
let inspectionLoading = false;
let inspectionError: ApiError | null = null;
let targetsLoading = false;
let targetsError: ApiError | null = null;
let targetsVersion = 0;
let observationVersion = 0;
let notificationDraft = '';
let notificationTitles = '';
let notifyEnabled = true;
let requestText = '';
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let formDrafts: FormDrafts = new Map();
let renderedScope = '';
let sitemapOpen = false;
let sitemapFeedback: { readonly siteId: string; readonly engine: Engine; readonly message: string; readonly failed: boolean } | null = null;
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('화면을 표시할 요소가 없습니다.');
const app: HTMLDivElement = root;

// 지정한 아이콘의 접근성 장식용 마크업을 반환합니다.
function icon(name: Icon, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}

// 사용자 입력과 예시 데이터를 HTML에 안전하게 표시합니다.
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char: string): string => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

// 현재 선택한 사이트를 반환합니다.
function property(): Property {
  return properties.find((item: Property): boolean => item.id === state.propertyId && item.clientId === state.clientId) ?? emptyProperty;
}

// 현재 고객사와 담당자 정보를 반환합니다.
function selectedClient(): Client | undefined {
  return clients.find((item: Client): boolean => item.id === state.clientId);
}

// 발행·검사 화면에서 현재 고객사 소속 블로그만 선택하게 합니다.
function sitePicker(): string {
  if (state.view !== 'inspect' && state.view !== 'notify') return '';
  const sites = clientProperties(properties, state.clientId);
  return `<section class="site-context"><label for="property-select">관리할 블로그</label><select id="property-select">${sites.length ? sites.map((site): string => `<option value="${escape(site.id)}" ${site.id === state.propertyId ? 'selected' : ''}>${escape(site.name)} · ${escape(site.siteUrl)}${site.active ? '' : ' (비활성)'}</option>`).join('') : '<option value="">등록된 블로그 없음</option>'}</select>${sites.length ? '' : '<button class="button secondary" data-view="register">사이트 등록</button>'}</section>`;
}

// 선택 고객사의 통계와 데이터 준비·빈 목록·오류 상태를 표시합니다.
function dashboardView(): string {
  const client = selectedClient();
  const heading = `<div class="page-heading"><div><h1>${escape(client?.name ?? '고객사')} · 대시보드</h1><p>담당자: ${escape(client?.manager || '미지정')} · 선택한 고객사의 블로그 전체 현황</p></div>${client ? '<button class="button secondary" id="reload-dashboard">통계 새로고침</button>' : ''}</div>`;
  if (!client) return `${heading}<section class="report empty-state">선택할 고객사가 없습니다.<p>고객사 관리에서 첫 고객사를 추가하세요.</p><button class="button primary" data-view="clients">고객사 관리</button></section>`;
  if (dashboardLoading) return `${heading}<section class="report empty-state" role="status">고객사 통계를 불러오는 중…</section>`;
  if (dashboardError) return `${heading}${errorPanel(dashboardError, '고객사 통계를 불러오지 못했습니다')}`;
  const data = demo ? demoDashboard(client, properties, inspections) : dashboardData;
  return `${heading}${data && data.client.id === client.id ? dashboardContent(data) : '<section class="report empty-state">통계 새로고침으로 저장된 현황을 확인하세요.</section>'}`;
}

// 고객사 전환 중 늦게 도착한 이전 고객사의 통계 응답은 무시합니다.
async function loadDashboard(): Promise<void> {
  const version = ++dashboardVersion;
  const id = state.clientId;
  dashboardData = null;
  dashboardError = null;
  dashboardLoading = !demo && !!id;
  if (state.view === 'dashboard') render();
  if (demo || !id) return;
  try {
    const result = await api.getDashboard(id);
    if (version === dashboardVersion && id === state.clientId) {
      if (result.client.id !== id) throw new ApiError(0, '요청한 고객사와 통계 응답이 다릅니다.');
      dashboardData = result;
    }
  } catch (error: unknown) {
    if (version === dashboardVersion && id === state.clientId) dashboardError = asAppError(error);
  } finally {
    if (version === dashboardVersion && id === state.clientId) {
      dashboardLoading = false;
      if (state.view === 'dashboard') render();
    }
  }
}

// 선택 블로그의 초안·결과를 분리하고 이전 설정 요청을 무효화합니다.
function selectProperty(id: string): void {
  if (id && !clientProperties(properties, state.clientId).some((site): boolean => site.id === id)) return;
  notificationDraft = ''; notificationTitles = ''; requestText = '';
  outcomes = outcomeHistory.get(id) ?? [];
  outcomesError = null;
  settingsError = null;
  settingsLoading = false;
  ++settingsRequest;
  update({ propertyId: id, filter: 'all', selectedId: null, notice: '' });
  void loadSettings();
  void loadInspectionTargets();
}

// 고객사를 바꾸면 소속 블로그로 선택을 제한하고 통계를 다시 읽습니다.
function selectClient(id: string): void {
  if (!clients.some((client): boolean => client.id === id)) return;
  if (id !== state.clientId) activities = [];
  state = { ...state, ...clientSelection(properties, id), notice: '' };
  dashboardData = null;
  dashboardError = null;
  selectProperty(state.propertyId);
  void loadDashboard();
}

// 한국 시간 기준의 표시용 현재 시각을 반환합니다.
function now(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).replaceAll('-', '.');
}

// 현재 속성과 검색엔진에 해당하는 예시 관측 기록을 반환합니다.
function currentRows(): readonly Inspection[] {
  if (!demo) return [];
  return inspections.filter((item: Inspection): boolean => item.propertyId === state.propertyId && item.engine === state.engine);
}

// 작업 결과를 예시 실행 이력에 추가합니다.
function addActivity(label: string): void {
  activities = [{ label, time: now() }, ...activities].slice(0, 8);
}

// 상태를 새 객체로 교체하고 화면을 다시 표시합니다.
function update(patch: Partial<AppState>): void {
  state = { ...state, ...('notice' in patch ? { noticeTone: 'success' as const } : {}), ...patch };
  render();
}

// 원인·반영 결과·다음 행동을 공통 오류 카드 하나에 표시합니다.
function errorPanel(error: ApiError, title: string, action?: 'workspace' | 'targets' | 'settings' | 'saved' | 'saves'): string {
  const view = presentError(error, title);
  const labels = { workspace: '목록 다시 불러오기', targets: '저장된 글 목록 확인', settings: '저장된 설정 다시 읽기', saved: '저장 결과 다시 읽기', saves: '글 저장 여부 확인' };
  return `<section class="error-panel ${view.tone}" role="alert" data-error-code="${escape(error.code)}"><div class="error-panel-heading">${icon('info')}<h3>${escape(view.title)}</h3></div><p>${escape(view.message)}</p><p class="error-advice">${escape(view.advice)}</p>${action ? `<button type="button" class="button secondary" data-error-action="${action}">${labels[action]}</button>` : ''}${view.authHelp ? '<details class="auth-help"><summary>API 연결 설정 안내</summary><p>서버의 검색엔진 API 인증정보와 필요한 접근 권한을 확인하세요. Google 인증 갱신 실패만으로 권한 철회·네트워크 문제 중 어느 것이 원인인지 단정할 수 없습니다. 재연결이 필요한 경우 서버 담당자가 OAuth 인증을 진행해야 합니다. 이 화면은 직접 로그인하거나 토큰을 변경하지 않습니다.</p></details>' : ''}<details class="error-details"><summary>오류 정보</summary><dl><div><dt>코드</dt><dd>${escape(error.code)}</dd></div>${error.status ? `<div><dt>HTTP</dt><dd>${error.status}</dd></div>` : ''}</dl></details></section>`;
}

// 왼쪽 메뉴의 한 항목을 표시합니다.
function navigation(view: View, name: Icon): string {
  return `<button class="nav-item ${state.view === view ? 'active' : ''}" data-view="${view}" ${state.view === view ? 'aria-current="page"' : ''}>${icon(name)}<span>${viewTitles[view]}</span></button>`;
}

// 예시 상태임을 명시한 검색엔진 선택 탭을 표시합니다.
function engines(): string {
  return `<div class="engine-tabs" role="group" aria-label="조회할 검색엔진">${(['google', 'naver', 'bing'] as const).map((engine: Engine): string => `<button data-engine="${engine}" class="engine-tab ${state.engine === engine ? 'active' : ''}" aria-pressed="${state.engine === engine}"><span class="engine-symbol ${engine}">${engine === 'google' ? 'G' : engine === 'naver' ? 'N' : 'b'}</span>${engineNames[engine]}</button>`).join('')}</div>`;
}

// 색인 상태 요약과 필터 가능한 URL 목록을 표시합니다.
function inspectionView(): string {
  if (!demo) return apiInspectionView();
  if (new URLSearchParams(window.location.search).get('error') === 'auth') {
    const example = new ApiError(503, 'Google API 인증 갱신에 실패했습니다. 서버 연결 상태 또는 OAuth 재인증을 확인하세요.', { code: 'GOOGLE_AUTH_REFRESH_FAILED', operation: 'inspect' });
    return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>Google 인증 오류 화면 예시 · 실제 요청은 실행하지 않습니다.</p></div></div><section class="report error-preview"><div class="report-header"><h2>최근 조회 오류</h2></div>${errorPanel(example, 'Google 상태를 조회하지 못했습니다')}<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p></section>`;
  }
  const rows = currentRows();
  const visible = rows.filter((row: Inspection): boolean => state.filter === 'all' || row.status === state.filter);
  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>검색엔진이 내 사이트의 페이지를 어떻게 보고 있는지 확인하세요.</p></div>${inspectionActions()}</div>
    ${engines()}
    ${sitemapForm()}
    <section class="report" aria-labelledby="report-title">
      <div class="report-header"><div><h2 id="report-title">페이지 색인 상태</h2><p>선택한 사이트의 URL별 관측 결과</p></div><span class="muted small">${icon('clock')}<span id="last-updated">${escape(rows[0]?.checkedAt ?? '조회 기록 없음')}</span></span></div>
      <div class="status-summary">${(['indexed', 'waiting', 'crawled', 'not_indexed'] as const).map((status: IndexStatus): string => `<button class="summary-cell ${status} ${state.filter === status ? 'selected' : ''}" data-filter="${status}" aria-pressed="${state.filter === status}"><span class="summary-label"><span class="status-dot"></span>${statusNames[status]}</span><strong>${rows.filter((row: Inspection): boolean => row.status === status).length}<span>페이지</span></strong></button>`).join('')}</div>
      <div class="table-toolbar"><button class="filter-reset ${state.filter === 'all' ? 'chosen' : ''}" data-filter="all">${state.filter === 'all' ? '전체 페이지' : `${statusNames[state.filter]} · 전체 보기`}<span>${visible.length}</span></button><span class="muted small">URL을 선택하면 상세 상태를 확인할 수 있습니다</span></div>
      <div class="table-scroll"><table class="url-table"><thead><tr><th scope="col">페이지 URL</th><th scope="col">색인 상태</th><th scope="col">마지막 크롤링</th><th scope="col"><span class="visually-hidden">상세 보기</span></th></tr></thead><tbody>${visible.map((row: Inspection): string => `<tr><td><button class="url-button" data-inspect="${row.id}"><span>${escape(property().origin + row.path)}</span><span class="url-title">${escape(row.title)}</span></button></td><td><span class="status-pill ${row.status}"><span class="status-dot"></span>${statusNames[row.status]}</span></td><td class="date-cell">${escape(row.crawledAt ?? '아직 확인되지 않음')}</td><td><button class="icon-button" data-inspect="${row.id}" aria-label="${escape(row.path)} 상세 보기">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>
      ${visible.length === 0 ? '<div class="empty-state">이 조건의 조회 기록이 없습니다.<p>다른 검색엔진이나 상태를 선택해 보세요.</p></div>' : ''}
      <div class="table-footer"><span>예시 관측 데이터</span><span>${visible.length}개 페이지</span></div>
    </section>
    <div class="explanation">${icon('info')}<p>색인 상태 조회는 관측 결과를 새로 확인하는 작업입니다. 사이트맵 제출은 수집이나 색인 완료를 의미하지 않습니다.</p></div>`;
}

// 사이트 전체의 제출 작업을 개별 URL 상태 조회 버튼 옆에 배치합니다.
function inspectionActions(): string {
  return `<div class="inspection-actions"><button class="button primary" id="refresh-index">${icon('refresh')}${state.engine === 'naver' ? '네이버 상태 조회 · 탭 연결 필요' : '색인 상태 조회'}</button><button class="button secondary" id="toggle-sitemap" aria-expanded="${sitemapOpen && state.engine !== 'naver'}" aria-controls="sitemap-panel" ${state.engine === 'naver' ? 'title="사이트맵 제출은 Google과 Bing만 지원합니다."' : ''}>${icon('send')}사이트맵 제출</button></div>`;
}

// 메인 사이트와 선택한 검색엔진을 명시하고 공개 사이트맵 주소를 입력받습니다.
function sitemapForm(): string {
  const site = property();
  const feedback = sitemapFeedback?.siteId === site.id && sitemapFeedback.engine === state.engine ? sitemapFeedback : null;
  const suggestion = site.siteUrl ? new URL('sitemap.xml', site.siteUrl).href : '';
  return `<section id="sitemap-panel" class="report sitemap-panel" ${sitemapOpen && state.engine !== 'naver' ? '' : 'hidden'} aria-labelledby="sitemap-title"><div class="report-header"><div><h2 id="sitemap-title">${engineNames[state.engine]} 사이트맵 제출</h2><p>선택한 글과 관계없이 ${escape(site.name)} 사이트 전체에 제출합니다.</p></div><button class="icon-button" id="close-sitemap" aria-label="사이트맵 제출 닫기">${icon('close')}</button></div><form id="sitemap-form" class="sitemap-form"><label for="sitemap-url">사이트맵 URL</label><div class="sitemap-input-row"><input id="sitemap-url" name="sitemapUrl" type="url" required maxlength="2048" value="${escape(suggestion)}" placeholder="https://example.com/sitemap.xml" aria-describedby="sitemap-help"><button class="button primary" type="submit">${engineNames[state.engine]}에 제출${demo ? ' · 예시' : ''}</button></div><p id="sitemap-help" class="field-help">실제 사이트맵 주소를 확인하세요. 새 글이 사이트맵에 먼저 반영되어 있어야 하며, 접수 성공이 색인 완료를 의미하지 않습니다.</p>${feedback ? `<p class="sitemap-feedback ${feedback.failed ? 'inspection-error' : ''}" role="${feedback.failed ? 'alert' : 'status'}">${escape(feedback.message)}</p>` : ''}</form></section>`;
}

// 선택한 메인페이지 또는 글의 검사 대상을 반환합니다.
function inspectionTarget(): InspectionTarget | undefined {
  return inspectionTargets.find((target: InspectionTarget): boolean => target.id === inspectionTargetId);
}

// 저장 상태 조회와 사용자가 누르는 새 조회 버튼을 구분해 표시합니다.
function apiInspectionView(): string {
  const target = inspectionTarget();
  const observation = storedInspections.find((item: InspectionRead): boolean => item.site_id === inspectionTargetId && item.engine === state.engine);
  const previousError = observation?.error_message ? new ApiError(0, observation.error_message, { code: observation.error_code ?? 'SAVED_INSPECTION_ERROR', operation: 'inspect' }) : null;
  const failure = inspectionError ?? previousError;
  const unavailable = inspectionUnavailable(state.engine, property(), target);
  const explanation = state.engine === 'naver' ? unavailable : state.engine === 'bing' ? 'Bing은 현재 API로 크롤링 상태를 조회합니다. 실제 색인 여부를 추정하지 않습니다.' : 'Google URL Inspection API로 저장된 색인 상태를 조회합니다. URL 제출이나 색인 요청은 실행하지 않습니다.';
  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>메인페이지 또는 글을 선택하고 검색엔진별 최신 상태를 확인하세요.</p></div>${inspectionActions()}</div>
    ${engines()}
    ${sitemapForm()}
    <section class="report"><div class="report-header"><div><h2>검사 대상</h2><p>대상 선택은 저장 상태만 읽습니다. 새 조회는 위 버튼으로 실행합니다.</p></div><button class="button secondary" id="reload-inspection-targets">${icon('refresh')}대상 목록 새로고침</button></div>
    <div class="inspection-controls"><label for="inspection-target-select">메인페이지 / 글</label><select id="inspection-target-select">${inspectionTargets.length ? inspectionTargets.map((item: InspectionTarget): string => `<option value="${escape(item.id)}" ${item.id === inspectionTargetId ? 'selected' : ''}>${item.type === 'site' ? '메인페이지' : '글'} · ${escape(item.name)}${item.active ? '' : ' (비활성)'} — ${escape(item.url)}</option>`).join('') : '<option value="">사이트를 먼저 등록하거나 선택하세요</option>'}</select><p class="small muted">${escape(target?.url ?? '')}</p></div>
    ${targetsError ? errorPanel(targetsError, '글 목록을 불러오지 못했습니다', 'targets') : ''}
    <div class="inspection-body"><div class="report-header"><h2>${failure ? '최근 조회 오류' : `저장된 ${engineNames[state.engine]} 상태`}</h2>${failure ? '' : '<button class="button secondary" id="read-inspection">저장 결과 다시 읽기</button>'}</div>
    ${inspectionLoading || targetsLoading ? '<p role="status">저장된 결과를 불러오는 중…</p>' : ''}
    ${failure ? errorPanel(failure, `${engineNames[state.engine]} ${failure.operation === 'read' ? '저장 결과를 읽지 못했습니다' : '상태를 조회하지 못했습니다'}`, 'saved') : ''}
    ${observation && (!failure || observation.last_checked_at) ? `<div class="detail-result ${!failure && observation.index_status === 'indexed' ? 'indexed' : ''}">${icon(!failure && observation.index_status === 'indexed' ? 'check' : 'info')}<div><h3>${inspectionStatusNames[observation.index_status]}</h3><p>${failure ? '이전 성공 관측 결과입니다. 이번 조회의 성공을 의미하지 않습니다.' : '검색엔진에서 확인해 DB에 저장한 요약 상태입니다.'}</p></div></div><dl class="property-facts"><div><dt>마지막 성공 관측</dt><dd>${escape(inspectionTime(observation.last_checked_at))}</dd></div></dl>` : failure ? '<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p>' : inspectionLoading || targetsLoading ? '' : '<div class="empty-state">아직 저장된 조회 결과가 없습니다.<p>조회 기록이 없다는 것은 미색인을 의미하지 않습니다.</p></div>'}
    <div class="inline-note">${escape(explanation)}</div>${unavailable && state.engine !== 'naver' ? `<p class="inspection-error">${escape(unavailable)}</p>` : ''}
    <p class="field-help">이 API는 크롤링 시각·제출 이력의 상세 필드를 제공하지 않습니다. 확인되지 않은 단계를 완료로 표시하지 않습니다.</p></div></section>`;
}

// 새 도메인의 검색엔진 등록 입력 화면을 표시합니다.
function registrationView(): string {
  return `<div class="page-heading"><div><h1>사이트 등록</h1><p>새 도메인을 등록하고 검색엔진 연결을 준비하세요.</p></div></div>
    <div class="form-layout"><section class="report form-report"><div class="report-header"><div><h2>새 도메인 등록</h2><p>고객사와 사이트 정보를 입력하세요.</p></div>${icon('globe')}</div>
      <form id="registration-form" class="work-form">${clients.length ? '' : '<div class="inline-note">먼저 왼쪽 고객사 관리에서 고객사를 등록하세요.</div>'}<label>고객사 <span class="required">*</span><input value="${escape(selectedClient()?.name ?? '')}" readonly required aria-label="현재 선택한 고객사"><span class="field-help">왼쪽 위에서 고객사를 변경할 수 있습니다.</span></label>
      <label>사이트 이름 <span class="required">*</span><input name="siteName" required maxlength="100" placeholder="예: 오터스튜디오 공식 사이트"></label>
      <label>도메인 URL <span class="required">*</span><input name="origin" type="url" required placeholder="https://example.com"><span class="field-help">글 주소가 아닌 사이트의 루트 주소를 입력하세요.</span></label>
      <fieldset><legend>사이트 소유 구분</legend><div class="radio-row"><label class="radio-label"><input type="radio" name="ownership" value="client" checked>고객사 사이트</label><label class="radio-label"><input type="radio" name="ownership" value="internal">우리 팀 사이트</label></div></fieldset>
      <div class="two-fields"><label>사용 플랫폼<select name="cmsType"><option value="">미지정</option><option value="wordpress">WordPress</option><option value="notion">Notion</option><option value="custom">자체 제작</option></select></label><label>인증 파일·태그 설치<select name="editable"><option value="">모름</option><option value="true">설치 가능</option><option value="false">설치 불가능</option></select></label></div><div class="inline-note">사이트 정보와 선택한 IndexNow 설정을 우리 DB에 저장합니다. 검색엔진 사이트 등록·소유 확인은 별도 작업입니다.</div>
      <fieldset class="indexnow-fields"><legend>IndexNow 설정 <span class="muted small">선택 · 네이버 / Bing 공통</span></legend>${indexNowFields()}<p class="field-help">키 파일은 관리 서버가 아닌 대상 도메인에 공개해야 합니다. 두 항목을 비우면 설정 없이 사이트만 등록합니다.</p></fieldset>
      <div class="form-error" id="registration-error"></div><div class="form-footer"><span class="muted small">* 필수 항목</span><button class="button primary" type="submit">${icon('plus')}사이트 등록</button></div></form></section>
      <aside class="context-column"><h3>등록 후 진행 과정</h3><ol class="vertical-steps"><li><strong>사이트 정보 등록</strong><p>고객사와 도메인을 연결합니다.</p></li><li><strong>소유권 또는 접근 권한 확인</strong><p>검색엔진별로 인증 파일·태그 또는 부여된 권한을 확인합니다.</p></li><li><strong>검색엔진 연결</strong><p>연결이 완료되면 발행 알림과 색인 상태 조회를 진행합니다.</p></li></ol><div class="context-note">${icon('info')}<p>${demo ? '예시 사이트 목록만 추가합니다.' : '고객사와 사이트 정보를 DB에 저장합니다.'} 실제 검색엔진 등록·소유 확인은 실행하지 않습니다.</p></div></aside></div>`;
}

// 신규 등록과 기존 사이트 설정에서 공통으로 사용할 입력칸을 표시합니다.
function indexNowFields(): string {
  return `<label>IndexNow 키<input name="indexnowKey" minlength="8" maxlength="128" pattern="[a-fA-F0-9-]{8,128}" autocomplete="off" placeholder="8~128자 · 0~9, a~f, 하이픈"></label><label>키 파일 URL<input name="indexnowLocation" type="url" placeholder="https://example.com/키.txt"><span class="field-help">파일 내용에는 키 문자열을 넣고, 사이트 루트에 배포하세요.</span></label>`;
}

// 선택한 사이트의 설정과 미검증 상태를 구분해 표시합니다.
function indexNowSettingsView(): string {
  const settings = property().indexNow;
  const configured = settings?.configured ?? false;
  return `<section class="indexnow-settings" aria-label="사이트 IndexNow 설정"><div class="settings-heading"><div><h3>IndexNow 설정</h3><p>${settingsLoading ? '설정 조회 중…' : settingsError ? '현재 설정을 확인하지 못했습니다.' : configured ? '설정 저장됨 · 키 파일 설치 미확인' : '미설정 · 글 저장만 하거나 키 설정을 추가할 수 있습니다.'}</p></div><span class="status-pill ${configured && !settingsError ? 'crawled' : 'waiting'}">${settingsLoading ? '조회 중' : settingsError ? '확인 불가' : configured ? '설정 있음' : '미설정'}</span></div>${settingsError ? errorPanel(settingsError, 'IndexNow 설정을 읽지 못했습니다', 'settings') : ''}${configured ? `<dl class="settings-values"><div><dt>키</dt><dd>서버에 저장됨 · 원문은 조회하지 않습니다${settingsError ? ' · 이전에 읽은 설정' : ''}</dd></div><div><dt>키 파일</dt><dd>${escape(settings?.key_location ?? '')}</dd></div></dl>` : ''}<details id="indexnow-editor" ${configured && !settingsError ? '' : 'open'}><summary>${configured ? 'IndexNow 설정 변경' : 'IndexNow 설정 입력'}</summary><form class="work-form settings-form" id="indexnow-form">${indexNowFields()}<p class="field-help">키와 파일 URL을 함께 입력하세요. 형식 확인과 키 파일 설치·접수 확인은 서로 다릅니다.</p><div class="form-error" id="indexnow-error"></div><div><button class="button secondary" type="submit">${demo ? '예시 설정 저장' : '설정 저장'}</button></div></form></details></section>`;
}

// 새 글의 처리 경로 선택과 URL 입력 화면을 표시합니다.
function notificationView(): string {
  const routes: readonly { id: NotifyRoute; title: string; subtitle: string; icon: Icon }[] = [
    { id: 'direct', title: '직접 알림', subtitle: '접근 권한이 있는 사이트', icon: 'send' },
    { id: 'link', title: '우리 블로그에 링크 추가', subtitle: '고객사 글을 소개하는 경로', icon: 'link' },
    { id: 'request', title: '고객사에 요청', subtitle: '담당자에게 제출 요청', icon: 'mail' },
  ];
  return `<div class="page-heading"><div><h1>새 글 발행 알림</h1><p>등록된 사이트의 새 글을 검색엔진에 알리거나 후속 작업을 준비하세요.</p></div></div>
    ${property().id ? '' : '<div class="inline-note">먼저 사이트를 등록하거나 왼쪽에서 사이트를 선택하세요.</div>'}
    <div class="route-options" role="group" aria-label="발행 알림 처리 방법">${routes.map((route): string => `<button class="route-option ${state.route === route.id ? 'selected' : ''}" data-route="${route.id}" aria-pressed="${state.route === route.id}">${icon(route.icon)}<strong>${route.title}</strong><span>${route.subtitle}</span>${state.route === route.id ? icon('check', 'route-check') : ''}</button>`).join('')}</div>
    <div class="form-layout"><section class="report form-report"><div class="report-header"><div><h2>${routes.find((route): boolean => route.id === state.route)?.title}</h2><p>${escape(property().name)} · ${escape(property().origin)}</p></div></div>
      ${state.route === 'direct' ? indexNowSettingsView() : ''}
      <form id="notification-form" class="work-form"><label>글 제목 <span class="required">*</span><textarea name="titles" rows="2" required placeholder="새 글 제목을 입력하세요">${escape(notificationTitles)}</textarea><span class="field-help">여러 글은 URL과 같은 순서로 한 줄에 하나씩 제목을 입력하세요.</span></label><label>발행된 글 URL <span class="required">*</span><textarea name="urls" rows="5" required placeholder="${escape(property().origin)}/posts/new-article">${escape(notificationDraft)}</textarea><span class="field-help">URL을 한 줄에 하나씩 입력하세요. 선택한 사이트의 글만 처리합니다.</span></label>
      ${state.route === 'direct' ? `<label class="radio-label"><input type="checkbox" name="notify" id="notify-enabled" ${notifyEnabled ? 'checked' : ''}>글 저장과 함께 IndexNow 알림 전송</label><div class="inline-note">네이버·Bing 공통 알림입니다. 체크를 해제하면 글만 DB에 저장합니다. Google 일반 URL 제출과는 별개입니다.</div>` : state.route === 'link' ? '<div class="inline-note">우리 블로그의 글 편집·발행 작업을 준비합니다. 링크 추가가 고객사 URL의 직접 제출이나 색인을 보장하지는 않습니다.</div>' : '<label>요청 내용<textarea name="note" rows="2" placeholder="예: 신규 글 제출과 접수 결과 확인을 부탁드립니다."></textarea></label>'}
      <div class="form-error" id="notification-error"></div><div class="form-footer"><span class="muted small">${state.route === 'direct' ? (demo ? '예시 실행 · 실제 전송 없음' : '글 저장과 알림 결과를 각각 확인하세요') : '문구 작성만 수행하며 외부 전달·발행은 하지 않습니다'}</span><button class="button primary" type="submit" id="submit-pages">${icon(state.route === 'direct' ? 'send' : state.route === 'link' ? 'link' : 'mail')}${state.route === 'direct' ? '글 저장 및 발행 알림' : state.route === 'link' ? '링크 추가 작업 준비' : '요청 문구 만들기'}</button></div></form>
      ${requestText ? `<div class="request-result"><h3>${state.route === 'request' ? '고객사에 전달할 요청 문구' : '링크 추가 작업 메모'}</h3><pre>${escape(requestText)}</pre><button class="button secondary" id="copy-request">문구 복사</button></div>` : ''}</section>
      <aside class="context-column"><h3>사이트 처리 권한</h3><dl class="property-facts"><div><dt>고객사</dt><dd>${escape(clients.find((client: Client): boolean => client.id === property().clientId)?.name ?? '')}</dd></div><div><dt>소유 구분</dt><dd>${property().owned ? '우리 팀 사이트' : '고객사 사이트'}</dd></div><div><dt>접근 권한</dt><dd>실제 연결 시 확인 필요</dd></div></dl><div class="context-note">${icon('info')}<p>고객사 사이트는 권한과 운영 방식에 맞게 처리하세요. 요청 문구 작성과 실제 고객사 전달은 구분합니다.</p></div></aside></div>
    <div id="batch-results">${outcomeView()}</div>${activityView()}`;
}

// 고객사 목록과 신규 고객사 입력 화면을 표시합니다.
function clientsView(): string {
  return `<div class="page-heading"><div><h1>고객사 관리</h1><p>팀에서 관리하는 고객사와 연결된 사이트를 확인하세요.</p></div></div>
    <section class="report"><div class="report-header"><h2>고객사 목록 <span class="count">${clients.length}</span></h2></div><div class="table-scroll"><table class="client-table"><thead><tr><th>고객사</th><th>담당자</th><th>등록된 사이트</th></tr></thead><tbody>${clients.map((client: Client): string => `<tr><td><strong>${escape(client.name)}</strong></td><td>${escape(client.manager || '미지정')}</td><td>${properties.filter((item: Property): boolean => item.clientId === client.id).length}개</td></tr>`).join('')}</tbody></table></div></section>
    <section class="report form-report"><div class="report-header"><h2>고객사 추가</h2></div><form id="client-form" class="work-form"><div class="two-fields"><label>고객사 이름 *<input name="clientName" required maxlength="100" placeholder="고객사 이름"></label><label>담당자<input name="manager" maxlength="100" placeholder="선택 입력"></label></div><div class="form-error" id="client-error"></div><div class="form-footer"><span class="muted small">${demo ? '예시 목록에 추가됩니다' : '고객사 정보를 DB에 저장합니다'}</span><button class="button primary" type="submit">${icon('plus')}고객사 추가</button></div></form></section>`;
}

// 로컬 미리보기에서 실행한 작업만 이력으로 표시합니다.
function activityView(): string {
  if (activities.length === 0) return '';
  return `<section class="report"><div class="report-header"><h2>이번 화면의 작업 이력</h2></div><ul class="activity-list">${activities.map((activity: Activity): string => `<li>${icon('check')}<span>${escape(activity.label)}</span><time>${escape(activity.time)}</time></li>`).join('')}</ul></section>`;
}

// 선택한 URL의 실제 관측과 미확인 단계를 구분한 상세 화면을 표시합니다.
function detailView(): string {
  const row = inspections.find((item: Inspection): boolean => item.id === state.selectedId);
  if (!row) return '';
  const indexed = row.status === 'indexed';
  const crawled = row.crawledAt !== null;
  return `<div class="modal-backdrop" id="detail-backdrop"><section class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-heading" tabindex="-1"><header class="detail-header"><h2 id="detail-heading">URL 검사 결과</h2><button class="icon-button" id="close-detail" aria-label="상세 결과 닫기">${icon('close')}</button></header><div class="detail-body"><div class="detail-result ${indexed ? 'indexed' : row.status}">${icon(indexed ? 'check' : 'info')}<div><h3>${statusNames[row.status]}</h3><p>${indexed ? '이 URL의 색인 등록이 확인되었습니다.' : row.status === 'not_indexed' ? '이 관측에서는 색인이 확인되지 않았습니다.' : '최종 색인 결과가 아직 확인되지 않았습니다.'}</p></div></div><p class="detail-url">${escape(property().origin + row.path)}</p><ol class="inspection-steps"><li><span class="step-mark">?</span><strong>URL 제출</strong><span>접수 기록 미확인</span></li><li><span class="step-mark">${row.status === 'waiting' ? '•' : '?'}</span><strong>수집 대기</strong><span>${row.status === 'waiting' ? '현재 예시 상태' : '대기 이력 미확인'}</span></li><li class="${crawled ? 'observed' : ''}"><span class="step-mark">${crawled ? '✓' : '?'}</span><strong>크롤링</strong><span>${crawled ? escape(row.crawledAt ?? '') : '아직 확인되지 않음'}</span></li><li class="${indexed ? 'observed' : ''}"><span class="step-mark">${indexed ? '✓' : '?'}</span><strong>색인 여부</strong><span>${indexed ? '색인됨' : row.status === 'not_indexed' ? '색인되지 않음' : '아직 확인되지 않음'}</span></li></ol><dl class="property-facts"><div><dt>검색엔진</dt><dd>${engineNames[row.engine]}</dd></div><div><dt>마지막 확인</dt><dd>${escape(row.checkedAt)}</dd></div><div><dt>데이터</dt><dd>미리보기 예시</dd></div></dl><div class="inline-note">단계는 항상 순서대로 관측되는 것이 아닙니다. 제출 이력이 없어도 크롤링·색인이 확인될 수 있습니다.</div></div></section></div>`;
}

// 전체 관리 화면과 현재 선택한 작업 페이지를 표시합니다.
function render(): void {
  if (renderedScope) formDrafts = captureFormDrafts(app, renderedScope, formDrafts);
  const scope = `${state.clientId}:${state.view}:${state.propertyId}:${state.route}`;
  const privateInputs = renderedScope === scope ? Array.from(app.querySelectorAll<HTMLInputElement>('input[name="indexnowKey"], input[name="indexnowLocation"]')).map((element) => ({ formId: element.form?.id, element })) : [];
  document.title = `StartPress · ${viewTitles[state.view]}`;
  app.innerHTML = `<header class="app-header"><button class="icon-button menu-toggle" id="menu-toggle" aria-label="왼쪽 메뉴 열기 또는 닫기" aria-expanded="${window.matchMedia('(max-width:760px)').matches ? state.mobileNav : !state.mobileNav}">${icon('menu')}</button><a class="brand" href="#inspect" aria-label="StartPress 홈"><span class="brand-symbol"><span></span><span></span><span></span></span><span>StartPress <span class="brand-subtitle">Console</span></span></a><form class="global-search" id="url-search"><label class="visually-hidden" for="url-inspect">선택한 사이트의 URL 검사</label>${icon('search')}<input id="url-inspect" type="url" placeholder="${escape(property().origin)} 내 URL 검사" required autocomplete="off"><kbd>URL 검사</kbd></form><div class="header-end"><a class="mode-switch" href="${demo ? '/' : '/?mode=demo'}">${demo ? 'API 모드로' : '예시 모드'}</a><span class="user-avatar" aria-label="StartPress 팀">S</span></div></header>
    <aside class="sidebar ${state.mobileNav ? 'open' : ''}"><label class="property-picker"><span class="property-symbol">${icon('users')}</span><span class="visually-hidden">관리할 고객사 선택</span><select id="client-select">${clients.length ? clients.map((client: Client): string => `<option value="${escape(client.id)}" ${client.id === state.clientId ? 'selected' : ''}>${escape(client.name)}</option>`).join('') : '<option value="">등록된 고객사 없음</option>'}</select></label><div class="sidebar-client">담당자: ${escape(selectedClient()?.manager || '미지정')}<span>${clientProperties(properties, state.clientId).length}개 블로그</span></div>${navigation('dashboard', 'dashboard')}<div class="nav-divider"></div><div class="nav-section-label">검색엔진 관리</div><nav aria-label="검색엔진 관리">${navigation('register', 'globe')}${navigation('notify', 'send')}${navigation('inspect', 'inspect')}</nav><div class="nav-divider"></div><div class="nav-section-label">워크스페이스</div><nav aria-label="워크스페이스">${navigation('clients', 'users')}</nav><div class="sidebar-bottom"><span class="team-symbol">SP</span><div>StartPress 팀<span>사이트 운영 워크스페이스</span></div></div></aside>
    <main class="main-content"><div class="breadcrumb"><span>${state.view === 'clients' ? '워크스페이스' : escape(selectedClient()?.name ?? '고객사를 선택하세요')}</span>${icon('chevron')}<span>${viewTitles[state.view]}</span></div><div class="preview-notice">${icon('info')}<span>${demo ? '예시 모드입니다. 실제 검색엔진 요청이나 DB 저장은 하지 않습니다.' : 'API 연결 모드입니다. 고객사·사이트·글 저장은 DB에 반영되며, 발행 알림 선택 시 실제 IndexNow 요청을 실행합니다.'}</span></div>${loading ? '<div class="connection-notice" role="status">서버에서 고객사와 사이트를 불러오는 중…</div>' : loadError ? errorPanel(loadError, '고객사·사이트 목록을 불러오지 못했습니다', 'workspace') : ''}${state.notice ? `<div class="success-notice ${state.noticeTone ?? 'success'}" role="status">${icon(state.noticeTone && state.noticeTone !== 'success' ? 'info' : 'check')}<span>${escape(state.notice)}</span><button class="icon-button" id="dismiss-notice" aria-label="안내 닫기">${icon('close')}</button></div>` : ''}${sitePicker()}${state.view === 'dashboard' ? dashboardView() : state.view === 'inspect' ? inspectionView() : state.view === 'register' ? registrationView() : state.view === 'notify' ? notificationView() : clientsView()}<footer class="page-footer"><span>StartPress Console</span><span>${demo ? '예시 데이터 · 새로고침하면 초기화' : 'API 연결 · 알림 결과와 이번 작업 이력은 이 화면에서만 유지'}</span></footer></main>${detailView()}<div class="visually-hidden" role="status" aria-live="polite" id="live-status"></div>`;
  for (const input of privateInputs) {
    const replacement = input.formId ? app.querySelector<HTMLInputElement>(`#${CSS.escape(input.formId)} input[name="${CSS.escape(input.element.name)}"]`) : null;
    input.element.removeAttribute('aria-invalid');
    if (input.element.getAttribute('aria-describedby')?.startsWith('field-error-')) input.element.removeAttribute('aria-describedby');
    replacement?.replaceWith(input.element);
  }
  bindEvents();
  restoreFormDrafts(app, scope, formDrafts);
  const notify = app.querySelector<HTMLInputElement>('#notify-enabled');
  if (notify) notifyEnabled = notify.checked;
  renderedScope = scope;
  applyAvailability();
}

// HTTP(S) 주소를 검증하고 인증정보와 프래그먼트를 거부합니다.
function parseUrl(value: string): URL {
  const parsed = new URL(value);
  if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw new Error('인증정보나 #이 없는 HTTP(S) URL을 입력하세요.');
  }
  return parsed;
}

// 현재 사이트에 속하는 URL인지 확인합니다.
function targetUrl(value: string, allowHomepage = false): URL {
  const parsed = parseUrl(value);
  if (!property().id) throw new Error('먼저 사이트를 등록하거나 선택하세요.');
  const parent = new URL(property().siteUrl);
  const prefix = decodeURIComponent(parent.pathname).replace(/\/$/, '') + '/';
  if (parsed.origin !== parent.origin || !decodeURIComponent(parsed.pathname).startsWith(prefix) || (!allowHomepage && parsed.href === parent.href)) throw new Error('선택한 사이트의 출처·경로에 속한 개별 글 URL을 입력하세요.');
  return parsed;
}

// 폼 오류를 해당 화면에 텍스트로 표시합니다.
function showError(selector: string, error: unknown): void {
  const element = app.querySelector<HTMLElement>(selector);
  if (!element) return;
  setPending(false);
  const issue = asAppError(error, 'save');
  const form = element.closest('form');
  if (form) clearFormErrors(form);
  const titles: Record<string, string> = { '#registration-error': '사이트 정보를 저장하지 못했습니다', '#client-error': '고객사를 저장하지 못했습니다', '#indexnow-error': 'IndexNow 설정을 저장하지 못했습니다', '#notification-error': '글 처리 요청을 완료하지 못했습니다' };
  const recovery = selector === '#indexnow-error' && (uncertainWrite(issue) || issue.kind === 'conflict') ? 'settings' : ['#registration-error', '#client-error'].includes(selector) && (uncertainWrite(issue) || issue.kind === 'conflict' || issue.kind === 'not_found') ? 'workspace' : issue.kind === 'conflict' && selector === '#notification-error' ? 'targets' : undefined;
  element.innerHTML = errorPanel(issue, titles[selector] ?? '입력을 확인하세요', recovery);
  const aliases: Record<string, string> = { client_id: 'clientId', name: form?.id === 'client-form' ? 'clientName' : form?.id === 'notification-form' ? 'titles' : 'siteName', url: form?.id === 'registration-form' ? 'origin' : 'urls', key: 'indexnowKey', key_location: 'indexnowLocation', indexnow_key: 'indexnowKey', indexnow_key_location: 'indexnowLocation' };
  let first: HTMLElement | null = null;
  for (const field of issue.fields) {
    const input = form?.querySelector<HTMLElement>(`[name="${CSS.escape(aliases[field.field] ?? field.field)}"]`);
    if (!input) continue;
    const message = document.createElement('span');
    message.className = 'field-error';
    message.dataset.fieldError = '';
    message.id = `field-error-${form?.id}-${aliases[field.field] ?? field.field}`;
    message.textContent = field.message;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', message.id);
    input.insertAdjacentElement('afterend', message);
    first ??= input;
  }
  if (first) first.focus();
  else { element.setAttribute('tabindex', '-1'); element.focus(); }
  bindErrorActions(element);
}

// 다음 제출 전에 이전 필드 오류만 제거하며 작성한 값은 유지합니다.
function clearFormErrors(form: HTMLFormElement): void {
  state = { ...state, notice: '' };
  app.querySelector<HTMLElement>('.success-notice')?.remove();
  form.querySelectorAll<HTMLElement>('[data-field-error]').forEach((element): void => element.remove());
  form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((element): void => {
    element.removeAttribute('aria-invalid');
    if (element.getAttribute('aria-describedby')?.startsWith('field-error-')) element.removeAttribute('aria-describedby');
  });
  form.querySelectorAll<HTMLElement>('.form-error').forEach((element): void => element.replaceChildren());
}

// 오류 카드의 복구 버튼은 목록·저장 결과만 읽으며 저장·외부 요청을 재실행하지 않습니다.
function bindErrorActions(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-error-action]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      if (pending || loading) return;
      if (button.dataset.errorAction === 'workspace') void loadWorkspace();
      if (button.dataset.errorAction === 'settings') void loadSettings();
      if (button.dataset.errorAction === 'saved') void loadStoredInspections();
      if (button.dataset.errorAction === 'saves') void verifySavedPages();
      if (button.dataset.errorAction === 'targets') { update({ view: 'inspect', notice: '', mobileNav: false }); void loadInspectionTargets(); }
    });
  });
}

// API 필드를 화면 모델로 변환하고 키 원문은 보관하지 않습니다.
function mapSite(item: SiteRead): Property {
  return { id: item.id, clientId: item.client_id, name: item.name, origin: new URL(item.url).origin, siteUrl: item.url, active: item.is_active, owned: item.owner_type === 'internal', indexNow: null };
}

// 선택 대상의 저장 결과를 읽고 이전 대상에 대한 늦은 응답은 무시합니다.
async function loadStoredInspections(): Promise<void> {
  if (demo || !inspectionTargetId) return;
  const version = ++observationVersion;
  const id = inspectionTargetId;
  inspectionLoading = true;
  inspectionError = null;
  if (state.view === 'inspect') render();
  try {
    const rows = await api.getInspections(id);
    if (version === observationVersion && id === inspectionTargetId) storedInspections = rows;
  } catch (error: unknown) {
    if (version === observationVersion && id === inspectionTargetId) inspectionError = asAppError(error);
  } finally {
    if (version === observationVersion && id === inspectionTargetId) {
      inspectionLoading = false;
      if (state.view === 'inspect') render();
    }
  }
}

// 메인페이지와 저장된 글 목록을 읽고 검색엔진 호출 없이 조회 대상을 준비합니다.
async function loadInspectionTargets(): Promise<void> {
  if (demo) return;
  const version = ++targetsVersion;
  ++observationVersion;
  const site = property();
  const oldTargetId = inspectionTargetId;
  inspectionTargetId = site.id;
  storedInspections = [];
  inspectionLoading = false;
  targetsLoading = true;
  targetsError = null;
  inspectionError = null;
  inspectionTargets = site.id ? [{ id: site.id, name: site.name, url: site.siteUrl, active: site.active, type: 'site' }] : [];
  if (state.view === 'inspect') render();
  if (!site.id) { targetsLoading = false; if (state.view === 'inspect') render(); return; }
  try {
    const pages = await api.listPages(site.id);
    if (version !== targetsVersion || site.id !== state.propertyId) return;
    inspectionTargets = [...inspectionTargets, ...pages.map((page): InspectionTarget => ({ id: page.id, name: page.name, url: page.url, active: page.is_active, type: 'page' }))];
    inspectionTargetId = inspectionTargets.some((target: InspectionTarget): boolean => target.id === oldTargetId) ? oldTargetId : site.id;
  } catch (error: unknown) {
    if (version === targetsVersion && site.id === state.propertyId) targetsError = asAppError(error);
  } finally {
    if (version === targetsVersion && site.id === state.propertyId) {
      targetsLoading = false;
      if (state.view === 'inspect') render();
    }
  }
  if (version === targetsVersion && site.id === state.propertyId) await loadStoredInspections();
}

// 현재 사이트의 설정을 조회하고 이전 사이트의 늦은 응답은 무시합니다.
async function loadSettings(): Promise<void> {
  if (demo || !property().id) return;
  const version = ++settingsRequest;
  const id = property().id;
  settingsLoading = true;
  settingsError = null;
  if (state.view === 'notify') { capturePublicationDraft(); render(); }
  try {
    const settings = await api.getSettings(id);
    if (version !== settingsRequest || id !== state.propertyId) return;
    properties = properties.map((item: Property): Property => item.id === id ? { ...item, indexNow: settings } : item);
  } catch (error: unknown) {
    if (version !== settingsRequest || id !== state.propertyId) return;
    settingsError = asAppError(error);
  } finally {
    if (version === settingsRequest && id === state.propertyId) {
      capturePublicationDraft();
      settingsLoading = false;
      if (state.view === 'notify') render();
      else applyAvailability();
    }
  }
}

// 고객사와 메인 사이트 목록을 서버에서 읽고 실패 시 예시 데이터로 대체하지 않습니다.
async function loadWorkspace(): Promise<void> {
  if (loading && clients.length > 0) return;
  loading = true;
  loadError = null;
  render();
  try {
    const result = await api.listClients();
    const siteLists = await Promise.all(result.map((item): Promise<readonly SiteRead[]> => api.listSites(item.id)));
    clients = result.map((item): Client => ({ id: item.id, name: item.name, manager: item.manager_name ?? '' }));
    properties = siteLists.flat().map(mapSite);
    const clientId = clients.some((item): boolean => item.id === state.clientId) ? state.clientId : clients[0]?.id ?? '';
    state = { ...state, ...clientSelection(properties, clientId, state.propertyId) };
  } catch (error: unknown) {
    loadError = asAppError(error);
  } finally {
    loading = false;
    render();
  }
  if (!loadError) await Promise.all([loadSettings(), loadInspectionTargets(), loadDashboard()]);
}

// 네트워크 처리 중 입력과 중복 실행을 막고 폼 자체는 보존합니다.
function setPending(value: boolean): void {
  pending = value;
  app.setAttribute('aria-busy', String(value));
  applyAvailability();
}

// 데이터 준비·활성 사이트·설정 유무에 맞춰 버튼의 실행 가능 여부를 갱신합니다.
function applyAvailability(): void {
  app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea').forEach((element): void => { element.disabled = pending || loading; });
  if (pending || loading) return;
  const noSite = !property().id || !property().active;
  const noSitemap = noSite || state.engine === 'naver';
  app.querySelectorAll<HTMLButtonElement | HTMLInputElement>('#toggle-sitemap, #sitemap-form input, #sitemap-form button').forEach((element): void => { element.disabled = noSitemap; });
  app.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('#notification-form button, #notification-form input, #notification-form select, #notification-form textarea, #indexnow-form input, #indexnow-form button').forEach((element): void => { element.disabled = noSite; });
  app.querySelectorAll<HTMLInputElement | HTMLButtonElement>('#indexnow-form input, #indexnow-form button').forEach((element): void => { element.disabled = noSite || settingsLoading; });
  const registration = app.querySelector<HTMLButtonElement>('#registration-form button[type="submit"]');
  if (registration) registration.disabled = !state.clientId;
  const search = app.querySelector<HTMLInputElement>('#url-inspect');
  if (search) search.disabled = noSite || (!demo && targetsLoading);
  if (!demo) {
    const unavailable = !!inspectionUnavailable(state.engine, property(), inspectionTarget());
    const refresh = app.querySelector<HTMLButtonElement>('#refresh-index');
    if (refresh) refresh.disabled = unavailable || targetsLoading || inspectionLoading;
    const targetSelect = app.querySelector<HTMLSelectElement>('#inspection-target-select');
    if (targetSelect) targetSelect.disabled = targetsLoading || inspectionTargets.length === 0;
    const read = app.querySelector<HTMLButtonElement>('#read-inspection');
    if (read) read.disabled = !inspectionTargetId || inspectionLoading || targetsLoading;
  }
  const button = app.querySelector<HTMLButtonElement>('#submit-pages');
  if (button && state.route === 'direct') {
    button.disabled = noSite || (notifyEnabled && (settingsLoading || !!settingsError || !property().indexNow?.configured));
    button.textContent = notifyEnabled ? '글 저장 및 발행 알림' : '글만 저장';
  }
}

// 글 저장과 알림 접수 결과를 별도 열로 표시합니다.
function outcomeView(): string {
  if (!outcomes.length) return '';
  const labels: Record<PageCreateResult['submission']['status'], string> = { accepted: '알림 접수됨', key_pending: '키 확인 중', failed: '글 저장됨 · 알림 실패', unknown: '글 저장됨 · 접수 여부 불명', skipped: '알림 생략' };
  const explanations: Readonly<Record<string, string>> = {
    INDEXNOW_NOT_CONFIGURED: '키 설정이 없어 알림을 생략했습니다. 글은 저장됐습니다.',
    INDEXNOW_SETTINGS_INCONSISTENT: '사이트의 IndexNow 설정이 일치하지 않습니다. 키와 파일 URL을 함께 확인하세요.',
    INVALID_INDEXNOW_SETTINGS: '사이트의 키 설정 또는 적용 범위를 확인하세요.',
    INDEXNOW_REJECTED: 'IndexNow가 알림을 거절했습니다. 글을 다시 등록하지 말고 설정과 응답을 확인하세요.',
    INDEXNOW_TIMEOUT: '알림 응답 시간이 초과돼 접수 여부를 알 수 없습니다. 자동 재전송하지 않습니다.',
    INDEXNOW_TRANSPORT_ERROR: '알림 통신 중 접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.',
    NOTIFICATION_DISABLED: '알림을 선택하지 않아 글만 저장했습니다.',
    DEMO_MODE: '예시 결과이며 실제 저장·전송은 하지 않았습니다.',
  };
  return `<section class="report" aria-label="이번 글 처리 결과"><div class="report-header"><div><h2>글별 처리 결과</h2><p>저장과 알림 결과는 별개입니다. 새로고침하면 이번 실행 결과는 사라집니다.</p></div>${outcomes.some((item: PageOutcome): boolean => item.saveStatus === 'unknown') ? '<button class="button secondary" type="button" data-error-action="saves">글 저장 여부 확인</button>' : ''}</div>${outcomesError ? errorPanel(outcomesError, '글 저장 여부를 확인하지 못했습니다', 'saves') : ''}<div class="table-scroll"><table><thead><tr><th>글</th><th>DB 저장</th><th>알림 결과·다음 행동</th></tr></thead><tbody>${outcomes.map((item: PageOutcome): string => {
    const issue = item.error ? presentError(item.error, '처리 오류') : null;
    const reason = item.result?.submission.error_code ? explanations[item.result.submission.error_code] ?? '알림 처리 결과를 확인하세요.' : '';
    return `<tr><td>${escape(item.article.name)}<span class="result-url">${escape(item.article.url)}</span></td><td>${item.saveStatus === 'saved' ? (demo ? '예시 저장' : '저장 확인됨') : item.saveStatus === 'unknown' ? '저장 여부 불명' : item.saveStatus === 'rejected' ? '요청 거절' : '미실행'}</td><td>${item.result ? labels[item.result.submission.status] : item.saveStatus === 'not_sent' ? '전송하지 않음' : '접수 여부 미확인'}${reason ? `<span class="result-url">${escape(reason)}</span>` : ''}${item.message ? `<span class="result-url">${escape(item.message)}</span>` : ''}${issue ? `<details class="row-error"><summary>원인·다음 행동</summary><p>${escape(issue.advice)}</p><small>오류 코드: ${escape(item.error?.code ?? '')}</small></details>` : ''}</td></tr>`;
  }).join('')}</tbody></table></div></section>`;
}

// 결과 불명인 글의 저장만 GET으로 확인하며 알림은 다시 전송하지 않습니다.
async function verifySavedPages(): Promise<void> {
  if (pending || !property().id) return;
  setPending(true);
  outcomesError = null;
  try {
    const pages = demo ? [] : await api.listPages(property().id);
    outcomes = outcomes.map((item: PageOutcome): PageOutcome => {
      if (item.saveStatus !== 'unknown') return item;
      const found = pages.some((page): boolean => page.url === item.article.url);
      return found ? { ...item, saveStatus: 'saved', error: undefined, message: 'DB 저장을 확인했습니다. 알림 접수 여부는 확인할 수 없으며 다시 전송하지 않았습니다.' } : { ...item, message: '현재 목록에서 확인되지 않았습니다. 아직 처리 중일 수 있으므로 미저장으로 단정하거나 다시 전송하지 않습니다.' };
    });
    outcomeHistory = new Map([...outcomeHistory, [property().id, outcomes]]);
  } catch (error: unknown) {
    outcomesError = asAppError(error);
  } finally {
    pending = false;
    render();
    setPending(false);
  }
}

// 검색창의 URL을 현재 예시 관측 기록에서 찾아 상세 결과를 엽니다.
function inspectUrl(event: SubmitEvent): void {
  event.preventDefault();
  const input = app.querySelector<HTMLInputElement>('#url-inspect');
  if (!input) return;
  input.setCustomValidity('');
  try {
    const url = targetUrl(input.value.trim(), true);
    if (!demo) {
      const target = inspectionTargets.find((item: InspectionTarget): boolean => new URL(item.url).href === url.href);
      if (!target) throw new Error('먼저 글을 DB에 등록하세요. 저장된 메인페이지·글 URL만 선택할 수 있습니다.');
      inspectionTargetId = target.id;
      storedInspections = [];
      update({ view: 'inspect', notice: '', mobileNav: false });
      void loadStoredInspections();
      return;
    }
    const row = currentRows().find((item: Inspection): boolean => new URL(item.path, property().origin).href === url.href);
    if (!row) {
      update({ view: 'inspect', notice: '이 URL의 예시 관측 기록이 없습니다. 실제 API를 연결한 뒤 조회할 수 있습니다.' });
      return;
    }
    openDetail(row.id);
  } catch (error: unknown) {
    input.setCustomValidity(error instanceof Error ? error.message : 'URL을 확인하세요.');
    input.reportValidity();
  }
}

// 새 도메인을 예시 목록에 추가하되 검색엔진 등록 완료로 처리하지 않습니다.
async function registerSite(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (pending || !state.clientId) return;
  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  try {
    const name = String(data.get('siteName') ?? '').trim();
    if (!name) throw new Error('사이트 이름을 입력하세요.');
    const url = parseUrl(String(data.get('origin') ?? '').trim());
    if (url.pathname !== '/' || url.search) throw new Error('경로나 쿼리가 없는 도메인 루트 주소를 입력하세요.');
    const indexNow = validateIndexNowSettings(url.origin, String(data.get('indexnowKey') ?? ''), String(data.get('indexnowLocation') ?? ''));
    const editable = String(data.get('editable') ?? '');
    const payload = { client_id: state.clientId, name, url: url.href, owner_type: data.get('ownership') === 'internal' ? 'internal' as const : 'client' as const, cms_type: String(data.get('cmsType') ?? '') || null, can_edit_site: editable === '' ? null : editable === 'true', indexnow_key: indexNow?.key ?? null, indexnow_key_location: indexNow?.keyLocation ?? null };
    setPending(true);
    const site: Property = demo ? { id: crypto.randomUUID(), clientId: payload.client_id, name, origin: url.origin, siteUrl: url.href, active: true, owned: payload.owner_type === 'internal', indexNow: indexNow ? { configured: true, key_location: indexNow.keyLocation } : { configured: false, key_location: null } } : mapSite(await api.addSite(payload));
    properties = [...properties, site];
    pending = false;
    form.reset();
    addActivity(`${name} 사이트 정보 저장`);
    dashboardData = null;
    outcomes = [];
    outcomesError = null;
    notificationDraft = ''; notificationTitles = ''; requestText = '';
    update({ propertyId: site.id, notice: `${name}: ${demo ? '예시 목록' : 'DB'}에 사이트 정보를 저장했습니다. 검색엔진 등록·소유 확인을 완료한 것은 아닙니다.` });
    if (!demo) await Promise.all([loadSettings(), loadInspectionTargets()]);
  } catch (error: unknown) {
    showError('#registration-error', error);
  } finally {
    setPending(false);
  }
}

// 화면을 다시 그리기 전에 글 제목과 URL 입력값을 보존합니다.
function capturePublicationDraft(): void {
  notificationDraft = app.querySelector<HTMLTextAreaElement>('[name="urls"]')?.value ?? notificationDraft;
  notificationTitles = app.querySelector<HTMLTextAreaElement>('[name="titles"]')?.value ?? notificationTitles;
}

// 기존 사이트의 예시 설정을 저장하되 설치 검증은 수행하지 않습니다.
async function saveIndexNowSettings(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (pending || !property().id) return;
  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  try {
    const indexNow = validateIndexNowSettings(property().siteUrl, String(data.get('indexnowKey') ?? ''), String(data.get('indexnowLocation') ?? ''));
    if (!indexNow) throw new Error('저장할 키와 키 파일 URL을 함께 입력하세요.');
    capturePublicationDraft();
    setPending(true);
    const settings = demo ? { configured: true, key_location: indexNow.keyLocation } : await api.putSettings(property().id, indexNow);
    properties = properties.map((item: Property): Property => item.id === state.propertyId ? { ...item, indexNow: settings } : item);
    settingsError = null;
    pending = false;
    form.reset();
    update({ notice: `${demo ? '예시 설정' : 'IndexNow 설정'}을 저장했습니다. 키 원문은 화면에 보관하지 않으며, 파일 설치·접수 확인은 별도입니다.` });
  } catch (error: unknown) {
    showError('#indexnow-error', error);
  } finally {
    setPending(false);
  }
}

// 선택한 처리 경로에 따라 예시 접수 또는 전달 문구를 준비합니다.
async function notifyPublication(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (pending || !property().id) return;
  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  notificationDraft = String(data.get('urls') ?? '');
  notificationTitles = String(data.get('titles') ?? '');
  try {
    const titles = notificationTitles.split(/\r?\n/).map((line: string): string => line.trim()).filter(Boolean);
    const urls = notificationDraft.split(/\r?\n/).map((line: string): string => line.trim()).filter(Boolean).map((line: string): string => targetUrl(line).href);
    if (!urls.length || titles.length !== urls.length) throw new Error('제목과 URL을 같은 순서로 한 줄씩 입력하세요. 제목과 URL 개수가 같아야 합니다.');
    if (new Set(urls).size !== urls.length) throw new Error('중복 URL을 제거하고 제목과 순서를 맞춰 주세요.');
    if (urls.length > 50) throw new Error('한 번에 최대 50개 글을 처리할 수 있습니다.');
    const articles = urls.map((url: string, index: number) => ({ name: titles[index], url }));
    const description = articles.map((article): string => `${article.name}\n${article.url}`).join('\n\n');
    if (state.route !== 'direct') {
      requestText = state.route === 'request' ? `${property().name} 담당자님께\n\n아래 신규 글의 검색엔진 제출과 접수 결과 확인을 부탁드립니다.\n\n${description}\n\n${String(data.get('note') ?? '').trim()}`.trim() : `우리 블로그에 소개할 고객사 글\n\n${description}\n\n후속 작업: 소개 글 작성 → 링크 추가 → 검토 → 발행`;
      update({ notice: '문구를 준비했습니다. 글 DB 저장·고객사 전달·블로그 발행은 실행하지 않았습니다.' });
      return;
    }
    notifyEnabled = data.get('notify') === 'on';
    if (notifyEnabled && (!property().indexNow?.configured || settingsLoading || settingsError)) throw new Error('IndexNow 설정을 확인하거나 알림 체크를 해제해 글만 저장하세요.');
    const id = property().id;
    if (articles.some((article): boolean => attempted.has(`${id}:${article.url}`))) throw new Error('이미 저장했거나 저장 여부가 불명확한 URL이 포함되어 있습니다. 아래 결과를 확인하고 해당 URL을 입력에서 제외하세요. 자동 재시도하지 않습니다.');
    setPending(true);
    requestText = '';
    outcomesError = null;
    const previous = outcomeHistory.get(id) ?? [];
    const currentUrls = new Set(articles.map((article): string => article.url));
    outcomes = previous.filter((item: PageOutcome): boolean => !currentUrls.has(item.article.url));
    const notify = notifyEnabled;
    const processed = await submitPageBatch(articles, async (article): Promise<PageCreateResult> => {
      return demo ? { page: { id: crypto.randomUUID(), name: article.name, url: article.url }, submission: { status: 'skipped', error_code: 'DEMO_MODE', upstream_http_status: null } } : api.addPage(id, article, notify);
    }, (results): void => {
      outcomes = [...results, ...previous.filter((item: PageOutcome): boolean => !currentUrls.has(item.article.url))];
      outcomeHistory = new Map([...outcomeHistory, [id, outcomes]]);
      attempted = new Set([...attempted, ...results.filter((item: PageOutcome): boolean => item.saveStatus === 'saved' || item.saveStatus === 'unknown').map((item: PageOutcome): string => `${id}:${item.article.url}`)]);
      const live = app.querySelector<HTMLElement>('#live-status');
      if (live) live.textContent = `${results.length}/${articles.length}개 글 처리 결과 확인`;
      const resultView = app.querySelector<HTMLElement>('#batch-results');
      if (resultView) { resultView.innerHTML = outcomeView(); bindErrorActions(resultView); applyAvailability(); }
    });
    pending = false;
    addActivity(`글 ${processed.filter((item: PageOutcome): boolean => item.saveStatus === 'saved').length}개 저장 결과 확인`);
    const incomplete = processed.some((item: PageOutcome): boolean => item.saveStatus !== 'saved' || (!!item.result && !['accepted', 'skipped'].includes(item.result.submission.status)) || item.result?.submission.error_code === 'INDEXNOW_NOT_CONFIGURED');
    const savedCount = processed.filter((item: PageOutcome): boolean => item.saveStatus === 'saved').length;
    update({ notice: demo ? '예시 처리 결과입니다. 실제 DB 저장·전송은 없습니다.' : incomplete ? `${processed.length}개 중 ${savedCount}개 글의 저장이 확인됐습니다. 알림 실패·대기·결과 불명 항목을 아래에서 확인하세요.` : '글 처리를 완료했습니다. 저장 결과와 알림 접수 결과는 아래 표에서 각각 확인하세요.', noticeTone: incomplete ? 'warning' : demo ? 'info' : 'success' });
    dashboardData = null;
    if (!demo) void loadInspectionTargets();
  } catch (error: unknown) {
    showError('#notification-error', error);
  } finally {
    setPending(false);
  }
}

// 새 고객사를 예시 데이터에 추가합니다.
async function addClient(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (pending) return;
  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  const name = String(data.get('clientName') ?? '').trim();
  if (!name) return showError('#client-error', new Error('고객사 이름을 입력하세요.'));
  try {
    setPending(true);
    const result = demo ? { id: crypto.randomUUID(), name, manager_name: String(data.get('manager') ?? '').trim() } : await api.addClient(name, String(data.get('manager') ?? '').trim());
    clients = [...clients, { id: result.id, name: result.name, manager: result.manager_name ?? '' }];
    pending = false;
    form.reset();
    state = { ...state, view: 'dashboard' };
    selectClient(result.id);
    update({ notice: `${result.name}: ${demo ? '예시 목록' : 'DB'}에 고객사를 저장했습니다.` });
  } catch (error: unknown) {
    showError('#client-error', error);
  } finally {
    setPending(false);
  }
}

// 예시 조회 시각만 갱신하고 기존 색인 판정은 유지합니다.
function refreshInspection(): void {
  if (!demo) { void runApiInspection(); return; }
  if (refreshTimer !== undefined) return;
  const button = app.querySelector<HTMLButtonElement>('#refresh-index');
  if (!button) return;
  const propertyId = state.propertyId;
  const engine = state.engine;
  button.disabled = true;
  button.innerHTML = `${icon('refresh', 'rotating')}확인 중…`;
  refreshTimer = setTimeout((): void => {
    const time = now();
    inspections = inspections.map((item: Inspection): Inspection => item.propertyId === propertyId && item.engine === engine ? { ...item, checkedAt: time } : item);
    refreshTimer = undefined;
    addActivity(`${engineNames[engine]} 색인 상태 업데이트 미리보기`);
    if (state.propertyId === propertyId && state.engine === engine) update({ notice: '예시 데이터의 확인 시각을 갱신했습니다. 실제 검색엔진 조회나 색인 변경은 발생하지 않았습니다.' });
  }, 600);
}

// 명시적으로 누른 대상·엔진 한 건만 새로 조회하고 오류 시 이전 관측을 보존합니다.
async function runApiInspection(): Promise<void> {
  if (pending || loading || targetsLoading || inspectionLoading) return;
  const target = inspectionTarget();
  const engine = state.engine;
  const unavailable = inspectionUnavailable(engine, property(), target);
  if (unavailable || !target || engine === 'naver') return;
  setPending(true);
  inspectionError = null;
  const button = app.querySelector<HTMLButtonElement>('#refresh-index');
  if (button) button.innerHTML = `${icon('refresh', 'rotating')}조회 중…`;
  try {
    const result = await api.inspect(target.id, engine);
    storedInspections = [...storedInspections.filter((row: InspectionRead): boolean => row.engine !== engine), result];
    state = { ...state, notice: `${engineNames[engine]} 상태를 조회해 저장했습니다. 제출·수집 요청은 실행하지 않았습니다.` };
    addActivity(`${engineNames[engine]} ${target.name} 상태 조회`);
  } catch (error: unknown) {
    inspectionError = asAppError(error, 'inspect');
    state = { ...state, notice: '' };
    try { storedInspections = await api.getInspections(target.id); } catch { /* 저장 상태를 읽지 못해도 기존 관측과 성공 시각을 유지합니다. */ }
  } finally {
    pending = false;
    render();
    setPending(false);
  }
}

// 사용자가 명시적으로 제출하며 예시 모드에서는 네트워크 요청을 보내지 않습니다.
async function submitSitemap(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const site = property();
  const engine = state.engine;
  if (pending || loading || !site.id || !site.active || engine === 'naver') return;
  const form = event.currentTarget as HTMLFormElement;
  const input = form.querySelector<HTMLInputElement>('#sitemap-url');
  if (!input || !form.reportValidity()) return;
  try {
    const sitemapUrl = parseUrl(input.value.trim());
    if (sitemapUrl.origin !== new URL(site.siteUrl).origin) throw new Error('선택한 사이트와 같은 도메인·프로토콜·포트의 사이트맵 URL을 입력하세요.');
    if (demo) {
      sitemapFeedback = { siteId: site.id, engine, message: '예시 모드입니다. 실제 사이트맵 제출은 실행하지 않았습니다.', failed: false };
      return;
    }
    setPending(true);
    form.querySelector('.sitemap-feedback')?.remove();
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.textContent = '제출 중…';
    await api.submitSitemap(site.id, engine, sitemapUrl.href);
    sitemapFeedback = { siteId: site.id, engine, message: `${engineNames[engine]} 사이트맵 제출 접수 완료. 수집·색인 반영에는 시간이 걸릴 수 있습니다.`, failed: false };
  } catch (error: unknown) {
    const failure = asAppError(error, 'submit');
    const uncertain = ['network', 'timeout', 'response', 'server'].includes(failure.kind);
    const advice = uncertain ? '접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.' : presentError(failure, '').advice;
    sitemapFeedback = { siteId: site.id, engine, message: `${failure.message} ${advice}`, failed: true };
  } finally {
    setPending(false);
    render();
    if (state.view === 'inspect' && state.propertyId === site.id && state.engine === engine) app.querySelector<HTMLElement>('.sitemap-feedback')?.scrollIntoView?.({ block: 'nearest' });
  }
}

// URL 상세 창을 열고 키보드 포커스를 창 안으로 이동합니다.
function openDetail(id: string): void {
  update({ selectedId: id });
  app.querySelector<HTMLButtonElement>('#close-detail')?.focus();
}

// 상세 창을 닫고 해당 URL의 버튼으로 포커스를 복원합니다.
function closeDetail(): void {
  const id = state.selectedId;
  update({ selectedId: null });
  if (id) app.querySelector<HTMLButtonElement>(`[data-inspect="${CSS.escape(id)}"]`)?.focus();
}

// 상세 창에서 탭 키가 배경 화면으로 이동하지 않도록 합니다.
function handleDialogKeyboard(event: KeyboardEvent): void {
  if (!state.selectedId) return;
  if (event.key === 'Escape') closeDetail();
  if (event.key !== 'Tab') return;
  const dialog = app.querySelector<HTMLElement>('.detail-dialog');
  const targets = dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea');
  const first = targets?.[0];
  const last = targets?.[targets.length - 1];
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

// 전달 문구를 복사하고 실패할 경우 선택 가능한 원문을 유지합니다.
async function copyRequest(): Promise<void> {
  try {
    await navigator.clipboard.writeText(requestText);
    const button = app.querySelector<HTMLButtonElement>('#copy-request');
    if (button) button.textContent = '복사했습니다';
  } catch {
    const result = app.querySelector<HTMLElement>('.request-result pre');
    const range = document.createRange();
    if (!result) return;
    range.selectNodeContents(result);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    const button = app.querySelector<HTMLButtonElement>('#copy-request');
    if (button) button.textContent = '선택된 문구를 복사하세요';
  }
}

// 현재 화면의 폼과 탐색 동작을 연결합니다.
function bindEvents(): void {
  bindErrorActions(app);
  app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      capturePublicationDraft();
      update({ view: button.dataset.view as View, notice: '', mobileNav: false });
      if (state.view === 'dashboard') void loadDashboard();
    });
  });
  app.querySelector<HTMLButtonElement>('#menu-toggle')?.addEventListener('click', (): void => {
    state = { ...state, mobileNav: !state.mobileNav };
    app.querySelector<HTMLElement>('.sidebar')?.classList.toggle('open', state.mobileNav);
    app.querySelector<HTMLButtonElement>('#menu-toggle')?.setAttribute('aria-expanded', String(window.matchMedia('(max-width:760px)').matches ? state.mobileNav : !state.mobileNav));
  });
  app.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (event: MouseEvent): void => { event.preventDefault(); update({ view: 'dashboard', mobileNav: false, notice: '' }); void loadDashboard(); });
  app.querySelector<HTMLSelectElement>('#client-select')?.addEventListener('change', (event: Event): void => {
    selectClient((event.target as HTMLSelectElement).value);
  });
  app.querySelector<HTMLSelectElement>('#property-select')?.addEventListener('change', (event: Event): void => {
    selectProperty((event.target as HTMLSelectElement).value);
  });
  app.querySelector<HTMLButtonElement>('#reload-dashboard')?.addEventListener('click', (): void => { void loadDashboard(); });
  app.querySelectorAll<HTMLButtonElement>('[data-dashboard-site]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      state = { ...state, view: 'inspect', mobileNav: false };
      selectProperty(button.dataset.dashboardSite ?? '');
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-engine]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => { if (inspectionError?.operation === 'inspect') inspectionError = null; update({ engine: button.dataset.engine as Engine, filter: 'all', notice: '' }); });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => update({ filter: button.dataset.filter as AppState['filter'] }));
  });
  app.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      capturePublicationDraft();
      requestText = '';
      update({ route: button.dataset.route as NotifyRoute, notice: '' });
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => openDetail(button.dataset.inspect ?? ''));
  });
  app.querySelector<HTMLFormElement>('#registration-form')?.addEventListener('submit', registerSite);
  app.querySelector<HTMLFormElement>('#indexnow-form')?.addEventListener('submit', saveIndexNowSettings);
  app.querySelector<HTMLFormElement>('#notification-form')?.addEventListener('submit', notifyPublication);
  app.querySelector<HTMLFormElement>('#client-form')?.addEventListener('submit', addClient);
  app.querySelector<HTMLButtonElement>('#reload-data')?.addEventListener('click', (): void => { void loadWorkspace(); });
  app.querySelector<HTMLButtonElement>('#reload-inspection-targets')?.addEventListener('click', (): void => { void loadInspectionTargets(); });
  app.querySelector<HTMLButtonElement>('#read-inspection')?.addEventListener('click', (): void => { void loadStoredInspections(); });
  app.querySelector<HTMLSelectElement>('#inspection-target-select')?.addEventListener('change', (event: Event): void => {
    inspectionTargetId = (event.target as HTMLSelectElement).value;
    storedInspections = [];
    state = { ...state, notice: '' };
    void loadStoredInspections();
  });
  app.querySelector<HTMLInputElement>('#notify-enabled')?.addEventListener('change', (event: Event): void => {
    notifyEnabled = (event.target as HTMLInputElement).checked;
    applyAvailability();
  });
  app.querySelector<HTMLFormElement>('#url-search')?.addEventListener('submit', inspectUrl);
  app.querySelector<HTMLInputElement>('#url-inspect')?.addEventListener('input', (event: Event): void => (event.target as HTMLInputElement).setCustomValidity(''));
  app.querySelector<HTMLButtonElement>('#refresh-index')?.addEventListener('click', refreshInspection);
  app.querySelector<HTMLButtonElement>('#toggle-sitemap')?.addEventListener('click', (): void => { sitemapOpen = !sitemapOpen; render(); if (sitemapOpen) app.querySelector<HTMLInputElement>('#sitemap-url')?.focus(); });
  app.querySelector<HTMLButtonElement>('#close-sitemap')?.addEventListener('click', (): void => { sitemapOpen = false; render(); app.querySelector<HTMLButtonElement>('#toggle-sitemap')?.focus(); });
  app.querySelector<HTMLFormElement>('#sitemap-form')?.addEventListener('submit', (event: SubmitEvent): void => { void submitSitemap(event); });
  app.querySelector<HTMLButtonElement>('#dismiss-notice')?.addEventListener('click', (): void => {
    state = { ...state, notice: '' };
    app.querySelector<HTMLElement>('.success-notice')?.remove();
  });
  app.querySelector<HTMLButtonElement>('#close-detail')?.addEventListener('click', closeDetail);
  app.querySelector<HTMLButtonElement>('#copy-request')?.addEventListener('click', (): void => { void copyRequest(); });
  app.querySelector<HTMLElement>('#detail-backdrop')?.addEventListener('click', (event: MouseEvent): void => { if (event.target === event.currentTarget) closeDetail(); });
}

document.addEventListener('keydown', handleDialogKeyboard);
render();
if (!demo) void loadWorkspace();
