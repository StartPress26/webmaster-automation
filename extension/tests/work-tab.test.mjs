import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorkTabController } from '../src/tabs/controller.ts';
import { renderWorkTabPanel } from '../src/tabs/view.ts';

const tabs = [
  { tabId: 1, engine: 'naver', title: '네이버', url: 'https://searchadvisor.naver.com/console/' },
  { tabId: 2, engine: 'google', title: 'Google', url: 'https://search.google.com/search-console/' },
  { tabId: 3, engine: 'bing', title: 'Bing', url: 'https://www.bing.com/webmasters/' },
];

// 각 엔진은 자기 후보만 선택받고 다음 실행 때 선택한 탭을 다시 검증합니다.
test('탭 컨트롤러와 선택 화면은 세 엔진을 공통으로 지원한다', async () => {
  for (const tab of tabs) {
    let checks = 0;
    const controller = createWorkTabController({
      list: async () => [...tabs, { ...tab, tabId: 99 }],
      check: async (selected) => { checks += 1; return { connected: true, tab: selected }; },
      available: () => true,
    });
    await controller.prepare('scope', tab.engine);
    assert.deepEqual(controller.getState().candidates, [tab, { ...tab, tabId: 99 }]);
    assert.equal(controller.getState().selected, null);
    assert.equal(checks, 0);
    const html = renderWorkTabPanel(controller.getState(), 'scope', tab.title);
    assert.ok(html.includes(`${tab.title} 작업 탭`));
    assert.equal(renderWorkTabPanel(controller.getState(), 'other', tab.title), '');
    await controller.prepare('scope', tab.engine, '999');
    assert.equal(checks, 0);
    await controller.prepare('scope', tab.engine, String(tab.tabId));
    assert.equal(controller.getState().selected, tab);
    await controller.prepare('scope', tab.engine);
    assert.equal(checks, 2);
  }
});

// 초기화된 이전 목록 요청이 늦게 끝나도 새 선택 범위와 진행 상태를 덮어쓰지 않습니다.
test('범위 초기화 후 늦은 응답과 이전 finally는 새 요청에 영향을 주지 않는다', async () => {
  let finishOld;
  let finishNew;
  let calls = 0;
  const controller = createWorkTabController({
    list: () => new Promise((resolve) => { calls += 1; if (calls === 1) finishOld = resolve; else finishNew = resolve; }),
    check: async () => ({ connected: false, reason: 'not_ready' }),
    available: () => true,
  });
  const oldRequest = controller.prepare('a', 'naver');
  controller.reset();
  const newRequest = controller.prepare('b', 'bing');
  finishOld(tabs);
  await oldRequest;
  assert.equal(controller.getState().scope, 'b');
  assert.equal(controller.getState().busy, true);
  finishNew(tabs);
  await newRequest;
  assert.equal(controller.getState().busy, false);
  assert.deepEqual(controller.getState().candidates, [tabs[2]]);
});

// 확인 실패 시 이전 선택을 제거하고 후보 재조회와 원인 안내를 제공합니다.
test('유효하지 않은 기존 선택은 실패 사유와 재선택으로 전환한다', async () => {
  const controller = createWorkTabController({
    list: async () => tabs,
    check: async () => ({ connected: false, reason: 'url_changed' }),
    available: () => true,
  });
  await controller.prepare('scope', 'bing');
  await controller.prepare('scope', 'bing', '3');
  assert.equal(controller.getState().selected, null);
  assert.equal(controller.getState().choosing, true);
  assert.match(controller.getState().message, /주소가 바뀌었습니다/);
});

// API 미지원 환경과 접근 오류는 원문 예외 대신 고정된 안내만 표시합니다.
test('탭 조회 오류는 환경별 안내로 처리하고 진행 상태를 해제한다', async () => {
  for (const available of [true, false]) {
    const controller = createWorkTabController({
      list: async () => { throw new Error('비공개 예외'); },
      check: async () => assert.fail('선택 없음'),
      available: () => available,
    });
    await controller.prepare('scope', 'google');
    assert.equal(controller.getState().busy, false);
    assert.match(controller.getState().message, available ? /접근 권한/ : /설치된 Chrome/);
    assert.ok(!controller.getState().message.includes('비공개 예외'));
  }
});

// 외부 탭 제목·주소와 엔진 표시 이름은 실행 가능한 HTML로 삽입하지 않습니다.
test('탭 선택 화면은 외부 문자열을 이스케이프한다', async () => {
  const controller = createWorkTabController({
    list: async () => [{ ...tabs[0], title: '<script>bad</script>', url: 'https://example.com/?a="x"&b=2' }, { ...tabs[0], tabId: 99 }],
    check: async () => assert.fail('선택 없음'),
    available: () => true,
  });
  await controller.prepare('scope', 'naver');
  const html = renderWorkTabPanel(controller.getState(), 'scope', '<엔진>');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;엔진&gt;'));
  assert.ok(html.includes('&quot;x&quot;&amp;b=2'));
});

// 목록 조회 직후 단일 후보가 닫히거나 이동해도 검증 성공으로 저장하지 않습니다.
test('단일 후보 자동 선택도 닫힘·주소 변경·문서 준비 여부를 재검증한다', async () => {
  for (const reason of ['unavailable', 'url_changed', 'not_ready']) {
    let checks = 0;
    const controller = createWorkTabController({
      list: async () => [tabs[0]],
      check: async () => { checks += 1; return { connected: false, reason }; },
      available: () => true,
    });
    await controller.prepare('scope', 'naver');
    assert.equal(checks, 1);
    assert.equal(controller.getState().selected, null);
    assert.equal(controller.getState().choosing, true);
  }
});
