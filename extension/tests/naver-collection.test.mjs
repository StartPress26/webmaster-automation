import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { JSDOM } from 'jsdom';
import { NAVER_AUTOMATION_MESSAGE, naverPageState } from '../src/engines/naver/observation.ts';
import { openNaverBoard, openNaverCollection, requestNaverCollection, selectNaverCollectionSite } from '../src/engines/naver/collection.ts';
import { waitPage } from '../src/engines/naver/automation.ts';

const site = 'https://one.example/';
const target = `${site}post`;
const pageUrl = `https://searchadvisor.naver.com/console/site/request/crawl?site=${encodeURIComponent(site)}`;

// 네이버가 실제로 표시하는 한국 시각의 초 단위 등록일을 만듭니다.
function registeredText(offsetMs = 0) {
  const stamp = new Date(Date.now() + offsetMs + 9 * 60 * 60 * 1000).toISOString();
  return `${stamp.slice(2, 4)}.${stamp.slice(5, 7)}.${stamp.slice(8, 10)} ${stamp.slice(11, 19)}`;
}

// 실제 수집 내역의 URL 링크와 등록일 열을 재현합니다.
function row(url = target, date = registeredText()) {
  return `<tr><td>1</td><td><a href="${url}">${new URL(url).pathname}</a></td><td>${date}</td></tr>`;
}

// 레이아웃만 보완하고 실제 입력 이벤트와 DOM 변경 감시를 사용합니다.
function screen(rows = '', url = pageUrl) {
  const dom = new JSDOM(`<label for="target">${site}</label><input id="target" maxlength="2048"><button>확인</button><table><thead><tr><th>No</th><th>URL</th><th>등록일</th></tr></thead><tbody>${rows}</tbody></table>`, { url, runScripts: 'outside-only' });
  Object.defineProperty(dom.window.document, 'readyState', { value: 'complete' });
  dom.window.Element.prototype.getClientRects = () => [{ width: 100, height: 20 }];
  return dom;
}

test('웹마스터 도구는 같은 출처의 정확한 목록 링크 하나만 클릭한다', () => {
  const dom = screen('', `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`);
  const doc = dom.window.document;
  doc.body.innerHTML = '<a href="/console/board"> 웹마스터 도구 </a><a href="/guide">웹마스터 가이드</a>';
  let clicks = 0;
  doc.querySelector('a').onclick = (event) => { event.preventDefault(); clicks += 1; };
  try {
    openNaverBoard(doc, dom.window.location.href);
    assert.equal(clicks, 1);
    doc.querySelector('a').href = 'https://outside.example/console/board';
    assert.throws(() => openNaverBoard(doc, dom.window.location.href), (error) => error.code === 'ambiguous_control');
    assert.throws(() => openNaverBoard(doc, 'https://searchadvisor.naver.com/auth/login'), (error) => error.code === 'auth_required');
    assert.equal(clicks, 1);
  } finally { dom.window.close(); }
});

test('목록 표가 먼저 표시돼도 지연된 목표 사이트 링크를 기다린 뒤 한 번 선택한다', async () => {
  const dom = screen('', 'https://searchadvisor.naver.com/console/board');
  const doc = dom.window.document;
  doc.body.innerHTML = '<table><tbody></tbody></table>';
  let clicks = 0;
  const pending = selectNaverCollectionSite(doc, site, new AbortController().signal, 1000);
  setTimeout(() => {
    doc.querySelector('tbody').innerHTML = `<tr><td><a href="#">${site}</a></td></tr>`;
    doc.querySelector('a').onclick = (event) => { event.preventDefault(); clicks += 1; };
  }, 10);
  try {
    await pending;
    assert.equal(clicks, 1);
  } finally { dom.window.close(); }
});

test('사이트 누락은 한도까지 기다리고 중복·취소·주소 변경은 추가 선택 없이 중단한다', async () => {
  for (const mode of ['missing', 'duplicate', 'cancel', 'navigate']) {
    const dom = screen('', 'https://searchadvisor.naver.com/console/board');
    const doc = dom.window.document;
    doc.body.innerHTML = '<table><tbody></tbody></table>';
    const abort = new AbortController();
    const pending = selectNaverCollectionSite(doc, site, abort.signal, 40);
    if (mode === 'duplicate') setTimeout(() => {
      doc.querySelector('tbody').innerHTML = `<tr><td><a href="#">${site}</a><a href="#">${site}</a></td></tr>`;
      doc.querySelectorAll('a').forEach((link) => { link.onclick = () => assert.fail('중복 링크 선택 금지'); });
    }, 1);
    if (mode === 'cancel') setTimeout(() => abort.abort(), 1);
    if (mode === 'navigate') setTimeout(() => {
      dom.window.history.replaceState({}, '', '/console/site/summary');
      doc.body.insertAdjacentHTML('beforeend', '<div>문서 이동</div>');
    }, 1);
    const code = { missing: 'site_missing', duplicate: 'ambiguous_control', cancel: 'cancelled', navigate: 'page_changed' }[mode];
    try { await assert.rejects(pending, (error) => error.code === code); }
    finally { dom.window.close(); }
  }
});

