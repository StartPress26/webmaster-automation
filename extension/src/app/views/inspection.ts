import { ENGINE_NAMES, engineSymbol } from '../../engines/labels.ts';
import { ApiError } from '../../errors.ts';
import { escapeHtml } from '../../html.ts';
import { inspectionStatusNames, inspectionTime } from '../../inspection/format.ts';
import { icon, statusNames } from '../constants.ts';
import { errorPanel } from '../form-errors.ts';
import { currentRows, demo, inspectionTarget, property, store } from '../store.ts';
import { clientInspectionPanel } from './dashboard.ts';
import { sitePicker } from './shell.ts';
import type { Engine, IndexStatus, Inspection, InspectionRead, InspectionTarget } from '../../types.ts';

// 색인 상태 확인 화면 (예시 모드·API 모드)

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const ENGINES = ['google', 'naver', 'bing'] as const;
// 상태 요약 칸의 표시 순서
const SUMMARY_STATUSES = ['indexed', 'waiting', 'crawled', 'not_indexed'] as const;

// 엔진별 저장 결과 설명
const ENGINE_EXPLANATIONS: Readonly<Record<Engine, string>> = {
  naver: '고객사 전체 조회에서 네이버 사이트·URL별 GUI 검사를 수행하고 최신 결과를 저장합니다.',
  bing: 'Bing은 API로 크롤링 상태, GUI로 색인 상태를 조회합니다. 같은 대상의 가장 최근 관측을 표시합니다.',
  google: 'Google URL Inspection API로 저장된 색인 상태를 조회합니다. URL 제출이나 색인 요청은 실행하지 않습니다.',
};

// ─────────────────────────────────────────────────────────────
// 두 모드가 함께 쓰는 조각
// ─────────────────────────────────────────────────────────────

// 예시 상태임을 명시한 검색엔진 선택 탭을 표시합니다.
function engines(): string {
  const tabs = ENGINES.map((engine: Engine): string => {
    const active = store.state.engine === engine;
    return `<button data-engine="${engine}" class="engine-tab ${active ? 'active' : ''}" aria-pressed="${active}"><span class="engine-symbol ${engine}">${engineSymbol(engine)}</span>${ENGINE_NAMES[engine]}</button>`;
  }).join('');
  return `<div class="engine-tabs" role="group" aria-label="조회할 검색엔진">${tabs}</div>`;
}

// 저장 결과 필터의 사이트·엔진에 맞는 별도 사이트맵 제출 버튼을 표시합니다. 네이버는 지원하지 않습니다.
function inspectionActions(): string {
  const isNaver = store.state.engine === 'naver';
  const expanded = store.sitemapOpen && !isNaver;
  const hint = isNaver ? 'title="사이트맵 제출은 Google과 Bing만 지원합니다."' : '';
  return `<div class="inspection-actions"><button class="button secondary" id="toggle-sitemap" aria-expanded="${expanded}" aria-controls="sitemap-panel" ${hint}>${icon('send')}사이트맵 제출</button></div>`;
}

// 현재 사이트·엔진에 대한 사이트맵 제출 결과 안내 (다른 사이트·엔진의 결과는 보여주지 않음)
function sitemapFeedbackHtml(siteId: string): string {
  const feedback = store.sitemapFeedback;
  if (!feedback || feedback.siteId !== siteId || feedback.engine !== store.state.engine) return '';
  const cls = feedback.failed ? 'inspection-error' : '';
  const role = feedback.failed ? 'alert' : 'status';
  return `<p class="sitemap-feedback ${cls}" role="${role}">${escapeHtml(feedback.message)}</p>`;
}

// 메인 사이트와 선택한 검색엔진을 명시하고 공개 사이트맵 주소를 입력받습니다.
function sitemapForm(): string {
  const site = property();
  const engineName = ENGINE_NAMES[store.state.engine];
  const hidden = store.sitemapOpen && store.state.engine !== 'naver' ? '' : 'hidden';
  const suggestion = site.siteUrl ? new URL('sitemap.xml', site.siteUrl).href : '';
  const submitLabel = `${engineName}에 제출${demo ? ' · 예시' : ''}`;
  return `<section id="sitemap-panel" class="report sitemap-panel" ${hidden} aria-labelledby="sitemap-title"><div class="report-header"><div><h2 id="sitemap-title">${engineName} 사이트맵 제출</h2><p>선택한 글과 관계없이 ${escapeHtml(site.name)} 사이트 전체에 제출합니다.</p></div><button class="icon-button" id="close-sitemap" aria-label="사이트맵 제출 닫기">${icon('close')}</button></div><form id="sitemap-form" class="sitemap-form"><label for="sitemap-url">사이트맵 URL</label><div class="sitemap-input-row"><input id="sitemap-url" name="sitemapUrl" type="url" required maxlength="2048" value="${escapeHtml(suggestion)}" placeholder="https://example.com/sitemap.xml" aria-describedby="sitemap-help"><button class="button primary" type="submit">${submitLabel}</button></div><p id="sitemap-help" class="field-help">실제 사이트맵 주소를 확인하세요. 새 글이 사이트맵에 먼저 반영되어 있어야 하며, 접수 성공이 색인 완료를 의미하지 않습니다.</p>${sitemapFeedbackHtml(site.id)}</form></section>`;
}

