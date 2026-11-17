import { presentError } from '../../errors.ts';
import { escapeHtml } from '../../html.ts';
import { renderPublication } from '../../publication/view.ts';
import { icon } from '../constants.ts';
import { publications } from '../controllers.ts';
import { errorPanel } from '../form-errors.ts';
import { demo, property, store } from '../store.ts';
import { indexNowSettingsView } from './registration.ts';
import { activityView } from './shell.ts';
import type { Client, NotifyRoute, PageCreateResult, PageOutcome } from '../../types.ts';
import type { Icon } from '../constants.ts';

// 새 글 발행 알림 화면과 글별 처리 결과 표

// 새 글의 처리 경로 선택과 URL 입력 화면을 표시합니다.
export function notificationView(): string {
  const routes: readonly { id: NotifyRoute; title: string; subtitle: string; icon: Icon }[] = [
    { id: 'direct', title: '직접 알림', subtitle: '접근 권한이 있는 사이트', icon: 'send' },
    {
      id: 'link',
      title: '우리 블로그에 링크 추가',
      subtitle: '고객사 글을 소개하는 경로',
      icon: 'link',
    },
    { id: 'request', title: '고객사에 요청', subtitle: '담당자에게 제출 요청', icon: 'mail' },
  ];

  return `<div class="page-heading"><div><h1>새 글 발행 알림</h1><p>등록된 사이트의 새 글을 검색엔진에 알리거나 후속 작업을 준비하세요.</p></div></div>
    ${property().id ? '' : '<div class="inline-note">먼저 사이트를 등록하거나 왼쪽에서 사이트를 선택하세요.</div>'}
    <div class="route-options" role="group" aria-label="발행 알림 처리 방법">${routes.map((route): string => `<button class="route-option ${store.state.route === route.id ? 'selected' : ''}" data-route="${route.id}" aria-pressed="${store.state.route === route.id}">${icon(route.icon)}<strong>${route.title}</strong><span>${route.subtitle}</span>${store.state.route === route.id ? icon('check', 'route-check') : ''}</button>`).join('')}</div>
    <div class="form-layout"><section class="report form-report"><div class="report-header"><div><h2>${routes.find((route): boolean => route.id === store.state.route)?.title}</h2><p>${escapeHtml(property().name)} · ${escapeHtml(property().origin)}</p></div></div>
      ${store.state.route === 'direct' ? indexNowSettingsView() : ''}
      <form id="notification-form" class="work-form"><label>글 제목 <span class="required">*</span><textarea name="titles" rows="2" required placeholder="새 글 제목을 입력하세요">${escapeHtml(store.notificationTitles)}</textarea><span class="field-help">여러 글은 URL과 같은 순서로 한 줄에 하나씩 제목을 입력하세요.</span></label><label>발행된 글 URL <span class="required">*</span><textarea name="urls" rows="5" required placeholder="${escapeHtml(property().origin)}/posts/new-article">${escapeHtml(store.notificationDraft)}</textarea><span class="field-help">URL을 한 줄에 하나씩 입력하세요. 선택한 사이트의 글만 처리합니다.</span></label>
      ${store.state.route === 'direct' ? `<fieldset class="publication-options"><legend class="visually-hidden">발행 알림 방법</legend><div class="publication-option"><label class="radio-label"><input type="checkbox" name="notify" id="notify-enabled" aria-describedby="indexnow-notify-help" ${store.notifyEnabled ? 'checked' : ''}>글 저장과 함께 IndexNow 알림 전송</label><p class="field-help" id="indexnow-notify-help">IndexNow로 네이버·Bing에 알립니다. Google 일반 URL 제출과는 별개입니다.</p></div><div class="publication-option"><label class="radio-label"><input type="checkbox" name="naverGui" id="naver-gui-enabled" aria-describedby="naver-gui-help" ${store.naverGuiEnabled ? 'checked' : ''}>네이버 GUI로도 수집 요청</label><p class="field-help" id="naver-gui-help">로그인된 네이버 탭을 확인한 뒤 저장된 글을 웹 페이지 수집에 요청합니다. 접수 후 수집·색인은 별도로 확인하세요.</p></div></fieldset>` : store.state.route === 'link' ? '<div class="inline-note">우리 블로그의 글 편집·발행 작업을 준비합니다. 링크 추가가 고객사 URL의 직접 제출이나 색인을 보장하지는 않습니다.</div>' : '<label>요청 내용<textarea name="note" rows="2" placeholder="예: 신규 글 제출과 접수 결과 확인을 부탁드립니다."></textarea></label>'}
      <div class="form-error" id="notification-error"></div><div class="form-footer"><span class="muted small">${store.state.route === 'direct' ? (demo ? '예시 실행 · 실제 전송 없음' : '글 저장과 알림 결과를 각각 확인하세요') : '문구 작성만 수행하며 외부 전달·발행은 하지 않습니다'}</span><button class="button primary" type="submit" id="submit-pages">${icon(store.state.route === 'direct' ? 'send' : store.state.route === 'link' ? 'link' : 'mail')}${store.state.route === 'direct' ? '글 저장 및 발행 알림' : store.state.route === 'link' ? '링크 추가 작업 준비' : '요청 문구 만들기'}</button></div></form>
      ${store.state.route === 'direct' ? renderPublication(publications.getState(), property().id) : ''}
      ${store.requestText ? `<div class="request-result"><h3>${store.state.route === 'request' ? '고객사에 전달할 요청 문구' : '링크 추가 작업 메모'}</h3><pre>${escapeHtml(store.requestText)}</pre><button class="button secondary" id="copy-request">문구 복사</button></div>` : ''}</section>
      <aside class="context-column"><h3>사이트 처리 권한</h3><dl class="property-facts"><div><dt>고객사</dt><dd>${escapeHtml(store.clients.find((client: Client): boolean => client.id === property().clientId)?.name ?? '')}</dd></div><div><dt>소유 구분</dt><dd>${property().owned ? '우리 팀 사이트' : '고객사 사이트'}</dd></div><div><dt>접근 권한</dt><dd>실제 연결 시 확인 필요</dd></div></dl><div class="context-note">${icon('info')}<p>고객사 사이트는 권한과 운영 방식에 맞게 처리하세요. 요청 문구 작성과 실제 고객사 전달은 구분합니다.</p></div></aside></div>
    <div id="batch-results">${outcomeView()}</div>${activityView()}`;
}

