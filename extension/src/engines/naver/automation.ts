import {
  canonicalNaverTarget,
  hasConsistentNaverJudgement,
  naverTargetInSite,
  NAVER_AUTOMATION_MESSAGE,
  NAVER_BOARD_URL,
  NAVER_INSPECTION_PATH,
  NAVER_ORIGIN,
  NaverAutomationError,
} from './observation.ts';
import type {
  NaverAutomationCode,
  NaverAutomationObservation,
  NaverPageState,
} from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';
import { isTabLoaded } from '../../tabs/readiness.ts';

// 이 파일은 관리 화면 쪽에서 실행됩니다. 네이버 탭에 메시지를 보내 콘텐츠 스크립트가 한 단계씩 움직이게 합니다.

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 실행 중 진행 상황을 알려주는 콜백과 취소 신호
export interface NaverAutomationHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onResult: (target: ClientInspectionTarget, result: NaverAutomationObservation) => void | Promise<void>;
}

// chrome.tabs 중 자동화가 쓰는 기능. 테스트에서는 가짜 객체를 넘깁니다.
export interface NaverAutomationClient {
  readonly get: (id: number) => Promise<chrome.tabs.Tab>;
  readonly navigate: (id: number, url: string) => Promise<unknown>;
  readonly send: (id: number, message: unknown) => Promise<unknown>;
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 콘텐츠 스크립트 명령 하나의 응답 대기 시간
const COMMAND_TIMEOUT_MS = 18000;
// 화면이 준비될 때까지 기다리는 최대 시간과 확인 주기
const WAIT_PAGE_TIMEOUT_MS = 18000;
const WAIT_PAGE_POLL_MS = 150;

// 콘텐츠 스크립트가 실패 응답에 담을 수 있는 코드. 이 밖의 값은 invalid_response로 봅니다.
const KNOWN_FAILURE_CODES: readonly NaverAutomationCode[] = [
  'wrong_page',
  'auth_required',
  'site_missing',
  'ambiguous_control',
  'page_changed',
  'busy',
  'timeout',
  'cancelled',
  'receipt_unconfirmed',
  'script_unavailable',
];

// ─────────────────────────────────────────────────────────────
// 순수 함수
// ─────────────────────────────────────────────────────────────

// 네이버 서치어드바이저 주소이고 아이디·비밀번호가 없는지 확인합니다.
function isNaverTabUrl(url: URL): boolean {
  return url.origin === NAVER_ORIGIN && !url.username && !url.password;
}

// 응답의 code가 알려진 실패 코드인지 확인합니다.
function isKnownFailureCode(code: unknown): code is NaverAutomationCode {
  return KNOWN_FAILURE_CODES.includes(String(code) as NaverAutomationCode);
}

// 지정한 시간만큼 기다립니다.
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve): void => {
    setTimeout(resolve, ms);
  });
}

// 상태 응답이 기대한 화면·사이트이고 준비됐는지 확인합니다.
function isReadyPage(
  value: Partial<NaverPageState>,
  route: NaverPageState['route'],
  siteUrl: string | null,
): value is NaverPageState {
  if (value.route !== route) return false;
  if (value.ready !== true) return false;
  if (value.siteUrl !== siteUrl) return false;
  return typeof value.documentToken === 'string';
}

// 문자열이 해석 가능한 시각인지 확인합니다.
function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

// 콘텐츠 스크립트의 검사 응답이 요청한 사이트·URL에 대한 올바른 형식인지 확인합니다.
function isVerifiedObservation(
  observation: Partial<NaverAutomationObservation> | null,
  siteUrl: string,
  targetUrl: string | null,
): observation is NaverAutomationObservation {
  if (!observation) return false;
  if (observation.kind !== 'verified_gui') return false;
  if (observation.siteUrl !== siteUrl) return false;
  if (observation.targetUrl !== targetUrl) return false;
  if (observation.targetVerified !== true) return false;
  if (!hasConsistentNaverJudgement(observation.message, observation.indexStatus)) return false;
  if (!isTimestamp(observation.queriedAt)) return false;
  return isTimestamp(observation.readAt);
}

