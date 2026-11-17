import { publicationBusy } from './controller.ts';
import type { PublicationGuiResult, PublicationInput, PublicationState } from './controller';
import { renderWorkTabPanel } from '../tabs/view.ts';
import type { WorkTabPanelOptions } from '../tabs/view';
import type { WorkTabState } from '../tabs/controller';
import { escapeHtml } from '../html.ts';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 발행 화면용 탭 패널 설정. 색인 조회 패널과 id 접두사·data 속성·문구를 구분합니다.
const PUBLICATION_TAB_PANEL: WorkTabPanelOptions = {
  idPrefix: 'publication-tab-naver',
  formAttribute: 'data-publication-tab',
  refreshAttribute: 'data-refresh-publication-tab',
  readyMessage: '선택한 탭의 주소와 로딩 상태를 확인했습니다.',
  selectLabel: '수집 요청에 사용할 탭',
};

// URL별 네이버 GUI 요청 상태의 표시 문구
const GUI_RESULT_LABELS: Readonly<Record<PublicationGuiResult['status'], string>> = {
  queued: '요청 대기',
  requesting: '접수 확인 중',
  accepted: '접수 확인',
  unconfirmed: '접수 여부 미확인',
  blocked: '요청 안 함',
  cancelled: '취소 · 요청 안 함',
};

// ─────────────────────────────────────────────────────────────
// 조각 렌더링
// ─────────────────────────────────────────────────────────────

// 공용 탭 컨트롤러의 "조회" 안내 문구를 발행 화면에 맞게 "수집 요청"으로 바꿉니다.
function publicationTabMessage(message: string): string {
  return message.replaceAll('조회에 사용할 탭', '수집 요청에 사용할 탭');
}

// 네이버 수집 요청에 쓸 작업 탭 패널을 발행 화면 설정으로 그립니다.
function renderPublicationTabPanel(tab: WorkTabState, scope: string): string {
  const adjusted = { ...tab, message: publicationTabMessage(tab.message) };
  return renderWorkTabPanel(adjusted, scope, '네이버', PUBLICATION_TAB_PANEL);
}

// 사용자가 선택한 요청 경로 목록 (IndexNow 알림, 네이버 GUI 수집 요청)
function requestRoutes(input: PublicationInput): readonly string[] {
  const routes: string[] = [];
  if (input.notify) routes.push('IndexNow 알림 (네이버·Bing)');
  if (input.gui) routes.push('네이버 GUI 웹페이지 수집 요청');
  return routes;
}

// 발행 작업 취소 버튼. 취소를 이미 요청했으면 비활성입니다.
function cancelButton(state: PublicationState): string {
  const disabled = state.cancelRequested ? 'disabled' : '';
  const label = state.cancelRequested ? '취소 대기 중' : '발행 작업 취소';
  return `<button class="inspection-text-button" type="button" id="cancel-publication" ${disabled}>${label}</button>`;
}

// 다른 사이트의 발행이 진행 중일 때 보여주는 안내. 진행 중이 아니면 아무것도 보여주지 않습니다.
function otherSiteNotice(state: PublicationState, busy: boolean): string {
  if (!busy) return '';
  const siteName = escapeHtml(state.input?.siteName ?? '선택한 사이트');
  return `<section class="publication-progress" id="publication-progress" data-scope="${escapeHtml(state.scope)}" data-phase="${state.phase}" aria-labelledby="publication-title">
      <div class="report-header publication-heading"><h3 id="publication-title">다른 사이트 발행 작업 진행 중</h3>${cancelButton(state)}</div>
      <p class="publication-message" role="status">${siteName}의 발행 작업이 진행 중입니다. 해당 사이트에서 탭 선택과 처리 결과를 확인하세요.</p>
    </section>`;
}

// 네이버 작업 탭 영역. 탭을 고르는 단계가 아니면 비활성 fieldset으로 감쌉니다.
function tabFieldset(state: PublicationState): string {
  if (!state.tab) return '';
  const disabled = state.phase === 'awaiting_tabs' ? '' : 'disabled';
  const panel = renderPublicationTabPanel(state.tab, state.scope);
  return `<fieldset class="publication-tabs" ${disabled}><legend class="visually-hidden">네이버 수집 요청 작업 탭</legend>${panel}</fieldset>`;
}

