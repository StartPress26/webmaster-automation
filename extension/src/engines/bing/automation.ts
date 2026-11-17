import {
  normalizeBingUrl,
  bingTargetInSite,
  bingIndexStatus,
  BING_AUTOMATION_MESSAGE,
  BING_INSPECTION_PATH,
  BING_INSPECTION_URL,
  BING_ORIGIN,
  BING_WEBMASTERS_PATH,
  BingAutomationError,
} from './observation.ts';
import type {
  BingAutomationCode,
  BingAutomationObservation,
  BingPageState,
  BingAutomationStage,
  BingSiteSelection,
} from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';
import { isTabLoaded } from '../../tabs/readiness.ts';

// 이 파일은 관리 화면 쪽에서 실행됩니다. Bing 탭에 메시지를 보내 콘텐츠 스크립트가 한 단계씩 움직이게 합니다.

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 실행 중 진행 상황을 알려주는 콜백과 취소 신호
export interface BingAutomationHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onStage?: (target: ClientInspectionTarget, stage: BingAutomationStage) => void;
  readonly onResult: (target: ClientInspectionTarget, result: BingAutomationObservation) => void | Promise<void>;
}

// chrome.tabs 중 자동화가 쓰는 기능. 테스트에서는 가짜 객체를 넘깁니다.
export interface BingAutomationClient {
  readonly get: (id: number) => Promise<chrome.tabs.Tab>;
  readonly navigate: (id: number, url: string) => Promise<unknown>;
  readonly send: (id: number, message: unknown) => Promise<unknown>;
}

// 사이트 하나를 처리하는 동안 공유하는 값
interface RunContext {
  readonly client: BingAutomationClient;
  readonly tabId: number;
  readonly hooks: BingAutomationHooks;
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 콘텐츠 스크립트 명령 하나의 응답 대기 시간
const COMMAND_TIMEOUT_MS = 25000;
// 화면이 준비될 때까지 기다리는 최대 시간과 확인 주기
const WAIT_PAGE_TIMEOUT_MS = 25000;
const WAIT_PAGE_POLL_MS = 150;

// 콘텐츠 스크립트가 실패 응답에 담을 수 있는 코드. 이 밖의 값은 invalid_response로 봅니다.
const KNOWN_FAILURE_CODES: readonly BingAutomationCode[] = [
  'wrong_page',
  'auth_required',
  'site_missing',
  'ambiguous_control',
  'page_changed',
  'busy',
  'timeout',
  'cancelled',
];

// 응답에서 허용하는 크롤링 상태
const CRAWL_STATUSES: readonly string[] = ['succeeded', 'unknown'];

// ─────────────────────────────────────────────────────────────
// 순수 함수
// ─────────────────────────────────────────────────────────────

// Bing 웹마스터 도구 안의 주소이고 아이디·비밀번호가 없는지 확인합니다.
function isWebmastersTabUrl(url: URL): boolean {
  if (url.origin !== BING_ORIGIN) return false;
  if (url.username || url.password) return false;
  return url.pathname === BING_WEBMASTERS_PATH || url.pathname.startsWith(`${BING_WEBMASTERS_PATH}/`);
}

// 응답의 code가 알려진 실패 코드인지 확인합니다.
function isKnownFailureCode(code: unknown): code is BingAutomationCode {
  return KNOWN_FAILURE_CODES.includes(String(code) as BingAutomationCode);
}

// 지정한 시간만큼 기다립니다.
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve): void => {
    setTimeout(resolve, ms);
  });
}

// 상태 응답이 기대한 화면이고 준비됐는지 확인합니다. siteUrl이 null이면 사이트는 비교하지 않습니다.
function isReadyPage(
  value: Partial<BingPageState>,
  route: BingPageState['route'],
  siteUrl: string | null,
): value is BingPageState {
  if (value.route !== route) return false;
  if (value.ready !== true) return false;
  if (siteUrl !== null && value.siteUrl !== siteUrl) return false;
  return typeof value.documentToken === 'string';
}

// 문자열이 해석 가능한 시각인지 확인합니다.
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

// null이거나 문자열인지 확인합니다.
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}

// 정식 URL은 null이거나, 이미 정규화된 형태의 문자열이어야 합니다.
function isValidCanonicalUrl(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === 'string' && normalizeBingUrl(value) === value;
}

