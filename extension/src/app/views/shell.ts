import { clientProperties } from '../../dashboard.ts';
import { ENGINE_NAMES } from '../../engines/labels.ts';
import { escapeHtml } from '../../html.ts';
import { icon, statusNames, viewTitles } from '../constants.ts';
import { errorPanel } from '../form-errors.ts';
import { demo, inspections, property, store } from '../store.ts';
import { authAccountFields } from './registration.ts';
import type { Activity, Client, Inspection, Property, View } from '../../types.ts';
import type { Icon } from '../constants.ts';

// 헤더·사이드바 메뉴·고객사 관리 화면·활동 이력·URL 상세 모달

// 발행·검사 화면에서 현재 고객사 소속 블로그만 선택하게 합니다.
export function sitePicker(): string {
  if (store.state.view !== 'inspect' && store.state.view !== 'notify') return '';
  const sites = clientProperties(store.properties, store.state.clientId);
  return `<section class="site-context"><label for="property-select">${store.state.view === 'inspect' ? '결과를 볼 블로그' : '관리할 블로그'}</label><select id="property-select">${sites.length ? sites.map((site): string => `<option value="${escapeHtml(site.id)}" ${site.id === store.state.propertyId ? 'selected' : ''}>${escapeHtml(site.name)} · ${escapeHtml(site.siteUrl)}${site.active ? '' : ' (비활성)'}</option>`).join('') : '<option value="">등록된 블로그 없음</option>'}</select>${sites.length ? '' : '<button class="button secondary" data-view="register">사이트 등록</button>'}</section>`;
}

// 왼쪽 메뉴의 한 항목을 표시합니다.
export function navigation(view: View, name: Icon): string {
  return `<button class="nav-item ${store.state.view === view ? 'active' : ''}" data-view="${view}" ${store.state.view === view ? 'aria-current="page"' : ''}>${icon(name)}<span>${viewTitles[view]}</span></button>`;
}

// 선택한 고객사의 사이트별 계정 연결을 읽기 전용으로 표시합니다.
function siteAccountsView(): string {
  const sites = clientProperties(store.properties, store.state.clientId);
  return `<section class="report"><div class="report-header"><h2>사이트별 계정 연결</h2></div><div class="table-scroll"><table class="client-table"><thead><tr><th>사이트</th><th>Google</th><th>Bing</th><th>네이버 · 참고용</th><th>작업</th></tr></thead><tbody>${sites.map((site): string => {
    const editor = store.accountEditor?.siteId === site.id && store.accountEditor.clientId === store.state.clientId ? store.accountEditor : null;
    return `<tr><td>${escapeHtml(site.name)}</td><td>${escapeHtml(site.googleAccountEmail ?? '미연결')}</td><td>${escapeHtml(site.bingAccountEmail ?? '미연결')}</td><td>${escapeHtml(site.naverAccountEmail ?? '미입력')}</td><td><button type="button" class="button secondary" data-edit-accounts="${escapeHtml(site.id)}" aria-expanded="${!!editor}">계정 변경</button></td></tr>
      ${editor ? `<tr><td colspan="5"><form id="${escapeHtml(editor.formId)}" data-account-editor class="work-form"><h3>${escapeHtml(site.name)} 계정 변경</h3><p class="field-help">${escapeHtml(site.siteUrl)}</p>${authAccountFields(editor.original, editor.formId)}<div id="account-editor-error">${store.accountEditorError ? errorPanel(store.accountEditorError, '사이트 계정을 변경하지 못했습니다') : ''}</div><div><button type="submit" class="button primary" id="save-site-accounts">저장</button> <button type="button" class="button secondary" id="cancel-site-accounts">취소</button></div></form></td></tr>` : ''}`;
  }).join('') || '<tr><td colspan="5">등록된 사이트가 없습니다.</td></tr>'}</tbody></table></div></section>`;
}

