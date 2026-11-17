import { presentError } from '../../errors.ts';
import { escapeHtml } from '../../html.ts';
import { renderPublication } from '../../publication/view.ts';
import { icon } from '../constants.ts';
import { publications } from '../controllers.ts';
import { errorPanel } from '../form-errors.ts';
import { demo, property, store } from '../store.ts';
import { indexNowSettingsView } from './registration.ts';
import { activityView } from './shell.ts';
import type { Client, NotifyRoute, PageCreateResult, PageOutcome } from '../../types.ts';
import type { Icon } from '../constants.ts';

// 새 글 발행 알림 화면과 글별 처리 결과 표

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 발행 알림 처리 방법 선택지
interface RouteOption {
  readonly id: NotifyRoute;
  readonly title: string;
  readonly subtitle: string;
  readonly icon: Icon;
}

const ROUTES: readonly RouteOption[] = [
  { id: 'direct', title: '직접 알림', subtitle: '접근 권한이 있는 사이트', icon: 'send' },
  { id: 'link', title: '우리 블로그에 링크 추가', subtitle: '고객사 글을 소개하는 경로', icon: 'link' },
  { id: 'request', title: '고객사에 요청', subtitle: '담당자에게 제출 요청', icon: 'mail' },
];

// 알림 접수 상태별 표시 문구
const SUBMISSION_LABELS: Readonly<Record<PageCreateResult['submission']['status'], string>> = {
  accepted: '알림 접수됨',
  key_pending: '키 확인 중',
  failed: '글 저장됨 · 알림 실패',
  unknown: '글 저장됨 · 접수 여부 불명',
  skipped: '알림 생략',
};

// 알림 오류 코드별 설명
const ERROR_EXPLANATIONS: Readonly<Record<string, string>> = {
  INDEXNOW_NOT_CONFIGURED: '키 설정이 없어 알림을 생략했습니다. 글은 저장됐습니다.',
  INDEXNOW_SETTINGS_INCONSISTENT: '사이트의 IndexNow 설정이 일치하지 않습니다. 키와 파일 URL을 함께 확인하세요.',
  INVALID_INDEXNOW_SETTINGS: '사이트의 키 설정 또는 적용 범위를 확인하세요.',
  INDEXNOW_REJECTED: 'IndexNow가 알림을 거절했습니다. 글을 다시 등록하지 말고 설정과 응답을 확인하세요.',
  INDEXNOW_TIMEOUT: '알림 응답 시간이 초과돼 접수 여부를 알 수 없습니다. 자동 재전송하지 않습니다.',
  INDEXNOW_TRANSPORT_ERROR: '알림 통신 중 접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.',
  INDEXNOW_RESPONSE_ERROR: '알림 응답의 대상이나 접수 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.',
  NOTIFICATION_DISABLED: '알림을 선택하지 않아 글만 저장했습니다.',
  DEMO_MODE: '예시 결과이며 실제 저장·전송은 하지 않았습니다.',
};

// ─────────────────────────────────────────────────────────────
// 발행 폼 조각
// ─────────────────────────────────────────────────────────────

// 처리 방법 선택 버튼 하나
function routeButton(route: RouteOption): string {
  const selected = store.state.route === route.id;
  const check = selected ? icon('check', 'route-check') : '';
  return `<button class="route-option ${selected ? 'selected' : ''}" data-route="${route.id}" aria-pressed="${selected}">${icon(route.icon)}<strong>${route.title}</strong><span>${route.subtitle}</span>${check}</button>`;
}

// 직접 알림일 때의 선택지: IndexNow 알림, 네이버 GUI 수집 요청
function directOptions(): string {
  const notifyChecked = store.notifyEnabled ? 'checked' : '';
  const guiChecked = store.naverGuiEnabled ? 'checked' : '';
  return `<fieldset class="publication-options"><legend class="visually-hidden">발행 알림 방법</legend><div class="publication-option"><label class="radio-label"><input type="checkbox" name="notify" id="notify-enabled" aria-describedby="indexnow-notify-help" ${notifyChecked}>글 저장과 함께 IndexNow 알림 전송</label><p class="field-help" id="indexnow-notify-help">IndexNow로 네이버·Bing에 알립니다. Google 일반 URL 제출과는 별개입니다.</p></div><div class="publication-option"><label class="radio-label"><input type="checkbox" name="naverGui" id="naver-gui-enabled" aria-describedby="naver-gui-help" ${guiChecked}>네이버 GUI로도 수집 요청</label><p class="field-help" id="naver-gui-help">로그인된 네이버 탭을 확인한 뒤 저장된 글을 웹 페이지 수집에 요청합니다. 접수 후 수집·색인은 별도로 확인하세요.</p></div></fieldset>`;
}

