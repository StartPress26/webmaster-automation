export const BING_AUTOMATION_MESSAGE = 'STARTPRESS_BING_AUTOMATION';
export const BING_INSPECTION_URL = 'https://www.bing.com/webmasters/urlinspection';

export type BingAutomationCode = 'wrong_page' | 'auth_required' | 'site_missing' | 'ambiguous_control' | 'page_changed' | 'busy' | 'timeout' | 'cancelled' | 'invalid_response';

export const BING_STAGE_LABELS = {
  inspection_page: 'URL 검사 화면 준비',
  site_menu: '사이트 목록에서 항목 확인',
  site_navigation: '사이트 선택 후 화면 전환',
  url_ready: '검사할 URL 입력 준비',
  url_result: 'URL 검사 결과 확인',
  result_check: '검사 후 사이트 확인',
} as const;
export type BingAutomationStage = keyof typeof BING_STAGE_LABELS;

export interface BingSiteSelection {
  readonly siteUrl: string;
  readonly destinationUrl: string;
}

export class BingAutomationError extends Error {
  readonly code: BingAutomationCode;
  readonly stage?: BingAutomationStage;
  // 원본 응답이나 인증정보 대신 고정된 중단 사유만 전달합니다.
  constructor(code: BingAutomationCode, stage?: BingAutomationStage) {
    const messages: Readonly<Record<BingAutomationCode, string>> = {
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

    super(code === 'timeout' && stage ? `Bing ${BING_STAGE_LABELS[stage]} 단계에서 시간이 초과됐습니다. 자동 재조회하지 않습니다.` : messages[code]);
    this.code = code;
    this.stage = stage;
  }
}

export interface BingPageState {
  readonly route: 'inspection' | 'console' | 'auth' | 'other';
  readonly siteUrl: string | null;
  readonly ready: boolean;
  readonly documentToken: string;
}

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

// 쿼리는 보존하고 인증정보나 프래그먼트가 있는 URL은 거부합니다.
export function normalizeBingUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash ? url.href : null;
  } catch { return null; }
}

// 같은 출처와 사이트의 경로 범위에 있는 URL만 검사합니다.
export function bingTargetInSite(site: string, target: string): boolean {
  const siteUrl = normalizeBingUrl(site); const targetUrl = normalizeBingUrl(target);
  if (!siteUrl || !targetUrl) return false;

  const parent = new URL(siteUrl); const child = new URL(targetUrl);
  const path = parent.pathname.replace(/\/$/, '');

  return !parent.search && parent.origin === child.origin && (child.pathname === path || child.pathname.startsWith(`${path}/`));
}

// 숨김·장식·툴팁 중복을 제외하고 화면에 표시되는 텍스트만 읽습니다.
function text(element: Element | null): string {
  if (!element) return '';
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[hidden], [aria-hidden="true"], i, svg, script, style').forEach((node): void => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// 현재 문서에 보이는 요소만 선택합니다.
function visible(element: Element): boolean {
  const view = element.ownerDocument.defaultView;
  if (!view || !element.isConnected || element.closest('[hidden], [aria-hidden="true"]')) return false;

  // visibility는 자식의 visible 선언으로 재정의되므로 대상의 최종 계산값만 확인합니다.
  const visibility = view.getComputedStyle(element).visibility;
  if (visibility === 'hidden' || visibility === 'collapse') return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (view.getComputedStyle(node).display === 'none') return false;
  }

  return element.getClientRects().length > 0;
}

// 고정 속성으로 확인된 요소가 하나일 때만 사용합니다.
function one<T extends Element>(document: Document, selector: string): T {
  const nodes = Array.from(document.querySelectorAll<T>(selector)).filter(visible);
  if (nodes.length !== 1) throw new BingAutomationError('ambiguous_control');
  return nodes[0]!;
}

// URL의 속성값과 화면 선택기가 준비됐는지 확인합니다.
export function bingPageState(document: Document, pageUrl: string, documentToken: string): BingPageState {
  const url = new URL(pageUrl);
  const allowed = url.origin === 'https://www.bing.com' && (url.pathname === '/webmasters' || url.pathname.startsWith('/webmasters/'));
  const route = !allowed || /login|signin|auth/i.test(url.pathname) ? 'auth'
    : url.pathname === '/webmasters/urlinspection' ? 'inspection' : 'console';

  return { route, siteUrl: normalizeBingUrl(url.searchParams.get('siteUrl') ?? ''), documentToken,
    ready: document.readyState === 'complete' && allowed && Array.from(document.querySelectorAll('button.userSeletedSite')).filter(visible).length === 1
      && (route !== 'inspection' || (Array.from(document.querySelectorAll('input[data-tag="urlInspectionInput"]')).filter(visible).length === 1
        && Array.from(document.querySelectorAll('button[data-tag="inspectBtn"]')).filter(visible).length === 1)) };
}

