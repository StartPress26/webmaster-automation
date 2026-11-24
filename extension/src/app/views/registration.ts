import { escapeHtml } from '../../html.ts';
import { icon } from '../constants.ts';
import { errorPanel } from '../form-errors.ts';
import { demo, property, selectedClient, store } from '../store.ts';
import type { AuthAccountRead, SiteAuthAccounts } from '../../types.ts';

// 사이트 등록 화면과 인증 계정·IndexNow 입력칸

// ─────────────────────────────────────────────────────────────
// 상수·타입
// ─────────────────────────────────────────────────────────────

type ApiEngine = 'google' | 'bing';
const REGISTRATION_FORM_ID = 'registration-form';

// ─────────────────────────────────────────────────────────────
// 인증 계정 입력칸
// ─────────────────────────────────────────────────────────────

// 다시 그리기 전에 보존해 둔 폼 초안에서 이 엔진의 계정 이메일을 꺼냅니다. 초안이 없으면 저장된 값을 씁니다.
function draftAccountEmail(engine: ApiEngine, formId: string, saved: string | null): string | boolean | null {
  const { clientId, view, propertyId, route } = store.state;
  const scope = `${clientId}:${view}:${propertyId}:${route}`;
  return store.formDrafts.get(`${scope}:${formId}`)?.[`${engine}AccountEmail`] ?? saved;
}

// 이전에 고른 이메일이 현재 계정 목록에 없으면, 선택이 사라지지 않도록 별도 option으로 보여줍니다.
function missingAccountOption(previous: string | boolean | null): string {
  if (typeof previous !== 'string' || !previous) return '';
  if (store.authAccounts.some((account): boolean => account.email === previous)) return '';
  return `<option value="${escapeHtml(previous)}" selected>${escapeHtml(previous)} · 목록에서 찾을 수 없음</option>`;
}

// 계정 하나의 option. 엔진별 참조 파일 등록 여부를 함께 표시합니다.
function accountOption(account: AuthAccountRead, engine: ApiEngine, previous: string | boolean | null): string {
  const selected = account.email === previous ? 'selected' : '';
  const configured = account[`${engine}_configured`] ? '참조 등록됨' : '참조 미등록';
  return `<option value="${escapeHtml(account.email)}" ${selected}>${escapeHtml(account.email)} · ${configured}</option>`;
}

// 등록된 계정 이메일과 엔진별 파일 참조 등록 여부를 선택지로 표시합니다.
function authAccountOptions(engine: ApiEngine, selected: string | null = null, formId = REGISTRATION_FORM_ID): string {
  const previous = draftAccountEmail(engine, formId, selected);
  const none = `<option value="" ${previous ? '' : 'selected'}>연결 안 함</option>`;
  const options = store.authAccounts.map((account): string => accountOption(account, engine, previous)).join('');
  return none + missingAccountOption(previous) + options;
}

// 계정 목록이 비어 있을 때의 안내 (로딩 중·오류 중에는 보여주지 않음)
function emptyAccountsNote(): string {
  if (store.authAccountsLoading || store.authAccountsError || store.authAccounts.length) return '';
  const note = demo ? '예시 모드에서는 인증 계정을 연결하지 않습니다.' : '등록된 인증 계정이 없습니다. 연결 없이 사이트를 등록할 수 있습니다.';
  return `<p class="field-help">${note}</p>`;
}

