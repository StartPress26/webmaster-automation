import { canonicalHttpUrl } from '../../url.ts';

// 이 파일은 네이버 서치어드바이저 페이지 안(콘텐츠 스크립트)과 관리 화면 양쪽에서 쓰입니다.
// DOM을 읽고 조작하는 함수는 모두 호출자가 넘긴 document만 사용합니다.

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 확장 관리 화면 ↔ 콘텐츠 스크립트 사이의 메시지 종류
export const NAVER_READ_MESSAGE = 'STARTPRESS_READ_NAVER_OBSERVATION';
export const NAVER_AUTOMATION_MESSAGE = 'STARTPRESS_NAVER_AUTOMATION';

// 네이버 서치어드바이저의 출처와 화면 경로
export const NAVER_ORIGIN = 'https://searchadvisor.naver.com';
export const NAVER_BOARD_PATH = '/console/board';
const NAVER_SUMMARY_PATH = '/console/site/summary';
export const NAVER_INSPECTION_PATH = '/console/site/check/inspection';
export const NAVER_COLLECTION_PATH = '/console/site/request/crawl';
export const NAVER_BOARD_URL = `${NAVER_ORIGIN}${NAVER_BOARD_PATH}`;

// 네이버가 색인 상태 확인 화면에 표시하는 판정 문구 (글자 그대로 비교)
export const NAVER_INDEXED_MESSAGE =
  '문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.';
export const NAVER_CRAWLED_MESSAGE =
  '문서가 성공적으로 수집됐습니다. 미색인 문서로 검색대상이 아닙니다.';
export const NAVER_NO_RESULT_MESSAGE = 'URL 검사 결과가 없습니다.';

// 입력칸으로 인정하는 input 종류. 미리보기 읽기는 검색(search) 칸도 허용합니다.
const INSPECTION_INPUT_TYPES: readonly string[] = ['text', 'url'];
const PREVIEW_INPUT_TYPES: readonly string[] = ['text', 'url', 'search'];

// 숨겨진 것으로 보는 조상 요소
const HIDDEN_ANCESTOR_SELECTOR = '[hidden], [aria-hidden="true"], script, style, noscript';
// 판정 문구를 모을 때 제외하는 아이콘·장식 요소
const JUDGEMENT_DECORATION_SELECTOR =
  'i, svg, [role="img"], [aria-hidden="true"], [hidden], .v-icon, .material-icons';
// 판정 문구가 들어 있을 수 있는 요소
const RESULT_CONTAINER_SELECTOR = 'div, p, span';
const BUTTON_SELECTOR = 'button, [role="button"]';
const CONFIRM_BUTTON_LABEL = '확인';

