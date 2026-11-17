import { ApiError, asAppError, presentError, uncertainWrite } from '../errors.ts';
import { escapeHtml } from '../html.ts';
import { verifySavedPages } from './actions.ts';
import { icon } from './constants.ts';
import { setPending } from './events.ts';
import { loadInspectionTargets, loadSettings, loadStoredInspections, loadWorkspace } from './loaders.ts';
import { update } from './render.ts';
import { app, store } from './store.ts';

// 폼 오류를 오류 카드와 필드 표시로 보여주고, 복구 버튼을 연결하는 함수들

// 원인·반영 결과·다음 행동을 공통 오류 카드 하나에 표시합니다.
export function errorPanel(
  error: ApiError,
  title: string,
  action?: 'workspace' | 'targets' | 'settings' | 'saved' | 'saves',
): string {
  const view = presentError(error, title);
  const labels = {
    workspace: '목록 다시 불러오기',
    targets: '저장된 글 목록 확인',
    settings: '저장된 설정 다시 읽기',
    saved: '저장 결과 다시 읽기',
    saves: '글 저장 여부 확인',
  };
  return `<section class="error-panel ${view.tone}" role="alert" data-error-code="${escapeHtml(error.code)}"><div class="error-panel-heading">${icon('info')}<h3>${escapeHtml(view.title)}</h3></div><p>${escapeHtml(view.message)}</p><p class="error-advice">${escapeHtml(view.advice)}</p>${action ? `<button type="button" class="button secondary" data-error-action="${action}">${labels[action]}</button>` : ''}${view.authHelp ? '<details class="auth-help"><summary>API 연결 설정 안내</summary><p>서버의 검색엔진 API 인증정보와 필요한 접근 권한을 확인하세요. Google 인증 갱신 실패만으로 권한 철회·네트워크 문제 중 어느 것이 원인인지 단정할 수 없습니다. 재연결이 필요한 경우 서버 담당자가 OAuth 인증을 진행해야 합니다. 이 화면은 직접 로그인하거나 토큰을 변경하지 않습니다.</p></details>' : ''}<details class="error-details"><summary>오류 정보</summary><dl><div><dt>코드</dt><dd>${escapeHtml(error.code)}</dd></div>${error.status ? `<div><dt>HTTP</dt><dd>${error.status}</dd></div>` : ''}</dl></details></section>`;
}

// 폼 오류를 해당 화면에 텍스트로 표시합니다.
export function showError(selector: string, error: unknown): void {
  const element = app.querySelector<HTMLElement>(selector);
  if (!element) return;

  setPending(false);

  const issue = asAppError(error, 'save');
  const form = element.closest('form');

  if (form) clearFormErrors(form);

  const titles: Record<string, string> = {
    '#registration-error': '사이트 정보를 저장하지 못했습니다',
    '#client-error': '고객사를 저장하지 못했습니다',
    '#indexnow-error': 'IndexNow 설정을 저장하지 못했습니다',
    '#notification-error': '글 처리 요청을 완료하지 못했습니다',
  };
  const recovery =
    selector === '#indexnow-error' && (uncertainWrite(issue) || issue.kind === 'conflict')
      ? 'settings'
      : ['#registration-error', '#client-error'].includes(selector) &&
          (uncertainWrite(issue) || issue.kind === 'conflict' || issue.kind === 'not_found')
        ? 'workspace'
        : issue.kind === 'conflict' && selector === '#notification-error'
          ? 'targets'
          : undefined;

  element.innerHTML = errorPanel(issue, titles[selector] ?? '입력을 확인하세요', recovery);

  const aliases: Record<string, string> = {
    client_id: 'clientId',
    name:
      form?.id === 'client-form'
        ? 'clientName'
        : form?.id === 'notification-form'
          ? 'titles'
          : 'siteName',
    url: form?.id === 'registration-form' ? 'origin' : 'urls',
    key: 'indexnowKey',
    key_location: 'indexnowLocation',
    indexnow_key: 'indexnowKey',
    indexnow_key_location: 'indexnowLocation',
    google_account_email: 'googleAccountEmail',
    bing_account_email: 'bingAccountEmail',
    naver_account_email: 'naverAccountEmail',
  };
  let first: HTMLElement | null = null;

  for (const field of issue.fields) {
    const input = form?.querySelector<HTMLElement>(
      `[name="${CSS.escape(aliases[field.field] ?? field.field)}"]`,
    );
    if (!input) continue;

    const message = document.createElement('span');

    message.className = 'field-error';
    message.dataset.fieldError = '';
    message.id = `field-error-${form?.id}-${aliases[field.field] ?? field.field}`;
    message.textContent = field.message;
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', message.id);
    input.insertAdjacentElement('afterend', message);
    first ??= input;
  }

  if (first) first.focus();
  else {
    element.setAttribute('tabindex', '-1');
    element.focus();
  }

  bindErrorActions(element);
}

// 다음 제출 전에 이전 필드 오류만 제거하며 작성한 값은 유지합니다.
export function clearFormErrors(form: HTMLFormElement): void {
  store.state = { ...store.state, notice: '' };
  app.querySelector<HTMLElement>('.success-notice')?.remove();
  form
    .querySelectorAll<HTMLElement>('[data-field-error]')
    .forEach((element): void => element.remove());
  form.querySelectorAll<HTMLElement>('[aria-invalid]').forEach((element): void => {
    element.removeAttribute('aria-invalid');
    if (element.getAttribute('aria-describedby')?.startsWith('field-error-'))
      element.removeAttribute('aria-describedby');
  });
  form
    .querySelectorAll<HTMLElement>('.form-error')
    .forEach((element): void => element.replaceChildren());
}

// 오류 카드의 복구 버튼은 목록·저장 결과만 읽으며 저장·외부 요청을 재실행하지 않습니다.
export function bindErrorActions(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>('[data-error-action]').forEach((button): void => {
    button.addEventListener('click', (): void => {
      if (store.pending || store.loading) return;

      if (button.dataset.errorAction === 'workspace') void loadWorkspace();

      if (button.dataset.errorAction === 'settings') void loadSettings();

      if (button.dataset.errorAction === 'saved') void loadStoredInspections();

      if (button.dataset.errorAction === 'saves') void verifySavedPages();

      if (button.dataset.errorAction === 'targets') {
        update({ view: 'inspect', notice: '', mobileNav: false });
        void loadInspectionTargets();
      }
    });
  });
}
