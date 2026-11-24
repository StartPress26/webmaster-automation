import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createPublicationController, publicationBusy } from '../src/publication/controller.ts';
import { renderPublication } from '../src/publication/view.ts';
import { createWorkTabController } from '../src/tabs/controller.ts';
import { ApiError } from '../src/errors.ts';
import { NaverAutomationError } from '../src/engines/naver/observation.ts';
import { listPublicationNaverTabs, checkPublicationNaverTab } from '../src/publication/tabs.ts';

const input = { clientId: 'c1', siteId: 's1', siteName: '<사이트>', siteUrl: 'https://one.example/',
  articles: [{ name: '첫 글', url: 'https://one.example/first' }, { name: '둘째 글', url: 'https://one.example/second' }],
  notify: true, gui: true, demo: false };
const tab = { tabId: 7, engine: 'naver', title: '네이버', url: 'https://searchadvisor.naver.com/console/board' };

test('수집 제출 전 연결·사이트 선택 실패를 접수 미확인으로 표시하지 않는다', async () => {
  for (const code of ['script_unavailable', 'site_missing', 'ambiguous_control', 'receipt_unconfirmed']) {
    const { controller } = fixture({ runner: async (_, targets, hooks) => {
      hooks.onStart(targets[0]);
      throw new NaverAutomationError(code);
    } });
    await controller.start(input);
    assert.equal(controller.getState().guiResults[0].status, code === 'receipt_unconfirmed' ? 'unconfirmed' : 'blocked');
  }
});

// 응답 순서와 외부 동작을 제어할 수 있는 가짜 발행 실행기를 만듭니다.
function fixture(overrides = {}) {
  const calls = [];
  const report = [];
  const tabs = createWorkTabController({ list: async () => [tab], check: async (value) => ({ connected: true, tab: value }), available: () => true });
  const controller = createPublicationController({
    tabs,
    submit: async (snapshot, article) => {
      calls.push(['save', snapshot.siteId, article.url, snapshot.notify]);
      return { page: { id: article.url, ...article }, submission: { status: 'accepted', error_code: null, upstream_http_status: 200 } };
    },
    runner: async (selected, targets, hooks) => {
      assert.equal(selected.tabId, 7);
      for (const target of targets) {
        hooks.onStart(target);
        calls.push(['gui', target.url]);
        await hooks.onResult(target, { kind: 'collection_receipt', siteUrl: target.siteUrl, targetUrl: target.url,
          requestStatus: 'accepted', collectionStatus: 'unknown', indexStatus: 'unknown',
          requestedAt: new Date().toISOString(), readAt: new Date().toISOString(), registeredAtText: '26.11.16 21:00:00', targetVerified: true });
      }
    },
    changed: () => {}, report: (_, results) => report.push(results),
    ...overrides,
  });
  return { controller, calls, report };
}

// 비동기 작업을 타이머 없이 원하는 시점까지 진행시킵니다.
async function flush() {
  for (let i = 0; i < 40; i += 1) await Promise.resolve();
}

test('전체조회 없이 네이버 단일 탭을 준비하고 저장 후 GUI 요청 접수를 별도로 표시한다', async () => {
  const { controller, calls, report } = fixture();
  await controller.start(input);
  assert.deepEqual(calls.map(([kind]) => kind), ['save', 'save', 'gui', 'gui']);
  assert.equal(report.at(-1).length, 2);
  const state = controller.getState();
  assert.equal(state.phase, 'finished');
  assert.equal(publicationBusy(state), false);
  assert.equal(state.guiResults.every((result) => result.status === 'accepted'), true);
  assert.equal(state.guiResults[0].receipt.indexStatus, 'unknown');
  const dom = new JSDOM(renderPublication(state, 's1'));
  try {
    assert.match(dom.window.document.querySelector('#publication-progress').textContent, /색인 완료/);
    assert.equal(dom.window.document.querySelector('사이트'), null);
    assert.equal(renderPublication(state, 'other'), '');
  } finally { dom.window.close(); }
});

