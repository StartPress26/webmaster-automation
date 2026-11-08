import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.ts';

// 제출 요청의 경로·본문과 접수 결과를 검증합니다.
test('사이트맵은 메인 사이트 ID와 선택 엔진으로 한 번 제출한다', async () => {
  let calls = 0;
  const api = createApi(async (url, options) => {
    calls += 1;
    assert.equal(url, '/api/sites/site%2Fid/sitemaps');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { engine: 'bing', sitemap_url: 'https://example.com/sitemap.xml' });

    return new Response(JSON.stringify({ main_site_id: 'site/id', engine: 'bing', sitemap_url: 'https://example.com/sitemap.xml', status: 'accepted' }));
  });

  assert.equal((await api.submitSitemap('site/id', 'bing', 'https://example.com/sitemap.xml')).status, 'accepted');
  assert.equal(calls, 1);
});

// 다른 대상·엔진·주소의 결과를 성공으로 표시하지 않습니다.
test('사이트맵 접수 응답의 대상·엔진·주소·상태를 확인한다', async () => {
  const result = { main_site_id: 'site', engine: 'google', sitemap_url: 'https://example.com/sitemap.xml', status: 'accepted' };

  for (const invalid of [{ main_site_id: 'other' }, { engine: 'bing' }, { sitemap_url: 'https://other.com/sitemap.xml' }, { status: 'indexed' }]) {
    const api = createApi(async () => new Response(JSON.stringify({ ...result, ...invalid })));
    await assert.rejects(api.submitSitemap('site', 'google', result.sitemap_url), (error) => error.code === 'INVALID_RESPONSE' && error.operation === 'submit');
  }
});

// 통신 실패는 결과 불확실 오류를 한 번 반환하며 자동 제출하지 않습니다.
test('사이트맵 통신 오류는 자동 재전송하지 않는다', async () => {
  let calls = 0;
  const api = createApi(async () => { calls += 1; throw new TypeError('network'); });
  await assert.rejects(api.submitSitemap('site', 'google', 'https://example.com/sitemap.xml'), (error) => error.code === 'NETWORK_ERROR' && error.operation === 'submit');
  assert.equal(calls, 1);
});
