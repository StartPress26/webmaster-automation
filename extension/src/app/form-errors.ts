import { ApiError, asAppError, presentError, uncertainWrite } from '../errors.ts';
import { escapeHtml } from '../html.ts';
import { verifySavedPages } from './actions.ts';
import { icon } from './constants.ts';
import { setPending } from './events.ts';
import { loadInspectionTargets, loadSettings, loadStoredInspections, loadWorkspace } from './loaders.ts';
import { update } from './render.ts';
import { app, store } from './store.ts';

// 폼 오류를 오류 카드와 필드 표시로 보여주고, 복구 버튼을 연결하는 함수들

// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

// 오류 카드의 복구 버튼 종류
export type ErrorAction = 'workspace' | 'targets' | 'settings' | 'saved' | 'saves';

// 복구 버튼 문구
const ACTION_LABELS: Readonly<Record<ErrorAction, string>> = {
  workspace: '목록 다시 불러오기',
  targets: '저장된 글 목록 확인',
  settings: '저장된 설정 다시 읽기',
  saved: '저장 결과 다시 읽기',
  saves: '글 저장 여부 확인',
};

// 폼별 오류 카드 제목 (오류 표시 영역 선택자 → 제목)
const ERROR_TITLES: Readonly<Record<string, string>> = {
  '#registration-error': '사이트 정보를 저장하지 못했습니다',
  '#client-error': '고객사를 저장하지 못했습니다',
  '#indexnow-error': 'IndexNow 설정을 저장하지 못했습니다',
  '#notification-error': '글 처리 요청을 완료하지 못했습니다',
};

// 서버 필드 이름 → 폼 입력칸 name (폼에 따라 달라지는 name·url은 함수에서 정함)
const FIELD_ALIASES: Readonly<Record<string, string>> = {
  client_id: 'clientId',
  key: 'indexnowKey',
  key_location: 'indexnowLocation',
  indexnow_key: 'indexnowKey',
  indexnow_key_location: 'indexnowLocation',
  google_account_email: 'googleAccountEmail',
  bing_account_email: 'bingAccountEmail',
  naver_account_email: 'naverAccountEmail',
};

const AUTH_HELP_HTML =
  '<details class="auth-help"><summary>API 연결 설정 안내</summary><p>서버의 검색엔진 API 인증정보와 필요한 접근 권한을 확인하세요. Google 인증 갱신 실패만으로 권한 철회·네트워크 문제 중 어느 것이 원인인지 단정할 수 없습니다. 재연결이 필요한 경우 서버 담당자가 OAuth 인증을 진행해야 합니다. 이 화면은 직접 로그인하거나 토큰을 변경하지 않습니다.</p></details>';

// ─────────────────────────────────────────────────────────────
// 오류 카드
// ─────────────────────────────────────────────────────────────

// 원인·반영 결과·다음 행동을 공통 오류 카드 하나에 표시합니다.
export function errorPanel(error: ApiError, title: string, action?: ErrorAction): string {
  const view = presentError(error, title);
  const actionButton = action
    ? `<button type="button" class="button secondary" data-error-action="${action}">${ACTION_LABELS[action]}</button>`
    : '';
  const authHelp = view.authHelp ? AUTH_HELP_HTML : '';
  const httpStatus = error.status ? `<div><dt>HTTP</dt><dd>${error.status}</dd></div>` : '';
  return `<section class="error-panel ${view.tone}" role="alert" data-error-code="${escapeHtml(error.code)}"><div class="error-panel-heading">${icon('info')}<h3>${escapeHtml(view.title)}</h3></div><p>${escapeHtml(view.message)}</p><p class="error-advice">${escapeHtml(view.advice)}</p>${actionButton}${authHelp}<details class="error-details"><summary>오류 정보</summary><dl><div><dt>코드</dt><dd>${escapeHtml(error.code)}</dd></div>${httpStatus}</dl></details></section>`;
}

// ─────────────────────────────────────────────────────────────
// 폼 오류 표시
// ─────────────────────────────────────────────────────────────

// 오류 종류와 폼에 따라 보여줄 복구 버튼을 정합니다. 저장됐을 수 있는(불확실한) 쓰기와 충돌은 목록·설정을 다시 읽도록 안내합니다.
function recoveryActionFor(selector: string, issue: ApiError): ErrorAction | undefined {
  const uncertainOrConflict = uncertainWrite(issue) || issue.kind === 'conflict';

  if (selector === '#indexnow-error' && uncertainOrConflict) return 'settings';
  if (['#registration-error', '#client-error'].includes(selector) && (uncertainOrConflict || issue.kind === 'not_found')) {
    return 'workspace';
  }
  if (selector === '#notification-error' && issue.kind === 'conflict') return 'targets';
  return undefined;
}

