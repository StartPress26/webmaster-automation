import { SETTLED_RUN_PHASES, clientInspectionBusy } from '../inspection/client-controller.ts';
import { publicationBusy } from '../publication/controller.ts';
import { accountChanges, addClient, capturePublicationDraft, closeDetail, copyRequest, inspectUrl, notifyPublication, openDetail, registerSite, respondToDuplicate, saveIndexNowSettings, saveSiteAccounts, selectClient, selectProperty, submitSitemap } from './actions.ts';
import { MOBILE_MEDIA_QUERY } from './constants.ts';
import { clientInspections, continueClientApiOnly, prepareClientWorkTab, publications, refreshClientInspections } from './controllers.ts';
import { bindErrorActions } from './form-errors.ts';
import { loadAuthAccounts, loadDashboard, loadInspectionTargets, loadStoredInspections } from './loaders.ts';
import { render, update } from './render.ts';
import { app, demo, property, store } from './store.ts';
import type { ClientInspectionRun } from '../inspection/client-controller.ts';
import type { AppState, Engine, NotifyRoute, Property, View } from '../types.ts';

// 다시 그린 DOM에 이벤트를 연결하고, 상태에 따라 버튼 활성·비활성을 맞추는 함수들

// ─────────────────────────────────────────────────────────────
// 상수·도우미
// ─────────────────────────────────────────────────────────────

type FormControl = HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const ALL_CONTROLS = 'button, input, select, textarea';
const SITEMAP_CONTROLS = '#toggle-sitemap, #sitemap-form input, #sitemap-form button';
const NOTIFICATION_CONTROLS = '#notification-form button, #notification-form input, #notification-form select, #notification-form textarea, #indexnow-form input, #indexnow-form button';
const INDEXNOW_CONTROLS = '#indexnow-form input, #indexnow-form button';
const PUBLICATION_LOCKED_CONTROLS = '#notification-form input, #notification-form textarea, #notification-form button, [data-route]';
const ACCOUNT_SELECTS = '[name="googleAccountEmail"], [name="bingAccountEmail"]';
// 상세 창 안에서 탭 키로 이동할 수 있는 요소
const FOCUSABLE = 'button, a[href], input, select, textarea';

// 선택자에 맞는 모든 컨트롤의 disabled를 한 번에 맞춥니다.
function setDisabled(selector: string, disabled: boolean): void {
  app.querySelectorAll<FormControl>(selector).forEach((element): void => {
    element.disabled = disabled;
  });
}

// 요소가 있으면 disabled를 맞춥니다.
function setDisabledById<T extends FormControl>(selector: string, disabled: boolean): void {
  const element = app.querySelector<T>(selector);
  if (element) element.disabled = disabled;
}

// 이벤트 대상의 값
function valueOf(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value;
}

// 모바일에서는 메뉴가 열렸을 때, 데스크톱에서는 접히지 않았을 때 aria-expanded가 참입니다.
function menuExpanded(): boolean {
  const isMobile = window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  return isMobile ? store.state.mobileNav : !store.state.mobileNav;
}

// ─────────────────────────────────────────────────────────────
// 처리 중 표시
// ─────────────────────────────────────────────────────────────

// 네트워크 처리 중 입력과 중복 실행을 막고 폼 자체는 보존합니다.
export function setPending(value: boolean): void {
  store.pending = value;
  app.setAttribute('aria-busy', String(value));
  applyAvailability();
}

// ─────────────────────────────────────────────────────────────
// 버튼 활성·비활성
// ─────────────────────────────────────────────────────────────

// 전체 조회 실행·취소·네이버 읽기 버튼
function applyInspectionRunAvailability(run: ClientInspectionRun): void {
  const publishing = publicationBusy(publications.getState());
  setDisabledById<HTMLButtonElement>('#refresh-index', demo || !store.state.clientId || clientInspectionBusy(run) || publishing);
  setDisabledById<HTMLButtonElement>('#cancel-client-inspection', !clientInspectionBusy(run) || run.cancelRequested);
  setDisabledById<HTMLButtonElement>('#read-naver-preview',
    Boolean(run.naverPreview?.loading) || publishing || !SETTLED_RUN_PHASES.includes(run.phase));
}

// 사이트가 없거나 비활성이면 사이트맵·발행·IndexNow 입력을 막습니다.
function applySiteDependentAvailability(site: Property): void {
  const noSite = !site.id || !site.active;
  setDisabled(SITEMAP_CONTROLS, noSite || store.state.engine === 'naver');
  setDisabled(NOTIFICATION_CONTROLS, noSite);
  setDisabled(INDEXNOW_CONTROLS, noSite || store.settingsLoading);
}

