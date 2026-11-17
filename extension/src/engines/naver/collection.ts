import {
  canonicalNaverTarget,
  collectVisibleText,
  confirmationButtons,
  inspectionInputs,
  isNaverCollectionHistoryLoading,
  isNaverCollectionPage,
  isNaverElementVisible,
  naverCollectionHistoryTable,
  naverPageState,
  naverTargetInSite,
  NAVER_BOARD_URL,
  NAVER_COLLECTION_PATH,
  NAVER_ORIGIN,
  NaverAutomationError,
} from './observation.ts';

// 이 파일은 네이버 페이지 안(콘텐츠 스크립트)에서 "요청 → 웹 페이지 수집" 화면을 조작합니다.

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 컨트롤이 나타나길 기다리는 기본 시간과 확인 주기
const DEFAULT_TIMEOUT_MS = 15000;
const CONTROL_POLL_MS = 100;
const RECEIPT_POLL_MS = 150;
// 네이버 입력칸이 받는 URL 최대 길이
const MAX_TARGET_URL_LENGTH = 2048;
// 접수 등록일이 지금보다 이만큼 미래여도 같은 요청으로 인정 (서버·브라우저 시계 차이)
const REGISTRATION_SLACK_MS = 60000;

// 왼쪽 메뉴의 표시 이름
const WEBMASTER_TOOLS_LABEL = '웹마스터 도구';
const REQUEST_MENU_LABEL = '요청';
const COLLECTION_MENU_LABEL = '웹 페이지 수집';

// 비활성 컨트롤
const DISABLED_SELECTOR = ':disabled, [aria-disabled="true"]';
// 메뉴 텍스트를 모을 때 제외하는 Vuetify 아이콘·숨김 요소
const NAVIGATION_DECORATION_SELECTOR = 'i, svg, [aria-hidden="true"], [hidden], .v-icon';
// 요청 메뉴 헤더와 수집 메뉴 항목 후보
const REQUEST_HEADER_SELECTOR = 'button, [role="button"], .v-list-group__header';
const MENU_ITEM_SELECTOR = 'a, [role="menuitem"], [role="listitem"], .v-list-item';
// 사이트 목록에서 사이트 링크가 가리킬 수 있는 경로
const SITE_LINK_PATHS: readonly string[] = ['/console/board', '/console/site/summary'];

// 네이버가 등록일로 표시하는 "YY.MM.DD HH:MM:SS"
const REGISTRATION_TEXT = /^(\d{2})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 수집 요청이 접수됐음을 확인한 증거. 수집·색인 완료는 아직 모릅니다.
export interface NaverCollectionReceipt {
  readonly kind: 'collection_receipt';
  readonly siteUrl: string;
  readonly targetUrl: string;
  readonly requestStatus: 'accepted';
  readonly collectionStatus: 'unknown';
  readonly indexStatus: 'unknown';
  readonly requestedAt: string;
  readonly readAt: string;
  readonly registeredAtText: string;
  readonly targetVerified: true;
}

// document.defaultView의 실제 타입 (생성자·location을 가진 창)
type PageWindow = NonNullable<Document['defaultView']>;

// 수집 요청 내역 표의 한 줄
interface CollectionHistoryEntry {
  readonly url: string;
  readonly registeredAtText: string;
}

// ─────────────────────────────────────────────────────────────
// 공용 도우미
// ─────────────────────────────────────────────────────────────

// 메뉴 아이콘과 숨김 장식을 제외하고 실제 표시 이름만 돌려줍니다.
function navigationText(element: Element): string {
  return collectVisibleText(element, NAVIGATION_DECORATION_SELECTOR);
}

// 요소가 비활성 상태인지 확인합니다.
function isDisabled(element: Element): boolean {
  return element.matches(DISABLED_SELECTOR);
}