// "색인 완료 아니오" 배지와 "최종 업데이트 YYYY. M. D." 문구
const NOT_INDEXED_BADGE = /^색인\s*완료\s*(아니오|아니요)$/;
export const NAVER_LAST_UPDATED_TEXT = /^최종\s*업데이트\s*\d{2,4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/;

// 수집 요청 내역 표의 헤더(열 이름을 |로 이어 비교)
const HISTORY_TABLE_HEADERS = 'No|URL|등록일';

// URL 검사 자동화: 새 결과를 기다리는 최대 시간과 확인 주기
const DEFAULT_INSPECTION_TIMEOUT_MS = 15000;
const INSPECTION_POLL_MS = 150;

// DOM 노드 종류
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 콘텐츠 스크립트가 알려주는 현재 화면 상태
export interface NaverPageState {
  readonly route: 'board' | 'summary' | 'inspection' | 'collection' | 'auth' | 'other';
  readonly siteUrl: string | null;
  readonly ready: boolean;
  readonly documentToken: string;
}

// URL 검사 화면에서 판독할 수 있는 세 가지 결과입니다.
type NaverIndexStatus = 'indexed' | 'crawled' | 'unknown';

// URL 검사 자동화로 확인한 결과. 입력한 URL과 화면의 사이트가 일치함을 검증했습니다.
export interface NaverAutomationObservation {
  readonly kind: 'verified_gui';
  readonly siteUrl: string;
  readonly targetUrl: string;
  readonly indexStatus: NaverIndexStatus;
  readonly message: string;
  readonly queriedAt: string;
  readonly readAt: string;
  readonly targetVerified: true;
}

// 자동화가 중단된 이유
export type NaverAutomationCode =
  | 'wrong_page'
  | 'auth_required'
  | 'site_missing'
  | 'ambiguous_control'
  | 'page_changed'
  | 'busy'
  | 'timeout'
  | 'cancelled'
  | 'receipt_unconfirmed'
  | 'script_unavailable'
  | 'invalid_response';

// 화면에 보이는 결과를 그대로 읽은 미리보기. 입력 URL과의 연결은 검증하지 않았습니다.
export interface NaverVisibleObservation {
  readonly kind: 'visible_preview';
  readonly siteUrl: string;
  readonly inputUrl: string;
  readonly indexStatus: NaverIndexStatus;
  readonly message: string;
  readonly engineUpdatedText: string | null;
  readonly readAt: string;
  readonly targetVerified: false;
}

// 미리보기 읽기 결과
export type NaverReadResult =
  | { readonly ok: true; readonly observation: NaverVisibleObservation }
  | {
      readonly ok: false;
      readonly code:
        | 'wrong_page'
        | 'loading'
        | 'site_missing'
        | 'target_ambiguous'
        | 'result_unrecognized'
        | 'result_conflict';
    };

// 화면에서 확인한 판정 요소와 읽은 시점의 문구·상태입니다.
interface ResultMarker {
  readonly node: Element;
  readonly text: string;
  readonly indexStatus: NaverIndexStatus;
}

// ─────────────────────────────────────────────────────────────
// 오류
// ─────────────────────────────────────────────────────────────

const AUTOMATION_MESSAGES: Readonly<Record<NaverAutomationCode, string>> = {
  wrong_page: '네이버 작업 탭이 예상한 콘솔 화면에 있지 않습니다.',
  auth_required: '네이버 인증이 필요합니다. 작업 탭에서 직접 확인한 뒤 다시 실행하세요.',
  site_missing:
    '네이버 사이트 목록에서 해당 메인 사이트를 찾지 못했습니다. 등록·접근 권한을 확인하세요.',
  ambiguous_control: '네이버의 입력칸·확인 버튼·사이트 항목을 하나로 식별하지 못했습니다.',
  page_changed: '작업 중 사이트·URL·문서가 바뀌어 네이버 조회를 중단했습니다.',
  busy: '네이버 탭에서 다른 조회가 진행 중입니다.',
  timeout: '새 네이버 결과나 화면 전환을 확인하지 못해 중단했습니다. 자동 재조회하지 않습니다.',
  cancelled: '네이버 자동 조회를 취소했습니다.',
  receipt_unconfirmed:
    '수집 요청이 전송됐을 수 있으나 접수 여부를 확인하지 못했습니다. 요청 내역을 직접 확인하세요. 자동 재요청하지 않습니다.',
  script_unavailable:
    '네이버 작업 스크립트와 연결되지 않아 수집 요청을 시작하지 못했습니다. 확장을 새로고침했다면 네이버 탭도 새로고침한 뒤 실행하세요.',
  invalid_response: '네이버 자동 조회 응답의 대상·판정·작업 ID를 확인하지 못했습니다.',
};

// 네이버 자동화가 중단됐을 때 던지는 예외. 코드마다 고정된 안내 문구를 가집니다.
export class NaverAutomationError extends Error {
  readonly code: NaverAutomationCode;

  // 원본 페이지·요청·예외 대신 고정된 원인만 보관합니다.
  constructor(code: NaverAutomationCode) {
    super(AUTOMATION_MESSAGES[code]);
    this.code = code;
  }
}

// ─────────────────────────────────────────────────────────────
// URL·화면 판별
// ─────────────────────────────────────────────────────────────

// 인증정보나 프래그먼트가 있는 URL, HTTP가 아닌 값은 읽기 대상에서 제외하고 나머지는 정규화합니다.
export function canonicalNaverTarget(value: string): string | null {
  return canonicalHttpUrl(value);
}

// 아이디·비밀번호 없이 네이버 서치어드바이저의 특정 경로를 가리키는 주소인지 확인합니다.
function isNaverPath(value: string, pathname: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === NAVER_ORIGIN && url.pathname === pathname && !url.username && !url.password;
  } catch {
    return false;
  }
}

