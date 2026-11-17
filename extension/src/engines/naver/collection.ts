import {
  canonicalNaverTarget,
  isNaverElementVisible,
  isNaverCollectionHistoryLoading,
  naverCollectionHistoryTable,
  naverPageState,
  naverTargetInSite,
  NaverAutomationError,
} from './observation.ts';

export const NAVER_COLLECTION_PATH = '/console/site/request/crawl';

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
    function abort(): void { finish(new NaverAutomationError('cancelled')); }

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
        finish(error instanceof NaverAutomationError ? error : new NaverAutomationError('invalid_response'));
      }
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    timer = setTimeout((): void => finish(new NaverAutomationError(missingCode)), timeoutMs);
    interval = setInterval(check, 100);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('click', interference, true);
    document.addEventListener('input', interference, true);
    if (signal.aborted) abort();
    else check();
  });
}

// 목표 사이트의 표시 이름·출처·경로·활성 상태를 함께 만족하는 링크만 찾습니다.
function collectionSiteLinks(document: Document, pageUrl: string, expected: string): readonly HTMLAnchorElement[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('table a, [role="table"] a'))
    .filter((item): boolean => {
      const destination = new URL(item.href, pageUrl);
      return canonicalNaverTarget(item.textContent?.trim() ?? '') === expected &&
        isNaverElementVisible(item, document) && !item.matches(':disabled, [aria-disabled="true"]') &&
        destination.origin === 'https://searchadvisor.naver.com' &&
        ['/console/board', '/console/site/summary'].includes(destination.pathname);
    });
}

// 사이트 표가 먼저 생겨도 목표 링크가 표시될 때까지 기다린 뒤 안전한 항목 하나만 선택합니다.
export async function selectNaverCollectionSite(
  document: Document,
  site: string,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<void> {
  const view = document.defaultView;
  if (!view) throw new NaverAutomationError('wrong_page');
  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  const expected = canonicalNaverTarget(site);
  if (page.route !== 'board') throw new NaverAutomationError('wrong_page');
  if (!expected) throw new NaverAutomationError('invalid_response');
  const link = await waitForCollectionControl(document, signal, timeoutMs, (): HTMLAnchorElement | null => {
    const links = collectionSiteLinks(document, initialUrl, expected);
    if (links.length > 1) throw new NaverAutomationError('ambiguous_control');
    return links[0] ?? null;
  }, 'site_missing');
  if (signal.aborted) throw new NaverAutomationError('cancelled');
  const currentLinks = collectionSiteLinks(document, initialUrl, expected);
  if (view.location.href !== initialUrl || !link.isConnected || currentLinks.length !== 1 || currentLinks[0] !== link)
    throw new NaverAutomationError('page_changed');
  link.click();
}

// 메뉴 아이콘과 숨김 장식을 제외하고 실제 표시 이름만 비교합니다.
function navigationText(element: Element): string {
  // 인라인 메뉴 텍스트를 모으되 Vuetify 아이콘은 제외합니다.
  function collect(node: Node): string {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';
    const child = node as Element;
    if (child.matches('i, svg, [aria-hidden="true"], [hidden], .v-icon')) return '';
    return Array.from(child.childNodes).map(collect).join('');
  }
  return collect(element).replace(/\s+/g, ' ').trim();
}

// 요청 메뉴 헤더의 정확한 표시 이름과 클릭 가능 상태를 다시 읽습니다.
function collectionRequestHeaders(document: Document): readonly HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    'button, [role="button"], .v-list-group__header',
  )).filter((element): boolean =>
    navigationText(element) === '요청' && !element.matches(':disabled, [aria-disabled="true"]') &&
    isNaverElementVisible(element, document));
}

// 인증 화면을 건드리지 않고 상단 웹마스터 도구 링크로 사이트 목록을 엽니다.
export function openNaverBoard(document: Document, pageUrl: string): void {
  const page = naverPageState(document, pageUrl, '');
  if (page.route === 'auth') throw new NaverAutomationError('auth_required');
  if (document.readyState === 'loading') throw new NaverAutomationError('page_changed');
  const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]')).filter(
    (link): boolean => {
      const url = new URL(link.href, pageUrl);
      return navigationText(link) === '웹마스터 도구' &&
        isNaverElementVisible(link, document) &&
        (!link.target || link.target === '_self') &&
        url.href === 'https://searchadvisor.naver.com/console/board';
    },
  );
  if (links.length !== 1) throw new NaverAutomationError('ambiguous_control');
  links[0]!.click();
}