test('체크하지 않거나 예시이면 네이버 탭을 확인하지 않고 기존 저장만 실행한다', async () => {
  for (const patch of [{ gui: false }, { demo: true }]) {
    const { controller, calls } = fixture({
      tabs: { reset: () => {}, prepare: async () => assert.fail('탭 확인 금지'), getState: () => assert.fail('탭 조회 금지') },
      runner: async () => assert.fail('GUI 금지'),
    });
    await controller.start({ ...input, ...patch });
    assert.equal(calls.length, 2);
    assert.equal(controller.getState().guiResults.length, 0);
  }
});

test('다중 탭은 글 저장 전에 선택을 기다리고 준비되면 고정한 사이트·URL로 계속한다', async () => {
  const tabs = createWorkTabController({ list: async () => [tab, { ...tab, tabId: 8 }], check: async (value) => ({ connected: true, tab: value }), available: () => true });
  const { controller, calls } = fixture({ tabs });
  const mutable = { ...input, articles: input.articles.map((article) => ({ ...article })) };
  await controller.start(mutable);
  const state = controller.getState();
  assert.equal(state.phase, 'awaiting_tabs');
  assert.deepEqual(calls, []);
  mutable.siteId = 'other'; mutable.articles[0].url = 'https://evil.example/';
  await controller.chooseTab('old', '7');
  await controller.chooseTab(state.scope, '100');
  assert.deepEqual(calls, []);
  const dom = new JSDOM(renderPublication(state, 's1'));
  try {
    assert.ok(dom.window.document.querySelector('form[data-publication-tab="naver"]'));
    assert.equal(dom.window.document.querySelector('[data-work-tab-engine]'), null);
  } finally { dom.window.close(); }
  await controller.chooseTab(state.scope, '7');
  assert.equal(controller.getState().phase, 'finished');
  assert.deepEqual(calls[0], ['save', 's1', 'https://one.example/first', true]);
});

test('탭이 없으면 요청을 보내지 않고 탭 목록 재확인 후 이어갈 수 있다', async () => {
  let candidates = [];
  const tabs = createWorkTabController({ list: async () => candidates, check: async (value) => ({ connected: true, tab: value }), available: () => true });
  const { controller, calls } = fixture({ tabs });
  await controller.start(input);
  assert.equal(controller.getState().phase, 'awaiting_tabs');
  assert.equal(calls.length, 0);
  candidates = [tab];
  await controller.chooseTab(controller.getState().scope);
  assert.equal(controller.getState().phase, 'finished');
});

test('IndexNow 실패여도 저장된 글은 GUI 요청하고 명시적 저장 거절 글은 제외한다', async () => {
  const targets = [];
  const { controller } = fixture({
    submit: async (_, article) => {
      if (article.url.endsWith('second')) throw new ApiError(409, '중복');
      return { page: { id: 'p1', ...article }, submission: { status: 'failed', error_code: 'UPSTREAM', upstream_http_status: 503 } };
    },
    runner: async (_, items) => targets.push(...items),
  });
  await controller.start(input);
  assert.deepEqual(targets.map((target) => target.url), [input.articles[0].url]);
  assert.equal(controller.getState().outcomes[0].result.submission.status, 'failed');
  assert.equal(controller.getState().guiResults[1].status, 'blocked');
});

test('저장 여부가 불명확하면 저장된 앞선 글도 GUI로 자동 제출하지 않는다', async () => {
  let count = 0;
  const { controller } = fixture({ submit: async (_, article) => {
    if (++count === 2) throw new Error('network');
    return { page: { id: 'p1', ...article }, submission: { status: 'accepted' } };
  }, runner: async () => assert.fail('저장 불명 뒤 GUI 금지') });
  await controller.start(input);
  assert.equal(controller.getState().phase, 'failed');
  assert.deepEqual(controller.getState().outcomes.map((outcome) => outcome.saveStatus), ['saved', 'unknown']);
  assert.equal(controller.getState().guiResults.every((result) => result.status === 'blocked'), true);
});

test('저장 중 취소는 현재 응답을 보존하고 아직 보내지 않은 글은 not_sent로 남긴다', async () => {
  let release;
  let count = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const { controller } = fixture({ submit: async (_, article) => { count += 1; await gate; return { page: { id: 'p1', ...article }, submission: { status: 'accepted' } }; },
    runner: async () => assert.fail('취소 후 GUI 금지') });
  const running = controller.start(input);
  try {
    await flush();
    assert.equal(controller.getState().phase, 'saving');
    controller.cancel();
    await controller.start(input);
    release(); await running;
    assert.equal(count, 1);
    assert.equal(controller.getState().phase, 'cancelled');
    assert.deepEqual(controller.getState().outcomes.map((outcome) => outcome.saveStatus), ['saved', 'not_sent']);
  } finally { release(); await running; }
});