// 콘텐츠 스크립트의 검사 응답이 요청한 사이트·URL에 대한 올바른 형식인지 확인합니다.
function isVerifiedObservation(
  result: Partial<BingAutomationObservation> | null,
  siteUrl: string,
  targetUrl: string,
): result is BingAutomationObservation {
  if (!result) return false;
  if (result.kind !== 'verified_bing_gui') return false;
  if (result.siteUrl !== siteUrl) return false;
  if (result.targetUrl !== targetUrl) return false;
  if (result.targetVerified !== true) return false;
  if (typeof result.message !== 'string' || !result.message) return false;
  if (result.indexStatus !== bingIndexStatus(result.message)) return false;
  if (!CRAWL_STATUSES.includes(result.crawlStatus ?? '')) return false;
  if (!isNullableString(result.reason)) return false;
  if (!isValidCanonicalUrl(result.canonicalUrl)) return false;
  if (!isNullableString(result.lastCrawledText)) return false;
  if (!isTimestamp(result.queriedAt)) return false;
  return isTimestamp(result.readAt);
}

// 사이트 선택 응답의 이동 주소가 그 사이트의 URL 검사 화면만 가리키는지 확인합니다. (siteUrl 외 다른 쿼리 금지)
function isValidDestination(url: URL, siteUrl: string): boolean {
  if (url.origin !== BING_ORIGIN) return false;
  if (url.pathname !== BING_INSPECTION_PATH) return false;
  if (url.username || url.password || url.hash) return false;
  if (url.searchParams.getAll('siteUrl').length !== 1) return false;
  if (normalizeBingUrl(url.searchParams.get('siteUrl') ?? '') !== siteUrl) return false;
  return !Array.from(url.searchParams.keys()).some((key): boolean => key !== 'siteUrl');
}

// 같은 사이트 그룹의 모든 대상이 같은 사이트에 속하고 그 사이트 범위 안의 URL인지 확인합니다.
function isConsistentGroup(group: readonly ClientInspectionTarget[], siteUrl: string): boolean {
  return group.every(
    (target): boolean =>
      normalizeBingUrl(target.siteUrl) === siteUrl && bingTargetInSite(siteUrl, target.url),
  );
}

// ─────────────────────────────────────────────────────────────
// 응답 검증
// ─────────────────────────────────────────────────────────────

// URL·상태·시각 등 GUI 응답의 전체 계약을 검사합니다.
function verifiedObservation(value: unknown, siteUrl: string, targetUrl: string): BingAutomationObservation {
  const result = value as Partial<BingAutomationObservation> | null;
  if (!isVerifiedObservation(result, siteUrl, targetUrl)) {
    throw new BingAutomationError('invalid_response');
  }
  return result;
}

// 콘텐츠 스크립트가 반환한 실제 링크도 이동 전에 출처·경로·사이트를 다시 검증합니다.
function verifiedSiteSelection(value: unknown, siteUrl: string): BingSiteSelection {
  if (!value || typeof value !== 'object') throw new BingAutomationError('invalid_response');

  const result = value as Partial<BingSiteSelection>;
  if (result.siteUrl !== siteUrl || typeof result.destinationUrl !== 'string') {
    throw new BingAutomationError('invalid_response');
  }

  try {
    const url = new URL(result.destinationUrl);
    if (!isValidDestination(url, siteUrl)) throw new BingAutomationError('invalid_response');
    return { siteUrl, destinationUrl: url.href };
  } catch {
    throw new BingAutomationError('invalid_response');
  }
}

// ─────────────────────────────────────────────────────────────
// 탭 통신
// ─────────────────────────────────────────────────────────────

// 기존에 허용한 Bing 탭 하나만 사용하며 창이나 탭 포커스는 바꾸지 않습니다.
function browserClient(): BingAutomationClient {
  if (!globalThis.chrome?.tabs) throw new BingAutomationError('wrong_page');

  return {
    get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id),
    navigate: (id, url): Promise<unknown> => chrome.tabs.update(id, { url }),
    send: (id, message): Promise<unknown> => chrome.tabs.sendMessage(id, message, { frameId: 0 }),
  };
}

// 콘텐츠 스크립트에 작업 취소를 알립니다. 실패해도 무시합니다.
function sendCancel(client: BingAutomationClient, tabId: number, operationId: string): void {
  void client
    .send(tabId, {
      type: BING_AUTOMATION_MESSAGE,
      requestId: crypto.randomUUID(),
      action: 'cancel',
      operationId,
    })
    .catch((): void => {});
}