// 고객사 목록과 신규 고객사 입력 화면을 표시합니다.
export function clientsView(): string {
  return `<div class="page-heading"><div><h1>고객사 관리</h1><p>팀에서 관리하는 고객사와 연결된 사이트를 확인하세요.</p></div></div>${siteAccountsView()}
    <section class="report"><div class="report-header"><h2>고객사 목록 <span class="count">${store.clients.length}</span></h2></div><div class="table-scroll"><table class="client-table"><thead><tr><th>고객사</th><th>담당자</th><th>등록된 사이트</th></tr></thead><tbody>${store.clients.map((client: Client): string => `<tr><td><strong>${escapeHtml(client.name)}</strong></td><td>${escapeHtml(client.manager || '미지정')}</td><td>${store.properties.filter((item: Property): boolean => item.clientId === client.id).length}개</td></tr>`).join('')}</tbody></table></div></section>
    <section class="report form-report"><div class="report-header"><h2>고객사 추가</h2></div><form id="client-form" class="work-form"><div class="two-fields"><label>고객사 이름 *<input name="clientName" required maxlength="100" placeholder="고객사 이름"></label><label>담당자<input name="manager" maxlength="100" placeholder="선택 입력"></label></div><div class="form-error" id="client-error"></div><div class="form-footer"><span class="muted small">${demo ? '예시 목록에 추가됩니다' : '고객사 정보를 DB에 저장합니다'}</span><button class="button primary" type="submit">${icon('plus')}고객사 추가</button></div></form></section>`;
}

// 로컬 미리보기에서 실행한 작업만 이력으로 표시합니다.
export function activityView(): string {
  if (store.activities.length === 0) return '';
  return `<section class="report"><div class="report-header"><h2>이번 화면의 작업 이력</h2></div><ul class="activity-list">${store.activities.map((activity: Activity): string => `<li>${icon('check')}<span>${escapeHtml(activity.label)}</span><time>${escapeHtml(activity.time)}</time></li>`).join('')}</ul></section>`;
}

// 선택한 URL의 실제 관측과 미확인 단계를 구분한 상세 화면을 표시합니다.
export function detailView(): string {
  const row = inspections.find((item: Inspection): boolean => item.id === store.state.selectedId);
  if (!row) return '';

  const indexed = row.status === 'indexed';
  const crawled = row.crawledAt !== null;

  return `<div class="modal-backdrop" id="detail-backdrop"><section class="detail-dialog" role="dialog" aria-modal="true" aria-labelledby="detail-heading" tabindex="-1"><header class="detail-header"><h2 id="detail-heading">URL 검사 결과</h2><button class="icon-button" id="close-detail" aria-label="상세 결과 닫기">${icon('close')}</button></header><div class="detail-body"><div class="detail-result ${indexed ? 'indexed' : row.status}">${icon(indexed ? 'check' : 'info')}<div><h3>${statusNames[row.status]}</h3><p>${indexed ? '이 URL의 색인 등록이 확인되었습니다.' : row.status === 'not_indexed' ? '이 관측에서는 색인이 확인되지 않았습니다.' : '최종 색인 결과가 아직 확인되지 않았습니다.'}</p></div></div><p class="detail-url">${escapeHtml(property().origin + row.path)}</p><ol class="inspection-steps"><li><span class="step-mark">?</span><strong>URL 제출</strong><span>접수 기록 미확인</span></li><li><span class="step-mark">${row.status === 'waiting' ? '•' : '?'}</span><strong>수집 대기</strong><span>${row.status === 'waiting' ? '현재 예시 상태' : '대기 이력 미확인'}</span></li><li class="${crawled ? 'observed' : ''}"><span class="step-mark">${crawled ? '✓' : '?'}</span><strong>크롤링</strong><span>${crawled ? escapeHtml(row.crawledAt ?? '') : '아직 확인되지 않음'}</span></li><li class="${indexed ? 'observed' : ''}"><span class="step-mark">${indexed ? '✓' : '?'}</span><strong>색인 여부</strong><span>${indexed ? '색인됨' : row.status === 'not_indexed' ? '색인되지 않음' : '아직 확인되지 않음'}</span></li></ol><dl class="property-facts"><div><dt>검색엔진</dt><dd>${ENGINE_NAMES[row.engine]}</dd></div><div><dt>마지막 확인</dt><dd>${escapeHtml(row.checkedAt)}</dd></div><div><dt>데이터</dt><dd>미리보기 예시</dd></div></dl><div class="inline-note">단계는 항상 순서대로 관측되는 것이 아닙니다. 제출 이력이 없어도 크롤링·색인이 확인될 수 있습니다.</div></div></section></div>`;
}