test('GUI 취소·미확인 후 접수된 글을 보존하고 뒤 URL을 다시 보내지 않는다', async () => {
  const { controller } = fixture({ runner: async (_, targets, hooks) => {
    hooks.onStart(targets[0]);
    await hooks.onResult(targets[0], { targetUrl: targets[0].url, registeredAtText: '26.11.16 21:00:00' });
    hooks.onStart(targets[1]);
    await new Promise((_, reject) => hooks.signal.addEventListener('abort', () => reject(new NaverAutomationError('receipt_unconfirmed')), { once: true }));
  } });
  const running = controller.start(input);
  try {
    await flush();
    assert.equal(controller.getState().phase, 'requesting_gui');
    controller.cancel(); await running;
    assert.deepEqual(controller.getState().guiResults.map((result) => result.status), ['accepted', 'unconfirmed']);
    assert.equal(controller.getState().outcomes.length, 2);
  } finally { controller.cancel(); await running; }
});

test('준비 중 취소와 오래된 탭 이벤트는 새 발행을 실행하지 않는다', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const tabs = createWorkTabController({ list: async () => { await gate; return [tab]; }, check: async (value) => ({ connected: true, tab: value }), available: () => true });
  const { controller, calls } = fixture({ tabs });
  const running = controller.start(input);
  const scope = controller.getState().scope;
  controller.cancel();
  release(); await running;
  await controller.chooseTab(scope, '7');
  assert.equal(controller.getState().phase, 'cancelled');
  assert.deepEqual(calls, []);
});

test('전체 입력 검증과 외부 조회 잠금은 글 저장 전 실행을 차단한다', async () => {
  for (const patch of [{ articles: [] }, { articles: [input.articles[0], input.articles[0]] },
    { articles: [...input.articles, { name: '외부', url: 'https://evil.example/' }] }]) {
    const { controller, calls } = fixture();
    await assert.rejects(controller.start({ ...input, ...patch }));
    assert.deepEqual(calls, []);
  }
  const { controller, calls } = fixture({ blocked: () => true });
  await controller.start(input);
  assert.equal(controller.getState().phase, 'idle');
  assert.deepEqual(calls, []);
});

test('발행 탭 후보는 네이버 홈·가이드·콘솔을 허용하고 다른 출처·인증 화면을 제외한다', async () => {
  const urls = ['https://searchadvisor.naver.com/', 'https://searchadvisor.naver.com/guide/request-crawl',
    'https://searchadvisor.naver.com/console/board', 'https://searchadvisor.naver.com/auth/callback',
    'https://searchadvisor.naver.com/login', 'https://evil.example/',
    'https://user:password@searchadvisor.naver.com/'];
  const candidates = await listPublicationNaverTabs({
    query: async (query) => {
      assert.deepEqual(query, { url: ['https://searchadvisor.naver.com/*'] });
      return [...urls.map((url, id) => ({ id, url, status: 'complete' })),
        { id: 100, url: urls[0], incognito: true }, { id: -1, url: urls[0] }];
    },
  });
  assert.deepEqual(candidates.map((candidate) => candidate.url), urls.slice(0, 3));
  for (const selected of candidates) {
    assert.equal((await checkPublicationNaverTab(selected, { get: async () => ({ id: selected.tabId, url: selected.url, status: 'complete' }) })).connected, true);
  }
});

test('발행 전 탭 재검증은 이동·로딩·닫힘·시크릿·메모리 해제를 구분한다', async () => {
  const selected = { ...tab, url: 'https://searchadvisor.naver.com/guide/request-crawl' };
  for (const [patch, reason] of [[{ url: 'https://searchadvisor.naver.com/' }, 'url_changed'],
    [{ url: 'https://evil.example/' }, 'unsupported_url'], [{ status: 'loading' }, 'not_ready'],
    [{ pendingUrl: 'https://searchadvisor.naver.com/' }, 'not_ready'], [{ discarded: true }, 'not_ready'],
    [{ incognito: true }, 'unsupported_url']]) {
    assert.equal((await checkPublicationNaverTab(selected, { get: async () => ({ id: selected.tabId, url: selected.url, status: 'complete', ...patch }) })).reason, reason);
  }
  assert.equal((await checkPublicationNaverTab(selected, { get: async () => { throw new Error('closed'); } })).reason, 'unavailable');
  assert.equal((await checkPublicationNaverTab({ ...selected, engine: 'bing' }, { get: async () => assert.fail('잘못된 탭 조회 금지') })).reason, 'invalid_selection');
});