// 같은 사이트 그룹의 모든 대상이 같은 사이트에 속하고 그 사이트 범위 안의 URL인지 확인합니다.
function isConsistentGroup(group: readonly ClientInspectionTarget[], siteUrl: string): boolean {
  return group.every(
    (target): boolean =>
      canonicalNaverTarget(target.siteUrl) === siteUrl && naverTargetInSite(siteUrl, target.url),
  );
}

// 사이트의 색인 상태 확인 화면 주소를 만듭니다. (site 파라미터는 끝 슬래시 없이)
function inspectionPageUrl(siteUrl: string): string {
  const url = new URL(`${NAVER_ORIGIN}${NAVER_INSPECTION_PATH}`);
  url.searchParams.set('site', siteUrl.replace(/\/$/, ''));
  return url.href;
}

// ─────────────────────────────────────────────────────────────
// 탭 통신
// ─────────────────────────────────────────────────────────────

// 네이버 자동화가 Chrome 탭을 조회·이동하고 메시지를 보낼 수 있도록 연결합니다.
export function browserClient(): NaverAutomationClient {
  // 현재 실행 환경에서 Chrome 탭 API를 사용할 수 없으면 작업을 중단합니다.
  // ?.는 chrome이 없을 때 tabs에 접근하지 않고 undefined를 반환합니다.
  if (!globalThis.chrome?.tabs) throw new NaverAutomationError('wrong_page');

  // 네이버 자동화가 사용할 세 가지 탭 동작을 반환합니다.
  return {
    // id로 Chrome 탭을 찾아 주소나 로딩 상태가 담긴 탭 객체를 가져옵니다.
    get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id),

    // id에 해당하는 탭을 지정한 URL로 이동시킵니다.
    // active 옵션을 넘기지 않으므로 해당 탭을 앞으로 가져오지 않습니다.
    navigate: (id, url): Promise<unknown> => chrome.tabs.update(id, { url }),

    // id에 해당하는 탭의 메인 프레임(frameId: 0)에 메시지를 보냅니다.
    // 해당 프레임의 콘텐츠 스크립트가 응답하면 Promise로 그 응답을 받습니다.
    send: (id, message): Promise<unknown> =>
      chrome.tabs.sendMessage(id, message, { frameId: 0 }),
  };
}

// 콘텐츠 스크립트에 작업 취소를 알립니다. 실패해도 무시합니다.
function sendCancel(client: NaverAutomationClient, tabId: number, operationId: string): void {
  void client
    .send(tabId, {
      type: NAVER_AUTOMATION_MESSAGE,
      requestId: crypto.randomUUID(),
      action: 'cancel',
      operationId,
    })
    .catch((): void => {});
}

// 실패 응답을 예외로 바꿉니다. 알려진 코드가 아니면 invalid_response입니다.
function failureFromResponse(result: Record<string, unknown>): NaverAutomationError {
  if (isKnownFailureCode(result.code)) return new NaverAutomationError(result.code);
  return new NaverAutomationError('invalid_response');
}