// 사이트 등록 버튼과 인증 계정 관련 컨트롤
function applyRegistrationAvailability(): void {
  const accountsUnavailable = store.authAccountsLoading || Boolean(store.authAccountsError);
  setDisabledById<HTMLButtonElement>('#registration-form button[type="submit"]', !store.state.clientId || accountsUnavailable);
  setDisabled(ACCOUNT_SELECTS, demo || accountsUnavailable);
  setDisabledById<HTMLButtonElement>('#refresh-auth-accounts', demo || store.authAccountsLoading);
  setDisabled('[data-edit-accounts]', demo);

  // 계정 편집 폼의 저장 버튼은 실제로 바뀐 값이 있을 때만 켭니다.
  const editForm = app.querySelector<HTMLFormElement>('[data-account-editor]');
  const hasChanges = Boolean(editForm && store.accountEditor && Object.keys(accountChanges(editForm, store.accountEditor.original)).length);
  setDisabledById<HTMLButtonElement>('#save-site-accounts', demo || accountsUnavailable || !hasChanges);
}

// URL 검색창과 API 모드의 대상 선택·저장 결과 읽기
function applyInspectionTargetAvailability(site: Property): void {
  const noSite = !site.id || !site.active;
  setDisabledById<HTMLInputElement>('#url-inspect', noSite || (!demo && store.targetsLoading));
  if (demo) return;

  setDisabledById<HTMLSelectElement>('#inspection-target-select', store.targetsLoading || store.inspectionTargets.length === 0);
  setDisabledById<HTMLButtonElement>('#read-inspection', !store.inspectionTargetId || store.inspectionLoading || store.targetsLoading);
}

// 발행 제출 버튼의 활성 여부와 문구
function applyPublicationSubmit(site: Property, run: ClientInspectionRun): void {
  const button = app.querySelector<HTMLButtonElement>('#submit-pages');
  if (!button || store.state.route !== 'direct') return;

  const noSite = !site.id || !site.active;
  const publishing = publicationBusy(publications.getState());
  const indexNowNotReady = store.settingsLoading || Boolean(store.settingsError) || !site.indexNow?.configured;
  button.disabled = noSite || publishing || clientInspectionBusy(run) || (store.notifyEnabled && indexNowNotReady);

  if (publishing) button.textContent = '발행 알림 처리 중…';
  else if (store.notifyEnabled || store.naverGuiEnabled) button.textContent = '글 저장 및 발행 알림';
  else button.textContent = '글만 저장';
}

// 데이터 준비·활성 사이트·설정 유무에 맞춰 버튼의 실행 가능 여부를 갱신합니다.
export function applyAvailability(): void {
  // 처리 중이거나 목록 로딩 중이면 모든 컨트롤을 잠급니다.
  setDisabled(ALL_CONTROLS, store.pending || store.loading);
  if (store.pending || store.loading) return;

  const run = clientInspections.getState();
  const site = property();
  applyInspectionRunAvailability(run);
  applySiteDependentAvailability(site);
  applyRegistrationAvailability();
  applyInspectionTargetAvailability(site);
  applyPublicationSubmit(site, run);

  // 발행이 진행 중이면 발행 폼과 경로 선택을 모두 잠급니다.
  if (publicationBusy(publications.getState())) setDisabled(PUBLICATION_LOCKED_CONTROLS, true);
}

// ─────────────────────────────────────────────────────────────
// 모달 포커스·키보드
// ─────────────────────────────────────────────────────────────

// 모달이 열린 동안 배경 조작을 막고 기본 포커스를 취소 버튼에 둡니다.
export function syncDuplicateModalFocus(previousFocusId: string): void {
  const dialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  app.querySelectorAll<HTMLElement>(':scope > header, :scope > aside, :scope > main, #detail-backdrop')
    .forEach((element): void => { element.toggleAttribute('inert', Boolean(dialog)); });
  document.body.classList.toggle('has-publication-modal', Boolean(dialog));

  if (dialog) {
    // 같은 확인 요청을 다시 그린 것이면 이전 포커스 자리를 유지하고, 새로 열렸으면 취소 버튼에 둡니다.
    const key = dialog.dataset.confirmationId ?? '';
    const sameDialog = store.duplicateFocusKey === key && previousFocusId;
    const restore = sameDialog ? dialog.querySelector<HTMLElement>(`#${CSS.escape(previousFocusId)}`) : null;
    store.duplicateFocusKey = key;
    (restore ?? dialog.querySelector<HTMLElement>('#cancel-duplicate') ?? dialog).focus();
    return;
  }

  // 모달이 닫혔으면 열기 전 버튼(없으면 발행 결과 영역)으로 포커스를 돌려줍니다.
  if (!store.duplicateFocusKey) return;
  store.duplicateFocusKey = '';
  const button = app.querySelector<HTMLElement>(`#${CSS.escape(store.duplicateReturnFocusId)}:not(:disabled)`);
  const progress = app.querySelector<HTMLElement>('#publication-progress');
  if (progress) progress.tabIndex = -1;
  (button ?? progress)?.focus();
}

