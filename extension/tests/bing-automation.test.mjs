import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { inspectBingUrl, selectBingSite, normalizeBingUrl, bingTargetInSite, bingIndexStatus, BingAutomationError, BING_INSPECTION_URL } from '../src/engines/bing/observation.ts';
import { runBingAutomation } from '../src/engines/bing/automation.ts';

const site = 'https://one.example/';
const target = { id: 'p1', siteId: 's1', siteName: '사이트 A', siteUrl: site, url: `${site}post`, name: '글' };
const indexed = '색인화되었습니다.';
const excluded = '이 페이지는 정식 페이지의 대체 버전이기 때문에 색인화되지 않습니다.';

// 실제 Bing의 고정 속성과 숨김 툴팁 구조를 최소한으로 재현합니다.
function card(message = indexed) {
  return `<div data-tag="urlInspectionIndexCard"><div data-tag="accordionItemHeader" aria-expanded="true"><div class="urlInspectionSectionTitle">${message}</div></div>
    <div data-tag="urlInspectionIndexDetails">
    <div class="urlInspectionLabelValuePair"><div class="urlInspectionIndexItemLabel">페이지 가져오기<div hidden>페이지 가져오기</div></div><div class="urlInspectionIndexItemValue">성공<div hidden>성공</div></div></div>
    <div class="urlInspectionLabelValuePair"><div class="urlInspectionIndexItemLabel">정식 URL</div><div class="urlInspectionIndexItemValue">https://one.example/canonical</div></div>
    <div class="urlInspectionErrorStatusBar">대체 페이지 안내</div></div></div>`;
}

// 레이아웃만 보정하고 입력·클릭·화면 전환·결과 감시는 실제 DOM으로 검사합니다.
function screen(result = '') {
  const dom = new JSDOM(`<button class="userSeletedSite" aria-expanded="false">사이트 선택</button><input data-tag="urlInspectionInput"><button data-tag="inspectBtn">검사</button>
    <button data-tag="requestIndexingButton">색인화 요청</button><button data-tag="BingdexTab" aria-selected="true">Bing 색인</button><div id="result">${result}</div>`, { url: `${BING_INSPECTION_URL}?siteUrl=${encodeURIComponent(site)}`, runScripts: 'outside-only' });

  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
  dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
  dom.window.document.querySelector('[data-tag="requestIndexingButton"]').onclick = () => assert.fail('색인화 요청 금지');

  return dom;
}

// 응답 대기 중 로딩을 표시한 뒤 검사 대상 URL과 카드가 함께 갱신됩니다.
function respond(dom, message = indexed, resultUrl = target.url) {
  const doc = dom.window.document;

  doc.querySelector('[data-tag="inspectBtn"]').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', '<div id="inpsectionProgressTitle">검사 중</div>');
    setTimeout(() => {
      const url = new URL(dom.window.location.href);

      url.searchParams.set('urlToInspect', encodeURIComponent(resultUrl));
      dom.window.history.replaceState({}, '', url);
      doc.querySelector('#result').innerHTML = card(message);
      doc.querySelector('#inpsectionProgressTitle').remove();
    }, 1);
  };
}

test('사이트 범위를 정확히 비교하고 비밀번호·프래그먼트·다른 경로를 거부한다', () => {
  assert.equal(normalizeBingUrl('https://user:pass@one.example'), null);
  assert.equal(normalizeBingUrl(`${site}#fragment`), null);
  assert.equal(bingTargetInSite(`${site}blog`, `${site}blogger`), false);
  assert.equal(bingTargetInSite(`${site}blog/`, `${site}blog/post?x=1`), true);
  assert.equal(bingTargetInSite(site, 'https://two.example/post'), false);
});

