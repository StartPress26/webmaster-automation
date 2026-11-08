import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/api.ts';

const payload = {
  engine: 'bing',
  site_url: 'https://example.com/',
  target_url: 'https://example.com/post',
  index_status: 'indexed',
  queried_at: '2026-11-08T03:00:00Z',
  observed_at: '2026-11-08T03:00:02Z',
};

const stored = {
  site_id: 'page-id',
  engine: 'bing',
  index_status: 'indexed',
  last_checked_at: payload.observed_at,
  next_check_at: null,
  error_message: null,
  error_code: null,
};

// 외부 통신 없이 GUI 저장 응답을 생성합니다.
function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

for (const engine of ['naver', 'bing']) {
  test(`${engine} GUI 관측을 서버 필드 그대로 POST하고 결과를 반환한다`, async () => {
    const body = { ...payload, engine };
    const result = { ...stored, engine, site_id: 'page/id' };
    const api = createApi(async (url, options) => {
      assert.equal(url, '/api/sites/page%2Fid/gui-inspections');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(options.body), body);
      return json(result);
    }, '/api');

    assert.deepEqual(await api.saveGuiInspection('page/id', body), result);
  });
}

test('과거 관측 전송 시 서버가 반환한 더 최신의 다른 판정도 허용한다', async () => {
  const latest = { ...stored, index_status: 'crawled', last_checked_at: '2026-11-08T04:00:00Z' };
  const api = createApi(async () => json(latest), '/api');
  assert.deepEqual(await api.saveGuiInspection('page-id', payload), latest);
});

for (const patch of [
  { site_id: 'other-page' },
  { engine: 'google' },
  { engine: 'naver' },
  { index_status: 'invalid' },
  { last_checked_at: null },
  { last_checked_at: 'invalid' },
  { last_checked_at: '2026-11-08T03:00:02' },
  { next_check_at: 123 },
  { error_message: 123 },
]) {
  test(`잘못된 GUI 저장 응답을 거부한다: ${JSON.stringify(patch)}`, async () => {
    const api = createApi(async () => json({ ...stored, ...patch }), '/api');
    await assert.rejects(
      api.saveGuiInspection('page-id', payload),
      (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE' && error.operation === 'save',
    );
  });
}

test('GUI 저장 네트워크 오류는 자동 재전송하지 않는다', async () => {
  let calls = 0;
  const api = createApi(async () => {
    calls += 1;
    throw new TypeError('연결 실패');
  }, '/api');
  await assert.rejects(
    api.saveGuiInspection('page-id', payload),
    (error) => error instanceof ApiError && error.code === 'NETWORK_ERROR' && error.operation === 'save',
  );
  assert.equal(calls, 1);
});

test('GUI 저장 거절 응답의 오류 코드를 유지한다', async () => {
  const api = createApi(async () => json({
    detail: { code: 'SITE_INACTIVE', message: '비활성 사이트·글은 검사할 수 없습니다.' },
  }, 409), '/api');
  await assert.rejects(
    api.saveGuiInspection('page-id', payload),
    (error) => error instanceof ApiError && error.status === 409 && error.code === 'SITE_INACTIVE',
  );
});