// 처리 방법별로 URL 입력 아래에 붙는 추가 입력·안내
function routeExtraFields(): string {
  const route = store.state.route;
  if (route === 'direct') return directOptions();
  if (route === 'link') return '<div class="inline-note">우리 블로그의 글 편집·발행 작업을 준비합니다. 링크 추가가 고객사 URL의 직접 제출이나 색인을 보장하지는 않습니다.</div>';
  return '<label>요청 내용<textarea name="note" rows="2" placeholder="예: 신규 글 제출과 접수 결과 확인을 부탁드립니다."></textarea></label>';
}

// 폼 아래 안내 문구
function footerNote(): string {
  if (store.state.route !== 'direct') return '문구 작성만 수행하며 외부 전달·발행은 하지 않습니다';
  return demo ? '예시 실행 · 실제 전송 없음' : '글 저장과 알림 결과를 각각 확인하세요';
}

// 제출 버튼의 아이콘과 문구
function submitButton(): string {
  const route = store.state.route;
  let iconName: Icon = 'mail';
  let label = '요청 문구 만들기';
  if (route === 'direct') {
    iconName = 'send';
    label = '글 저장 및 발행 알림';
  } else if (route === 'link') {
    iconName = 'link';
    label = '링크 추가 작업 준비';
  }
  return `<button class="button primary" type="submit" id="submit-pages">${icon(iconName)}${label}</button>`;
}

// 만들어진 요청 문구·작업 메모와 복사 버튼
function requestResult(): string {
  if (!store.requestText) return '';
  const title = store.state.route === 'request' ? '고객사에 전달할 요청 문구' : '링크 추가 작업 메모';
  return `<div class="request-result"><h3>${title}</h3><pre>${escapeHtml(store.requestText)}</pre><button class="button secondary" id="copy-request">문구 복사</button></div>`;
}

// 오른쪽 안내: 사이트의 고객사·소유 구분·접근 권한
function permissionAside(): string {
  const site = property();
  const clientName = store.clients.find((client: Client): boolean => client.id === site.clientId)?.name ?? '';
  const ownership = site.owned ? '우리 팀 사이트' : '고객사 사이트';
  return `<aside class="context-column"><h3>사이트 처리 권한</h3><dl class="property-facts"><div><dt>고객사</dt><dd>${escapeHtml(clientName)}</dd></div><div><dt>소유 구분</dt><dd>${ownership}</dd></div><div><dt>접근 권한</dt><dd>실제 연결 시 확인 필요</dd></div></dl><div class="context-note">${icon('info')}<p>고객사 사이트는 권한과 운영 방식에 맞게 처리하세요. 요청 문구 작성과 실제 고객사 전달은 구분합니다.</p></div></aside>`;
}

// 새 글의 처리 경로 선택과 URL 입력 화면을 표시합니다.
export function notificationView(): string {
  const site = property();
  const isDirect = store.state.route === 'direct';
  const noSiteNote = site.id ? '' : '<div class="inline-note">먼저 사이트를 등록하거나 왼쪽에서 사이트를 선택하세요.</div>';
  const routeTitle = ROUTES.find((route): boolean => route.id === store.state.route)?.title;
  const settings = isDirect ? indexNowSettingsView() : '';
  const publication = isDirect ? renderPublication(publications.getState(), site.id) : '';

  return `<div class="page-heading"><div><h1>새 글 발행 알림</h1><p>등록된 사이트의 새 글을 검색엔진에 알리거나 후속 작업을 준비하세요.</p></div></div>
    ${noSiteNote}
    <div class="route-options" role="group" aria-label="발행 알림 처리 방법">${ROUTES.map(routeButton).join('')}</div>
    <div class="form-layout"><section class="report form-report"><div class="report-header"><div><h2>${routeTitle}</h2><p>${escapeHtml(site.name)} · ${escapeHtml(site.origin)}</p></div></div>
      ${settings}
      <form id="notification-form" class="work-form"><label>글 제목 <span class="required">*</span><textarea name="titles" rows="2" required placeholder="새 글 제목을 입력하세요">${escapeHtml(store.notificationTitles)}</textarea><span class="field-help">여러 글은 URL과 같은 순서로 한 줄에 하나씩 제목을 입력하세요.</span></label><label>발행된 글 URL <span class="required">*</span><textarea name="urls" rows="5" required placeholder="${escapeHtml(site.origin)}/posts/new-article">${escapeHtml(store.notificationDraft)}</textarea><span class="field-help">URL을 한 줄에 하나씩 입력하세요. 선택한 사이트의 글만 처리합니다.</span></label>
      ${routeExtraFields()}
      <div class="form-error" id="notification-error"></div><div class="form-footer"><span class="muted small">${footerNote()}</span>${submitButton()}</div></form>
      ${publication}
      ${requestResult()}</section>
      ${permissionAside()}</div>
    <div id="batch-results">${outcomeView()}</div>${activityView()}`;
}

