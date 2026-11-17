import type { WorkTabState } from './controller';
import type { WorkTab } from './client';
import { escapeHtml } from '../html.ts';

// 선택 상태를 중첩 카드 대신 엔진별 작업 행과 정렬된 입력 폼으로 표시합니다.
export function renderWorkTabPanel(state: WorkTabState, scope: string, engineName: string): string {
  if (state.scope !== scope || !state.message || !state.engine) return '';

  const prefix = `work-tab-${state.engine}`;
  const selected = state.selected;
  const status = selected
    ? '준비됨'
    : state.busy
      ? '확인 중'
      : state.candidates.length
        ? '선택 필요'
        : '탭 확인 필요';

  return `<section class="work-tab-row" aria-labelledby="${prefix}-title">
    <div class="work-tab-row-heading"><span class="engine-symbol ${state.engine}" aria-hidden="true">${state.engine === 'naver' ? 'N' : state.engine === 'google' ? 'G' : 'b'}</span><h3 id="${prefix}-title">${escapeHtml(engineName)} 작업 탭</h3><span class="work-tab-state ${selected ? 'ready' : 'waiting'}">${status}</span></div>
    <div class="work-tab-body"><div class="work-tab-description">
      <p id="${prefix}-message" role="status">${selected ? '탭 준비됨. GUI 조회·저장은 아직 실행하지 않았습니다.' : escapeHtml(state.message)}</p>
      ${selected ? `<p class="work-tab-selected-title">${escapeHtml(selected.title || '제목 없음')}</p><p class="work-tab-url" title="${escapeHtml(selected.url)}">${escapeHtml(selected.url)}</p>` : ''}
    </div>
    ${
      state.choosing && state.candidates.length
        ? `<form class="work-tab-form" id="${prefix}-form" data-work-tab-engine="${state.engine}" data-scope="${escapeHtml(scope)}">
      <div class="work-tab-field"><label for="${prefix}-select">조회에 사용할 탭</label><select id="${prefix}-select" name="tabId" required aria-describedby="${prefix}-message"><option value="">작업 탭을 선택하세요</option>${state.candidates.map((tab: WorkTab): string => `<option value="${tab.tabId}">${escapeHtml(tab.title || '제목 없음')} — ${escapeHtml(tab.url)}</option>`).join('')}</select></div>
      <button class="button secondary" type="submit">선택한 탭 확인</button>
    </form>`
        : ''
    }
    ${!selected && !state.busy ? `<button class="inspection-text-button work-tab-reload" type="button" data-refresh-work-tab="${state.engine}" data-scope="${escapeHtml(scope)}">탭 목록 다시 확인</button>` : ''}
    </div>
  </section>`;
}