// 왼쪽 메뉴에서 일치하는 사이트의 실제 이동 링크를 찾아 관리 페이지에 반환합니다.
export async function selectBingSite(document: Document, site: string, signal: AbortSignal, timeoutMs = 15000): Promise<BingSiteSelection> {
  const view = document.defaultView;
  if (!view || !normalizeBingUrl(site)) throw new BingAutomationError('invalid_response');

  const state = bingPageState(document, view.location.href, '');
  if (!['inspection', 'console'].includes(state.route) || !state.ready) throw new BingAutomationError(state.route === 'auth' ? 'auth_required' : 'wrong_page');

  const initialUrl = view.location.href;
  const selector = one<HTMLButtonElement>(document, 'button.userSeletedSite');
  if (signal.aborted) throw new BingAutomationError('cancelled');

  if (selector.getAttribute('aria-expanded') !== 'true') selector.click();

  const deadline = Date.now() + timeoutMs;
  let menuSeen = false;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new BingAutomationError('cancelled');
    if (view.location.href !== initialUrl) throw new BingAutomationError('page_changed');

    const lists = Array.from(document.querySelectorAll('.userSitesList[role="listbox"]')).filter(visible);
    if (lists.length > 1) throw new BingAutomationError('ambiguous_control');

    if (lists.length === 1) {
      menuSeen = true;
      const links = Array.from(lists[0]!.querySelectorAll<HTMLAnchorElement>('a[role="option"][href]')).filter((link): boolean => {
        if (!visible(link)) return false;
        const destination = new URL(link.href, initialUrl);
        return destination.origin === 'https://www.bing.com' && destination.pathname === '/webmasters/urlinspection'
          && !destination.username && !destination.password && !destination.hash
          && destination.searchParams.getAll('siteUrl').length === 1
          && normalizeBingUrl(destination.searchParams.get('siteUrl') ?? '') === normalizeBingUrl(site);
      });
      // 메뉴와 항목이 다른 렌더에서 준비될 수 있어 빈 목록은 제한 시간까지 기다립니다.
      if (links.length > 1) throw new BingAutomationError('ambiguous_control');
      if (links.length === 1) {
        // 페이지의 합성 클릭 처리에 의존하지 않고 검증된 링크를 탭 이동 API에서 사용합니다.
        return { siteUrl: normalizeBingUrl(site)!, destinationUrl: new URL(links[0]!.href, initialUrl).href };
      }
    }

    await new Promise<void>((resolve): void => { setTimeout(resolve, 100); });
  }

  throw new BingAutomationError(menuSeen ? 'site_missing' : 'timeout');
}

// 결과 제목의 명시적인 색인 여부만 판정하고 낯선 문구는 미확인으로 남깁니다.
export function bingIndexStatus(message: string): BingAutomationObservation['indexStatus'] {
  if (['색인화되었습니다.', 'Indexed', 'URL is indexed'].includes(message)) return 'indexed';
  if (message.includes('색인화되지 않') || message.includes('색인화되지 않았') || /^(URL is not indexed|Not indexed|The inspected URL is not indexed)/i.test(message)) return 'not_indexed';
  return 'unknown';
}

// 한 결과 카드 안에서만 라벨과 값을 대응시켜 상세 관측을 만듭니다.
export function readBingResult(document: Document, siteUrl: string, targetUrl: string, queriedAt: string): BingAutomationObservation {
  const card = one<HTMLElement>(document, '[data-tag="urlInspectionIndexCard"]');
  const titles = Array.from(card.querySelectorAll('.urlInspectionSectionTitle')).filter(visible);
  if (titles.length !== 1) throw new BingAutomationError('invalid_response');

  const message = text(titles[0]!);
  const pairs = Array.from(card.querySelectorAll('.urlInspectionLabelValuePair')).filter(visible).map((pair) => ({
    label: text(pair.querySelector('.urlInspectionIndexItemLabel')), value: text(pair.querySelector('.urlInspectionIndexItemValue')),
  }));

  // 상세 라벨이 중복되면 임의의 첫 값을 선택하지 않습니다.
  function detail(labels: readonly string[]): string | null {
    const values = pairs.filter((pair): boolean => labels.includes(pair.label));
    if (values.length > 1) throw new BingAutomationError('invalid_response');
    return values[0]?.value || null;
  }

  const canonical = detail(['정식 URL', 'Canonical URL']);

  return { kind: 'verified_bing_gui', siteUrl, targetUrl, indexStatus: bingIndexStatus(message), message,
    reason: text(card.querySelector('.urlInspectionErrorStatusBar')) || null,
    canonicalUrl: canonical ? normalizeBingUrl(canonical) : null,
    crawlStatus: ['성공', 'Successful'].includes(detail(['페이지 가져오기', 'Page fetch']) ?? '') ? 'succeeded' : 'unknown',
    lastCrawledText: detail(['마지막 크롤링 시도', 'Last crawl attempted']), queriedAt, readAt: new Date().toISOString(), targetVerified: true };
}

// Bing의 이중 인코딩 검사 URL을 한 번만 풀어 원래 URL의 인코딩은 보존합니다.
function inspectedTarget(pageUrl: string): string | null {
  try {
    const raw = new URL(pageUrl).searchParams.get('urlToInspect');
    if (!raw) return null;
    return normalizeBingUrl(raw) ?? normalizeBingUrl(decodeURIComponent(raw));
  } catch { return null; }
}

