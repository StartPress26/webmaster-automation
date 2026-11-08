import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const bundle = await build({
  configFile: false,
  logLevel: 'silent',
  build: { write: false, lib: { entry: fileURLToPath(new URL('../src/main.ts', import.meta.url)), name: 'StartPress', formats: ['iife'] } },
});
const script = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output).find((item) => item.type === 'chunk').code;
const clients = [{ id: 'a', name: '고객사 A', manager_name: '담당 A' }, { id: 'b', name: '고객사 B', manager_name: null }, { id: 'empty', name: '빈 고객사', manager_name: null }];
const sites = [{ id: 'a1', client_id: 'a', name: 'A 블로그', url: 'https://a.example/', owner_type: 'client', is_active: true }, { id: 'a2', client_id: 'a', name: 'A 두 번째 블로그', url: 'https://second.example/', owner_type: 'client', is_active: true }, { id: 'b1', client_id: 'b', name: 'B 블로그', url: 'https://b.example/', owner_type: 'client', is_active: true }];
const summary = { indexed: 0, not_indexed: 0, crawled: 0, submitted: 0, failed: 0, unknown: 0, error_count: 0, last_checked_at: null };

// 비동기 렌더가 끝날 때까지 DOM의 구체적인 조건을 기다립니다.
async function waitFor(condition) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (condition()) return;
    await delay(5);
  }

  assert.fail('기대한 DOM 상태가 표시되지 않았습니다.');
}