// 취소·응답 제한 시간을 두고 작업 ID가 일치하는 고정 명령 응답만 받습니다.
export async function command(
  client: NaverAutomationClient,
  tabId: number,
  payload: Record<string, unknown>,
  signal: AbortSignal,
): Promise<unknown> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const requestId = crypto.randomUUID();
  const isCollectionRequest = payload.action === 'request_collection';
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 콘텐츠 스크립트가 실패 코드를 명시적으로 돌려줬는지 (수집 요청의 "접수 미확인" 판단에 쓰임)
  let acknowledgedFailure = false;

  // 수집 요청은 취소 시 응답을 기다리지 않고 바로 끝내기 위한 Promise
  let cancelRequest: ((reason: NaverAutomationError) => void) | undefined;
  const cancellation = new Promise<never>((_, reject): void => {
    if (isCollectionRequest) cancelRequest = reject;
  });

  // 취소는 현재 DOM 작업에만 전달하며 수집 요청을 다시 보내지 않습니다.
  const abort = (): void => {
    cancelRequest?.(new NaverAutomationError('cancelled'));
    sendCancel(client, tabId, requestId);
  };
  signal.addEventListener('abort', abort, { once: true });

  // 제한 시간이 지나면 취소를 알리고 timeout으로 끝냅니다.
  const timeout = new Promise<never>((_, reject): void => {
    timer = setTimeout((): void => {
      abort();
      reject(new NaverAutomationError('timeout'));
    }, COMMAND_TIMEOUT_MS);
  });

  try {
    const response = await Promise.race([
      client.send(tabId, { type: NAVER_AUTOMATION_MESSAGE, requestId, ...payload }),
      timeout,
      cancellation,
    ]);

    if (signal.aborted) throw new NaverAutomationError('cancelled');
    if (!response || typeof response !== 'object') throw new NaverAutomationError('invalid_response');

    const result = response as Record<string, unknown>;
    if (result.requestId !== requestId) throw new NaverAutomationError('invalid_response');

    if (result.ok !== true) {
      acknowledgedFailure = isKnownFailureCode(result.code);
      throw failureFromResponse(result);
    }

    return result.value;
  } catch (error: unknown) {
    // 전송 뒤 응답이 끊긴 수집 요청은 미접수로 단정하거나 자동 재전송하지 않습니다.
    if (isCollectionRequest && !acknowledgedFailure) throw new NaverAutomationError('receipt_unconfirmed');
    if (!(error instanceof NaverAutomationError)) throw new NaverAutomationError('script_unavailable');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

// 탭 상태를 한 번 조회해 준비된 화면이면 돌려주고, 아직이면 null을 돌려줍니다.
async function readPageIfReady(
  client: NaverAutomationClient,
  tabId: number,
  route: NaverPageState['route'],
  siteUrl: string | null,
  signal: AbortSignal,
): Promise<NaverPageState | null> {
  const tab = await client.get(tabId).catch((): null => null);
  if (!tab || tab.id !== tabId || tab.incognito || tab.discarded) {
    throw new NaverAutomationError('page_changed');
  }

  // 로딩·인증 이동 중 URL 필드가 잠시 없어도 조작하지 않고 기존 대기 한도 안에서 다시 확인합니다.
  if (!tab.url) return null;

  const url = new URL(tab.url);
  if (!isNaverTabUrl(url)) throw new NaverAutomationError('auth_required');

  const loaded = tab.status === 'complete' && !tab.pendingUrl;
  if (!loaded || url.pathname.startsWith('/auth/')) return null;

  // 콘텐츠 스크립트가 아직 연결되지 않은 경우(script_unavailable)는 다음 확인까지 기다립니다.
  let snapshot: unknown;
  try {
    snapshot = await command(client, tabId, { action: 'state' }, signal);
  } catch (error: unknown) {
    if (error instanceof NaverAutomationError && error.code !== 'script_unavailable') throw error;
  }

  if (!snapshot || typeof snapshot !== 'object') return null;

  const value = snapshot as Partial<NaverPageState>;
  if (value.route === 'auth') throw new NaverAutomationError('auth_required');
  if (isReadyPage(value, route, siteUrl)) return value;
  return null;
}

// 네이버 문서가 예상 경로·사이트로 준비될 때까지 상태 조회만 반복합니다.
export async function waitPage(
  client: NaverAutomationClient,
  tabId: number,
  route: NaverPageState['route'],
  siteUrl: string | null,
  signal: AbortSignal,
): Promise<NaverPageState> {
  const deadline = Date.now() + WAIT_PAGE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new NaverAutomationError('cancelled');

    const page = await readPageIfReady(client, tabId, route, siteUrl, signal);
    if (page) return page;

    await delay(WAIT_PAGE_POLL_MS);
  }

  throw new NaverAutomationError('timeout');
}

