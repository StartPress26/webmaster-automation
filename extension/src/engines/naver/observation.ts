export const NAVER_READ_MESSAGE = 'STARTPRESS_READ_NAVER_OBSERVATION';
export const NAVER_INDEXED_MESSAGE =
  '문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.';
export const NAVER_AUTOMATION_MESSAGE = 'STARTPRESS_NAVER_AUTOMATION';
export const NAVER_BOARD_URL = 'https://searchadvisor.naver.com/console/board';
export const NAVER_NO_RESULT_MESSAGE = 'URL 검사 결과가 없습니다.';

export interface NaverPageState {
  readonly route: 'board' | 'summary' | 'inspection' | 'collection' | 'auth' | 'other';
  readonly siteUrl: string | null;
  readonly ready: boolean;
  readonly documentToken: string;
}

export interface NaverAutomationObservation {
  readonly kind: 'verified_gui';
  readonly siteUrl: string;
  readonly targetUrl: string;
  readonly indexStatus: 'indexed' | 'unknown';
  readonly message: string;
  readonly queriedAt: string;
  readonly readAt: string;
  readonly targetVerified: true;
}

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

export class NaverAutomationError extends Error {
  readonly code: NaverAutomationCode;
  // 원본 페이지·요청·예외 대신 고정된 원인만 보관합니다.
  constructor(code: NaverAutomationCode) {
    const messages: Readonly<Record<NaverAutomationCode, string>> = {
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

    super(messages[code]);
    this.code = code;
  }
}

export interface NaverVisibleObservation {
  readonly kind: 'visible_preview';
  readonly siteUrl: string;
  readonly inputUrl: string;
  readonly indexStatus: 'indexed' | 'unknown';
  readonly message: string;
  readonly engineUpdatedText: string | null;
  readonly readAt: string;
  readonly targetVerified: false;
}

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

// 인증정보·프래그먼트があるURLやHTTP以外の値を読み取り対象から除外します。
export function canonicalNaverTarget(value: string): string | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// 実画面で確認した色イン状態確認ルートだけを許可します。
export function isNaverInspectionPage(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://searchadvisor.naver.com' &&
      url.pathname === '/console/site/check/inspection' &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

// 숨김 요소와 문서 밖 요소를 배제하고 실제 표시된 입력·결과만 읽습니다.
export function isNaverElementVisible(element: Element, document: Document): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], script, style, noscript')) return false;

  const view = document.defaultView;

  for (let parent: Element | null = element; parent; parent = parent.parentElement) {
    const style = view?.getComputedStyle(parent);
    if (
      style?.display === 'none' ||
      style?.visibility === 'hidden' ||
      style?.visibility === 'collapse'
    )
      return false;
  }

  return element.getClientRects().length > 0;
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

  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (input): boolean =>
      ['text', 'url', 'search'].includes(input.type) &&
      isNaverElementVisible(input, document) &&
      canonicalNaverTarget(input.value) !== null,
  );
  const input = inputs[0];
  if (inputs.length !== 1 || !input) return { ok: false, code: 'target_ambiguous' };

  const inputUrl = canonicalNaverTarget(input.value);
  if (!inputUrl) return { ok: false, code: 'target_ambiguous' };

  const messages = resultMarkers(document);
  if (messages.length !== 1) return { ok: false, code: 'result_unrecognized' };

  const marker = messages[0];
  if (!marker) return { ok: false, code: 'result_unrecognized' };

  const message = judgementText(marker);
  const fields = Array.from(document.querySelectorAll('button, [role="button"]'))
    .filter((element): boolean => isNaverElementVisible(element, document))
    .map((element): string => element.textContent?.replace(/\s+/g, ' ').trim() ?? '');
  if (
    message === NAVER_INDEXED_MESSAGE &&
    fields.some((text): boolean => /^색인\s*완료\s*(아니오|아니요)$/.test(text))
  )
    return { ok: false, code: 'result_conflict' };

  const updated = fields.find((text): boolean =>
    /^최종\s*업데이트\s*\d{2,4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(text),
  );

  return {
    ok: true,
    observation: {
      kind: 'visible_preview',
      siteUrl,
      inputUrl,
      indexStatus: message === NAVER_INDEXED_MESSAGE ? 'indexed' : 'unknown',
      message,
      engineUpdatedText: updated ?? null,
      readAt,
      targetVerified: false,
    },
  };
}