test('왼쪽 메뉴에서 사이트 링크만 반환하고 합성 클릭은 실행하지 않는다', async () => {
  const dom = screen(); const doc = dom.window.document;

  doc.querySelector('.userSeletedSite').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', `<ul class="userSitesList" role="listbox"><li><a role="option" href="/webmasters/urlinspection?siteUrl=${encodeURIComponent(site)}">사이트 A</a></li></ul>`);
  };

  let clicked = 0;

  doc.addEventListener('click', (e) => { if (e.target.tagName === 'A') { e.preventDefault(); clicked += 1; } });

  try {
    const selection = await selectBingSite(doc, site, new AbortController().signal, 100);
    assert.equal(clicked, 0);
    assert.equal(selection.siteUrl, site);
    assert.equal(new URL(selection.destinationUrl).searchParams.get('siteUrl'), site);
    doc.querySelector('.userSeletedSite').setAttribute('aria-expanded', 'true');
    doc.querySelector('a').href = `https://evil.example/?siteUrl=${encodeURIComponent(site)}`;
    await assert.rejects(selectBingSite(doc, site, new AbortController().signal, 100), (e) => e.code === 'site_missing');
  } finally { dom.window.close(); }
});

test('새 Bing 색인 결과와 대표 URL을 읽으며 크롤링 성공과 색인을 구분한다', async () => {
  for (const message of [indexed, excluded, '처음 보는 판정']) {
    const dom = screen(card(indexed)); respond(dom, message);

    try {
      const result = await inspectBingUrl(dom.window.document, site, target.url, new AbortController().signal, 1000);
      assert.equal(result.indexStatus, message === indexed ? 'indexed' : message === excluded ? 'not_indexed' : 'unknown');
      assert.equal(result.canonicalUrl, `${site}canonical`);
      assert.equal(result.crawlStatus, 'succeeded');
      assert.equal(result.targetUrl, target.url);
      assert.equal(result.targetVerified, true);
    } finally { dom.window.close(); }
  }
});

test('이전 결과·다른 URL·라이브 URL 탭은 성공으로 반환하지 않는다', async () => {
  for (const mode of ['stale', 'wrong_target', 'live']) {
    const dom = screen(card());

    if (mode !== 'stale') respond(dom, indexed, mode === 'wrong_target' ? `${site}other` : target.url);

    if (mode === 'live') dom.window.document.querySelector('[data-tag="BingdexTab"]').setAttribute('aria-selected', 'false');

    try {
      await assert.rejects(inspectBingUrl(dom.window.document, site, target.url, new AbortController().signal, 40), (e) => e.code === (mode === 'live' ? 'page_changed' : 'timeout'));
    } finally { dom.window.close(); }
  }
});

test('동일 URL 재검사도 로딩 뒤 완료를 확인하고 취소·사이트 변경은 중단한다', async () => {
  const dom = screen(card()); respond(dom);
  dom.window.history.replaceState({}, '', `${BING_INSPECTION_URL}?siteUrl=${encodeURIComponent(site)}&urlToInspect=${encodeURIComponent(encodeURIComponent(target.url))}`);

  try { assert.equal((await inspectBingUrl(dom.window.document, site, target.url, new AbortController().signal, 1000)).indexStatus, 'indexed'); }
  finally { dom.window.close(); }

  for (const mode of ['cancel', 'site']) {
    const current = screen(); const abort = new AbortController();

    current.window.document.querySelector('[data-tag="inspectBtn"]').onclick = () => {
      if (mode === 'cancel') abort.abort();
      else current.window.history.replaceState({}, '', `${BING_INSPECTION_URL}?siteUrl=https://two.example/`);
    };

    try { await assert.rejects(inspectBingUrl(current.window.document, site, target.url, abort.signal, 100), (e) => e.code === (mode === 'cancel' ? 'cancelled' : 'page_changed')); }
    finally { current.window.close(); }
  }
});

