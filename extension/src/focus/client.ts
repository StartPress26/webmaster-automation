import { NAVER_FOCUS_PORT, NaverFocusError, isFocusCode, isRequestId } from './protocol.ts';
import type { FocusReply, FocusRequest } from './protocol.ts';

export interface NaverFocusSession {
  readonly signal: AbortSignal;
  readonly close: () => Promise<void>;
}

export interface FocusClientOptions {
  readonly runtime?: Pick<typeof chrome.runtime, 'connect'>;
  readonly timeoutMs?: number;
  readonly onCleanupError?: (error: NaverFocusError) => void;
}

// 응답을 기다리는 요청마다 기대하는 메시지와 완료 함수를 보관합니다.
interface Pending {
  readonly expected: 'ready' | 'released';
  readonly resolve: () => void;
  readonly reject: (error: NaverFocusError) => void;
}

const SESSION_TIMEOUT_MS = 8000;

// 포트 수명으로 서비스 워커의 소유 세션을 관리하며 사용자 탭을 활성화하지 않습니다.
export async function acquireNaverFocus(
  tabId: number,
  signal: AbortSignal,
  options: FocusClientOptions = {},
): Promise<NaverFocusSession> {
  if (signal.aborted) {
    throw new NaverFocusError('cancelled');
  }

  if (!Number.isInteger(tabId) || tabId < 0) {
    throw new NaverFocusError('invalid_tab');
  }

  const timeoutMs = options.timeoutMs ?? SESSION_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new NaverFocusError('invalid_request');
  }

  const lifetime = new AbortController();
  const pending = new Map<string, Pending>();
  let port: chrome.runtime.Port;

  try {
    const runtime = options.runtime ?? chrome.runtime;
    port = runtime.connect({ name: NAVER_FOCUS_PORT });
  } catch {
    throw new NaverFocusError('connection_lost');
  }

  let acquired = false;
  let closing = false;
  let disconnected = false;
  let closePromise: Promise<void> | undefined;

  // 완료되지 않은 요청을 고정된 오류로만 종료합니다.
  function rejectPending(error: NaverFocusError): void {
    for (const item of pending.values()) {
      item.reject(error);
    }
    pending.clear();
  }

  // 포트를 한 번만 닫아 서비스 워커가 지연 연결도 정리하게 합니다.
  function disconnect(): void {
    if (disconnected) {
      return;
    }

    disconnected = true;
    try {
      port.disconnect();
    } catch {
      // 이미 종료된 연결은 다시 닫지 않습니다.
    }
  }

  // 같은 요청의 지정된 완료 응답만 처리하고 연결 상실은 신호로 전달합니다.
  function received(message: unknown): void {
    if (!message || typeof message !== 'object') {
      return;
    }

    const reply = message as Partial<FocusReply> & {
      readonly requestId?: unknown;
      readonly code?: unknown;
    };

    // 서비스워커가 "연결을 잃었다"고 알렸을 때 -> abort 알림 보내기
    if (reply.type === 'lost' && isFocusCode(reply.code)) {
      const error = new NaverFocusError(reply.code);
      lifetime.abort(error);
      rejectPending(error);
      return;
    }

    if (!isRequestId(reply.requestId)) {
      return;
    }

    const item = pending.get(reply.requestId);
    if (!item) {
      return;
    }

    if (reply.type === item.expected) {
      pending.delete(reply.requestId);
      item.resolve();
      return;
    }

    if (reply.type === 'error' && isFocusCode(reply.code)) {
      pending.delete(reply.requestId);
      item.reject(new NaverFocusError(reply.code));
    }
  }

  // 예상하지 못한 포트 종료는 작업 신호를 취소하고 이후 요청을 거부합니다.
  // 서비스워커와의 통신선 자체가 끊겼을 때 -> abort 알림
  function lost(): void {
    disconnected = true;
    const normallyClosed = closing && pending.size === 0;
    if (normallyClosed) {
      return;
    }

    const error = new NaverFocusError('connection_lost');
    lifetime.abort(error);
    rejectPending(error);
  }

  // 연결·해제 요청은 제한 시간 안의 일치하는 응답만 기다립니다.
  async function request(type: 'acquire' | 'release'): Promise<void> {
    if (disconnected) {
      throw new NaverFocusError('connection_lost');
    }

    const requestId = crypto.randomUUID();
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      await new Promise<void>((resolve, reject): void => {
        const expected = type === 'acquire' ? 'ready' : 'released';
        pending.set(requestId, { expected, resolve, reject });

        // 시간 초과 뒤의 응답으로 이 요청을 다시 완료하지 않습니다.
        timer = setTimeout((): void => {
          pending.delete(requestId);
          reject(new NaverFocusError('timeout'));
        }, timeoutMs);

        let message: FocusRequest;
        if (type === 'acquire') {
          message = { type, requestId, tabId };
        } else {
          message = { type, requestId };
        }

        try {
          port.postMessage(message);
        } catch {
          pending.delete(requestId);
          reject(new NaverFocusError('connection_lost'));
        }
      });
    } finally {
      clearTimeout(timer);
      pending.delete(requestId);
    }
  }

  // 이후 조작을 막도록 신호를 취소하고 연결을 한 번만 해제합니다.
  function close(): Promise<void> {
    if (closePromise) {
      return closePromise;
    }

    closing = true;
    signal.removeEventListener('abort', aborted);
    lifetime.abort(new NaverFocusError('cancelled'));

    // 여러 호출자가 close를 호출해도 같은 정리 결과를 받습니다.
    closePromise = (async (): Promise<void> => {
      try {
        await request('release');
      } catch {
        throw new NaverFocusError('cleanup_unconfirmed');
      } finally {
        disconnect();
        port.onMessage.removeListener(received);
        port.onDisconnect.removeListener(lost);
      }
    })();

    return closePromise;
  }

  // 획득 중 취소는 포트를 닫고 획득 후에는 같은 해제 작업을 시작합니다.
  // 사용자가 취소했을 때 -> abort 알림
  function aborted(): void {
    const error = new NaverFocusError('cancelled');
    lifetime.abort(error);

    if (!acquired) {
      rejectPending(error);
      disconnect();
      return;
    }

    void close().catch((): void => {
      // 호출자가 명시적으로 close할 때 동일한 정리 실패를 확인합니다.
    });
  }

  port.onMessage.addListener(received);
  port.onDisconnect.addListener(lost);
  signal.addEventListener('abort', aborted, { once: true });

  try {
    if (signal.aborted) {
      aborted();
      throw new NaverFocusError('cancelled');
    }

    await request('acquire');

    // 성공 응답과 동시에 취소·연결 종료가 도착했을 수도 있습니다.
    if (signal.aborted || lifetime.signal.aborted) {
      throw lifetime.signal.reason ?? new NaverFocusError('cancelled');
    }

    acquired = true;
    return Object.freeze({ signal: lifetime.signal, close });
  } catch (error: unknown) {
    signal.removeEventListener('abort', aborted);
    rejectPending(new NaverFocusError('cancelled'));
    disconnect();
    port.onMessage.removeListener(received);
    port.onDisconnect.removeListener(lost);

    if (error instanceof NaverFocusError) {
      throw error;
    }
    throw new NaverFocusError('connection_lost');
  }
}

// 기존 runner는 한 번만 호출하고 작업·해제 실패가 겹치면 원래 예외를 보존합니다.
export async function withNaverFocus<T>(
  tabId: number,
  signal: AbortSignal,
  operation: (focusSignal: AbortSignal) => Promise<T>,
  options: FocusClientOptions = {},
): Promise<T> {
  const session = await acquireNaverFocus(tabId, signal, options);
  let failed = false;

  try {
    if (session.signal.aborted) {
      throw session.signal.reason;
    }

    // 기존 작업 실행
    const result = await operation(session.signal);

    if (session.signal.aborted) {
      throw session.signal.reason;
    }

    return result;
  } catch (error: unknown) {
    failed = true;
    throw error;
  } finally {
    try {
      await session.close();
    } catch {
      const error = new NaverFocusError('cleanup_unconfirmed');

      if (!failed) {
        throw error;
      }

      try {
        options.onCleanupError?.(error);
      } catch {
        // 안내 콜백의 오류로 원래 작업 결과를 바꾸지 않습니다.
      }
    }
  }
}