test('대기 완료 직후 사이트 링크의 목적지·표시 이름·유일성·표시 상태가 바뀌면 클릭하지 않는다', async () => {
  for (const mode of ['href', 'text', 'duplicate', 'hidden', 'disabled', 'replaced']) {
    const dom = screen('', 'https://searchadvisor.naver.com/console/board');
    const doc = dom.window.document;
    doc.body.innerHTML = `<table><tbody><tr><td><a href="#">${site}</a></td></tr></tbody></table>`;
    const link = doc.querySelector('a');
    link.onclick = () => assert.fail('변경된 사이트 링크 클릭 금지');
    const pending = selectNaverCollectionSite(doc, site, new AbortController().signal, 1000);
    queueMicrotask(() => {
      if (mode === 'href') link.href = 'https://outside.example/';
      if (mode === 'text') link.textContent = 'https://other.example/';
      if (mode === 'duplicate') link.after(link.cloneNode(true));
      if (mode === 'hidden') link.hidden = true;
      if (mode === 'disabled') link.setAttribute('aria-disabled', 'true');
      if (mode === 'replaced') link.replaceWith(link.cloneNode(true));
    });
    try { await assert.rejects(pending, (error) => error.code === 'page_changed'); }
    finally { dom.window.close(); }
  }
});

test('요약 주소가 먼저 준비돼도 요청 헤더의 지연 렌더를 기다린 뒤 메뉴를 한 번 연다', async () => {
  const summaryUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`;
  const dom = screen('', summaryUrl);
  const doc = dom.window.document;
  doc.body.innerHTML = '<div id="navigation"></div>';
  let opened = 0;
  let selected = 0;
  const pending = openNaverCollection(doc, site, new AbortController().signal, 1000);
  setTimeout(() => {
    doc.querySelector('#navigation').innerHTML = '<button aria-expanded="false">요청</button><div id="items"></div>';
    doc.querySelector('button').onclick = () => {
      opened += 1;
      doc.querySelector('button').setAttribute('aria-expanded', 'true');
      doc.querySelector('#items').innerHTML = '<div class="v-list-item">웹 페이지 수집</div>';
      doc.querySelector('.v-list-item').onclick = () => { selected += 1; dom.window.history.replaceState({}, '', pageUrl); };
    };
  }, 10);
  try {
    await pending;
    assert.equal(opened, 1);
    assert.equal(selected, 1);
  } finally { dom.window.close(); }
});

test('요청 헤더 대기 중 취소·문서 이동·중복 헤더는 메뉴를 클릭하지 않는다', async () => {
  const summaryUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`;
  for (const mode of ['missing', 'duplicate', 'cancel', 'navigate']) {
    const dom = screen('', summaryUrl);
    const doc = dom.window.document;
    doc.body.innerHTML = '<div id="navigation"></div>';
    const abort = new AbortController();
    const pending = openNaverCollection(doc, site, abort.signal, 40);
    if (mode === 'duplicate') setTimeout(() => {
      doc.querySelector('#navigation').innerHTML = '<button>요청</button><button>요청</button>';
      doc.querySelectorAll('button').forEach((button) => { button.onclick = () => assert.fail('중복 헤더 선택 금지'); });
    }, 1);
    if (mode === 'cancel') setTimeout(() => abort.abort(), 1);
    if (mode === 'navigate') setTimeout(() => {
      dom.window.history.replaceState({}, '', '/auth/login');
      doc.body.insertAdjacentHTML('beforeend', '<div>문서 이동</div>');
    }, 1);
    const code = { missing: 'timeout', duplicate: 'ambiguous_control', cancel: 'cancelled', navigate: 'page_changed' }[mode];
    try { await assert.rejects(pending, (error) => error.code === code); }
    finally { dom.window.close(); }
  }
});