// 새 조회의 로딩·카드 갱신과 URL 일치를 확인한 뒤 Bing 색인 결과만 반환합니다.
export async function inspectBingUrl(document: Document, site: string, target: string, signal: AbortSignal, timeoutMs = 20000): Promise<BingAutomationObservation> {
  const view = document.defaultView; const siteUrl = normalizeBingUrl(site); const targetUrl = normalizeBingUrl(target);
  if (!view || !siteUrl || !targetUrl || !bingTargetInSite(siteUrl, targetUrl)) throw new BingAutomationError('invalid_response');

  const state = bingPageState(document, view.location.href, '');
  if (state.route !== 'inspection' || state.siteUrl !== siteUrl) throw new BingAutomationError('wrong_page');

  const input = one<HTMLInputElement>(document, 'input[data-tag="urlInspectionInput"]');
  const button = one<HTMLButtonElement>(document, 'button[data-tag="inspectBtn"]');
  if (button.disabled || input.disabled || Array.from(document.querySelectorAll('#inpsectionProgressTitle')).some(visible) || signal.aborted) throw new BingAutomationError(signal.aborted ? 'cancelled' : 'busy');

  const previous = document.querySelector('[data-tag="urlInspectionIndexCard"]');
  const previousText = text(previous?.querySelector('.urlInspectionSectionTitle') ?? null);
  const queriedAt = new Date().toISOString();

  return await new Promise<BingAutomationObservation>((resolve, reject): void => {
    let done = false; let clicked = false; let fresh = false; let sawProgress = false;
    let observer: MutationObserver; let interval: ReturnType<typeof setInterval>; let timeout: ReturnType<typeof setTimeout>;

    // 종료 시 DOM 감시와 타이머·이벤트를 모두 정리합니다.
    function finish(error?: BingAutomationError, result?: BingAutomationObservation): void {
      if (done) return;

      done = true; observer.disconnect(); clearInterval(interval); clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('click', interference, true); document.removeEventListener('input', interference, true);

      if (error) reject(error); else if (result) resolve(result);
    }

    // 사용자의 클릭·입력이 섞이면 결과를 오귀속하지 않도록 중단합니다.
    function interference(event: Event): void { if (event.isTrusted) finish(new BingAutomationError('page_changed')); }

    // 취소 후 도착한 결과는 반영하지 않습니다.
    function abort(): void { finish(new BingAutomationError('cancelled')); }

    // 새 카드 준비와 사이트·검사 URL을 확인하고 필요한 상세 카드만 펼칩니다.
    function check(): void {
      if (!clicked || done) return;

      try {
        const current = bingPageState(document, view!.location.href, '');

        if (current.route !== 'inspection' || current.siteUrl !== siteUrl || normalizeBingUrl(input.value) !== targetUrl || !input.isConnected) {
          finish(new BingAutomationError('page_changed')); return;
        }

        const progress = Array.from(document.querySelectorAll('#inpsectionProgressTitle')).some(visible);

        if (progress) { sawProgress = true; return; }

        const cards = Array.from(document.querySelectorAll('[data-tag="urlInspectionIndexCard"]')).filter(visible);
        const card = cards[0];
        if (!card || cards.length !== 1) return;

        fresh = fresh || sawProgress || !previous || card !== previous || text(card.querySelector('.urlInspectionSectionTitle')) !== previousText;

        if (!fresh || inspectedTarget(view!.location.href) !== targetUrl) return;

        const pivot = document.querySelector('[data-tag="BingdexTab"]');

        if (pivot?.getAttribute('aria-selected') !== 'true') { finish(new BingAutomationError('page_changed')); return; }

        const header = card.querySelector<HTMLElement>('[data-tag="accordionItemHeader"]');

        if (header?.getAttribute('aria-expanded') === 'false') { header.click(); return; }

        if (!Array.from(card.querySelectorAll('[data-tag="urlInspectionIndexDetails"]')).some(visible)) return;

        finish(undefined, readBingResult(document, siteUrl!, targetUrl!, queriedAt));
      } catch (error: unknown) { finish(error instanceof BingAutomationError ? error : new BingAutomationError('invalid_response')); }
    }

    observer = new view!.MutationObserver(check);
    observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-selected', 'aria-expanded'] });
    interval = setInterval(check, 100); timeout = setTimeout((): void => finish(new BingAutomationError('timeout')), timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('click', interference, true); document.addEventListener('input', interference, true);

    if (signal.aborted) { abort(); return; }

    try {
      const setter = Object.getOwnPropertyDescriptor(view!.HTMLInputElement.prototype, 'value')?.set;
      if (!setter) throw new BingAutomationError('ambiguous_control');

      setter.call(input, targetUrl);
      input.dispatchEvent(new view!.Event('input', { bubbles: true })); input.dispatchEvent(new view!.Event('change', { bubbles: true }));
      clicked = true; button.click(); check();
    } catch { finish(new BingAutomationError('invalid_response')); }
  });
}
