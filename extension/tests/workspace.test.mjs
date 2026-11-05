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
async function workspace(override = () => undefined, query = '') {
  const dom = new JSDOM('<div id="app"></div>', { url: `http://localhost/${query}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: false });
  window.CSS = { escape: (value) => value };
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
