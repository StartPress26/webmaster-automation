import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createApi } from '../src/api.ts';
import { clientProperties, clientSelection, dashboardContent, demoDashboard } from '../src/dashboard.ts';

const properties = [
  { id: 'a1', clientId: 'a', name: '<블로그 A>', siteUrl: 'https://a.example/', active: true },
  { id: 'a2', clientId: 'a', name: '두 번째 블로그', siteUrl: 'https://second.example/', active: false },
  { id: 'b1', clientId: 'b', name: '블로그 B', siteUrl: 'https://b.example/', active: true },
];

test('고객사 전환은 이전 고객사 사이트를 제거하고 소속 사이트만 선택한다', () => {
  assert.deepEqual(clientProperties(properties, 'a').map((site) => site.id), ['a1', 'a2']);
  assert.deepEqual(clientSelection(properties, 'b', 'a2'), { clientId: 'b', propertyId: 'b1' });
  assert.deepEqual(clientSelection(properties, 'a', 'a2'), { clientId: 'a', propertyId: 'a2' });
  assert.deepEqual(clientSelection(properties, 'empty', 'b1'), { clientId: 'empty', propertyId: '' });
});

test('대시보드는 선택 고객사 ID로 GET만 요청한다', async () => {
  let calls = 0;
  const api = createApi(async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/clients/client%2Fid/dashboard');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);

    return new Response(JSON.stringify({ client: { id: 'client/id' }, sites: [] }));
  });

  assert.equal((await api.getDashboard('client/id')).client.id, 'client/id');
  assert.equal(calls, 1);
});

test('예시 통계는 고객사·메인페이지를 분리하며 Bing 크롤링을 색인으로 바꾸지 않는다', () => {
  const client = { id: 'a', name: '고객사 A', manager: '담당자' };
  const rows = [
    { propertyId: 'a1', path: '/', engine: 'google', status: 'indexed' },
    { propertyId: 'a1', path: '/post', engine: 'google', status: 'indexed' },
    { propertyId: 'a1', path: '/post', engine: 'bing', status: 'crawled' },
    { propertyId: 'a1', path: '/pending', engine: 'google', status: 'waiting' },
    { propertyId: 'b1', path: '/other', engine: 'google', status: 'indexed' },
    { propertyId: 'a1', path: '/', engine: 'naver', status: 'indexed' },
    { propertyId: 'a1', path: '/post', engine: 'naver', status: 'indexed' },
    { propertyId: 'a1', path: '/pending', engine: 'naver', status: 'waiting' },
    { propertyId: 'b1', path: '/other', engine: 'naver', status: 'indexed' },
  ];
  const data = demoDashboard(client, properties, rows);

  assert.equal(data.site_count, 2);
  assert.equal(data.page_count, 2);
  assert.equal(data.google.indexed, 1);
  assert.equal(data.google.unknown, 1);
  assert.equal(data.bing.crawled, 1);
  assert.equal(data.bing.indexed, 0);
  assert.equal(data.naver.indexed, 1);
  assert.equal(data.naver.unknown, 1);
  assert.equal(data.naver.not_indexed, 0);

  const html = dashboardContent(data);

  assert.ok(html.includes('&lt;블로그 A&gt;'));
  assert.ok(!html.includes('<블로그 A>'));
  assert.ok(!html.includes('b.example'));
  assert.ok(html.includes('data-dashboard-site="a2"'));
  assert.ok(html.includes('네이버 · 등록 글 상태'));
  assert.ok(html.includes('네이버 색인 확인'));
  assert.ok(!html.includes('네이버 대시보드 집계는 아직 지원하지 않습니다'));
});

test('블로그가 없는 고객사는 사이트 등록 안내를 제공한다', () => {
  const data = demoDashboard({ id: 'empty', name: '빈 고객사', manager: '' }, properties, []);
  assert.equal(data.page_count, 0);
  assert.equal(data.naver.unknown, 0);
  assert.ok(dashboardContent(data).includes('data-view="register"'));
});