// 기다린 뒤에도 주소가 같고, 그 요소가 여전히 문서에 있으며, 지금 찾은 후보가 딱 그 하나뿐인지 확인합니다.
function isStillTheOnly<T extends Element>(
  view: PageWindow,
  initialUrl: string,
  element: T,
  current: readonly T[],
): boolean {
  if (view.location.href !== initialUrl) return false;
  if (!element.isConnected) return false;
  return current.length === 1 && current[0] === element;
}

// 자동화 예외가 아닌 예외는 응답 형식 오류로 바꿉니다.
function asAutomationError(error: unknown): NaverAutomationError {
  if (error instanceof NaverAutomationError) return error;
  return new NaverAutomationError('invalid_response');
}

// 같은 문서에서 지연 렌더된 컨트롤만 기다리며 취소·사용자 조작·주소 변경 시 중단합니다.
async function waitForCollectionControl<T>(
  document: Document,
  signal: AbortSignal,
  timeoutMs: number,
  find: () => T | null,
  missingCode: 'site_missing' | 'timeout' = 'timeout',
): Promise<T> {
  const view = document.defaultView;
  if (!view) throw new NaverAutomationError('wrong_page');
  const initialUrl = view.location.href;
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  return await new Promise<T>((resolve, reject): void => {
    let done = false;
    let observer: MutationObserver;
    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    // 단일 준비 결과 또는 오류를 반환하고 모든 감시를 해제합니다.
    function finish(error?: NaverAutomationError, value?: T): void {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('click', interference, true);
      document.removeEventListener('input', interference, true);
      if (error) reject(error);
      else resolve(value!);
    }

    // 취소 뒤 나타난 컨트롤은 사용하지 않습니다.
    function abort(): void {
      finish(new NaverAutomationError('cancelled'));
    }

    // 사용자가 작업 문서를 조작한 경우 자동 선택을 진행하지 않습니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new NaverAutomationError('page_changed'));
    }

    // 문서 위치를 먼저 재검증한 뒤 읽기 전용 컨트롤 탐색을 수행합니다.
    function check(): void {
      if (done) return;
      if (view!.location.href !== initialUrl) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }
      try {
        const value = find();
        if (value !== null) finish(undefined, value);
      } catch (error: unknown) {
        finish(asAutomationError(error));
      }
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout((): void => finish(new NaverAutomationError(missingCode)), timeoutMs);
    interval = setInterval(check, CONTROL_POLL_MS);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('click', interference, true);
    document.addEventListener('input', interference, true);

    if (signal.aborted) {
      abort();
    } else {
      check();
    }
  });
}

// ─────────────────────────────────────────────────────────────
// 1단계: 사이트 목록(board)에서 메인 사이트 선택
// ─────────────────────────────────────────────────────────────

// 사이트 목록의 링크가 목표 사이트를 가리키는 활성·표시 중인 네이버 내부 링크인지 확인합니다.
function isCollectionSiteLink(
  link: HTMLAnchorElement,
  pageUrl: string,
  expected: string,
  document: Document,
): boolean {
  const destination = new URL(link.href, pageUrl);
  if (canonicalNaverTarget(link.textContent?.trim() ?? '') !== expected) return false;
  if (!isNaverElementVisible(link, document)) return false;
  if (isDisabled(link)) return false;
  if (destination.origin !== NAVER_ORIGIN) return false;
  return SITE_LINK_PATHS.includes(destination.pathname);
}

// 목표 사이트의 표시 이름·출처·경로·활성 상태를 함께 만족하는 링크만 찾습니다.
function collectionSiteLinks(document: Document, pageUrl: string, expected: string): readonly HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('table a, [role="table"] a'))
    .filter((link): boolean => isCollectionSiteLink(link, pageUrl, expected, document));
}