// 실제 키 입력 없이 API 계정과 GUI 참고 이메일을 구분해서 받습니다.
export function authAccountFields(values?: SiteAuthAccounts, formId = REGISTRATION_FORM_ID): string {
  const loadingNote = store.authAccountsLoading ? '<p class="field-help" role="status">인증 계정 목록을 불러오는 중…</p>' : '';
  const errorCard = store.authAccountsError ? errorPanel(store.authAccountsError, '인증 계정 목록을 불러오지 못했습니다') : '';
  // 세 안내는 각각 제 줄을 차지합니다 (비어 있어도 줄바꿈·들여쓰기는 남음).
  return `<fieldset class="auth-account-fields"><legend>검색엔진 계정 <span class="muted small">선택</span></legend>
    <button type="button" class="button secondary" id="refresh-auth-accounts">계정 목록 새로고침</button>
    ${loadingNote}
    ${errorCard}
    ${emptyAccountsNote()}
    <div class="two-fields"><label>Google 계정<select name="googleAccountEmail">${authAccountOptions('google', values?.google_account_email, formId)}</select></label>
    <label>Bing 계정<select name="bingAccountEmail">${authAccountOptions('bing', values?.bing_account_email, formId)}</select></label></div>
    <p class="field-help">참조 등록 여부는 실제 인증 성공 여부와 다릅니다. 사이트별 API 인증 적용은 아직 준비 중입니다.</p>
    <label>네이버 계정 이메일<input name="naverAccountEmail" type="email" value="${escapeHtml(values?.naver_account_email ?? '')}" placeholder="선택 입력"><span class="field-help">GUI 작업 참고용입니다. 브라우저 로그인 계정을 변경하지 않습니다.</span></label></fieldset>`;
}

// ─────────────────────────────────────────────────────────────
// IndexNow 입력칸·설정 패널
// ─────────────────────────────────────────────────────────────

// 신규 등록과 기존 사이트 설정에서 공통으로 사용할 입력칸을 표시합니다.
function indexNowFields(): string {
  return `<label>IndexNow 키<input name="indexnowKey" minlength="8" maxlength="128" pattern="[a-fA-F0-9-]{8,128}" autocomplete="off" placeholder="8~128자 · 0~9, a~f, 하이픈"></label><label>키 파일 URL<input name="indexnowLocation" type="url" placeholder="https://example.com/키.txt"><span class="field-help">파일 내용에는 키 문자열을 넣고, 사이트 루트에 배포하세요.</span></label>`;
}

// 설정 상태 한 줄 설명
function settingsSummary(configured: boolean): string {
  if (store.settingsLoading) return '설정 조회 중…';
  if (store.settingsError) return '현재 설정을 확인하지 못했습니다.';
  if (configured) return '설정 저장됨 · 키 파일 설치 미확인';
  return '미설정 · 글 저장만 하거나 키 설정을 추가할 수 있습니다.';
}

// 설정 상태 배지 문구
function settingsBadge(configured: boolean): string {
  if (store.settingsLoading) return '조회 중';
  if (store.settingsError) return '확인 불가';
  return configured ? '설정 있음' : '미설정';
}

// 선택한 사이트의 설정과 미검증 상태를 구분해 표시합니다.
export function indexNowSettingsView(): string {
  const settings = property().indexNow;
  const configured = settings?.configured ?? false;
  const healthy = configured && !store.settingsError;

  const errorCard = store.settingsError ? errorPanel(store.settingsError, 'IndexNow 설정을 읽지 못했습니다', 'settings') : '';
  const values = configured
    ? `<dl class="settings-values"><div><dt>키</dt><dd>서버에 저장됨 · 원문은 조회하지 않습니다${store.settingsError ? ' · 이전에 읽은 설정' : ''}</dd></div><div><dt>키 파일</dt><dd>${escapeHtml(settings?.key_location ?? '')}</dd></div></dl>`
    : '';
  const editorTitle = configured ? 'IndexNow 설정 변경' : 'IndexNow 설정 입력';
  const saveLabel = demo ? '예시 설정 저장' : '설정 저장';

  return `<section class="indexnow-settings" aria-label="사이트 IndexNow 설정"><div class="settings-heading"><div><h3>IndexNow 설정</h3><p>${settingsSummary(configured)}</p></div><span class="status-pill ${healthy ? 'crawled' : 'waiting'}">${settingsBadge(configured)}</span></div>${errorCard}${values}<details id="indexnow-editor" ${healthy ? '' : 'open'}><summary>${editorTitle}</summary><form class="work-form settings-form" id="indexnow-form">${indexNowFields()}<p class="field-help">키와 파일 URL을 함께 입력하세요. 형식 확인과 키 파일 설치·접수 확인은 서로 다릅니다.</p><div class="form-error" id="indexnow-error"></div><div><button class="button secondary" type="submit">${saveLabel}</button></div></form></details></section>`;
}

