import { clientProperties } from '../dashboard.ts';
import { captureFormDrafts, restoreFormDrafts } from '../forms.ts';
import { escapeHtml } from '../html.ts';
import { renderPublicationDuplicateModal } from '../publication/view.ts';
import { icon, MOBILE_MEDIA_QUERY, viewTitles } from './constants.ts';
import { publications } from './controllers.ts';
import { applyAvailability, bindEvents, syncDuplicateModalFocus } from './events.ts';
import { errorPanel } from './form-errors.ts';
import { app, demo, property, selectedClient, store } from './store.ts';
import { dashboardView } from './views/dashboard.ts';
import { inspectionView } from './views/inspection.ts';
import { notificationView } from './views/notification.ts';
import { registrationView } from './views/registration.ts';
import { clientsView, detailView, navigation, sitePicker } from './views/shell.ts';
import type { AppState, Client } from '../types.ts';

// 화면 전체를 다시 그리는 함수와, 상태를 바꾼 뒤 다시 그리는 update

// ─────────────────────────────────────────────────────────────
// 상수·타입
// ─────────────────────────────────────────────────────────────

// 다시 그린 뒤에도 DOM 노드를 그대로 유지하는 비밀 입력칸 (값을 문자열로 보존하지 않기 위해)
const SECRET_INPUT_SELECTOR = 'input[name="indexnowKey"], input[name="indexnowLocation"]';
// 모달 포커스가 돌아갈 기본 버튼
const DEFAULT_RETURN_FOCUS_ID = 'submit-pages';

// 다시 그리기 전에 떼어 둔 비밀 입력칸과 그 폼 id
interface PreservedInput {
  readonly formId: string | undefined;
  readonly element: HTMLInputElement;
}

// ─────────────────────────────────────────────────────────────
// 상태 변경
// ─────────────────────────────────────────────────────────────

// 상태를 새 객체로 교체하고 화면을 다시 표시합니다. 화면이 바뀌면 열려 있던 계정 편집은 닫습니다.
export function update(patch: Partial<AppState>): void {
  if (patch.view && patch.view !== store.state.view) {
    store.accountEditor = null;
    store.accountEditorError = null;
  }
  // notice를 넘기면 색조는 기본 success로 두고, patch에 noticeTone이 있으면 그 값을 씁니다.
  const noticeTone = 'notice' in patch ? { noticeTone: 'success' as const } : {};
  store.state = { ...store.state, ...noticeTone, ...patch };
  render();
}

// ─────────────────────────────────────────────────────────────
// 화면 조각
// ─────────────────────────────────────────────────────────────

// 현재 화면·사이트·경로를 묶은 키. 폼 초안 보존과 비밀 입력칸 유지에 쓰입니다.
function renderScope(): string {
  const { clientId, view, propertyId, route } = store.state;
  return `${clientId}:${view}:${propertyId}:${route}`;
}

// 모바일에서는 메뉴가 열렸을 때, 데스크톱에서는 접히지 않았을 때 aria-expanded가 참입니다.
function menuExpanded(): boolean {
  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  return isMobile ? store.state.mobileNav : !store.state.mobileNav;
}

// 상단 헤더: 메뉴 버튼, 브랜드, URL 검색, 모드 전환
function headerHtml(): string {
  const modeHref = demo ? '/' : '/?mode=demo';
  const modeLabel = demo ? 'API 모드로' : '예시 모드';
  return `<header class="app-header"><button class="icon-button menu-toggle" id="menu-toggle" aria-label="왼쪽 메뉴 열기 또는 닫기" aria-expanded="${menuExpanded()}">${icon('menu')}</button><a class="brand" href="#inspect" aria-label="StartPress 홈"><span class="brand-symbol"><span></span><span></span><span></span></span><span>StartPress <span class="brand-subtitle">Console</span></span></a><form class="global-search" id="url-search"><label class="visually-hidden" for="url-inspect">선택한 사이트의 URL 검사</label>${icon('search')}<input id="url-inspect" type="url" placeholder="${escapeHtml(property().origin)} 내 URL 검사" required autocomplete="off"><kbd>URL 검사</kbd></form><div class="header-end"><a class="mode-switch" href="${modeHref}">${modeLabel}</a><span class="user-avatar" aria-label="StartPress 팀">S</span></div></header>`;
}