// 브라우저나 실제 API를 사용하지 않는 독립 DOM 실행 환경을 만듭니다.
async function workspace(override = () => undefined, query = '', chromeClient) {
  const dom = new JSDOM('<div id="app"></div>', { url: `http://localhost/${query}`, runScripts: 'outside-only' });
  const { window } = dom;

  window.matchMedia = () => ({ matches: false });
  window.CSS = { escape: (value) => value };

  if (chromeClient) window.chrome = chromeClient;

  const calls = [];

  window.fetch = async (url, options) => {
    calls.push({ url, options });

    const custom = override(url, options);
    if (custom !== undefined) return custom;

    const path = new URL(url, 'http://localhost');
    let data;

    if (path.pathname === '/api/clients') data = { items: clients };
    else if (path.pathname === '/api/sites') data = { items: sites.filter((site) => site.client_id === path.searchParams.get('client_id')) };
    else if (path.pathname.endsWith('/dashboard')) {
      const id = path.pathname.split('/')[3];
      const selectedSites = sites.filter((site) => site.client_id === id);
      data = { client: clients.find((client) => client.id === id), site_count: selectedSites.length, page_count: 0, google: summary, bing: summary, sites: selectedSites.map((site) => ({ ...site, page_count: 0, google: summary, bing: summary })) };
    } else if (path.pathname.endsWith('/indexnow-settings')) data = { configured: false, key_location: null };
    else if (path.pathname.endsWith('/pages') || path.pathname.endsWith('/inspections')) data = { items: [] };
    else throw new Error(`예상하지 않은 요청: ${url}`);

    return new Response(JSON.stringify(data));
  };
  window.eval(script);

  const document = window.document;

  await waitFor(() => document.querySelector('.dashboard-table'));

  // 선택 변경 이벤트를 실제 화면 요소에 전달합니다.
  const choose = (selector, value) => {
    const element = document.querySelector(selector);
    assert.ok(element, selector);
    element.value = value;
    element.dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  // 현재 렌더의 메뉴 버튼을 눌러 화면을 이동합니다.
  const navigate = (view) => document.querySelector(`[data-view="${view}"]`).click();

  return { dom, window, document, calls, choose, navigate };
}

test('첫 화면·고객사 전환·블로그 이동·빈 고객사 화면이 올바른 범위를 표시한다', async () => {
  const app = await workspace();

  try {
    const { document, choose, navigate, calls } = app;

    assert.equal(document.querySelector('#client-select').value, 'a');
    assert.ok(document.querySelector('h1').textContent.includes('고객사 A'));
    assert.equal(document.querySelectorAll('[data-dashboard-site]').length, 2);
    document.querySelector('[data-dashboard-site="a2"]').click();
    await waitFor(() => !document.querySelector('#inspection-target-select').disabled);
    assert.equal(document.querySelector('#property-select').value, 'a2');
    assert.deepEqual(Array.from(document.querySelector('#property-select').options, (option) => option.value), ['a1', 'a2']);
    choose('#client-select', 'b');
    await waitFor(() => document.querySelector('#property-select')?.value === 'b1');
    assert.deepEqual(Array.from(document.querySelector('#property-select').options, (option) => option.value), ['b1']);
    navigate('dashboard');
    await waitFor(() => document.querySelector('[data-dashboard-site="b1"]'));
    assert.ok(!document.querySelector('[data-dashboard-site="a1"]'));
    choose('#client-select', 'empty');
    await waitFor(() => document.querySelector('.main-content').textContent.includes('등록된 블로그가 없습니다.'));
    assert.equal(document.querySelectorAll('[data-dashboard-site]').length, 0);
    document.querySelector('.main-content [data-view="register"]').click();

    const clientField = document.querySelector('#registration-form input[readonly]');

    assert.equal(clientField.value, '빈 고객사');
    assert.ok(calls.every((call) => call.options.method === 'GET'));
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

test('고객사별 글 초안을 분리하고 블로그가 없는 고객사에는 이전 입력을 표시하지 않는다', async () => {
  const app = await workspace();

  try {
    const { document, choose, navigate } = app;

    navigate('notify');
    await waitFor(() => !document.querySelector('[name="titles"]').disabled);
    document.querySelector('[name="titles"]').value = 'A 고객사의 초안';
    document.querySelector('[name="urls"]').value = 'https://a.example/post';
    choose('#client-select', 'b');
    await waitFor(() => !document.querySelector('[name="titles"]').disabled);
    assert.equal(document.querySelector('[name="titles"]').value, '');
    document.querySelector('[name="titles"]').value = 'B 고객사의 초안';
    choose('#client-select', 'empty');
    assert.equal(document.querySelector('[name="titles"]').value, '');
    assert.ok(document.querySelector('[name="titles"]').disabled);
    choose('#client-select', 'a');
    await waitFor(() => !document.querySelector('[name="titles"]').disabled);
    assert.equal(document.querySelector('[name="titles"]').value, 'A 고객사의 초안');
    assert.equal(document.querySelector('[name="urls"]').value, 'https://a.example/post');
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

test('늦게 도착한 이전 고객사 통계는 현재 고객사의 화면을 덮어쓰지 않는다', async () => {
  let resolveOld;
  const oldResponse = new Promise((resolve) => { resolveOld = resolve; });

  const app = await workspace((url) => url === '/api/clients/b/dashboard' ? oldResponse : undefined);

  try {
    app.choose('#client-select', 'b');
    app.choose('#client-select', 'a');
    await waitFor(() => app.document.querySelector('[data-dashboard-site="a1"]'));
    resolveOld(new Response(JSON.stringify({ client: clients[1], sites: [], site_count: 99, page_count: 99, google: summary, bing: summary })));
    await delay(20);
    assert.equal(app.document.querySelector('#client-select').value, 'a');
    assert.ok(app.document.querySelector('[data-dashboard-site="a1"]'));
    assert.equal(app.document.querySelector('.dashboard-card p').textContent, '2개');
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

// 개별 글 선택과 관계없이 사이트 단위로 제출하며 중복 클릭을 막습니다.
test('사이트맵 버튼에서 Google·Bing 제출과 접수 안내까지 연결된다', async () => {
  let complete;
  const response = new Promise((resolve) => { complete = resolve; });

  const app = await workspace((url) => {
    if (url === '/api/sites/a1/sitemaps') return response;
    if (url.startsWith('/api/sites/a1/pages')) return new Response(JSON.stringify({ items: [{ id: 'page', name: '글', url: 'https://a.example/post', is_active: true }] }));
    return undefined;
  });

  try {
    const { document, window, calls } = app;

    app.navigate('inspect');
    await waitFor(() => document.querySelector('#inspection-target-select')?.options.length === 2);
    app.choose('#inspection-target-select', 'page');
    await waitFor(() => !document.querySelector('#read-inspection').disabled);
    document.querySelector('#toggle-sitemap').click();
    assert.equal(document.querySelector('#toggle-sitemap').getAttribute('aria-expanded'), 'true');
    assert.equal(document.querySelector('#sitemap-panel').hidden, false);
    document.querySelector('[data-engine="bing"]').click();

    const input = document.querySelector('#sitemap-url');

    input.value = 'https://a.example/custom-sitemap.xml';

    const form = document.querySelector('#sitemap-form');

    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    assert.ok(document.querySelector('#sitemap-form button[type="submit"]').disabled);

    const submissions = calls.filter((call) => call.url.endsWith('/sitemaps'));

    assert.equal(submissions.length, 1);
    assert.deepEqual(JSON.parse(submissions[0].options.body), { engine: 'bing', sitemap_url: input.value });
    complete(new Response(JSON.stringify({ main_site_id: 'a1', engine: 'bing', sitemap_url: input.value, status: 'accepted' })));
    await waitFor(() => document.querySelector('.sitemap-feedback')?.textContent.includes('Bing 사이트맵 제출 접수 완료'));
    assert.ok(document.querySelector('.sitemap-feedback').textContent.includes('수집·색인 반영에는 시간'));
    assert.equal(document.querySelector('#sitemap-url').value, input.value);
    document.querySelector('[data-engine="google"]').click();
    assert.equal(document.querySelector('.sitemap-feedback'), null);
    document.querySelector('[data-engine="naver"]').click();
    assert.ok(document.querySelector('#toggle-sitemap').disabled);
    assert.ok(document.querySelector('#sitemap-panel').hidden);
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

// 오류 이후 URL을 유지하고 재전송 없이 접수 불확실성을 표시합니다.
test('사이트맵 실패는 입력을 유지하고 다른 사이트에 결과를 표시하지 않는다', async () => {
  const app = await workspace((url) => url.endsWith('/sitemaps') ? Promise.reject(new TypeError('network')) : undefined);

  try {
    const { document, window, calls } = app;

    app.navigate('inspect');
    document.querySelector('#toggle-sitemap').click();
    document.querySelector('#sitemap-url').value = 'https://a.example/my-sitemap.xml';
    document.querySelector('#sitemap-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => document.querySelector('.sitemap-feedback')?.textContent.includes('접수 여부를 확인하지 못했습니다'));
    assert.equal(document.querySelector('#sitemap-url').value, 'https://a.example/my-sitemap.xml');
    assert.equal(calls.filter((call) => call.url.endsWith('/sitemaps')).length, 1);
    app.choose('#property-select', 'a2');
    assert.equal(document.querySelector('.sitemap-feedback'), null);
    assert.equal(document.querySelector('#sitemap-url').value, 'https://second.example/sitemap.xml');
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

// 다른 도메인 주소는 제출하지 않고 입력 수정을 안내합니다.
test('사이트맵의 다른 도메인 주소는 클라이언트에서 차단한다', async () => {
  const app = await workspace();

  try {
    app.navigate('inspect');
    app.document.querySelector('#toggle-sitemap').click();
    app.document.querySelector('#sitemap-url').value = 'https://other.example/sitemap.xml';
    app.document.querySelector('#sitemap-form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => app.document.querySelector('.sitemap-feedback'));
    assert.ok(app.document.querySelector('.sitemap-feedback').textContent.includes('같은 도메인'));
    assert.equal(app.calls.filter((call) => call.url.endsWith('/sitemaps')).length, 0);
  } finally {
    await delay(0);
    app.dom.window.close();
  }
});

// 예시 제출은 성공 접수로 오해하지 않게 표시하고 외부 요청을 보내지 않습니다.
test('예시 모드의 사이트맵 제출은 API를 호출하지 않는다', async () => {
  const app = await workspace(undefined, '?mode=demo');

  try {
    app.navigate('inspect');
    app.document.querySelector('#toggle-sitemap').click();
    app.document.querySelector('#sitemap-form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => app.document.querySelector('.sitemap-feedback'));
    assert.ok(app.document.querySelector('.sitemap-feedback').textContent.includes('실제 사이트맵 제출은 실행하지 않았습니다'));
    assert.equal(app.calls.length, 0);
  } finally {
    app.dom.window.close();
  }
});

// 블로그·엔진 필터와 관계없이 현재 고객사의 전체 URL을 API로 순차 조회합니다.
test('고객사 전체 조회는 모든 소속 사이트 API를 실행하고 탭을 건너뛴 GUI는 미실행으로 남긴다', async () => {
  const app = await workspace((url, options) => {
    if (options.method === 'POST' && url.endsWith('/inspections')) return new Response(JSON.stringify({ site_id: url.split('/')[3], engine: JSON.parse(options.body).engine, index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }));
  });

  try {
    app.navigate('inspect');
    app.choose('#property-select', 'a2');
    app.document.querySelector('[data-engine="naver"]').click();
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    assert.equal(app.document.querySelectorAll('#refresh-index').length, 1);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#continue-api-only'));
    app.document.querySelector('#continue-api-only').click();
    await waitFor(() => app.document.querySelector('#client-inspection-progress')?.textContent.includes('처리가 끝났습니다'));

    const posts = app.calls.filter((call) => call.options.method === 'POST');

    assert.deepEqual(posts.map((call) => [call.url, JSON.parse(call.options.body).engine]), [
      ['/api/sites/a1/inspections', 'google'], ['/api/sites/a1/inspections', 'bing'],
      ['/api/sites/a2/inspections', 'google'], ['/api/sites/a2/inspections', 'bing'],
    ]);
    assert.ok(app.document.querySelector('#client-inspection-progress [aria-label="GUI 관측 0건"]'));
    assert.equal(app.document.querySelector('#work-tab-form'), null);
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
  } finally { await delay(0); app.dom.window.close(); }
});

// 고객사 전환은 실행 대상을 바꾸지 않고 이전 고객사의 결과를 새 화면에 섞지 않습니다.
test('실행 중 고객사를 바꿔도 시작 고객사를 유지하고 취소는 다음 요청부터 적용한다', async () => {
  let finish;

  const app = await workspace((url, options) => {
    if (options.method === 'POST') return new Promise((resolve) => { finish = () => resolve(new Response(JSON.stringify({ site_id: 'a1', engine: 'google', index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }))); });
  });

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#continue-api-only'));
    app.document.querySelector('#continue-api-only').click();
    await waitFor(() => finish);
    app.choose('#client-select', 'b');
    assert.ok(app.document.querySelector('#refresh-index').disabled);
    assert.equal(app.document.querySelector('#client-inspection-progress'), null);
    app.document.querySelector('#cancel-client-inspection').click();
    finish();
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    assert.equal(app.calls.filter((call) => call.options.method === 'POST').length, 1);
    app.choose('#client-select', 'a');
    assert.match(app.document.querySelector('#client-inspection-progress').textContent, /취소했습니다/);
  } finally { await delay(0); app.dom.window.close(); }
});

// 네이버 다중 탭 선택과 Bing 단일 탭 자동 준비를 전체 실행 UI에서 연결합니다.
test('전체 조회는 엔진별 탭 선택 후 재검증하고 필터 변경에도 실행의 선택을 유지한다', async () => {
  const tabs = [
    { id: 1, title: '네이버 A', url: 'https://searchadvisor.naver.com/console/site/summary?a', status: 'complete' },
    { id: 2, title: '네이버 B', url: 'https://searchadvisor.naver.com/console/site/summary?b', status: 'complete' },
    { id: 3, title: 'Bing', url: 'https://www.bing.com/webmasters/', status: 'complete' },
  ];
  const checked = [];

  const app = await workspace((url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify({ site_id: url.split('/')[3], engine: JSON.parse(options.body).engine, index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }));
  }, '', { tabs: { query: async () => tabs, get: async (id) => { checked.push(id); return tabs.find((tab) => tab.id === id); } } });

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#work-tab-naver-form') && !app.document.querySelector('.work-tab-preparation').disabled);
    assert.equal(app.calls.filter((call) => call.options.method === 'POST').length, 0);
    assert.equal(app.document.querySelectorAll('#work-tab-naver-select option').length, 3);
    assert.match(app.document.querySelector('#work-tab-bing-message').textContent, /탭 준비됨/);
    app.choose('#property-select', 'a2');
    app.document.querySelector('[data-engine="bing"]').click();
    await waitFor(() => !app.document.querySelector('.work-tab-preparation').disabled);
    assert.match(app.document.querySelector('#work-tab-bing-message').textContent, /탭 준비됨/);
    app.choose('#work-tab-naver-select', '2');
    app.document.querySelector('#work-tab-naver-form').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    await waitFor(() => app.document.querySelector('#client-inspection-progress').textContent.includes('처리가 끝났습니다'));
    assert.deepEqual(checked.slice(0, 2), [3, 2]);
    assert.equal(app.calls.filter((call) => call.options.method === 'POST').length, 4);
    assert.match(app.document.querySelector('#work-tab-naver-message').textContent, /GUI 조회·저장은 아직/);
    assert.ok(app.document.querySelector('.work-tab-preparation').disabled);
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
  } finally { await delay(0); app.dom.window.close(); }
});

// 엔진마다 하나씩이면 선택 폼 없이 검증 후 실행하고 탭 조작 API는 사용하지 않습니다.
test('전체 조회는 엔진별 단일 탭을 자동 선택하고 API 실행을 이어간다', async () => {
  const tabs = [
    { id: 1, title: '네이버', url: 'https://searchadvisor.naver.com/console/', status: 'complete' },
    { id: 2, title: 'Bing', url: 'https://www.bing.com/webmasters/', status: 'complete' },
  ];
  const checked = [];

  const app = await workspace((url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify({ site_id: url.split('/')[3], engine: JSON.parse(options.body).engine, index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }));
  }, '', { tabs: { query: async () => tabs, get: async (id) => { checked.push(id); return tabs.find((tab) => tab.id === id); } } });

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#client-inspection-progress')?.textContent.includes('처리가 끝났습니다'));
    assert.deepEqual(checked.slice(0, 2), [1, 2]);
    assert.equal(app.document.querySelector('[data-work-tab-engine]'), null);
    assert.equal(app.document.querySelector('#continue-api-only'), null);
    assert.ok(app.document.querySelector('#client-inspection-progress [aria-label="GUI 관측 0건"]'));
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
  } finally { await delay(0); app.dom.window.close(); }
});

// 화면 관측을 읽어도 색인 저장 API나 전체 완료 수를 변경하지 않습니다.
test('선택한 네이버 화면은 현재 실행의 미리보기로만 표시한다', async () => {
  const pageUrl = 'https://searchadvisor.naver.com/console/site/check/inspection?site=https%3A%2F%2Fa.example';
  const tab = { id: 1, title: '네이버 색인 상태 확인', url: pageUrl, status: 'complete' };
  let reads = 0;

  const app = await workspace(undefined, '', { tabs: {
    query: async () => [tab], get: async () => tab,
    sendMessage: async (id, request, options) => {
      reads += 1;
      assert.equal(id, 1);
      assert.equal(options.frameId, 0);

      return { requestId: request.requestId, result: { ok: true, observation: {
        kind: 'visible_preview', siteUrl: 'https://a.example/', inputUrl: 'https://a.example/', indexStatus: 'indexed',
        message: '문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.', engineUpdatedText: '최종 업데이트 26. 10. 29.', readAt: '2026-11-08T05:00:00Z', targetVerified: false,
      } } };
    },
  } });

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#read-naver-preview') && !app.document.querySelector('#read-naver-preview').disabled);
    app.document.querySelector('#read-naver-preview').click();
    await waitFor(() => app.document.querySelector('.naver-preview-facts'));
    assert.equal(reads, 1);
    assert.match(app.document.querySelector('.naver-preview').textContent, /입력 URL의 연결·최신 조회 여부는 아직 검증하지 않았습니다/);
    assert.equal(app.calls.filter((call) => call.options.method !== 'GET').length, 0);
    assert.ok(app.document.querySelector('[aria-label="관측 저장 0건"]'));
    app.document.querySelector('#cancel-client-inspection').click();
  } finally { await delay(0); app.dom.window.close(); }
});

// 실제 전체 실행 진입점에서 네이버 작업을 더 이상 건너뛰지 않는지 검증합니다.
test('전체 조회 버튼은 네이버 사이트별 URL 조회를 실행하고 마지막에 목록으로 복귀한다', async () => {
  let naverUrl = 'https://searchadvisor.naver.com/console/board';
  const inspected = [];
  const chromeClient = { tabs: {
    query: async () => [{ id: 1, title: '네이버', url: naverUrl, status: 'complete' }, { id: 2, title: 'Bing', url: 'https://www.bing.com/webmasters/', status: 'complete' }],
    get: async (id) => ({ id, url: id === 1 ? naverUrl : 'https://www.bing.com/webmasters/', status: 'complete' }),
    update: async (id, value) => { assert.equal(id, 1); naverUrl = value.url; return { id, url: naverUrl }; },
    sendMessage: async (id, request) => {
      assert.equal(id, 1);

      const url = new URL(naverUrl);
      let value;

      if (request.action === 'state') value = { route: url.pathname.endsWith('/board') ? 'board' : url.pathname.endsWith('/summary') ? 'summary' : 'inspection', siteUrl: url.searchParams.has('site') ? new URL(url.searchParams.get('site')).href : null, ready: true, documentToken: 'doc' };

      if (request.action === 'select_site') naverUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(request.siteUrl)}`;

      if (request.action === 'inspect_url') { inspected.push(request.targetUrl); value = { kind: 'verified_gui', siteUrl: request.siteUrl, targetUrl: request.targetUrl, indexStatus: 'unknown', message: 'URL 검사 결과가 없습니다.', queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true }; }

      return { requestId: request.requestId, ok: true, value };
    },
  } };

  const app = await workspace((url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify({ site_id: url.split('/')[3], engine: JSON.parse(options.body).engine, index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }));
    if (url.startsWith('/api/sites/a1/pages')) return new Response(JSON.stringify({ items: [{ id: 'p1', client_id: 'a', parent_site_id: 'a1', name: '등록 글', url: 'https://a.example/post', is_active: true }] }));
  }, '', chromeClient);

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#client-inspection-progress')?.textContent.includes('처리가 끝났습니다'));
    assert.deepEqual(inspected, ['https://a.example/', 'https://a.example/post', 'https://second.example/']);
    assert.equal(new URL(naverUrl).pathname, '/console/board');
    assert.match(app.document.querySelector('#client-inspection-progress').textContent, /네이버 GUI 관측 3\/3건/);
    assert.equal(app.document.querySelectorAll('.inspection-result-status.observed').length, 3);
    assert.ok(app.calls.filter((call) => call.options.method === 'POST').every((call) => JSON.parse(call.options.body).engine !== 'naver'));
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
  } finally { await delay(0); app.dom.window.close(); }
});

// Bing API 크롤링 저장과 Bing GUI 색인 관측이 전체 화면에서 분리되는지 검증합니다.
test('전체 조회는 Bing 사이트를 바꿔 URL들을 검사하고 API 저장과 GUI 결과를 따로 표시한다', async () => {
  let bingUrl = 'https://www.bing.com/webmasters/';
  const events = [];
  const chromeClient = { tabs: {
    query: async () => [{ id: 1, title: '네이버', url: 'https://searchadvisor.naver.com/console/', status: 'complete' }, { id: 2, title: 'Bing', url: bingUrl, status: 'complete' }],
    get: async (id) => ({ id, url: id === 2 ? bingUrl : 'https://searchadvisor.naver.com/console/', status: 'complete' }),
    update: async (id, patch) => { if (id !== 2) throw new Error('네이버 생략'); bingUrl = patch.url; return { id, url: bingUrl }; },
    sendMessage: async (id, request) => {
      assert.equal(id, 2);

      let value;

      if (request.action === 'state') value = { route: 'inspection', siteUrl: new URL(bingUrl).searchParams.get('siteUrl'), ready: true, documentToken: 'doc' };

      if (request.action === 'select_site') { events.push(['select', request.siteUrl]); value = { siteUrl: request.siteUrl, destinationUrl: `https://www.bing.com/webmasters/urlinspection?siteUrl=${encodeURIComponent(request.siteUrl)}` }; }

      if (request.action === 'inspect_url') {
        events.push(['inspect', request.targetUrl]);
        value = { kind: 'verified_bing_gui', siteUrl: request.siteUrl, targetUrl: request.targetUrl, indexStatus: 'indexed', message: '색인화되었습니다.', canonicalUrl: null, reason: null, crawlStatus: 'succeeded', lastCrawledText: null, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true };
      }

      return { requestId: request.requestId, ok: true, value };
    },
  } };

  const app = await workspace((url, options) => {
    if (options.method === 'POST') return new Response(JSON.stringify({ site_id: url.split('/')[3], engine: JSON.parse(options.body).engine, index_status: 'unknown', last_checked_at: null, next_check_at: null, error_message: null }));
    if (url.startsWith('/api/sites/a1/pages')) return new Response(JSON.stringify({ items: [{ id: 'p1', client_id: 'a', parent_site_id: 'a1', name: '등록 글', url: 'https://a.example/post', is_active: true }] }));
  }, '', chromeClient);

  try {
    app.navigate('inspect');
    await waitFor(() => !app.document.querySelector('#refresh-index').disabled);
    app.document.querySelector('#refresh-index').click();
    await waitFor(() => app.document.querySelector('#client-inspection-progress')?.textContent.includes('처리가 끝났습니다'));
    assert.deepEqual(events, [['select', 'https://a.example/'], ['inspect', 'https://a.example/'], ['inspect', 'https://a.example/post'], ['select', 'https://second.example/'], ['inspect', 'https://second.example/']]);
    assert.match(app.document.querySelector('#client-inspection-progress').textContent, /Bing GUI 관측 3\/3건/);
    assert.equal(app.document.querySelectorAll('.inspection-result-status.partial').length, 3);
    assert.equal(app.document.querySelectorAll('.inspection-result-status.observed').length, 3);
    assert.match(app.document.querySelector('.inspection-results-table').textContent, /Bing API/);
    assert.match(app.document.querySelector('.inspection-results-table').textContent, /Bing GUI/);
  } finally { await delay(0); app.dom.window.close(); }
});