test('다른 사이트에서는 진행 안내와 취소만 보이고 원래 대상 URL·접수 결과를 섞지 않는다', async () => {
  const tabs = createWorkTabController({ list: async () => [], check: async (value) => ({ connected: true, tab: value }), available: () => true });
  const { controller } = fixture({ tabs });
  await controller.start(input);
  const dom = new JSDOM(renderPublication(controller.getState(), 'other-site'));
  try {
    const document = dom.window.document;
    assert.match(document.querySelector('[role="status"]').textContent, /<사이트>의 발행 작업이 진행 중/);
    assert.ok(document.querySelector('#cancel-publication'));
    assert.equal(document.querySelector('사이트'), null);
    assert.equal(document.querySelector('table'), null);
    assert.doesNotMatch(document.body.textContent, /https:\/\/one\.example/);
    controller.cancel();
    assert.equal(renderPublication(controller.getState(), 'other-site'), '');
  } finally { dom.window.close(); }
});

// 중복 응답과 DB에 존재하는 활성 글을 서로 독립적으로 재현합니다.
function duplicatePage(article = input.articles[0], patch = {}) {
  return { id: `existing-${article.url}`, client_id: input.clientId, parent_site_id: input.siteId,
    target_type: 'page', is_active: true, owner_type: 'client', name: 'DB의 원래 제목', url: article.url, ...patch };
}

// 명시적인 중복 URL 응답만 만들어 다른 409 오류와 구분합니다.
function duplicateError() {
  return new ApiError(409, '이미 등록된 URL입니다.', { code: 'DUPLICATE_PAGE', operation: 'save' });
}

// 현재 모달에 표시한 실행·확인 ID로만 사용자 선택을 전달합니다.
function answerDuplicate(controller, approved) {
  const state = controller.getState();
  assert.equal(state.phase, 'awaiting_duplicate');
  assert.ok(state.duplicate);
  controller.confirmDuplicate(state.scope, state.duplicate.confirmationId, approved);
}

test('중복 글은 DB 대상 확인과 모달 승인 뒤 IndexNow와 GUI를 한 번씩 실행한다', async () => {
  const calls = [];
  const original = duplicatePage();
  const { controller } = fixture({
    submit: async () => { calls.push('create'); throw duplicateError(); },
    listPages: async (siteId) => { assert.equal(siteId, input.siteId); calls.push('read'); return [original]; },
    notifyExisting: async (_, page) => { calls.push('indexnow'); return { page, submission: { status: 'accepted' } }; },
    runner: async (_, targets) => { calls.push('gui'); assert.equal(targets[0].id, original.id); },
  });
  const running = controller.start({ ...input, articles: [input.articles[0]] });
  await flush();
  assert.deepEqual(calls, ['create', 'read']);
  assert.equal(publicationBusy(controller.getState()), true);
  assert.equal(controller.getState().duplicate.page.name, 'DB의 원래 제목');
  answerDuplicate(controller, true);
  await running;
  assert.deepEqual(calls, ['create', 'read', 'indexnow', 'gui']);
  assert.equal(controller.getState().outcomes[0].saveStatus, 'existing');
  assert.equal(controller.getState().outcomes[0].result.submission.status, 'accepted');
  assert.equal(original.name, 'DB의 원래 제목');
  assert.equal(controller.getState().duplicate, undefined);
});

