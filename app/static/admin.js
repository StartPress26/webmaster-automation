// @ts-check

/** @typedef {{id: string, name: string, manager_name: string|null}} Client */
/** @typedef {{id: string, name: string, url: string, owner_type: 'internal'|'client', cms_type: string|null, can_edit_site: boolean|null, created_at: string}} Site */
/** @typedef {{clients: readonly Client[], selected: string, page: number, hasNext: boolean, submitting: boolean}} ViewState */

/** HTML 요소를 선택하고 예상한 타입으로 반환합니다.
 * @template {HTMLElement} T
 * @param {string} selector
 * @returns {T}
 */
function element(selector) {
  const result = document.querySelector(selector);
  if (!(result instanceof HTMLElement)) throw new Error(`화면 요소가 없습니다: ${selector}`);
  return /** @type {T} */ (result);
}

/** @type {ViewState} */
let state = Object.freeze({clients: [], selected: '', page: 0, hasNext: false, submitting: false});
let listRequest = 0;
const PAGE_SIZE = 6;
const siteForm = /** @type {HTMLFormElement} */ (element('#site-form'));
const clientSelect = /** @type {HTMLSelectElement} */ (element('#client-id'));
const dialog = /** @type {HTMLDialogElement} */ (element('#client-dialog'));
const clientForm = /** @type {HTMLFormElement} */ (element('#client-form'));
const fieldTargets = Object.freeze({client_id: ['#client-id', '#client-error'], name: ['#site-name', '#name-error'], url: ['#site-url', '#url-error']});

/** 응답 본문과 상태를 보존해 입력 오류를 화면에 연결합니다. */
class ApiError extends Error {
  /** 실패한 API 응답의 상태와 상세 내용을 저장합니다.
   * @param {number} status
   * @param {unknown} detail
   */
  constructor(status, detail) {
    super(typeof detail === 'string' ? detail : '입력 내용을 확인해 주세요.');
    this.status = status;
    this.detail = detail;
  }
}

/** 동일 출처 API를 호출하고 네트워크 오류와 서버 오류를 구분합니다.
 * @template T
 * @param {string} path
 * @param {RequestInit} [options]
 * @returns {Promise<T>}
 */
