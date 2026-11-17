import { inspectionTime } from './inspection/format.ts';
import type { Client, ClientDashboard, DashboardSite, Engine, EngineSummary, Inspection, InspectionRead, Property } from './types';
import { escapeHtml } from './html.ts';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const ENGINES = ['google', 'naver', 'bing'] as const;

// 저장된 색인 상태의 표시 문구 (엔진 요약과 메인 사이트 상태에서 함께 사용)
const INDEX_STATUS_LABELS: Readonly<Record<InspectionRead['index_status'], string>> = {
  indexed: '색인 확인',
  not_indexed: '미색인 확인',
  crawled: '크롤링 확인 · 색인 미확인',
  submitted: '알림 접수 · 이후 미확인',
  unknown: '미확인',
  failed: '처리 오류 상태',
};

// 엔진 요약에서 개수를 보여주는 상태 순서
const SUMMARY_STATUS_ORDER = ['indexed', 'not_indexed', 'crawled', 'submitted', 'unknown', 'failed'] as const;

// ─────────────────────────────────────────────────────────────
// 선택 범위
// ─────────────────────────────────────────────────────────────

// 선택 고객사 소속 사이트만 반환합니다.
export function clientProperties(
  properties: readonly Property[],
  clientId: string,
): readonly Property[] {
  return properties.filter((item: Property): boolean => item.clientId === clientId);
}

// 고객사 변경 시 이전 고객사의 사이트 ID가 남지 않도록 선택 범위를 정합니다.
export function clientSelection(
  properties: readonly Property[],
  clientId: string,
  preferred = '',
): { readonly clientId: string; readonly propertyId: string } {
  const sites = clientProperties(properties, clientId);
  const preferredSite = sites.find((site: Property): boolean => site.id === preferred);
  return { clientId, propertyId: preferredSite?.id ?? sites[0]?.id ?? '' };
}

// ─────────────────────────────────────────────────────────────
// 대시보드 HTML
// ─────────────────────────────────────────────────────────────

// 엔진별 글 상태를 독립적으로 표시하며 오류는 상태와 겹칠 수 있음을 안내합니다.
function engineReport(engine: string, summary: EngineSummary, total: number): string {
  const counts = SUMMARY_STATUS_ORDER
    .map((status): string => `<div><dt>${INDEX_STATUS_LABELS[status]}</dt><dd>${summary[status]}<span>개</span></dd></div>`)
    .join('');
  return `<section class="report dashboard-engine"><div class="report-header"><h2>${engine} · 등록 글 상태</h2><span class="muted small">${total}개 글</span></div><dl class="engine-counts">${counts}</dl><p class="dashboard-note">최근 조회 오류 ${summary.error_count}개 · 이전 성공 상태와 중복될 수 있습니다.</p><p class="dashboard-note">글 최근 성공 관측: ${escapeHtml(inspectionTime(summary.last_checked_at))}</p></section>`;
}

// 메인 URL의 마지막 성공 관측과 최근 오류를 독립적으로 표시합니다.
function mainPageStatus(observation: InspectionRead | null): string {
  // 성공 관측이 한 번도 없으면 상태값이 있어도 "미확인"으로 봅니다.
  const status = observation?.last_checked_at ? observation.index_status : 'unknown';
  const noRecord = observation ? '' : ' · 검사 기록 없음';
  const lastChecked = escapeHtml(inspectionTime(observation?.last_checked_at ?? null));
  const error = observation?.error_message
    ? `<span class="small main-page-error">최근 조회 오류: ${escapeHtml(observation.error_message)}</span>`
    : '';
  return `<div class="main-page-observation"><strong class="main-page-status">${INDEX_STATUS_LABELS[status]}${noRecord}</strong><span class="small muted">최근 성공 관측: ${lastChecked}</span>${error}</div>`;
}

// 사이트 이름과 비활성 표시
function siteTitle(site: DashboardSite): string {
  return `${escapeHtml(site.name)}${site.is_active ? '' : ' (비활성)'}`;
}

// 블로그 하나의 메인 URL과 세 엔진의 저장 관측을 한 행으로 표시합니다.
function mainPageRow(site: DashboardSite): string {
  const observations = site.main_page;
  const cells = observations
    ? ENGINES.map((engine): string => `<td>${mainPageStatus(observations[engine])}</td>`).join('')
    : '<td colspan="3">메인 사이트 상태를 확인하려면 서버 업데이트 후 통계를 새로고침하세요.</td>';
  return `<tr data-main-site="${escapeHtml(site.id)}">
    <th scope="row"><button class="url-button" data-dashboard-site="${escapeHtml(site.id)}">
      <strong>${siteTitle(site)}</strong>
      <span class="url-title">${escapeHtml(site.url)}</span>
    </button></th>${cells}</tr>`;
}

