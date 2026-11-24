import { canonicalHttpUrl } from '../../url.ts';

// 이 파일은 Bing 웹마스터 도구 페이지 안(콘텐츠 스크립트)과 관리 화면 양쪽에서 쓰입니다.
// DOM을 읽고 조작하는 함수는 모두 호출자가 넘긴 document만 사용합니다.

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 확장 관리 화면 ↔ 콘텐츠 스크립트 사이의 메시지 종류
export const BING_AUTOMATION_MESSAGE = 'STARTPRESS_BING_AUTOMATION';

// Bing 웹마스터 도구의 출처와 화면 경로
export const BING_ORIGIN = 'https://www.bing.com';
export const BING_WEBMASTERS_PATH = '/webmasters';
export const BING_INSPECTION_PATH = '/webmasters/urlinspection';
export const BING_INSPECTION_URL = `${BING_ORIGIN}${BING_INSPECTION_PATH}`;

// 자동화 단계별 표시 이름 (시간 초과 안내에 쓰임)
export const BING_STAGE_LABELS = {
  inspection_page: 'URL 검사 화면 준비',
  site_menu: '사이트 목록에서 항목 확인',
  site_navigation: '사이트 선택 후 화면 전환',
  url_ready: '검사할 URL 입력 준비',
  url_result: 'URL 검사 결과 확인',
  result_check: '검사 후 사이트 확인',
} as const;

// 로그인·인증 화면으로 보는 경로
const AUTH_PATH = /login|signin|auth/i;

// Bing 화면의 요소 선택자 (실제 화면에서 확인한 고정 속성)
const SITE_BUTTON_SELECTOR = 'button.userSeletedSite';
const SITE_LIST_SELECTOR = '.userSitesList[role="listbox"]';
const SITE_OPTION_SELECTOR = 'a[role="option"][href]';
const URL_INPUT_SELECTOR = 'input[data-tag="urlInspectionInput"]';
const INSPECT_BUTTON_SELECTOR = 'button[data-tag="inspectBtn"]';
const PROGRESS_SELECTOR = '#inpsectionProgressTitle';
const INDEX_CARD_SELECTOR = '[data-tag="urlInspectionIndexCard"]';
const SECTION_TITLE_SELECTOR = '.urlInspectionSectionTitle';
const LABEL_VALUE_PAIR_SELECTOR = '.urlInspectionLabelValuePair';
const ITEM_LABEL_SELECTOR = '.urlInspectionIndexItemLabel';
const ITEM_VALUE_SELECTOR = '.urlInspectionIndexItemValue';
const ERROR_STATUS_SELECTOR = '.urlInspectionErrorStatusBar';
const BINGDEX_TAB_SELECTOR = '[data-tag="BingdexTab"]';
const ACCORDION_HEADER_SELECTOR = '[data-tag="accordionItemHeader"]';
const INDEX_DETAILS_SELECTOR = '[data-tag="urlInspectionIndexDetails"]';
// 텍스트를 읽을 때 제외하는 숨김·장식 요소
const DECORATION_SELECTOR = '[hidden], [aria-hidden="true"], i, svg, script, style';

// 결과 제목의 색인 판정 문구 (한국어·영어)
const INDEXED_MESSAGES: readonly string[] = ['색인화되었습니다.', 'Indexed', 'URL is indexed'];
const NOT_INDEXED_KOREAN = '색인화되지 않';
const NOT_INDEXED_ENGLISH = /^(URL is not indexed|Not indexed|The inspected URL is not indexed)/i;

// 결과 카드의 상세 항목 라벨 (한국어·영어)
const CANONICAL_LABELS: readonly string[] = ['정식 URL', 'Canonical URL'];
const PAGE_FETCH_LABELS: readonly string[] = ['페이지 가져오기', 'Page fetch'];
const LAST_CRAWL_LABELS: readonly string[] = ['마지막 크롤링 시도', 'Last crawl attempted'];
const FETCH_SUCCESS_VALUES: readonly string[] = ['성공', 'Successful'];

// 사이트 선택과 URL 검사의 기본 대기 시간·확인 주기
const SELECT_SITE_TIMEOUT_MS = 15000;
const SELECT_SITE_POLL_MS = 100;
const INSPECT_TIMEOUT_MS = 20000;
const INSPECT_POLL_MS = 100;

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 자동화가 중단된 이유
export type BingAutomationCode =
  | 'wrong_page'
  | 'auth_required'
  | 'site_missing'
  | 'ambiguous_control'
  | 'page_changed'
  | 'busy'
  | 'timeout'
  | 'cancelled'
  | 'invalid_response';