// 실패 응답을 예외로 바꿉니다. 알려진 코드가 아니면 invalid_response입니다.
function failureFromResponse(result: Record<string, unknown>): BingAutomationError {
  if (isKnownFailureCode(result.code)) return new BingAutomationError(result.code);
  return new BingAutomationError('invalid_response');
}

// 취소·응답 제한 시간을 두고 작업 ID가 일치하는 고정 명령 응답만 받습니다.
async function command(
  client: BingAutomationClient,
  tabId: number,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw new BingAutomationError('cancelled');

  const requestId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // 취소 시 현재 DOM 조회에만 중단 신호를 전달하고 이동·재조회는 하지 않습니다.
  const abort = (): void => {
    sendCancel(client, tabId, requestId);
  };
  signal.addEventListener('abort', abort, { once: true });

  // 제한 시간이 지나면 취소를 알리고 timeout으로 끝냅니다.
  const timeout = new Promise<never>((_, reject): void => {
    timer = setTimeout((): void => {
      abort();
      reject(new BingAutomationError('timeout'));
    }, COMMAND_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      client.send(tabId, { type: BING_AUTOMATION_MESSAGE, requestId, ...payload }),
      timeout,
    ]);
    if (signal.aborted) throw new BingAutomationError('cancelled');
    if (!response || typeof response !== 'object') throw new BingAutomationError('invalid_response');

    const result = response as Record<string, unknown>;
    if (result.requestId !== requestId) throw new BingAutomationError('invalid_response');
    if (result.ok !== true) throw failureFromResponse(result);

    return result.value;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

// 탭 상태를 한 번 조회해 준비된 화면이면 돌려주고, 아직이면 null을 돌려줍니다.
async function readPageIfReady(
  client: BingAutomationClient,
  tabId: number,
  route: BingPageState['route'],
  siteUrl: string | null,
  signal: AbortSignal,
): Promise<BingPageState | null> {
  const tab = await client.get(tabId).catch((): null => null);
  if (!tab || tab.id !== tabId || tab.incognito || tab.discarded) {
    throw new BingAutomationError('page_changed');
  }

  // 로딩·인증 이동 중 URL 필드가 잠시 없어도 조작하지 않고 기존 대기 한도 안에서 다시 확인합니다.
  if (!tab.url) return null;

  const url = new URL(tab.url);
  if (!isWebmastersTabUrl(url)) throw new BingAutomationError('auth_required');

  const loaded = tab.status === 'complete' && !tab.pendingUrl;
  if (!loaded || url.pathname.startsWith('/auth/')) return null;

  // 콘텐츠 스크립트와 연결되지 않은 경우(자동화 예외가 아닌 오류)는 다음 확인까지 기다립니다.
  let snapshot: unknown;
  try {
    snapshot = await command(client, tabId, { action: 'state' }, signal);
  } catch (error: unknown) {
    if (error instanceof BingAutomationError) throw error;
  }

  if (!snapshot || typeof snapshot !== 'object') return null;

  const value = snapshot as Partial<BingPageState>;
  if (value.route === 'auth') throw new BingAutomationError('auth_required');
  if (isReadyPage(value, route, siteUrl)) return value;
  return null;
}

// Bing 문서가 예상 경로·사이트로 준비될 때까지 상태 조회만 반복합니다.
async function waitPage(
  client: BingAutomationClient,
  tabId: number,
  route: BingPageState['route'],
  siteUrl: string | null,
  signal: AbortSignal,
): Promise<BingPageState> {
  const deadline = Date.now() + WAIT_PAGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new BingAutomationError('cancelled');

    const page = await readPageIfReady(client, tabId, route, siteUrl, signal);
    if (page) return page;

    await delay(WAIT_PAGE_POLL_MS);
  }

  throw new BingAutomationError('timeout');
}

// 탭의 현재 호스트를 검사한 뒤 허용된 사이트 목록·검사 화면으로만 이동합니다.
async function navigate(
  client: BingAutomationClient,
  tabId: number,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new BingAutomationError('cancelled');

  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || !isTabLoaded(tab)) {
    throw new BingAutomationError('page_changed');
  }
  if (!isWebmastersTabUrl(new URL(tab.url))) throw new BingAutomationError('page_changed');

  await client.navigate(tabId, url);
}

// ─────────────────────────────────────────────────────────────
// 색인 상태 조회 자동화
// ─────────────────────────────────────────────────────────────