// 메인 사이트는 글 통계와 분리하고 이전 서버 응답의 필드 누락을 안내합니다.
function mainPageReport(data: ClientDashboard): string {
  if (!data.sites.length) return '';
  return `<section class="report main-page-report" aria-labelledby="main-page-heading">
    <div class="report-header"><div><h2 id="main-page-heading">메인 사이트 상태</h2>
      <p>등록된 메인 URL의 저장 결과입니다. 개별 글 통계와 별도로 표시합니다.</p>
    </div></div>
    <div class="table-scroll"><table class="dashboard-table main-page-table">
      <thead><tr><th scope="col">메인 사이트</th><th scope="col">Google</th><th scope="col">네이버</th><th scope="col">Bing</th></tr></thead>
      <tbody>${data.sites.map(mainPageRow).join('')}</tbody>
    </table></div>
    <p class="dashboard-note">전체 조회는 활성 메인 사이트와 활성 글을 검사합니다. 비활성 사이트는 이전 저장 결과만 표시합니다.</p>
  </section>`;
}

// 상단 요약 카드 5개 (블로그 수, 글 수, 엔진별 색인 확인 수)
function summaryCards(data: ClientDashboard): string {
  const cards = [
    ['등록 블로그', data.site_count],
    ['등록 글', data.page_count],
    ['Google 색인 확인', data.google.indexed],
    ['네이버 색인 확인', data.naver.indexed],
    ['Bing 색인 확인', data.bing.indexed],
  ] as const;
  return cards
    .map(([label, count]): string => `<section class="dashboard-card"><h2>${label}</h2><p>${count}<span>개</span></p></section>`)
    .join('');
}

// 블로그별 현황 표의 한 행
function siteRow(site: DashboardSite): string {
  const lastChecked = ENGINES
    .map((engine): string => `${engine === 'naver' ? '네이버' : engine === 'google' ? 'Google' : 'Bing'}: ${escapeHtml(inspectionTime(site[engine].last_checked_at))}`)
    .join('<br>');
  return `<tr><td><button class="url-button" data-dashboard-site="${escapeHtml(site.id)}"><strong>${siteTitle(site)}</strong><span class="url-title">${escapeHtml(site.url)}</span></button></td><td>${site.page_count}개</td><td>${site.google.indexed}개</td><td>${site.naver.indexed}개</td><td>${site.bing.indexed}개</td><td class="small">${lastChecked}</td></tr>`;
}

// 블로그별 현황 표. 블로그가 없으면 등록 안내를 보여줍니다.
function sitesSection(sites: readonly DashboardSite[]): string {
  const body = sites.length
    ? `<div class="table-scroll"><table class="dashboard-table"><thead><tr><th scope="col">블로그</th><th scope="col">등록 글</th><th scope="col">Google 색인 확인</th><th scope="col">네이버 색인 확인</th><th scope="col">Bing 색인 확인</th><th scope="col">글 최근 성공 관측</th></tr></thead><tbody>${sites.map(siteRow).join('')}</tbody></table></div>`
    : '<div class="empty-state">등록된 블로그가 없습니다.<p>사이트 등록 메뉴에서 첫 블로그를 추가하세요.</p><button class="button primary" data-view="register">사이트 등록</button></div>';
  return `<section class="report"><div class="report-header"><div><h2>블로그별 현황</h2><p>블로그를 선택하면 색인 상태 화면으로 이동합니다.</p></div></div>${body}</section>`;
}

// 메인 사이트 관측과 고객사 전체 글 요약·블로그별 상세 이동 표를 표시합니다.
export function dashboardContent(data: ClientDashboard): string {
  return `${mainPageReport(data)}<div class="dashboard-cards">${summaryCards(data)}</div>
    <p class="dashboard-note dashboard-scope">등록된 글 기준 · 메인페이지 제외 · 비활성 블로그와 글 포함 · 저장된 최신 관측을 집계합니다.</p>
    <div class="dashboard-engines">${engineReport('Google', data.google, data.page_count)}${engineReport('네이버', data.naver, data.page_count)}${engineReport('Bing', data.bing, data.page_count)}</div>
    ${sitesSection(data.sites)}
    <div class="explanation"><p>네이버는 작업 탭에서 확인해 저장한 상태를 집계합니다. Bing 크롤링 확인은 색인 완료를 의미하지 않습니다. 이 대시보드는 새 검사 없이 DB에 저장된 결과만 보여줍니다.</p></div>`;
}