export type BingAutomationStage = keyof typeof BING_STAGE_LABELS;

// 왼쪽 메뉴에서 찾은 사이트의 실제 이동 링크
export interface BingSiteSelection {
  readonly siteUrl: string;
  readonly destinationUrl: string;
}

// 콘텐츠 스크립트가 알려주는 현재 화면 상태
export interface BingPageState {
  readonly route: 'inspection' | 'console' | 'auth' | 'other';
  readonly siteUrl: string | null;
  readonly ready: boolean;
  readonly documentToken: string;
}

// URL 검사 자동화로 확인한 결과
export interface BingAutomationObservation {
  readonly kind: 'verified_bing_gui';
  readonly siteUrl: string;
  readonly targetUrl: string;
  readonly indexStatus: 'indexed' | 'not_indexed' | 'unknown';
  readonly message: string;
  readonly reason: string | null;
  readonly canonicalUrl: string | null;
  readonly crawlStatus: 'succeeded' | 'unknown';
  readonly lastCrawledText: string | null;
  readonly queriedAt: string;
  readonly readAt: string;
  readonly targetVerified: true;
}

// 결과 카드의 라벨·값 한 쌍
interface LabelValue {
  readonly label: string;
  readonly value: string;
}

// ─────────────────────────────────────────────────────────────
// 오류
// ─────────────────────────────────────────────────────────────

const AUTOMATION_MESSAGES: Readonly<Record<BingAutomationCode, string>> = {
  wrong_page: 'Bing URL 검사 화면을 확인하지 못했습니다.',
  auth_required: 'Bing 로그인 또는 추가 인증을 작업 탭에서 확인하세요.',
  site_missing: 'Bing 사이트 목록에서 해당 메인 사이트를 찾지 못했습니다.',
  ambiguous_control: 'Bing 사이트·입력칸·검사 버튼을 하나로 식별하지 못했습니다.',
  page_changed: '작업 중 Bing 사이트·URL·문서가 바뀌어 중단했습니다.',
  busy: 'Bing 탭에서 다른 조회가 진행 중입니다.',
  timeout: 'Bing 화면 전환 또는 새 검사 결과를 기다리다 중단했습니다. 자동 재조회하지 않습니다.',
  cancelled: 'Bing 자동 조회를 취소했습니다.',
  invalid_response: 'Bing 응답의 대상·판정·작업 ID를 확인하지 못했습니다.',
};

// 오류 코드(와 시간 초과 시 단계)에 맞는 안내 문구를 고릅니다.
function automationMessage(code: BingAutomationCode, stage?: BingAutomationStage): string {
  if (code === 'timeout' && stage) {
    return `Bing ${BING_STAGE_LABELS[stage]} 단계에서 시간이 초과됐습니다. 자동 재조회하지 않습니다.`;
  }
  return AUTOMATION_MESSAGES[code];
}

// Bing 자동화가 중단됐을 때 던지는 예외
export class BingAutomationError extends Error {
  readonly code: BingAutomationCode;
  readonly stage?: BingAutomationStage;

  // 원본 응답이나 인증정보 대신 고정된 중단 사유만 전달합니다.
  constructor(code: BingAutomationCode, stage?: BingAutomationStage) {
    super(automationMessage(code, stage));
    this.code = code;
    this.stage = stage;
  }
}

// 자동화 예외가 아닌 예외는 응답 형식 오류로 바꿉니다.
function asAutomationError(error: unknown): BingAutomationError {
  if (error instanceof BingAutomationError) return error;
  return new BingAutomationError('invalid_response');
}

// ─────────────────────────────────────────────────────────────
// URL 판별
// ─────────────────────────────────────────────────────────────

// 쿼리는 보존하고 인증정보나 프래그먼트가 있는 URL은 거부합니다.
export function normalizeBingUrl(value: string): string | null {
  return canonicalHttpUrl(value);
}

