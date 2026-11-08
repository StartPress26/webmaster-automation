import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  ];
  const data = demoDashboard(client, properties, rows);

  assert.equal(data.site_count, 2);
  assert.equal(data.page_count, 2);
  assert.equal(data.google.indexed, 1);
  assert.equal(data.google.unknown, 1);
  assert.equal(data.bing.crawled, 1);
  assert.equal(data.bing.indexed, 0);

  const html = dashboardContent(data);

  assert.ok(html.includes('&lt;블로그 A&gt;'));
  assert.ok(!html.includes('<블로그 A>'));
  assert.ok(!html.includes('b.example'));
  assert.ok(html.includes('data-dashboard-site="a2"'));
});

test('블로그가 없는 고객사는 사이트 등록 안내를 제공한다', () => {
  const data = demoDashboard({ id: 'empty', name: '빈 고객사', manager: '' }, properties, []);
  assert.equal(data.page_count, 0);
  assert.ok(dashboardContent(data).includes('data-view="register"'));
});