// 실제 화면에서 확인한 색인 상태 확인 경로만 허용합니다.
export function isNaverInspectionPage(value: string): boolean {
  return isNaverPath(value, NAVER_INSPECTION_PATH);
}

// 실제 확인한 네이버 웹 페이지 수집 경로만 허용합니다.
export function isNaverCollectionPage(value: string): boolean {
  return isNaverPath(value, NAVER_COLLECTION_PATH);
}

// 경로로 현재 화면 종류를 정합니다.
function routeOf(pathname: string): NaverPageState['route'] {
  if (pathname === NAVER_BOARD_PATH) return 'board';
  if (pathname === NAVER_SUMMARY_PATH) return 'summary';
  if (pathname === NAVER_INSPECTION_PATH) return 'inspection';
  if (pathname === NAVER_COLLECTION_PATH) return 'collection';
  return 'other';
}

// 인증(로그인) 화면이거나 네이버가 아닌 주소인지 확인합니다.
function isAuthRoute(url: URL): boolean {
  if (url.origin !== NAVER_ORIGIN) return true;
  return url.pathname.startsWith('/auth') || url.pathname.includes('login');
}

// 공개 HTTP URL만 같은 사이트 범위에 있는지 검사합니다.
export function naverTargetInSite(site: string, target: string): boolean {
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!siteUrl || !targetUrl) return false;

  const parent = new URL(siteUrl);
  const child = new URL(targetUrl);
  if (parent.origin !== child.origin) return false;

  const samePath = child.pathname === parent.pathname;
  const underParent = child.pathname.startsWith(parent.pathname.replace(/\/$/, '') + '/');
  return samePath || underParent;
}

// ─────────────────────────────────────────────────────────────
// DOM 읽기 도우미
// ─────────────────────────────────────────────────────────────

// 연속 공백을 하나로 줄이고 양끝 공백을 없앱니다.
function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

// 요소의 textContent를 정규화해 돌려줍니다.
function elementText(element: Element): string {
  return normalizeText(element.textContent ?? '');
}

// 계산된 스타일상 보이지 않는 요소인지 확인합니다.
function isHiddenByStyle(element: Element, view: Window | null): boolean {
  const style = view?.getComputedStyle(element);
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
}

// 숨김 요소와 문서 밖 요소를 배제하고 실제 표시된 입력·결과만 읽습니다.
export function isNaverElementVisible(element: Element, document: Document): boolean {
  if (element.closest(HIDDEN_ANCESTOR_SELECTOR)) return false;

  const view = document.defaultView;
  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    if (isHiddenByStyle(parent, view)) return false;
  }

  return element.getClientRects().length > 0;
}

// 아이콘·장식·숨김 노드의 텍스트를 제외하고 요소 안의 표시 텍스트를 모읍니다.
// 자식 텍스트는 원래 공백을 보존해 모은 뒤 마지막에만 정규화합니다.
export function collectVisibleText(element: Element, excludeSelector: string): string {
  function collect(node: Node): string {
    if (node.nodeType === TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== ELEMENT_NODE) return '';

    const child = node as Element;
    if (child.matches(excludeSelector)) return '';

    return Array.from(child.childNodes).map(collect).join('');
  }

  return normalizeText(collect(element));
}

// 판정 문구의 인라인 서식은 보존하고 아이콘·장식만 제외한 텍스트
function judgementText(element: Element): string {
  return collectVisibleText(element, JUDGEMENT_DECORATION_SELECTOR);
}

// 요소 안에 자식이 같은 문구를 갖고 있으면(부모·자식 중복) 바깥 요소는 판정 영역으로 보지 않습니다.
function hasChildWithSameText(element: Element, text: string): boolean {
  return Array.from(element.children).some((child): boolean => judgementText(child) === text);
}

// 확인된 판정 문구만 상태로 변환합니다. 결과 없음과 인식하지 못한 문구를 구분합니다.
function indexStatusOf(message: unknown): NaverIndexStatus | null {
  if (message === NAVER_INDEXED_MESSAGE) return 'indexed';
  if (message === NAVER_CRAWLED_MESSAGE) return 'crawled';
  if (message === NAVER_NO_RESULT_MESSAGE) return 'unknown';
  return null;
}