// 작업별로 현재 단계를 표시하고 시간 초과에도 같은 단계 이름을 보존합니다.
async function step<T>(
  hooks: BingAutomationHooks,
  target: ClientInspectionTarget,
  stage: BingAutomationStage,
  action: () => Promise<T>,
): Promise<T> {
  if (hooks.signal.aborted) throw new BingAutomationError('cancelled');
  hooks.onStage?.(target, stage);
  try {
    return await action();
  } catch (error: unknown) {
    if (error instanceof BingAutomationError && error.code === 'timeout') {
      throw new BingAutomationError('timeout', stage);
    }
    throw error;
  }
}

// 검사 화면에서 URL 하나를 조회하고 검증된 결과를 돌려줍니다.
async function inspectTarget(
  context: RunContext,
  siteUrl: string,
  target: ClientInspectionTarget,
): Promise<BingAutomationObservation> {
  const { client, tabId, hooks } = context;

  const page = await step(hooks, target, 'url_ready', async (): Promise<BingPageState> =>
    await waitPage(client, tabId, 'inspection', siteUrl, hooks.signal));

  const value = await step(hooks, target, 'url_result', async (): Promise<unknown> =>
    await command(
      client,
      tabId,
      { action: 'inspect_url', siteUrl, targetUrl: target.url, documentToken: page.documentToken },
      hooks.signal,
    ));
  const result = verifiedObservation(value, siteUrl, normalizeBingUrl(target.url)!);

  // 조회 뒤 화면이 바뀌었으면(문서 토큰이 다르면) 이 결과를 확정하지 않습니다.
  const current = await step(hooks, target, 'result_check', async (): Promise<BingPageState> =>
    await waitPage(client, tabId, 'inspection', siteUrl, hooks.signal));
  if (current.documentToken !== page.documentToken) throw new BingAutomationError('page_changed');

  return result;
}

// 사이트 하나에 대해 검사 화면 준비 → 사이트 선택 → URL 순차 조회를 수행합니다.
async function inspectSiteGroup(
  context: RunContext,
  group: readonly ClientInspectionTarget[],
  isFirstSite: boolean,
): Promise<void> {
  const { client, tabId, hooks } = context;
  const first = group[0];
  const siteUrl = first ? normalizeBingUrl(first.siteUrl) : null;
  if (!first || !siteUrl || !isConsistentGroup(group, siteUrl)) {
    throw new BingAutomationError('invalid_response');
  }

  // 1. 첫 사이트일 때만 URL 검사 화면으로 이동하고, 화면이 준비될 때까지 기다립니다.
  hooks.onStart(first);
  const initial = await step(hooks, first, 'inspection_page', async (): Promise<BingPageState> => {
    if (isFirstSite) await navigate(client, tabId, BING_INSPECTION_URL, hooks.signal);
    return await waitPage(client, tabId, 'inspection', null, hooks.signal);
  });

  // 2. 왼쪽 메뉴에서 이 사이트의 링크를 찾아 이동합니다.
  const selection = await step(hooks, first, 'site_menu', async (): Promise<BingSiteSelection> =>
    verifiedSiteSelection(
      await command(
        client,
        tabId,
        { action: 'select_site', siteUrl, documentToken: initial.documentToken },
        hooks.signal,
      ),
      siteUrl,
    ));
  await step(hooks, first, 'site_navigation', async (): Promise<void> => {
    await navigate(client, tabId, selection.destinationUrl, hooks.signal);
    await waitPage(client, tabId, 'inspection', siteUrl, hooks.signal);
  });

  // 3. URL을 하나씩 조회합니다.
  for (const target of group) {
    if (hooks.signal.aborted) throw new BingAutomationError('cancelled');
    hooks.onStart(target);
    const result = await inspectTarget(context, siteUrl, target);
    await hooks.onResult(target, result);
  }
}

// 같은 사이트의 메인·글 URL을 모두 검사한 뒤 왼쪽 메뉴에서 다음 사이트를 선택합니다.
export async function runBingAutomation(
  selected: WorkTab,
  targets: readonly ClientInspectionTarget[],
  hooks: BingAutomationHooks,
  client: BingAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'bing') throw new BingAutomationError('wrong_page');

  const context: RunContext = { client, tabId: selected.tabId, hooks };
  const siteIds = [...new Set(targets.map((target): string => target.siteId))];
  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    await inspectSiteGroup(context, group, siteId === siteIds[0]);
  }
}
