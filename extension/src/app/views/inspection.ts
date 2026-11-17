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

// 예시 상태임을 명시한 검색엔진 선택 탭을 표시합니다.
function engines(): string {
  return `<div class="engine-tabs" role="group" aria-label="조회할 검색엔진">${(['google', 'naver', 'bing'] as const).map((engine: Engine): string => `<button data-engine="${engine}" class="engine-tab ${store.state.engine === engine ? 'active' : ''}" aria-pressed="${store.state.engine === engine}"><span class="engine-symbol ${engine}">${engineSymbol(engine)}</span>${ENGINE_NAMES[engine]}</button>`).join('')}</div>`;
}

// 색인 상태 요약과 필터 가능한 URL 목록을 표시합니다.
export function inspectionView(): string {
  if (!demo) return apiInspectionView();

  if (new URLSearchParams(window.location.search).get('error') === 'auth') {
    const example = new ApiError(
      503,
      'Google API 인증 갱신에 실패했습니다. 서버 연결 상태 또는 OAuth 재인증을 확인하세요.',
      { code: 'GOOGLE_AUTH_REFRESH_FAILED', operation: 'inspect' },
    );
    return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>Google 인증 오류 화면 예시 · 실제 요청은 실행하지 않습니다.</p></div></div><section class="report error-preview"><div class="report-header"><h2>최근 조회 오류</h2></div>${errorPanel(example, 'Google 상태를 조회하지 못했습니다')}<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p></section>`;
  }

  const rows = currentRows();
  const visible = rows.filter(
    (row: Inspection): boolean => store.state.filter === 'all' || row.status === store.state.filter,
  );

  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>검색엔진이 내 사이트의 페이지를 어떻게 보고 있는지 확인하세요.</p></div>${inspectionActions()}</div>
    ${clientInspectionPanel()}
    <div class="inspection-saved-heading"><h2>저장된 결과</h2><p>블로그와 검색엔진을 선택해 URL별 관측 결과를 확인하세요.</p></div>
    ${sitePicker()}
    ${engines()}
    ${sitemapForm()}
    <section class="report" aria-labelledby="report-title">
      <div class="report-header"><div><h2 id="report-title">페이지 색인 상태</h2><p>선택한 사이트의 URL별 관측 결과</p></div><span class="muted small">${icon('clock')}<span id="last-updated">${escapeHtml(rows[0]?.checkedAt ?? '조회 기록 없음')}</span></span></div>
      <div class="status-summary">${(['indexed', 'waiting', 'crawled', 'not_indexed'] as const).map((status: IndexStatus): string => `<button class="summary-cell ${status} ${store.state.filter === status ? 'selected' : ''}" data-filter="${status}" aria-pressed="${store.state.filter === status}"><span class="summary-label"><span class="status-dot"></span>${statusNames[status]}</span><strong>${rows.filter((row: Inspection): boolean => row.status === status).length}<span>페이지</span></strong></button>`).join('')}</div>
      <div class="table-toolbar"><button class="filter-reset ${store.state.filter === 'all' ? 'chosen' : ''}" data-filter="all">${store.state.filter === 'all' ? '전체 페이지' : `${statusNames[store.state.filter]} · 전체 보기`}<span>${visible.length}</span></button><span class="muted small">URL을 선택하면 상세 상태를 확인할 수 있습니다</span></div>
      <div class="table-scroll"><table class="url-table"><thead><tr><th scope="col">페이지 URL</th><th scope="col">색인 상태</th><th scope="col">마지막 크롤링</th><th scope="col"><span class="visually-hidden">상세 보기</span></th></tr></thead><tbody>${visible.map((row: Inspection): string => `<tr><td><button class="url-button" data-inspect="${row.id}"><span>${escapeHtml(property().origin + row.path)}</span><span class="url-title">${escapeHtml(row.title)}</span></button></td><td><span class="status-pill ${row.status}"><span class="status-dot"></span>${statusNames[row.status]}</span></td><td class="date-cell">${escapeHtml(row.crawledAt ?? '아직 확인되지 않음')}</td><td><button class="icon-button" data-inspect="${row.id}" aria-label="${escapeHtml(row.path)} 상세 보기">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>
      ${visible.length === 0 ? '<div class="empty-state">이 조건의 조회 기록이 없습니다.<p>다른 검색엔진이나 상태를 선택해 보세요.</p></div>' : ''}
      <div class="table-footer"><span>예시 관측 데이터</span><span>${visible.length}개 페이지</span></div>
    </section>
    <div class="explanation">${icon('info')}<p>색인 상태 조회는 관측 결과를 새로 확인하는 작업입니다. 사이트맵 제출은 수집이나 색인 완료를 의미하지 않습니다.</p></div>`;
}

// 저장 결과 필터의 사이트·엔진에 맞는 별도 사이트맵 제출 버튼을 표시합니다.
function inspectionActions(): string {
  return `<div class="inspection-actions"><button class="button secondary" id="toggle-sitemap" aria-expanded="${store.sitemapOpen && store.state.engine !== 'naver'}" aria-controls="sitemap-panel" ${store.state.engine === 'naver' ? 'title="사이트맵 제출은 Google과 Bing만 지원합니다."' : ''}>${icon('send')}사이트맵 제출</button></div>`;
}

// 메인 사이트와 선택한 검색엔진을 명시하고 공개 사이트맵 주소를 입력받습니다.
function sitemapForm(): string {
  const site = property();
  const feedback =
    store.sitemapFeedback?.siteId === site.id && store.sitemapFeedback.engine === store.state.engine
      ? store.sitemapFeedback
      : null;
  const suggestion = site.siteUrl ? new URL('sitemap.xml', site.siteUrl).href : '';
  return `<section id="sitemap-panel" class="report sitemap-panel" ${store.sitemapOpen && store.state.engine !== 'naver' ? '' : 'hidden'} aria-labelledby="sitemap-title"><div class="report-header"><div><h2 id="sitemap-title">${ENGINE_NAMES[store.state.engine]} 사이트맵 제출</h2><p>선택한 글과 관계없이 ${escapeHtml(site.name)} 사이트 전체에 제출합니다.</p></div><button class="icon-button" id="close-sitemap" aria-label="사이트맵 제출 닫기">${icon('close')}</button></div><form id="sitemap-form" class="sitemap-form"><label for="sitemap-url">사이트맵 URL</label><div class="sitemap-input-row"><input id="sitemap-url" name="sitemapUrl" type="url" required maxlength="2048" value="${escapeHtml(suggestion)}" placeholder="https://example.com/sitemap.xml" aria-describedby="sitemap-help"><button class="button primary" type="submit">${ENGINE_NAMES[store.state.engine]}에 제출${demo ? ' · 예시' : ''}</button></div><p id="sitemap-help" class="field-help">실제 사이트맵 주소를 확인하세요. 새 글이 사이트맵에 먼저 반영되어 있어야 하며, 접수 성공이 색인 완료를 의미하지 않습니다.</p>${feedback ? `<p class="sitemap-feedback ${feedback.failed ? 'inspection-error' : ''}" role="${feedback.failed ? 'alert' : 'status'}">${escapeHtml(feedback.message)}</p>` : ''}</form></section>`;
}

// 전체 실행과 구분되는 개별 URL의 저장 관측 결과를 표시합니다.
function apiInspectionView(): string {
  const target = inspectionTarget();
  const observation = store.storedInspections.find(
    (item: InspectionRead): boolean =>
      item.site_id === store.inspectionTargetId && item.engine === store.state.engine,
  );
  const previousError = observation?.error_message
    ? new ApiError(0, observation.error_message, {
        code: observation.error_code ?? 'SAVED_INSPECTION_ERROR',
        operation: 'inspect',
      })
    : null;
  const failure = store.inspectionError ?? previousError;
  const explanation =
    store.state.engine === 'naver'
      ? '고객사 전체 조회에서 네이버 사이트·URL별 GUI 검사를 수행하고 최신 결과를 저장합니다.'
      : store.state.engine === 'bing'
        ? 'Bing은 API로 크롤링 상태, GUI로 색인 상태를 조회합니다. 같은 대상의 가장 최근 관측을 표시합니다.'
        : 'Google URL Inspection API로 저장된 색인 상태를 조회합니다. URL 제출이나 색인 요청은 실행하지 않습니다.';

  return `<div class="page-heading"><div><h1>색인 상태 확인</h1><p>블로그·메인페이지·글·엔진을 선택해 저장된 상태를 확인하세요.</p></div>${inspectionActions()}</div>
    ${clientInspectionPanel()}
    <div class="inspection-saved-heading"><h2>저장된 결과</h2><p>블로그와 검색엔진을 선택해 URL별 관측 결과를 확인하세요.</p></div>
    ${sitePicker()}
    ${engines()}
    ${sitemapForm()}
    <section class="report"><div class="report-header"><div><h2>검사 대상</h2><p>대상 선택은 저장 상태만 읽습니다. 전체 조회는 고객사 전체 색인 조회 버튼으로 실행합니다.</p></div><button class="button secondary" id="reload-inspection-targets">${icon('refresh')}대상 목록 새로고침</button></div>
    <div class="inspection-controls"><label for="inspection-target-select">메인페이지 / 글</label><select id="inspection-target-select">${store.inspectionTargets.length ? store.inspectionTargets.map((item: InspectionTarget): string => `<option value="${escapeHtml(item.id)}" ${item.id === store.inspectionTargetId ? 'selected' : ''}>${item.type === 'site' ? '메인페이지' : '글'} · ${escapeHtml(item.name)}${item.active ? '' : ' (비활성)'} — ${escapeHtml(item.url)}</option>`).join('') : '<option value="">사이트를 먼저 등록하거나 선택하세요</option>'}</select><p class="small muted">${escapeHtml(target?.url ?? '')}</p></div>
    ${store.targetsError ? errorPanel(store.targetsError, '글 목록을 불러오지 못했습니다', 'targets') : ''}
    <div class="inspection-body"><div class="report-header"><h2>${failure ? '최근 조회 오류' : `저장된 ${ENGINE_NAMES[store.state.engine]} 상태`}</h2>${failure ? '' : '<button class="button secondary" id="read-inspection">저장 결과 다시 읽기</button>'}</div>
    ${store.inspectionLoading || store.targetsLoading ? '<p role="status">저장된 결과를 불러오는 중…</p>' : ''}
    ${failure ? errorPanel(failure, `${ENGINE_NAMES[store.state.engine]} ${failure.operation === 'read' ? '저장 결과를 읽지 못했습니다' : '상태를 조회하지 못했습니다'}`, 'saved') : ''}
    ${observation && (!failure || observation.last_checked_at) ? `<div class="detail-result ${!failure && observation.index_status === 'indexed' ? 'indexed' : ''}">${icon(!failure && observation.index_status === 'indexed' ? 'check' : 'info')}<div><h3>${inspectionStatusNames[observation.index_status]}</h3><p>${failure ? '이전 성공 관측 결과입니다. 이번 조회의 성공을 의미하지 않습니다.' : '검색엔진에서 확인해 DB에 저장한 요약 상태입니다.'}</p></div></div><dl class="property-facts"><div><dt>마지막 성공 관측</dt><dd>${escapeHtml(inspectionTime(observation.last_checked_at))}</dd></div></dl>` : failure ? '<p class="previous-result-note">마지막 성공 결과: 없음 · 이번 오류로 미색인 여부를 판단하지 않습니다.</p>' : store.inspectionLoading || store.targetsLoading ? '' : '<div class="empty-state">아직 저장된 조회 결과가 없습니다.<p>조회 기록이 없다는 것은 미색인을 의미하지 않습니다.</p></div>'}
    <div class="inline-note">${escapeHtml(explanation)}</div>
    <p class="field-help">이 API는 크롤링 시각·제출 이력의 상세 필드를 제공하지 않습니다. 확인되지 않은 단계를 완료로 표시하지 않습니다.</p></div></section>`;
}
