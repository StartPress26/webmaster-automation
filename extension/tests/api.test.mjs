import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, createApi, errorDetail } from '../src/api.ts';
import { submitPageBatch } from '../src/batch.ts';
import { defaultApiBase } from '../src/runtime.ts';

test('설치된 확장 프로그램은 프록시 없이 로컬 API 경로로 목록을 요청한다', async () => {
  const api = createApi(async (url) => {
    assert.equal(url, 'http://127.0.0.1:18001/clients?limit=100&offset=0');
    return json({ items: [] });
  }, defaultApiBase('chrome-extension:'));

  assert.deepEqual(await api.listClients(), []);
});

test('웹 미리보기는 기존 API 프록시 경로를 유지한다', async () => {
  const api = createApi(async (url) => {
    assert.equal(url, '/api/clients?limit=100&offset=0');
    return json({ items: [] });
  }, defaultApiBase('http:'));

  assert.deepEqual(await api.listClients(), []);
});

/** 외부 통신 없이 JSON 응답을 생성합니다.
 * @param {unknown} data
 * @param {number} status
 * @returns {Response}
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}

/** 글 저장 성공과 알림 상태를 독립적으로 생성합니다.
 * @param {string} status
 * @returns {{page: {id: string, name: string, url: string}, submission: {status: string, error_code: null, upstream_http_status: number}}}
 */
function page(status = 'accepted') {
  return { page: { id: 'page-id', name: '글', url: 'https://example.com/post' }, submission: { status, error_code: null, upstream_http_status: 200 } };
}

test('고객사 목록은 100개 다음 페이지도 읽는다', async () => {
  const calls = [];
  const api = createApi(async (url) => {
    calls.push(url);
    return json({ items: calls.length === 1 ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }] });
  });

  assert.equal((await api.listClients()).length, 101);
  assert.deepEqual(calls, ['/api/clients?limit=100&offset=0', '/api/clients?limit=100&offset=100']);
});

// 계정 목록은 모든 페이지를 읽고 서버의 추가 필드가 화면 상태에 들어오지 않게 합니다.
test('인증 계정 목록을 페이지별로 조회하고 공개 필드만 반환한다', async () => {
  const calls = [];
  const account = { email: 'user@example.com', google_configured: true, bing_configured: false };
  const api = createApi(async (url) => {
    calls.push(url);
    return json({ items: calls.length === 1 ? Array.from({ length: 100 }, () => ({ ...account, google_secret_ref: 'private.json' })) : [] });
  });
  const result = await api.listAuthAccounts();
  assert.equal(result.length, 100);
  assert.deepEqual(result[0], account);
  assert.deepEqual(calls, ['/api/auth-accounts?limit=100&offset=0', '/api/auth-accounts?limit=100&offset=100']);
});

// 인증 참조 등록 여부가 잘못된 응답이면 선택 목록으로 사용하지 않습니다.
test('잘못된 인증 계정 응답은 거부한다', async () => {
  const api = createApi(async () => json({ items: [{ email: 'user@example.com', google_configured: 'true', bing_configured: false }] }));
  await assert.rejects(api.listAuthAccounts(), (error) => error instanceof ApiError && error.code === 'INVALID_RESPONSE');
});

// 부분 변경은 생략한 필드를 추가하지 않고 연결 해제용 null을 그대로 보냅니다.
test('사이트 인증 계정 PATCH는 변경 필드와 null만 전송한다', async () => {
  const api = createApi(async (url, options) => {
    assert.equal(url, '/api/sites/site%2Fid/auth-accounts');
    assert.equal(options.method, 'PATCH');
    assert.deepEqual(JSON.parse(options.body), { google_account_email: 'new@example.com', naver_account_email: null });
    return json({ id: 'site/id', google_account_email: 'new@example.com', bing_account_email: 'bing@example.com', naver_account_email: null });
  });
  const result = await api.updateSiteAuthAccounts('site/id', { google_account_email: 'new@example.com', naver_account_email: null });
  assert.equal(result.bing_account_email, 'bing@example.com');
});

// 다른 사이트의 변경 응답은 현재 화면 상태에 반영하지 않습니다.
test('사이트 인증 계정 PATCH 응답의 대상이 다르면 거부한다', async () => {
  const api = createApi(async () => json({ id: 'other', google_account_email: null, bing_account_email: null, naver_account_email: null }));
  await assert.rejects(api.updateSiteAuthAccounts('site', { bing_account_email: null }), (error) => error.code === 'INVALID_RESPONSE');
});

