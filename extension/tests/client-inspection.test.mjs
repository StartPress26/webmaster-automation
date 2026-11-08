import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectClientInspectionTargets, buildClientInspectionTasks } from '../src/inspection/client-plan.ts';
import { createClientInspectionController as createController } from '../src/inspection/client-controller.ts';
import { createWorkTabController } from '../src/tabs/controller.ts';
import { renderClientInspection } from '../src/inspection/client-view.ts';
import { ApiError } from '../src/errors.ts';

// API 실행 검증에서는 엔진별 탭 하나를 실제 탭 모듈로 자동 준비합니다.
function createClientInspectionController(api, changed) {
  const tabs = ['naver', 'bing'].map((engine, index) => ({ tabId: index + 1, engine, title: engine, url: `https://${engine}.example/` }));
  const factory = () => createWorkTabController({ list: async () => tabs, check: async (tab) => ({ connected: true, tab }), available: () => true });

  return createController(api, changed, { naver: factory(), bing: factory() }, async (selected, targets, hooks) => {
    for (const item of targets) {
      hooks.onStart(item);
      hooks.onResult(item, { kind: 'verified_gui', siteUrl: item.siteUrl, targetUrl: item.url, indexStatus: 'unknown', message: 'URL 검사 결과가 없습니다.', queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true });
    }
  }, async (selected, targets, hooks) => {
    for (const item of targets) {
      hooks.onStart(item);
      hooks.onResult(item, { kind: 'verified_bing_gui', siteUrl: item.siteUrl, targetUrl: item.url, indexStatus: 'indexed', message: '색인화되었습니다.', reason: '<제외 사유>', canonicalUrl: 'https://one.example/?x=<script>', crawlStatus: 'succeeded', lastCrawledText: null, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true });
    }
  });
}

const sites = [
  { id: 's1', client_id: 'a', name: '사이트 1', url: 'https://one.example/', is_active: true },
  { id: 's2', client_id: 'a', name: '사이트 2', url: 'https://two.example/', is_active: true },
  { id: 'off', client_id: 'a', name: '비활성 사이트', url: 'https://off.example/', is_active: false },
];
const page = { id: 'p1', client_id: 'a', parent_site_id: 's1', name: '등록 글', url: 'https://one.example/post', is_active: true };

// 기존 API 형태의 가짜 목록과 검사 응답으로 외부 호출 없이 실행을 검증합니다.
function fakeApi(overrides = {}) {
  return {
    listSites: async (id) => { assert.equal(id, 'a'); return sites; },
    listPages: async (id) => id === 's1' ? [page, { ...page, id: 'inactive', is_active: false }] : [],
    inspect: async (id, engine) => ({ site_id: id, engine, index_status: 'unknown' }),
    ...overrides,
  };
}

test('활성 사이트와 글을 스냅샷으로 수집하고 각 URL에 API와 GUI 작업을 나눠 만든다', async () => {
  const parents = [];
  const api = fakeApi({ listPages: async (id) => { parents.push(id); return id === 's1' ? [page, page, { ...page, id: 'inactive', is_active: false }] : []; } });

  const targets = await collectClientInspectionTargets(api, 'a');
  assert.deepEqual(parents, ['s1', 's2']);
  assert.deepEqual(targets.map((target) => target.id), ['s1', 'p1', 's2']);

  const tasks = buildClientInspectionTasks(targets);

  assert.equal(tasks.length, 12);
  assert.equal(tasks.filter((task) => task.status === 'queued').length, 12);
  assert.equal(tasks.filter((task) => task.status === 'gui_required').length, 0);

  const scoped = buildClientInspectionTasks([{ ...targets[0], siteUrl: 'https://one.example/blog' }]);

  assert.deepEqual(scoped.map((task) => task.status), ['skipped', 'queued', 'skipped', 'queued']);
});

test('전체 목록 수집 실패나 고객사·부모 불일치이면 외부 검사를 시작하지 않는다', async () => {
  for (const overrides of [
    { listPages: async (id) => { if (id === 's2') throw new Error('통신 오류'); return [page]; } },
    { listSites: async () => [{ ...sites[0], client_id: 'b' }] },
    { listPages: async () => [{ ...page, parent_site_id: 'other' }] },
  ]) {
    let posts = 0;
    const controller = createClientInspectionController(fakeApi({ ...overrides, inspect: async () => { posts += 1; } }));

    await controller.start('a', 'A');
    assert.equal(posts, 0);
    assert.equal(controller.getState().phase, 'failed');
  }
});