// 선택 사이트의 요청 메뉴를 펼친 뒤 웹 페이지 수집 항목 하나만 클릭합니다.
export async function openNaverCollection(
  document: Document,
  site: string,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<void> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  if (!view || !siteUrl) throw new NaverAutomationError('wrong_page');
  const initialUrl = view?.location.href ?? '';
  const page = naverPageState(document, initialUrl, '');
  if (!view || !siteUrl || page.route !== 'summary' || page.siteUrl !== siteUrl)
    throw new NaverAutomationError('wrong_page');
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const deadline = Date.now() + timeoutMs;
  const header = await waitForCollectionControl(document, signal, timeoutMs, (): HTMLElement | null => {
    const headers = collectionRequestHeaders(document);
    if (headers.length > 1) throw new NaverAutomationError('ambiguous_control');
    return headers[0] ?? null;
  });
  if (signal.aborted) throw new NaverAutomationError('cancelled');
  const currentHeaders = collectionRequestHeaders(document);
  if (view.location.href !== initialUrl || !header.isConnected || currentHeaders.length !== 1 || currentHeaders[0] !== header)
    throw new NaverAutomationError('page_changed');
  if (Date.now() >= deadline) throw new NaverAutomationError('timeout');

  await new Promise<void>((resolve, reject): void => {
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
      if (view!.location.href !== initialUrl || !header.isConnected) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }
      const candidates = Array.from(document.querySelectorAll<HTMLElement>(
        'a, [role="menuitem"], [role="listitem"], .v-list-item',
      )).filter((element): boolean =>
        navigationText(element) === '웹 페이지 수집' &&
        !element.matches(':disabled, [aria-disabled="true"]') &&
        isNaverElementVisible(element, document));
      const items = candidates.filter((element): boolean =>
        !candidates.some((child): boolean => child !== element && element.contains(child)));
      if (items.length > 1) {
        finish(new NaverAutomationError('ambiguous_control'));
        return;
      }
      const item = items[0];
      if (!item) return;
      if (item instanceof view!.HTMLAnchorElement) {
        const destination = new URL(item.href, initialUrl);
        if (destination.origin !== 'https://searchadvisor.naver.com' ||
          destination.pathname !== NAVER_COLLECTION_PATH ||
          canonicalNaverTarget(destination.searchParams.get('site') ?? '') !== siteUrl) {
          finish(new NaverAutomationError('page_changed'));
          return;
        }
      }
      item.click();
      finish();
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true });
    timer = setTimeout((): void => finish(new NaverAutomationError('timeout')), Math.max(0, deadline - Date.now()));
    interval = setInterval(check, 100);
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

interface CollectionHistoryEntry {
  readonly url: string;
  readonly registeredAtText: string;
}

// 실제 확인한 네이버 웹 페이지 수집 경로만 허용합니다.
export function isNaverCollectionPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://searchadvisor.naver.com' &&
      url.pathname === NAVER_COLLECTION_PATH &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// 화면에서 확인한 No·URL·등록일 표 하나에서 제한된 접수 정보만 읽습니다.
function collectionHistory(document: Document): readonly CollectionHistoryEntry[] {
  const table = naverCollectionHistoryTable(document);
  if (!table) throw new NaverAutomationError('ambiguous_control');

  return Array.from(table.querySelectorAll('tbody tr')).flatMap(
    (row): readonly CollectionHistoryEntry[] => {
      const cells = row.querySelectorAll('td');
      const links = cells[1]?.querySelectorAll<HTMLAnchorElement>('a[href]');
      const link = links?.[0];
      const url = link && canonicalNaverTarget(link.href);
      const registeredAtText = cells[2]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return links?.length === 1 && link && url && isNaverElementVisible(link, document)
        ? [{ url, registeredAtText }]
        : [];
    },
  );
}

