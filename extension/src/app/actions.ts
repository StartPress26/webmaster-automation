import { clientProperties, clientSelection } from '../dashboard.ts';
import { ENGINE_NAMES } from '../engines/labels.ts';
import { ApiError, asAppError, presentError } from '../errors.ts';
import { validateIndexNowSettings } from '../indexnow.ts';
import { clientInspectionBusy } from '../inspection/client-controller.ts';
import { publicationBusy } from '../publication/controller.ts';
import { clientInspections, publications } from './controllers.ts';
import { setPending } from './events.ts';
import { clearFormErrors, showError } from './form-errors.ts';
import { loadDashboard, loadInspectionTargets, loadSettings, loadStoredInspections, mapSite } from './loaders.ts';
import { render, update } from './render.ts';
import { addActivity, api, app, currentRows, demo, property, store } from './store.ts';
import { parseUrl, targetUrl } from './urls.ts';
import type { Inspection, InspectionTarget, PageOutcome, Property, SiteAuthAccounts, SiteAuthAccountsUpdate } from '../types.ts';

// 사용자 동작(선택·폼 제출·버튼)에 반응해 상태를 바꾸고 서버에 요청하는 함수들

// 선택 블로그의 초안·결과를 분리하고 이전 설정 요청을 무효화합니다.
export function selectProperty(id: string): void {
  if (id && !clientProperties(store.properties, store.state.clientId).some((site): boolean => site.id === id))
    return;

  store.notificationDraft = '';
  store.notificationTitles = '';
  store.naverGuiEnabled = false;
  store.requestText = '';
  store.outcomes = store.outcomeHistory.get(id) ?? [];
  store.outcomesError = null;
  store.settingsError = null;
  store.settingsLoading = false;
  ++store.settingsRequest;
  update({ propertyId: id, filter: 'all', selectedId: null, notice: '' });
  void loadSettings();
  void loadInspectionTargets();
}

// 고객사를 바꾸면 소속 블로그로 선택을 제한하고 통계를 다시 읽습니다.
export function selectClient(id: string): void {
  if (!store.clients.some((client): boolean => client.id === id)) return;

  if (id !== store.state.clientId) {
    store.activities = [];
    store.accountEditor = null;
    store.accountEditorError = null;
  }

  store.state = { ...store.state, ...clientSelection(store.properties, id), notice: '' };
  store.dashboardData = null;
  store.dashboardError = null;
  selectProperty(store.state.propertyId);
  void loadDashboard();
}

// 결과 불명인 글의 저장만 GET으로 확인하며 알림은 다시 전송하지 않습니다.
export async function verifySavedPages(): Promise<void> {
  if (store.pending || !property().id) return;

  setPending(true);
  store.outcomesError = null;

  try {
    const pages = demo ? [] : await api.listPages(property().id);

    store.outcomes = store.outcomes.map((item: PageOutcome): PageOutcome => {
      if (item.saveStatus !== 'unknown') return item;
      const found = pages.some((page): boolean => page.url === item.article.url);
      return found
        ? {
            ...item,
            saveStatus: 'saved',
            error: undefined,
            message:
              'DB 저장을 확인했습니다. 알림 접수 여부는 확인할 수 없으며 다시 전송하지 않았습니다.',
          }
        : {
            ...item,
            message:
              '현재 목록에서 확인되지 않았습니다. 아직 처리 중일 수 있으므로 미저장으로 단정하거나 다시 전송하지 않습니다.',
          };
    });
    store.outcomeHistory = new Map([...store.outcomeHistory, [property().id, store.outcomes]]);
  } catch (error: unknown) {
    store.outcomesError = asAppError(error);
  } finally {
    setPending(false);
    render();
  }
}