// 고객사 선택 상자의 option 목록
function clientOptions(): string {
  if (!store.clients.length) return '<option value="">등록된 고객사 없음</option>';
  return store.clients
    .map((client: Client): string => `<option value="${escapeHtml(client.id)}" ${client.id === store.state.clientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`)
    .join('');
}

// 왼쪽 사이드바: 고객사 선택, 메뉴, 팀 표시
function sidebarHtml(): string {
  const manager = escapeHtml(selectedClient()?.manager || '미지정');
  const siteCount = clientProperties(store.properties, store.state.clientId).length;
  return `<aside class="sidebar ${store.state.mobileNav ? 'open' : ''}"><label class="property-picker"><span class="property-symbol">${icon('users')}</span><span class="visually-hidden">관리할 고객사 선택</span><select id="client-select">${clientOptions()}</select></label><div class="sidebar-client">담당자: ${manager}<span>${siteCount}개 블로그</span></div>${navigation('dashboard', 'dashboard')}<div class="nav-divider"></div><div class="nav-section-label">검색엔진 관리</div><nav aria-label="검색엔진 관리">${navigation('register', 'globe')}${navigation('notify', 'send')}${navigation('inspect', 'inspect')}</nav><div class="nav-divider"></div><div class="nav-section-label">워크스페이스</div><nav aria-label="워크스페이스">${navigation('clients', 'users')}</nav><div class="sidebar-bottom"><span class="team-symbol">SP</span><div>StartPress 팀<span>사이트 운영 워크스페이스</span></div></div></aside>`;
}

// 본문 위 안내: 목록 로딩 중 / 로딩 실패
function connectionNoticeHtml(): string {
  if (store.loading) return '<div class="connection-notice" role="status">서버에서 고객사와 사이트를 불러오는 중…</div>';
  if (store.loadError) return errorPanel(store.loadError, '고객사·사이트 목록을 불러오지 못했습니다', 'workspace');
  return '';
}

// 작업 결과 안내(성공·경고·정보). 없으면 빈 문자열입니다.
function noticeHtml(): string {
  const { notice, noticeTone } = store.state;
  if (!notice) return '';
  const tone = noticeTone ?? 'success';
  const iconName = noticeTone && noticeTone !== 'success' ? 'info' : 'check';
  return `<div class="success-notice ${tone}" role="status">${icon(iconName)}<span>${escapeHtml(notice)}</span><button class="icon-button" id="dismiss-notice" aria-label="안내 닫기">${icon('close')}</button></div>`;
}

// 현재 선택한 화면의 본문
function currentViewHtml(): string {
  const view = store.state.view;
  if (view === 'dashboard') return dashboardView();
  if (view === 'inspect') return inspectionView();
  if (view === 'register') return registrationView();
  if (view === 'notify') return notificationView();
  return clientsView();
}

// 본문 영역: 경로 표시, 모드 안내, 알림, 현재 화면, 푸터
function mainHtml(): string {
  const crumb = store.state.view === 'clients' ? '워크스페이스' : escapeHtml(selectedClient()?.name ?? '고객사를 선택하세요');
  const modeNotice = demo
    ? '예시 모드입니다. 실제 검색엔진 요청이나 DB 저장은 하지 않습니다.'
    : 'API 연결 모드입니다. 사용 전 SSH 터널을 연결해 주세요. 고객사·사이트·글 저장은 DB에 반영되며, 발행 알림 선택에 따라 실제 IndexNow 알림과 네이버 GUI 수집 요청을 실행합니다.';
  const footerNote = demo ? '예시 데이터 · 새로고침하면 초기화' : 'API 연결 · 알림 결과와 이번 작업 이력은 이 화면에서만 유지';
  const picker = store.state.view === 'notify' ? sitePicker() : '';
  return `<main class="main-content"><div class="breadcrumb"><span>${crumb}</span>${icon('chevron')}<span>${viewTitles[store.state.view]}</span></div><div class="preview-notice">${icon('info')}<span>${modeNotice}</span></div>${connectionNoticeHtml()}${noticeHtml()}${picker}${currentViewHtml()}<footer class="page-footer"><span>StartPress Console</span><span>${footerNote}</span></footer></main>`;
}

