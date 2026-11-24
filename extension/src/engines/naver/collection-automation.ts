import { browserClient, command, navigate, waitPage } from './automation.ts';
import type { NaverAutomationClient } from './automation';
import {
  canonicalNaverTarget,
  naverTargetInSite,
  NAVER_BOARD_PATH,
  NAVER_BOARD_URL,
  NAVER_ORIGIN,
  NaverAutomationError,
} from './observation.ts';
import type { NaverCollectionReceipt } from './collection';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';
import type { NaverPageState } from './observation';
import { isTabLoaded } from '../../tabs/readiness.ts';

// 이 파일은 관리 화면 쪽에서 실행됩니다. 발행한 글 URL을 네이버 "웹 페이지 수집" 화면에 제출하는 흐름을 지휘합니다.

// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

// 실행 중 진행 상황을 알려주는 콜백과 취소 신호
export interface NaverCollectionHooks {
  readonly signal: AbortSignal;
  readonly onStart: (target: ClientInspectionTarget) => void;
  readonly onResult: (target: ClientInspectionTarget, receipt: NaverCollectionReceipt) => void | Promise<void>;
}

// 네이버 입력칸이 받는 URL 최대 길이
const MAX_TARGET_URL_LENGTH = 2048;
// 접수 응답의 readAt이 지금보다 이만큼 미래여도 허용 (시계 차이)
const READ_AT_SLACK_MS = 1000;
// 네이버가 등록일로 표시하는 "YY.MM.DD HH:MM:SS"
const REGISTRATION_TEXT = /^\d{2}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2}$/;

// ─────────────────────────────────────────────────────────────
// 대상 검증
// ─────────────────────────────────────────────────────────────

// 앞선 대상과 겹치는지 확인합니다. 같은 ID, 같은 URL, 또는 같은 사이트 ID인데 사이트 URL이 다르면 중복·불일치입니다.
function conflictsWithPrevious(
  previous: ClientInspectionTarget,
  target: ClientInspectionTarget,
  siteUrl: string,
  targetUrl: string,
): boolean {
  if (previous.id === target.id) return true;
  if (canonicalNaverTarget(previous.url) === targetUrl) return true;
  return previous.siteId === target.siteId && canonicalNaverTarget(previous.siteUrl) !== siteUrl;
}

// 대상 하나가 올바른지 확인합니다. ID·사이트 ID가 있고, URL이 정규화되며, 길이 제한 안이고, 사이트 범위에 속해야 합니다.
function isValidTarget(target: ClientInspectionTarget, siteUrl: string | null, targetUrl: string | null): boolean {
  if (!target.id || !target.siteId) return false;
  if (!siteUrl || !targetUrl) return false;
  if (targetUrl.length > MAX_TARGET_URL_LENGTH) return false;
  return naverTargetInSite(siteUrl, targetUrl);
}

// 일부 요청을 보낸 뒤 잘못된 대상이 발견되지 않도록 전체 범위와 중복을 먼저 검증합니다.
function validateTargets(targets: readonly ClientInspectionTarget[]): void {
  for (const [index, target] of targets.entries()) {
    const siteUrl = canonicalNaverTarget(target.siteUrl);
    const targetUrl = canonicalNaverTarget(target.url);
    if (!isValidTarget(target, siteUrl, targetUrl)) throw new NaverAutomationError('invalid_response');

    const hasConflict = targets
      .slice(0, index)
      .some((previous): boolean => conflictsWithPrevious(previous, target, siteUrl!, targetUrl!));
    if (hasConflict) throw new NaverAutomationError('invalid_response');
  }
}

// ─────────────────────────────────────────────────────────────
// 접수 응답 검증
// ─────────────────────────────────────────────────────────────

// 문자열이면 시각으로 해석하고, 아니면 NaN입니다.
function parseTime(value: unknown): number {
  return typeof value === 'string' ? Date.parse(value) : NaN;
}

// 접수 응답이 요청한 사이트·URL에 대한 올바른 형식이고 시각 순서가 맞는지 확인합니다.
function isValidReceipt(
  receipt: Partial<NaverCollectionReceipt>,
  siteUrl: string,
  targetUrl: string,
  sentAt: number,
): receipt is NaverCollectionReceipt {
  if (receipt.kind !== 'collection_receipt') return false;
  if (receipt.siteUrl !== siteUrl) return false;
  if (receipt.targetUrl !== targetUrl) return false;
  if (receipt.requestStatus !== 'accepted') return false;
  if (receipt.collectionStatus !== 'unknown') return false;
  if (receipt.indexStatus !== 'unknown') return false;
  if (receipt.targetVerified !== true) return false;

  const requestedAt = parseTime(receipt.requestedAt);
  const readAt = parseTime(receipt.readAt);
  if (!Number.isFinite(requestedAt) || !Number.isFinite(readAt)) return false;
  if (requestedAt < sentAt) return false;
  if (readAt < requestedAt) return false;
  if (readAt > Date.now() + READ_AT_SLACK_MS) return false;

  if (typeof receipt.registeredAtText !== 'string') return false;
  return REGISTRATION_TEXT.test(receipt.registeredAtText);
}

// 접수 응답만 허용하고 수집·색인 완료나 다른 대상의 응답은 성공으로 반영하지 않습니다.
function verifiedReceipt(
  value: unknown,
  siteUrl: string,
  targetUrl: string,
  sentAt: number,
): NaverCollectionReceipt {
  if (!value || typeof value !== 'object') throw new NaverAutomationError('receipt_unconfirmed');

  const receipt = value as Partial<NaverCollectionReceipt>;
  if (!isValidReceipt(receipt, siteUrl, targetUrl, sentAt)) {
    throw new NaverAutomationError('receipt_unconfirmed');
  }
  return receipt;
}

