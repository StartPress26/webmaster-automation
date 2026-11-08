import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { collectClientInspectionTargets, buildClientInspectionTasks } from '../src/inspection/client-plan.ts';
import { createClientInspectionController as createController } from '../src/inspection/client-controller.ts';
import { createWorkTabController } from '../src/tabs/controller.ts';
import { renderClientInspection } from '../src/inspection/client-view.ts';
import { ApiError } from '../src/errors.ts';

// 외부 탭 없이 엔진별 작업을 준비하는 컨트롤러를 만듭니다.
function parallelController(naver, bing, overrides = {}) {
  const tabs = [{ tabId: 1, engine: 'naver', title: '네이버', url: 'https://searchadvisor.naver.com/console/board' }, { tabId: 2, engine: 'bing', title: 'Bing', url: 'https://www.bing.com/webmasters/' }];
  const factory = () => createWorkTabController({ list: async () => tabs, check: async (tab) => ({ connected: true, tab }), available: () => true });
  return createController(fakeApi(overrides), undefined, { naver: factory(), bing: factory() }, naver, bing);
}

// 테스트에서 엔진의 완료 순서를 직접 제어합니다.
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve: () => resolve() };
}

// 병렬 제어 검증에 필요한 엔진별 정상 관측을 만듭니다.
function guiResult(engine, item) {
  const common = { siteUrl: item.siteUrl, targetUrl: item.url, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true };
  return engine === 'naver'
    ? { ...common, kind: 'verified_gui', indexStatus: 'unknown', message: 'URL 검사 결과가 없습니다.' }
    : { ...common, kind: 'verified_bing_gui', indexStatus: 'indexed', message: '색인화되었습니다.', reason: null, canonicalUrl: null, crawlStatus: 'unknown', lastCrawledText: null };
}

// Promise 대기 중인 컨트롤러의 상태를 타이머 없이 확인합니다.
async function flushController() {
  for (let i = 0; i < 80; i += 1) await Promise.resolve();
}

test('네이버가 끝나기 전에 Bing도 시작하고 두 엔진이 모두 끝나야 전체 완료한다', async () => {
  const started = []; const gates = { naver: deferred(), bing: deferred() };
  const runner = (engine) => async (_, targets, hooks) => {
    started.push(engine); hooks.onStart(targets[0]);
    await gates[engine].promise;
    for (const target of targets) await hooks.onResult(target, guiResult(engine, target));
  };
  const controller = parallelController(runner('naver'), runner('bing'));
  const running = controller.start('a', 'A');
  try {
    await flushController();
    assert.deepEqual(started, ['naver', 'bing']);
    gates.bing.resolve(); await flushController();
    assert.equal(controller.getState().phase, 'running');
    assert.equal(controller.getState().tasks.filter((task) => task.engine === 'bing' && task.route === 'gui' && task.status === 'succeeded').length, 3);
    gates.naver.resolve(); await running;
    assert.equal(controller.getState().phase, 'finished');
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 6);
  } finally { gates.naver.resolve(); gates.bing.resolve(); await running; }
});

test('GUI 한쪽 실패는 다른 엔진의 진행·취소 신호·결과에 영향을 주지 않는다', async () => {
  for (const failing of ['naver', 'bing']) {
    const gate = deferred(); const started = [];
    const runner = (engine) => async (_, targets, hooks) => {
      started.push(engine); hooks.onStart(targets[0]);
      if (engine === failing) throw new Error('해당 엔진 실패');
      await gate.promise;
      assert.equal(hooks.signal.aborted, false);
      for (const target of targets) await hooks.onResult(target, guiResult(engine, target));
    };
    const controller = parallelController(runner('naver'), runner('bing'));
    const running = controller.start('a', 'A');
    try {
      await flushController();
      assert.deepEqual(started, ['naver', 'bing']);
      assert.equal(controller.getState().phase, 'running');
      assert.equal(controller.getState().tasks.filter((task) => task.engine === failing && task.route === 'gui' && task.status === 'failed').length, 1);
      gate.resolve(); await running;
      assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 3);
      assert.equal(controller.getState().phase, 'finished');
    } finally { gate.resolve(); await running; }
  }
});

