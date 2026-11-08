import { normalizeBingUrl, bingTargetInSite, bingIndexStatus, BING_AUTOMATION_MESSAGE, BING_INSPECTION_URL, BingAutomationError } from './observation.ts';
import type { BingAutomationCode, BingAutomationObservation, BingPageState, BingAutomationStage, BingSiteSelection } from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';

export interface BingAutomationHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onStage?: (target: ClientInspectionTarget, stage: BingAutomationStage) => void;
  readonly onResult: (target: ClientInspectionTarget, result: BingAutomationObservation) => void;
}

export interface BingAutomationClient {
  readonly get: (id: number) => Promise<chrome.tabs.Tab>;
  readonly navigate: (id: number, url: string) => Promise<unknown>;
  readonly send: (id: number, message: unknown) => Promise<unknown>;
}

// 기존에 허용한 Bing 탭 하나만 사용하며 창이나 탭 포커스는 바꾸지 않습니다.
function browserClient(): BingAutomationClient {
  if (!globalThis.chrome?.tabs) throw new BingAutomationError('wrong_page');

  return {
    get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id),
    navigate: (id, url): Promise<unknown> => chrome.tabs.update(id, { url }),
    send: (id, message): Promise<unknown> => chrome.tabs.sendMessage(id, message, { frameId: 0 }),
  };
}

// 취소·응답 제한 시간을 두고 작업 ID가 일치하는 고정 명령 응답만 받습니다.
async function command(client: BingAutomationClient, tabId: number, payload: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) throw new BingAutomationError('cancelled');

  const requestId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 취소 시 현재 DOM 조회에만 중단 신호를 전달하고 이동·재조회는 하지 않습니다.
  const abort = (): void => { void client.send(tabId, { type: BING_AUTOMATION_MESSAGE, requestId: crypto.randomUUID(), action: 'cancel', operationId: requestId }).catch((): void => {}); };

  signal.addEventListener('abort', abort, { once: true });

  try {
    const response = await Promise.race([
      client.send(tabId, { type: BING_AUTOMATION_MESSAGE, requestId, ...payload }),
      new Promise<never>((_, reject): void => { timer = setTimeout((): void => { abort(); reject(new BingAutomationError('timeout')); }, 25000); }),
    ]);
    if (signal.aborted) throw new BingAutomationError('cancelled');
    if (!response || typeof response !== 'object') throw new BingAutomationError('invalid_response');

    const result = response as Record<string, unknown>;
    if (result.requestId !== requestId) throw new BingAutomationError('invalid_response');

    if (result.ok !== true) {
      const codes: readonly string[] = ['wrong_page', 'auth_required', 'site_missing', 'ambiguous_control', 'page_changed', 'busy', 'timeout', 'cancelled'];
      throw new BingAutomationError(codes.includes(String(result.code)) ? result.code as BingAutomationCode : 'invalid_response');
    }

    return result.value;
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}

// Bing 문서가 예상 경로·사이트로 준비될 때까지 상태 조회만 반복합니다.
async function waitPage(client: BingAutomationClient, tabId: number, route: BingPageState['route'], siteUrl: string | null, signal: AbortSignal): Promise<BingPageState> {
  const deadline = Date.now() + 25000;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new BingAutomationError('cancelled');

    const tab = await client.get(tabId).catch((): null => null);
    if (!tab || tab.id !== tabId || tab.incognito || tab.discarded) throw new BingAutomationError('page_changed');

    // 로딩·인증 이동 중 URL 필드가 잠시 없어도 조작하지 않고 기존 대기 한도 안에서 다시 확인합니다.
    if (tab.url) {
      const url = new URL(tab.url);
      if (url.origin !== 'https://www.bing.com' || !(url.pathname === '/webmasters' || url.pathname.startsWith('/webmasters/')) || url.username || url.password) throw new BingAutomationError('auth_required');

      if (tab.status === 'complete' && !tab.pendingUrl && !url.pathname.startsWith('/auth/')) {
        let snapshot: unknown;

        try { snapshot = await command(client, tabId, { action: 'state' }, signal); }
        catch (error: unknown) { if (error instanceof BingAutomationError) throw error; }

        if (snapshot && typeof snapshot === 'object') {
          const value = snapshot as Partial<BingPageState>;
          if (value.route === 'auth') throw new BingAutomationError('auth_required');
          if (value.route === route && value.ready === true && (siteUrl === null || value.siteUrl === siteUrl) && typeof value.documentToken === 'string') return value as BingPageState;
        }
      }
    }

    await new Promise<void>((resolve): void => { setTimeout(resolve, 150); });
  }

  throw new BingAutomationError('timeout');
}

// 탭의 현재 호스트를 검사한 뒤 허용된 사이트 목록·검사 화면으로만 이동합니다.
async function navigate(client: BingAutomationClient, tabId: number, url: string, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw new BingAutomationError('cancelled');

  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || tab.discarded || tab.status !== 'complete' || tab.pendingUrl) throw new BingAutomationError('page_changed');

  const current = new URL(tab.url);
  if (current.origin !== 'https://www.bing.com' || !(current.pathname === '/webmasters' || current.pathname.startsWith('/webmasters/')) || current.username || current.password) throw new BingAutomationError('page_changed');

  await client.navigate(tabId, url);
}