// 같은 출처와 사이트의 경로 범위에 있는 URL만 검사합니다. 사이트 URL에 쿼리가 있으면 허용하지 않습니다.
export function bingTargetInSite(site: string, target: string): boolean {
  const siteUrl = normalizeBingUrl(site);
  const targetUrl = normalizeBingUrl(target);
  if (!siteUrl || !targetUrl) return false;

  const parent = new URL(siteUrl);
  const child = new URL(targetUrl);
  if (parent.search) return false;
  if (parent.origin !== child.origin) return false;

  const path = parent.pathname.replace(/\/$/, '');
  return child.pathname === path || child.pathname.startsWith(`${path}/`);
}

// Bing 웹마스터 도구 안의 주소인지 확인합니다.
function isWebmastersUrl(url: URL): boolean {
  if (url.origin !== BING_ORIGIN) return false;
  return url.pathname === BING_WEBMASTERS_PATH || url.pathname.startsWith(`${BING_WEBMASTERS_PATH}/`);
}

// 경로로 현재 화면 종류를 정합니다.
function routeOf(url: URL, allowed: boolean): BingPageState['route'] {
  if (!allowed || AUTH_PATH.test(url.pathname)) return 'auth';
  if (url.pathname === BING_INSPECTION_PATH) return 'inspection';
  return 'console';
}

// Bing의 이중 인코딩 검사 URL을 한 번만 풀어 원래 URL의 인코딩은 보존합니다.
function inspectedTarget(pageUrl: string): string | null {
  try {
    const raw = new URL(pageUrl).searchParams.get('urlToInspect');
    if (!raw) return null;
    return normalizeBingUrl(raw) ?? normalizeBingUrl(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

// 사이트 목록의 링크가 목표 사이트의 URL 검사 화면으로 가는 안전한 링크인지 확인합니다.
function isSiteOptionLink(link: HTMLAnchorElement, baseUrl: string, expectedSite: string | null): boolean {
  if (!visible(link)) return false;

  const destination = new URL(link.href, baseUrl);
  if (destination.origin !== BING_ORIGIN) return false;
  if (destination.pathname !== BING_INSPECTION_PATH) return false;
  if (destination.username || destination.password || destination.hash) return false;
  if (destination.searchParams.getAll('siteUrl').length !== 1) return false;
  return normalizeBingUrl(destination.searchParams.get('siteUrl') ?? '') === expectedSite;
}

// ─────────────────────────────────────────────────────────────
// DOM 읽기 도우미
// ─────────────────────────────────────────────────────────────

// 숨김·장식·툴팁 중복을 제외하고 화면에 표시되는 텍스트만 읽습니다.
function text(element: Element | null): string {
  if (!element) return '';
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll(DECORATION_SELECTOR).forEach((node): void => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// 현재 문서에 보이는 요소만 선택합니다.
function visible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected) return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;

  // visibility는 자식의 visible 선언으로 재정의되므로 대상의 최종 계산값만 확인합니다.
  const visibility = view.getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return false;
  }

  return element.getClientRects().length > 0;
}

// 선택자에 맞는 보이는 요소들을 돌려줍니다.
function visibleAll<T extends Element>(root: ParentNode, selector: string): readonly T[] {
  return Array.from(root.querySelectorAll<T>(selector)).filter(visible);
}

// 선택자에 맞는 보이는 요소가 하나라도 있는지 확인합니다.
function anyVisible(root: ParentNode, selector: string): boolean {
  return visibleAll(root, selector).length > 0;
}

// 고정 속성으로 확인된 요소가 하나일 때만 사용합니다.
function one<T extends Element>(document: Document, selector: string): T {
  const nodes = visibleAll<T>(document, selector);
  if (nodes.length !== 1) throw new BingAutomationError('ambiguous_control');
  return nodes[0]!;
}

// 지정한 시간만큼 기다립니다.
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve): void => {
    setTimeout(resolve, ms);
  });
}

// ─────────────────────────────────────────────────────────────
// 화면 상태
// ─────────────────────────────────────────────────────────────

// 화면 종류별로 자동화를 시작할 준비가 됐는지 확인합니다. 사이트 선택 버튼이 하나 보여야 하고, 검사 화면이면 입력칸·검사 버튼도 하나씩 보여야 합니다.
function isPageReady(document: Document, route: BingPageState['route'], allowed: boolean): boolean {
  if (document.readyState !== 'complete') return false;
  if (!allowed) return false;
  if (visibleAll(document, SITE_BUTTON_SELECTOR).length !== 1) return false;
  if (route !== 'inspection') return true;
  return (
    visibleAll(document, URL_INPUT_SELECTOR).length === 1 &&
    visibleAll(document, INSPECT_BUTTON_SELECTOR).length === 1
  );
}