// 사이트 표가 먼저 생겨도 목표 링크가 표시될 때까지 기다린 뒤 안전한 항목 하나만 선택합니다.
export async function selectNaverCollectionSite(
  document: Document,
  site: string,
  signal: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const view = document.defaultView;
  if (!view) throw new NaverAutomationError('wrong_page');

  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  const expected = canonicalNaverTarget(site);
  if (page.route !== 'board') throw new NaverAutomationError('wrong_page');
  if (!expected) throw new NaverAutomationError('invalid_response');

  // 목표 링크가 하나 나타날 때까지 기다립니다. 둘 이상이면 중단합니다.
  const findLink = (): HTMLAnchorElement | null => {
    const links = collectionSiteLinks(document, initialUrl, expected);
    if (links.length > 1) throw new NaverAutomationError('ambiguous_control');
    return links[0] ?? null;
  };
  const link = await waitForCollectionControl(document, signal, timeoutMs, findLink, 'site_missing');

  if (signal.aborted) throw new NaverAutomationError('cancelled');
  const currentLinks = collectionSiteLinks(document, initialUrl, expected);
  if (!isStillTheOnly(view, initialUrl, link, currentLinks)) {
    throw new NaverAutomationError('page_changed');
  }
  link.click();
}

// ─────────────────────────────────────────────────────────────
// 2단계: 상단 "웹마스터 도구" 링크로 사이트 목록 열기
// ─────────────────────────────────────────────────────────────

// 상단 메뉴의 "웹마스터 도구" 링크가 같은 탭에서 사이트 목록으로 이동하는 링크인지 확인합니다.
function isBoardLink(link: HTMLAnchorElement, pageUrl: string, document: Document): boolean {
  const url = new URL(link.href, pageUrl);
  if (navigationText(link) !== WEBMASTER_TOOLS_LABEL) return false;
  if (!isNaverElementVisible(link, document)) return false;
  if (link.target && link.target !== '_self') return false;
  return url.href === NAVER_BOARD_URL;
}

// 인증 화면을 건드리지 않고 상단 웹마스터 도구 링크로 사이트 목록을 엽니다.
export function openNaverBoard(document: Document, pageUrl: string): void {
  const page = naverPageState(document, pageUrl, '');
  if (page.route === 'auth') throw new NaverAutomationError('auth_required');
  if (document.readyState === 'loading') throw new NaverAutomationError('page_changed');

  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
    .filter((link): boolean => isBoardLink(link, pageUrl, document));
  if (links.length !== 1) throw new NaverAutomationError('ambiguous_control');

  links[0]!.click();
}

// ─────────────────────────────────────────────────────────────
// 3단계: 왼쪽 메뉴 "요청 → 웹 페이지 수집" 열기
// ─────────────────────────────────────────────────────────────

// 요청 메뉴 헤더의 정확한 표시 이름과 클릭 가능 상태를 다시 읽습니다.
function collectionRequestHeaders(document: Document): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(REQUEST_HEADER_SELECTOR)).filter(
    (element): boolean =>
      navigationText(element) === REQUEST_MENU_LABEL &&
      !isDisabled(element) &&
      isNaverElementVisible(element, document),
  );
}

// "웹 페이지 수집" 메뉴 항목 중 가장 안쪽 요소만 고릅니다 (부모·자식 중복 제거).
function collectionMenuItems(document: Document): readonly HTMLElement[] {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)).filter(
    (element): boolean =>
      navigationText(element) === COLLECTION_MENU_LABEL &&
      !isDisabled(element) &&
      isNaverElementVisible(element, document),
  );
  return candidates.filter(
    (element): boolean => !candidates.some((child): boolean => child !== element && element.contains(child)),
  );
}

// 메뉴 항목이 링크라면 같은 사이트의 수집 화면으로 가는 링크인지 확인합니다.
function isCollectionMenuLink(link: HTMLAnchorElement, initialUrl: string, siteUrl: string): boolean {
  const destination = new URL(link.href, initialUrl);
  if (destination.origin !== NAVER_ORIGIN) return false;
  if (destination.pathname !== NAVER_COLLECTION_PATH) return false;
  return canonicalNaverTarget(destination.searchParams.get('site') ?? '') === siteUrl;
}

