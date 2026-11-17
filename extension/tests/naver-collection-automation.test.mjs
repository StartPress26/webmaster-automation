import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command } from '../src/engines/naver/automation.ts';
import { runNaverCollectionAutomation } from '../src/engines/naver/collection-automation.ts';
import { NAVER_BOARD_URL, canonicalNaverTarget } from '../src/engines/naver/observation.ts';

const site = 'https://one.example/';
const target = { id: 'p1', siteId: 's1', siteName: '사이트 A', siteUrl: site, url: `${site}post`, name: '글' };
const selected = { tabId: 7, engine: 'naver', url: NAVER_BOARD_URL, title: '네이버' };

// Chrome 이동과 콘텐츠 명령을 재현하되 색인 검사·DB 저장 명령은 허용하지 않습니다.
function fixture(initialUrl = NAVER_BOARD_URL) {
  let url = initialUrl;
  let documentToken = 'document';
  const events = [];
  return {
    events,
    changeToken: () => { documentToken = 'replaced-document'; },
    client: {
      get: async (id) => ({ id, url, status: 'complete' }),
      navigate: async (_, destination) => { url = destination; events.push(['navigate', new URL(url).pathname]); },
      send: async (_, request) => {
        const current = new URL(url);
        let value;
        if (request.action === 'state') {
          value = {
            route: current.pathname.endsWith('/board') ? 'board' : current.pathname.endsWith('/summary') ? 'summary' : 'collection',
            siteUrl: canonicalNaverTarget(current.searchParams.get('site') ?? ''),
            ready: true,
            documentToken,
          };
        } else if (request.action === 'open_board') {
          assert.equal(request.documentToken, documentToken);
          events.push(['open_board']);
          url = NAVER_BOARD_URL;
        } else if (request.action === 'select_collection_site') {
          assert.equal(request.documentToken, documentToken);
          events.push(['select', request.siteUrl]);
          url = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(request.siteUrl)}`;
        } else if (request.action === 'open_collection') {
          assert.equal(current.pathname, '/console/site/summary');
          assert.equal(request.documentToken, documentToken);
          events.push(['open_collection', request.siteUrl]);
          url = `https://searchadvisor.naver.com/console/site/request/crawl?site=${encodeURIComponent(request.siteUrl)}`;
        } else if (request.action === 'request_collection') {
          assert.equal(current.pathname, '/console/site/request/crawl');
          assert.equal(request.documentToken, documentToken);
          events.push(['request', request.targetUrl]);
          value = {
            kind: 'collection_receipt',
            siteUrl: request.siteUrl,
            targetUrl: request.targetUrl,
            requestStatus: 'accepted',
            collectionStatus: 'unknown',
            indexStatus: 'unknown',
            requestedAt: new Date().toISOString(),
            readAt: new Date().toISOString(),
            registeredAtText: '26.11.16 19:07:01',
            targetVerified: true,
          };
        } else if (request.action === 'cancel') {
          events.push(['cancel']);
        } else {
          assert.fail(`수집 외 명령은 보내지 않습니다: ${request.action}`);
        }
        return { requestId: request.requestId, ok: true, value };
      },
    },
  };
}

// 테스트마다 새 취소 신호와 기본 콜백을 제공합니다.
function hooks(changes = {}) {
  return { signal: new AbortController().signal, onStart: () => {}, onResult: () => {}, ...changes };
}

test('수집은 사이트별 요청 화면에서 URL을 한 번씩 처리하고 접수·수집·색인을 구분한다', async () => {
  const f = fixture();
  const second = { ...target, id: 'p2', url: `${site}second` };
  const third = { ...target, id: 'p3', siteId: 's2', siteUrl: 'https://two.example/', url: 'https://two.example/post' };
  const receipts = [];
  await runNaverCollectionAutomation(selected, [target, second, third], hooks({ onResult: (item, receipt) => receipts.push([item, receipt]) }), f.client);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'select'), [['select', site], ['select', third.siteUrl]]);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'open_collection'), [['open_collection', site], ['open_collection', third.siteUrl]]);
  assert.equal(f.events.filter(([kind]) => kind === 'open_board').length, 0);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'request'), [['request', target.url], ['request', second.url], ['request', third.url]]);
  assert.equal(receipts.length, 3);
  for (const [item, receipt] of receipts) {
    assert.equal(receipt.targetUrl, item.url);
    assert.equal(receipt.requestStatus, 'accepted');
    assert.equal(receipt.collectionStatus, 'unknown');
    assert.equal(receipt.indexStatus, 'unknown');
  }
  assert.deepEqual(f.events.at(-1), ['navigate', '/console/board']);
});

