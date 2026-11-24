import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, ApiError } from '../src/api.ts';

const page = { id: 'p1', client_id: 'c1', parent_site_id: 's1', target_type: 'page',
  is_active: true, name: '기존 글', url: 'https://one.example/post' };
const submission = { status: 'accepted', error_code: null, upstream_http_status: 200 };

test('기존 글 재알림은 글을 생성하지 않고 지정 endpoint로 한 번 POST한다', async () => {
  const calls = [];
  const api = createApi(async (url, options) => {
    calls.push([url, options]);
    return new Response(JSON.stringify({ page, submission }));
  });
  const result = await api.notifyPage('s1', page);
  assert.equal(result.submission.status, 'accepted');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/sites/s1/pages/p1/notifications');
  assert.equal(calls[0][1].method, 'POST');
  assert.deepEqual(JSON.parse(calls[0][1].body), { expected_url: page.url });
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
});

test('기존 글 재알림 응답의 대상·부모·고객사·활성·접수 상태 변조를 거부한다', async () => {
  for (const patch of [{ id: 'other' }, { client_id: 'other' }, { parent_site_id: 'other' },
    { target_type: 'site' }, { is_active: false }, { url: 'https://one.example/other' }]) {
    const api = createApi(async () => new Response(JSON.stringify({ page: { ...page, ...patch }, submission })));
    await assert.rejects(api.notifyPage('s1', page), (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
  }
});

test('기존 글 재알림의 통신 실패와 권한 오류는 재시도하지 않는다', async () => {
  for (const mode of ['network', 'permission']) {
    let calls = 0;
    const api = createApi(async () => {
      calls += 1;
      if (mode === 'network') throw new TypeError('offline');
      return new Response(JSON.stringify({ detail: { code: 'SITE_INACTIVE', message: '비활성' } }), { status: 409 });
    });
    await assert.rejects(api.notifyPage('s1', page), (error) => mode === 'network' ? error.status === 0 : error.code === 'SITE_INACTIVE');
    assert.equal(calls, 1);
  }
});