// 요청 메뉴를 펼친 뒤 수집 메뉴 항목이 나타나면 클릭합니다.
function clickCollectionMenu(
  document: Document,
  view: PageWindow,
  header: HTMLElement,
  initialUrl: string,
  siteUrl: string,
  signal: AbortSignal,
  deadline: number,
): Promise<void> {
  return new Promise<void>((resolve, reject): void => {
    let done = false;
    let observer: MutationObserver;
    let timer: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    // 완료·실패 후에는 메뉴 감시와 취소 이벤트를 해제합니다.
    function finish(error?: NaverAutomationError): void {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timer);
      clearInterval(interval);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('click', interference, true);
      if (error) reject(error);
      else resolve();
    }

    // 사용자의 직접 조작이 끼어들면 메뉴 클릭을 중단합니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new NaverAutomationError('page_changed'));
    }

    // 취소 뒤에는 지연 표시된 수집 메뉴도 클릭하지 않습니다.
    function abort(): void {
      finish(new NaverAutomationError('cancelled'));
    }

    // 동일 문서·사이트에서 유일하게 보이는 수집 메뉴만 선택합니다.
    function check(): void {
      if (done) return;
      if (view.location.href !== initialUrl || !header.isConnected) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }

      const items = collectionMenuItems(document);
      if (items.length > 1) {
        finish(new NaverAutomationError('ambiguous_control'));
        return;
      }
      const item = items[0];
      if (!item) return;

      if (item instanceof view.HTMLAnchorElement && !isCollectionMenuLink(item, initialUrl, siteUrl)) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }

      item.click();
      finish();
    }

    observer = new view.MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    timer = setTimeout((): void => finish(new NaverAutomationError('timeout')), Math.max(0, deadline - Date.now()));
    interval = setInterval(check, CONTROL_POLL_MS);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('click', interference, true);

    if (signal.aborted) {
      abort();
      return;
    }

    try {
      if (header.getAttribute('aria-expanded') !== 'true') header.click();
      check();
    } catch {
      finish(new NaverAutomationError('invalid_response'));
    }
  });
}

// 선택 사이트의 요청 메뉴를 펼친 뒤 웹 페이지 수집 항목 하나만 클릭합니다.
export async function openNaverCollection(
  document: Document,
  site: string,
  signal: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<void> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  if (!view || !siteUrl) throw new NaverAutomationError('wrong_page');

  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  if (page.route !== 'summary' || page.siteUrl !== siteUrl) {
    throw new NaverAutomationError('wrong_page');
  }
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  // 전체 제한 시간은 헤더 대기와 메뉴 대기에 함께 적용합니다.
  const deadline = Date.now() + timeoutMs;

  // 요청 메뉴 헤더가 하나 나타날 때까지 기다립니다.
  const findHeader = (): HTMLElement | null => {
    const headers = collectionRequestHeaders(document);
    if (headers.length > 1) throw new NaverAutomationError('ambiguous_control');
    return headers[0] ?? null;
  };
  const header = await waitForCollectionControl(document, signal, timeoutMs, findHeader);

  if (signal.aborted) throw new NaverAutomationError('cancelled');
  const currentHeaders = collectionRequestHeaders(document);
  if (!isStillTheOnly(view, initialUrl, header, currentHeaders)) {
    throw new NaverAutomationError('page_changed');
  }
  if (Date.now() >= deadline) throw new NaverAutomationError('timeout');

  await clickCollectionMenu(document, view, header, initialUrl, siteUrl, signal, deadline);
}

// ─────────────────────────────────────────────────────────────
// 4단계: 수집 화면에서 URL 제출과 접수 확인
// ─────────────────────────────────────────────────────────────

// 내역 표의 한 줄에서 URL 링크 하나와 등록일을 읽습니다. 형식이 맞지 않으면 빈 배열입니다.
function historyEntry(row: Element, document: Document): readonly CollectionHistoryEntry[] {
  const cells = row.querySelectorAll('td');
  const links = cells[1]?.querySelectorAll<HTMLAnchorElement>('a[href]');
  const link = links?.[0];
  if (links?.length !== 1 || !link) return [];

  const url = canonicalNaverTarget(link.href);
  if (!url) return [];
  if (!isNaverElementVisible(link, document)) return [];

  const registeredAtText = cells[2]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  return [{ url, registeredAtText }];
}