// 공개 HTTP URL만 같은 사이트 범위에 있는지 검사합니다.
export function naverTargetInSite(site: string, target: string): boolean {
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!siteUrl || !targetUrl) return false;

  const parent = new URL(siteUrl);
  const child = new URL(targetUrl);

  return (
    parent.origin === child.origin &&
    (child.pathname === parent.pathname ||
      child.pathname.startsWith(parent.pathname.replace(/\/$/, '') + '/'))
  );
}

// 확인 버튼은 표시된 정확한 이름으로만 찾고 수집 요청 버튼은 선택하지 않습니다.
function confirmationButtons(document: Document): readonly HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (button): boolean =>
      button.textContent?.trim() === '확인' &&
      !button.disabled &&
      isNaverElementVisible(button, document),
  );
}

// 검사 화면의 편집 가능한 URL 입력칸만 찾습니다.
function inspectionInputs(document: Document): readonly HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input')).filter(
    (input): boolean =>
      ['text', 'url'].includes(input.type) &&
      !input.disabled &&
      !input.readOnly &&
      isNaverElementVisible(input, document),
  );
}

// 실제 확인한 헤더를 가진 표시 중인 수집 요청 내역 표 하나만 반환합니다.
export function naverCollectionHistoryTable(document: Document): HTMLTableElement | null {
  const tables = Array.from(document.querySelectorAll<HTMLTableElement>('table')).filter(
    (table): boolean =>
      isNaverElementVisible(table, document) &&
      Array.from(table.querySelectorAll('thead th'))
        .map((cell): string => cell.textContent?.replace(/\s+/g, ' ').trim() ?? '')
        .join('|') === 'No|URL|등록일',
  );
  return tables.length === 1 ? tables[0] ?? null : null;
}

// 화면이 이전 내역을 불러오는 중이면 접수 비교의 기준 상태로 사용하지 않습니다.
export function isNaverCollectionHistoryLoading(document: Document): boolean {
  return Array.from(document.querySelectorAll('[aria-busy="true"], [role="progressbar"]')).some(
    (element): boolean => isNaverElementVisible(element, document),
  );
}

// 인증 화면의 DOM은 읽지 않고 경로로 먼저 중단합니다.
export function naverPageState(
  document: Document,
  pageUrl: string,
  documentToken: string,
): NaverPageState {
  const url = new URL(pageUrl);
  if (
    url.origin !== 'https://searchadvisor.naver.com' ||
    url.pathname.startsWith('/auth') ||
    url.pathname.includes('login')
  ) {
    return { route: 'auth', siteUrl: null, ready: false, documentToken };
  }

  const route =
    url.pathname === '/console/board'
      ? 'board'
      : url.pathname === '/console/site/summary'
        ? 'summary'
        : url.pathname === '/console/site/check/inspection'
          ? 'inspection'
          : url.pathname === '/console/site/request/crawl'
            ? 'collection'
            : 'other';
  const siteUrl = canonicalNaverTarget(url.searchParams.get('site') ?? '');
  const ready =
    document.readyState !== 'loading' &&
    (route === 'board'
      ? !!document.querySelector('table, [role="table"]')
      : route === 'inspection' || route === 'collection'
        ? inspectionInputs(document).length === 1 &&
          confirmationButtons(document).length === 1 &&
          (route !== 'collection' ||
            (!!naverCollectionHistoryTable(document) && !isNaverCollectionHistoryLoading(document)))
        : route === 'summary' && !!siteUrl);

  return { route, siteUrl, ready, documentToken };
}

// 사이트 목록의 URL과 링크 출처가 모두 맞는 항목 하나만 클릭합니다.
export function selectNaverSite(document: Document, pageUrl: string, siteUrl: string): void {
  if (
    new URL(pageUrl).origin !== 'https://searchadvisor.naver.com' ||
    new URL(pageUrl).pathname !== '/console/board'
  )
    throw new NaverAutomationError('wrong_page');

  const expected = canonicalNaverTarget(siteUrl);
  if (!expected) throw new NaverAutomationError('invalid_response');

  const links = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('table a, [role="table"] a'),
  ).filter((link): boolean => {
    const destination = new URL(link.href, pageUrl);
    return (
      canonicalNaverTarget(link.textContent?.trim() ?? '') === expected &&
      isNaverElementVisible(link, document) &&
      destination.origin === 'https://searchadvisor.naver.com' &&
      ['/console/board', '/console/site/summary'].includes(destination.pathname)
    );
  });
  if (!links.length) throw new NaverAutomationError('site_missing');
  if (links.length !== 1) throw new NaverAutomationError('ambiguous_control');

  links[0]?.click();
}