// Chrome 메시지와 사이트 변경을 재현해 사이트별 실행 순서를 검증합니다.
function fakeClient() {
  let url = BING_INSPECTION_URL; const events = [];

  return { events, client: {
    get: async (id) => ({ id, url, status: 'complete' }),
    navigate: async (_, destination) => { url = destination; events.push(['navigate']); },
    send: async (_, request) => {
      let value;

      if (request.action === 'state') value = { route: 'inspection', siteUrl: normalizeBingUrl(new URL(url).searchParams.get('siteUrl') ?? ''), ready: true, documentToken: 'document' };

      if (request.action === 'select_site') { value = { siteUrl: request.siteUrl, destinationUrl: `${BING_INSPECTION_URL}?siteUrl=${encodeURIComponent(request.siteUrl)}` }; events.push(['select', request.siteUrl]); }

      if (request.action === 'inspect_url') {
        events.push(['inspect', request.targetUrl]);
        value = { kind: 'verified_bing_gui', siteUrl: request.siteUrl, targetUrl: request.targetUrl, indexStatus: 'indexed', message: indexed, reason: null, canonicalUrl: null, crawlStatus: 'unknown', lastCrawledText: null, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true };
      }

      return { requestId: request.requestId, ok: true, value };
    },
  } };
}

test('사이트 A의 URL들을 모두 검사한 다음 사이트 B의 확인된 링크로 이동한다', async () => {
  const fixture = fakeClient(); const results = [];
  const second = { ...target, id: 'p2', siteId: 's2', siteUrl: 'https://two.example/', url: 'https://two.example/post' };

  await runBingAutomation({ tabId: 7, engine: 'bing' }, [target, { ...target, id: 'p1-2', url: `${site}second` }, second], {
    signal: new AbortController().signal, onStart: () => {}, onResult: (item, result) => results.push([item.id, result.indexStatus]),
  }, fixture.client);
  assert.deepEqual(fixture.events, [['navigate'], ['select', site], ['navigate'], ['inspect', target.url], ['inspect', `${site}second`], ['select', second.siteUrl], ['navigate'], ['inspect', second.url]]);
  assert.equal(results.length, 3);
});

test('Bing은 비동기 결과 저장이 끝나기 전 다음 URL을 검사하지 않는다', async () => {
  const fixture = fakeClient();
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  let results = 0;
  const running = runBingAutomation({ tabId: 7, engine: 'bing' }, [target, { ...target, id: 'p2', url: `${site}second` }], {
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

test('취소 뒤 다음 URL을 실행하지 않고 응답의 대상·판정 위조를 거부한다', async () => {
  const fixture = fakeClient(); const abort = new AbortController();

  await assert.rejects(runBingAutomation({ tabId: 7, engine: 'bing' }, [target, { ...target, id: 'p2' }], {
    signal: abort.signal, onStart: () => {}, onResult: () => abort.abort(),
  }, fixture.client), (e) => e.code === 'cancelled');
  assert.equal(fixture.events.filter(([action]) => action === 'inspect').length, 1);

  for (const patch of [{ targetUrl: 'https://other.example/' }, { indexStatus: 'not_indexed' }, { canonicalUrl: 'javascript:alert(1)' }]) {
    const broken = fakeClient(); const original = broken.client.send;

    broken.client.send = async (...args) => {
      const response = await original(...args);
      return args[1].action === 'inspect_url' ? { ...response, value: { ...response.value, ...patch } } : response;
    };
    await assert.rejects(runBingAutomation({ tabId: 7, engine: 'bing' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => assert.fail('위조 결과') }, broken.client), (e) => e.code === 'invalid_response');
  }
});

// 배포용 IIFE 수신기에서 발신자·문서·작업 ID와 실제 비동기 검사까지 검증합니다.
test('Bing 수신기는 관리 페이지만 허용하고 이전 문서·취소 작업을 거부한다', async () => {
  const { build } = await import('vite');
  const { fileURLToPath } = await import('node:url');

  const dom = screen();
  let handler;

  dom.window.chrome = { runtime: { id: 'extension-id', getURL: () => 'chrome-extension://extension-id/index.html', onMessage: { addListener: (listener) => { handler = listener; } } } };

  try {
    const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: { entry: fileURLToPath(new URL('../src/engines/bing/content.ts', import.meta.url)), name: 'StartPressBingReader', formats: ['iife'] } } });

    const source = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output).find((item) => item.type === 'chunk').code;

    assert.ok(!/^import\s/m.test(source));
    dom.window.eval(source);

    const type = 'STARTPRESS_BING_AUTOMATION';
    const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' };
    let response;
    const receive = (value) => { response = value; };

    handler({ type, requestId: 'state', action: 'state' }, { ...sender, id: 'other' }, receive);
    handler({ type, requestId: 'state', action: 'state' }, { ...sender, url: 'https://evil.example/index.html' }, receive);
    assert.equal(response, undefined);
    handler({ type, requestId: 'state', action: 'state' }, sender, receive);

    const documentToken = response.value.documentToken;
    const request = { type, requestId: 'query', action: 'inspect_url', documentToken, siteUrl: site, targetUrl: target.url };

    handler({ ...request, documentToken: 'old-document' }, sender, receive);
    assert.equal(response.code, 'page_changed');
    handler({ type, requestId: 'cancel', action: 'cancel', operationId: 'query' }, sender, receive);
    handler(request, sender, receive);
    assert.equal(response.code, 'cancelled');
    respond(dom);
    const result = await new Promise((resolve) => {
      assert.equal(handler({ ...request, requestId: 'query-2' }, sender, resolve), true);
      handler({ ...request, requestId: 'query-3' }, sender, receive);
      assert.equal(response.code, 'busy');
    });
    assert.equal(result.ok, true);
    assert.equal(result.value.indexStatus, 'indexed');
  } finally { dom.window.close(); }
});