// 검색창의 URL을 현재 예시 관측 기록에서 찾아 상세 결과를 엽니다.
export function inspectUrl(event: SubmitEvent): void {
  event.preventDefault();

  const input = app.querySelector<HTMLInputElement>('#url-inspect');
  if (!input) return;

  input.setCustomValidity('');

  try {
    const url = targetUrl(input.value.trim(), true);

    if (!demo) {
      const target = store.inspectionTargets.find(
        (item: InspectionTarget): boolean => new URL(item.url).href === url.href,
      );
      if (!target)
        throw new Error(
          '먼저 글을 DB에 등록하세요. 저장된 메인페이지·글 URL만 선택할 수 있습니다.',
        );

      store.inspectionTargetId = target.id;
      store.storedInspections = [];
      update({ view: 'inspect', notice: '', mobileNav: false });
      void loadStoredInspections();

      return;
    }

    const row = currentRows().find(
      (item: Inspection): boolean => new URL(item.path, property().origin).href === url.href,
    );

    if (!row) {
      update({
        view: 'inspect',
        notice: '이 URL의 예시 관측 기록이 없습니다. 실제 API를 연결한 뒤 조회할 수 있습니다.',
      });
      return;
    }

    openDetail(row.id);
  } catch (error: unknown) {
    input.setCustomValidity(error instanceof Error ? error.message : 'URL을 확인하세요.');
    input.reportValidity();
  }
}

// 폼과 편집 시작 시 값을 비교해 변경된 필드만 반환합니다.
export function accountChanges(form: HTMLFormElement, original: SiteAuthAccounts): SiteAuthAccountsUpdate {
  const data = new FormData(form);
  const fields = [
    ['google_account_email', 'googleAccountEmail'],
    ['bing_account_email', 'bingAccountEmail'],
    ['naver_account_email', 'naverAccountEmail'],
  ] as const;
  return Object.fromEntries(fields.flatMap(([key, name]) => {
    const value = String(data.get(name) ?? '').trim() || null;
    return value === original[key] ? [] : [[key, value]];
  }));
}

// 편집 대상 사이트를 고정해 차이만 저장하고 실패 시 입력을 유지합니다.
export async function saveSiteAccounts(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (store.pending || demo || !store.accountEditor || store.authAccountsLoading || store.authAccountsError) return;
  const editor = store.accountEditor;
  const form = event.currentTarget as HTMLFormElement;
  const changes = accountChanges(form, editor.original);
  if (!Object.keys(changes).length) return;
  store.accountEditorError = null;
  try {
    for (const key of ['google_account_email', 'bing_account_email'] as const) {
      const email = changes[key];
      if (email && !store.authAccounts.some((account): boolean => account.email === email))
        throw new Error('목록에 없는 인증 계정입니다. 사용할 계정을 다시 선택하세요.');
    }
    setPending(true);
    const saved = await api.updateSiteAuthAccounts(editor.siteId, changes);
    if (saved.client_id !== editor.clientId) throw new ApiError(0, '계정 변경 응답의 고객사가 다릅니다.', {
      code: 'INVALID_RESPONSE', operation: 'save',
    });
    store.properties = store.properties.map((site): Property => site.id === editor.siteId
      ? { ...mapSite(saved), indexNow: site.indexNow } : site);
    if (store.accountEditor?.formId === editor.formId) {
      store.accountEditor = null;
      store.state = { ...store.state, notice: '사이트 계정 연결을 저장했습니다.', noticeTone: 'success' };
    }
  } catch (error: unknown) {
    if (store.accountEditor?.formId === editor.formId) store.accountEditorError = asAppError(error, 'save');
  } finally {
    store.pending = false;
    render();
  }
}