// ─────────────────────────────────────────────────────────────
// 사이트 등록 화면
// ─────────────────────────────────────────────────────────────

// 새 도메인의 검색엔진 등록 입력 화면을 표시합니다.
export function registrationView(): string {
  const noClientNote = store.clients.length ? '' : '<div class="inline-note">먼저 왼쪽 고객사 관리에서 고객사를 등록하세요.</div>';
  const savingNote = demo ? '예시 사이트 목록만 추가합니다.' : '고객사와 사이트 정보를 DB에 저장합니다.';

  return `<div class="page-heading"><div><h1>사이트 등록</h1><p>새 도메인을 등록하고 검색엔진 연결을 준비하세요.</p></div></div>
    <div class="form-layout"><section class="report form-report"><div class="report-header"><div><h2>새 도메인 등록</h2><p>고객사와 사이트 정보를 입력하세요.</p></div>${icon('globe')}</div>
      <form id="registration-form" class="work-form">${noClientNote}<label>고객사 <span class="required">*</span><input value="${escapeHtml(selectedClient()?.name ?? '')}" readonly required aria-label="현재 선택한 고객사"><span class="field-help">왼쪽 위에서 고객사를 변경할 수 있습니다.</span></label>
      <label>사이트 이름 <span class="required">*</span><input name="siteName" required maxlength="100" placeholder="예: 오터스튜디오 공식 사이트"></label>
      <label>도메인 URL <span class="required">*</span><input name="origin" type="url" required placeholder="https://example.com"><span class="field-help">글 주소가 아닌 사이트의 루트 주소를 입력하세요.</span></label>
      <fieldset><legend>사이트 소유 구분</legend><div class="radio-row"><label class="radio-label"><input type="radio" name="ownership" value="client" checked>고객사 사이트</label><label class="radio-label"><input type="radio" name="ownership" value="internal">우리 팀 사이트</label></div></fieldset>
      <div class="two-fields"><label>사용 플랫폼<select name="cmsType"><option value="">미지정</option><option value="wordpress">WordPress</option><option value="notion">Notion</option><option value="custom">자체 제작</option></select></label><label>인증 파일·태그 설치<select name="editable"><option value="">모름</option><option value="true">설치 가능</option><option value="false">설치 불가능</option></select></label></div><div class="inline-note">사이트 정보와 선택한 IndexNow 설정을 우리 DB에 저장합니다. 검색엔진 사이트 등록·소유 확인은 별도 작업입니다.</div>
      ${authAccountFields()}
      <fieldset class="indexnow-fields"><legend>IndexNow 설정 <span class="muted small">선택 · 네이버 / Bing 공통</span></legend>${indexNowFields()}<p class="field-help">키 파일은 관리 서버가 아닌 대상 도메인에 공개해야 합니다. 두 항목을 비우면 설정 없이 사이트만 등록합니다.</p></fieldset>
      <div class="form-error" id="registration-error"></div><div class="form-footer"><span class="muted small">* 필수 항목</span><button class="button primary" type="submit">${icon('plus')}사이트 등록</button></div></form></section>
      <aside class="context-column"><h3>등록 후 진행 과정</h3><ol class="vertical-steps"><li><strong>사이트 정보 등록</strong><p>고객사와 도메인을 연결합니다.</p></li><li><strong>소유권 또는 접근 권한 확인</strong><p>검색엔진별로 인증 파일·태그 또는 부여된 권한을 확인합니다.</p></li><li><strong>검색엔진 연결</strong><p>연결이 완료되면 발행 알림과 색인 상태 조회를 진행합니다.</p></li></ol><div class="context-note">${icon('info')}<p>${savingNote} 실제 검색엔진 등록·소유 확인은 실행하지 않습니다.</p></div></aside></div>`;
}
