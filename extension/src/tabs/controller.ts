import { checkWorkTab, listWorkTabs } from './client.ts';
import type { TabCheck, WorkTab } from './client';
import type { Engine } from '../types';

export interface WorkTabState {
  readonly scope: string;
  readonly engine: Engine | null;
  readonly candidates: readonly WorkTab[];
  readonly selected: WorkTab | null;
  readonly message: string;
  readonly choosing: boolean;
  readonly busy: boolean;
}

interface WorkTabDependencies {
  readonly list: () => Promise<readonly WorkTab[]>;
  readonly check: (tab: WorkTab) => Promise<TabCheck>;
  readonly available: () => boolean;
}

export interface WorkTabController {
  readonly getState: () => WorkTabState;
  readonly reset: () => void;
  readonly prepare: (scope: string, engine: Engine, candidateId?: string) => Promise<void>;
}

const emptyState: WorkTabState = {
  scope: '', engine: null, candidates: [], selected: null, message: '', choosing: false, busy: false,
};

// 탭 확인 실패를 색인 조회 결과와 구분되는 안내로 변환합니다.
function failureMessage(result: Extract<TabCheck, { readonly connected: false }>): string {
  const messages: Readonly<Record<typeof result.reason, string>> = {
    invalid_selection: '작업 탭 선택 정보가 유효하지 않습니다.',
    unavailable: '작업 탭이 닫혔거나 접근할 수 없습니다.',
    unsupported_url: '작업 탭이 지원하는 콘솔 주소에 있지 않습니다.',
    url_changed: '선택한 뒤 작업 탭의 주소가 바뀌었습니다.',
    not_ready: '작업 탭이 로딩·이동 중이거나 메모리에서 해제되어 준비되지 않았습니다.',
  };
  return messages[result.reason];
}

// DOM과 분리된 엔진 공통 탭 선택·재검증 상태를 관리합니다.
export function createWorkTabController(dependencies: WorkTabDependencies = {
  list: listWorkTabs,
  check: checkWorkTab,
  available: (): boolean => !!globalThis.chrome?.tabs,
}): WorkTabController {
  let state = emptyState;
  let version = 0;

  // 현재 상태를 읽기 전용 스냅샷으로 반환합니다.
  function getState(): WorkTabState {
    return state;
  }

  // 선택 범위가 바뀌면 상태와 진행 중인 이전 요청의 반영 권한을 초기화합니다.
  function reset(): void {
    ++version;
    state = emptyState;
  }

  // 기존 선택을 재확인하거나 해당 엔진의 최신 후보 목록을 준비합니다.
  async function prepare(scope: string, engine: Engine, candidateId?: string): Promise<void> {
    // 같은 실행인지 확인 -> 중복 실행이면 막기
    const sameScope = state.scope === scope && state.engine === engine;
    if (sameScope && state.busy) return;


    const selected = candidateId === undefined
      ? (sameScope ? state.selected : null)
      : (sameScope ? state.candidates.find((tab: WorkTab): boolean => String(tab.tabId) === candidateId) : null);

    if (candidateId !== undefined && !selected) return;

    // 작업을 기다리는 동안 초기화되거나 새 요청으로 바뀌었다면 이전 결과를 버립니다.
    const requestVersion = ++version;
    state = { ...emptyState, scope, engine, message: '작업 탭을 확인하는 중…', busy: true };

    try {
      let failure = '';
      if (selected) {
        const result = await dependencies.check(selected);
        if (requestVersion !== version) return;
        if (result.connected) {
          state = {
            ...state, selected: result.tab,
            message: '탭 준비됨 · 주소와 문서 준비 상태만 확인했습니다. 로그인·선택 사이트·색인 결과 확인과 GUI 조회·저장은 아직 실행하지 않았습니다.',
          };
          return;
        }
        failure = `${failureMessage(result)} `;
      }

      const tabs = await dependencies.list();

      if (requestVersion !== version) return;

      const candidates = tabs.filter((tab: WorkTab): boolean => tab.engine === engine);
      const onlyCandidate = candidates[0];

      if (candidates.length === 1 && onlyCandidate && !selected) {
        const result = await dependencies.check(onlyCandidate);
        if (requestVersion !== version) return;
        if (result.connected) {
          state = { ...state, selected: result.tab, message: '탭 준비됨 · 주소와 문서 준비 상태만 확인했습니다. 로그인·선택 사이트·색인 결과 확인과 GUI 조회·저장은 아직 실행하지 않았습니다.' };
          return;
        }
        failure = `${failureMessage(result)} `;
      }

      state = {
        ...state, candidates, choosing: true,
        message: failure + (candidates.length
          ? '조회에 사용할 탭을 선택하거나 목록을 다시 확인하세요.'
          : '열린 작업 탭이 없습니다. 선택한 검색엔진의 콘솔 탭을 준비하세요.'),
      };
    } catch {
      if (requestVersion !== version) return;
      state = {
        ...state,
        message: dependencies.available()
          ? '작업 탭 목록을 확인하지 못했습니다. 확장의 사이트 접근 권한을 확인하고 다시 시도하세요.'
          : '작업 탭 확인은 설치된 Chrome 확장 프로그램에서 지원합니다. 웹 개발 화면에서는 사용할 수 없습니다.',
      };
    } finally {
      if (requestVersion === version) state = { ...state, busy: false };
    }
  }

  return { getState, reset, prepare };
}