// 두 모드 공통의 화면 머리: 제목, 전체 조회 패널, 저장 결과 제목, 블로그·엔진 선택, 사이트맵 폼
function inspectionHead(subtitle: string): string {
  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>${subtitle}</p></div>${inspectionActions()}</div>
    ${clientInspectionPanel()}
    <div class="inspection-saved-heading"><h2>저장된 결과</h2><p>블로그와 검색엔진을 선택해 URL별 관측 결과를 확인하세요.</p></div>
    ${sitePicker()}
    ${engines()}
    ${sitemapForm()}`;
}

// ─────────────────────────────────────────────────────────────
// 예시 모드
// ─────────────────────────────────────────────────────────────

// Google 인증 오류 화면 예시 (?error=auth)
function authErrorPreview(): string {
  const example = new ApiError(
    503,
    'Google API 인증 갱신에 실패했습니다. 서버 연결 상태 또는 OAuth 재인증을 확인하세요.',
    { code: 'GOOGLE_AUTH_REFRESH_FAILED', operation: 'inspect' },
  );
  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>Google 인증 오류 화면 예시 · 실제 요청은 실행하지 않습니다.</p></div></div><section class="report error-preview"><div class="report-header"><h2>최근 조회 오류</h2></div>${errorPanel(example, 'Google 상태를 조회하지 못했습니다')}<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p></section>`;
}

// 상태별 페이지 수 요약 칸 (클릭하면 그 상태로 필터)
function summaryCell(status: IndexStatus, rows: readonly Inspection[]): string {
  const selected = store.state.filter === status;
  const count = rows.filter((row: Inspection): boolean => row.status === status).length;
  return `<button class="summary-cell ${status} ${selected ? 'selected' : ''}" data-filter="${status}" aria-pressed="${selected}"><span class="summary-label"><span class="status-dot"></span>${statusNames[status]}</span><strong>${count}<span>페이지</span></strong></button>`;
}

// 필터 해제 버튼과 안내
function filterToolbar(visibleCount: number): string {
  const filter = store.state.filter;
  const label = filter === 'all' ? '전체 페이지' : `${statusNames[filter]} · 전체 보기`;
  const chosen = filter === 'all' ? 'chosen' : '';
  return `<div class="table-toolbar"><button class="filter-reset ${chosen}" data-filter="all">${label}<span>${visibleCount}</span></button><span class="muted small">URL을 선택하면 상세 상태를 확인할 수 있습니다</span></div>`;
}

// URL 표의 한 줄
function urlRow(row: Inspection): string {
  return `<tr><td><button class="url-button" data-inspect="${row.id}"><span>${escapeHtml(property().origin + row.path)}</span><span class="url-title">${escapeHtml(row.title)}</span></button></td><td><span class="status-pill ${row.status}"><span class="status-dot"></span>${statusNames[row.status]}</span></td><td class="date-cell">${escapeHtml(row.crawledAt ?? '아직 확인되지 않음')}</td><td><button class="icon-button" data-inspect="${row.id}" aria-label="${escapeHtml(row.path)} 상세 보기">${icon('chevron')}</button></td></tr>`;
}

// 색인 상태 요약과 필터 가능한 URL 목록을 표시합니다.
export function inspectionView(): string {
  if (!demo) return apiInspectionView();
  if (new URLSearchParams(window.location.search).get('error') === 'auth') return authErrorPreview();

  const rows = currentRows();
  const visible = rows.filter(
    (row: Inspection): boolean => store.state.filter === 'all' || row.status === store.state.filter,
  );
  const lastUpdated = escapeHtml(rows[0]?.checkedAt ?? '조회 기록 없음');
  const summary = SUMMARY_STATUSES.map((status: IndexStatus): string => summaryCell(status, rows)).join('');
  const emptyState = visible.length === 0 ? '<div class="empty-state">이 조건의 조회 기록이 없습니다.<p>다른 검색엔진이나 상태를 선택해 보세요.</p></div>' : '';

  return `${inspectionHead('검색엔진이 내 사이트의 페이지를 어떻게 보고 있는지 확인하세요.')}
    <section class="report" aria-labelledby="report-title">
      <div class="report-header"><div><h2 id="report-title">페이지 색인 상태</h2><p>선택한 사이트의 URL별 관측 결과</p></div><span class="muted small">${icon('clock')}<span id="last-updated">${lastUpdated}</span></span></div>
      <div class="status-summary">${summary}</div>
      ${filterToolbar(visible.length)}
      <div class="table-scroll"><table class="url-table"><thead><tr><th scope="col">페이지 URL</th><th scope="col">색인 상태</th><th scope="col">마지막 크롤링</th><th scope="col"><span class="visually-hidden">상세 보기</span></th></tr></thead><tbody>${visible.map(urlRow).join('')}</tbody></table></div>
      ${emptyState}
      <div class="table-footer"><span>예시 관측 데이터</span><span>${visible.length}개 페이지</span></div>
    </section>
    <div class="explanation">${icon('info')}<p>색인 상태 조회는 관측 결과를 새로 확인하는 작업입니다. 사이트맵 제출은 수집이나 색인 완료를 의미하지 않습니다.</p></div>`;
}

