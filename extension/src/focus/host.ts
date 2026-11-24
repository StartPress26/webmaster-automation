import { FOCUS_COMMAND, NAVER_FOCUS_PORT, isRequestId } from './protocol.ts';
import type { FocusErrorCode, FocusReply } from './protocol.ts';

export type FocusHostApi = Pick<typeof chrome, 'runtime' | 'tabs' | 'debugger'>;

// 서비스 워커는 한 번에 하나의 포트가 연결한 디버거 세션만 소유합니다.
interface Lease {
  readonly port: chrome.runtime.Port;
  readonly tabId: number;
  readonly owned: boolean;
  readonly closed: boolean;
  readonly closing: boolean;
}

const NAVER_ORIGIN = 'https://searchadvisor.naver.com';
const NAVER_AUTH_ORIGIN = 'https://nid.naver.com';
const AUTH_TIMEOUT_MS = 22000;

// 서비스 워커 최상위에서 한 번 등록하며 기존 아이콘 클릭 처리와 독립적으로 동작합니다.
export function installNaverFocusHost(api: FocusHostApi = chrome): () => Promise<void> {
  let lease: Lease | undefined;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;
  let authTimer: ReturnType<typeof setTimeout> | undefined;

  // 같은 확장의 관리 문서만 허용하되 화면의 해시·쿼리 이동은 허용합니다.
  function trusted(port: chrome.runtime.Port): boolean {
    const isFocusPort = port.name === NAVER_FOCUS_PORT;
    const isSameExtension = port.sender?.id === api.runtime.id;
    const senderUrl = port.sender?.url;

    if (!isFocusPort || !isSameExtension || !senderUrl) {
      return false;
    }

    try {
      const actual = new URL(senderUrl);
      const expected = new URL(api.runtime.getURL('index.html'));
      const hasCredentials = Boolean(actual.username || actual.password);
      const isSameProtocol = actual.protocol === expected.protocol;
      const isSameHost = actual.host === expected.host;
      const isManagementPath = actual.pathname === expected.pathname;

      return !hasCredentials && isSameProtocol && isSameHost && isManagementPath;
    } catch {
      return false;
    }
  }

  // 이미 닫힌 포트의 응답 실패는 원본 정보를 출력하지 않고 무시합니다.
  function reply(port: chrome.runtime.Port, message: FocusReply): void {
    try {
      port.postMessage(message);
    } catch {
      // 종료된 문서에는 응답하지 않습니다.
    }
  }

  // 현재 소유 세션의 인증 대기 타이머만 해제합니다.
  function clearAuthTimer(): void {
    clearTimeout(authTimer);
    authTimer = undefined;
  }

  // 자동 인증 왕복을 제한 시간만큼만 기다리고, 돌아오지 않으면 연결을 종료합니다.
  function startAuthTimer(): void {
    // 이미 기다리는 중이면 시간을 다시 늘리지 않습니다.
    if (authTimer) {
      return;
    }

    authTimer = setTimeout((): void => lose('auth_required'), AUTH_TIMEOUT_MS);
  }

  // 같은 포트가 성공적으로 연결한 대상만 해제하고 불명확한 소유권은 유지합니다.
  async function cleanup(port: chrome.runtime.Port): Promise<boolean> {
    if (!lease || lease.port !== port) {
      return true;
    }

    const active = lease;
    lease = { ...active, closed: true, closing: true };
    clearAuthTimer();

    // attach가 실패한 세션은 다른 디버거의 연결을 해제하면 안 됩니다.
    let released = !active.owned;

    if (active.owned) {
      try {
        await api.debugger.sendCommand(
          { tabId: active.tabId },
          FOCUS_COMMAND,
          { enabled: false },
        );
      } catch {
        // 에뮬레이션 해제 실패 뒤에도 소유 디버거의 detach를 시도합니다.
      }

      try {
        await api.debugger.detach({ tabId: active.tabId });
        released = true;
      } catch {
        // onDetach가 이미 연결 종료를 확인했다면 해제된 것으로 볼 수 있습니다.
        const ownershipChanged = lease?.port !== port;
        const alreadyDetached = lease?.owned === false;
        released = ownershipChanged || alreadyDetached;
      }
    }

    if (released && lease?.port === port) {
      lease = undefined;
    }

    return released;
  }

  // attach·해제를 직렬화해 늦게 성공한 연결이 정리 뒤 살아남지 않게 합니다.
  function enqueue(operation: () => Promise<void>): void {
    queue = queue.then(operation).catch((): void => {
      // 각 작업이 자신의 응답·정리를 처리하므로 큐 자체의 오류는 전파하지 않습니다.
    });
  }

  // 세션 상실을 즉시 알리고 그 세션만 작업 큐에서 정리합니다.
  function lose(code: FocusErrorCode): void {
    if (!lease || lease.closed) {
      return;
    }

    const active = lease;
    lease = { ...active, closed: true };
    reply(active.port, { type: 'lost', code });

    // 네이티브 연결 요청이 진행 중이어도 완료된 뒤 같은 세션을 정리합니다.
    enqueue(async (): Promise<void> => {
      await cleanup(active.port);
    });
  }

  // 초기 연결은 준비된 네이버 콘솔·일반 문서에만 허용합니다.
  async function validTarget(tabId: number): Promise<boolean> {
    try {
      const tab = await api.tabs.get(tabId);
      const url = new URL(tab.url ?? '');
      const isAvailableTab = !tab.incognito && !tab.discarded;
      const isLoadedDocument = tab.status === 'complete' && !tab.pendingUrl;
      const isNaverPage = url.origin === NAVER_ORIGIN;
      const hasCredentials = Boolean(url.username || url.password);
      const isAuthPath = url.pathname.startsWith('/auth') || /login/i.test(url.pathname);

      return isAvailableTab && isLoadedDocument && isNaverPage && !hasCredentials && !isAuthPath;
    } catch {
      return false;
    }
  }

  // 새 세션 연결을 시작하고 완료 시점에도 대상·포트 수명을 다시 확인합니다.
  async function acquire(
    port: chrome.runtime.Port,
    requestId: string,
    tabId: number,
    disconnected: () => boolean,
  ): Promise<void> {
    if (lease) {
      reply(port, { type: 'error', requestId, code: 'busy' });
      return;
    }

    if (disposed || disconnected()) {
      return;
    }

    const targetIsValid = await validTarget(tabId);
    if (!targetIsValid) {
      reply(port, { type: 'error', requestId, code: 'invalid_tab' });
      return;
    }

    if (disposed || disconnected()) {
      return;
    }

    lease = { port, tabId, owned: false, closed: false, closing: false };
    let failure: FocusErrorCode = 'attach_failed';

    try {
      // 1. 탭을 활성화하지 않고 Chrome 디버거 연결만 획득합니다.
      await api.debugger.attach({ tabId }, '1.3');
      if (!lease || lease.port !== port) {
        return;
      }

      lease = { ...lease, owned: true };
      if (disposed || disconnected() || lease.closed) {
        await cleanup(port);
        return;
      }

      // 2. attach를 기다리는 동안 다른 사이트로 이동했을 수 있으므로 재검증합니다.
      const targetStillValid = await validTarget(tabId);
      if (!targetStillValid) {
        const released = await cleanup(port);
        const code = released ? 'scope_changed' : 'cleanup_unconfirmed';
        reply(port, { type: 'error', requestId, code });
        return;
      }

      if (disposed || disconnected() || lease?.closed) {
        await cleanup(port);
        return;
      }

      // 3. 페이지를 활성 상태처럼 동작시키고 성공 응답을 보냅니다.
      failure = 'emulation_failed';
      await api.debugger.sendCommand({ tabId }, FOCUS_COMMAND, { enabled: true });

      const noLongerOwned = lease?.port !== port;
      if (disposed || disconnected() || lease?.closed || noLongerOwned) {
        await cleanup(port);
        return;
      }

      reply(port, { type: 'ready', requestId });
    } catch {
      const released = await cleanup(port);
      const code = released ? failure : 'cleanup_unconfirmed';
      reply(port, { type: 'error', requestId, code });
    }
  }

  // 포트는 세션 획득과 해제만 요청할 수 있으며 다른 명령은 거부합니다.
  async function handle(
    port: chrome.runtime.Port,
    message: unknown,
    disconnected: () => boolean,
  ): Promise<void> {
    if (!message || typeof message !== 'object') {
      return;
    }

    const value = message as Record<string, unknown>;
    if (!isRequestId(value.requestId)) {
      return;
    }

    const requestId = value.requestId;
    if (value.type === 'release') {
      const released = await cleanup(port);
      if (released) {
        reply(port, { type: 'released', requestId });
      } else {
        reply(port, { type: 'error', requestId, code: 'cleanup_unconfirmed' });
      }
      return;
    }

    const isAcquire = value.type === 'acquire';
    const isIntegerTabId = typeof value.tabId === 'number' && Number.isInteger(value.tabId);
    const isValidTabId = isIntegerTabId && Number(value.tabId) >= 0;
    if (!isAcquire || !isValidTabId) {
      reply(port, { type: 'error', requestId, code: 'invalid_request' });
      return;
    }

    await acquire(port, requestId, Number(value.tabId), disconnected);
  }

  // 관리 페이지 종료가 attach 대기 중 발생해도 후속 정리를 예약합니다.
  function connected(port: chrome.runtime.Port): void {
    if (disposed || !trusted(port)) {
      port.disconnect();
      return;
    }

    let disconnected = false;

    // 메시지 처리 직전에도 포트 종료 여부를 확인합니다.
    function onMessage(message: unknown): void {
      enqueue(async (): Promise<void> => {
        await handle(port, message, (): boolean => disconnected);
      });
    }

    // 진행 중 네이티브 attach가 끝나면 동일 큐에서 정리합니다.
    function onDisconnect(): void {
      disconnected = true;
      if (lease?.port === port) {
        lease = { ...lease, closed: true };
      }

      enqueue(async (): Promise<void> => {
        await cleanup(port);
      });
    }

    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  }

  // 외부 디버거 종료는 즉시 상실로 알리고 다른 연결을 해제하지 않습니다.
  function detached(source: chrome.debugger.Debuggee): void {
    if (!lease || source.tabId !== lease.tabId) {
      return;
    }

    const active = lease;
    lease = { ...active, owned: false };
    if (!active.closing) {
      lose('session_lost');
      return;
    }

    enqueue(async (): Promise<void> => {
      await cleanup(active.port);
    });
  }

  // 대상 탭 종료는 디버거도 사라진 확정 신호로 처리합니다.
  function removed(tabId: number): void {
    if (!lease || lease.tabId !== tabId) {
      return;
    }

    const active = lease;
    clearAuthTimer();
    lease = undefined;
    reply(active.port, { type: 'lost', code: 'tab_closed' });
  }

  // 승인한 자동 인증 왕복만 잠시 허용하고 다른 사이트 이동은 연결을 종료합니다.
  function updated(
    tabId: number,
    change: chrome.tabs.OnUpdatedInfo,
    tab: chrome.tabs.Tab,
  ): void {
    if (!lease || lease.tabId !== tabId || lease.closed) {
      return;
    }

    if (!change.url) {
      // 권한이 없는 사이트에 있으면 Chrome이 탭 주소를 알려주지 않습니다.
      const addressHidden = !tab.url;
      if (addressHidden) {
        startAuthTimer();      // 호출 A: 주소가 안 보이는 경우
      }
      return;                  // ← 여기서 끝. 아래 try 로 가지 않음
    }

    try {
      // 여기부터는 change.url 이 보이는 경우만 도달
      const url = new URL(change.url);
      if (url.username || url.password) {
        lose('scope_changed');
        return;
      }

      const isAdvisor = url.origin === NAVER_ORIGIN;
      const isCallback = isAdvisor && url.pathname === '/auth/callback';
      const isAuthorize = url.origin === NAVER_AUTH_ORIGIN && url.pathname === '/oauth2.0/authorize';

      if (isAuthorize || isCallback) {
        startAuthTimer();      // 호출 B: 주소가 보이는 인증 화면
        return;
      }

      const isNormalAdvisorPage = isAdvisor && !/login/i.test(url.pathname);
      if (isNormalAdvisorPage) {
        clearAuthTimer();
        return;
      }

      if (url.hostname === 'nid.naver.com') {
        lose('auth_required');
      } else {
        lose('scope_changed');
      }
    } catch {
      lose('scope_changed');
    }
  }

  api.runtime.onConnect.addListener(connected);
  api.debugger.onDetach.addListener(detached);
  api.tabs.onRemoved.addListener(removed);
  api.tabs.onUpdated.addListener(updated);

  // 테스트 종료에도 이번에 소유한 연결만 해제합니다.
  return async (): Promise<void> => {
    disposed = true;
    api.runtime.onConnect.removeListener(connected);
    api.tabs.onUpdated.removeListener(updated);

    if (lease) {
      lease = { ...lease, closed: true };
    }

    await queue;
    const released = lease ? await cleanup(lease.port) : true;
    if (!released) {
      throw new Error('cleanup_unconfirmed');
    }

    api.debugger.onDetach.removeListener(detached);
    api.tabs.onRemoved.removeListener(removed);
  };
}
