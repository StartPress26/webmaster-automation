import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { inspectNaverUrl, selectNaverSite, NAVER_BOARD_URL, NAVER_NO_RESULT_MESSAGE, NAVER_INDEXED_MESSAGE, canonicalNaverTarget } from '../src/engines/naver/observation.ts';
import { runNaverAutomation } from '../src/engines/naver/automation.ts';
const site = 'https://one.example/';
const target = { id: 'p1', siteId: 's1', siteName: '사이트 A', siteUrl: site, url: `${site}post`, name: '글' };
const inspectionUrl = `https://searchadvisor.naver.com/console/site/check/inspection?site=${encodeURIComponent(site)}`;

// 레이아웃만 고정하고 실제 DOM 이벤트와 MutationObserver를 검증합니다.
function screen(html, url = inspectionUrl) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
  dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
  return dom;
}

test('사이트 목록에서는 해당 사이트의 안전한 링크 하나만 클릭한다', () => {
  const dom = screen(`<table><tr><td><a href="#">${site}</a></td></tr></table><button>삭제</button>`, NAVER_BOARD_URL);
  let clicks = 0;

  dom.window.document.querySelector('a').onclick = (event) => { event.preventDefault(); clicks += 1; };

  try {
    selectNaverSite(dom.window.document, NAVER_BOARD_URL, site);
    assert.equal(clicks, 1);
    assert.throws(() => selectNaverSite(dom.window.document, NAVER_BOARD_URL, 'https://other.example/'), /찾지 못했습니다/);
    dom.window.document.querySelector('a').href = 'https://evil.example/';
    assert.throws(() => selectNaverSite(dom.window.document, NAVER_BOARD_URL, site), /찾지 못했습니다/);
  } finally { dom.window.close(); }
});

test('확인 버튼으로 새 결과를 받고 결과 없음은 unknown으로 유지한다', async () => {
  for (const message of [NAVER_INDEXED_MESSAGE, NAVER_NO_RESULT_MESSAGE]) {
    const dom = screen('<input type="url"><button id="check">확인</button><button id="submit">수집 요청</button><div id="result"></div>');
    const doc = dom.window.document;
    let inputs = 0;

    doc.querySelector('input').oninput = () => { inputs += 1; };
    doc.querySelector('#submit').onclick = () => assert.fail('수집 요청 금지');
    doc.querySelector('#check').onclick = () => setTimeout(() => { doc.querySelector('#result').innerHTML = `<p>${message}</p>`; }, 1);

    try {
      const result = await inspectNaverUrl(doc, site, target.url, new AbortController().signal, 1000);
      assert.equal(inputs, 1); assert.equal(result.targetUrl, target.url); assert.equal(result.targetVerified, true);
      assert.equal(result.indexStatus, message === NAVER_INDEXED_MESSAGE ? 'indexed' : 'unknown');
    } finally { dom.window.close(); }
  }
});

test('바뀌지 않은 기존 판정·취소·다른 사이트의 URL은 성공으로 처리하지 않는다', async () => {
  const dom = screen(`<input value="${site}"><button>확인</button><p>${NAVER_INDEXED_MESSAGE}</p>`);

  try {
    await assert.rejects(inspectNaverUrl(dom.window.document, site, target.url, new AbortController().signal, 20), (error) => error.code === 'timeout');
    const abort = new AbortController(); abort.abort();
    await assert.rejects(inspectNaverUrl(dom.window.document, site, target.url, abort.signal), (error) => error.code === 'cancelled');
    await assert.rejects(inspectNaverUrl(dom.window.document, site, 'https://other.example/', new AbortController().signal), (error) => error.code === 'invalid_response');
  } finally { dom.window.close(); }
});