// ─────────────────────────────────────────────────────────────
// API 모드
// ─────────────────────────────────────────────────────────────

// 검사 대상 선택 상자의 option 목록
function targetOptions(): string {
  if (!store.inspectionTargets.length) return '<option value="">사이트를 먼저 등록하거나 선택하세요</option>';
  return store.inspectionTargets.map((item: InspectionTarget): string => {
    const selected = item.id === store.inspectionTargetId ? 'selected' : '';
    const kind = item.type === 'site' ? '메인페이지' : '글';
    const inactive = item.active ? '' : ' (비활성)';
    return `<option value="${escapeHtml(item.id)}" ${selected}>${kind} · ${escapeHtml(item.name)}${inactive} — ${escapeHtml(item.url)}</option>`;
  }).join('');
}

// 저장된 관측에 과거 오류 메시지가 있으면 오류 객체로 바꿉니다.
function previousErrorOf(observation: InspectionRead | undefined): ApiError | null {
  if (!observation?.error_message) return null;
  return new ApiError(0, observation.error_message, {
    code: observation.error_code ?? 'SAVED_INSPECTION_ERROR',
    operation: 'inspect',
  });
}

// 저장된 상태 영역의 본문: 관측 카드 / 오류만 있음 / 로딩 중 / 기록 없음
function savedResultBody(observation: InspectionRead | undefined, failure: ApiError | null, loading: boolean): string {
  if (observation && (!failure || observation.last_checked_at)) {
    const indexed = !failure && observation.index_status === 'indexed';
    const note = failure ? '이전 성공 관측 결과입니다. 이번 조회의 성공을 의미하지 않습니다.' : '검색엔진에서 확인해 DB에 저장한 요약 상태입니다.';
    return `<div class="detail-result ${indexed ? 'indexed' : ''}">${icon(indexed ? 'check' : 'info')}<div><h3>${inspectionStatusNames[observation.index_status]}</h3><p>${note}</p></div></div><dl class="property-facts"><div><dt>마지막 성공 관측</dt><dd>${escapeHtml(inspectionTime(observation.last_checked_at))}</dd></div></dl>`;
  }
  if (failure) return '<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p>';
  if (loading) return '';
  return '<div class="empty-state">아직 저장된 조회 결과가 없습니다.<p>조회 기록이 없다는 것은 미색인을 의미하지 않습니다.</p></div>';
}

// 전체 실행과 구분되는 개별 URL의 저장 관측 결과를 표시합니다.
function apiInspectionView(): string {
  const engineName = ENGINE_NAMES[store.state.engine];
  const target = inspectionTarget();
  const observation = store.storedInspections.find(
    (item: InspectionRead): boolean => item.site_id === store.inspectionTargetId && item.engine === store.state.engine,
  );
  const failure = store.inspectionError ?? previousErrorOf(observation);
  const loading = store.inspectionLoading || store.targetsLoading;

  const targetsError = store.targetsError ? errorPanel(store.targetsError, '글 목록을 불러오지 못했습니다', 'targets') : '';
  const resultTitle = failure ? '최근 조회 오류' : `저장된 ${engineName} 상태`;
  const readButton = failure ? '' : '<button class="button secondary" id="read-inspection">저장 결과 다시 읽기</button>';
  const loadingNote = loading ? '<p role="status">저장된 결과를 불러오는 중…</p>' : '';
  const failurePanel = failure
    ? errorPanel(failure, `${engineName} ${failure.operation === 'read' ? '저장 결과를 읽지 못했습니다' : '상태를 조회하지 못했습니다'}`, 'saved')
    : '';

  return `${inspectionHead('블로그·메인페이지·글·엔진을 선택해 저장된 상태를 확인하세요.')}
    <section class="report"><div class="report-header"><div><h2>검사 대상</h2><p>대상 선택은 저장 상태만 읽습니다. 전체 조회는 고객사 전체 색인 조회 버튼으로 실행합니다.</p></div><button class="button secondary" id="reload-inspection-targets">${icon('refresh')}대상 목록 새로고침</button></div>
    <div class="inspection-controls"><label for="inspection-target-select">메인페이지 / 글</label><select id="inspection-target-select">${targetOptions()}</select><p class="small muted">${escapeHtml(target?.url ?? '')}</p></div>
    ${targetsError}
    <div class="inspection-body"><div class="report-header"><h2>${resultTitle}</h2>${readButton}</div>
    ${loadingNote}
    ${failurePanel}
    ${savedResultBody(observation, failure, loading)}
    <div class="inline-note">${escapeHtml(ENGINE_EXPLANATIONS[store.state.engine])}</div>
    <p class="field-help">이 API는 크롤링 시각·제출 이력의 상세 필드를 제공하지 않습니다. 확인되지 않은 단계를 완료로 표시하지 않습니다.</p></div></section>`;
}