// URL의 속성값과 화면 선택기가 준비됐는지 확인합니다.
export function bingPageState(
  document: Document,
  pageUrl: string,
  documentToken: string,
): BingPageState {
  const url = new URL(pageUrl);
  const allowed = isWebmastersUrl(url);
  const route = routeOf(url, allowed);

  return {
    route,
    siteUrl: normalizeBingUrl(url.searchParams.get('siteUrl') ?? ''),
    documentToken,
    ready: isPageReady(document, route, allowed),
  };
}

// ─────────────────────────────────────────────────────────────
// 사이트 선택
// ─────────────────────────────────────────────────────────────

// 보이는 사이트 목록에서 목표 사이트 링크를 찾습니다. 없으면 null, 둘 이상이면 예외입니다.
function findSiteOption(list: Element, baseUrl: string, expectedSite: string | null): HTMLAnchorElement | null {
  const links = Array.from(list.querySelectorAll<HTMLAnchorElement>(SITE_OPTION_SELECTOR)).filter(
    (link): boolean => isSiteOptionLink(link, baseUrl, expectedSite),
  );
  if (links.length > 1) throw new BingAutomationError('ambiguous_control');
  return links[0] ?? null;
}

// 왼쪽 메뉴에서 일치하는 사이트의 실제 이동 링크를 찾아 관리 페이지에 반환합니다.
export async function selectBingSite(
  document: Document,
  site: string,
  signal: AbortSignal,
  timeoutMs = SELECT_SITE_TIMEOUT_MS,
): Promise<BingSiteSelection> {
  const view = document.defaultView;
  const expectedSite = normalizeBingUrl(site);
  if (!view || !expectedSite) throw new BingAutomationError('invalid_response');

  // 1. 콘솔 또는 검사 화면이 준비됐는지 확인합니다.
  const state = bingPageState(document, view.location.href, '');
  if (!['inspection', 'console'].includes(state.route) || !state.ready) {
    throw new BingAutomationError(state.route === 'auth' ? 'auth_required' : 'wrong_page');
  }

  // 2. 사이트 선택 버튼을 눌러 목록을 펼칩니다.
  const initialUrl = view.location.href;
  const selector = one<HTMLButtonElement>(document, SITE_BUTTON_SELECTOR);
  if (signal.aborted) throw new BingAutomationError('cancelled');
  if (selector.getAttribute('aria-expanded') !== 'true') selector.click();

  // 3. 목록과 항목이 다른 렌더에서 준비될 수 있어 제한 시간까지 기다립니다.
  const deadline = Date.now() + timeoutMs;
  let menuSeen = false;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new BingAutomationError('cancelled');
    if (view.location.href !== initialUrl) throw new BingAutomationError('page_changed');

    const lists = visibleAll(document, SITE_LIST_SELECTOR);
    if (lists.length > 1) throw new BingAutomationError('ambiguous_control');

    const list = lists[0];
    if (list) {
      menuSeen = true;
      const link = findSiteOption(list, initialUrl, expectedSite);
      if (link) {
        // 페이지의 합성 클릭 처리에 의존하지 않고 검증된 링크를 탭 이동 API에서 사용합니다.
        return { siteUrl: expectedSite, destinationUrl: new URL(link.href, initialUrl).href };
      }
    }

    await delay(SELECT_SITE_POLL_MS);
  }

  throw new BingAutomationError(menuSeen ? 'site_missing' : 'timeout');
}

// ─────────────────────────────────────────────────────────────
// 검사 결과 읽기
// ─────────────────────────────────────────────────────────────

// 결과 제목의 명시적인 색인 여부만 판정하고 낯선 문구는 미확인으로 남깁니다.
export function bingIndexStatus(message: string): BingAutomationObservation['indexStatus'] {
  if (INDEXED_MESSAGES.includes(message)) return 'indexed';
  if (message.includes(NOT_INDEXED_KOREAN) || NOT_INDEXED_ENGLISH.test(message)) return 'not_indexed';
  return 'unknown';
}