// ─────────────────────────────────────────────────────────────
// 화면 이동
// ─────────────────────────────────────────────────────────────

// 네이버가 아니거나 인증(로그인) 화면인 주소인지 확인합니다.
function isAuthUrl(url: URL): boolean {
  if (url.origin !== NAVER_ORIGIN) return true;
  if (url.username || url.password) return true;
  return url.pathname.startsWith('/auth') || url.pathname.includes('login');
}

// 준비된 현재 탭이 목록이 아니면 상단 웹마스터 도구를 선택해 목록으로 돌아갑니다.
async function prepareBoard(
  client: NaverAutomationClient,
  tabId: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const tab = await client.get(tabId).catch((): null => null);
  if (!tab?.url || tab.id !== tabId || tab.incognito || !isTabLoaded(tab)) {
    throw new NaverAutomationError('page_changed');
  }

  const url = new URL(tab.url);
  if (isAuthUrl(url)) throw new NaverAutomationError('auth_required');

  if (url.pathname !== NAVER_BOARD_PATH) {
    const page = (await command(client, tabId, { action: 'state' }, signal)) as Partial<NaverPageState> | null;
    if (!page || typeof page.documentToken !== 'string') throw new NaverAutomationError('invalid_response');
    if (page.route === 'auth') throw new NaverAutomationError('auth_required');
    await command(client, tabId, { action: 'open_board', documentToken: page.documentToken }, signal);
  }

  await waitPage(client, tabId, 'board', null, signal);
}

// ─────────────────────────────────────────────────────────────
// 수집 요청 자동화
// ─────────────────────────────────────────────────────────────

// 수집 화면에서 URL 하나를 제출하고 접수 증거를 돌려줍니다.
async function requestTarget(
  client: NaverAutomationClient,
  tabId: number,
  siteUrl: string,
  target: ClientInspectionTarget,
  signal: AbortSignal,
): Promise<NaverCollectionReceipt> {
  const targetUrl = canonicalNaverTarget(target.url)!;
  const page = await waitPage(client, tabId, 'collection', siteUrl, signal);
  const sentAt = Date.now();
  const result = await command(
    client,
    tabId,
    { action: 'request_collection', siteUrl, targetUrl, documentToken: page.documentToken },
    signal,
  );
  const receipt = verifiedReceipt(result, siteUrl, targetUrl, sentAt);

  // 접수 후 화면이 이동하거나 문서가 교체되면 이전 문서의 응답을 확정하지 않습니다.
  try {
    const current = await waitPage(client, tabId, 'collection', siteUrl, signal);
    if (current.documentToken !== page.documentToken) throw new NaverAutomationError('page_changed');
  } catch {
    throw new NaverAutomationError('receipt_unconfirmed');
  }

  return receipt;
}

// 사이트 하나에 대해 목록 선택 → 요청 메뉴 → 수집 화면 → URL 순차 제출 → 목록 복귀를 수행합니다.
async function requestSiteGroup(
  client: NaverAutomationClient,
  tabId: number,
  group: readonly ClientInspectionTarget[],
  hooks: NaverCollectionHooks,
): Promise<void> {
  const first = group[0]!;
  const siteUrl = canonicalNaverTarget(first.siteUrl)!;

  // 1. 사이트 목록에서 이 사이트를 선택합니다.
  hooks.onStart(first);
  await prepareBoard(client, tabId, hooks.signal);
  const board = await waitPage(client, tabId, 'board', null, hooks.signal);
  await command(
    client,
    tabId,
    { action: 'select_collection_site', siteUrl, documentToken: board.documentToken },
    hooks.signal,
  );

  // 2. 왼쪽 메뉴 "요청 → 웹 페이지 수집"을 엽니다.
  const summary = await waitPage(client, tabId, 'summary', siteUrl, hooks.signal);
  await command(
    client,
    tabId,
    { action: 'open_collection', siteUrl, documentToken: summary.documentToken },
    hooks.signal,
  );

  // 3. URL을 하나씩 제출합니다.
  for (const target of group) {
    hooks.onStart(target);
    const receipt = await requestTarget(client, tabId, siteUrl, target, hooks.signal);
    await hooks.onResult(target, receipt);
  }

  // 4. 다음 사이트를 위해 목록으로 돌아갑니다.
  await navigate(client, tabId, NAVER_BOARD_URL, hooks.signal);
  await waitPage(client, tabId, 'board', null, hooks.signal);
}

// 선택한 탭에서 사이트별 URL 수집을 한 번씩 요청하며 기존 색인 조회·DB 저장과 분리합니다.
export async function runNaverCollectionAutomation(
  selected: WorkTab,
  targets: readonly ClientInspectionTarget[],
  hooks: NaverCollectionHooks,
  client: NaverAutomationClient = browserClient(),
): Promise<void> {
  if (selected.engine !== 'naver') throw new NaverAutomationError('wrong_page');
  if (!Number.isInteger(selected.tabId) || selected.tabId < 0) throw new NaverAutomationError('wrong_page');
  validateTargets(targets);

  const siteIds = [...new Set(targets.map((target): string => target.siteId))];
  for (const siteId of siteIds) {
    const group = targets.filter((target): boolean => target.siteId === siteId);
    await requestSiteGroup(client, selected.tabId, group, hooks);
  }
}
