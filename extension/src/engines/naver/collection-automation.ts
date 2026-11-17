import { browserClient, command, navigate, waitPage } from './automation.ts';
import type { NaverAutomationClient } from './automation';
import {
  canonicalNaverTarget,
  naverTargetInSite,
  NAVER_BOARD_URL,
  NaverAutomationError,
} from './observation.ts';
import type { NaverCollectionReceipt } from './collection';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';
import type { NaverPageState } from './observation';
import { isTabLoaded } from '../../tabs/readiness.ts';

export interface NaverCollectionHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onResult: (target: ClientInspectionTarget, receipt: NaverCollectionReceipt) => void | Promise<void>;
}

// 일부 요청을 보낸 뒤 잘못된 대상이 발견되지 않도록 전체 범위와 중복을 먼저 검증합니다.
function validateTargets(targets: readonly ClientInspectionTarget[]): void {
  for (const [index, target] of targets.entries()) {
    const siteUrl = canonicalNaverTarget(target.siteUrl);
    const targetUrl = canonicalNaverTarget(target.url);
    if (
      !target.id ||
      !target.siteId ||
      !siteUrl ||
      !targetUrl ||
      targetUrl.length > 2048 ||
      !naverTargetInSite(siteUrl, targetUrl) ||
      targets.slice(0, index).some(
        (previous): boolean =>
          previous.id === target.id ||
          canonicalNaverTarget(previous.url) === targetUrl ||
          (previous.siteId === target.siteId &&
            canonicalNaverTarget(previous.siteUrl) !== siteUrl),
      )
    )
      throw new NaverAutomationError('invalid_response');
  }
}

// 접수 응답만 허용하고 수집·색인 완료나 다른 대상의 응답은 성공으로 반영하지 않습니다.
function verifiedReceipt(
  value: unknown,
  siteUrl: string,
  targetUrl: string,
  sentAt: number,
): NaverCollectionReceipt {
  if (!value || typeof value !== 'object')
    throw new NaverAutomationError('receipt_unconfirmed');

  const receipt = value as Partial<NaverCollectionReceipt>;
  const requestedAt = typeof receipt.requestedAt === 'string' ? Date.parse(receipt.requestedAt) : NaN;
  const readAt = typeof receipt.readAt === 'string' ? Date.parse(receipt.readAt) : NaN;
  if (
    receipt.kind !== 'collection_receipt' ||
    receipt.siteUrl !== siteUrl ||
    receipt.targetUrl !== targetUrl ||
    receipt.requestStatus !== 'accepted' ||
    receipt.collectionStatus !== 'unknown' ||
    receipt.indexStatus !== 'unknown' ||
    receipt.targetVerified !== true ||
    !Number.isFinite(requestedAt) ||
    !Number.isFinite(readAt) ||
    requestedAt < sentAt ||
    readAt < requestedAt ||
    readAt > Date.now() + 1000 ||
    typeof receipt.registeredAtText !== 'string' ||
    !/^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/.test(receipt.registeredAtText)
  )
    throw new NaverAutomationError('receipt_unconfirmed');

  return receipt as NaverCollectionReceipt;
}

// 준비된 현재 탭이 목록이 아니면 상단 웹마스터 도구를 선택해 목록으로 돌아갑니다.
async function prepareBoard(
  client: NaverAutomationClient,
  tabId: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');
  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || !isTabLoaded(tab))
    throw new NaverAutomationError('page_changed');
  const url = new URL(tab.url);
  if (url.origin !== 'https://searchadvisor.naver.com' || url.username || url.password ||
    url.pathname.startsWith('/auth') || url.pathname.includes('login'))
    throw new NaverAutomationError('auth_required');
  if (url.pathname !== '/console/board') {
    const page = await command(client, tabId, { action: 'state' }, signal) as Partial<NaverPageState> | null;
    if (!page || typeof page.documentToken !== 'string')
      throw new NaverAutomationError('invalid_response');
    if (page.route === 'auth') throw new NaverAutomationError('auth_required');
    await command(client, tabId, { action: 'open_board', documentToken: page.documentToken }, signal);
  }
  await waitPage(client, tabId, 'board', null, signal);
}

// 선택한 탭에서 사이트별 URL 수집을 한 번씩 요청하며 기존 색인 조회·DB 저장과 분리합니다.
export async function runNaverCollectionAutomation(
  selected: WorkTab,
  targets: readonly ClientInspectionTarget[],
  hooks: NaverCollectionHooks,
  client: NaverAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'naver') throw new NaverAutomationError('wrong_page');
  if (!Number.isInteger(selected.tabId) || selected.tabId < 0)
    throw new NaverAutomationError('wrong_page');
  validateTargets(targets);

  const siteIds = [...new Set(targets.map((target): string => target.siteId))];
  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    const first = group[0]!;
    const siteUrl = canonicalNaverTarget(first.siteUrl)!;

    hooks.onStart(first);
    await prepareBoard(client, selected.tabId, hooks.signal);
    const board = await waitPage(client, selected.tabId, 'board', null, hooks.signal);
    await command(
      client,
      selected.tabId,
      { action: 'select_collection_site', siteUrl, documentToken: board.documentToken },
      hooks.signal,
    );
    const summary = await waitPage(client, selected.tabId, 'summary', siteUrl, hooks.signal);
    await command(client, selected.tabId,
      { action: 'open_collection', siteUrl, documentToken: summary.documentToken }, hooks.signal);

    for (const target of group) {
      hooks.onStart(target);
      const targetUrl = canonicalNaverTarget(target.url)!;
      const page = await waitPage(client, selected.tabId, 'collection', siteUrl, hooks.signal);
      const sentAt = Date.now();
      const result = await command(
        client,
        selected.tabId,
        {
          action: 'request_collection',
          siteUrl,
          targetUrl,
          documentToken: page.documentToken,
        },
        hooks.signal,
      );
      const receipt = verifiedReceipt(result, siteUrl, targetUrl, sentAt);

      // 접수 후 화면이 이동하거나 문서가 교체되면 이전 문서의 응답을 확정하지 않습니다.
      try {
        const current = await waitPage(client, selected.tabId, 'collection', siteUrl, hooks.signal);
        if (current.documentToken !== page.documentToken)
          throw new NaverAutomationError('page_changed');
      } catch {
        throw new NaverAutomationError('receipt_unconfirmed');
      }

      await hooks.onResult(target, receipt);
    }

    await navigate(client, selected.tabId, NAVER_BOARD_URL, hooks.signal);
    await waitPage(client, selected.tabId, 'board', null, hooks.signal);
  }
}