// 새 도메인을 예시 목록에 추가하되 검색엔진 등록 완료로 처리하지 않습니다.
export async function registerSite(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (store.pending || !store.state.clientId || store.authAccountsLoading || store.authAccountsError) return;

  const form = event.currentTarget as HTMLFormElement;

  clearFormErrors(form);

  const data = new FormData(form);

  try {
    const name = String(data.get('siteName') ?? '').trim();
    if (!name) throw new Error('사이트 이름을 입력하세요.');

    const url = parseUrl(String(data.get('origin') ?? '').trim());
    if (url.pathname !== '/' || url.search)
      throw new Error('경로나 쿼리가 없는 도메인 루트 주소를 입력하세요.');

    const indexNow = validateIndexNowSettings(
      url.origin,
      String(data.get('indexnowKey') ?? ''),
      String(data.get('indexnowLocation') ?? ''),
    );
    const editable = String(data.get('editable') ?? '');
    for (const field of ['googleAccountEmail', 'bingAccountEmail']) {
      const email = String(data.get(field) ?? '');
      if (email && !store.authAccounts.some((account): boolean => account.email === email))
        throw new Error('목록에 없는 인증 계정입니다. 사용할 계정을 다시 선택하세요.');
    }
    const payload = {
      client_id: store.state.clientId,
      name,
      url: url.href,
      owner_type:
        data.get('ownership') === 'internal' ? ('internal' as const) : ('client' as const),
      cms_type: String(data.get('cmsType') ?? '') || null,
      can_edit_site: editable === '' ? null : editable === 'true',
      google_account_email: String(data.get('googleAccountEmail') ?? '').trim() || null,
      bing_account_email: String(data.get('bingAccountEmail') ?? '').trim() || null,
      naver_account_email: String(data.get('naverAccountEmail') ?? '').trim() || null,
      indexnow_key: indexNow?.key ?? null,
      indexnow_key_location: indexNow?.keyLocation ?? null,
    };

    setPending(true);

    const site: Property = demo
      ? {
          id: crypto.randomUUID(),
          clientId: payload.client_id,
          name,
          origin: url.origin,
          siteUrl: url.href,
          active: true,
          owned: payload.owner_type === 'internal',
          googleAccountEmail: payload.google_account_email,
          bingAccountEmail: payload.bing_account_email,
          naverAccountEmail: payload.naver_account_email,
          indexNow: indexNow
            ? { configured: true, key_location: indexNow.keyLocation }
            : { configured: false, key_location: null },
        }
      : mapSite(await api.addSite(payload));

    store.properties = [...store.properties, site];
    store.pending = false;
    form.reset();
    addActivity(`${name} 사이트 정보 저장`);
    store.dashboardData = null;
    store.outcomes = [];
    store.outcomesError = null;
    store.notificationDraft = '';
    store.notificationTitles = '';
    store.requestText = '';
    update({
      propertyId: site.id,
      notice: `${name}: ${demo ? '예시 목록' : 'DB'}에 사이트 정보를 저장했습니다. 검색엔진 등록·소유 확인을 완료한 것은 아닙니다.`,
    });

    if (!demo) await Promise.all([loadSettings(), loadInspectionTargets()]);
  } catch (error: unknown) {
    showError('#registration-error', error);
  } finally {
    setPending(false);
  }
}

// 화면을 다시 그리기 전에 글 제목과 URL 입력값을 보존합니다.
export function capturePublicationDraft(): void {
  store.notificationDraft =
    app.querySelector<HTMLTextAreaElement>('[name="urls"]')?.value ?? store.notificationDraft;
  store.notificationTitles =
    app.querySelector<HTMLTextAreaElement>('[name="titles"]')?.value ?? store.notificationTitles;
}

// 기존 사이트의 예시 설정을 저장하되 설치 검증은 수행하지 않습니다.
export async function saveIndexNowSettings(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (store.pending || !property().id) return;

  const form = event.currentTarget as HTMLFormElement;

  clearFormErrors(form);

  const data = new FormData(form);

  try {
    const indexNow = validateIndexNowSettings(
      property().siteUrl,
      String(data.get('indexnowKey') ?? ''),
      String(data.get('indexnowLocation') ?? ''),
    );
    if (!indexNow) throw new Error('저장할 키와 키 파일 URL을 함께 입력하세요.');

    capturePublicationDraft();
    setPending(true);

    const settings = demo
      ? { configured: true, key_location: indexNow.keyLocation }
      : await api.putSettings(property().id, indexNow);

    store.properties = store.properties.map(
      (item: Property): Property =>
        item.id === store.state.propertyId ? { ...item, indexNow: settings } : item,
    );
    store.settingsError = null;
    store.pending = false;
    form.reset();
    update({
      notice: `${demo ? '예시 설정' : 'IndexNow 설정'}을 저장했습니다. 키 원문은 화면에 보관하지 않으며, 파일 설치·접수 확인은 별도입니다.`,
    });
  } catch (error: unknown) {
    showError('#indexnow-error', error);
  } finally {
    setPending(false);
  }
}