// 탭 키가 첫 요소와 마지막 요소 사이에서만 돌도록 가둡니다.
function trapTab(event: KeyboardEvent, first: HTMLElement | undefined, last: HTMLElement | undefined): void {
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

// 중복 글 모달: Escape는 건너뛰기, Tab은 모달 안에서만 순환
function handleDuplicateDialogKeyboard(event: KeyboardEvent, dialog: HTMLElement): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    respondToDuplicate(false, dialog.dataset.scope ?? '', dialog.dataset.confirmationId ?? '');
    return;
  }
  if (event.key !== 'Tab') return;

  const buttons = dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
  trapTab(event, buttons[0], buttons[buttons.length - 1]);
}

// URL 상세 창: Escape는 닫기, Tab은 창 안에서만 순환
function handleDetailDialogKeyboard(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeDetail();
  if (event.key !== 'Tab') return;

  const dialog = app.querySelector<HTMLElement>('.detail-dialog');
  const targets = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE);
  const first = targets?.[0];
  const last = targets?.[targets.length - 1];
  if (!first || !last) return;
  trapTab(event, first, last);
}

// 상세 창에서 탭 키가 배경 화면으로 이동하지 않도록 합니다.
export function handleDialogKeyboard(event: KeyboardEvent): void {
  const duplicateDialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  if (duplicateDialog) {
    handleDuplicateDialogKeyboard(event, duplicateDialog);
    return;
  }
  if (!store.state.selectedId) return;
  handleDetailDialogKeyboard(event);
}

// ─────────────────────────────────────────────────────────────
// 이벤트 연결
// ─────────────────────────────────────────────────────────────

// "계정 변경" 버튼을 누르면 그 사이트의 편집 폼을 열고 계정 목록을 읽습니다.
function openAccountEditor(button: HTMLButtonElement): void {
  if (store.pending || demo) return;
  const site = store.properties.find((item): boolean => item.id === button.dataset.editAccounts && item.clientId === store.state.clientId);
  if (!site) return;

  store.accountEditor = {
    siteId: site.id,
    clientId: site.clientId,
    formId: `site-accounts-${crypto.randomUUID()}`,
    original: {
      google_account_email: site.googleAccountEmail ?? null,
      bing_account_email: site.bingAccountEmail ?? null,
      naver_account_email: site.naverAccountEmail ?? null,
    },
  };
  store.accountEditorError = null;
  render();
  void loadAuthAccounts();
}

// 고객사 화면의 사이트 계정 편집
function bindAccountEditing(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-edit-accounts]').forEach((button): void => {
    button.addEventListener('click', (): void => openAccountEditor(button));
  });

  const accountForm = app.querySelector<HTMLFormElement>('[data-account-editor]');
  accountForm?.addEventListener('submit', (event): void => { void saveSiteAccounts(event); });
  accountForm?.addEventListener('input', (): void => { applyAvailability(); });
  accountForm?.addEventListener('change', (): void => { applyAvailability(); });

  app.querySelector<HTMLButtonElement>('#cancel-site-accounts')?.addEventListener('click', (): void => {
    if (store.pending) return;
    store.accountEditor = null;
    store.accountEditorError = null;
    render();
  });
  app.querySelector<HTMLButtonElement>('#refresh-auth-accounts')?.addEventListener('click', (): void => {
    void loadAuthAccounts();
  });
}

