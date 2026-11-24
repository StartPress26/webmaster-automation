import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installNaverFocusHost } from '../src/focus/host.ts';
import { acquireNaverFocus, withNaverFocus } from '../src/focus/client.ts';
import { createFocusedNaverRunner } from '../src/focus/naver-runner.ts';
import { FOCUS_COMMAND, NaverFocusError } from '../src/focus/protocol.ts';
import { deferred, fakeChrome, flush } from './helpers/focus-chrome.mjs';

// 호스트와 클라이언트가 같은 가짜 런타임에서 연결되게 합니다.
function setup(settings = {}) {
  const fake = fakeChrome(settings);
  const dispose = installNaverFocusHost(fake.api);
  return { ...fake, dispose, options: { runtime: fake.api.runtime, timeoutMs: 300 } };
}

// 고정 오류 코드만 외부에 전달하는지 검사합니다.
function code(expected) {
  return error => error instanceof NaverFocusError && error.code === expected;
}

// 조작 기록에서 특정 네이티브 API 호출만 셉니다.
function count(fake, name) {
  return fake.calls.filter(item => item[0] === name).length;
}

test('기존 runner를 한 번 호출하고 사용자 탭 변경·제출 명령 없이 에뮬레이션을 해제한다', async () => {
  const fake = setup();
  let runs = 0;
  try {
    const value = await withNaverFocus(7, new AbortController().signal, async (signal) => {
      assert.equal(signal.aborted, false);
      runs++;
      return 'done';
    }, fake.options);
    assert.equal(value, 'done');
    assert.equal(runs, 1);
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'attach'), 1);
    assert.equal(count(fake, 'detach'), 1);
    assert.deepEqual(fake.calls.filter(item => item[0] === 'command').map(item => [item[2], item[3]]), [[FOCUS_COMMAND, { enabled: true }], [FOCUS_COMMAND, { enabled: false }]]);
  }
  finally {
    await fake.dispose();
  }
});

test('관리 문서 해시·쿼리는 허용하고 다른 문서·확장 발신자는 거부한다', async () => {
  const fake = setup();
  try {
    for (const sender of [
      { id: 'foreign', url: 'chrome-extension://test-extension/index.html' }, { id: 'test-extension', url: 'chrome-extension://test-extension/other.html' }, { id: 'test-extension', url: 'https://site.example/index.html' }
    ]) {
      fake.connectAs(sender);
      await flush();
    }
    assert.equal(count(fake, 'attach'), 0);
    const runtime = {
      connect: ({ name }) => fake.connectAs({ id: 'test-extension', url: 'chrome-extension://test-extension/index.html?mode=real#inspect' }, name)
    };
    const session = await acquireNaverFocus(7, new AbortController().signal, { ...fake.options, runtime });
    await session.close();
  }
  finally {
    await fake.dispose();
  }
});

test('잘못된 탭·시크릿·인증 문서에는 attach하지 않는다', async () => {
  for (const patch of [
    { url: 'https://outside.example/' }, { url: 'https://searchadvisor.naver.com/auth/callback' }, { incognito: true }, { discarded: true }, { status: 'loading' }
  ]) {
    const fake = setup();
    fake.setTab(patch);
    try {
      await assert.rejects(acquireNaverFocus(7, new AbortController().signal, fake.options), code('invalid_tab'));
      assert.equal(count(fake, 'attach'), 0);
    }
    finally {
      await fake.dispose();
    }
  }
});

test('attach 전후 대상이 바뀌면 에뮬레이션을 켜지 않고 소유 연결만 되돌린다', async () => {
  const gate = deferred();
  const fake = setup({ attachGate: gate });
  try {
    const acquiring = acquireNaverFocus(7, new AbortController().signal, fake.options);
    await flush();
    fake.setTab({ url: 'https://outside.example/' });
    gate.resolve();
    await assert.rejects(acquiring, code('scope_changed'));
    assert.equal(fake.calls.some(item => item[0] === 'command' && item[3].enabled === true), false);
    assert.equal(fake.state.attached, false);
  }
  finally {
    await fake.dispose();
  }
});

test('다른 디버거가 이미 소유하면 원래 연결을 detach하지 않는다', async () => {
  const fake = setup({ attached: true });
  try {
    await assert.rejects(acquireNaverFocus(7, new AbortController().signal, fake.options), code('attach_failed'));
    assert.equal(count(fake, 'detach'), 0);
    assert.equal(fake.state.attached, true);
  }
  finally {
    await fake.dispose();
  }
});

test('부분 에뮬레이션 실패는 연결을 롤백한다', async () => {
  const fake = setup({ emulateFailure: true });
  try {
    await assert.rejects(acquireNaverFocus(7, new AbortController().signal, fake.options), code('emulation_failed'));
    assert.equal(fake.state.attached, false);
  }
  finally {
    await fake.dispose();
  }
});