// URL·상태·시각 등 GUI 응답의 전체 계약을 검사합니다.
function verifiedObservation(value: unknown, siteUrl: string, targetUrl: string): BingAutomationObservation {
  const result = value as Partial<BingAutomationObservation> | null;
  if (!result || result.kind !== 'verified_bing_gui' || result.siteUrl !== siteUrl || result.targetUrl !== targetUrl || result.targetVerified !== true
    || typeof result.message !== 'string' || !result.message || result.indexStatus !== bingIndexStatus(result.message)
    || !['succeeded', 'unknown'].includes(result.crawlStatus ?? '')
    || !(result.reason === null || typeof result.reason === 'string')
    || !(result.canonicalUrl === null || (typeof result.canonicalUrl === 'string' && normalizeBingUrl(result.canonicalUrl) === result.canonicalUrl))
    || !(result.lastCrawledText === null || typeof result.lastCrawledText === 'string')
    || typeof result.queriedAt !== 'string' || !Number.isFinite(Date.parse(result.queriedAt))
    || typeof result.readAt !== 'string' || !Number.isFinite(Date.parse(result.readAt))) throw new BingAutomationError('invalid_response');

  return result as BingAutomationObservation;
}

// 콘텐츠 스크립트가 반환한 실제 링크도 이동 전에 출처·경로·사이트를 다시 검증합니다.
function verifiedSiteSelection(value: unknown, siteUrl: string): BingSiteSelection {
  if (!value || typeof value !== 'object') throw new BingAutomationError('invalid_response');
  const result = value as Partial<BingSiteSelection>;
  if (result.siteUrl !== siteUrl || typeof result.destinationUrl !== 'string') throw new BingAutomationError('invalid_response');
  try {
    const url = new URL(result.destinationUrl);
    if (url.origin !== 'https://www.bing.com' || url.pathname !== '/webmasters/urlinspection' || url.username || url.password || url.hash
      || url.searchParams.getAll('siteUrl').length !== 1 || normalizeBingUrl(url.searchParams.get('siteUrl') ?? '') !== siteUrl
      || Array.from(url.searchParams.keys()).some((key): boolean => key !== 'siteUrl')) throw new BingAutomationError('invalid_response');
    return { siteUrl, destinationUrl: url.href };
  } catch { throw new BingAutomationError('invalid_response'); }
}

// 같은 사이트의 메인·글 URL을 모두 검사한 뒤 왼쪽 메뉴에서 다음 사이트를 선택합니다.
export async function runBingAutomation(
  selected: WorkTab, targets: readonly ClientInspectionTarget[], hooks: BingAutomationHooks, client: BingAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'bing') throw new BingAutomationError('wrong_page');

  // 작업별로 현재 단계를 표시하고 시간 초과에도 같은 단계 이름을 보존합니다.
  async function step<T>(target: ClientInspectionTarget, stage: BingAutomationStage, action: () => Promise<T>): Promise<T> {
    if (hooks.signal.aborted) throw new BingAutomationError('cancelled');
    hooks.onStage?.(target, stage);
    try { return await action(); }
    catch (error: unknown) {
      if (error instanceof BingAutomationError && error.code === 'timeout') throw new BingAutomationError('timeout', stage);
      throw error;
    }
  }

  const siteIds = [...new Set(targets.map((target): string => target.siteId))];
  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    const first = group[0]; const siteUrl = first && normalizeBingUrl(first.siteUrl);
    if (!first || !siteUrl || group.some((target): boolean => normalizeBingUrl(target.siteUrl) !== siteUrl || !bingTargetInSite(siteUrl, target.url))) throw new BingAutomationError('invalid_response');

    hooks.onStart(first);
    const initial = await step(first, 'inspection_page', async (): Promise<BingPageState> => {
      if (siteId === siteIds[0]) await navigate(client, selected.tabId, BING_INSPECTION_URL, hooks.signal);
      return await waitPage(client, selected.tabId, 'inspection', null, hooks.signal);
    });
    const selection = await step(first, 'site_menu', async (): Promise<BingSiteSelection> => verifiedSiteSelection(
      await command(client, selected.tabId, { action: 'select_site', siteUrl, documentToken: initial.documentToken }, hooks.signal), siteUrl,
    ));
    await step(first, 'site_navigation', async (): Promise<void> => {
      await navigate(client, selected.tabId, selection.destinationUrl, hooks.signal);
      await waitPage(client, selected.tabId, 'inspection', siteUrl, hooks.signal);
    });

    for (const target of group) {
      if (hooks.signal.aborted) throw new BingAutomationError('cancelled');
      hooks.onStart(target);
      const page = await step(target, 'url_ready', async (): Promise<BingPageState> => await waitPage(client, selected.tabId, 'inspection', siteUrl, hooks.signal));
      const value = await step(target, 'url_result', async (): Promise<unknown> => await command(client, selected.tabId, {
        action: 'inspect_url', siteUrl, targetUrl: target.url, documentToken: page.documentToken,
      }, hooks.signal));
      const result = verifiedObservation(value, siteUrl, normalizeBingUrl(target.url)!);
      const current = await step(target, 'result_check', async (): Promise<BingPageState> => await waitPage(client, selected.tabId, 'inspection', siteUrl, hooks.signal));
      if (current.documentToken !== page.documentToken) throw new BingAutomationError('page_changed');
      hooks.onResult(target, result);
    }
  }
}
