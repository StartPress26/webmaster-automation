import { checkWorkTab, listWorkTabs } from './client.ts';
import type { TabCheck, WorkTab } from './client';
import type { Engine } from '../types';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 엔진 하나의 작업 탭 선택 상태
export interface WorkTabState {
  readonly scope: string;
  readonly engine: Engine | null;
  readonly candidates: readonly WorkTab[];
  readonly selected: WorkTab | null;
  readonly message: string;
  readonly choosing: boolean;
  readonly busy: boolean;
}

// 컨트롤러가 바깥에서 넘겨받는 함수들 (테스트에서는 가짜 함수를 넘깁니다)
interface WorkTabDependencies {
  readonly list: () => Promise<readonly WorkTab[]>;
  readonly check: (tab: WorkTab) => Promise<TabCheck>;
  readonly available: () => boolean;
}

// 화면과 상위 컨트롤러가 쓰는 기능
export interface WorkTabController {
  readonly getState: () => WorkTabState;
  readonly reset: () => void;
  readonly prepare: (scope: string, engine: Engine, candidateId?: string) => Promise<void>;
}

type TabCheckFailure = Extract<TabCheck, { readonly connected: false }>;

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const EMPTY_STATE: WorkTabState = {
  scope: '',
  engine: null,
  candidates: [],
  selected: null,
  message: '',
  choosing: false,
  busy: false,
};

const CHECKING_MESSAGE = '작업 탭을 확인하는 중…';
const READY_MESSAGE =
  '탭 준비됨 · 주소와 문서 준비 상태만 확인했습니다. 로그인·선택 사이트·색인 결과 확인과 GUI 조회·저장은 아직 실행하지 않았습니다.';
const CHOOSE_MESSAGE = '조회에 사용할 탭을 선택하거나 목록을 다시 확인하세요.';
const NO_TABS_MESSAGE = '열린 작업 탭이 없습니다. 선택한 검색엔진의 콘솔 탭을 준비하세요.';
const LIST_FAILED_MESSAGE =
  '작업 탭 목록을 확인하지 못했습니다. 확장의 사이트 접근 권한을 확인하고 다시 시도하세요.';
const UNAVAILABLE_MESSAGE =
  '작업 탭 확인은 설치된 Chrome 확장 프로그램에서 지원합니다. 웹 개발 화면에서는 사용할 수 없습니다.';

// 탭 확인 실패 이유별 안내 문구
const FAILURE_MESSAGES: Readonly<Record<TabCheckFailure['reason'], string>> = {
  invalid_selection: '작업 탭 선택 정보가 유효하지 않습니다.',
  unavailable: '작업 탭이 닫혔거나 접근할 수 없습니다.',
  unsupported_url: '작업 탭이 지원하는 콘솔 주소에 있지 않습니다.',
  url_changed: '선택한 뒤 작업 탭의 주소가 바뀌었습니다.',
  not_ready: '작업 탭이 로딩·이동 중이거나 메모리에서 해제되어 준비되지 않았습니다.',
};

// ─────────────────────────────────────────────────────────────
// 순수 함수
// ─────────────────────────────────────────────────────────────

// 탭 확인 실패를 색인 조회 결과와 구분되는 안내로 변환합니다.
function failureMessage(result: TabCheckFailure): string {
  return FAILURE_MESSAGES[result.reason];
}

// 이번 요청에서 다시 확인할 탭을 고릅니다.
// 다른 실행이면 없음(null), 후보 ID가 없으면 기존 선택, 있으면 후보 목록에서 그 ID를 찾습니다.
function selectionFor(
  state: WorkTabState,
  sameScope: boolean,
  candidateId: string | undefined,
): WorkTab | null | undefined {
  if (!sameScope) return null;
  if (candidateId === undefined) return state.selected;
  return state.candidates.find((tab: WorkTab): boolean => String(tab.tabId) === candidateId);
}

// 후보 선택 단계의 안내. 앞선 확인 실패 문구가 있으면 앞에 붙입니다.
function choosingMessage(failure: string, hasCandidates: boolean): string {
  return failure + (hasCandidates ? CHOOSE_MESSAGE : NO_TABS_MESSAGE);
}