test('대기 완료 직후 요청 헤더의 이름·활성·표시·유일성이 바뀌면 메뉴를 클릭하지 않는다', async () => {
  const summaryUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`;
  for (const mode of ['text', 'disabled', 'hidden', 'duplicate', 'replaced']) {
    const dom = screen('', summaryUrl);
    const doc = dom.window.document;
    doc.body.innerHTML = '<button>요청</button>';
    const header = doc.querySelector('button');
    header.onclick = () => assert.fail('변경된 요청 헤더 클릭 금지');
    const pending = openNaverCollection(doc, site, new AbortController().signal, 1000);
    queueMicrotask(() => {
      if (mode === 'text') header.textContent = '다른 메뉴';
      if (mode === 'disabled') header.disabled = true;
      if (mode === 'hidden') header.hidden = true;
      if (mode === 'duplicate') header.after(header.cloneNode(true));
      if (mode === 'replaced') header.replaceWith(header.cloneNode(true));
    });
    try { await assert.rejects(pending, (error) => error.code === 'page_changed'); }
    finally { dom.window.close(); }
  }
});

test('요청 메뉴를 펼친 뒤 지연 표시된 웹 페이지 수집 항목만 클릭한다', async () => {
  const summaryUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`;
  const dom = screen('', summaryUrl);
  const doc = dom.window.document;
  doc.body.innerHTML = '<div role="button" aria-expanded="false"><div class="v-list-item__title">요청</div><i class="v-icon">expand_more</i></div><div id="items"></div>';
  const header = doc.querySelector('[role="button"]');
  let expanded = 0;
  let selected = 0;
  header.onclick = () => {
    expanded += 1;
    header.setAttribute('aria-expanded', 'true');
    setTimeout(() => {
      doc.querySelector('#items').innerHTML = '<div class="v-list-item" id="crawl"><div class="v-list-item__title">웹 페이지 수집</div></div><div class="v-list-item" id="exclude">웹 페이지 검색 제외</div>';
      doc.querySelector('#crawl').onclick = () => { selected += 1; dom.window.history.replaceState({}, '', pageUrl); };
      doc.querySelector('#exclude').onclick = () => assert.fail('검색 제외 메뉴 선택 금지');
    }, 1);
  };
  try {
    await openNaverCollection(doc, site, new AbortController().signal, 1000);
    assert.equal(expanded, 1);
    assert.equal(selected, 1);
    assert.equal(new URL(dom.window.location.href).pathname, '/console/site/request/crawl');
  } finally { dom.window.close(); }
});

test('메뉴 중복·다른 사이트·변조된 링크·취소는 수집 메뉴 선택 전에 중단한다', async () => {
  const summaryUrl = `https://searchadvisor.naver.com/console/site/summary?site=${encodeURIComponent(site)}`;
  for (const mode of ['duplicate', 'wrong_site', 'wrong_link', 'cancelled']) {
    const dom = screen('', summaryUrl);
    const doc = dom.window.document;
    doc.body.innerHTML = '<button aria-expanded="true">요청</button><a href="https://searchadvisor.naver.com/console/site/request/crawl?site=https%3A%2F%2Fone.example%2F">웹 페이지 수집</a>';
    if (mode === 'duplicate') doc.body.insertAdjacentHTML('beforeend', '<div class="v-list-item">웹 페이지 수집</div>');
    if (mode === 'wrong_link') doc.querySelector('a').href = 'https://outside.example/';
    const abort = new AbortController();
    if (mode === 'cancelled') abort.abort();
    doc.querySelector('a').onclick = () => assert.fail('모호한 메뉴 클릭 금지');
    try {
      const code = { duplicate: 'ambiguous_control', wrong_site: 'wrong_page', wrong_link: 'page_changed', cancelled: 'cancelled' }[mode];
      await assert.rejects(openNaverCollection(doc, mode === 'wrong_site' ? 'https://other.example/' : site, abort.signal, 100), (error) => error.code === code);
    } finally { dom.window.close(); }
  }
});

test('대상 URL의 신규 요청 내역만 접수로 반환하고 수집·색인은 미확인으로 유지한다', async () => {
  const dom = screen();
  const doc = dom.window.document;
  let clicks = 0;
  const events = [];
  doc.querySelector('input').oninput = () => events.push('input');
  doc.querySelector('input').onchange = () => events.push('change');
  doc.querySelector('button').onclick = () => {
    clicks += 1;
    doc.querySelector('tbody').innerHTML = row();
  };

  try {
    assert.equal(naverPageState(doc, pageUrl, 'document').route, 'collection');
    const receipt = await requestNaverCollection(doc, site, target, new AbortController().signal, 1000);
    assert.equal(receipt.kind, 'collection_receipt');
    assert.equal(receipt.siteUrl, site);
    assert.equal(receipt.targetUrl, target);
    assert.equal(receipt.requestStatus, 'accepted');
    assert.equal(receipt.collectionStatus, 'unknown');
    assert.equal(receipt.indexStatus, 'unknown');
    assert.equal(receipt.targetVerified, true);
    assert.equal(doc.querySelector('input').value, target);
    assert.deepEqual(events, ['input', 'change']);
    assert.equal(clicks, 1);
  } finally { dom.window.close(); }
});

