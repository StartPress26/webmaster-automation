import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi } from '../src/api.ts';
import { inspectionStatusNames, inspectionTime, inspectionUnavailable } from '../src/inspection.ts';

const record = { site_id: 'site-id', engine: 'google', index_status: 'indexed', last_checked_at: '2026-11-03T05:00:00Z', next_check_at: null, error_message: null };
const parent = { id: 'site-id', siteUrl: 'https://example.com/', active: true };
const target = { id: 'site-id', active: true };

test('저장 결과 GET과 글 목록 GET은 새 검사를 실행하지 않는다', async () => {
  const calls = [];
  const api = createApi(async (url, options) => {
    calls.push({ url, method: options.method });
    return new Response(JSON.stringify({ items: url.includes('/inspections') ? [record] : [] }));
  });
  assert.deepEqual(await api.getInspections('site-id'), [record]);
  assert.deepEqual(await api.listPages('site-id'), []);
  assert.deepEqual(calls, [{ url: '/api/sites/site-id/inspections', method: 'GET' }, { url: '/api/sites/site-id/pages?limit=100&offset=0', method: 'GET' }]);
});

test('새 검사는 선택한 UUID와 엔진만 한 번 보낸다', async () => {
  let count = 0;
  const api = createApi(async (url, options) => {
    count += 1;
    assert.equal(url, '/api/sites/site-id/inspections');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { engine: 'google' });
    return new Response(JSON.stringify(record));
  });
  assert.deepEqual(await api.inspect('site-id', 'google'), record);
  assert.equal(count, 1);
});

test('네이버는 서버 검사 요청을 보내지 않는다', async () => {
  let count = 0;
  const api = createApi(async () => { count += 1; throw new Error('전송하면 안 됨'); });
  await assert.rejects(api.inspect('site-id', 'naver'), (error) => error instanceof ApiError && error.status === 422);
  assert.equal(count, 0);
  assert.match(inspectionUnavailable('naver', parent, target), /작업 탭/);
});

test('대상과 다른 UUID·엔진 응답은 정상 결과로 사용하지 않는다', async () => {
  const wrongId = createApi(async () => new Response(JSON.stringify({ ...record, site_id: 'other' })));
  await assert.rejects(wrongId.inspect('site-id', 'google'), ApiError);
  const wrongEngine = createApi(async () => new Response(JSON.stringify({ ...record, engine: 'bing' })));
  await assert.rejects(wrongEngine.inspect('site-id', 'google'), ApiError);
});

test('최초 실패는 성공 관측 시각을 만들지 않고 기존 오류를 그대로 읽는다', async () => {
  const firstFailure = { ...record, index_status: 'unknown', last_checked_at: null, error_message: '인증 설정 필요' };
  const api = createApi(async () => new Response(JSON.stringify({ items: [firstFailure] })));
  const [result] = await api.getInspections('site-id');
  assert.equal(inspectionTime(result.last_checked_at), '성공 관측 없음');
  assert.equal(result.index_status, 'unknown');
  assert.equal(result.error_message, '인증 설정 필요');
});

test('외부 인증 오류는 자동 재시도하지 않는다', async () => {
  let count = 0;
  const api = createApi(async () => { count += 1; return new Response(JSON.stringify({ detail: { code: 'ENGINE_AUTHENTICATION', message: '인증 설정 필요' } }), { status: 503 }); });
  await assert.rejects(api.inspect('site-id', 'google'), (error) => error.status === 503 && error.message === '인증 설정 필요');
  assert.equal(count, 1);
});

test('비활성 대상과 Bing 하위 경로 속성은 새 조회를 제한한다', () => {
  assert.match(inspectionUnavailable('google', parent, { ...target, active: false }), /비활성/);
  assert.match(inspectionUnavailable('bing', { ...parent, siteUrl: 'https://example.com/blog/' }, target), /루트/);
  assert.equal(inspectionUnavailable('google', parent, target), '');
});

test('접수·크롤링을 색인 완료로 해석하지 않는다', () => {
  assert.match(inspectionStatusNames.submitted, /수집 여부 미확인/);
  assert.match(inspectionStatusNames.crawled, /색인 여부 미확인/);
  assert.equal(inspectionTime(null), '성공 관측 없음');
  assert.equal(inspectionTime('invalid'), '시각 확인 필요');
});