// 화면에서 확인한 No·URL·등록일 표 하나에서 제한된 접수 정보만 읽습니다.
function collectionHistory(document: Document): readonly CollectionHistoryEntry[] {
  const table = naverCollectionHistoryTable(document);
  if (!table) throw new NaverAutomationError('ambiguous_control');

  return Array.from(table.querySelectorAll('tbody tr')).flatMap(
    (row): readonly CollectionHistoryEntry[] => historyEntry(row, document),
  );
}

// 네이버가 한국 시각으로 표시한 등록일을 비교 가능한 시각으로 변환합니다. 형식이 다르면 NaN입니다.
function registrationTime(value: string): number {
  const match = REGISTRATION_TEXT.exec(value);
  if (!match) return Number.NaN;
  return Date.parse(`20${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`);
}

// 내역 한 줄이 이번 요청으로 새로 생긴 것인지 확인합니다. 같은 URL이고, 등록일이 요청 시각 이후이며, 제출 전 내역에 없어야 합니다.
function isNewReceipt(
  entry: CollectionHistoryEntry,
  targetUrl: string,
  earliestRegistration: number,
  previous: readonly CollectionHistoryEntry[],
): boolean {
  if (entry.url !== targetUrl) return false;

  // 등록일을 해석하지 못하면(NaN) 새 접수로 인정하지 않습니다.
  const registeredAt = registrationTime(entry.registeredAtText);
  if (Number.isNaN(registeredAt)) return false;
  if (registeredAt < earliestRegistration) return false;
  if (registeredAt > Date.now() + REGISTRATION_SLACK_MS) return false;

  return !previous.some(
    (old): boolean => old.url === entry.url && old.registeredAtText === entry.registeredAtText,
  );
}

// 접수 증거 객체를 만듭니다.
function collectionReceipt(
  siteUrl: string,
  targetUrl: string,
  requestedAt: string,
  registeredAtText: string,
): NaverCollectionReceipt {
  return {
    kind: 'collection_receipt',
    siteUrl,
    targetUrl,
    requestStatus: 'accepted',
    collectionStatus: 'unknown',
    indexStatus: 'unknown',
    requestedAt,
    readAt: new Date().toISOString(),
    registeredAtText,
    targetVerified: true,
  };
}

