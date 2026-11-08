import { canonicalNaverTarget, naverTargetInSite, NAVER_INDEXED_MESSAGE, NAVER_AUTOMATION_MESSAGE, NAVER_BOARD_URL, NAVER_NO_RESULT_MESSAGE, NaverAutomationError } from './observation.ts';
import type { NaverAutomationCode, NaverAutomationObservation, NaverPageState } from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';

export interface NaverAutomationHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onResult: (target: ClientInspectionTarget, result: NaverAutomationObservation) => void;
}

export interface NaverAutomationClient {
  readonly get: (id: number) => Promise<chrome.tabs.Tab>;
  readonly navigate: (id: number, url: string) => Promise<unknown>;
  readonly send: (id: number, message: unknown) => Promise<unknown>;
}

// 기존에 허용한 네이버 탭 하나만 사용하며 창이나 탭 포커스는 바꾸지 않습니다.
function browserClient(): NaverAutomationClient {
  if (!globalThis.chrome?.tabs) throw new NaverAutomationError('wrong_page');

  return {
    get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id),
    navigate: (id, url): Promise<unknown> => chrome.tabs.update(id, { url }),
    send: (id, message): Promise<unknown> => chrome.tabs.sendMessage(id, message, { frameId: 0 }),
  };
}

// 취소·응답 제한 시간을 두고 작업 ID가 일치하는 고정 명령 응답만 받습니다.
async function command(client: NaverAutomationClient, tabId: number, payload: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const requestId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // 취소 시 현재 DOM 조회에만 중단 신호를 전달하고 이동·재조회는 하지 않습니다.
  const abort = (): void => { void client.send(tabId, { type: NAVER_AUTOMATION_MESSAGE, requestId: crypto.randomUUID(), action: 'cancel', operationId: requestId }).catch((): void => {}); };
  signal.addEventListener('abort', abort, { once: true });

  try {
    const response = await Promise.race([
      client.send(tabId, { type: NAVER_AUTOMATION_MESSAGE, requestId, ...payload }),
      new Promise<never>((_, reject): void => { timer = setTimeout((): void => { abort(); reject(new NaverAutomationError('timeout')); }, 18000); }),
    ]);

    if (signal.aborted) throw new NaverAutomationError('cancelled');
    if (!response || typeof response !== 'object') throw new NaverAutomationError('invalid_response');

    const result = response as Record<string, unknown>;
    if (result.requestId !== requestId) throw new NaverAutomationError('invalid_response');

    if (result.ok !== true) {
      const codes: readonly string[] = ['wrong_page', 'auth_required', 'site_missing', 'ambiguous_control', 'page_changed', 'busy', 'timeout', 'cancelled'];
      throw new NaverAutomationError(codes.includes(String(result.code)) ? result.code as NaverAutomationCode : 'invalid_response');
    }

    return result.value;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

// 네이버 문서가 예상 경로·사이트로 준비될 때까지 상태 조회만 반복합니다.
async function waitPage(client: NaverAutomationClient, tabId: number, route: NaverPageState['route'], siteUrl: string | null, signal: AbortSignal): Promise<NaverPageState> {
  const deadline = Date.now() + 18000;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new NaverAutomationError('cancelled');

    const tab = await client.get(tabId).catch((): null => null);
    if (!tab || tab.id !== tabId || tab.incognito || tab.discarded) throw new NaverAutomationError('page_changed');

    // 로딩·인증 이동 중 URL 필드가 잠시 없어도 조작하지 않고 기존 대기 한도 안에서 다시 확인합니다.
    if (tab.url) {
      const url = new URL(tab.url);
      if (url.origin !== 'https://searchadvisor.naver.com' || url.username || url.password) throw new NaverAutomationError('auth_required');

      if (tab.status === 'complete' && !tab.pendingUrl && !url.pathname.startsWith('/auth/')) {
        let snapshot: unknown;
        try { snapshot = await command(client, tabId, { action: 'state' }, signal); }
        catch (error: unknown) { if (error instanceof NaverAutomationError) throw error; }

        if (snapshot && typeof snapshot === 'object') {
          const value = snapshot as Partial<NaverPageState>;

          if (value.route === 'auth') throw new NaverAutomationError('auth_required');
          if (value.route === route && value.ready === true && value.siteUrl === siteUrl && typeof value.documentToken === 'string') return value as NaverPageState;
        }
      }
    }

    await new Promise<void>((resolve): void => { setTimeout(resolve, 150); });
  }

  throw new NaverAutomationError('timeout');
}

// 탭의 현재 호스트를 검사한 뒤 허용된 사이트 목록·검사 화면으로만 이동합니다.
async function navigate(client: NaverAutomationClient, tabId: number, url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || tab.discarded || tab.status !== 'complete' || tab.pendingUrl) throw new NaverAutomationError('page_changed');

  const current = new URL(tab.url);
  if (current.origin !== 'https://searchadvisor.naver.com' || current.username || current.password) throw new NaverAutomationError('page_changed');

  await client.navigate(tabId, url);
}