// 왼쪽 메뉴·브랜드·모바일 메뉴 토글·고객사/블로그 선택
function bindNavigation(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      capturePublicationDraft();
      update({ view: button.dataset.view as View, notice: '', mobileNav: false });
      if (store.state.view === 'dashboard') void loadDashboard();
      if (store.state.view === 'register') void loadAuthAccounts();
    });
  });

  app.querySelector<HTMLButtonElement>('#menu-toggle')?.addEventListener('click', (): void => {
    store.state = { ...store.state, mobileNav: !store.state.mobileNav };
    app.querySelector<HTMLElement>('.sidebar')?.classList.toggle('open', store.state.mobileNav);
    app.querySelector<HTMLButtonElement>('#menu-toggle')?.setAttribute('aria-expanded', String(menuExpanded()));
  });

  app.querySelector<HTMLAnchorElement>('.brand')?.addEventListener('click', (event: MouseEvent): void => {
    event.preventDefault();
    update({ view: 'dashboard', mobileNav: false, notice: '' });
    void loadDashboard();
  });

  app.querySelector<HTMLSelectElement>('#client-select')?.addEventListener('change', (event: Event): void => {
    selectClient(valueOf(event));
  });
  app.querySelector<HTMLSelectElement>('#property-select')?.addEventListener('change', (event: Event): void => {
    selectProperty(valueOf(event));
  });
}

// 대시보드의 새로고침과 블로그 행 클릭
function bindDashboard(): void {
  app.querySelector<HTMLButtonElement>('#reload-dashboard')?.addEventListener('click', (): void => {
    void loadDashboard();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-dashboard-site]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      store.state = { ...store.state, view: 'inspect', mobileNav: false };
      selectProperty(button.dataset.dashboardSite ?? '');
    });
  });
}

// 색인 상태 화면: 엔진 탭, 상태 필터, URL 상세, 대상 선택, 저장 결과 읽기, URL 검색
function bindInspection(): void {
  app.querySelectorAll<HTMLButtonElement>('[data-engine]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      if (store.inspectionError?.operation === 'inspect') store.inspectionError = null;
      update({ engine: button.dataset.engine as Engine, filter: 'all', notice: '' });
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => update({ filter: button.dataset.filter as AppState['filter'] }));
  });
  app.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => openDetail(button.dataset.inspect ?? ''));
  });

  app.querySelector<HTMLButtonElement>('#reload-inspection-targets')?.addEventListener('click', (): void => {
    void loadInspectionTargets();
  });
  app.querySelector<HTMLButtonElement>('#read-inspection')?.addEventListener('click', (): void => {
    void loadStoredInspections();
  });
  app.querySelector<HTMLSelectElement>('#inspection-target-select')?.addEventListener('change', (event: Event): void => {
    store.inspectionTargetId = valueOf(event);
    store.storedInspections = [];
    store.state = { ...store.state, notice: '' };
    void loadStoredInspections();
  });

  app.querySelector<HTMLFormElement>('#url-search')?.addEventListener('submit', inspectUrl);
  app.querySelector<HTMLInputElement>('#url-inspect')?.addEventListener('input', (event: Event): void =>
    (event.target as HTMLInputElement).setCustomValidity(''));
}

// 고객사 전체 색인 조회: 실행·취소·작업 탭 선택·API만 계속·네이버 미리보기
function bindClientInspection(): void {
  app.querySelector<HTMLButtonElement>('#refresh-index')?.addEventListener('click', (): void => {
    void refreshClientInspections();
  });
  app.querySelector<HTMLButtonElement>('#cancel-client-inspection')?.addEventListener('click', (): void => clientInspections.cancel());

  app.querySelectorAll<HTMLFormElement>('[data-work-tab-engine]').forEach((form): void => {
    form.addEventListener('submit', (event: SubmitEvent): void => {
      event.preventDefault();
      const engine = form.dataset.workTabEngine;
      const candidateId = form.querySelector<HTMLSelectElement>('select[name="tabId"]')?.value;
      if ((engine === 'naver' || engine === 'bing') && candidateId) {
        void prepareClientWorkTab(form.dataset.scope ?? '', engine, candidateId);
      }
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-refresh-work-tab]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const engine = button.dataset.refreshWorkTab;
      if (engine === 'naver' || engine === 'bing') void prepareClientWorkTab(button.dataset.scope ?? '', engine);
    });
  });

  app.querySelector<HTMLButtonElement>('#continue-api-only')?.addEventListener('click', (event: MouseEvent): void => {
    void continueClientApiOnly((event.currentTarget as HTMLButtonElement).dataset.scope ?? '');
  });
  app.querySelector<HTMLButtonElement>('#read-naver-preview')?.addEventListener('click', (event: MouseEvent): void => {
    if (publicationBusy(publications.getState())) return;
    void clientInspections.readNaver((event.currentTarget as HTMLButtonElement).dataset.scope ?? '');
  });
}

