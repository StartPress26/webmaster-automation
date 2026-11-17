import { publicationBusy } from './controller.ts';
import type { PublicationState } from './controller';
import { renderWorkTabPanel } from '../tabs/view.ts';

// 사이트명·URL·접수 메시지를 HTML에 안전하게 표시합니다.
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char: string): string =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

// 검증된 기존 글과 선택된 요청 경로를 명시하고 승인 전에는 후속 요청을 실행하지 않습니다.
export function renderPublicationDuplicateModal(state: PublicationState): string {
  const duplicate = state.duplicate;
  const input = state.input;
  if (state.phase !== 'awaiting_duplicate' || !duplicate || !input) return '';
  const routes = [input.notify ? 'IndexNow 알림 (네이버·Bing)' : '',
    input.gui ? '네이버 GUI 웹페이지 수집 요청' : ''].filter(Boolean);
  return `<div class="modal-backdrop publication-modal-backdrop" id="duplicate-backdrop">
    <section class="publication-dialog" id="duplicate-dialog" role="dialog" aria-modal="true" aria-labelledby="duplicate-title" aria-describedby="duplicate-description" tabindex="-1" data-scope="${escape(state.scope)}" data-confirmation-id="${escape(duplicate.confirmationId)}">
      <header class="detail-header"><h2 id="duplicate-title">이미 등록된 글입니다</h2><button type="button" class="icon-button" id="close-duplicate" aria-label="기존 글 요청 취소">×</button></header>
      <div class="publication-dialog-body"><p id="duplicate-description">기존 글로 요청을 계속할까요? 글을 다시 저장하지 않고 아래 선택한 알림을 전송합니다.</p>
        <dl class="publication-dialog-facts"><div><dt>사이트</dt><dd>${escape(input.siteName)}</dd></div><div><dt>등록된 글</dt><dd>${escape(duplicate.page.name)}</dd></div></dl>
        <p class="detail-url">${escape(duplicate.page.url)}</p>
        <ul class="publication-request-routes">${routes.map((route): string => `<li>${escape(route)}</li>`).join('')}</ul>
        <p class="field-help">요청 접수는 수집·색인 완료를 뜻하지 않습니다. 취소하면 이 URL의 요청만 건너뜁니다.</p>
      </div>
      <footer class="publication-dialog-footer"><button type="button" class="button secondary" id="cancel-duplicate">이 URL 건너뛰기</button><button type="button" class="button primary" id="confirm-duplicate">계속 요청</button></footer>
    </section></div>`;
}

// 발행 폼 밖에서 탭 선택과 URL별 GUI 접수를 별도의 작업 결과로 표시합니다.
export function renderPublication(state: PublicationState, siteId: string): string {
  if (state.phase === 'idle') return '';
  const busy = publicationBusy(state);
  if (state.siteId !== siteId) {
    return busy ? `<section class="publication-progress" id="publication-progress" data-scope="${escape(state.scope)}" data-phase="${state.phase}" aria-labelledby="publication-title">
      <div class="report-header publication-heading"><h3 id="publication-title">다른 사이트 발행 작업 진행 중</h3><button class="inspection-text-button" type="button" id="cancel-publication" ${state.cancelRequested ? 'disabled' : ''}>${state.cancelRequested ? '취소 대기 중' : '발행 작업 취소'}</button></div>
      <p class="publication-message" role="status">${escape(state.input?.siteName ?? '선택한 사이트')}의 발행 작업이 진행 중입니다. 해당 사이트에서 탭 선택과 처리 결과를 확인하세요.</p>
    </section>` : '';
  }
  const tabPanel = state.tab ? renderWorkTabPanel(state.tab, state.scope, '네이버')
    .replaceAll('data-work-tab-engine="naver"', 'data-publication-tab="naver"')
    .replaceAll('data-refresh-work-tab="naver"', 'data-refresh-publication-tab="naver"')
    .replaceAll('work-tab-naver', 'publication-tab-naver')
    .replaceAll('탭 준비됨. GUI 조회·저장은 아직 실행하지 않았습니다.', '선택한 탭의 주소와 로딩 상태를 확인했습니다.')
    .replaceAll('조회에 사용할 탭', '수집 요청에 사용할 탭') : '';
  const labels: Readonly<Record<PublicationState['guiResults'][number]['status'], string>> = {
    queued: '요청 대기', requesting: '접수 확인 중', accepted: '접수 확인',
    unconfirmed: '접수 여부 미확인', blocked: '요청 안 함', cancelled: '취소 · 요청 안 함',
  };
  return `<section class="publication-progress" id="publication-progress" data-scope="${escape(state.scope)}" data-phase="${state.phase}" aria-labelledby="publication-title">
    <div class="report-header publication-heading"><h3 id="publication-title">발행 처리 결과</h3>${busy ? `<button class="inspection-text-button" type="button" id="cancel-publication" ${state.cancelRequested ? 'disabled' : ''}>${state.cancelRequested ? '취소 대기 중' : '발행 작업 취소'}</button>` : ''}</div>
    <p class="publication-message" role="status">${escape(state.message)}</p>
    ${state.tab ? `<fieldset class="publication-tabs" ${state.phase === 'awaiting_tabs' ? '' : 'disabled'}><legend class="visually-hidden">네이버 수집 요청 작업 탭</legend>${tabPanel}</fieldset>` : ''}
    ${state.guiResults.length ? `<div class="table-scroll publication-results"><table class="publication-table"><thead><tr><th scope="col">URL</th><th scope="col">네이버 GUI 요청 접수</th><th scope="col">수집 완료</th><th scope="col">색인 완료</th></tr></thead><tbody>${state.guiResults.map((result): string =>
      `<tr><td class="publication-url">${escape(result.targetUrl)}</td><td><div class="publication-result"><span class="publication-result-label">${labels[result.status]}</span><p class="publication-result-message">${escape(result.message)}</p>${result.receipt ? `<p class="publication-result-date">네이버 등록일 ${escape(result.receipt.registeredAtText)}</p>` : ''}</div></td><td>미확인</td><td>미확인</td></tr>`).join('')}</tbody></table></div>` : ''}
  </section>`;
}