// ─────────────────────────────────────────────────────────────
// 글별 처리 결과 표
// ─────────────────────────────────────────────────────────────

// DB 저장 열의 문구
function saveStatusLabel(item: PageOutcome): string {
  if (item.saveStatus === 'existing') return '기존 글 사용';
  if (item.saveStatus === 'saved') return demo ? '예시 저장' : '저장 확인됨';
  if (item.saveStatus === 'unknown') return '저장 여부 불명';
  if (item.saveStatus === 'rejected') return '요청 거절';
  return '미실행';
}

// 알림 결과 열의 첫 문구
function submissionLabel(item: PageOutcome): string {
  if (item.result) return SUBMISSION_LABELS[item.result.submission.status];
  if (item.saveStatus === 'not_sent') return '전송하지 않음';
  return '접수 여부 미확인';
}

// 알림 오류 코드에 대한 설명. 코드가 없으면 빈 문자열입니다.
function submissionReason(item: PageOutcome): string {
  const code = item.result?.submission.error_code;
  if (!code) return '';
  return ERROR_EXPLANATIONS[code] ?? '알림 처리 결과를 확인하세요.';
}

// 글 하나의 결과 행
function outcomeRow(item: PageOutcome): string {
  const issue = item.error ? presentError(item.error, '처리 오류') : null;
  const reason = submissionReason(item);
  const reasonHtml = reason ? `<span class="result-url">${escapeHtml(reason)}</span>` : '';
  const messageHtml = item.message ? `<span class="result-url">${escapeHtml(item.message)}</span>` : '';
  const issueHtml = issue
    ? `<details class="row-error"><summary>원인·다음 행동</summary><p>${escapeHtml(issue.advice)}</p><small>오류 코드: ${escapeHtml(item.error?.code ?? '')}</small></details>`
    : '';
  return `<tr><td>${escapeHtml(item.article.name)}<span class="result-url">${escapeHtml(item.article.url)}</span></td><td>${saveStatusLabel(item)}</td><td>${submissionLabel(item)}${reasonHtml}${messageHtml}${issueHtml}</td></tr>`;
}

// 글 저장과 알림 접수 결과를 별도 열로 표시합니다.
function outcomeView(): string {
  if (!store.outcomes.length) return '';

  const hasUnknown = store.outcomes.some((item: PageOutcome): boolean => item.saveStatus === 'unknown');
  const verifyButton = hasUnknown ? '<button class="button secondary" type="button" data-error-action="saves">글 저장 여부 확인</button>' : '';
  const errorCard = store.outcomesError ? errorPanel(store.outcomesError, '글 저장 여부를 확인하지 못했습니다', 'saves') : '';

  return `<section class="report" aria-label="이번 글 처리 결과"><div class="report-header"><div><h2>글별 처리 결과</h2><p>저장과 알림 결과는 별개입니다. 새로고침하면 이번 실행 결과는 사라집니다.</p></div>${verifyButton}</div>${errorCard}<div class="table-scroll"><table><thead><tr><th>글</th><th>DB 저장</th><th>알림 결과·다음 행동</th></tr></thead><tbody>${store.outcomes.map(outcomeRow).join('')}</tbody></table></div></section>`;
}