// 글 저장과 알림 접수 결과를 별도 열로 표시합니다.
function outcomeView(): string {
  if (!store.outcomes.length) return '';

  const labels: Record<PageCreateResult['submission']['status'], string> = {
    accepted: '알림 접수됨',
    key_pending: '키 확인 중',
    failed: '글 저장됨 · 알림 실패',
    unknown: '글 저장됨 · 접수 여부 불명',
    skipped: '알림 생략',
  };
  const explanations: Readonly<Record<string, string>> = {
    INDEXNOW_NOT_CONFIGURED: '키 설정이 없어 알림을 생략했습니다. 글은 저장됐습니다.',
    INDEXNOW_SETTINGS_INCONSISTENT:
      '사이트의 IndexNow 설정이 일치하지 않습니다. 키와 파일 URL을 함께 확인하세요.',
    INVALID_INDEXNOW_SETTINGS: '사이트의 키 설정 또는 적용 범위를 확인하세요.',
    INDEXNOW_REJECTED:
      'IndexNow가 알림을 거절했습니다. 글을 다시 등록하지 말고 설정과 응답을 확인하세요.',
    INDEXNOW_TIMEOUT:
      '알림 응답 시간이 초과돼 접수 여부를 알 수 없습니다. 자동 재전송하지 않습니다.',
    INDEXNOW_TRANSPORT_ERROR:
      '알림 통신 중 접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.',
    INDEXNOW_RESPONSE_ERROR:
      '알림 응답의 대상이나 접수 결과를 확인하지 못했습니다. 자동 재전송하지 않습니다.',
    NOTIFICATION_DISABLED: '알림을 선택하지 않아 글만 저장했습니다.',
    DEMO_MODE: '예시 결과이며 실제 저장·전송은 하지 않았습니다.',
  };

  return `<section class="report" aria-label="이번 글 처리 결과"><div class="report-header"><div><h2>글별 처리 결과</h2><p>저장과 알림 결과는 별개입니다. 새로고침하면 이번 실행 결과는 사라집니다.</p></div>${store.outcomes.some((item: PageOutcome): boolean => item.saveStatus === 'unknown') ? '<button class="button secondary" type="button" data-error-action="saves">글 저장 여부 확인</button>' : ''}</div>${store.outcomesError ? errorPanel(store.outcomesError, '글 저장 여부를 확인하지 못했습니다', 'saves') : ''}<div class="table-scroll"><table><thead><tr><th>글</th><th>DB 저장</th><th>알림 결과·다음 행동</th></tr></thead><tbody>${store.outcomes
    .map((item: PageOutcome): string => {
      const issue = item.error ? presentError(item.error, '처리 오류') : null;
      const reason = item.result?.submission.error_code
        ? (explanations[item.result.submission.error_code] ?? '알림 처리 결과를 확인하세요.')
        : '';
      return `<tr><td>${escapeHtml(item.article.name)}<span class="result-url">${escapeHtml(item.article.url)}</span></td><td>${item.saveStatus === 'existing' ? '기존 글 사용' : item.saveStatus === 'saved' ? (demo ? '예시 저장' : '저장 확인됨') : item.saveStatus === 'unknown' ? '저장 여부 불명' : item.saveStatus === 'rejected' ? '요청 거절' : '미실행'}</td><td>${item.result ? labels[item.result.submission.status] : item.saveStatus === 'not_sent' ? '전송하지 않음' : '접수 여부 미확인'}${reason ? `<span class="result-url">${escapeHtml(reason)}</span>` : ''}${item.message ? `<span class="result-url">${escapeHtml(item.message)}</span>` : ''}${issue ? `<details class="row-error"><summary>원인·다음 행동</summary><p>${escapeHtml(issue.advice)}</p><small>오류 코드: ${escapeHtml(item.error?.code ?? '')}</small></details>` : ''}</td></tr>`;
    })
    .join('')}</tbody></table></div></section>`;
}