test('동시 실행은 busy이며 첫 실행의 연결과 작업을 건드리지 않는다', async () => {
  const fake = setup();
  try {
    const first = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    await assert.rejects(acquireNaverFocus(7, new AbortController().signal, fake.options), code('busy'));
    assert.equal(fake.state.attached, true);
    assert.equal(count(fake, 'detach'), 0);
    await first.close();
    const next = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    await next.close();
  }
  finally {
    await fake.dispose();
  }
});

test('획득 전 취소는 포트를 만들지 않고 runner를 실행하지 않는다', async () => {
  const fake = setup();
  const abort = new AbortController();
  abort.abort();
  try {
    await assert.rejects(withNaverFocus(7, abort.signal, async () => assert.fail('runner 실행 금지'), fake.options), code('cancelled'));
    assert.equal(fake.pairs.length, 0);
  }
  finally {
    await fake.dispose();
  }
});

test('attach 중 취소되어도 늦게 성공한 연결은 Worker가 해제한다', async () => {
  const gate = deferred();
  const fake = setup({ attachGate: gate });
  const abort = new AbortController();
  try {
    const pending = acquireNaverFocus(7, abort.signal, fake.options);
    await flush();
    abort.abort();
    await assert.rejects(pending, code('cancelled'));
    gate.resolve();
    await flush();
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'detach'), 1);
    const next = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    await next.close();
  }
  finally {
    gate.resolve();
    await fake.dispose();
  }
});

test('관리 페이지가 attach 중 종료돼도 늦은 연결을 정리한다', async () => {
  const gate = deferred();
  const fake = setup({ attachGate: gate });
  try {
    const pending = acquireNaverFocus(7, new AbortController().signal, fake.options);
    await flush();
    fake.pairs[0].page.disconnect();
    await assert.rejects(pending, code('connection_lost'));
    gate.resolve();
    await flush();
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'detach'), 1);
  }
  finally {
    gate.resolve();
    await fake.dispose();
  }
});

test('획득 제한 시간 뒤 늦은 attach도 caller 재시도 없이 정리된다', async () => {
  const gate = deferred();
  const fake = setup({ attachGate: gate });
  try {
    await assert.rejects(acquireNaverFocus(7, new AbortController().signal, { ...fake.options, timeoutMs: 15 }), code('timeout'));
    gate.resolve();
    await flush();
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'attach'), 1);
  }
  finally {
    gate.resolve();
    await fake.dispose();
  }
});

test('예상치 못한 디버거 종료와 다른 사이트 이동은 작업 신호를 즉시 취소한다', async () => {
  for (const lose of [
    fake => fake.detachExternally(), fake => fake.setTab({ url: 'https://outside.example/' }, true), fake => fake.closeTab()
  ]) {
    const fake = setup();
    try {
      const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
      lose(fake);
      await flush();
      assert.equal(session.signal.aborted, true);
      await session.close();
    }
    finally {
      await fake.dispose();
    }
  }
});

test('기존 OAuth authorize와 callback 이동은 사용자 조작 없이 허용한다', async () => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    fake.setTab({ url: 'https://nid.naver.com/oauth2.0/authorize' }, true);
    fake.setTab({ url: 'https://searchadvisor.naver.com/auth/callback' }, true);
    fake.setTab({ url: 'https://searchadvisor.naver.com/console/board' }, true);
    await flush();
    assert.equal(session.signal.aborted, false);
    await session.close();
  }
  finally {
    await fake.dispose();
  }
});

test('해제는 여러 번 호출해도 한 번만 실행하고 사용자 취소도 동일 결과를 공유한다', async () => {
  const fake = setup();
  const abort = new AbortController();
  try {
    const session = await acquireNaverFocus(7, abort.signal, fake.options);
    abort.abort();
    await session.close();
    await session.close();
    assert.equal(count(fake, 'detach'), 1);
    assert.equal(session.signal.aborted, true);
  }
  finally {
    await fake.dispose();
  }
});

test('해제 실패를 성공으로 바꾸지 않고 불확실 lease는 새 실행을 차단한다', async () => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    fake.state.detachFailure = true;
    await assert.rejects(session.close(), code('cleanup_unconfirmed'));
    await flush();
    await assert.rejects(acquireNaverFocus(7, new AbortController().signal, fake.options), code('busy'));
    fake.state.detachFailure = false;
    fake.detachExternally();
    await flush();
    const next = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    await next.close();
  }
  finally {
    fake.state.detachFailure = false;
    await fake.dispose();
  }
});

test('작업과 해제가 함께 실패해도 원래 receipt_unconfirmed 예외를 보존한다', async () => {
  const fake = setup();
  const original = new Error('receipt_unconfirmed');
  let cleanup;
  try {
    await assert.rejects(withNaverFocus(7, new AbortController().signal, async () => {
      fake.state.detachFailure = true;
      throw original;
    }, { ...fake.options, onCleanupError: error => {
        cleanup = error.code;
      } }), error => error === original);
    assert.equal(cleanup, 'cleanup_unconfirmed');
    assert.equal(count(fake, 'attach'), 1);
  }
  finally {
    fake.state.detachFailure = false;
    await fake.dispose();
  }
});