// 사이트별로 목록 선택·검사 이동·URL 순차 조회·목록 복귀를 수행합니다.
export async function runNaverAutomation(
  selected: WorkTab, targets: readonly ClientInspectionTarget[], hooks: NaverAutomationHooks, client: NaverAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'naver') throw new NaverAutomationError('wrong_page');

  const siteIds = [...new Set(targets.map((target): string => target.siteId))];

  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    const first = group[0];
    const siteUrl = first && canonicalNaverTarget(first.siteUrl);

    if (!first || !siteUrl || group.some((target): boolean => canonicalNaverTarget(target.siteUrl) !== siteUrl || !naverTargetInSite(siteUrl, target.url))) throw new NaverAutomationError('invalid_response');

    hooks.onStart(first);
    await navigate(client, selected.tabId, NAVER_BOARD_URL, hooks.signal);
    const board = await waitPage(client, selected.tabId, 'board', null, hooks.signal);

    await command(client, selected.tabId, { action: 'select_site', siteUrl, documentToken: board.documentToken }, hooks.signal);
    await waitPage(client, selected.tabId, 'summary', siteUrl, hooks.signal);

    const inspectionUrl = new URL('https://searchadvisor.naver.com/console/site/check/inspection');
    inspectionUrl.searchParams.set('site', siteUrl.replace(/\/$/, ''));
    await navigate(client, selected.tabId, inspectionUrl.href, hooks.signal);

    for (const target of group) {
      hooks.onStart(target);

      const page = await waitPage(client, selected.tabId, 'inspection', siteUrl, hooks.signal);
      const result = await command(client, selected.tabId, { action: 'inspect_url', siteUrl, targetUrl: target.url, documentToken: page.documentToken }, hooks.signal);

      const observation = result as Partial<NaverAutomationObservation> | null;
      if (!observation || observation.kind !== 'verified_gui' || observation.siteUrl !== siteUrl || observation.targetUrl !== canonicalNaverTarget(target.url)
        || observation.targetVerified !== true || !((observation.indexStatus === 'indexed' && observation.message === NAVER_INDEXED_MESSAGE)
        || (observation.indexStatus === 'unknown' && observation.message === NAVER_NO_RESULT_MESSAGE))
        || typeof observation.queriedAt !== 'string' || !Number.isFinite(Date.parse(observation.queriedAt))
        || typeof observation.readAt !== 'string' || !Number.isFinite(Date.parse(observation.readAt))) throw new NaverAutomationError('invalid_response');

      const current = await waitPage(client, selected.tabId, 'inspection', siteUrl, hooks.signal);
      if (current.documentToken !== page.documentToken) throw new NaverAutomationError('page_changed');

      hooks.onResult(target, observation as NaverAutomationObservation);
    }

    await navigate(client, selected.tabId, NAVER_BOARD_URL, hooks.signal);
    await waitPage(client, selected.tabId, 'board', null, hooks.signal);
  }
}