// 결과 카드 안의 라벨·값 쌍을 모두 읽습니다.
function labelValuePairs(card: Element): readonly LabelValue[] {
  return visibleAll(card, LABEL_VALUE_PAIR_SELECTOR).map((pair): LabelValue => ({
    label: text(pair.querySelector(ITEM_LABEL_SELECTOR)),
    value: text(pair.querySelector(ITEM_VALUE_SELECTOR)),
  }));
}

// 주어진 라벨(한국어·영어)에 해당하는 값을 돌려줍니다. 라벨이 중복되면 임의의 첫 값을 선택하지 않고 예외입니다.
function detailValue(pairs: readonly LabelValue[], labels: readonly string[]): string | null {
  const matches = pairs.filter((pair): boolean => labels.includes(pair.label));
  if (matches.length > 1) throw new BingAutomationError('invalid_response');
  return matches[0]?.value || null;
}

// "페이지 가져오기" 값이 성공이면 succeeded, 아니면 unknown입니다.
function crawlStatusOf(pairs: readonly LabelValue[]): BingAutomationObservation['crawlStatus'] {
  const fetchValue = detailValue(pairs, PAGE_FETCH_LABELS) ?? '';
  return FETCH_SUCCESS_VALUES.includes(fetchValue) ? 'succeeded' : 'unknown';
}

// 한 결과 카드 안에서만 라벨과 값을 대응시켜 상세 관측을 만듭니다.
function readBingResult(
  document: Document,
  siteUrl: string,
  targetUrl: string,
  queriedAt: string,
): BingAutomationObservation {
  const card = one<HTMLElement>(document, INDEX_CARD_SELECTOR);
  const titles = visibleAll(card, SECTION_TITLE_SELECTOR);
  if (titles.length !== 1) throw new BingAutomationError('invalid_response');

  const message = text(titles[0]!);
  const pairs = labelValuePairs(card);
  const canonical = detailValue(pairs, CANONICAL_LABELS);

  return {
    kind: 'verified_bing_gui',
    siteUrl,
    targetUrl,
    indexStatus: bingIndexStatus(message),
    message,
    reason: text(card.querySelector(ERROR_STATUS_SELECTOR)) || null,
    canonicalUrl: canonical ? normalizeBingUrl(canonical) : null,
    crawlStatus: crawlStatusOf(pairs),
    lastCrawledText: detailValue(pairs, LAST_CRAWL_LABELS),
    queriedAt,
    readAt: new Date().toISOString(),
    targetVerified: true,
  };
}

// ─────────────────────────────────────────────────────────────
// URL 검사 자동화
// ─────────────────────────────────────────────────────────────

