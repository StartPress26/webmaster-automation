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
import type { IndexNowSettings } from '../types.ts';
import type { Article, Inspection, InspectionTarget, PageOutcome, Property, SiteAuthAccounts, SiteAuthAccountsUpdate, SiteWrite } from '../types.ts';

// 사용자 동작(선택·폼 제출·버튼)에 반응해 상태를 바꾸고 서버에 요청하는 함수들

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 한 번에 발행 알림을 처리할 수 있는 최대 글 수
const MAX_ARTICLES = 50;
// 사이트맵 제출 결과가 접수됐는지 알 수 없는 오류 종류
const UNCERTAIN_SITEMAP_KINDS: readonly string[] = ['network', 'timeout', 'response', 'server'];
// 사이트 계정 폼의 (서버 필드, 입력칸 name) 짝
const ACCOUNT_FIELDS = [
  ['google_account_email', 'googleAccountEmail'],
  ['bing_account_email', 'bingAccountEmail'],
  ['naver_account_email', 'naverAccountEmail'],
] as const;
// 인증 계정 목록에 있어야 하는 입력칸 (네이버는 참고용이라 검사하지 않음)
const API_ACCOUNT_INPUTS: readonly string[] = ['googleAccountEmail', 'bingAccountEmail'];

// ─────────────────────────────────────────────────────────────
// 공용 도우미
// ─────────────────────────────────────────────────────────────

// FormData에서 문자열 값을 꺼내 양끝 공백을 없앱니다. 없으면 빈 문자열입니다.
function fieldText(data: FormData, name: string): string {
  return String(data.get(name) ?? '').trim();
}

// 한 줄에 하나씩 입력한 텍스트를 빈 줄 없이 나눕니다.
function nonEmptyLines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line: string): string => line.trim())
    .filter(Boolean);
}

// 이메일이 비어 있지 않은데 인증 계정 목록에 없으면 예외를 던집니다.
function assertKnownAccount(email: string | null | undefined): void {
  if (!email) return;
  if (!store.authAccounts.some((account): boolean => account.email === email)) {
    throw new Error('목록에 없는 인증 계정입니다. 사용할 계정을 다시 선택하세요.');
  }
}

// ─────────────────────────────────────────────────────────────
// 고객사·사이트 선택
// ─────────────────────────────────────────────────────────────

