import { clientProperties } from '../dashboard.ts';
import { captureFormDrafts, restoreFormDrafts } from '../forms.ts';
import { escapeHtml } from '../html.ts';
import { renderPublicationDuplicateModal } from '../publication/view.ts';
import { icon, viewTitles } from './constants.ts';
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

// 상태를 새 객체로 교체하고 화면을 다시 표시합니다.
export function update(patch: Partial<AppState>): void {
  if (patch.view && patch.view !== store.state.view) {
    store.accountEditor = null;
    store.accountEditorError = null;
  }
  store.state = { ...store.state, ...('notice' in patch ? { noticeTone: 'success' as const } : {}), ...patch };
  render();
}

// 전체 관리 화면과 현재 선택한 작업 페이지를 표시합니다.
export function render(): void {
  const modalFocusId = app.querySelector('#duplicate-dialog')?.contains(document.activeElement)
    ? (document.activeElement as HTMLElement).id : '';
  if (!store.duplicateFocusKey && publications.getState().duplicate)
    store.duplicateReturnFocusId = (document.activeElement as HTMLElement | null)?.id || 'submit-pages';
  if (store.renderedScope) store.formDrafts = captureFormDrafts(app, store.renderedScope, store.formDrafts);

  const scope = `${store.state.clientId}:${store.state.view}:${store.state.propertyId}:${store.state.route}`;
  const privateInputs =
    store.renderedScope === scope
      ? Array.from(
          app.querySelectorAll<HTMLInputElement>(
            'input[name="indexnowKey"], input[name="indexnowLocation"]',
          ),
        ).map((element) => ({ formId: element.form?.id, element }))
      : [];

  document.title = `StartPress · ${viewTitles[store.state.view]}`;
  app.innerHTML = `<header class="app-header"><button class="icon-button menu-toggle" id="menu-toggle" aria-label="왼쪽 메뉴 열기 또는 닫기" aria-expanded="${window.matchMedia('(max-width:760px)').matches ? store.state.mobileNav : !store.state.mobileNav}">${icon('menu')}</button><a class="brand" href="#inspect" aria-label="StartPress 홈"><span class="brand-symbol"><span></span><span></span><span></span></span><span>StartPress <span class="brand-subtitle">Console</span></span></a><form class="global-search" id="url-search"><label class="visually-hidden" for="url-inspect">선택한 사이트의 URL 검사</label>${icon('search')}<input id="url-inspect" type="url" placeholder="${escapeHtml(property().origin)} 내 URL 검사" required autocomplete="off"><kbd>URL 검사</kbd></form><div class="header-end"><a class="mode-switch" href="${demo ? '/' : '/?mode=demo'}">${demo ? 'API 모드로' : '예시 모드'}</a><span class="user-avatar" aria-label="StartPress 팀">S</span></div></header>
    <aside class="sidebar ${store.state.mobileNav ? 'open' : ''}"><label class="property-picker"><span class="property-symbol">${icon('users')}</span><span class="visually-hidden">관리할 고객사 선택</span><select id="client-select">${store.clients.length ? store.clients.map((client: Client): string => `<option value="${escapeHtml(client.id)}" ${client.id === store.state.clientId ? 'selected' : ''}>${escapeHtml(client.name)}</option>`).join('') : '<option value="">등록된 고객사 없음</option>'}</select></label><div class="sidebar-client">담당자: ${escapeHtml(selectedClient()?.manager || '미지정')}<span>${clientProperties(store.properties, store.state.clientId).length}개 블로그</span></div>${navigation('dashboard', 'dashboard')}<div class="nav-divider"></div><div class="nav-section-label">검색엔진 관리</div><nav aria-label="검색엔진 관리">${navigation('register', 'globe')}${navigation('notify', 'send')}${navigation('inspect', 'inspect')}</nav><div class="nav-divider"></div><div class="nav-section-label">워크스페이스</div><nav aria-label="워크스페이스">${navigation('clients', 'users')}</nav><div class="sidebar-bottom"><span class="team-symbol">SP</span><div>StartPress 팀<span>사이트 운영 워크스페이스</span></div></div></aside>
    <main class="main-content"><div class="breadcrumb"><span>${store.state.view === 'clients' ? '워크스페이스' : escapeHtml(selectedClient()?.name ?? '고객사를 선택하세요')}</span>${icon('chevron')}<span>${viewTitles[store.state.view]}</span></div><div class="preview-notice">${icon('info')}<span>${demo ? '예시 모드입니다. 실제 검색엔진 요청이나 DB 저장은 하지 않습니다.' : 'API 연결 모드입니다. 사용 전 SSH 터널을 연결해 주세요. 고객사·사이트·글 저장은 DB에 반영되며, 발행 알림 선택에 따라 실제 IndexNow 알림과 네이버 GUI 수집 요청을 실행합니다.'}</span></div>${store.loading ? '<div class="connection-notice" role="status">서버에서 고객사와 사이트를 불러오는 중…</div>' : store.loadError ? errorPanel(store.loadError, '고객사·사이트 목록을 불러오지 못했습니다', 'workspace') : ''}${store.state.notice ? `<div class="success-notice ${store.state.noticeTone ?? 'success'}" role="status">${icon(store.state.noticeTone && store.state.noticeTone !== 'success' ? 'info' : 'check')}<span>${escapeHtml(store.state.notice)}</span><button class="icon-button" id="dismiss-notice" aria-label="안내 닫기">${icon('close')}</button></div>` : ''}${store.state.view === 'notify' ? sitePicker() : ''}${store.state.view === 'dashboard' ? dashboardView() : store.state.view === 'inspect' ? inspectionView() : store.state.view === 'register' ? registrationView() : store.state.view === 'notify' ? notificationView() : clientsView()}<footer class="page-footer"><span>StartPress Console</span><span>${demo ? '예시 데이터 · 새로고침하면 초기화' : 'API 연결 · 알림 결과와 이번 작업 이력은 이 화면에서만 유지'}</span></footer></main>${detailView()}${renderPublicationDuplicateModal(publications.getState())}<div class="visually-hidden" role="status" aria-live="polite" id="live-status"></div>`;

  for (const input of privateInputs) {
    const replacement = input.formId
      ? app.querySelector<HTMLInputElement>(
          `#${CSS.escape(input.formId)} input[name="${CSS.escape(input.element.name)}"]`,
        )
      : null;
    input.element.removeAttribute('aria-invalid');
    if (input.element.getAttribute('aria-describedby')?.startsWith('field-error-'))
      input.element.removeAttribute('aria-describedby');
    replacement?.replaceWith(input.element);
  }

  bindEvents();
  restoreFormDrafts(app, scope, store.formDrafts);

  const notify = app.querySelector<HTMLInputElement>('#notify-enabled');

  if (notify) store.notifyEnabled = notify.checked;
  const naverGui = app.querySelector<HTMLInputElement>('#naver-gui-enabled');
  if (naverGui) store.naverGuiEnabled = naverGui.checked;

  store.renderedScope = scope;
  applyAvailability();
  syncDuplicateModalFocus(modalFocusId);
}