// 미리보기와 자동 조회 응답 모두 화면 판독과 같은 문구·상태 조합만 허용합니다.
export function hasConsistentNaverJudgement(message: unknown, indexStatus: unknown): boolean {
  const expectedStatus = indexStatusOf(message);
  return expectedStatus !== null && expectedStatus === indexStatus;
}

// 판정 텍스트가 정확한 결과 영역만 선택하고 부모·자식의 중복은 제외합니다.
function resultMarkers(document: Document): readonly ResultMarker[] {
  return Array.from(document.querySelectorAll(RESULT_CONTAINER_SELECTOR)).flatMap((element): ResultMarker[] => {
    const text = judgementText(element);
    const indexStatus = indexStatusOf(text);
    if (indexStatus === null) return [];
    if (hasChildWithSameText(element, text)) return [];
    if (!isNaverElementVisible(element, document)) return [];
    return [{ node: element, text, indexStatus }];
  });
}

// 확인 버튼은 표시된 정확한 이름으로만 찾고 수집 요청 버튼은 선택하지 않습니다.
export function confirmationButtons(document: Document): readonly HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button): boolean =>
      button.textContent?.trim() === CONFIRM_BUTTON_LABEL &&
      !button.disabled &&
      isNaverElementVisible(button, document),
  );
}

// 검사 화면의 편집 가능한 URL 입력칸만 찾습니다.
export function inspectionInputs(document: Document): readonly HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (input): boolean =>
      INSPECTION_INPUT_TYPES.includes(input.type) &&
      !input.disabled &&
      !input.readOnly &&
      isNaverElementVisible(input, document),
  );
}

// 표의 헤더 열 이름을 |로 이어 붙입니다.
function tableHeaderSignature(table: HTMLTableElement): string {
  return Array.from(table.querySelectorAll('thead th')).map(elementText).join('|');
}

// 실제 확인한 헤더를 가진 표시 중인 수집 요청 내역 표 하나만 반환합니다.
export function naverCollectionHistoryTable(document: Document): HTMLTableElement | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table')).filter(
    (table): boolean =>
      isNaverElementVisible(table, document) && tableHeaderSignature(table) === HISTORY_TABLE_HEADERS,
  );
  if (tables.length !== 1) return null;
  return tables[0] ?? null;
}

// 화면이 이전 내역을 불러오는 중이면 접수 비교의 기준 상태로 사용하지 않습니다.
export function isNaverCollectionHistoryLoading(document: Document): boolean {
  return Array.from(document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')).some(
    (element): boolean => isNaverElementVisible(element, document),
  );
}

// ─────────────────────────────────────────────────────────────
// 화면 관측 미리보기 (입력 URL과의 연결은 검증하지 않음)
// ─────────────────────────────────────────────────────────────

// 미리보기용 입력칸: 보이는 텍스트·URL·검색 칸 중 올바른 URL이 들어 있는 것
function previewInputs(document: Document): readonly HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (input): boolean =>
      PREVIEW_INPUT_TYPES.includes(input.type) &&
      isNaverElementVisible(input, document) &&
      canonicalNaverTarget(input.value) !== null,
  );
}

// 화면에 보이는 버튼들의 문구
function visibleButtonTexts(document: Document): readonly string[] {
  return Array.from(document.querySelectorAll(BUTTON_SELECTOR))
    .filter((element): boolean => isNaverElementVisible(element, document))
    .map(elementText);
}