test('모달을 거절하면 해당 중복 URL은 건너뛰고 뒤의 신규 글은 계속 처리한다', async () => {
  const calls = [];
  const { controller } = fixture({
    submit: async (_, article) => {
      if (article.url === input.articles[0].url) throw duplicateError();
      return { page: { id: 'new', ...article }, submission: { status: 'accepted' } };
    },
    listPages: async () => [duplicatePage()],
    notifyExisting: async () => assert.fail('거절 후 IndexNow 금지'),
    runner: async (_, targets) => calls.push(...targets.map((target) => target.url)),
  });
  const running = controller.start(input);
  await flush(); answerDuplicate(controller, false); await running;
  assert.deepEqual(controller.getState().outcomes.map((result) => result.saveStatus), ['not_sent', 'saved']);
  assert.deepEqual(calls, [input.articles[1].url]);
});

test('IndexNow만 선택한 기존 글도 모달 승인 후 재알림하며 GUI 탭은 요구하지 않는다', async () => {
  let notifications = 0;
  const { controller } = fixture({
    submit: async () => { throw duplicateError(); }, listPages: async () => [duplicatePage()],
    notifyExisting: async (_, page) => { notifications += 1; return { page, submission: { status: 'key_pending' } }; },
    tabs: { reset: () => {}, prepare: async () => assert.fail('GUI 탭 금지'), getState: () => assert.fail('GUI 탭 금지') },
    runner: async () => assert.fail('GUI 실행 금지'),
  });
  const running = controller.start({ ...input, gui: false, articles: [input.articles[0]] });
  await flush(); assert.equal(notifications, 0); answerDuplicate(controller, true); await running;
  assert.equal(notifications, 1);
  assert.equal(controller.getState().outcomes[0].saveStatus, 'existing');
  assert.equal(controller.getState().outcomes[0].result.submission.status, 'key_pending');
});

test('GUI만 선택한 기존 글은 모달 승인 후 IndexNow 재알림 없이 수집을 요청한다', async () => {
  const targets = [];
  const { controller } = fixture({
    submit: async () => { throw duplicateError(); }, listPages: async () => [duplicatePage()],
    notifyExisting: async () => assert.fail('선택하지 않은 IndexNow 금지'),
    runner: async (_, items) => targets.push(...items),
  });
  const running = controller.start({ ...input, notify: false, articles: [input.articles[0]] });
  await flush(); answerDuplicate(controller, true); await running;
  assert.equal(targets.length, 1);
  assert.equal(controller.getState().outcomes[0].result.submission.error_code, 'NOTIFICATION_DISABLED');
});

test('중복 코드 이외의 409와 DB 소속·활성·URL 불일치는 승인 모달이나 외부 요청을 만들지 않는다', async () => {
  const cases = [
    { error: new ApiError(409, '비활성', { code: 'SITE_INACTIVE' }), pages: [duplicatePage()] },
    { error: new ApiError(409, '알 수 없는 충돌'), pages: [duplicatePage()] },
    { error: duplicateError(), pages: [] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { url: 'https://other.example/' })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { client_id: 'other' })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { parent_site_id: 'other' })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { target_type: 'site' })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { is_active: false })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { is_active: 'true' })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { id: 123 })] },
    { error: duplicateError(), pages: [duplicatePage(undefined, { name: '' })] },
    { error: duplicateError(), pages: [duplicatePage(), duplicatePage()] },
  ];
  for (const scenario of cases) {
    const { controller } = fixture({ submit: async () => { throw scenario.error; }, listPages: async () => scenario.pages,
      notifyExisting: async () => assert.fail('검증 실패 뒤 알림 금지'), runner: async () => assert.fail('검증 실패 뒤 GUI 금지') });
    await controller.start({ ...input, articles: [input.articles[0]] });
    assert.equal(controller.getState().duplicate, undefined);
    assert.equal(controller.getState().outcomes[0].saveStatus, 'rejected');
  }
});

test('모달 대기 중 전체 취소와 오래된 승인·이중 클릭은 기존 글 요청을 실행하지 않는다', async () => {
  const { controller } = fixture({ submit: async () => { throw duplicateError(); }, listPages: async () => [duplicatePage()],
    notifyExisting: async () => assert.fail('전체 취소 뒤 알림 금지'), runner: async () => assert.fail('전체 취소 뒤 GUI 금지') });
  const running = controller.start({ ...input, articles: [input.articles[0]] });
  await flush();
  const state = controller.getState();
  controller.confirmDuplicate('old', state.duplicate.confirmationId, true);
  assert.equal(controller.getState().phase, 'awaiting_duplicate');
  controller.confirmDuplicate(state.scope, 'old-confirmation', true);
  assert.equal(controller.getState().phase, 'awaiting_duplicate');
  controller.cancel();
  controller.confirmDuplicate(state.scope, state.duplicate.confirmationId, true);
  await running;
  assert.equal(controller.getState().phase, 'cancelled');
  assert.equal(controller.getState().duplicate, undefined);
  assert.equal(controller.getState().outcomes[0].saveStatus, 'not_sent');
});