// Chrome의 이동·메시지를 재현하고 실제 처리 순서를 기록합니다.
function fakeClient() {
  let url = NAVER_BOARD_URL;
  const events = [];

  return { events, client: {
    get: async (id) => ({ id, url, status: 'complete' }),
    navigate: async (id, destination) => { url = destination; events.push(['navigate', new URL(url).pathname]); },
    send: async (id, request) => {
      const current = new URL(url);
      let value;

      if (request.action === 'state') value = { route: current.pathname.endsWith('/board') ? 'board' : current.pathname.endsWith('/summary') ? 'summary' : 'inspection', siteUrl: canonicalNaverTarget(current.searchParams.get('site') ?? ''), ready: true, documentToken: 'document' };

      if (request.action === 'select_site') { events.push(['select', request.siteUrl]); url = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(request.siteUrl)}`; }

      if (request.action === 'inspect_url') { events.push(['inspect', request.targetUrl]); value = { kind: 'verified_gui', siteUrl: request.siteUrl, targetUrl: canonicalNaverTarget(request.targetUrl), indexStatus: 'unknown', message: NAVER_NO_RESULT_MESSAGE, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true }; }

      return { requestId: request.requestId, ok: true, value };
    },
  } };
}

test('사이트 A의 URL들을 처리하고 목록으로 돌아가 사이트 B를 선택한다', async () => {
  const fixture = fakeClient();
  const second = { ...target, id: 'p2', siteId: 's2', siteName: '사이트 B', siteUrl: 'https://two.example/', url: 'https://two.example/post' };
  const results = [];

  await runNaverAutomation({ tabId: 7, engine: 'naver' }, [target, { ...target, id: 'p1-2', url: `${site}second` }, second], { signal: new AbortController().signal, onStart: () => {}, onResult: (item, result) => results.push([item.id, result.indexStatus]) }, fixture.client);
  assert.deepEqual(fixture.events.filter(([action]) => action === 'select'), [['select', site], ['select', 'https://two.example/']]);
  assert.deepEqual(fixture.events.filter(([action]) => action === 'inspect').map(([, url]) => url), [target.url, `${site}second`, second.url]);
  assert.deepEqual(fixture.events.at(-1), ['navigate', '/console/board']);
  assert.equal(results.length, 3);
});

test('네이버는 비동기 결과 저장이 끝나기 전 다음 URL을 검사하지 않는다', async () => {
  const fixture = fakeClient();
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let results = 0;
  const running = runNaverAutomation({ tabId: 7, engine: 'naver' }, [target, { ...target, id: 'p2', url: `${site}second` }], {
    signal: new AbortController().signal,
    onStart: () => {},
    onResult: async () => { results += 1; entered(); await gate; },
  }, fixture.client);
  try {
    await started;
    assert.equal(fixture.events.filter(([action]) => action === 'inspect').length, 1);
    release();
    await running;
    assert.equal(results, 2);
  } finally { release(); await running; }
});

test('취소 뒤 다음 URL로 이동하지 않고 다른 대상의 응답을 거부한다', async () => {
  const fixture = fakeClient();
  const abort = new AbortController();

  await assert.rejects(runNaverAutomation({ tabId: 7, engine: 'naver' }, [target, { ...target, id: 'p2', url: `${site}second` }], { signal: abort.signal, onStart: () => {}, onResult: () => abort.abort() }, fixture.client), (error) => error.code === 'cancelled');
  assert.equal(fixture.events.filter(([action]) => action === 'inspect').length, 1);

  const broken = fakeClient(); const original = broken.client.send;

  broken.client.send = async (id, request) => { const response = await original(id, request); return request.action === 'inspect_url' ? { ...response, value: { ...response.value, targetUrl: 'https://other.example/' } } : response; };
  await assert.rejects(runNaverAutomation({ tabId: 7, engine: 'naver' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => assert.fail('다른 대상') }, broken.client), (error) => error.code === 'invalid_response');
});

test('조회 중 취소와 페이지 이동은 결과 반영 전에 중단한다', async () => {
  for (const mode of ['cancel', 'navigate']) {
    const dom = screen('<input><button>확인</button><div id="result"></div>');
    const abort = new AbortController();

    dom.window.document.querySelector('button').onclick = () => {
      if (mode === 'cancel') queueMicrotask(() => abort.abort());
      else {
        dom.window.history.replaceState({}, '', '/console/board');
        dom.window.document.querySelector('#result').innerHTML = `<p>${NAVER_INDEXED_MESSAGE}</p>`;
      }
    };

    try { await assert.rejects(inspectNaverUrl(dom.window.document, site, target.url, abort.signal, 1000), (error) => error.code === (mode === 'cancel' ? 'cancelled' : 'page_changed')); }
    finally { dom.window.close(); }
  }
});

// 실제 Chrome에서 관측한 로딩 중 URL 누락을 재현하고 조작 명령이 나가지 않게 합니다.
test('로딩 중 URL 정보가 잠시 없어도 준비 후에만 사이트 선택·검사를 실행한다', async () => {
  const fixture = fakeClient();
  const originalGet = fixture.client.get;
  const originalNavigate = fixture.client.navigate;
  const originalSend = fixture.client.send;
  let pending = 0;
  let missing = 0;

  fixture.client.navigate = async (...args) => { await originalNavigate(...args); pending = 3; };
  fixture.client.get = async (id) => {
    const stable = await originalGet(id);

    if (pending > 0) {
      const stage = pending--;
      if (stage === 3) return { ...stable, status: 'loading', pendingUrl: stable.url };
      missing += 1;
      return { id, status: stage === 2 ? 'loading' : 'complete', incognito: false, discarded: false };
    }

    return stable;
  };
  fixture.client.send = async (...args) => { assert.equal(pending, 0, '준비 전에는 DOM 명령을 보내면 안 됩니다'); return originalSend(...args); };

  const results = [];

  await runNaverAutomation({ tabId: 7, engine: 'naver' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: (_, result) => results.push(result) }, fixture.client);
  assert.equal(missing, 6);
  assert.equal(results.length, 1);
  assert.deepEqual(fixture.events.at(-1), ['navigate', '/console/board']);
});

// URL을 끝내 확인하지 못하면 무한 대기 대신 기존 제한 시간으로 중단합니다.
test('URL 정보가 회복되지 않으면 page_changed 대신 대기 시간 초과로 중단한다', async () => {
  const fixture = fakeClient();
  const originalGet = fixture.client.get;
  const originalNavigate = fixture.client.navigate;
  const originalNow = Date.now;
  let elapsed = 0;
  let moved = false;

  Date.now = () => originalNow() + elapsed;
  fixture.client.navigate = async (...args) => { await originalNavigate(...args); moved = true; };
  fixture.client.get = async (id) => {
    if (!moved) return originalGet(id);
    elapsed = 20000;
    return { id, status: 'loading' };
  };
  fixture.client.send = async () => assert.fail('URL이 없는 동안 명령을 실행하면 안 됩니다');

  try {
    await assert.rejects(runNaverAutomation({ tabId: 7, engine: 'naver' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => assert.fail('결과 없음') }, fixture.client), (error) => error.code === 'timeout');
  } finally { Date.now = originalNow; }
});

// 일시적 URL 누락과 실제 탭 소실·다른 탭·허용되지 않은 이동을 구분합니다.
test('탭 닫힘·ID 변경·시크릿·메모리 해제·다른 호스트는 계속 즉시 중단한다', async () => {
  for (const invalid of [null, { id: 99 }, { incognito: true }, { discarded: true }, { url: 'https://other.example/' }]) {
    const fixture = fakeClient();
    const originalGet = fixture.client.get;
    const originalNavigate = fixture.client.navigate;
    let moved = false;

    fixture.client.navigate = async (...args) => { await originalNavigate(...args); moved = true; };
    fixture.client.get = async (id) => {
      const stable = await originalGet(id);
      if (!moved) return stable;
      if (invalid === null) throw new Error('tab closed');
      return { ...stable, ...invalid };
    };
    fixture.client.send = async () => assert.fail('잘못된 탭에서 명령 금지');
    await assert.rejects(runNaverAutomation({ tabId: 7, engine: 'naver' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => {} }, fixture.client), (error) => error.code === (invalid?.url ? 'auth_required' : 'page_changed'));
  }
});

// 실제 네이버의 아이콘+직접 텍스트 구조를 재현하고 결과 없음 응답을 읽습니다.
test('error_outline 아이콘이 붙은 결과 없음 문구도 시간 초과 없이 판독한다', async () => {
  const dom = screen('<input><button>확인</button><div id="result"></div>');
  const doc = dom.window.document;

  doc.querySelector('button').onclick = () => setTimeout(() => {
    doc.querySelector('#result').innerHTML = `<div><i class="v-icon">error_outline</i> ${NAVER_NO_RESULT_MESSAGE}</div><div>URL 검사에 실패했습니다. 수집 데이터가 없거나, URL 이상으로 결과를 확인 할 수 없습니다.</div>`;
  }, 1);

  try {
    const result = await inspectNaverUrl(doc, site, target.url, new AbortController().signal, 1000);
    assert.equal(result.message, NAVER_NO_RESULT_MESSAGE);
    assert.equal(result.indexStatus, 'unknown');
    assert.equal(result.targetVerified, true);
    assert.ok(!result.message.includes('error_outline'));
  } finally { dom.window.close(); }
});

// 장식 아이콘만 변한 경우에는 이전 판정을 새 조회 결과로 인정하지 않습니다.
test('기존 결과의 아이콘 변화만으로는 새 결과로 판정하지 않는다', async () => {
  const dom = screen(`<input><button>확인</button><div><i class="v-icon">check_circle</i>${NAVER_INDEXED_MESSAGE}</div>`);
  const doc = dom.window.document;

  doc.querySelector('button').onclick = () => { doc.querySelector('i').textContent = 'check_circle_outline'; };

  try { await assert.rejects(inspectNaverUrl(doc, site, target.url, new AbortController().signal, 20), (error) => error.code === 'timeout'); }
  finally { dom.window.close(); }
});