// 새 조회의 로딩·카드 갱신과 URL 일치를 확인한 뒤 Bing 색인 결과만 반환합니다.
export async function inspectBingUrl(
  document: Document,
  site: string,
  target: string,
  signal: AbortSignal,
  timeoutMs = INSPECT_TIMEOUT_MS,
): Promise<BingAutomationObservation> {
  const view = document.defaultView;
  const siteUrl = normalizeBingUrl(site);
  const targetUrl = normalizeBingUrl(target);
  if (!view || !siteUrl || !targetUrl || !bingTargetInSite(siteUrl, targetUrl)) {
    throw new BingAutomationError('invalid_response');
  }

  // 1. 올바른 검사 화면·사이트인지 확인합니다.
  const state = bingPageState(document, view.location.href, '');
  if (state.route !== 'inspection' || state.siteUrl !== siteUrl) {
    throw new BingAutomationError('wrong_page');
  }

  // 2. 입력칸과 검사 버튼이 하나씩 있고, 다른 검사가 진행 중이 아닌지 확인합니다.
  const input = one<HTMLInputElement>(document, URL_INPUT_SELECTOR);
  const button = one<HTMLButtonElement>(document, INSPECT_BUTTON_SELECTOR);
  const busy = button.disabled || input.disabled || anyVisible(document, PROGRESS_SELECTOR);
  if (busy || signal.aborted) {
    throw new BingAutomationError(signal.aborted ? 'cancelled' : 'busy');
  }

  // 3. 지금 보이는 결과 카드와 제목을 기억해 두고, 새 결과와 구분할 기준으로 씁니다.
  const previous = document.querySelector(INDEX_CARD_SELECTOR);
  const previousText = text(previous?.querySelector(SECTION_TITLE_SELECTOR) ?? null);
  const queriedAt = new Date().toISOString();

  // 4. URL을 입력하고 검사를 누른 뒤, 새 결과 카드가 준비될 때까지 화면을 감시합니다.
  return await new Promise<BingAutomationObservation>((resolve, reject): void => {
    let done = false;
    let clicked = false;
    let fresh = false;
    let sawProgress = false;
    let observer: MutationObserver;
    let interval: ReturnType<typeof setInterval>;
    let timeout: ReturnType<typeof setTimeout>;

    // 종료 시 DOM 감시와 타이머·이벤트를 모두 정리합니다.
    function finish(error?: BingAutomationError, result?: BingAutomationObservation): void {
      if (done) return;

      done = true;
      observer.disconnect();
      clearInterval(interval);
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('click', interference, true);
      document.removeEventListener('input', interference, true);

      if (error) reject(error);
      else if (result) resolve(result);
    }

    // 사용자의 클릭·입력이 섞이면 결과를 오귀속하지 않도록 중단합니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new BingAutomationError('page_changed'));
    }

    // 취소 후 도착한 결과는 반영하지 않습니다.
    function abort(): void {
      finish(new BingAutomationError('cancelled'));
    }

    // 화면·사이트·입력값이 검사 시작 때와 달라졌는지 확인합니다.
    function pageChanged(): boolean {
      const current = bingPageState(document, view!.location.href, '');
      if (current.route !== 'inspection') return true;
      if (current.siteUrl !== siteUrl) return true;
      if (normalizeBingUrl(input.value) !== targetUrl) return true;
      return !input.isConnected;
    }

    // 지금 보이는 카드가 이전 결과가 아닌 새 결과인지 판단합니다.
    function isFreshCard(card: Element): boolean {
      if (fresh || sawProgress) return true;
      if (!previous || card !== previous) return true;
      return text(card.querySelector(SECTION_TITLE_SELECTOR)) !== previousText;
    }

    // 새 카드 준비와 사이트·검사 URL을 확인하고 필요한 상세 카드만 펼칩니다.
    function check(): void {
      if (!clicked || done) return;

      try {
        if (pageChanged()) {
          finish(new BingAutomationError('page_changed'));
          return;
        }

        // 진행 표시가 보이면 아직 결과가 나오지 않은 것입니다.
        if (anyVisible(document, PROGRESS_SELECTOR)) {
          sawProgress = true;
          return;
        }

        const cards = visibleAll(document, INDEX_CARD_SELECTOR);
        const card = cards[0];
        if (!card || cards.length !== 1) return;

        fresh = isFreshCard(card);
        if (!fresh || inspectedTarget(view!.location.href) !== targetUrl) return;

        // Bing 색인 탭이 선택돼 있어야 결과 카드가 이 URL의 것입니다.
        const pivot = document.querySelector(BINGDEX_TAB_SELECTOR);
        if (pivot?.getAttribute('aria-selected') !== 'true') {
          finish(new BingAutomationError('page_changed'));
          return;
        }

        // 상세 카드가 접혀 있으면 펼치고 다음 확인을 기다립니다.
        const header = card.querySelector<HTMLElement>(ACCORDION_HEADER_SELECTOR);
        if (header?.getAttribute('aria-expanded') === 'false') {
          header.click();
          return;
        }
        if (!anyVisible(card, INDEX_DETAILS_SELECTOR)) return;

        finish(undefined, readBingResult(document, siteUrl!, targetUrl!, queriedAt));
      } catch (error: unknown) {
        finish(asAutomationError(error));
      }
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-selected', 'aria-expanded'],
    });
    interval = setInterval(check, INSPECT_POLL_MS);
    timeout = setTimeout((): void => finish(new BingAutomationError('timeout')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('click', interference, true);
    document.addEventListener('input', interference, true);

    if (signal.aborted) {
      abort();
      return;
    }

    // 프레임워크가 감지하도록 네이티브 setter로 값을 넣고 input·change 이벤트를 보냅니다.
    try {
      const setter = Object.getOwnPropertyDescriptor(view!.HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw new BingAutomationError('ambiguous_control');

      setter.call(input, targetUrl);
      input.dispatchEvent(new view!.Event('input', { bubbles: true }));
      input.dispatchEvent(new view!.Event('change', { bubbles: true }));
      clicked = true;
      button.click();
      check();
    } catch {
      finish(new BingAutomationError('invalid_response'));
    }
  });
}