// 기존 검사가 진행 중이면 새 검사 버튼을 누르지 않습니다.
test('기존 Bing 검사 진행 중에는 새 요청을 시작하지 않는다', async () => {
  const dom = screen(card());

  dom.window.document.body.insertAdjacentHTML('beforeend', '<div id="inpsectionProgressTitle">검사 중</div>');
  dom.window.document.querySelector('[data-tag="inspectBtn"]').onclick = () => assert.fail('중복 검사 금지');

  try { await assert.rejects(inspectBingUrl(dom.window.document, site, target.url, new AbortController().signal, 100), (e) => e.code === 'busy'); }
  finally { dom.window.close(); }
});


// 메뉴가 먼저 열리고 사이트 항목이 나중에 렌더되는 실제 화면의 시차를 재현합니다.
test('Bing 사이트 메뉴의 빈 목록·지연 항목은 준비될 때까지 기다린다', async () => {
  const dom = screen();
  const doc = dom.window.document;
  let clicks = 0;
  doc.querySelector('.userSeletedSite').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', '<ul class="userSitesList" role="listbox"></ul>');
    dom.window.setTimeout(() => {
      doc.querySelector('ul').innerHTML = `<li><a role="option" href="/webmasters/urlinspection?siteUrl=${encodeURIComponent(site)}">사이트 A</a></li>`;
      doc.querySelector('a').onclick = (event) => { event.preventDefault(); clicks += 1; };
    }, 20);
  };
  try {
    const selection = await selectBingSite(doc, site, new AbortController().signal, 1000);
    assert.equal(selection.siteUrl, site);
    assert.equal(clicks, 0);
  } finally { dom.window.close(); }
});


// 합성 클릭이 무시되어도 검증된 사이트 링크로 탭을 이동해야 URL 검사가 진행됩니다.
test('사이트 선택 응답만으로 성공 처리하지 않고 실제 탭 이동 후 검사한다', async () => {
  const fixture = fakeClient();
  const destinations = [];
  const original = fixture.client.navigate;
  fixture.client.navigate = async (id, url) => { destinations.push(url); return original(id, url); };
  const stages = [];
  await runBingAutomation({ tabId: 7, engine: 'bing' }, [target], {
    signal: new AbortController().signal, onStart: () => {}, onStage: (_, stage) => stages.push(stage), onResult: () => {},
  }, fixture.client);
  assert.equal(destinations.length, 2);
  assert.equal(new URL(destinations[1]).searchParams.get('siteUrl'), site);
  assert.deepEqual(stages, ['inspection_page', 'site_menu', 'site_navigation', 'url_ready', 'url_result', 'result_check']);
});