async function request(path, options) {
  let response;
  try {
    response = await fetch(path, {...options, headers: {'Content-Type': 'application/json', ...options?.headers}});
  } catch {
    throw new Error('서버에 연결하지 못했어요. 연결 상태를 확인한 후 다시 시도해 주세요.');
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.detail ?? '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
  return body;
}

/** 안내 내용을 안전한 텍스트로 표시하거나 숨깁니다.
 * @param {string} selector
 * @param {string} message
 */
function notice(selector, message) {
  const target = element(selector);
  target.textContent = message;
  target.hidden = !message;
}

/** 이전 입력 오류와 접근성 상태를 초기화합니다. */
function clearErrors() {
  for (const [input, message] of Object.values(fieldTargets)) {
    element(input).removeAttribute('aria-invalid');
    notice(message, '');
  }
  notice('#submit-error', '');
}

/** 특정 입력에 오류를 연결합니다.
 * @param {keyof typeof fieldTargets} field
 * @param {string} message
 */
function fieldError(field, message) {
  const [input, target] = fieldTargets[field];
  element(input).setAttribute('aria-invalid', 'true');
  notice(target, message);
}

/** 고객사 전체 목록을 페이지 단위로 읽고 현재 선택을 유지합니다.
 * @param {string} [preferred]
 */
async function loadClients(preferred = state.selected) {
  clientSelect.disabled = true;
  element('#client-load-error').hidden = true;
  element('#submit-site').setAttribute('disabled', '');
  try {
    /** @type {readonly Client[]} */
    let clients = [];
    let offset = 0;
    while (true) {
      const page = /** @type {{items: Client[]}} */ (await request(`/clients?limit=100&offset=${offset}`));
      clients = [...clients, ...page.items];
      if (page.items.length < 100) break;
      offset += 100;
    }
    state = Object.freeze({...state, clients, selected: clients.some(client => client.id === preferred) ? preferred : '', page: 0});
    const placeholder = new Option(clients.length ? '고객사를 선택해 주세요' : '고객사를 먼저 추가해 주세요', '');
    clientSelect.replaceChildren(placeholder, ...clients.map(client => new Option(client.name, client.id)));
    clientSelect.value = state.selected;
    notice('#client-help', clients.length ? '사이트를 운영하는 고객사를 선택하세요.' : '오른쪽의 고객사 추가 버튼으로 첫 고객사를 등록하세요.');
    await loadSites();
  } catch (error) {
    notice('#client-load-text', error instanceof Error ? error.message : '고객사를 불러오지 못했어요.');
    element('#client-load-error').hidden = false;
    clientSelect.replaceChildren(new Option('고객사를 불러오지 못했어요', ''));
    state = Object.freeze({...state, selected: ''});
    await loadSites();
  } finally {
    clientSelect.disabled = false;
    updateSubmit();
  }
}

/** 고객사 선택과 저장 진행 상태에 따라 버튼을 갱신합니다. */
function updateSubmit() {
  /** @type {HTMLButtonElement} */ (element('#submit-site')).disabled = !state.selected || state.submitting;
  /** @type {HTMLButtonElement} */ (element('#refresh-sites')).disabled = !state.selected;
}

/** 사이트 목록의 빈 상태나 로딩 상태를 표시합니다.
 * @param {string} title
 * @param {string} description
 */
function listStatus(title, description) {
  element('#list-status').hidden = false;
  element('#list-status h3').textContent = title;
  element('#list-status p').textContent = description;
  element('#site-table-wrap').hidden = true;
  element('#pagination').hidden = true;
}

/** 선택된 고객사의 사이트를 조회하며 오래된 응답이 화면을 덮지 않게 합니다. */
async function loadSites() {
  const current = ++listRequest;
  const {selected, page} = state;
  const client = state.clients.find(item => item.id === selected);
  notice('#list-error', '');
  element('#list-description').textContent = client ? `${client.name}의 메인 사이트를 확인하세요.` : '고객사를 선택하면 등록된 사이트가 표시됩니다.';
  updateSubmit();
  if (!selected) {
    listStatus('어느 고객사의 사이트를 볼까요?', '위에서 고객사를 선택해 주세요.');
    return;
  }
  listStatus('사이트를 불러오고 있어요', '잠시만 기다려 주세요.');
  try {
    const result = /** @type {{items: Site[]}} */ (await request(`/sites?client_id=${encodeURIComponent(selected)}&limit=${PAGE_SIZE + 1}&offset=${page * PAGE_SIZE}`));
    if (current !== listRequest) return;
    state = Object.freeze({...state, hasNext: result.items.length > PAGE_SIZE});
    const items = result.items.slice(0, PAGE_SIZE);
    if (!items.length) {
      listStatus('아직 등록된 사이트가 없어요', '위의 폼에서 첫 번째 메인 사이트를 등록해 보세요.');
      return;
    }
    element('#sites-body').replaceChildren(...items.map(siteRow));
    element('#list-status').hidden = true;
    element('#site-table-wrap').hidden = false;
    element('#pagination').hidden = false;
    element('#page-description').textContent = `${page + 1}페이지 · ${items.length}개 사이트`;
    /** @type {HTMLButtonElement} */ (element('#previous-page')).disabled = page === 0;
    /** @type {HTMLButtonElement} */ (element('#next-page')).disabled = !state.hasNext;
  } catch (error) {
    if (current !== listRequest) return;
    listStatus('사이트를 불러오지 못했어요', '새로고침 버튼을 눌러 다시 시도해 주세요.');
    notice('#list-error', error instanceof Error ? error.message : '목록 조회에 실패했어요.');
  }
}

/** 사용자 입력을 HTML로 해석하지 않고 사이트 표의 한 행을 만듭니다.
 * @param {Site} site
 * @returns {HTMLTableRowElement}
 */
function siteRow(site) {
  const row = document.createElement('tr');
  const nameCell = document.createElement('td');
  const identity = document.createElement('div');
  identity.className = 'site-cell';
  const avatar = document.createElement('span');
  avatar.className = 'site-avatar';
  avatar.textContent = Array.from(site.name)[0] ?? 'S';
  avatar.setAttribute('aria-hidden', 'true');
  const content = document.createElement('div');
  const name = document.createElement('strong');
  name.textContent = site.name;
  const link = document.createElement('a');
  link.textContent = site.url;
  // DB 응답도 확인해 실행 가능한 스킴이 링크에 들어가지 않게 합니다.
  if (/^https?:\/\//i.test(site.url)) link.href = site.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  content.append(name, link);
  identity.append(avatar, content);
  nameCell.append(identity);
  const owner = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = `badge ${site.owner_type === 'internal' ? 'internal' : ''}`;
  badge.textContent = site.owner_type === 'internal' ? '내부 소유' : '고객사 소유';
  owner.append(badge);
  const platform = document.createElement('td');
  platform.textContent = site.cms_type || '미입력';
  const editable = document.createElement('td');
  editable.textContent = site.can_edit_site === null ? '아직 모름' : site.can_edit_site ? '가능' : '어려움';
  editable.className = site.can_edit_site ? 'edit-yes' : '';
  const date = document.createElement('td');
  date.textContent = new Intl.DateTimeFormat('ko-KR', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Seoul'}).format(new Date(site.created_at));
  row.append(nameCell, owner, platform, editable, date);
  return row;
}

/** 필수 입력을 확인하고 서버에 등록한 뒤 목록을 갱신합니다.
 * @param {SubmitEvent} event
 */
async function submitSite(event) {
  event.preventDefault();
  if (state.submitting) return;
  clearErrors();
  notice('#success-message', '');
  const form = new FormData(siteForm);
  const name = String(form.get('name') ?? '').trim();
  const url = String(form.get('url') ?? '').trim();
  if (!state.selected) fieldError('client_id', '사이트를 등록할 고객사를 선택해 주세요.');
  if (!name) fieldError('name', '사이트 이름을 입력해 주세요.');
  if (!/^https?:\/\//i.test(url)) fieldError('url', 'http:// 또는 https://로 시작하는 주소를 입력해 주세요.');
  const invalid = siteForm.querySelector('[aria-invalid="true"]');
  if (invalid instanceof HTMLElement) { invalid.focus(); return; }
  const edit = form.get('can_edit_site');
  const payload = Object.freeze({client_id: state.selected, name, url, owner_type: form.get('owner_type'), cms_type: String(form.get('cms_type') ?? '').trim() || null, can_edit_site: edit === 'unknown' ? null : edit === 'true'});
  state = Object.freeze({...state, submitting: true});
  for (const input of siteForm.querySelectorAll('input, select, button')) input.setAttribute('disabled', '');
  element('#submit-site span').textContent = '사이트를 등록하고 있어요…';
  try {
    const created = /** @type {Site} */ (await request('/sites', {method: 'POST', body: JSON.stringify(payload)}));
    siteForm.reset();
    clientSelect.value = state.selected;
    state = Object.freeze({...state, page: 0});
    notice('#success-message', `${created.name} 사이트를 등록했어요. 아래 목록에서 확인할 수 있습니다.`);
    await loadSites();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      fieldError('url', '이 고객사에 이미 등록된 주소예요. 아래 목록을 확인해 주세요.');
    } else if (error instanceof ApiError && error.status === 404) {
      fieldError('client_id', '고객사를 찾을 수 없어요. 고객사 목록을 새로 불러와 주세요.');
      notice('#submit-error', '페이지를 새로고침한 후 고객사를 다시 선택해 주세요. 입력 내용은 복사해 두세요.');
    } else if (error instanceof ApiError && error.status === 422 && Array.isArray(error.detail)) {
      for (const issue of error.detail) {
        const field = issue.loc?.[1];
        if (field in fieldTargets) {
          const message = field === 'url' ? '주소 형식을 확인해 주세요. 공백·인증정보·#을 제외하고 2,048바이트 이하로 입력하세요.' : '입력 내용을 확인해 주세요.';
          fieldError(field, message);
        }
      }
      if (!siteForm.querySelector('[aria-invalid="true"]')) notice('#submit-error', '입력값을 확인한 후 다시 등록해 주세요.');
    } else {
      notice('#submit-error', error instanceof Error ? error.message : '등록하지 못했어요. 다시 시도해 주세요.');
    }
  } finally {
    state = Object.freeze({...state, submitting: false});
    for (const input of siteForm.querySelectorAll('input, select, button')) input.removeAttribute('disabled');
    element('#submit-site span').textContent = '사이트 등록하기';
    updateSubmit();
    const invalid = siteForm.querySelector('[aria-invalid="true"]');
    if (invalid instanceof HTMLElement) invalid.focus();
    else if (!element('#submit-error').hidden) element('#submit-error').focus();
    else if (!element('#success-message').hidden) element('#site-name').focus();
  }
}

/** 새 고객사를 저장하고 즉시 사이트 등록 대상으로 선택합니다.
 * @param {SubmitEvent} event
 */
async function submitClient(event) {
  event.preventDefault();
  const button = /** @type {HTMLButtonElement} */ (element('#submit-client'));
  if (button.disabled) return;
  notice('#client-form-error', '');
  const form = new FormData(clientForm);
  const name = String(form.get('name') ?? '').trim();
  if (!name) {
    notice('#client-form-error', '고객사 이름을 입력해 주세요.');
    element('#client-name').focus();
    return;
  }
  button.disabled = true;
  element('#close-dialog').setAttribute('disabled', '');
  button.textContent = '고객사를 추가하고 있어요…';
  try {
    const client = /** @type {Client} */ (await request('/clients', {method: 'POST', body: JSON.stringify({name, manager_name: String(form.get('manager_name') ?? '').trim() || null})}));
    dialog.close();
    clientForm.reset();
    await loadClients(client.id);
    clearErrors();
    notice('#success-message', '');
    element('#site-name').focus();
  } catch (error) {
    notice('#client-form-error', error instanceof Error ? error.message : '고객사를 추가하지 못했어요.');
  } finally {
    button.disabled = false;
    button.textContent = '고객사 추가하기';
    element('#close-dialog').removeAttribute('disabled');
  }
}

/** 고객사 변경 시 해당 고객사의 첫 페이지를 표시합니다. */
function selectClient() {
  state = Object.freeze({...state, selected: clientSelect.value, page: 0});
  clearErrors();
  notice('#success-message', '');
  void loadSites();
}

/** 고객사 추가 대화상자를 열고 첫 입력에 포커스를 둡니다. */
function openClientDialog() {
  notice('#client-form-error', '');
  dialog.showModal();
  element('#client-name').focus();
}

/** 고객사 추가 대화상자를 닫습니다. */
function closeClientDialog() { dialog.close(); }

/** 저장 중 대화상자의 취소로 중복 등록을 유발하지 않게 합니다.
 * @param {Event} event
 */
function preventPendingClose(event) {
  if (/** @type {HTMLButtonElement} */ (element('#submit-client')).disabled) event.preventDefault();
}

/** 등록 목록을 다시 조회합니다. */
function refreshSites() { void loadSites(); }

/** 고객사 목록을 다시 조회합니다. */
function retryClients() { void loadClients(); }

/** 이전 페이지를 조회합니다. */
function previousPage() {
  if (state.page === 0) return;
  state = Object.freeze({...state, page: state.page - 1});
  void loadSites();
}

/** 다음 페이지를 조회합니다. */
function nextPage() {
  if (!state.hasNext) return;
  state = Object.freeze({...state, page: state.page + 1});
  void loadSites();
}

siteForm.addEventListener('submit', submitSite);
clientForm.addEventListener('submit', submitClient);
clientSelect.addEventListener('change', selectClient);
element('#add-client').addEventListener('click', openClientDialog);
element('#close-dialog').addEventListener('click', closeClientDialog);
dialog.addEventListener('cancel', preventPendingClose);
element('#retry-clients').addEventListener('click', retryClients);
element('#refresh-sites').addEventListener('click', refreshSites);
element('#previous-page').addEventListener('click', previousPage);
element('#next-page').addEventListener('click', nextPage);
void loadClients();