// 목록 조회 자체가 실패했을 때의 안내. 탭 API가 없는 환경(웹 미리보기)인지 구분합니다.
function listFailureMessage(available: boolean): string {
  return available ? LIST_FAILED_MESSAGE : UNAVAILABLE_MESSAGE;
}

// ─────────────────────────────────────────────────────────────
// 컨트롤러
// ─────────────────────────────────────────────────────────────

// DOM과 분리된 엔진 공통 탭 선택·재검증 상태를 관리합니다.
export function createWorkTabController(
  dependencies: WorkTabDependencies = {
    list: listWorkTabs,
    check: checkWorkTab,
    available: (): boolean => Boolean(globalThis.chrome?.tabs),
  },
): WorkTabController {
  let state = EMPTY_STATE;
  // 기다리는 동안 reset이나 새 prepare가 끼어들었는지 확인하는 번호
  let version = 0;

  // 현재 상태를 읽기 전용 스냅샷으로 반환합니다.
  function getState(): WorkTabState {
    return state;
  }

  // 선택 범위가 바뀌면 상태와 진행 중인 이전 요청의 반영 권한을 초기화합니다.
  function reset(): void {
    version += 1;
    state = EMPTY_STATE;
  }

  // 확인에 성공한 탭을 선택 상태로 기록합니다.
  function markConnected(tab: WorkTab): void {
    state = { ...state, selected: tab, message: READY_MESSAGE };
  }

  // 탭 하나를 다시 확인합니다. 성공하면 선택 상태로 기록하고 빈 문자열을, 실패하면 실패 문구를 돌려줍니다.
  // 기다리는 동안 요청이 바뀌었으면 null을 돌려줍니다.
  async function confirmTab(tab: WorkTab, requestVersion: number): Promise<string | null> {
    const result = await dependencies.check(tab);
    if (requestVersion !== version) return null;

    if (result.connected) {
      markConnected(result.tab);
      return '';
    }
    return `${failureMessage(result)} `;
  }

  // 기존 선택을 재확인하거나 해당 엔진의 최신 후보 목록을 준비합니다.
  async function prepare(scope: string, engine: Engine, candidateId?: string): Promise<void> {
    // 같은 실행에서 이미 확인 중이면 중복 실행하지 않습니다.
    const sameScope = state.scope === scope && state.engine === engine;
    if (sameScope && state.busy) return;

    const selected = selectionFor(state, sameScope, candidateId);
    if (candidateId !== undefined && !selected) return;

    // 작업을 기다리는 동안 초기화되거나 새 요청으로 바뀌었다면 이전 결과를 버립니다.
    version += 1;
    const requestVersion = version;

    state = { ...EMPTY_STATE, scope, engine, message: CHECKING_MESSAGE, busy: true };

    try {
      let failure = '';

      // 1. 기존 선택이 있으면 먼저 다시 확인합니다.
      if (selected) {
        const outcome = await confirmTab(selected, requestVersion);
        if (outcome === null) return;
        if (outcome === '') return;
        failure = outcome;
      }

      // 2. 열린 탭 목록에서 이 엔진의 후보를 모읍니다.
      const tabs = await dependencies.list();
      if (requestVersion !== version) return;

      const candidates = tabs.filter((tab: WorkTab): boolean => tab.engine === engine);

      // 3. 후보가 딱 하나이고 기존 선택이 없었다면 바로 확인합니다.
      const onlyCandidate = candidates.length === 1 ? candidates[0] : undefined;
      if (onlyCandidate && !selected) {
        const outcome = await confirmTab(onlyCandidate, requestVersion);
        if (outcome === null) return;
        if (outcome === '') return;
        failure = outcome;
      }

      // 4. 사용자가 고르도록 후보 목록을 보여줍니다.
      state = {
        ...state,
        candidates,
        choosing: true,
        message: choosingMessage(failure, candidates.length > 0),
      };
    } catch {
      if (requestVersion !== version) return;
      state = { ...state, message: listFailureMessage(dependencies.available()) };
    } finally {
      if (requestVersion === version) state = { ...state, busy: false };
    }
  }

  return { getState, reset, prepare };
}