// 선택 블로그의 초안·결과를 분리하고 이전 설정 요청을 무효화합니다.
export function selectProperty(id: string): void {
  const belongsToClient = clientProperties(store.properties, store.state.clientId).some((site): boolean => site.id === id);
  if (id && !belongsToClient) return;

  store.notificationDraft = '';
  store.notificationTitles = '';
  store.naverGuiEnabled = false;
  store.requestText = '';
  store.outcomes = store.outcomeHistory.get(id) ?? [];
  store.outcomesError = null;
  store.settingsError = null;
  store.settingsLoading = false;
  store.settingsRequest += 1;
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

// ─────────────────────────────────────────────────────────────
// 저장 여부 확인·URL 검사
// ─────────────────────────────────────────────────────────────

// 저장 여부가 불명확했던 글이 서버 목록에 있으면 저장 확인으로, 없으면 안내만 바꿉니다.
function verifiedOutcome(item: PageOutcome, pageUrls: ReadonlySet<string>): PageOutcome {
  if (item.saveStatus !== 'unknown') return item;
  if (pageUrls.has(item.article.url)) {
    return {
      ...item,
      saveStatus: 'saved',
      error: undefined,
      message: 'DB 저장을 확인했습니다. 알림 접수 여부는 확인할 수 없으며 다시 전송하지 않았습니다.',
    };
  }
  return {
    ...item,
    message: '현재 목록에서 확인되지 않았습니다. 아직 처리 중일 수 있으므로 미저장으로 단정하거나 다시 전송하지 않습니다.',
  };
}

// 결과 불명인 글의 저장만 GET으로 확인하며 알림은 다시 전송하지 않습니다.
export async function verifySavedPages(): Promise<void> {
  if (store.pending || !property().id) return;

  setPending(true);
  store.outcomesError = null;

  try {
    const pages = demo ? [] : await api.listPages(property().id);
    const pageUrls = new Set(pages.map((page): string => page.url));
    store.outcomes = store.outcomes.map((item: PageOutcome): PageOutcome => verifiedOutcome(item, pageUrls));
    store.outcomeHistory = new Map([...store.outcomeHistory, [property().id, store.outcomes]]);
  } catch (error: unknown) {
    store.outcomesError = asAppError(error);
  } finally {
    setPending(false);
    render();
  }
}

// API 모드: 저장된 조회 대상 중 이 URL을 찾아 검사 화면에서 저장 결과를 엽니다.
function openStoredTarget(url: URL): void {
  const target = store.inspectionTargets.find(
    (item: InspectionTarget): boolean => new URL(item.url).href === url.href,
  );
  if (!target) {
    throw new Error('먼저 글을 DB에 등록하세요. 저장된 메인페이지·글 URL만 선택할 수 있습니다.');
  }

  store.inspectionTargetId = target.id;
  store.storedInspections = [];
  update({ view: 'inspect', notice: '', mobileNav: false });
  void loadStoredInspections();
}

// 예시 모드: 예시 관측 기록에서 이 URL을 찾아 상세 창을 엽니다.
function openDemoRow(url: URL): void {
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
}

// 검색창의 URL을 현재 예시 관측 기록에서 찾아 상세 결과를 엽니다.
export function inspectUrl(event: SubmitEvent): void {
  event.preventDefault();

  const input = app.querySelector<HTMLInputElement>('#url-inspect');
  if (!input) return;
  input.setCustomValidity('');

  try {
    const url = targetUrl(input.value.trim(), true);
    if (demo) openDemoRow(url);
    else openStoredTarget(url);
  } catch (error: unknown) {
    input.setCustomValidity(error instanceof Error ? error.message : 'URL을 확인하세요.');
    input.reportValidity();
  }
}

// ─────────────────────────────────────────────────────────────
// 사이트 계정 변경
// ─────────────────────────────────────────────────────────────

// 폼과 편집 시작 시 값을 비교해 변경된 필드만 반환합니다.
export function accountChanges(form: HTMLFormElement, original: SiteAuthAccounts): SiteAuthAccountsUpdate {
  const data = new FormData(form);
  const changed = ACCOUNT_FIELDS.flatMap(([key, name]) => {
    const value = fieldText(data, name) || null;
    return value === original[key] ? [] : [[key, value] as const];
  });
  return Object.fromEntries(changed);
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
    assertKnownAccount(changes.google_account_email);
    assertKnownAccount(changes.bing_account_email);
    setPending(true);

    const saved = await api.updateSiteAuthAccounts(editor.siteId, changes);
    if (saved.client_id !== editor.clientId) {
      throw new ApiError(0, '계정 변경 응답의 고객사가 다릅니다.', { code: 'INVALID_RESPONSE', operation: 'save' });
    }

    // 응답으로 사이트를 갱신하되 이미 읽어 둔 IndexNow 설정은 유지합니다.
    store.properties = store.properties.map((site): Property =>
      site.id === editor.siteId ? { ...mapSite(saved), indexNow: site.indexNow } : site);

    // 저장하는 동안 다른 편집으로 바뀌지 않았을 때만 편집을 닫습니다.
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

// ─────────────────────────────────────────────────────────────
// 사이트 등록
// ─────────────────────────────────────────────────────────────

// 등록 폼에서 읽은 값
interface RegistrationInput {
  readonly name: string;
  readonly url: URL;
  readonly indexNow: IndexNowSettings | null;
  readonly payload: SiteWrite;
}

// 등록 폼을 읽고 검증해 서버에 보낼 값으로 바꿉니다. 문제가 있으면 안내 메시지와 함께 예외를 던집니다.
function readRegistrationForm(data: FormData): RegistrationInput {
  const name = fieldText(data, 'siteName');
  if (!name) throw new Error('사이트 이름을 입력하세요.');

  const url = parseUrl(fieldText(data, 'origin'));
  if (url.pathname !== '/' || url.search) {
    throw new Error('경로나 쿼리가 없는 도메인 루트 주소를 입력하세요.');
  }

  const indexNow = validateIndexNowSettings(
    url.origin,
    String(data.get('indexnowKey') ?? ''),
    String(data.get('indexnowLocation') ?? ''),
  );
  for (const field of API_ACCOUNT_INPUTS) {
    assertKnownAccount(String(data.get(field) ?? ''));
  }

  const editable = String(data.get('editable') ?? '');
  const payload: SiteWrite = {
    client_id: store.state.clientId,
    name,
    url: url.href,
    owner_type: data.get('ownership') === 'internal' ? 'internal' : 'client',
    cms_type: String(data.get('cmsType') ?? '') || null,
    can_edit_site: editable === '' ? null : editable === 'true',
    google_account_email: fieldText(data, 'googleAccountEmail') || null,
    bing_account_email: fieldText(data, 'bingAccountEmail') || null,
    naver_account_email: fieldText(data, 'naverAccountEmail') || null,
    indexnow_key: indexNow?.key ?? null,
    indexnow_key_location: indexNow?.keyLocation ?? null,
  };
  return { name, url, indexNow, payload };
}

// 데모 모드에서 서버 대신 만드는 사이트
function demoSite(input: RegistrationInput): Property {
  const { name, url, indexNow, payload } = input;
  return {
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
  };
}

// 새 사이트를 목록에 넣고, 그 사이트를 선택하면서 발행 폼·결과를 초기화합니다.
function applyRegisteredSite(site: Property, name: string, form: HTMLFormElement): void {
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
}

// 새 도메인을 예시 목록에 추가하되 검색엔진 등록 완료로 처리하지 않습니다.
export async function registerSite(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (store.pending || !store.state.clientId || store.authAccountsLoading || store.authAccountsError) return;

  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);

  try {
    const input = readRegistrationForm(data);
    setPending(true);

    const site = demo ? demoSite(input) : mapSite(await api.addSite(input.payload));
    applyRegisteredSite(site, input.name, form);

    if (!demo) await Promise.all([loadSettings(), loadInspectionTargets()]);
  } catch (error: unknown) {
    showError('#registration-error', error);
  } finally {
    setPending(false);
  }
}

// ─────────────────────────────────────────────────────────────
// IndexNow 설정 저장
// ─────────────────────────────────────────────────────────────

// 화면을 다시 그리기 전에 글 제목과 URL 입력값을 보존합니다.
export function capturePublicationDraft(): void {
  store.notificationDraft = app.querySelector<HTMLTextAreaElement>('[name="urls"]')?.value ?? store.notificationDraft;
  store.notificationTitles = app.querySelector<HTMLTextAreaElement>('[name="titles"]')?.value ?? store.notificationTitles;
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
      (item: Property): Property => (item.id === store.state.propertyId ? { ...item, indexNow: settings } : item),
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

// ─────────────────────────────────────────────────────────────
// 새 글 발행 알림
// ─────────────────────────────────────────────────────────────

// 제목·URL 입력을 글 목록으로 바꿉니다. 개수가 다르거나 중복·초과면 예외를 던집니다.
function parseArticles(): readonly Article[] {
  const titles = nonEmptyLines(store.notificationTitles);
  const urls = nonEmptyLines(store.notificationDraft).map((line: string): string => targetUrl(line).href);

  if (!urls.length || titles.length !== urls.length) {
    throw new Error('제목과 URL을 같은 순서로 한 줄씩 입력하세요. 제목과 URL 개수가 같아야 합니다.');
  }
  if (new Set(urls).size !== urls.length) throw new Error('중복 URL을 제거하고 제목과 순서를 맞춰 주세요.');
  if (urls.length > MAX_ARTICLES) throw new Error(`한 번에 최대 ${MAX_ARTICLES}개 글을 처리할 수 있습니다.`);

  return urls.map((url: string, index: number): Article => ({ name: titles[index]!, url }));
}

// 고객사 요청 문구 또는 링크 추가 작업 메모를 만듭니다.
function buildRequestText(articles: readonly Article[], note: string): string {
  const description = articles
    .map((article): string => `${article.name}\n${article.url}`)
    .join('\n\n');
  if (store.state.route === 'request') {
    return `${property().name} 담당자님께\n\n아래 신규 글의 검색엔진 제출과 접수 결과 확인을 부탁드립니다.\n\n${description}\n\n${note}`.trim();
  }
  return `우리 블로그에 소개할 고객사 글\n\n${description}\n\n후속 작업: 소개 글 작성 → 링크 추가 → 검토 → 발행`;
}

// 직접 알림: 설정·불명확 저장을 확인한 뒤 발행 컨트롤러를 시작합니다.
async function startDirectPublication(data: FormData, articles: readonly Article[]): Promise<void> {
  store.notifyEnabled = data.get('notify') === 'on';

  const indexNowReady = property().indexNow?.configured && !store.settingsLoading && !store.settingsError;
  if (store.notifyEnabled && !indexNowReady) {
    throw new Error('IndexNow 설정을 확인하거나 알림 체크를 해제해 글만 저장하세요.');
  }

  const id = property().id;
  if (articles.some((article): boolean => store.uncertainSaves.has(`${id}:${article.url}`))) {
    throw new Error('저장 여부가 불명확한 URL이 포함되어 있습니다. 아래 결과를 확인하고 해당 URL을 입력에서 제외하세요. 자동 재시도하지 않습니다.');
  }

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
}

// 선택한 처리 경로에 따라 발행 배치를 시작하거나 전달 문구를 준비합니다.
export async function notifyPublication(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  const site = property();
  const busy = publicationBusy(publications.getState()) || clientInspectionBusy(clientInspections.getState());
  if (store.pending || !site.id || !site.active || busy) return;

  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  store.notificationDraft = String(data.get('urls') ?? '');
  store.notificationTitles = String(data.get('titles') ?? '');

  try {
    const articles = parseArticles();

    // 요청·링크 경로는 문구만 만들고 외부 요청은 하지 않습니다.
    if (store.state.route !== 'direct') {
      store.requestText = buildRequestText(articles, fieldText(data, 'note'));
      update({ notice: '문구를 준비했습니다. 글 DB 저장·고객사 전달·블로그 발행은 실행하지 않았습니다.' });
      return;
    }

    await startDirectPublication(data, articles);
  } catch (error: unknown) {
    showError('#notification-error', error);
  }
}

// ─────────────────────────────────────────────────────────────
// 고객사 추가
// ─────────────────────────────────────────────────────────────

// 새 고객사를 예시 데이터에 추가합니다.
export async function addClient(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  if (store.pending) return;

  const form = event.currentTarget as HTMLFormElement;
  clearFormErrors(form);
  const data = new FormData(form);
  const name = fieldText(data, 'clientName');
  const manager = fieldText(data, 'manager');
  if (!name) {
    showError('#client-error', new Error('고객사 이름을 입력하세요.'));
    return;
  }

  try {
    setPending(true);

    const result = demo
      ? { id: crypto.randomUUID(), name, manager_name: manager }
      : await api.addClient(name, manager);

    store.clients = [...store.clients, { id: result.id, name: result.name, manager: result.manager_name ?? '' }];
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

// ─────────────────────────────────────────────────────────────
// 사이트맵 제출
// ─────────────────────────────────────────────────────────────

// 사이트맵 제출 실패 안내. 접수 여부를 알 수 없는 오류면 재전송하지 않는다는 문구를 붙입니다.
function sitemapFailureMessage(error: unknown): string {
  const failure = asAppError(error, 'submit');
  const advice = UNCERTAIN_SITEMAP_KINDS.includes(failure.kind)
    ? '접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.'
    : presentError(failure, '').advice;
  return `${failure.message} ${advice}`;
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
    if (sitemapUrl.origin !== new URL(site.siteUrl).origin) {
      throw new Error('선택한 사이트와 같은 도메인·프로토콜·포트의 사이트맵 URL을 입력하세요.');
    }

    if (demo) {
      store.sitemapFeedback = { siteId: site.id, engine, message: '예시 모드입니다. 실제 사이트맵 제출은 실행하지 않았습니다.', failed: false };
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
    store.sitemapFeedback = { siteId: site.id, engine, message: sitemapFailureMessage(error), failed: true };
  } finally {
    setPending(false);
    render();
    const stillViewing = store.state.view === 'inspect' && store.state.propertyId === site.id && store.state.engine === engine;
    if (stillViewing) app.querySelector<HTMLElement>('.sitemap-feedback')?.scrollIntoView?.({ block: 'nearest' });
  }
}

// ─────────────────────────────────────────────────────────────
// 상세 창·모달·복사
// ─────────────────────────────────────────────────────────────

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

// 클립보드 복사에 실패하면 문구를 선택 상태로 만들어 사용자가 직접 복사할 수 있게 합니다.
function selectRequestText(): void {
  const result = app.querySelector<HTMLElement>('.request-result pre');
  if (!result) return;

  const range = document.createRange();
  range.selectNodeContents(result);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  const button = app.querySelector<HTMLButtonElement>('#copy-request');
  if (button) button.textContent = '선택된 문구를 복사하세요';
}

// 전달 문구를 복사하고 실패할 경우 선택 가능한 원문을 유지합니다.
export async function copyRequest(): Promise<void> {
  try {
    await navigator.clipboard.writeText(store.requestText);
    const button = app.querySelector<HTMLButtonElement>('#copy-request');
    if (button) button.textContent = '복사했습니다';
  } catch {
    selectRequestText();
  }
}