// 아이콘·장식·숨김 노드의 텍스트를 제외하되 판정 문구의 인라인 서식은 보존합니다.
function judgementText(element: Element): string {
  // 자식 텍스트는 원래 공백을 보존해 모은 뒤 마지막에만 정규화합니다.
  function collect(node: Node): string {
    if (node.nodeType === 3) return node.textContent ?? '';
    if (node.nodeType !== 1) return '';

    const child = node as Element;
    if (
      child.matches(
        'i, svg, [role="img"], [aria-hidden="true"], [hidden], .v-icon, .material-icons',
      )
    )
      return '';

    return Array.from(child.childNodes).map(collect).join('');
  }

  return collect(element).replace(/\s+/g, ' ').trim();
}

// 판정 텍스트가 정확한 결과 영역 하나만 선택하고 부모·자식의 중복은 제외합니다.
function resultMarkers(document: Document): readonly Element[] {
  return Array.from(document.querySelectorAll('div, p, span')).filter((element): boolean => {
    const text = judgementText(element);
    return (
      [NAVER_INDEXED_MESSAGE, NAVER_NO_RESULT_MESSAGE].includes(text) &&
      !Array.from(element.children).some((child): boolean => judgementText(child) === text) &&
      isNaverElementVisible(element, document)
    );
  });
}

// URL을 입력·확인하고 이전 결과가 바뀐 증거와 정확한 사이트·URL을 확인한 경우만 반환합니다.
export async function inspectNaverUrl(
  document: Document,
  site: string,
  target: string,
  signal: AbortSignal,
  timeoutMs = 15000,
): Promise<NaverAutomationObservation> {
  const view = document.defaultView;
  const siteUrl = canonicalNaverTarget(site);
  const targetUrl = canonicalNaverTarget(target);
  if (!view || !siteUrl || !targetUrl || !naverTargetInSite(siteUrl, targetUrl))
    throw new NaverAutomationError('invalid_response');

  const initialUrl = view.location.href;
  const page = naverPageState(document, initialUrl, '');
  if (page.route !== 'inspection' || page.siteUrl !== siteUrl)
    throw new NaverAutomationError('wrong_page');

  const inputs = inspectionInputs(document);
  const buttons = confirmationButtons(document);
  const input = inputs[0];
  const button = buttons[0];
  if (inputs.length !== 1 || buttons.length !== 1 || !input || !button)
    throw new NaverAutomationError('ambiguous_control');
  if (signal.aborted) throw new NaverAutomationError('cancelled');

  const previous = resultMarkers(document).map((node) => ({ node, text: judgementText(node) }));
  const queriedAt = new Date().toISOString();

  await new Promise<void>((resolve): void => {
    queueMicrotask(resolve);
  });

  if (signal.aborted) throw new NaverAutomationError('cancelled');

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

    // 새 결과가 나타나도 사이트·입력·경로가 달라졌으면 처리하지 않습니다.
    function check(): void {
      if (!clicked || done) return;

      if (view!.location.href !== initialUrl || canonicalNaverTarget(input!.value) !== targetUrl) {
        finish(new NaverAutomationError('page_changed'));
        return;
      }

      const markers = resultMarkers(document);

      if (
        previous.length &&
        previous.every(
          (old): boolean => !old.node.isConnected || !isNaverElementVisible(old.node, document),
        )
      )
        cleared = true;

      if (markers.length !== 1) return;

      const marker = markers[0];
      if (!marker) return;

      const fresh =
        cleared ||
        previous.length === 0 ||
        previous.every(
          (old): boolean =>
            !old.node.isConnected ||
            !isNaverElementVisible(old.node, document) ||
            judgementText(old.node) !== old.text,
        ) ||
        !previous.some((old): boolean => old.node === marker);
      if (!fresh) return;

      const message = judgementText(marker);

      finish(undefined, {
        kind: 'verified_gui',
        siteUrl: siteUrl!,
        targetUrl: targetUrl!,
        indexStatus: message === NAVER_INDEXED_MESSAGE ? 'indexed' : 'unknown',
        message,
        queriedAt,
        readAt: new Date().toISOString(),
        targetVerified: true,
      });
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

    if (signal.aborted) {
      abort();
      return;
    }

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
