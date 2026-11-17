import type { WorkTabState } from './controller';
import type { WorkTab } from './client';
import { escapeHtml } from '../html.ts';
import { engineSymbol } from '../engines/labels.ts';

// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

// 패널을 쓰는 화면마다 바꿀 수 있는 id 접두사·data 속성·문구. 생략하면 색인 조회 화면의 기본값을 씁니다.
export interface WorkTabPanelOptions {
  readonly idPrefix?: string;
  readonly formAttribute?: string;
  readonly refreshAttribute?: string;
  readonly readyMessage?: string;
  readonly selectLabel?: string;
}

const DEFAULT_FORM_ATTRIBUTE = 'data-work-tab-engine';
const DEFAULT_REFRESH_ATTRIBUTE = 'data-refresh-work-tab';
const DEFAULT_READY_MESSAGE = '탭 준비됨. GUI 조회·저장은 아직 실행하지 않았습니다.';
const DEFAULT_SELECT_LABEL = '조회에 사용할 탭';
const UNTITLED = '제목 없음';

// ─────────────────────────────────────────────────────────────
// 조각 렌더링
// ─────────────────────────────────────────────────────────────

// 오른쪽 위 상태 배지의 문구
function statusLabel(state: WorkTabState): string {
  if (state.selected) return '준비됨';
  if (state.busy) return '확인 중';
  if (state.candidates.length) return '선택 필요';
  return '탭 확인 필요';
}

// 선택된 탭이 있으면 제목과 주소를 보여줍니다.
function selectedDetails(selected: WorkTab | null): string {
  if (!selected) return '';
  const title = escapeHtml(selected.title || UNTITLED);
  const url = escapeHtml(selected.url);
  return `<p class="work-tab-selected-title">${title}</p><p class="work-tab-url" title="${url}">${url}</p>`;
}

// 후보 탭 목록을 select의 option으로 만듭니다.
function candidateOptions(candidates: readonly WorkTab[]): string {
  return candidates
    .map((tab: WorkTab): string =>
      `<option value="${tab.tabId}">${escapeHtml(tab.title || UNTITLED)} — ${escapeHtml(tab.url)}</option>`)
    .join('');
}

// 후보를 고르는 중일 때만 선택 폼을 보여줍니다.
function candidateForm(
  state: WorkTabState,
  scope: string,
  prefix: string,
  formAttribute: string,
  selectLabel: string,
): string {
  if (!state.choosing || !state.candidates.length) return '';
  return `<form class="work-tab-form" id="${prefix}-form" ${formAttribute}="${state.engine}" data-scope="${escapeHtml(scope)}">
      <div class="work-tab-field"><label for="${prefix}-select">${selectLabel}</label><select id="${prefix}-select" name="tabId" required aria-describedby="${prefix}-message"><option value="">작업 탭을 선택하세요</option>${candidateOptions(state.candidates)}</select></div>
      <button class="button secondary" type="submit">선택한 탭 확인</button>
    </form>`;
}

// 아직 선택되지 않았고 확인 중도 아닐 때만 목록 다시 확인 버튼을 보여줍니다.
function reloadButton(state: WorkTabState, scope: string, refreshAttribute: string): string {
  if (state.selected || state.busy) return '';
  return `<button class="inspection-text-button work-tab-reload" type="button" ${refreshAttribute}="${state.engine}" data-scope="${escapeHtml(scope)}">탭 목록 다시 확인</button>`;
}

// ─────────────────────────────────────────────────────────────
// 패널
// ─────────────────────────────────────────────────────────────

// 선택 상태를 중첩 카드 대신 엔진별 작업 행과 정렬된 입력 폼으로 표시합니다.
export function renderWorkTabPanel(
  state: WorkTabState,
  scope: string,
  engineName: string,
  options: WorkTabPanelOptions = {},
): string {
  if (state.scope !== scope || !state.message || !state.engine) return '';

  const prefix = options.idPrefix ?? `work-tab-${state.engine}`;
  const formAttribute = options.formAttribute ?? DEFAULT_FORM_ATTRIBUTE;
  const refreshAttribute = options.refreshAttribute ?? DEFAULT_REFRESH_ATTRIBUTE;
  const readyMessage = options.readyMessage ?? DEFAULT_READY_MESSAGE;
  const selectLabel = options.selectLabel ?? DEFAULT_SELECT_LABEL;

  const selected = state.selected;
  const stateClass = selected ? 'ready' : 'waiting';
  const message = selected ? readyMessage : escapeHtml(state.message);

  return `<section class="work-tab-row" aria-labelledby="${prefix}-title">
    <div class="work-tab-row-heading"><span class="engine-symbol ${state.engine}" aria-hidden="true">${engineSymbol(state.engine)}</span><h3 id="${prefix}-title">${escapeHtml(engineName)} 작업 탭</h3><span class="work-tab-state ${stateClass}">${statusLabel(state)}</span></div>
    <div class="work-tab-body"><div class="work-tab-description">
      <p id="${prefix}-message" role="status">${message}</p>
      ${selectedDetails(selected)}
    </div>
    ${candidateForm(state, scope, prefix, formAttribute, selectLabel)}
    ${reloadButton(state, scope, refreshAttribute)}
    </div>
  </section>`;
}