test('기존 대상의 등록일이 실제로 갱신된 경우에도 새 접수로 반환한다', async () => {
  const dom = screen(row(target, registeredText(-60000)));
  const doc = dom.window.document;
  doc.querySelector('button').onclick = () => { doc.querySelector('tbody td:last-child').textContent = registeredText(); };
  try {
    const receipt = await requestNaverCollection(doc, site, target, new AbortController().signal, 1000);
    assert.equal(receipt.requestStatus, 'accepted');
  } finally { dom.window.close(); }
});

test('수집 내역 표의 지연 렌더와 초기 내역 로딩이 끝난 뒤에만 화면 준비를 완료한다', async () => {
  const dom = screen();
  const doc = dom.window.document;
  const table = doc.querySelector('table');
  table.remove();
  doc.body.insertAdjacentHTML('beforeend', '<div role="progressbar"></div>');
  let queries = 0;
  const client = {
    get: async (id) => ({ id, url: pageUrl, status: 'complete' }),
    send: async (_id, request) => {
      queries += 1;
      const value = naverPageState(doc, pageUrl, 'document');
      return { requestId: request.requestId, ok: true, value };
    },
  };
  try {
    assert.equal(naverPageState(doc, pageUrl, 'document').ready, false);
    doc.body.append(table);
    assert.equal(naverPageState(doc, pageUrl, 'document').ready, false);
    doc.querySelector('button').onclick = () => assert.fail('초기 내역 로딩 중 제출 금지');
    await assert.rejects(requestNaverCollection(doc, site, target, new AbortController().signal, 20), (error) => error.code === 'ambiguous_control');
    table.remove();
    const pending = waitPage(client, 7, 'collection', site, new AbortController().signal);
    setTimeout(() => { doc.body.append(table); doc.querySelector('[role="progressbar"]').remove(); }, 10);
    const state = await pending;
    assert.equal(state.ready, true);
    assert.ok(queries >= 2);
  } finally { dom.window.close(); }
});

test('제출 뒤 표가 다시 로딩되는 동안 기다리고 로딩 완료 후 새 접수만 판독한다', async () => {
  const dom = screen();
  const doc = dom.window.document;
  doc.querySelector('button').onclick = () => {
    doc.body.insertAdjacentHTML('beforeend', '<div role="progressbar"></div>');
    doc.querySelector('tbody').innerHTML = row();
    setTimeout(() => { doc.querySelector('[role="progressbar"]').remove(); }, 10);
  };
  try {
    const receipt = await requestNaverCollection(doc, site, target, new AbortController().signal, 1000);
    assert.equal(receipt.requestStatus, 'accepted');
    assert.equal(doc.querySelector('[role="progressbar"]'), null);
  } finally { dom.window.close(); }
});

test('기존 내역의 DOM 교체·정렬과 뒤늦게 나타난 과거 요청은 새 접수로 인정하지 않는다', async () => {
  for (const mode of ['replace', 'late_history', 'other_target', 'hidden_history']) {
    const old = row(target, registeredText(-60000));
    const dom = screen(mode === 'replace' ? old : '');
    const doc = dom.window.document;
    let clicks = 0;
    doc.querySelector('button').onclick = () => {
      clicks += 1;
      doc.querySelector('tbody').innerHTML = mode === 'other_target' ? row(`${site}another`) : mode === 'hidden_history' ? row().replace('<tr>', '<tr hidden>') : old;
    };
    try {
      await assert.rejects(requestNaverCollection(doc, site, target, new AbortController().signal, 20), (error) => error.code === 'receipt_unconfirmed');
      assert.equal(clicks, 1);
    } finally { dom.window.close(); }
  }
});

test('검사 화면·다른 사이트 URL·2048자 초과 URL은 제출 전에 거부한다', async () => {
  for (const [url, requestedTarget, code] of [
    [pageUrl.replace('/request/crawl', '/check/inspection'), target, 'wrong_page'],
    [pageUrl, 'https://other.example/post', 'invalid_response'],
    [pageUrl, `${site}${'x'.repeat(2048)}`, 'invalid_response'],
  ]) {
    const dom = screen('', url);
    dom.window.document.querySelector('button').onclick = () => assert.fail('사전 검증 실패 후 제출 금지');
    try {
      await assert.rejects(requestNaverCollection(dom.window.document, site, requestedTarget, new AbortController().signal, 20), (error) => error.code === code);
    } finally { dom.window.close(); }
  }
});

