import { SETTLED_RUN_PHASES, clientInspectionBusy } from '../inspection/client-controller.ts';
import { publicationBusy } from '../publication/controller.ts';
import { accountChanges, addClient, capturePublicationDraft, closeDetail, copyRequest, inspectUrl, notifyPublication, openDetail, registerSite, respondToDuplicate, saveIndexNowSettings, saveSiteAccounts, selectClient, selectProperty, submitSitemap } from './actions.ts';
import { clientInspections, continueClientApiOnly, prepareClientWorkTab, publications, refreshClientInspections } from './controllers.ts';
import { bindErrorActions } from './form-errors.ts';
import { loadAuthAccounts, loadDashboard, loadInspectionTargets, loadStoredInspections } from './loaders.ts';
import { render, update } from './render.ts';
import { app, demo, property, store } from './store.ts';
import type { AppState, Engine, NotifyRoute, View } from '../types.ts';

// 다시 그린 DOM에 이벤트를 연결하고, 상태에 따라 버튼 활성·비활성을 맞추는 함수들

// 네트워크 처리 중 입력과 중복 실행을 막고 폼 자체는 보존합니다.
export function setPending(value: boolean): void {
  store.pending = value;
  app.setAttribute('aria-busy', String(value));
  applyAvailability();
}

// 데이터 준비·활성 사이트·설정 유무에 맞춰 버튼의 실행 가능 여부를 갱신합니다.
export function applyAvailability(): void {
  app
    .querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('button, input, select, textarea')
    .forEach((element): void => {
      element.disabled = store.pending || store.loading;
    });

  if (store.pending || store.loading) return;

  const run = clientInspections.getState();
  const refresh = app.querySelector<HTMLButtonElement>('#refresh-index');

  if (refresh) refresh.disabled = demo || !store.state.clientId || clientInspectionBusy(run) || publicationBusy(publications.getState());

  const cancel = app.querySelector<HTMLButtonElement>('#cancel-client-inspection');

  if (cancel) cancel.disabled = !clientInspectionBusy(run) || run.cancelRequested;

  const naverRead = app.querySelector<HTMLButtonElement>('#read-naver-preview');

  if (naverRead)
    naverRead.disabled =
      !!run.naverPreview?.loading ||
      publicationBusy(publications.getState()) ||
      !SETTLED_RUN_PHASES.includes(run.phase);

  const noSite = !property().id || !property().active;
  const noSitemap = noSite || store.state.engine === 'naver';

  app
    .querySelectorAll<
      HTMLButtonElement | HTMLInputElement
    >('#toggle-sitemap, #sitemap-form input, #sitemap-form button')
    .forEach((element): void => {
      element.disabled = noSitemap;
    });
  app
    .querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >('#notification-form button, #notification-form input, #notification-form select, #notification-form textarea, #indexnow-form input, #indexnow-form button')
    .forEach((element): void => {
      element.disabled = noSite;
    });
  app
    .querySelectorAll<
      HTMLInputElement | HTMLButtonElement
    >('#indexnow-form input, #indexnow-form button')
    .forEach((element): void => {
      element.disabled = noSite || store.settingsLoading;
    });

  const registration = app.querySelector<HTMLButtonElement>(
    '#registration-form button[type="submit"]',
  );

  if (registration) registration.disabled = !store.state.clientId || store.authAccountsLoading || !!store.authAccountsError;
  app.querySelectorAll<HTMLSelectElement>(
    '[name="googleAccountEmail"], [name="bingAccountEmail"]',
  ).forEach((select): void => {
    select.disabled = demo || store.authAccountsLoading || !!store.authAccountsError;
  });
  const refreshAccounts = app.querySelector<HTMLButtonElement>('#refresh-auth-accounts');
  if (refreshAccounts) refreshAccounts.disabled = demo || store.authAccountsLoading;
  const editForm = app.querySelector<HTMLFormElement>('[data-account-editor]');
  const editSave = app.querySelector<HTMLButtonElement>('#save-site-accounts');
  if (editSave) editSave.disabled = demo || store.authAccountsLoading || !!store.authAccountsError ||
    !editForm || !store.accountEditor || !Object.keys(accountChanges(editForm, store.accountEditor.original)).length;
  app.querySelectorAll<HTMLButtonElement>('[data-edit-accounts]').forEach((button): void => {
    button.disabled = demo;
  });

  const search = app.querySelector<HTMLInputElement>('#url-inspect');

  if (search) search.disabled = noSite || (!demo && store.targetsLoading);

  if (!demo) {
    const targetSelect = app.querySelector<HTMLSelectElement>('#inspection-target-select');
    if (targetSelect) targetSelect.disabled = store.targetsLoading || store.inspectionTargets.length === 0;
    const read = app.querySelector<HTMLButtonElement>('#read-inspection');
    if (read) read.disabled = !store.inspectionTargetId || store.inspectionLoading || store.targetsLoading;
  }

  const button = app.querySelector<HTMLButtonElement>('#submit-pages');

  if (button && store.state.route === 'direct') {
    button.disabled =
      noSite || publicationBusy(publications.getState()) || clientInspectionBusy(run) ||
      (store.notifyEnabled && (store.settingsLoading || !!store.settingsError || !property().indexNow?.configured));
    button.textContent = publicationBusy(publications.getState()) ? '발행 알림 처리 중…' : store.notifyEnabled || store.naverGuiEnabled ? '글 저장 및 발행 알림' : '글만 저장';
  }
  if (publicationBusy(publications.getState())) {
    app.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement>(
      '#notification-form input, #notification-form textarea, #notification-form button, [data-route]',
    ).forEach((element): void => { element.disabled = true; });
  }
}