test('여러 중복 URL의 모달은 각자 새 확인 ID를 사용하고 승인한 대상만 재알림한다', async () => {
  const notifications = [];
  const { controller } = fixture({ submit: async () => { throw duplicateError(); },
    listPages: async () => input.articles.map((article) => duplicatePage(article)),
    notifyExisting: async (_, page) => { notifications.push(page.url); return { page, submission: { status: 'accepted' } }; },
    runner: async (_, targets) => assert.deepEqual(targets.map((target) => target.url), [input.articles[0].url]),
  });
  const running = controller.start(input);
  await flush(); const first = controller.getState(); answerDuplicate(controller, true);
  controller.confirmDuplicate(first.scope, first.duplicate.confirmationId, true);
  await flush();
  const second = controller.getState();
  assert.equal(second.phase, 'awaiting_duplicate');
  assert.notEqual(second.duplicate.confirmationId, first.duplicate.confirmationId);
  controller.confirmDuplicate(first.scope, first.duplicate.confirmationId, true);
  assert.equal(controller.getState().phase, 'awaiting_duplicate');
  answerDuplicate(controller, false); await running;
  assert.deepEqual(notifications, [input.articles[0].url]);
});

test('기존 글 IndexNow 통신 실패·변조 응답은 기존 DB 확인을 유지하고 GUI와 분리한다', async () => {
  for (const failure of ['network', 'response']) {
    let sent = 0;
    let collected = 0;
    const { controller } = fixture({ submit: async () => { throw duplicateError(); }, listPages: async () => [duplicatePage()],
      notifyExisting: async (_, page) => {
        sent += 1;
        if (failure === 'network') throw new ApiError(0, '연결 종료', { code: 'NETWORK_ERROR', operation: 'submit' });
        return { page: { ...page, id: 'wrong' }, submission: { status: 'accepted' } };
      }, runner: async (_, targets) => { collected += targets.length; } });
    const running = controller.start({ ...input, articles: [input.articles[0]] });
    await flush(); answerDuplicate(controller, true); await running;
    assert.equal(sent, 1); assert.equal(collected, 1);
    assert.equal(controller.getState().outcomes[0].saveStatus, 'existing');
    assert.equal(controller.getState().outcomes[0].result.submission.status, 'unknown');
  }
});

test('모달 승인 이후 서버에서 기존 글이 삭제·비활성·권한 없음으로 바뀌면 GUI도 실행하지 않는다', async () => {
  for (const status of [401, 403, 404, 409, 422]) {
    const { controller } = fixture({ submit: async () => { throw duplicateError(); }, listPages: async () => [duplicatePage()],
      notifyExisting: async () => { throw new ApiError(status, '대상 재검증 실패'); },
      runner: async () => assert.fail('서버 대상 재검증 실패 뒤 GUI 금지') });
    const running = controller.start({ ...input, articles: [input.articles[0]] });
    await flush(); answerDuplicate(controller, true); await running;
    assert.equal(controller.getState().outcomes[0].saveStatus, 'rejected');
  }
});

test('기존 글 조회 중 취소하면 뒤늦게 확인된 대상의 모달과 재알림을 만들지 않는다', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { controller } = fixture({ submit: async () => { throw duplicateError(); },
    listPages: async () => { await gate; return [duplicatePage()]; },
    notifyExisting: async () => assert.fail('취소 뒤 알림 금지'), runner: async () => assert.fail('취소 뒤 GUI 금지') });
  const running = controller.start({ ...input, articles: [input.articles[0]] });
  await flush(); controller.cancel(); release(); await running;
  assert.equal(controller.getState().phase, 'cancelled');
  assert.equal(controller.getState().duplicate, undefined);
  assert.equal(controller.getState().outcomes[0].saveStatus, 'not_sent');
});