test('입력칸·확인 버튼·내역 표가 모호하거나 준비되지 않았으면 클릭하지 않는다', async () => {
  for (const mode of ['two_inputs', 'two_buttons', 'wrong_headers', 'two_tables', 'disabled']) {
    const dom = screen();
    const doc = dom.window.document;
    doc.querySelector('button').onclick = () => assert.fail('모호한 화면에서 제출 금지');
    if (mode === 'two_inputs') doc.body.insertAdjacentHTML('beforeend', '<input>');
    if (mode === 'two_buttons') doc.body.insertAdjacentHTML('beforeend', '<button>확인</button>');
    if (mode === 'wrong_headers') doc.querySelector('th:last-child').textContent = '색인 상태';
    if (mode === 'two_tables') doc.body.insertAdjacentHTML('beforeend', doc.querySelector('table').outerHTML);
    if (mode === 'disabled') doc.querySelector('button').disabled = true;
    try {
      await assert.rejects(requestNaverCollection(doc, site, target, new AbortController().signal, 20), (error) => error.code === 'ambiguous_control');
    } finally { dom.window.close(); }
  }
});

test('클릭 전 취소는 제출하지 않고 클릭 후 취소·이동은 접수 여부 미확인으로 종료한다', async () => {
  for (const mode of ['before', 'input', 'after', 'navigate']) {
    const dom = screen();
    const doc = dom.window.document;
    const abort = new AbortController();
    let clicks = 0;
    if (mode === 'before') abort.abort();
    if (mode === 'input') doc.querySelector('input').oninput = () => abort.abort();
    doc.querySelector('button').onclick = () => {
      clicks += 1;
      if (mode === 'after') abort.abort();
      if (mode === 'navigate') dom.window.history.replaceState({}, '', '/console/board');
    };
    try {
      await assert.rejects(requestNaverCollection(doc, site, target, abort.signal, 20), (error) => error.code === (['before', 'input'].includes(mode) ? 'cancelled' : 'receipt_unconfirmed'));
      assert.equal(clicks, ['before', 'input'].includes(mode) ? 0 : 1);
    } finally { dom.window.close(); }
  }
});

test('수집 콘텐츠 명령은 발신자·문서 토큰·공유 잠금·이미 소비된 ID를 검증한다', async () => {
  const bundle = await build({ configFile: false, logLevel: 'silent', build: { write: false, lib: { entry: fileURLToPath(new URL('../src/engines/naver/content.ts', import.meta.url)), name: 'StartPressNaverReader', formats: ['iife'] } } });
  const source = (Array.isArray(bundle) ? bundle : [bundle]).flatMap((item) => item.output).find((item) => item.type === 'chunk').code;
  const dom = screen();
  let handler;
  dom.window.chrome = { runtime: { id: 'extension-id', getURL: () => 'chrome-extension://extension-id/index.html', onMessage: { addListener: (listener) => { handler = listener; } } } };
  dom.window.eval(source);
  const sender = { id: 'extension-id', url: 'chrome-extension://extension-id/index.html' };
  let response;
  handler({ type: NAVER_AUTOMATION_MESSAGE, requestId: 'state', action: 'state' }, sender, (value) => { response = value; });
  const documentToken = response.value.documentToken;
  const request = { type: NAVER_AUTOMATION_MESSAGE, requestId: 'collect-1', action: 'request_collection', documentToken, siteUrl: site, targetUrl: target };
  const doc = dom.window.document;
  let clicks = 0;
  doc.querySelector('button').onclick = () => { clicks += 1; };

  try {
    response = undefined;
    handler(request, { ...sender, id: 'other-extension' }, (value) => { response = value; });
    assert.equal(response, undefined);
    assert.equal(clicks, 0);
    handler({ ...request, documentToken: 'wrong' }, sender, (value) => { response = value; });
    assert.equal(response.code, 'page_changed');
    const pending = new Promise((resolve) => { assert.equal(handler(request, sender, resolve), true); });
    assert.equal(clicks, 1);
    handler({ ...request, requestId: 'inspection', action: 'inspect_url' }, sender, (value) => { response = value; });
    assert.equal(response.code, 'busy');
    doc.querySelector('tbody').innerHTML = row();
    const receipt = await pending;
    assert.equal(receipt.value.requestStatus, 'accepted');
    await new Promise((resolve) => setImmediate(resolve));
    handler(request, sender, (value) => { response = value; });
    assert.equal(response.code, 'receipt_unconfirmed');
    assert.equal(clicks, 1);
  } finally { dom.window.close(); }
});