test('작업 성공 뒤 해제가 실패하면 전체 성공으로 표시하지 않는다', async () => {
  const fake = setup();
  try {
    await assert.rejects(withNaverFocus(7, new AbortController().signal, async () => {
      fake.state.detachFailure = true;
      return 'submitted';
    }, fake.options), code('cleanup_unconfirmed'));
  }
  finally {
    fake.state.detachFailure = false;
    await fake.dispose();
  }
});

test('에뮬레이션 응답 대기 중 취소되면 늦은 성공 뒤 연결을 정리한다', async () => {
  const gate = deferred();
  const fake = setup({ emulateGate: gate });
  const abort = new AbortController();
  try {
    const acquiring = acquireNaverFocus(7, abort.signal, fake.options);
    await flush();
    assert.equal(fake.state.attached, true);
    abort.abort();
    await assert.rejects(acquiring, code('cancelled'));
    gate.resolve();
    await flush();
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'detach'), 1);
  }
  finally {
    gate.resolve();
    await fake.dispose();
  }
});

test('정상 획득한 관리 페이지가 닫히면 Worker가 세션을 해제한다', async () => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    fake.pairs[0].page.disconnect();
    await flush();
    assert.equal(session.signal.aborted, true);
    assert.equal(fake.state.attached, false);
    assert.equal(count(fake, 'detach'), 1);
  }
  finally {
    await fake.dispose();
  }
});

test('자동 인증 왕복도 제한 시간을 넘기면 작업 신호를 취소하고 정리한다', async (t) => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    fake.setTab({ url: 'https://nid.naver.com/oauth2.0/authorize' }, true);
    t.mock.timers.tick(22001);
    await flush();
    assert.equal(session.signal.aborted, true);
    assert.equal(session.signal.reason.code, 'auth_required');
    assert.equal(fake.state.attached, false);
    await session.close();
  }
  finally {
    t.mock.timers.reset();
    await fake.dispose();
  }
});

test('작업 중 디버거가 끊기면 취소가 아니라 연결 종료 사유를 전달한다', async () => {
  const fake = setup();
  const previousChrome = globalThis.chrome;
  globalThis.chrome = fake.api;

  // 목록 화면이 준비되지 않아 기존 runner가 계속 기다리는 상황을 만듭니다.
  const client = {
    get: async () => ({ id: 7, url: 'https://searchadvisor.naver.com/console/board', status: 'complete', incognito: false }),
    send: async () => {
      throw new Error('no script');
    },
    navigate: async () => null,
  };
  const target = { id: 'p1', name: '글', url: 'https://a.example/post', siteId: 's1', siteName: 'A', siteUrl: 'https://a.example/' };
  const hooks = { signal: new AbortController().signal, onStart: () => {}, onResult: () => {} };

  try {
    const running = createFocusedNaverRunner()({ engine: 'naver', tabId: 7 }, [target], hooks, client);
    setTimeout(() => fake.detachExternally(), 50);
    await assert.rejects(running, code('session_lost'));
  } finally {
    globalThis.chrome = previousChrome;
    await flush();
    await fake.dispose();
  }
});

test('주소를 볼 수 없는 이동이 제한 시간 안에 돌아오지 않으면 연결을 종료한다', async (t) => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // 권한 없는 사이트로 이동하면 Chrome은 주소 없이 상태만 알려줍니다.
    fake.api.tabs.onUpdated.emit(7, { status: 'loading' }, { id: 7, status: 'loading' });
    t.mock.timers.tick(22001);
    await flush();

    assert.equal(session.signal.aborted, true);
    assert.equal(session.signal.reason.code, 'auth_required');
    assert.equal(fake.state.attached, false);
    await session.close();
  } finally {
    t.mock.timers.reset();
    await fake.dispose();
  }
});

test('주소를 볼 수 없는 이동 뒤 네이버로 돌아오면 작업을 유지한다', async (t) => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    t.mock.timers.enable({ apis: ['setTimeout'] });

    fake.api.tabs.onUpdated.emit(7, { status: 'loading' }, { id: 7, status: 'loading' });
    fake.setTab({ url: 'https://searchadvisor.naver.com/console/board' }, true);
    t.mock.timers.tick(22001);
    await flush();

    assert.equal(session.signal.aborted, false);
    await session.close();
  } finally {
    t.mock.timers.reset();
    await fake.dispose();
  }
});

test('네이버 안에서 주소가 바뀌지 않는 새로고침은 대기 없이 작업을 유지한다', async (t) => {
  const fake = setup();
  try {
    const session = await acquireNaverFocus(7, new AbortController().signal, fake.options);
    t.mock.timers.enable({ apis: ['setTimeout'] });

    // 주소가 그대로면 변경 정보에는 주소가 없지만 탭 정보에는 남아 있습니다.
    fake.setTab({ status: 'loading' }, true);
    t.mock.timers.tick(22001);
    await flush();

    assert.equal(session.signal.aborted, false);
    await session.close();
  } finally {
    t.mock.timers.reset();
    await fake.dispose();
  }
});