// 모달이 열린 동안 배경 조작을 막고 기본 포커스를 취소 버튼에 둡니다.
export function syncDuplicateModalFocus(previousFocusId: string): void {
  const dialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  app.querySelectorAll<HTMLElement>(':scope > header, :scope > aside, :scope > main, #detail-backdrop')
    .forEach((element): void => { element.toggleAttribute('inert', !!dialog); });
  document.body.classList.toggle('has-publication-modal', !!dialog);
  if (dialog) {
    const key = dialog.dataset.confirmationId ?? '';
    const restore = store.duplicateFocusKey === key && previousFocusId
      ? dialog.querySelector<HTMLElement>(`#${CSS.escape(previousFocusId)}`) : null;
    store.duplicateFocusKey = key;
    (restore ?? dialog.querySelector<HTMLElement>('#cancel-duplicate') ?? dialog).focus();
  } else if (store.duplicateFocusKey) {
    store.duplicateFocusKey = '';
    const button = app.querySelector<HTMLElement>(`#${CSS.escape(store.duplicateReturnFocusId)}:not(:disabled)`);
    const progress = app.querySelector<HTMLElement>('#publication-progress');
    if (progress) progress.tabIndex = -1;
    (button ?? progress)?.focus();
  }
}

// 상세 창에서 탭 키가 배경 화면으로 이동하지 않도록 합니다.
export function handleDialogKeyboard(event: KeyboardEvent): void {
  const duplicateDialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  if (duplicateDialog) {
    if (event.key === 'Escape') {
      event.preventDefault();
      respondToDuplicate(false, duplicateDialog.dataset.scope ?? '', duplicateDialog.dataset.confirmationId ?? '');
      return;
    }
    if (event.key === 'Tab') {
      const buttons = duplicateDialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }
    return;
  }
  if (!store.state.selectedId) return;

  if (event.key === 'Escape') closeDetail();

  if (event.key !== 'Tab') return;

  const dialog = app.querySelector<HTMLElement>('.detail-dialog');
  const targets = dialog?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea');
  const first = targets?.[0];
  const last = targets?.[targets.length - 1];
  if (!first || !last) return;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

// 현재 화면의 폼과 탐색 동작을 연결합니다.
export function bindEvents(): void {
  bindErrorActions(app);
  app.querySelectorAll<HTMLButtonElement>('[data-edit-accounts]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      if (store.pending || demo) return;
      const site = store.properties.find((item): boolean => item.id === button.dataset.editAccounts && item.clientId === store.state.clientId);
      if (!site) return;
      store.accountEditor = {
        siteId: site.id, clientId: site.clientId, formId: `site-accounts-${crypto.randomUUID()}`,
        original: {
          google_account_email: site.googleAccountEmail ?? null,
          bing_account_email: site.bingAccountEmail ?? null,
          naver_account_email: site.naverAccountEmail ?? null,
        },
      };
      store.accountEditorError = null;
      render();
      void loadAuthAccounts();
    });
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
  app
    .querySelectorAll<HTMLButtonElement>('[data-view]')
    .forEach((button: HTMLButtonElement): void => {
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
    app
      .querySelector<HTMLButtonElement>('#menu-toggle')
      ?.setAttribute(
        'aria-expanded',
        String(window.matchMedia('(max-width:760px)').matches ? store.state.mobileNav : !store.state.mobileNav),
      );
  });
  app
    .querySelector<HTMLAnchorElement>('.brand')
    ?.addEventListener('click', (event: MouseEvent): void => {
      event.preventDefault();
      update({ view: 'dashboard', mobileNav: false, notice: '' });
      void loadDashboard();
    });
  app
    .querySelector<HTMLSelectElement>('#client-select')
    ?.addEventListener('change', (event: Event): void => {
      selectClient((event.target as HTMLSelectElement).value);
    });
  app
    .querySelector<HTMLSelectElement>('#property-select')
    ?.addEventListener('change', (event: Event): void => {
      selectProperty((event.target as HTMLSelectElement).value);
    });
  app.querySelector<HTMLButtonElement>('#reload-dashboard')?.addEventListener('click', (): void => {
    void loadDashboard();
  });
  app.querySelectorAll<HTMLButtonElement>('[data-dashboard-site]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      store.state = { ...store.state, view: 'inspect', mobileNav: false };
      selectProperty(button.dataset.dashboardSite ?? '');
    });
  });
  app
    .querySelectorAll<HTMLButtonElement>('[data-engine]')
    .forEach((button: HTMLButtonElement): void => {
      button.addEventListener('click', (): void => {
        if (store.inspectionError?.operation === 'inspect') store.inspectionError = null;
        update({ engine: button.dataset.engine as Engine, filter: 'all', notice: '' });
      });
    });
  app
    .querySelectorAll<HTMLButtonElement>('[data-filter]')
    .forEach((button: HTMLButtonElement): void => {
      button.addEventListener('click', (): void =>
        update({ filter: button.dataset.filter as AppState['filter'] }),
      );
    });
  app
    .querySelectorAll<HTMLButtonElement>('[data-route]')
    .forEach((button: HTMLButtonElement): void => {
      button.addEventListener('click', (): void => {
        capturePublicationDraft();
        store.requestText = '';
        update({ route: button.dataset.route as NotifyRoute, notice: '' });
      });
    });
  app
    .querySelectorAll<HTMLButtonElement>('[data-inspect]')
    .forEach((button: HTMLButtonElement): void => {
      button.addEventListener('click', (): void => openDetail(button.dataset.inspect ?? ''));
    });
  app
    .querySelector<HTMLFormElement>('#registration-form')
    ?.addEventListener('submit', registerSite);
  app
    .querySelector<HTMLFormElement>('#indexnow-form')
    ?.addEventListener('submit', saveIndexNowSettings);
  app
    .querySelector<HTMLFormElement>('#notification-form')
    ?.addEventListener('submit', notifyPublication);
  app.querySelector<HTMLFormElement>('#client-form')?.addEventListener('submit', addClient);
  app
    .querySelector<HTMLButtonElement>('#reload-inspection-targets')
    ?.addEventListener('click', (): void => {
      void loadInspectionTargets();
    });
  app.querySelector<HTMLButtonElement>('#read-inspection')?.addEventListener('click', (): void => {
    void loadStoredInspections();
  });
  app
    .querySelector<HTMLSelectElement>('#inspection-target-select')
    ?.addEventListener('change', (event: Event): void => {
      store.inspectionTargetId = (event.target as HTMLSelectElement).value;
      store.storedInspections = [];
      store.state = { ...store.state, notice: '' };
      void loadStoredInspections();
    });
  app
    .querySelector<HTMLInputElement>('#notify-enabled')
    ?.addEventListener('change', (event: Event): void => {
      store.notifyEnabled = (event.target as HTMLInputElement).checked;
      applyAvailability();
    });
  app.querySelector<HTMLInputElement>('#naver-gui-enabled')
    ?.addEventListener('change', (event: Event): void => {
      store.naverGuiEnabled = (event.target as HTMLInputElement).checked;
      applyAvailability();
    });
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
  app.querySelector<HTMLButtonElement>('#cancel-publication')
    ?.addEventListener('click', (): void => publications.cancel());
  app.querySelector<HTMLFormElement>('#url-search')?.addEventListener('submit', inspectUrl);
  app
    .querySelector<HTMLInputElement>('#url-inspect')
    ?.addEventListener('input', (event: Event): void =>
      (event.target as HTMLInputElement).setCustomValidity(''),
    );
  app.querySelector<HTMLButtonElement>('#refresh-index')?.addEventListener('click', (): void => {
    void refreshClientInspections();
  });
  app
    .querySelector<HTMLButtonElement>('#cancel-client-inspection')
    ?.addEventListener('click', (): void => clientInspections.cancel());
  app.querySelectorAll<HTMLFormElement>('[data-work-tab-engine]').forEach((form): void => {
    form.addEventListener('submit', (event: SubmitEvent): void => {
      event.preventDefault();
      const engine = form.dataset.workTabEngine;
      const candidateId = form.querySelector<HTMLSelectElement>('select[name="tabId"]')?.value;
      if ((engine === 'naver' || engine === 'bing') && candidateId)
        void prepareClientWorkTab(form.dataset.scope ?? '', engine, candidateId);
    });
  });
  app.querySelectorAll<HTMLButtonElement>('[data-refresh-work-tab]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      const engine = button.dataset.refreshWorkTab;
      if (engine === 'naver' || engine === 'bing')
        void prepareClientWorkTab(button.dataset.scope ?? '', engine);
    });
  });
  app
    .querySelector<HTMLButtonElement>('#continue-api-only')
    ?.addEventListener('click', (event: MouseEvent): void => {
      void continueClientApiOnly((event.currentTarget as HTMLButtonElement).dataset.scope ?? '');
    });
  app
    .querySelector<HTMLButtonElement>('#read-naver-preview')
    ?.addEventListener('click', (event: MouseEvent): void => {
      if (publicationBusy(publications.getState())) return;
      void clientInspections.readNaver(
        (event.currentTarget as HTMLButtonElement).dataset.scope ?? '',
      );
    });
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
  app
    .querySelector<HTMLFormElement>('#sitemap-form')
    ?.addEventListener('submit', (event: SubmitEvent): void => {
      void submitSitemap(event);
    });
  app.querySelector<HTMLButtonElement>('#dismiss-notice')?.addEventListener('click', (): void => {
    store.state = { ...store.state, notice: '' };
    app.querySelector<HTMLElement>('.success-notice')?.remove();
  });
  app.querySelector<HTMLButtonElement>('#close-detail')?.addEventListener('click', closeDetail);
  const duplicateDialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  const duplicateScope = duplicateDialog?.dataset.scope ?? '';
  const duplicateId = duplicateDialog?.dataset.confirmationId ?? '';
  app.querySelector<HTMLButtonElement>('#confirm-duplicate')
    ?.addEventListener('click', (): void => respondToDuplicate(true, duplicateScope, duplicateId));
  app.querySelectorAll<HTMLButtonElement>('#cancel-duplicate, #close-duplicate').forEach((button): void => {
    button.addEventListener('click', (): void => respondToDuplicate(false, duplicateScope, duplicateId));
  });
  app.querySelector<HTMLElement>('#duplicate-backdrop')?.addEventListener('click', (event: MouseEvent): void => {
    if (event.target === event.currentTarget) respondToDuplicate(false, duplicateScope, duplicateId);
  });
  app.querySelector<HTMLButtonElement>('#copy-request')?.addEventListener('click', (): void => {
    void copyRequest();
  });
  app
    .querySelector<HTMLElement>('#detail-backdrop')
    ?.addEventListener('click', (event: MouseEvent): void => {
      if (event.target === event.currentTarget) closeDetail();
    });
}