// URL 하나의 GUI 요청 결과 행. 접수 영수증이 있으면 네이버 등록일을 함께 보여줍니다.
function guiResultRow(result: PublicationGuiResult): string {
  const receipt = result.receipt
    ? `<p class="publication-result-date">네이버 등록일 ${escapeHtml(result.receipt.registeredAtText)}</p>`
    : '';
  return `<tr><td class="publication-url">${escapeHtml(result.targetUrl)}</td><td><div class="publication-result"><span class="publication-result-label">${GUI_RESULT_LABELS[result.status]}</span><p class="publication-result-message">${escapeHtml(result.message)}</p>${receipt}</div></td><td>미확인</td><td>미확인</td></tr>`;
}

// URL별 GUI 요청 결과 표. 수집·색인 완료는 이 화면에서 확인하지 않으므로 항상 "미확인"입니다.
function guiResultsTable(results: readonly PublicationGuiResult[]): string {
  if (!results.length) return '';
  return `<div class="table-scroll publication-results"><table class="publication-table"><thead><tr><th scope="col">URL</th><th scope="col">네이버 GUI 요청 접수</th><th scope="col">수집 완료</th><th scope="col">색인 완료</th></tr></thead><tbody>${results.map(guiResultRow).join('')}</tbody></table></div>`;
}

// ─────────────────────────────────────────────────────────────
// 화면
// ─────────────────────────────────────────────────────────────

// 검증된 기존 글과 선택된 요청 경로를 명시하고 승인 전에는 후속 요청을 실행하지 않습니다.
export function renderPublicationDuplicateModal(state: PublicationState): string {
  const duplicate = state.duplicate;
  const input = state.input;
  if (state.phase !== 'awaiting_duplicate' || !duplicate || !input) return '';

  const routes = requestRoutes(input)
    .map((route): string => `<li>${escapeHtml(route)}</li>`)
    .join('');

  return `<div class="modal-backdrop publication-modal-backdrop" id="duplicate-backdrop">
    <section class="publication-dialog" id="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-title" aria-describedby="duplicate-description" tabindex="-1" data-scope="${escapeHtml(state.scope)}" data-confirmation-id="${escapeHtml(duplicate.confirmationId)}">
      <header class="detail-header"><h2 id="duplicate-title">이미 등록된 글입니다</h2><button type="button" class="icon-button" id="close-duplicate" aria-label="기존 글 요청 취소">×</button></header>
      <div class="publication-dialog-body"><p id="duplicate-description">기존 글로 요청을 계속할까요? 글을 다시 저장하지 않고 아래 선택한 알림을 전송합니다.</p>
        <dl class="publication-dialog-facts"><div><dt>사이트</dt><dd>${escapeHtml(input.siteName)}</dd></div><div><dt>등록된 글</dt><dd>${escapeHtml(duplicate.page.name)}</dd></div></dl>
        <p class="detail-url">${escapeHtml(duplicate.page.url)}</p>
        <ul class="publication-request-routes">${routes}</ul>
        <p class="field-help">요청 접수는 수집·색인 완료를 뜻하지 않습니다. 취소하면 이 URL의 요청만 건너뜁니다.</p>
      </div>
      <footer class="publication-dialog-footer"><button type="button" class="button secondary" id="cancel-duplicate">이 URL 건너뛰기</button><button type="button" class="button primary" id="confirm-duplicate">계속 요청</button></footer>
    </section></div>`;
}

// 발행 폼 밖에서 탭 선택과 URL별 GUI 접수를 별도의 작업 결과로 표시합니다.
export function renderPublication(state: PublicationState, siteId: string): string {
  if (state.phase === 'idle') return '';

  const busy = publicationBusy(state);
  // 다른 사이트의 발행이면 진행 중일 때만 안내를 보여줍니다.
  if (state.siteId !== siteId) return otherSiteNotice(state, busy);

  return `<section class="publication-progress" id="publication-progress" data-scope="${escapeHtml(state.scope)}" data-phase="${state.phase}" aria-labelledby="publication-title">
    <div class="report-header publication-heading"><h3 id="publication-title">발행 처리 결과</h3>${busy ? cancelButton(state) : ''}</div>
    <p class="publication-message" role="status">${escapeHtml(state.message)}</p>
    ${tabFieldset(state)}
    ${guiResultsTable(state.guiResults)}
  </section>`;
}
