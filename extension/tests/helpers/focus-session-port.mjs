// 화면 테스트에서는 Chrome 디버거 대신 세션 준비·해제 응답만 재현합니다.
export function createFocusRuntime(events, { acquireError, cleanupError } = {}) {
  // 테스트 포트가 실제 Chrome 이벤트처럼 구독과 해제를 지원하게 합니다.
  function createEvent() {
    const listeners = new Set();

    return {
      addListener(listener) {
        listeners.add(listener);
      },
      removeListener(listener) {
        listeners.delete(listener);
      },
      emit(message) {
        for (const listener of [...listeners]) {
          listener(message);
        }
      },
    };
  }

  return {
    // 준비 요청 전에 GUI 명령을 보내지 않는지 확인할 가짜 포트를 만듭니다.
    connect() {
      const onMessage = createEvent();
      const onDisconnect = createEvent();

      return {
        onMessage,
        onDisconnect,
        postMessage(request) {
          events.push(request.type);

          queueMicrotask(() => {
            const failure = request.type === 'acquire' ? acquireError : cleanupError;

            if (failure) {
              onMessage.emit({ type: 'error', requestId: request.requestId, code: failure });
              return;
            }

            const responseType = request.type === 'acquire' ? 'ready' : 'released';
            onMessage.emit({ type: responseType, requestId: request.requestId });
          });
        },
        disconnect() {
          onDisconnect.emit();
        },
      };
    },
  };
}