// 엔진별 순서를 통일하고 Bing 카드·표가 크롤링 건수를 색인 건수로 표시하지 않게 합니다.
test('세 엔진은 같은 상태 순서를 사용하고 Bing 카드와 표는 색인 건수를 표시한다', () => {
  const data = demoDashboard({ id: 'a', name: 'A', manager: '' }, properties.slice(0, 1), []);
  const summary = {
    indexed: 1, not_indexed: 2, crawled: 3, submitted: 4, unknown: 5, failed: 6,
    error_count: 0, last_checked_at: null,
  };
  const updated = {
    ...data, page_count: 21, google: summary, naver: summary, bing: summary,
    sites: data.sites.map((site) => ({ ...site, page_count: 21, google: summary, naver: summary, bing: summary })),
  };
  const dom = new JSDOM(dashboardContent(updated));
  try {
    const document = dom.window.document;
    const reports = document.querySelectorAll('.dashboard-engine');
    assert.equal(reports.length, 3);
    for (const report of reports) {
      assert.deepEqual(Array.from(report.querySelectorAll('dt'), (item) => item.textContent), [
        '색인 확인', '미색인 확인', '크롤링 확인 · 색인 미확인',
        '알림 접수 · 이후 미확인', '미확인', '처리 오류 상태',
      ]);
      assert.deepEqual(Array.from(report.querySelectorAll('dd'), (item) => item.textContent), ['1개', '2개', '3개', '4개', '5개', '6개']);
    }
    const bingCard = Array.from(document.querySelectorAll('.dashboard-card')).find((card) => card.querySelector('h2').textContent === 'Bing 색인 확인');
    assert.equal(bingCard.querySelector('p').textContent, '1개');
    const table = document.querySelector('.dashboard-table:not(.main-page-table)');
    assert.equal(table.querySelectorAll('thead th')[4].textContent, 'Bing 색인 확인');
    assert.equal(table.querySelectorAll('tbody td')[4].textContent, '1개');
  } finally { dom.window.close(); }
});

// 메인 관측은 글 수와 섞이지 않고 조회 시각·오류를 안전하게 표시합니다.
test('메인 사이트는 엔진별 상태와 최근 오류를 글 통계와 별도로 표시한다', () => {
  const data = demoDashboard({ id: 'a', name: 'A', manager: '' }, properties, []);
  const observation = {
    site_id: 'a1', engine: 'google', index_status: 'indexed',
    last_checked_at: '2026-11-16T01:00:00Z', error_message: '<최근 오류>', error_code: 'ENGINE_TIMEOUT',
  };
  const updated = { ...data, sites: data.sites.map((site) => ({ ...site, main_page: {
    google: observation, naver: null, bing: { ...observation, engine: 'bing', index_status: 'crawled', error_message: null },
  } })) };
  const document = new JSDOM(dashboardContent(updated)).window.document;
  const row = document.querySelector('[data-main-site="a1"]');
  assert.match(row.textContent, /https:\/\/a.example\//);
  assert.match(row.textContent, /색인 확인/);
  assert.match(row.textContent, /크롤링 확인 · 색인 미확인/);
  assert.match(row.textContent, /미확인 · 검사 기록 없음/);
  assert.match(row.textContent, /최근 조회 오류: <최근 오류>/);
  assert.equal(row.querySelectorAll('script').length, 0);
  assert.match(row.innerHTML, /&lt;최근 오류&gt;/);
  assert.match(row.textContent, /2026/);
  assert.equal(updated.page_count, 0);
  assert.equal(updated.google.indexed, 0);
});

// 성공 관측이 없는 상태와 이전 서버의 필드 누락을 서로 구분합니다.
test('미관측 메인 상태와 서버 응답 누락을 색인 확인으로 표시하지 않는다', () => {
  const data = demoDashboard({ id: 'a', name: 'A', manager: '' }, properties, []);
  const updated = { ...data, sites: data.sites.map((site, index) => {
    const { main_page, ...legacy } = site;
    return index ? legacy : { ...site, main_page: {
      google: { index_status: 'indexed', last_checked_at: null, error_message: '첫 조회 실패' }, naver: null, bing: null,
    } };
  }) };
  const document = new JSDOM(dashboardContent(updated)).window.document;
  const row = document.querySelector('[data-main-site="a1"]');
  assert.match(row.textContent, /미확인/);
  assert.ok(!row.querySelector('.main-page-status').textContent.includes('색인 확인'));
  assert.match(row.textContent, /첫 조회 실패/);
  assert.match(document.querySelector('[data-main-site="a2"]').textContent, /서버 업데이트/);
});

// 예시 모드도 메인 관측을 유지하면서 글 통계에서 제외합니다.
test('예시 메인 상태는 엔진별 최신 관측을 표시하고 대기 상태는 미확인으로 둔다', () => {
  const data = demoDashboard({ id: 'a', name: 'A', manager: '' }, properties, [
    { propertyId: 'a1', path: '/', engine: 'google', status: 'not_indexed', checkedAt: '2026-11-15T01:00:00Z' },
    { propertyId: 'a1', path: '/', engine: 'google', status: 'indexed', checkedAt: '2026-11-16T01:00:00Z' },
    { propertyId: 'a1', path: '/', engine: 'naver', status: 'waiting', checkedAt: '2026-11-16T01:00:00Z' },
  ]);
  assert.equal(data.sites[0].main_page.google.index_status, 'indexed');
  assert.equal(data.sites[0].main_page.naver, null);
  assert.equal(data.sites[0].main_page.bing, null);
  assert.equal(data.page_count, 0);
  assert.equal(data.google.indexed, 0);
});