test('IndexNow PUT은 서버 필드 이름으로 보내고 원문 키가 없는 응답을 사용한다', async () => {
  const api = createApi(async (url, options) => {
    assert.equal(url, '/api/sites/site-id/indexnow-settings');
    assert.equal(options.method, 'PUT');
    assert.deepEqual(JSON.parse(options.body), { key: 'a1b2c3d4', key_location: 'https://example.com/key.txt' });
    return json({ configured: true, key_location: 'https://example.com/key.txt' });
  });

  assert.deepEqual(await api.putSettings('site-id', { key: 'a1b2c3d4', keyLocation: 'https://example.com/key.txt' }), { configured: true, key_location: 'https://example.com/key.txt' });
});

test('글 저장만 선택하면 알림을 명시적으로 비활성화한다', async () => {
  const api = createApi(async (url, options) => {
    assert.equal(url, '/api/sites/site-id/pages');
    assert.deepEqual(JSON.parse(options.body), { name: '제목', url: 'https://example.com/new', notify_search_engines: false });
    return json(page('skipped'), 201);
  });

  assert.equal((await api.addPage('site-id', { name: '제목', url: 'https://example.com/new' }, false)).submission.status, 'skipped');
});

test('422 문자열·객체·배열 오류는 입력 원문을 출력하지 않는다', () => {
  assert.equal(errorDetail('오류'), '오류');
  assert.equal(errorDetail({ code: 'INVALID', message: '범위 오류', input: 'secret' }), '범위 오류');
  assert.equal(errorDetail([{ loc: ['body', 'key'], msg: '키 형식 오류', input: 'secret', ctx: { secret: true } }]), '키 형식 오류');
});

test('네트워크 오류는 쓰기 요청을 재시도하지 않는다', async () => {
  let count = 0;
  const api = createApi(async () => { count += 1; throw new TypeError('통신 실패'); });
  await assert.rejects(api.addClient('고객사', ''), (error) => error instanceof ApiError && error.status === 0);
  assert.equal(count, 1);
});

test('형식이 잘못된 201은 저장 여부 불명으로 분류한다', async () => {
  const api = createApi(async () => json({ page: { id: 'saved' } }, 201));
  await assert.rejects(api.addPage('site-id', { name: '글', url: 'https://example.com/new' }, true), (error) => error instanceof ApiError && error.status === 0);
});

test('여러 글은 순차 처리하며 저장 성공과 알림 실패를 구분한다', async () => {
  const articles = [{ name: '첫 글', url: '/a' }, { name: '둘째 글', url: '/b' }];
  let active = 0;
  const calls = [];

  const results = await submitPageBatch(articles, async (article) => {
    active += 1;
    assert.equal(active, 1);
    calls.push(article.url);
    await Promise.resolve();
    active -= 1;

    return page(article.url === '/a' ? 'failed' : 'key_pending');
  }, () => {});
  assert.deepEqual(calls, ['/a', '/b']);
  assert.deepEqual(results.map((item) => item.saveStatus), ['saved', 'saved']);
  assert.deepEqual(results.map((item) => item.result.submission.status), ['failed', 'key_pending']);
});

test('저장 여부 불명 뒤에는 남은 글을 전송하지 않는다', async () => {
  let count = 0;

  const results = await submitPageBatch([{ name: '첫 글', url: '/a' }, { name: '둘째 글', url: '/b' }], async () => {
    count += 1;
    throw new ApiError(0, '응답 미확인');
  }, () => {});
  assert.equal(count, 1);
  assert.deepEqual(results.map((item) => item.saveStatus), ['unknown', 'not_sent']);
});

test('중복 409는 자동 재전송 없이 해당 글의 거절로 표시한다', async () => {
  let count = 0;

  const results = await submitPageBatch([{ name: '첫 글', url: '/a' }, { name: '둘째 글', url: '/b' }], async () => {
    count += 1;
    if (count === 1) throw new ApiError(409, '이미 저장된 URL');
    return page();
  }, () => {});
  assert.equal(count, 2);
  assert.deepEqual(results.map((item) => item.saveStatus), ['rejected', 'saved']);
});

test('서버 오류는 저장 불명으로 분류하고 남은 요청을 중단한다', async () => {
  let count = 0;

  const results = await submitPageBatch([{ name: '첫 글', url: '/a' }, { name: '둘째 글', url: '/b' }], async () => {
    count += 1;
    throw new ApiError(500, '서버 오류');
  }, () => {});
  assert.equal(count, 1);
  assert.deepEqual(results.map((item) => item.saveStatus), ['unknown', 'not_sent']);
});

test('호출 제한 429는 거절로 표시하고 남은 요청을 중단한다', async () => {
  let count = 0;

  const results = await submitPageBatch([{ name: '첫 글', url: '/a' }, { name: '둘째 글', url: '/b' }], async () => {
    count += 1;
    throw new ApiError(429, '호출 제한');
  }, () => {});
  assert.equal(count, 1);
  assert.deepEqual(results.map((item) => item.saveStatus), ['rejected', 'not_sent']);
});