// 선택한 처리 경로에 따라 발행 배치를 시작하거나 전달 문구를 준비합니다.
export async function notifyPublication(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (store.pending || !property().id || !property().active || publicationBusy(publications.getState()) ||
      clientInspectionBusy(clientInspections.getState())) return;

  const form = event.currentTarget as HTMLFormElement;

  clearFormErrors(form);

  const data = new FormData(form);

  store.notificationDraft = String(data.get('urls') ?? '');
  store.notificationTitles = String(data.get('titles') ?? '');

  try {
    const titles = store.notificationTitles
      .split(/\r?\n/)
      .map((line: string): string => line.trim())
      .filter(Boolean);
    const urls = store.notificationDraft
      .split(/\r?\n/)
      .map((line: string): string => line.trim())
      .filter(Boolean)
      .map((line: string): string => targetUrl(line).href);
    if (!urls.length || titles.length !== urls.length)
      throw new Error(
        '제목과 URL을 같은 순서로 한 줄씩 입력하세요. 제목과 URL 개수가 같아야 합니다.',
      );
    if (new Set(urls).size !== urls.length)
      throw new Error('중복 URL을 제거하고 제목과 순서를 맞춰 주세요.');
    if (urls.length > 50) throw new Error('한 번에 최대 50개 글을 처리할 수 있습니다.');

    const articles = urls.map((url: string, index: number) => ({ name: titles[index], url }));
    const description = articles
      .map((article): string => `${article.name}\n${article.url}`)
      .join('\n\n');

    if (store.state.route !== 'direct') {
      store.requestText =
        store.state.route === 'request'
          ? `${property().name} 담당자님께\n\n아래 신규 글의 검색엔진 제출과 접수 결과 확인을 부탁드립니다.\n\n${description}\n\n${String(data.get('note') ?? '').trim()}`.trim()
          : `우리 블로그에 소개할 고객사 글\n\n${description}\n\n후속 작업: 소개 글 작성 → 링크 추가 → 검토 → 발행`;
      update({
        notice: '문구를 준비했습니다. 글 DB 저장·고객사 전달·블로그 발행은 실행하지 않았습니다.',
      });
      return;
    }

    store.notifyEnabled = data.get('notify') === 'on';

    if (store.notifyEnabled && (!property().indexNow?.configured || store.settingsLoading || store.settingsError))
      throw new Error('IndexNow 설정을 확인하거나 알림 체크를 해제해 글만 저장하세요.');

    const id = property().id;
    if (articles.some((article): boolean => store.uncertainSaves.has(`${id}:${article.url}`)))
      throw new Error(
        '저장 여부가 불명확한 URL이 포함되어 있습니다. 아래 결과를 확인하고 해당 URL을 입력에서 제외하세요. 자동 재시도하지 않습니다.',
      );

    store.requestText = '';
    store.outcomesError = null;
    const site = property();
    await publications.start({
      clientId: site.clientId,
      siteId: site.id,
      siteName: site.name,
      siteUrl: site.siteUrl,
      articles,
      notify: store.notifyEnabled,
      gui: data.get('naverGui') === 'on',
      demo,
    });
  } catch (error: unknown) {
    showError('#notification-error', error);
  }
}

// 새 고객사를 예시 데이터에 추가합니다.
export async function addClient(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (store.pending) return;

  const form = event.currentTarget as HTMLFormElement;

  clearFormErrors(form);

  const data = new FormData(form);
  const name = String(data.get('clientName') ?? '').trim();
  if (!name) return showError('#client-error', new Error('고객사 이름을 입력하세요.'));

  try {
    setPending(true);

    const result = demo
      ? { id: crypto.randomUUID(), name, manager_name: String(data.get('manager') ?? '').trim() }
      : await api.addClient(name, String(data.get('manager') ?? '').trim());

    store.clients = [
      ...store.clients,
      { id: result.id, name: result.name, manager: result.manager_name ?? '' },
    ];
    store.pending = false;
    form.reset();
    store.state = { ...store.state, view: 'dashboard' };
    selectClient(result.id);
    update({ notice: `${result.name}: ${demo ? '예시 목록' : 'DB'}에 고객사를 저장했습니다.` });
  } catch (error: unknown) {
    showError('#client-error', error);
  } finally {
    setPending(false);
  }
}