// 서버 필드 'name'·'url'은 폼마다 다른 입력칸에 대응합니다.
function fieldAliasFor(field: string, form: HTMLFormElement | null): string {
  if (field === 'name') {
    if (form?.id === 'client-form') return 'clientName';
    if (form?.id === 'notification-form') return 'titles';
    return 'siteName';
  }
  if (field === 'url') {
    return form?.id === 'registration-form' ? 'origin' : 'urls';
  }
  return FIELD_ALIASES[field] ?? field;
}

// 필드 오류 문구를 입력칸 바로 뒤에 붙이고 접근성 속성을 연결합니다.
function markFieldIssue(input: HTMLElement, formId: string | undefined, fieldName: string, text: string): void {
  const message = document.createElement('span');
  message.className = 'field-error';
  message.dataset.fieldError = '';
  message.id = `field-error-${formId}-${fieldName}`;
  message.textContent = text;

  input.setAttribute('aria-invalid', 'true');
  input.setAttribute('aria-describedby', message.id);
  input.insertAdjacentElement('afterend', message);
}

// 서버가 알려준 필드 오류를 각 입력칸에 표시하고, 첫 번째 입력칸을 돌려줍니다.
function markFieldIssues(form: HTMLFormElement | null, issue: ApiError): HTMLElement | null {
  let first: HTMLElement | null = null;

  for (const field of issue.fields) {
    const fieldName = fieldAliasFor(field.field, form);
    const input = form?.querySelector<HTMLElement>(`[name="${CSS.escape(fieldName)}"]`);
    if (!input) continue;

    markFieldIssue(input, form?.id, fieldName, field.message);
    first ??= input;
  }

  return first;
}

// 폼 오류를 해당 화면에 텍스트로 표시합니다.
export function showError(selector: string, error: unknown): void {
  const element = app.querySelector<HTMLElement>(selector);
  if (!element) return;

  setPending(false);

  const issue = asAppError(error, 'save');
  const form = element.closest('form');
  if (form) clearFormErrors(form);

  // 1. 오류 카드를 그립니다.
  const title = ERROR_TITLES[selector] ?? '입력을 확인하세요';
  element.innerHTML = errorPanel(issue, title, recoveryActionFor(selector, issue));

  // 2. 필드 오류를 표시하고 첫 입력칸(없으면 카드)에 포커스를 둡니다.
  const first = markFieldIssues(form, issue);
  if (first) {
    first.focus();
  } else {
    element.setAttribute('tabindex', '-1');
    element.focus();
  }

  bindErrorActions(element);
}

// 다음 제출 전에 이전 필드 오류만 제거하며 작성한 값은 유지합니다.
export function clearFormErrors(form: HTMLFormElement): void {
  store.state = { ...store.state, notice: '' };
  app.querySelector<HTMLElement>('.success-notice')?.remove();

  form.querySelectorAll<HTMLElement>('[data-field-error]').forEach((element): void => element.remove());
  form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((element): void => {
    element.removeAttribute('aria-invalid');
    if (element.getAttribute('aria-describedby')?.startsWith('field-error-')) {
      element.removeAttribute('aria-describedby');
    }
  });
  form.querySelectorAll<HTMLElement>('.form-error').forEach((element): void => element.replaceChildren());
}

// ─────────────────────────────────────────────────────────────
// 복구 버튼
// ─────────────────────────────────────────────────────────────

// 복구 버튼 종류에 맞는 읽기 동작을 실행합니다. 저장·외부 요청은 다시 실행하지 않습니다.
function runErrorAction(action: string | undefined): void {
  if (action === 'workspace') void loadWorkspace();
  if (action === 'settings') void loadSettings();
  if (action === 'saved') void loadStoredInspections();
  if (action === 'saves') void verifySavedPages();
  if (action === 'targets') {
    update({ view: 'inspect', notice: '', mobileNav: false });
    void loadInspectionTargets();
  }
}

// 오류 카드의 복구 버튼은 목록·저장 결과만 읽으며 저장·외부 요청을 재실행하지 않습니다.
export function bindErrorActions(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-error-action]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      if (store.pending || store.loading) return;
      runErrorAction(button.dataset.errorAction);
    });
  });
}