// URL을 한 번 제출하고 해당 URL의 새 등록일 증거만 접수로 반환합니다.
export async function requestNaverCollection(
  document: Document,
  site: string,
  target: string,
  signal: AbortSignal,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<NaverCollectionReceipt> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!view || !siteUrl || !targetUrl) throw new NaverAutomationError('invalid_response');
  if (targetUrl.length > MAX_TARGET_URL_LENGTH) throw new NaverAutomationError('invalid_response');
  if (!naverTargetInSite(siteUrl, targetUrl)) throw new NaverAutomationError('invalid_response');

  // 1. 올바른 수집 화면이고 준비됐는지 확인합니다.
  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  if (!isNaverCollectionPage(initialUrl) || page.siteUrl !== siteUrl) {
    throw new NaverAutomationError('wrong_page');
  }
  if (!page.ready) throw new NaverAutomationError('ambiguous_control');
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  // 2. 입력칸과 확인 버튼이 각각 하나씩인지 확인합니다.
  const inputs = inspectionInputs(document);
  const buttons = confirmationButtons(document);
  const input = inputs[0];
  const button = buttons[0];
  if (inputs.length !== 1 || buttons.length !== 1 || !input || !button) {
    throw new NaverAutomationError('ambiguous_control');
  }
  if (input.maxLength > 0 && targetUrl.length > input.maxLength) {
    throw new NaverAutomationError('invalid_response');
  }

  // 3. 제출 전 내역을 기억해 두고, 새 접수 줄과 구분할 기준으로 씁니다. (등록일은 초 단위라 초 아래를 버립니다.)
  const previous = collectionHistory(document);
  const requestedAt = new Date().toISOString();
  const earliestRegistration = Math.floor(Date.parse(requestedAt) / 1000) * 1000;

  // 4. URL을 입력하고 확인을 누른 뒤, 내역 표에 새 줄이 생길 때까지 감시합니다.
  return await new Promise<NaverCollectionReceipt>((resolve, reject): void => {
    let clicked = false;
    let done = false;
    let observer: MutationObserver;
    let timeout: ReturnType<typeof setTimeout>;
    let interval: ReturnType<typeof setInterval>;

    // 종료 시 감시를 해제하고 제출 후 오류는 접수 여부 미확인으로 보존합니다.
    function finish(error?: NaverAutomationError, receipt?: NaverCollectionReceipt): void {
      if (done) return;
      done = true;
      observer.disconnect();
      clearTimeout(timeout);
      clearInterval(interval);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('input', interference, true);
      document.removeEventListener('click', interference, true);

      if (error) {
        // 이미 확인을 눌렀다면 요청이 나갔을 수 있으므로 원인 대신 "접수 미확인"으로 알립니다.
        reject(clicked ? new NaverAutomationError('receipt_unconfirmed') : error);
      } else if (receipt) {
        resolve(receipt);
      }
    }

    // 사용자 조작과 자동 제출이 충돌하면 추가 클릭 없이 중단합니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new NaverAutomationError('page_changed'));
    }

    // 취소는 아직 전송하지 않은 동작만 막고 이미 전송된 요청을 재시도하지 않습니다.
    function abort(): void {
      finish(new NaverAutomationError('cancelled'));
    }

    // 주소·입력칸·입력값이 제출 당시와 다른지 확인합니다.
    function pageChanged(): boolean {
      if (view!.location.href !== initialUrl) return true;
      if (!input!.isConnected) return true;
      return canonicalNaverTarget(input!.value) !== targetUrl;
    }

    // 제출 전후 경로·입력 대상과 새 요청 내역을 함께 검증합니다.
    function check(): void {
      if (!clicked || done) return;
      if (pageChanged()) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }
      if (isNaverCollectionHistoryLoading(document)) return;

      try {
        const entries = collectionHistory(document).filter(
          (entry): boolean => isNewReceipt(entry, targetUrl!, earliestRegistration, previous),
        );
        const entry = entries[0];
        if (entries.length !== 1 || !entry) return;
        finish(undefined, collectionReceipt(siteUrl!, targetUrl!, requestedAt, entry.registeredAtText));
      } catch (error: unknown) {
        // 표가 잠시 사라진 상태(ambiguous_control)는 다음 확인까지 기다립니다.
        if (error instanceof NaverAutomationError && error.code === 'ambiguous_control') return;
        finish(asAutomationError(error));
      }
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
    interval = setInterval(check, RECEIPT_POLL_MS);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('input', interference, true);
    document.addEventListener('click', interference, true);

    // 프레임워크(Vue)가 감지하도록 네이티브 setter로 값을 넣습니다.
    const setter = Object.getOwnPropertyDescriptor(view!.HTMLInputElement.prototype, 'value')?.set;
    if (!setter) {
      finish(new NaverAutomationError('ambiguous_control'));
      return;
    }
    if (signal.aborted) {
      abort();
      return;
    }

    try {
      setter.call(input, targetUrl);
      input.dispatchEvent(new view!.Event('input', { bubbles: true }));
      input.dispatchEvent(new view!.Event('change', { bubbles: true }));
      if (signal.aborted) {
        abort();
        return;
      }
      // 확인을 누르기 직전에 화면이 그대로인지 한 번 더 확인합니다.
      if (done || pageChanged() || !button.isConnected || button.disabled) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }
      clicked = true;
      button.click();
      check();
    } catch {
      finish(new NaverAutomationError('invalid_response'));
    }
  });
}