// 네이버가 한국 시각으로 표시한 등록일을 비교 가능한 시각으로 변환합니다.
function registrationTime(value: string): number {
  const match = /^(\d{2})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value);
  return match
    ? Date.parse(`20${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`)
    : Number.NaN;
}

// URL을 한 번 제출하고 해당 URL의 새 등록일 증거만 접수로 반환합니다.
export async function requestNaverCollection(
  document: Document,
  site: string,
  target: string,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<NaverCollectionReceipt> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!view || !siteUrl || !targetUrl || targetUrl.length > 2048 || !naverTargetInSite(siteUrl, targetUrl))
    throw new NaverAutomationError('invalid_response');

  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  if (!isNaverCollectionPage(initialUrl) || page.siteUrl !== siteUrl)
    throw new NaverAutomationError('wrong_page');
  if (!page.ready) throw new NaverAutomationError('ambiguous_control');
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (input): boolean =>
      ['text', 'url'].includes(input.type) &&
      !input.disabled &&
      !input.readOnly &&
      isNaverElementVisible(input, document),
  );
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button): boolean =>
      button.textContent?.trim() === '확인' &&
      !button.disabled &&
      isNaverElementVisible(button, document),
  );
  const input = inputs[0];
  const button = buttons[0];
  if (inputs.length !== 1 || buttons.length !== 1 || !input || !button)
    throw new NaverAutomationError('ambiguous_control');
  if (input.maxLength > 0 && targetUrl.length > input.maxLength)
    throw new NaverAutomationError('invalid_response');

  const previous = collectionHistory(document);
  const requestedAt = new Date().toISOString();
  const earliestRegistration = Math.floor(Date.parse(requestedAt) / 1000) * 1000;

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
      if (error)
        reject(clicked ? new NaverAutomationError('receipt_unconfirmed') : error);
      else if (receipt) resolve(receipt);
    }

    // 사용자 조작과 자동 제출이 충돌하면 추가 클릭 없이 중단합니다.
    function interference(event: Event): void {
      if (event.isTrusted) finish(new NaverAutomationError('page_changed'));
    }

    // 취소는 아직 전송하지 않은 동작만 막고 이미 전송된 요청을 재시도하지 않습니다.
    function abort(): void {
      finish(new NaverAutomationError('cancelled'));
    }

    // 제출 전후 경로·입력 대상과 새 요청 내역을 함께 검증합니다.
    function check(): void {
      if (!clicked || done) return;
      if (
        view!.location.href !== initialUrl ||
        !input!.isConnected ||
        canonicalNaverTarget(input!.value) !== targetUrl
      ) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }
      if (isNaverCollectionHistoryLoading(document)) return;

      try {
        const entries = collectionHistory(document).filter(
          (entry): boolean =>
            entry.url === targetUrl &&
            registrationTime(entry.registeredAtText) >= earliestRegistration &&
            registrationTime(entry.registeredAtText) <= Date.now() + 60000 &&
            !previous.some(
              (old): boolean =>
                old.url === entry.url && old.registeredAtText === entry.registeredAtText,
            ),
        );
        const entry = entries[0];
        if (entries.length !== 1 || !entry) return;
        finish(undefined, {
          kind: 'collection_receipt',
          siteUrl: siteUrl!,
          targetUrl: targetUrl!,
          requestStatus: 'accepted',
          collectionStatus: 'unknown',
          indexStatus: 'unknown',
          requestedAt,
          readAt: new Date().toISOString(),
          registeredAtText: entry.registeredAtText,
          targetVerified: true,
        });
      } catch (error: unknown) {
        if (error instanceof NaverAutomationError && error.code === 'ambiguous_control') return;
        finish(
          error instanceof NaverAutomationError
            ? error
            : new NaverAutomationError('invalid_response'),
        );
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
    interval = setInterval(check, 150);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('input', interference, true);
    document.addEventListener('click', interference, true);

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
      if (
        done ||
        view!.location.href !== initialUrl ||
        !input.isConnected ||
        !button.isConnected ||
        button.disabled ||
        canonicalNaverTarget(input.value) !== targetUrl
      ) {
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