test('API 저장과 네이버 GUI 관측을 구분하고 Bing 크롤링을 색인 완료로 바꾸지 않는다', async () => {
  const calls = [];
  let inflight = 0;
  const controller = createClientInspectionController(fakeApi({ inspect: async (id, engine) => {
    inflight += 1;
    assert.equal(inflight, 1);
    calls.push([id, engine]);
    await Promise.resolve();
    inflight -= 1;

    return { site_id: id, engine, index_status: 'unknown' };
  } }));

  await controller.start('a', '<고객사>');
  assert.equal(calls.length, 6);
  assert.ok(calls.every(([, engine]) => engine !== 'naver'));

  const run = controller.getState();

  assert.equal(run.targetCount, 3);
  assert.equal(run.tasks.filter((task) => task.status === 'succeeded').length, 3);
  assert.equal(run.tasks.filter((task) => task.status === 'partial').length, 3);
  assert.equal(run.tasks.filter((task) => task.status === 'observed').length, 6);

  const html = renderClientInspection(run, 'a', '<고객사>', false);

  assert.match(html, /GUI 관측 6건/);
  assert.match(html, /API 처리 6\/6건/);
  assert.ok(html.includes('&lt;고객사&gt;'));
  assert.ok(html.includes('&lt;제외 사유&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.equal(run.tasks.filter((task) => task.engine === 'bing' && task.route === 'api' && task.status === 'partial').length, 3);
  assert.ok(!renderClientInspection(run, 'b', 'B', false).includes('https://one.example'));
});

test('엔진 인증 오류는 해당 엔진만 중단하고 다른 엔진은 계속 조회한다', async () => {
  const calls = [];
  const controller = createClientInspectionController(fakeApi({ inspect: async (id, engine) => {
    calls.push(engine);
    if (engine === 'google') throw new ApiError(503, '인증 필요', { code: 'GOOGLE_AUTH_REFRESH_FAILED' });
    return { site_id: id, engine };
  } }));

  await controller.start('a', 'A');
  assert.equal(calls.filter((engine) => engine === 'google').length, 1);
  assert.equal(calls.filter((engine) => engine === 'bing').length, 3);
  assert.equal(controller.getState().tasks.filter((task) => task.status === 'blocked').length, 2);
});

test('단일 URL 권한 오류는 다음 URL을 막지 않고 서버 응답 불명은 남은 API를 중단한다', async () => {
  for (const uncertain of [false, true]) {
    let posts = 0;
    const controller = createClientInspectionController(fakeApi({ inspect: async (id, engine) => {
      posts += 1;
      if (posts === 1) throw new ApiError(uncertain ? 0 : 403, '실패', { code: uncertain ? 'NETWORK_ERROR' : 'ENGINE_PERMISSION' });
      return { site_id: id, engine };
    } }));

    await controller.start('a', 'A');
    assert.equal(posts, uncertain ? 1 : 6);
    assert.equal(controller.getState().tasks.filter((task) => task.status === 'failed').length, 1);
  }
});

test('중복 시작을 무시하고 취소해도 진행 중 요청의 결과는 보존한다', async () => {
  let finish;
  let posts = 0;
  const controller = createClientInspectionController(fakeApi({ inspect: (id, engine) => {
    posts += 1;
    return new Promise((resolve) => { finish = () => resolve({ site_id: id, engine }); });
  } }));
  const running = controller.start('a', 'A');

  for (let attempt = 0; !finish && attempt < 20; attempt += 1) await Promise.resolve();

  await controller.start('b', 'B');
  assert.equal(controller.getState().clientId, 'a');
  controller.cancel();
  finish();
  await running;
  assert.equal(posts, 1);
  assert.equal(controller.getState().phase, 'cancelled');
  assert.equal(controller.getState().tasks[0].status, 'succeeded');
  assert.ok(controller.getState().tasks.some((task) => task.status === 'cancelled'));
});

test('수집 중 취소하면 API 검사를 시작하지 않는다', async () => {
  let finish;
  let posts = 0;
  const controller = createClientInspectionController(fakeApi({
    listSites: () => new Promise((resolve) => { finish = () => resolve(sites); }),
    inspect: async () => { posts += 1; },
  }));
  const running = controller.start('a', 'A');

  controller.cancel();
  finish();
  await running;
  assert.equal(posts, 0);
  assert.equal(controller.getState().phase, 'cancelled');
});

// 탭 준비가 부족하면 자동 실행하지 않고 명시적인 API 전용 진행이나 취소를 기다립니다.
test('탭이 없으면 API 전송 없이 선택 대기하고 명시적으로 API만 진행할 수 있다', async () => {
  let posts = 0;
  const factory = () => createWorkTabController({ list: async () => [], check: async () => assert.fail('후보 없음'), available: () => true });
  const controller = createController(fakeApi({ inspect: async (id, engine) => { posts += 1; return { site_id: id, engine }; } }), undefined, { naver: factory(), bing: factory() });

  await controller.start('a', 'A');
  assert.equal(controller.getState().phase, 'awaiting_tabs');
  assert.equal(posts, 0);

  const scope = controller.getState().scope;

  await controller.continueApiOnly('old-scope');
  assert.equal(posts, 0);
  await controller.continueApiOnly(scope);
  assert.equal(posts, 6);
  assert.equal(controller.getState().phase, 'finished');
  assert.equal(controller.getState().tabs.naver.selected, null);
});

// 필요한 엔진마다 하나인 탭만 자동 검증하고 전체 URL에 동일한 선택을 사용합니다.
test('엔진별 단일 탭은 자동 검증하고 여러 URL을 처리해도 선택을 초기화하지 않는다', async () => {
  const checks = [];
  const factory = () => createWorkTabController({
    list: async () => [{ tabId: 1, engine: 'naver' }, { tabId: 2, engine: 'bing' }],
    check: async (tab) => { checks.push(tab.tabId); return { connected: true, tab }; },
    available: () => true,
  });
  const controller = createController(fakeApi(), undefined, { naver: factory(), bing: factory() });

  await controller.start('a', 'A');
  assert.equal(controller.getState().phase, 'finished');
  assert.deepEqual(checks, [1, 2]);
  assert.equal(controller.getState().tabs.naver.selected.tabId, 1);
  assert.equal(controller.getState().tabs.bing.selected.tabId, 2);
});

// 여러 후보 중 사용자가 선택한 탭을 재검증한 뒤 API 실행을 자동 재개합니다.
test('여러 네이버 후보는 선택을 기다리고 잘못된 실행·탭 ID는 무시한다', async () => {
  const tabs = [{ tabId: 1, engine: 'naver' }, { tabId: 2, engine: 'naver' }, { tabId: 3, engine: 'bing' }];
  let posts = 0;
  const factory = () => createWorkTabController({ list: async () => tabs, check: async (tab) => ({ connected: true, tab }), available: () => true });
  const controller = createController(fakeApi({ inspect: async (id, engine) => { posts += 1; return { site_id: id, engine }; } }), undefined, { naver: factory(), bing: factory() });

  await controller.start('a', 'A');

  const scope = controller.getState().scope;

  assert.equal(controller.getState().phase, 'awaiting_tabs');
  assert.equal(controller.getState().tabs.bing.selected.tabId, 3);
  await controller.chooseTab('old-scope', 'naver', '1');
  await controller.chooseTab(scope, 'naver', '999');
  assert.equal(posts, 0);
  await controller.chooseTab(scope, 'naver', '2');
  assert.equal(posts, 6);
  assert.equal(controller.getState().tabs.naver.selected.tabId, 2);
});

// 선택 대기 취소는 즉시 종료되고 이전 실행의 폼으로 새 실행을 조작할 수 없습니다.
test('탭 선택 대기 중 취소와 이전 실행 선택을 안전하게 처리한다', async () => {
  const factory = () => createWorkTabController({ list: async () => [], check: async () => assert.fail('후보 없음'), available: () => true });
  const controller = createController(fakeApi({ inspect: async () => assert.fail('취소 후 전송 금지') }), undefined, { naver: factory(), bing: factory() });

  await controller.start('a', 'A');

  const scope = controller.getState().scope;

  controller.cancel();
  assert.equal(controller.getState().phase, 'cancelled');
  await controller.start('a', 'A');
  assert.notEqual(controller.getState().scope, scope);
  await controller.continueApiOnly(scope);
  assert.equal(controller.getState().phase, 'awaiting_tabs');
  controller.cancel();
});

// 종료된 실행에서도 읽기 시작·실패 상태가 새 렌더에 의해 접히지 않게 합니다.
test('네이버 미리보기 로딩과 실패 안내는 종료된 실행에서도 펼쳐서 표시한다', async () => {
  const controller = createClientInspectionController(fakeApi());

  await controller.start('a', 'A');

  for (const naverPreview of [{ loading: true }, { loading: false, error: '읽기 스크립트 연결 없음' }]) {
    const dom = new JSDOM(renderClientInspection({ ...controller.getState(), naverPreview }, 'a', 'A', false));

    try {
      assert.equal(dom.window.document.querySelector('.inspection-tab-section').open, true);
      if (naverPreview.error) assert.match(dom.window.document.querySelector('.naver-preview [role="alert"]').textContent, /연결 없음/);
    } finally { dom.window.close(); }
  }
});