// 콘텐츠 스크립트가 다른 출처·사이트·조회 명령을 반환해도 탭을 이동하지 않습니다.
test('사이트 선택의 변조된 이동 링크는 거부한다', async () => {
  for (const destinationUrl of ['https://evil.example/', `${BING_INSPECTION_URL}?siteUrl=https://other.example/`, `https://www.bing.com/webmasters/submiturl?siteUrl=${encodeURIComponent(site)}`, `${BING_INSPECTION_URL}?siteUrl=${encodeURIComponent(site)}&urlToInspect=other`]) {
    const fixture = fakeClient(); const original = fixture.client.send;
    fixture.client.send = async (id, request) => {
      const response = await original(id, request);
      return request.action === 'select_site' ? { ...response, value: { siteUrl: site, destinationUrl } } : response;
    };
    await assert.rejects(runBingAutomation({ tabId: 7, engine: 'bing' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => assert.fail('변조 결과') }, fixture.client), (e) => e.code === 'invalid_response');
    assert.equal(fixture.events.filter(([action]) => action === 'navigate').length, 1);
  }
});

// 같은 시간 초과 코드라도 목록·전환·결과 중 어느 단계인지 오류에 보존합니다.
test('시간 초과 오류는 사이트 목록·전환·검사 결과 단계를 구분한다', async () => {
  for (const stage of ['site_menu', 'site_navigation', 'url_result']) {
    const fixture = fakeClient();
    const originalSend = fixture.client.send; const originalNavigate = fixture.client.navigate;
    fixture.client.send = async (id, request) => {
      if ((stage === 'site_menu' && request.action === 'select_site') || (stage === 'url_result' && request.action === 'inspect_url')) throw new BingAutomationError('timeout');
      return originalSend(id, request);
    };
    fixture.client.navigate = async (id, url) => {
      if (stage === 'site_navigation' && new URL(url).searchParams.has('siteUrl')) throw new BingAutomationError('timeout');
      return originalNavigate(id, url);
    };
    await assert.rejects(runBingAutomation({ tabId: 7, engine: 'bing' }, [target], { signal: new AbortController().signal, onStart: () => {}, onResult: () => assert.fail('시간 초과') }, fixture.client), (e) => e.code === 'timeout' && e.stage === stage && e.message.includes('단계에서'));
  }
});


// 실제 Fluent UI는 부모 레이어를 hidden, 자식 메뉴를 visible로 재정의합니다.
test('부모 visibility가 hidden이어도 visible로 재정의한 Bing 메뉴를 읽는다', async () => {
  const dom = screen(); const doc = dom.window.document;
  doc.querySelector('.userSeletedSite').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', `<div class="ms-Layer" style="visibility:hidden"><div class="ms-Layer-content" style="visibility:visible"><ul class="userSitesList" role="listbox"><li><a role="option" href="/webmasters/urlinspection?siteUrl=${encodeURIComponent(site)}">사이트 A</a></li></ul></div></div>`);
  };
  try {
    const selection = await selectBingSite(doc, site, new AbortController().signal, 500);
    assert.equal(selection.siteUrl, site);
    assert.equal(new URL(selection.destinationUrl).searchParams.get('siteUrl'), site);
  } finally { dom.window.close(); }
});

// 자식 visibility 재정의와 관계없이 display:none인 부모 아래의 메뉴는 읽지 않습니다.
test('display none 부모 아래의 Bing 메뉴는 계속 제외한다', async () => {
  const dom = screen(); const doc = dom.window.document;
  doc.querySelector('.userSeletedSite').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', `<div style="display:none"><ul style="visibility:visible" class="userSitesList" role="listbox"><li><a role="option" href="/webmasters/urlinspection?siteUrl=${encodeURIComponent(site)}">사이트 A</a></li></ul></div>`);
  };
  try { await assert.rejects(selectBingSite(doc, site, new AbortController().signal, 40), (e) => e.code === 'timeout'); }
  finally { dom.window.close(); }
});
