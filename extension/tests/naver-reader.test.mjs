import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { NAVER_INDEXED_MESSAGE, NAVER_READ_MESSAGE, NAVER_AUTOMATION_MESSAGE, readNaverVisibleObservation } from '../src/engines/naver/observation.ts';
import { readNaverPreview } from '../src/engines/naver/preview.ts';

const pageUrl = 'https://searchadvisor.naver.com/console/site/check/inspection?site=https%3A%2F%2Fexample.com';
const target = { siteUrl: 'https://example.com/', url: 'https://example.com/' };
const html = `<input type="url" value="https://example.com/"><p>${NAVER_INDEXED_MESSAGE}</p><button>최종 업데이트 <span>26. 10. 29.</span></button><button>색인 완료 예</button>`;

// 레이아웃 엔진이 없는 jsdom에서 표시 영역만 고정하고 DOM 판독 규칙을 검증합니다.
function screen(content = html, url = pageUrl) {
  const dom = new JSDOM(content, { url, runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete', configurable: true });
  dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
  return dom;
}

test('실제 확인한 색인 문구·입력 URL·업데이트 표시를 읽되 결과 연결은 미검증으로 유지한다', () => {
  const dom = screen();

  try {
    const result = readNaverVisibleObservation(dom.window.document, pageUrl, '2026-11-08T05:00:00Z');

    assert.equal(result.ok, true);
    assert.equal(result.observation.siteUrl, 'https://example.com/');
    assert.equal(result.observation.inputUrl, 'https://example.com/');
    assert.equal(result.observation.indexStatus, 'indexed');
    assert.equal(result.observation.engineUpdatedText, '최종 업데이트 26. 10. 29.');
    assert.equal(result.observation.targetVerified, false);
    assert.equal(result.observation.readAt, '2026-11-08T05:00:00Z');
    dom.window.document.querySelector('input').value = 'https://example.com/other';
    assert.equal(readNaverVisibleObservation(dom.window.document, pageUrl).observation.targetVerified, false);
  } finally { dom.window.close(); }
});

test('숨김·중복 결과·다중 입력·알 수 없는 판정은 색인 결과로 사용하지 않는다', () => {
  for (const content of [
    `<input value="https://example.com/"><p hidden>${NAVER_INDEXED_MESSAGE}</p>`,
    `<input value="https://example.com/"><div style="display:none"><p>${NAVER_INDEXED_MESSAGE}</p></div>`,
    `${html}<p>${NAVER_INDEXED_MESSAGE}</p>`,
    `${html}<input value="https://example.com/another">`,
    '<input value="https://example.com/"><p>검색 결과가 없습니다</p>',
    `${html}<button>색인 완료 아니오</button>`,
  ]) {
    const dom = screen(content);
    try { assert.equal(readNaverVisibleObservation(dom.window.document, pageUrl).ok, false); }
    finally { dom.window.close(); }
  }
});

test('실제 화면의 수집·미색인 판정만 읽고 안내와 수집 요청은 제외한다', async () => {
  const judgement = '문서가 성공적으로 수집됐습니다. 미색인 문서로 검색대상이 아닙니다.';
  const dom = screen(`<input value="https://example.com/"><div>
    <div>${judgement}</div>
    <div>만약 페이지가 변경되었다면 최신 페이지 정보가 검색될 수 있게 수집 요청해보세요.</div>
    <div><button>가이드</button></div><div><button>수집 요청</button></div>
  </div>`);
  try {
    const preview = await readNaverPreview({ tabId: 1, engine: 'naver' }, [target], reader(dom));
    assert.equal(preview.message, judgement);
    assert.equal(preview.indexStatus, 'crawled');
    assert.equal(preview.targetVerified, false);
  } finally { dom.window.close(); }
});

test('인증·요약·다른 출처·사이트 미선택 화면은 읽지 않는다', () => {
  const dom = screen();

  try {
    for (const url of ['https://nid.naver.com/', 'https://searchadvisor.naver.com/console/site/summary', 'https://searchadvisor.naver.com.evil.test/console/site/check/inspection', 'https://searchadvisor.naver.com/console/site/check/inspection']) {
      assert.equal(readNaverVisibleObservation(dom.window.document, url).ok, false);
    }
  } finally { dom.window.close(); }
});

// Content Script에서 읽기 전용 응답을 재현하며 보내는 메시지와 조회 횟수를 기록합니다.
function reader(dom, overrides = {}) {
  const tab = { id: 1, url: pageUrl, status: 'complete' };

  return {
    get: async () => tab,
    send: async (id, message) => {
      assert.equal(id, 1);
      assert.equal(message.type, NAVER_READ_MESSAGE);
      return { requestId: message.requestId, result: readNaverVisibleObservation(dom.window.document, pageUrl) };
    },
    ...overrides,
  };
}

test('같은 실행의 등록 사이트·URL만 받아들이고 다른 고객사 대상과 변조 응답을 거부한다', async () => {
  const dom = screen();
  const selected = { tabId: 1, engine: 'naver', url: pageUrl, title: '네이버' };

  try {
    const observation = await readNaverPreview(selected, [target], reader(dom));
    assert.equal(observation.targetVerified, false);
    await assert.rejects(readNaverPreview(selected, [{ ...target, url: 'https://other.example/' }], reader(dom)), /일치하지 않습니다/);
    await assert.rejects(readNaverPreview(selected, [target], reader(dom, { send: async () => ({ requestId: 'wrong', result: {} }) })), /다릅니다/);

    let gets = 0;

    await assert.rejects(readNaverPreview(selected, [target], reader(dom, { get: async () => ({ id: 1, status: 'complete', url: ++gets === 1 ? pageUrl : `${pageUrl}&changed=1` }) })), /이동하거나/);
    await assert.rejects(readNaverPreview(selected, [target], reader(dom, { send: () => new Promise(() => {}) }), 1), /응답 시간이 초과/);
  } finally { dom.window.close(); }
});

test('사이트 요약에서 검증 페이지로 이동한 선택 탭은 허용하되 준비되지 않은 탭은 읽지 않는다', async () => {
  const dom = screen();
  const selected = { tabId: 1, engine: 'naver', url: 'https://searchadvisor.naver.com/console/site/summary', title: '네이버' };

  try {
    assert.equal((await readNaverPreview(selected, [target], reader(dom))).kind, 'visible_preview');
    await assert.rejects(readNaverPreview(selected, [target], reader(dom, { get: async () => ({ url: selected.url, status: 'complete' }) })), /색인 상태 확인/);
    await assert.rejects(readNaverPreview(selected, [target], reader(dom, { get: async () => ({ id: 1, url: pageUrl, status: 'loading' }) })), /로딩/);
  } finally { dom.window.close(); }
});

test('인증 콜백 문서에서는 읽지 않고 SPA 콘솔 이동 후 같은 수신기로 결과를 읽는다', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));

  assert.deepEqual(manifest.content_scripts[0].matches, ['https://searchadvisor.naver.com/*']);

  const dom = screen(html, 'https://searchadvisor.naver.com/auth/callback');
  let handler;

  dom.window.chrome = { runtime: { id: 'extension-id', getURL: () => 'chrome-extension://extension-id/index.html', onMessage: { addListener: (listener) => { handler = listener; } } } };

  try {
    const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: { entry: fileURLToPath(new URL('../src/engines/naver/content.ts', import.meta.url)), name: 'StartPressNaverReader', formats: ['iife'] } } });

    const source = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output).find((item) => item.type === 'chunk').code;

    assert.ok(!/^import\s/m.test(source));
    dom.window.eval(source);

    let response;
    const message = { type: NAVER_READ_MESSAGE, requestId: 'request-1' };
    const respond = (value) => { response = value; };

    handler(message, { id: 'other-extension', url: 'chrome-extension://extension-id/index.html' }, respond);
    handler(message, { id: 'extension-id', url: 'https://example.com/index.html' }, respond);
    assert.equal(response, undefined);

    let queries = 0;
    const originalQuery = dom.window.document.querySelectorAll.bind(dom.window.document);

    dom.window.document.querySelectorAll = (...args) => { queries += 1; return originalQuery(...args); };
    handler(message, { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' }, respond);
    assert.equal(response.result.code, 'wrong_page');
    assert.equal(queries, 0);
    dom.window.history.replaceState({}, '', pageUrl);
    handler(message, { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' }, respond);
    assert.equal(response.requestId, 'request-1');
    assert.equal(response.result.ok, true);
    assert.equal(response.result.observation.targetVerified, false);

    const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' };

    handler({ type: NAVER_AUTOMATION_MESSAGE, requestId: 'state-1', action: 'state' }, sender, respond);

    const documentToken = response.value.documentToken;

    handler({ type: NAVER_AUTOMATION_MESSAGE, requestId: 'cancel-1', action: 'cancel', operationId: 'later-query' }, sender, respond);
    handler({ type: NAVER_AUTOMATION_MESSAGE, requestId: 'later-query', action: 'inspect_url', documentToken, siteUrl: 'https://example.com/', targetUrl: 'https://example.com/post' }, sender, respond);
    assert.equal(response.code, 'cancelled');

  } finally { dom.window.close(); }
});

// 미리보기와 자동 조회가 같은 판독 규칙을 사용하고 실제 미수집 여부는 추정하지 않습니다.
test('아이콘과 인라인 서식은 제외하고 판정만 읽으며 결과 없음은 수집 미확인으로 유지한다', async () => {
  for (const content of [
    '<div><i class="v-icon">error_outline</i> URL 검사 결과가 없습니다.</div>',
    '<div><svg><text>error_outline</text></svg><span>URL </span><span>검사 결과가 없습니다.</span></div>',
  ]) {
    const dom = screen(`<input value="https://example.com/">${content}`);

    try {
      const result = readNaverVisibleObservation(dom.window.document, pageUrl);

      assert.equal(result.ok, true);
      assert.equal(result.observation.message, 'URL 검사 결과가 없습니다.');
      assert.equal(result.observation.indexStatus, 'unknown');
      const preview = await readNaverPreview({ tabId: 1, engine: 'naver' }, [target], reader(dom));
      assert.equal(preview.indexStatus, 'unknown');
      assert.equal(preview.targetVerified, false);
    } finally { dom.window.close(); }
  }

  const dom = screen('<input value="https://example.com/"><div><i>check_circle</i>문서가 성공적으로 <strong>색인</strong>됐습니다. 해당 문서를 검색할 수 있습니다.</div>');

  try { assert.equal(readNaverVisibleObservation(dom.window.document, pageUrl).observation.message, NAVER_INDEXED_MESSAGE); }
  finally { dom.window.close(); }
});