test('다른 네이버 화면에서는 웹마스터 도구로 목록을 열고 요청 메뉴를 통해 수집 화면에 들어간다', async () => {
  const f = fixture(`https://searchadvisor.naver.com/console/site/check/inspection?site=${encodeURIComponent(site)}`);
  await runNaverCollectionAutomation(selected, [target], hooks(), f.client);
  assert.deepEqual(f.events.map(([kind]) => kind), ['open_board', 'select', 'open_collection', 'request', 'navigate']);
  assert.deepEqual(f.events.filter(([kind]) => kind === 'navigate'), [['navigate', '/console/board']]);
});

test('처음 탭이 인증·다른 출처·로딩 상태이면 메뉴나 수집 명령을 보내지 않는다', async () => {
  for (const [url, loading, code] of [
    ['https://searchadvisor.naver.com/auth/callback', false, 'auth_required'],
    ['https://outside.example/', false, 'auth_required'],
    [NAVER_BOARD_URL, true, 'page_changed'],
  ]) {
    const f = fixture(url);
    if (loading) f.client.get = async (id) => ({ id, url, status: 'loading' });
    await assert.rejects(runNaverCollectionAutomation(selected, [target], hooks(), f.client), (error) => error.code === code);
    assert.equal(f.events.length, 0);
  }
});

test('중복 URL·대상 ID·사이트 혼용과 뒤쪽의 잘못된 URL은 요청 전에 전체 거부한다', async () => {
  for (const invalid of [
    { ...target, id: 'p2' },
    { ...target, url: `${site}different` },
    { ...target, id: 'p2', siteUrl: 'https://two.example/', url: 'https://two.example/post' },
    { ...target, id: 'p2', siteId: 's2', url: 'https://outside.example/post' },
    { ...target, id: 'p2', url: `${site}post#fragment` },
    { ...target, id: 'p2', url: `${site}${'a'.repeat(2048)}` },
  ]) {
    const f = fixture();
    await assert.rejects(runNaverCollectionAutomation(selected, [target, invalid], hooks(), f.client), (error) => error.code === 'invalid_response');
    assert.equal(f.events.length, 0);
  }
});

test('수집 결과 콜백이 끝나기 전에는 다음 URL을 요청하지 않는다', async () => {
  const f = fixture();
  let release;
  let entered;
  const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const running = runNaverCollectionAutomation(selected, [target, { ...target, id: 'p2', url: `${site}second` }], hooks({
    onResult: async () => { entered(); await gate; },
  }), f.client);
  try {
    await started;
    assert.equal(f.events.filter(([kind]) => kind === 'request').length, 1);
    release();
    await running;
    assert.equal(f.events.filter(([kind]) => kind === 'request').length, 2);
  } finally { release(); await running; }
});

test('접수 확인 뒤 취소하면 다음 URL을 제출하지 않는다', async () => {
  const f = fixture();
  const abort = new AbortController();
  await assert.rejects(runNaverCollectionAutomation(selected, [target, { ...target, id: 'p2', url: `${site}second` }], hooks({ signal: abort.signal, onResult: () => abort.abort() }), f.client), (error) => error.code === 'cancelled');
  assert.equal(f.events.filter(([kind]) => kind === 'request').length, 1);
});

test('전송 중 취소·채널 단절은 접수 여부 미확인으로 중단하고 재전송하지 않는다', async () => {
  for (const mode of ['abort', 'disconnect']) {
    const f = fixture();
    const original = f.client.send;
    const abort = new AbortController();
    f.client.send = async (id, request) => {
      const response = await original(id, request);
      if (request.action === 'request_collection') {
        if (mode === 'abort') abort.abort();
        else throw new Error('raw private browser connection detail');
      }
      return response;
    };
    await assert.rejects(runNaverCollectionAutomation(selected, [target], hooks({ signal: abort.signal }), f.client), (error) => error.code === 'receipt_unconfirmed' && !error.message.includes('private'));
    assert.equal(f.events.filter(([kind]) => kind === 'request').length, 1);
  }
});