// 문서 본문 원문 대신 화면에서 검증한 고정 판정 문구와 제한된 메타 정보만 반환합니다.
export function readNaverVisibleObservation(
  document: Document,
  pageUrl: string,
  readAt = new Date().toISOString(),
): NaverReadResult {
  if (!isNaverInspectionPage(pageUrl)) return { ok: false, code: 'wrong_page' };
  if (document.readyState === 'loading') return { ok: false, code: 'loading' };

  const siteUrl = canonicalNaverTarget(new URL(pageUrl).searchParams.get('site') ?? '');
  if (!siteUrl) return { ok: false, code: 'site_missing' };

  const inputs = previewInputs(document);
  const input = inputs[0];
  if (inputs.length !== 1 || !input) return { ok: false, code: 'target_ambiguous' };

  const inputUrl = canonicalNaverTarget(input.value);
  if (!inputUrl) return { ok: false, code: 'target_ambiguous' };

  const markers = resultMarkers(document);
  const marker = markers[0];
  if (markers.length !== 1 || !marker) return { ok: false, code: 'result_unrecognized' };

  const message = marker.text;
  const buttonTexts = visibleButtonTexts(document);

  // "색인됨" 문구와 "색인 완료 아니오" 배지가 함께 보이면 서로 모순이므로 읽지 않습니다.
  const hasNotIndexedBadge = buttonTexts.some((text): boolean => NOT_INDEXED_BADGE.test(text));
  if (message === NAVER_INDEXED_MESSAGE && hasNotIndexedBadge) {
    return { ok: false, code: 'result_conflict' };
  }

  const updated = buttonTexts.find((text): boolean => NAVER_LAST_UPDATED_TEXT.test(text));

  return {
    ok: true,
    observation: {
      kind: 'visible_preview',
      siteUrl,
      inputUrl,
      indexStatus: marker.indexStatus,
      message,
      engineUpdatedText: updated ?? null,
      readAt,
      targetVerified: false,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 화면 상태와 사이트 선택
// ─────────────────────────────────────────────────────────────

// 화면 종류별로 자동화를 시작할 준비가 됐는지 확인합니다.
function isRouteReady(document: Document, route: NaverPageState['route'], siteUrl: string | null): boolean {
  if (route === 'board') {
    return Boolean(document.querySelector('table, [role="table"]'));
  }
  if (route === 'inspection' || route === 'collection') {
    if (inspectionInputs(document).length !== 1) return false;
    if (confirmationButtons(document).length !== 1) return false;
    if (route !== 'collection') return true;
    return Boolean(naverCollectionHistoryTable(document)) && !isNaverCollectionHistoryLoading(document);
  }
  return route === 'summary' && Boolean(siteUrl);
}

// 인증 화면의 DOM은 읽지 않고 경로로 먼저 중단합니다.
export function naverPageState(
  document: Document,
  pageUrl: string,
  documentToken: string,
): NaverPageState {
  const url = new URL(pageUrl);
  if (isAuthRoute(url)) {
    return { route: 'auth', siteUrl: null, ready: false, documentToken };
  }

  const route = routeOf(url.pathname);
  const siteUrl = canonicalNaverTarget(url.searchParams.get('site') ?? '');
  const ready = document.readyState !== 'loading' && isRouteReady(document, route, siteUrl);

  return { route, siteUrl, ready, documentToken };
}


// ─────────────────────────────────────────────────────────────
// URL 검사 자동화
// ─────────────────────────────────────────────────────────────

// 검사 전에 있던 판정 요소가 모두 사라졌거나 숨겨졋는지 확인합니다. 이전 요소가 없으면 거짓입니다.
function allPreviousHidden(previous: readonly ResultMarker[], document: Document): boolean {
  if (!previous.length) return false;
  return previous.every(
    (old): boolean => !old.node.isConnected || !isNaverElementVisible(old.node, document),
  );
}

// 지금 보이는 판정 요소가 이전 결과가 아닌 새 결과라고 볼 수 있는지 판단합니다.
function isFreshMarker(
  previous: readonly ResultMarker[],
  marker: Element,
  cleared: boolean,
  document: Document,
): boolean {
  if (cleared) return true;
  if (previous.length === 0) return true;

  const allPreviousChanged = previous.every(
    (old): boolean =>
      !old.node.isConnected ||
      !isNaverElementVisible(old.node, document) ||
      judgementText(old.node) !== old.text,
  );
  if (allPreviousChanged) return true;

  // 이전 요소 중 하나가 아니라면 새로 생긴 요소입니다.
  return !previous.some((old): boolean => old.node === marker);
}

// 검증을 마친 결과 객체를 만듭니다.
function verifiedObservation(
  siteUrl: string,
  targetUrl: string,
  marker: ResultMarker,
  queriedAt: string,
): NaverAutomationObservation {
  return {
    kind: 'verified_gui',
    siteUrl,
    targetUrl,
    indexStatus: marker.indexStatus,
    message: marker.text,
    queriedAt,
    readAt: new Date().toISOString(),
    targetVerified: true,
  };
}

// 한 틱 양보해 앞선 DOM 변경이 반영될 시간을 줍니다.
function yieldMicrotask(): Promise<void> {
  return new Promise<void>((resolve): void => {
    queueMicrotask(resolve);
  });
}

// URL을 입력·확인하고 이전 결과가 바뀐 증거와 정확한 사이트·URL을 확인한 경우만 반환합니다.
export async function inspectNaverUrl(
  document: Document,
  site: string,
  target: string,
  signal: AbortSignal,
  timeoutMs = DEFAULT_INSPECTION_TIMEOUT_MS,
): Promise<NaverAutomationObservation> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!view || !siteUrl || !targetUrl || !naverTargetInSite(siteUrl, targetUrl)) {
    throw new NaverAutomationError('invalid_response');
  }

  // 1. 올바른 화면·사이트인지 확인합니다.
  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  if (page.route !== 'inspection' || page.siteUrl !== siteUrl) {
    throw new NaverAutomationError('wrong_page');
  }

  // 2. 입력칸과 확인 버튼이 각각 하나씩인지 확인합니다.
  const inputs = inspectionInputs(document);
  const buttons = confirmationButtons(document);
  const input = inputs[0];
  const button = buttons[0];
  if (inputs.length !== 1 || buttons.length !== 1 || !input || !button) {
    throw new NaverAutomationError('ambiguous_control');
  }
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  // 3. 지금 화면의 판정 요소를 기억해 두고, 새 결과와 구분할 기준으로 씁니다.
  const previous = resultMarkers(document);
  const queriedAt = new Date().toISOString();

  await yieldMicrotask();
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  // 4. URL을 입력하고 확인을 누른 뒤, 새 판정이 나타날 때까지 화면을 감시합니다.
  return await new Promise<NaverAutomationObservation>((resolve, reject): void => {
    let clicked = false;
    let done = false;
    let cleared = false;
    let observer: MutationObserver;
    let timeout: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    // 완료 시 감시·타이머·이벤트를 모두 해제합니다.
    function finish(error?: NaverAutomationError, observation?: NaverAutomationObservation): void {
      if (done) return;

      done = true;
      observer.disconnect();
      clearTimeout(timeout);
      clearInterval(interval);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('input', interference, true);
      document.removeEventListener('click', interference, true);

      if (error) reject(error);
      else if (observation) resolve(observation);
    }

    // 사용자가 작업 페이지를 조작하면 충돌을 피하도록 중단합니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new NaverAutomationError('page_changed'));
    }

    // 취소한 뒤 도착한 결과는 성공으로 반영하지 않습니다.
    function abort(): void {
      finish(new NaverAutomationError('cancelled'));
    }

    // 주소나 입력값이 바뀌었는지 확인합니다.
    function pageChanged(): boolean {
      return view!.location.href !== initialUrl || canonicalNaverTarget(input!.value) !== targetUrl;
    }

    // 새 결과가 나타나도 사이트·입력·경로가 달라졌으면 처리하지 않습니다.
    function check(): void {
      if (!clicked || done) return;

      if (pageChanged()) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }

      const markers = resultMarkers(document);
      if (allPreviousHidden(previous, document)) cleared = true;

      const marker = markers[0];
      if (markers.length !== 1 || !marker) return;
      if (!isFreshMarker(previous, marker.node, cleared, document)) return;

      finish(undefined, verifiedObservation(siteUrl!, targetUrl!, marker, queriedAt));
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    });
    timeout = setTimeout((): void => finish(new NaverAutomationError('timeout')), timeoutMs);
    interval = setInterval(check, INSPECTION_POLL_MS);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('input', interference, true);
    document.addEventListener('click', interference, true);

    if (signal.aborted) {
      abort();
      return;
    }

    // 프레임워크(Vue)가 감지하도록 네이티브 setter로 값을 넣고 input·change 이벤트를 보냅니다.
    const setter = Object.getOwnPropertyDescriptor(view!.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) {
      finish(new NaverAutomationError('ambiguous_control'));
      return;
    }

    setter.call(input, targetUrl);
    input.dispatchEvent(new view!.Event('input', { bubbles: true }));
    input.dispatchEvent(new view!.Event('change', { bubbles: true }));
    clicked = true;
    button.click();
    check();
  });
}