test('전체 취소는 동시에 실행 중인 두 GUI에 전달하고 이미 완료된 관측은 보존한다', async () => {
  const signals = [];
  const runner = (engine) => async (_, targets, hooks) => {
    signals.push(hooks.signal);
    hooks.onStart(targets[0]); await hooks.onResult(targets[0], guiResult(engine, targets[0]));
    hooks.onStart(targets[1]);
    await new Promise((_, reject) => hooks.signal.addEventListener('abort', () => reject(new Error('취소')), { once: true }));
    assert.fail('취소 이후 다음 조회 금지');
  };
  const controller = parallelController(runner('naver'), runner('bing'));
  const running = controller.start('a', 'A');
  try {
    await flushController();
    assert.equal(signals.length, 2);
    controller.cancel(); await running;
    assert.ok(signals.every((signal) => signal.aborted));
    assert.equal(controller.getState().phase, 'cancelled');
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 2);
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'cancelled').length, 4);
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'api' && (task.status === 'partial' || task.status === 'succeeded')).length, 6);
  } finally { controller.cancel(); await running; }
});

// API 실행 검증에서는 엔진별 탭 하나를 실제 탭 모듈로 자동 준비합니다.
function createClientInspectionController(api, changed) {
  const tabs = ['naver', 'bing'].map((engine, index) => ({ tabId: index + 1, engine, title: engine, url: `https://${engine}.example/` }));
  const factory = () => createWorkTabController({ list: async () => tabs, check: async (tab) => ({ connected: true, tab }), available: () => true });

  return createController(api, changed, { naver: factory(), bing: factory() }, async (selected, targets, hooks) => {
    for (const item of targets) {
      hooks.onStart(item);
      await hooks.onResult(item, { kind: 'verified_gui', siteUrl: item.siteUrl, targetUrl: item.url, indexStatus: 'unknown', message: 'URL 검사 결과가 없습니다.', queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true });
    }
  }, async (selected, targets, hooks) => {
    for (const item of targets) {
      hooks.onStart(item);
      await hooks.onResult(item, { kind: 'verified_bing_gui', siteUrl: item.siteUrl, targetUrl: item.url, indexStatus: 'indexed', message: '색인화되었습니다.', reason: '<제외 사유>', canonicalUrl: 'https://one.example/?x=<script>', crawlStatus: 'succeeded', lastCrawledText: null, queriedAt: new Date().toISOString(), readAt: new Date().toISOString(), targetVerified: true });
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
    saveGuiInspection: async (id, data) => ({ site_id: id, engine: data.engine, index_status: data.index_status, last_checked_at: data.observed_at, next_check_at: null, error_message: null }),
    ...overrides,
  };
}

test('GUI 결과의 필드·대상 ID를 저장 API에 전달하고 저장 완료까지 기다린다', async () => {
  const calls = [];
  const gate = deferred();
  const runner = (engine) => async (_, targets, hooks) => {
    for (const target of targets) {
      hooks.onStart(target);
      await hooks.onResult(target, guiResult(engine, target));
    }
  };
  const controller = parallelController(runner('naver'), runner('bing'), {
    saveGuiInspection: async (id, data) => {
      calls.push([id, data]);
      await gate.promise;
      return { site_id: id, engine: data.engine, index_status: data.index_status, last_checked_at: data.observed_at, next_check_at: null, error_message: null };
    },
  });
  const running = controller.start('a', 'A');
  try {
    await flushController();
    assert.equal(calls.length, 2);
    assert.equal(controller.getState().phase, 'running');
    assert.equal(controller.getState().tasks.filter((task) => task.status === 'saving').length, 2);
    assert.ok(renderClientInspection(controller.getState(), 'a', 'A', false).includes('GUI 관측 저장 중'));
    gate.resolve();
    await running;
    assert.equal(calls.length, 6);
    for (const [id, data] of calls) {
      const task = controller.getState().tasks.find((item) => item.target.id === id && item.engine === data.engine && item.route === 'gui');
      const observation = task.guiObservation;
      assert.deepEqual(data, {
        engine: task.engine, site_url: observation.siteUrl, target_url: observation.targetUrl,
        index_status: observation.indexStatus, queried_at: observation.queriedAt, observed_at: observation.readAt,
      });
    }
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 6);
  } finally { gate.resolve(); await running; }
});

test('GUI 저장 실패는 관측을 보존하고 해당 엔진만 중단하며 자동 재시도하지 않는다', async () => {
  for (const status of [0, 409, 500]) {
    const calls = [];
    const runner = (engine) => async (_, targets, hooks) => {
      for (const target of targets) {
        hooks.onStart(target);
        await hooks.onResult(target, guiResult(engine, target));
      }
    };
    const controller = parallelController(runner('naver'), runner('bing'), {
      saveGuiInspection: async (id, data) => {
        calls.push(data.engine);
        if (data.engine === 'naver') throw new ApiError(status, '저장 오류');
        return { site_id: id, engine: data.engine, index_status: data.index_status, last_checked_at: data.observed_at, next_check_at: null, error_message: null };
      },
    });
    await controller.start('a', 'A');
    const run = controller.getState();
    assert.equal(calls.filter((engine) => engine === 'naver').length, 1);
    assert.equal(calls.filter((engine) => engine === 'bing').length, 3);
    const failure = run.tasks.find((task) => task.status === 'save_failed');
    assert.ok(failure.guiObservation);
    assert.match(failure.message, status === 409 ? /DB 저장 실패/ : /DB 저장 응답 미확인/);
    assert.equal(run.tasks.filter((task) => task.engine === 'naver' && task.status === 'blocked').length, 2);
    assert.equal(run.tasks.filter((task) => task.engine === 'bing' && task.route === 'gui' && task.status === 'succeeded').length, 3);
    const html = renderClientInspection(run, 'a', 'A', false);
    assert.match(html, /GUI 저장 확인 실패/);
    assert.match(html, /GUI 저장 확인 3건/);
  }
});

test('GUI 저장 중 취소하면 현재 저장 응답을 보존하고 후속 URL은 실행하지 않는다', async () => {
  const gate = deferred();
  const calls = [];
  const runner = (engine) => async (_, targets, hooks) => {
    for (const target of targets) {
      if (hooks.signal.aborted) throw new Error('취소');
      hooks.onStart(target);
      await hooks.onResult(target, guiResult(engine, target));
    }
  };
  const controller = parallelController(runner('naver'), runner('bing'), {
    saveGuiInspection: async (id, data) => {
      calls.push([id, data.engine]);
      await gate.promise;
      return { site_id: id, engine: data.engine, index_status: data.index_status, last_checked_at: data.observed_at, next_check_at: null, error_message: null };
    },
  });
  const running = controller.start('a', 'A');
  try {
    await flushController();
    controller.cancel();
    assert.equal(controller.getState().phase, 'running');
    gate.resolve();
    await running;
    assert.equal(calls.length, 2);
    assert.equal(controller.getState().phase, 'cancelled');
    assert.equal(controller.getState().tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 2);
    assert.equal(controller.getState().tasks.filter((task) => task.status === 'cancelled').length, 4);
  } finally { gate.resolve(); await running; }
});

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
  assert.equal(run.tasks.filter((task) => task.route === 'api' && task.status === 'succeeded').length, 3);
  assert.equal(run.tasks.filter((task) => task.status === 'partial').length, 3);
  assert.equal(run.tasks.filter((task) => task.route === 'gui' && task.status === 'succeeded').length, 6);

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