// 사용자가 명시적으로 제출하며 예시 모드에서는 네트워크 요청을 보내지 않습니다.
export async function submitSitemap(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const site = property();
  const engine = store.state.engine;
  if (store.pending || store.loading || !site.id || !site.active || engine === 'naver') return;

  const form = event.currentTarget as HTMLFormElement;
  const input = form.querySelector<HTMLInputElement>('#sitemap-url');
  if (!input || !form.reportValidity()) return;

  try {
    const sitemapUrl = parseUrl(input.value.trim());
    if (sitemapUrl.origin !== new URL(site.siteUrl).origin)
      throw new Error('선택한 사이트와 같은 도메인·프로토콜·포트의 사이트맵 URL을 입력하세요.');

    if (demo) {
      store.sitemapFeedback = {
        siteId: site.id,
        engine,
        message: '예시 모드입니다. 실제 사이트맵 제출은 실행하지 않았습니다.',
        failed: false,
      };
      return;
    }

    setPending(true);
    form.querySelector('.sitemap-feedback')?.remove();

    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

    if (button) button.textContent = '제출 중…';

    await api.submitSitemap(site.id, engine, sitemapUrl.href);
    store.sitemapFeedback = {
      siteId: site.id,
      engine,
      message: `${ENGINE_NAMES[engine]} 사이트맵 제출 접수 완료. 수집·색인 반영에는 시간이 걸릴 수 있습니다.`,
      failed: false,
    };
  } catch (error: unknown) {
    const failure = asAppError(error, 'submit');
    const uncertain = ['network', 'timeout', 'response', 'server'].includes(failure.kind);
    const advice = uncertain
      ? '접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.'
      : presentError(failure, '').advice;
    store.sitemapFeedback = {
      siteId: site.id,
      engine,
      message: `${failure.message} ${advice}`,
      failed: true,
    };
  } finally {
    setPending(false);
    render();
    if (store.state.view === 'inspect' && store.state.propertyId === site.id && store.state.engine === engine)
      app.querySelector<HTMLElement>('.sitemap-feedback')?.scrollIntoView?.({ block: 'nearest' });
  }
}

// URL 상세 창을 열고 키보드 포커스를 창 안으로 이동합니다.
export function openDetail(id: string): void {
  update({ selectedId: id });
  app.querySelector<HTMLButtonElement>('#close-detail')?.focus();
}

// 상세 창을 닫고 해당 URL의 버튼으로 포커스를 복원합니다.
export function closeDetail(): void {
  const id = store.state.selectedId;
  update({ selectedId: null });
  if (id) app.querySelector<HTMLButtonElement>(`[data-inspect="${CSS.escape(id)}"]`)?.focus();
}

// 화면에 표시했던 실행·확인 ID만 전달하고 승인 버튼의 중복 클릭을 막습니다.
export function respondToDuplicate(approved: boolean, scope: string, confirmationId: string): void {
  const dialog = app.querySelector<HTMLElement>('#duplicate-dialog');
  if (!dialog || dialog.dataset.scope !== scope || dialog.dataset.confirmationId !== confirmationId) return;
  dialog.querySelectorAll<HTMLButtonElement>('button').forEach((button): void => {
    button.disabled = true;
  });
  publications.confirmDuplicate(scope, confirmationId, approved);
}

// 전달 문구를 복사하고 실패할 경우 선택 가능한 원문을 유지합니다.
export async function copyRequest(): Promise<void> {
  try {
    await navigator.clipboard.writeText(store.requestText);
    const button = app.querySelector<HTMLButtonElement>('#copy-request');
    if (button) button.textContent = '복사했습니다';
  } catch {
    const result = app.querySelector<HTMLElement>('.request-result pre');
    const range = document.createRange();
    if (!result) return;

    range.selectNodeContents(result);

    const selection = window.getSelection();

    selection?.removeAllRanges();
    selection?.addRange(range);

    const button = app.querySelector<HTMLButtonElement>('#copy-request');

    if (button) button.textContent = '선택된 문구를 복사하세요';
  }
}