// ─────────────────────────────────────────────────────────────
// 데모 모드 집계
// ─────────────────────────────────────────────────────────────

// 두 검사 기록 중 더 최근에 확인한 것을 고릅니다.
function laterInspection(previous: Inspection | undefined, item: Inspection): Inspection {
  if (!previous) return item;
  return Date.parse(item.checkedAt) > Date.parse(previous.checkedAt) ? item : previous;
}

// 메인 URL의 엔진별 최신 관측을 고르고 수집 대기는 검사 기록에서 제외합니다.
function demoMainObservation(inspections: readonly Inspection[], siteId: string, engine: Engine): InspectionRead | null {
  const latest = inspections
    .filter((item): boolean => item.propertyId === siteId && item.path === '/' && item.engine === engine && item.status !== 'waiting')
    .reduce<Inspection | undefined>(laterInspection, undefined);
  // 수집 대기는 위 필터에서 이미 제외됐지만, 상태 타입에서 'waiting'을 빼기 위해 한 번 더 확인합니다.
  if (!latest || latest.status === 'waiting') return null;

  return {
    site_id: siteId,
    engine,
    index_status: latest.status,
    last_checked_at: latest.checkedAt,
    next_check_at: null,
    error_message: null,
    error_code: null,
  };
}

// 글(메인 URL 제외)의 엔진별 상태 집계. 예시 상태의 수집 대기는 실제 관측으로 간주하지 않습니다.
function demoEngineSummary(rows: readonly Inspection[], pathCount: number, engine: Engine): EngineSummary {
  const observed = rows.filter((item): boolean => item.engine === engine);
  const countStatus = (status: Inspection['status']): number =>
    observed.filter((item): boolean => item.status === status).length;
  const observedCount = observed.filter((item): boolean => item.status !== 'waiting').length;

  return {
    indexed: countStatus('indexed'),
    not_indexed: countStatus('not_indexed'),
    crawled: countStatus('crawled'),
    submitted: 0,
    failed: 0,
    unknown: pathCount - observedCount,
    error_count: 0,
    last_checked_at: null,
  };
}

// 예시 사이트 하나의 대시보드 행을 만듭니다.
function demoSite(site: Property, inspections: readonly Inspection[]): DashboardSite {
  const rows = inspections.filter((item): boolean => item.propertyId === site.id && item.path !== '/');
  const pathCount = new Set(rows.map((item): string => item.path)).size;

  return {
    id: site.id,
    name: site.name,
    url: site.siteUrl,
    is_active: site.active,
    page_count: pathCount,
    google: demoEngineSummary(rows, pathCount, 'google'),
    naver: demoEngineSummary(rows, pathCount, 'naver'),
    bing: demoEngineSummary(rows, pathCount, 'bing'),
    main_page: {
      google: demoMainObservation(inspections, site.id, 'google'),
      naver: demoMainObservation(inspections, site.id, 'naver'),
      bing: demoMainObservation(inspections, site.id, 'bing'),
    },
  };
}

// 사이트들의 한 엔진 집계를 합칩니다.
function sumSummaries(sites: readonly DashboardSite[], engine: Engine): EngineSummary {
  const total = (key: 'indexed' | 'not_indexed' | 'crawled' | 'unknown'): number =>
    sites.reduce((sum, site): number => sum + site[engine][key], 0);

  return {
    indexed: total('indexed'),
    not_indexed: total('not_indexed'),
    crawled: total('crawled'),
    unknown: total('unknown'),
    submitted: 0,
    failed: 0,
    error_count: 0,
    last_checked_at: null,
  };
}

// 예시 모드도 메인 관측과 글 통계를 분리하고 실제 외부 요청은 하지 않습니다.
export function demoDashboard(
  client: Client,
  properties: readonly Property[],
  inspections: readonly Inspection[],
): ClientDashboard {
  const sites = clientProperties(properties, client.id).map((site): DashboardSite => demoSite(site, inspections));

  return {
    client: { id: client.id, name: client.name, manager_name: client.manager || null },
    site_count: sites.length,
    page_count: sites.reduce((sum, site): number => sum + site.page_count, 0),
    google: sumSummaries(sites, 'google'),
    naver: sumSummaries(sites, 'naver'),
    bing: sumSummaries(sites, 'bing'),
    sites,
  };
}
