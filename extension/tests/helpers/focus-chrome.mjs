// 테스트마다 독립된 이벤트 목록을 보관합니다.
export class FakeEvent {
  listeners = [];
  // 실제 API처럼 리스너를 등록합니다.
  addListener(listener) {
    this.listeners = [...this.listeners, listener];
  }
  // 다른 리스너를 보존하며 지정한 리스너만 해제합니다.
  removeListener(listener) {
    this.listeners = this.listeners.filter(item => item !== listener);
  }
  // 현재 등록 목록의 복사본에만 이벤트를 전달합니다.
  emit(...args) {
    for (const listener of [...this.listeners]) {
      listener(...args);
    }
  }
}

// 지연된 네이티브 응답을 테스트가 명시적으로 완료하게 합니다.
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// 포트 메시지와 Worker 작업 큐가 진행할 기회를 줍니다.
export async function flush() {
  for (let index = 0; index < 8; index++) {
    await new Promise(resolve => setImmediate(resolve));
  }
}

// 실제 네트워크·화면 없이 필요한 Chrome API만 재현합니다.
export function fakeChrome(settings = {}) {
  let tab = {
    id: 7, url: 'https://searchadvisor.naver.com/console/board', status: 'complete', incognito: false, discarded: false
  };
  const state = {
    attached: false, attachGate: undefined, detachGate: undefined, attachFailure: false, detachFailure: false, emulateFailure: false, tabGone: false, ...settings
  };
  const calls = [];
  const pairs = [];
  const onConnect = new FakeEvent();
  const onDetach = new FakeEvent();
  const onUpdated = new FakeEvent();
  const onRemoved = new FakeEvent();
  // 한쪽 종료가 양쪽에 전달되는 런타임 포트를 만듭니다.
  function connectAs(sender = { id: 'test-extension', url: 'chrome-extension://test-extension/index.html' }, name = 'startpress-naver-focus-v1') {
    let closed = false;
    const page = { name, onMessage: new FakeEvent(), onDisconnect: new FakeEvent() };
    const worker = { name, sender, onMessage: new FakeEvent(), onDisconnect: new FakeEvent() };
    // 닫힌 연결에는 새 메시지를 전달하지 않습니다.
    function disconnect() {
      if (closed) {
        return;
      }
      closed = true;
      queueMicrotask(() => {
        page.onDisconnect.emit();
        worker.onDisconnect.emit();
      });
    }
    page.disconnect = worker.disconnect = disconnect;
    // 관리 페이지에서 Worker로 메시지를 전달합니다.
    page.postMessage = message => {
      if (closed) {
        throw new Error('closed');
      }
      queueMicrotask(() => {
        if (!closed) {
          worker.onMessage.emit(message);
        }
      });
    };
    // Worker에서 관리 페이지로 응답을 전달합니다.
    worker.postMessage = message => {
      if (closed) {
        throw new Error('closed');
      }
      queueMicrotask(() => {
        if (!closed) {
          page.onMessage.emit(message);
        }
      });
    };
    pairs.push({ page, worker });
    onConnect.emit(worker);
    return page;
  }
  const api = {
    runtime: {
      id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, onConnect, connect: ({ name }) => connectAs(undefined, name)
    },
    tabs: {
      onUpdated, onRemoved,
      // 대상 검증용 읽기만 제공하며 탭 활성화 API는 제공하지 않습니다.
      get: async (id) => {
        calls.push(['get', id]);
        if (state.tabGone) {
          throw new Error('gone');
        }
        return { ...tab, id };
      },
    },
    debugger: {
      onDetach,
      // 연결 지연과 다른 디버거 소유 충돌을 재현합니다.
      attach: async (target) => {
        calls.push(['attach', target.tabId]);
        if (state.attachGate) {
          await state.attachGate.promise;
        }
        if (state.attachFailure || state.attached) {
          throw new Error('attached elsewhere');
        }
        state.attached = true;
      },
      // 이 테스트에는 포커스 에뮬레이션 외 명령이 필요하지 않습니다.
      sendCommand: async (target, command, params) => {
        calls.push(['command', target.tabId, command, params]);
        if (state.emulateGate && params.enabled) {
          await state.emulateGate.promise;
        }
        if (state.emulateFailure && params.enabled) {
          throw new Error('emulate failed');
        }
      },
      // 성공한 해제와 외부 연결 종료를 구분할 수 있게 이벤트를 보냅니다.
      detach: async (target) => {
        calls.push(['detach', target.tabId]);
        if (state.detachGate) {
          await state.detachGate.promise;
        }
        if (state.detachFailure) {
          throw new Error('detach failed');
        }
        state.attached = false;
        onDetach.emit(target, 'canceled_by_user');
      },
    },
  };
  return {
    api, state, calls, pairs, connectAs,
    // 테스트가 대상 스냅샷을 바꾸며 필요할 때 실제 탭 이벤트도 발생시킵니다.
    setTab: (patch, notify = false) => {
      tab = { ...tab, ...patch };
      if (notify) {
        onUpdated.emit(tab.id, patch, tab);
      }
    },
    // 외부 DevTools 연결 등으로 기존 연결이 끊긴 상황을 재현합니다.
    detachExternally: () => {
      state.attached = false;
      onDetach.emit({ tabId: tab.id }, 'replaced_with_devtools');
    },
    // 탭 종료는 원래 연결을 사라지게 하는 확정 신호입니다.
    closeTab: () => {
      state.tabGone = true;
      state.attached = false;
      onRemoved.emit(tab.id, { windowId: 1, isWindowClosing: false });
    },
  };
}