// 탭의 현재 호스트를 검사한 뒤 허용된 사이트 목록·검사 화면으로만 이동합니다.
export async function navigate(
  client: NaverAutomationClient,
  tabId: number,
  url: string,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || !isTabLoaded(tab)) {
    throw new NaverAutomationError('page_changed');
  }
  if (!isNaverTabUrl(new URL(tab.url))) throw new NaverAutomationError('page_changed');

  await client.navigate(tabId, url);
}

// ─────────────────────────────────────────────────────────────
// 색인 상태 조회 자동화
// ─────────────────────────────────────────────────────────────

// 검사 화면에서 URL 하나를 조회하고 검증된 결과를 돌려줍니다.
async function inspectTarget(
  client: NaverAutomationClient,
  tabId: number,
  siteUrl: string,
  target: ClientInspectionTarget,
  signal: AbortSignal,
): Promise<NaverAutomationObservation> {
  const page = await waitPage(client, tabId, 'inspection', siteUrl, signal);
  const result = await command(
    client,
    tabId,
    { action: 'inspect_url', siteUrl, targetUrl: target.url, documentToken: page.documentToken },
    signal,
  );

  const observation = result as Partial<NaverAutomationObservation> | null;
  if (!isVerifiedObservation(observation, siteUrl, canonicalNaverTarget(target.url))) {
    throw new NaverAutomationError('invalid_response');
  }

  // 조회 뒤 화면이 바뀌었으면(문서 토큰이 다르면) 이 결과를 확정하지 않습니다.
  const current = await waitPage(client, tabId, 'inspection', siteUrl, signal);
  if (current.documentToken !== page.documentToken) throw new NaverAutomationError('page_changed');

  return observation;
}

// 사이트 하나에 대해 목록 선택 → 검사 화면 이동 → URL 순차 조회 → 목록 복귀를 수행합니다.
async function inspectSiteGroup(
  client: NaverAutomationClient,
  tabId: number,
  group: readonly ClientInspectionTarget[],
  hooks: NaverAutomationHooks,
): Promise<void> {
  const first = group[0];
  const siteUrl = first ? canonicalNaverTarget(first.siteUrl) : null;
  if (!first || !siteUrl || !isConsistentGroup(group, siteUrl)) {
    throw new NaverAutomationError('invalid_response');
  }

  // 1. 사이트 목록에서 이 사이트를 선택합니다.
  hooks.onStart(first);
  await navigate(client, tabId, NAVER_BOARD_URL, hooks.signal);
  const board = await waitPage(client, tabId, 'board', null, hooks.signal);
  await command(
    client,
    tabId,
    { action: 'select_site', siteUrl, documentToken: board.documentToken },
    hooks.signal,
  );
  await waitPage(client, tabId, 'summary', siteUrl, hooks.signal);

  // 2. 색인 상태 확인 화면으로 이동해 URL을 하나씩 조회합니다.
  await navigate(client, tabId, inspectionPageUrl(siteUrl), hooks.signal);
  for (const target of group) {
    hooks.onStart(target);
    const observation = await inspectTarget(client, tabId, siteUrl, target, hooks.signal);
    await hooks.onResult(target, observation);
  }

  // 3. 다음 사이트를 위해 목록으로 돌아갑니다.
  await navigate(client, tabId, NAVER_BOARD_URL, hooks.signal);
  await waitPage(client, tabId, 'board', null, hooks.signal);
}

// 사이트별로 목록 선택·검사 이동·URL 순차 조회·목록 복귀를 수행합니다.
export async function runNaverAutomation(
  selected: WorkTab,
  targets: readonly ClientInspectionTarget[],
  hooks: NaverAutomationHooks,
  client: NaverAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'naver') throw new NaverAutomationError('wrong_page');

  const siteIds = [...new Set(targets.map((target): string => target.siteId))];
  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    await inspectSiteGroup(client, selected.tabId, group, hooks);
  }
}