test('응답이 끝내 오지 않으면 제한 시간에 접수 여부 미확인으로 끝내고 취소만 전달한다', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const commands = [];
  const client = { send: async (_, request) => { commands.push(request.action); return request.action === 'cancel' ? {} : new Promise(() => {}); } };
  const running = command(client, 7, { action: 'request_collection' }, new AbortController().signal);
  const rejected = assert.rejects(running, (error) => error.code === 'receipt_unconfirmed');
  context.mock.timers.tick(18000);
  await rejected;
  assert.deepEqual(commands, ['request_collection', 'cancel']);
});

test('응답 없는 수집 요청도 취소 시 다음 응답을 기다리지 않고 미확인으로 끝난다', async () => {
  const abort = new AbortController();
  const commands = [];
  const client = { send: async (_, request) => { commands.push(request.action); return request.action === 'cancel' ? {} : new Promise(() => {}); } };
  const running = command(client, 7, { action: 'request_collection' }, abort.signal);
  const rejected = assert.rejects(running, (error) => error.code === 'receipt_unconfirmed');
  abort.abort();
  await rejected;
  assert.deepEqual(commands, ['request_collection', 'cancel']);
});

test('수집 전 명시적 권한·중복 작업 오류는 접수 성공으로 처리하지 않는다', async () => {
  for (const code of ['auth_required', 'busy', 'receipt_unconfirmed']) {
    const f = fixture();
    const original = f.client.send;
    f.client.send = async (id, request) => request.action === 'request_collection'
      ? { requestId: request.requestId, ok: false, code }
      : original(id, request);
    await assert.rejects(runNaverCollectionAutomation(selected, [target], hooks({ onResult: () => assert.fail('접수 응답 없음') }), f.client), (error) => error.code === code);
  }
});

test('다른 대상·색인 완료·오래된 시각·위조된 요청 ID의 응답은 접수 확정에 사용하지 않는다', async () => {
  for (const change of [
    (response) => ({ ...response, requestId: 'other-operation' }),
    (response) => ({ ...response, value: { ...response.value, targetUrl: `${site}other` } }),
    (response) => ({ ...response, value: { ...response.value, siteUrl: 'https://other.example/' } }),
    (response) => ({ ...response, value: { ...response.value, indexStatus: 'indexed' } }),
    (response) => ({ ...response, value: { ...response.value, collectionStatus: 'crawled' } }),
    (response) => ({ ...response, value: { ...response.value, requestedAt: '2020-01-01T00:00:00Z' } }),
    (response) => ({ ...response, value: { ...response.value, readAt: '2099-01-01T00:00:00Z' } }),
    (response) => ({ ...response, value: { ...response.value, registeredAtText: '기존 행' } }),
  ]) {
    const f = fixture();
    const original = f.client.send;
    f.client.send = async (id, request) => {
      const response = await original(id, request);
      return request.action === 'request_collection' ? change(response) : response;
    };
    await assert.rejects(runNaverCollectionAutomation(selected, [target], hooks({ onResult: () => assert.fail('변조 응답') }), f.client), (error) => error.code === 'receipt_unconfirmed');
    assert.equal(f.events.filter(([kind]) => kind === 'request').length, 1);
  }
});

test('접수 응답 뒤 문서가 교체되면 이전 문서 결과를 확정하지 않는다', async () => {
  const f = fixture();
  const original = f.client.send;
  f.client.send = async (id, request) => {
    const response = await original(id, request);
    if (request.action === 'request_collection') f.changeToken();
    return response;
  };
  await assert.rejects(runNaverCollectionAutomation(selected, [target], hooks({ onResult: () => assert.fail('교체된 문서') }), f.client), (error) => error.code === 'receipt_unconfirmed');
  assert.equal(f.events.filter(([kind]) => kind === 'request').length, 1);
});

test('처음부터 취소됐거나 네이버가 아닌 탭이면 수집 명령을 보내지 않는다', async () => {
  const abort = new AbortController();
  abort.abort();
  for (const [tab, control, code] of [[selected, hooks({ signal: abort.signal }), 'cancelled'], [{ ...selected, engine: 'bing' }, hooks(), 'wrong_page']]) {
    const f = fixture();
    await assert.rejects(runNaverCollectionAutomation(tab, [target], control, f.client), (error) => error.code === code);
    assert.equal(f.events.length, 0);
  }
});