// ─────────────────────────────────────────────────────────────
// DOM 교체 전후 처리
// ─────────────────────────────────────────────────────────────

// 중복 글 모달 안에 포커스가 있었다면 그 요소의 id를 기억합니다. (다시 그린 뒤 같은 자리에 포커스를 돌려주기 위해)
function focusedModalElementId(): string {
  const dialog = app.querySelector('#duplicate-dialog');
  if (!dialog?.contains(document.activeElement)) return '';
  return (document.activeElement as HTMLElement).id;
}

// 중복 글 모달이 처음 열릴 때, 닫힌 뒤 포커스를 돌려줄 버튼을 기억합니다.
function rememberReturnFocus(): void {
  if (store.duplicateFocusKey || !publications.getState().duplicate) return;
  const activeId = (document.activeElement as HTMLElement | null)?.id;
  store.duplicateReturnFocusId = activeId || DEFAULT_RETURN_FOCUS_ID;
}

// 같은 화면을 다시 그릴 때는 IndexNow 비밀 입력칸 노드를 떼어 둡니다. (다른 화면이면 보존하지 않음)
function preservedSecretInputs(scope: string): readonly PreservedInput[] {
  if (store.renderedScope !== scope) return [];
  return Array.from(app.querySelectorAll<HTMLInputElement>(SECRET_INPUT_SELECTOR))
    .map((element): PreservedInput => ({ formId: element.form?.id, element }));
}

// 떼어 둔 비밀 입력칸을 새 DOM의 같은 자리에 되돌립니다. 이전 오류 표시는 지웁니다.
function restoreSecretInputs(inputs: readonly PreservedInput[]): void {
  for (const input of inputs) {
    const replacement = input.formId
      ? app.querySelector<HTMLInputElement>(`#${CSS.escape(input.formId)} input[name="${CSS.escape(input.element.name)}"]`)
      : null;
    input.element.removeAttribute('aria-invalid');
    if (input.element.getAttribute('aria-describedby')?.startsWith('field-error-')) {
      input.element.removeAttribute('aria-describedby');
    }
    replacement?.replaceWith(input.element);
  }
}

// 복원된 체크박스의 실제 상태를 store에 다시 반영합니다.
function syncPublicationCheckboxes(): void {
  const notify = app.querySelector<HTMLInputElement>('#notify-enabled');
  if (notify) store.notifyEnabled = notify.checked;

  const naverGui = app.querySelector<HTMLInputElement>('#naver-gui-enabled');
  if (naverGui) store.naverGuiEnabled = naverGui.checked;
}

// ─────────────────────────────────────────────────────────────
// 전체 그리기
// ─────────────────────────────────────────────────────────────

// 전체 관리 화면과 현재 선택한 작업 페이지를 표시합니다.
export function render(): void {
  // 1. 다시 그리기 전에 포커스·폼 입력·비밀 입력칸을 보존합니다.
  const modalFocusId = focusedModalElementId();
  rememberReturnFocus();
  if (store.renderedScope) {
    store.formDrafts = captureFormDrafts(app, store.renderedScope, store.formDrafts);
  }
  const scope = renderScope();
  const secretInputs = preservedSecretInputs(scope);

  // 2. HTML을 통째로 교체합니다.
  document.title = `StartPress · ${viewTitles[store.state.view]}`;
  app.innerHTML = `${headerHtml()}
    ${sidebarHtml()}
    ${mainHtml()}${detailView()}${renderPublicationDuplicateModal(publications.getState())}<div class="visually-hidden" role="status" aria-live="polite" id="live-status"></div>`;

  // 3. 보존한 것을 되돌리고 이벤트·활성 상태·포커스를 맞춥니다.
  restoreSecretInputs(secretInputs);
  bindEvents();
  restoreFormDrafts(app, scope, store.formDrafts);
  syncPublicationCheckboxes();
  store.renderedScope = scope;
  applyAvailability();
  syncDuplicateModalFocus(modalFocusId);
}