// 등록·IndexNow·발행·고객사 폼 제출과 발행 옵션 체크박스
function bindForms(): void {
  app.querySelector<HTMLFormElement>('#registration-form')?.addEventListener('submit', registerSite);
  app.querySelector<HTMLFormElement>('#indexnow-form')?.addEventListener('submit', saveIndexNowSettings);
  app.querySelector<HTMLFormElement>('#notification-form')?.addEventListener('submit', notifyPublication);
  app.querySelector<HTMLFormElement>('#client-form')?.addEventListener('submit', addClient);

  app.querySelectorAll<HTMLButtonElement>('[data-route]').forEach((button: HTMLButtonElement): void => {
    button.addEventListener('click', (): void => {
      capturePublicationDraft();
      store.requestText = '';
      update({ route: button.dataset.route as NotifyRoute, notice: '' });
    });
  });
  app.querySelector<HTMLInputElement>('#notify-enabled')?.addEventListener('change', (event: Event): void => {
    store.notifyEnabled = (event.target as HTMLInputElement).checked;
    applyAvailability();
  });
  app.querySelector<HTMLInputElement>('#naver-gui-enabled')?.addEventListener('change', (event: Event): void => {
    store.naverGuiEnabled = (event.target as HTMLInputElement).checked;
    applyAvailability();
  });
  app.querySelector<HTMLButtonElement>('#copy-request')?.addEventListener('click', (): void => {
    void copyRequest();
  });
}

// 발행 진행 영역: 네이버 탭 선택·다시 확인·취소
function bindPublication(): void {
  app.querySelectorAll<HTMLFormElement>('[data-publication-tab]').forEach((form): void => {
    form.addEventListener('submit', (event: SubmitEvent): void => {
      event.preventDefault();
      const candidateId = form.querySelector<HTMLSelectElement>('[name="tabId"]')?.value;
      if (candidateId) void publications.chooseTab(form.dataset.scope ?? '', candidateId);
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-refresh-publication-tab]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      void publications.chooseTab(button.dataset.scope ?? '');
    });
  });
  app.querySelector<HTMLButtonElement>('#cancel-publication')?.addEventListener('click', (): void => publications.cancel());
}

// 사이트맵 패널 열기·닫기·제출
function bindSitemap(): void {
  app.querySelector<HTMLButtonElement>('#toggle-sitemap')?.addEventListener('click', (): void => {
    store.sitemapOpen = !store.sitemapOpen;
    render();
    if (store.sitemapOpen) app.querySelector<HTMLInputElement>('#sitemap-url')?.focus();
  });
  app.querySelector<HTMLButtonElement>('#close-sitemap')?.addEventListener('click', (): void => {
    store.sitemapOpen = false;
    render();
    app.querySelector<HTMLButtonElement>('#toggle-sitemap')?.focus();
  });
  app.querySelector<HTMLFormElement>('#sitemap-form')?.addEventListener('submit', (event: SubmitEvent): void => {
    void submitSitemap(event);
  });
}

// 안내 닫기, URL 상세 창, 중복 글 모달
function bindDialogs(): void {
  app.querySelector<HTMLButtonElement>('#dismiss-notice')?.addEventListener('click', (): void => {
    store.state = { ...store.state, notice: '' };
    app.querySelector<HTMLElement>('.success-notice')?.remove();
  });

  app.querySelector<HTMLButtonElement>('#close-detail')?.addEventListener('click', closeDetail);
  app.querySelector<HTMLElement>('#detail-backdrop')?.addEventListener('click', (event: MouseEvent): void => {
    if (event.target === event.currentTarget) closeDetail();
  });

  // 모달의 실행·확인 ID는 그릴 때 고정해 두고, 그 값으로만 응답합니다.
  const duplicateDialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  const duplicateScope = duplicateDialog?.dataset.scope ?? '';
  const duplicateId = duplicateDialog?.dataset.confirmationId ?? '';
  app.querySelector<HTMLButtonElement>('#confirm-duplicate')?.addEventListener('click', (): void => respondToDuplicate(true, duplicateScope, duplicateId));
  app.querySelectorAll<HTMLButtonElement>('#cancel-duplicate, #close-duplicate').forEach((button): void => {
    button.addEventListener('click', (): void => respondToDuplicate(false, duplicateScope, duplicateId));
  });
  app.querySelector<HTMLElement>('#duplicate-backdrop')?.addEventListener('click', (event: MouseEvent): void => {
    if (event.target === event.currentTarget) respondToDuplicate(false, duplicateScope, duplicateId);
  });
}

// 현재 화면의 폼과 탐색 동작을 연결합니다.
export function bindEvents(): void {
  bindErrorActions(app);
  bindAccountEditing();
  bindNavigation();
  bindDashboard();
  bindInspection();
  bindClientInspection();
  bindForms();
  bindPublication();
  bindSitemap();
  bindDialogs();
}
