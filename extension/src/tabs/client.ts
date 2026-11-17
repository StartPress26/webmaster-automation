import type { Engine } from '../types';
import { isTabLoaded } from './readiness.ts';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 화면과 자동화에 전달하는 작업 탭의 읽기 전용 정보
export interface WorkTab {
  readonly tabId: number;
  readonly engine: Engine;
  readonly url: string;
  readonly title: string;
}

// chrome.tabs 중 이 모듈이 쓰는 두 기능. 테스트에서는 가짜 객체를 넘깁니다.
export interface TabsClient {
  readonly query: (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
  readonly get: (tabId: number) => Promise<chrome.tabs.Tab>;
}

// 선택한 탭을 다시 확인한 결과. 실패하면 이유를 함께 돌려줍니다.
export type TabCheck =
  | { readonly connected: true; readonly tab: WorkTab }
  | {
      readonly connected: false;
      readonly reason:
        | 'invalid_selection'
        | 'unavailable'
        | 'unsupported_url'
        | 'url_changed'
        | 'not_ready';
    };

// 어떤 탭을 작업 탭으로 받아들일지 정하는 규칙. 색인 조회용과 발행(네이버 수집)용이 서로 다릅니다.
export interface TabPolicy {
  // chrome.tabs.query에 넘길 URL 패턴 목록
  readonly queryUrls: readonly string[];
  // 주소가 허용되면 어느 엔진의 탭인지, 허용되지 않으면 null
  readonly engineOf: (url: string) => Engine | null;
  // 웹 미리보기처럼 탭 API를 쓸 수 없을 때 보여줄 메시지
  readonly unavailableMessage: string;
}

// ─────────────────────────────────────────────────────────────
// 색인 조회용 규칙: 세 검색엔진의 콘솔 화면
// ─────────────────────────────────────────────────────────────

// 엔진별 콘솔의 출처(origin)와 경로 접두사
const CONSOLE_LOCATIONS: Readonly<Record<Engine, readonly [string, string]>> = {
  naver: ['https://searchadvisor.naver.com', '/console'],
  google: ['https://search.google.com', '/search-console'],
  bing: ['https://www.bing.com', '/webmasters'],
};

// 주어진 URL이 특정 엔진의 콘솔 경로(또는 그 하위 경로)인지 확인합니다.
function isConsolePath(url: URL, engine: Engine): boolean {
  const [origin, path] = CONSOLE_LOCATIONS[engine];
  if (url.origin !== origin) return false;
  return url.pathname === path || url.pathname.startsWith(`${path}/`);
}

// 정확한 HTTPS 출처와 콘솔 경로만 허용하며 로그인 여부는 판정하지 않습니다.
function identifyTabEngine(value: string): Engine | null {
  try {
    const url = new URL(value);
    // 주소에 아이디·비밀번호가 들어 있으면 허용하지 않습니다.
    if (url.username || url.password) return null;

    const engines = Object.keys(CONSOLE_LOCATIONS) as Engine[];
    return engines.find((engine: Engine): boolean => isConsolePath(url, engine)) ?? null;
  } catch {
    return null;
  }
}

// 색인 조회 작업 탭 규칙
const WORK_TAB_POLICY: TabPolicy = {
  queryUrls: Object.values(CONSOLE_LOCATIONS).map(([origin]): string => `${origin}/*`),
  engineOf: identifyTabEngine,
  unavailableMessage: '작업 탭 연결은 설치된 Chrome 확장 프로그램에서 지원합니다.',
};

// ─────────────────────────────────────────────────────────────
// 규칙에 따른 공용 구현
// ─────────────────────────────────────────────────────────────

// 일반 웹 미리보기에서는 Chrome 탭 API를 호출하지 못하도록 명시적으로 중단합니다.
export function browserTabsClient(unavailableMessage: string): TabsClient {
  if (!globalThis.chrome?.tabs) {
    throw new Error(unavailableMessage);
  }
  return chrome.tabs;
}

// 탭 ID가 0 이상의 정수인지 확인합니다.
function isValidTabId(id: number | undefined): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id >= 0;
}

// 규칙에 맞는 탭만 화면에 전달할 읽기 전용 모델로 변환합니다. 시크릿 창이나 주소 없는 탭은 제외합니다.
export function toWorkTabWith(policy: TabPolicy, tab: chrome.tabs.Tab): WorkTab | null {
  if (!isValidTabId(tab.id)) return null;
  if (!tab.url || tab.incognito) return null;

  const engine = policy.engineOf(tab.url);
  if (!engine) return null;

  return { tabId: tab.id, engine, url: tab.url, title: tab.title ?? '' };
}

// 규칙의 URL 패턴에 맞는 열린 탭만 조회하며 탭 선택이나 포커스 변경은 하지 않습니다.
export async function listTabsWith(policy: TabPolicy, client?: TabsClient): Promise<readonly WorkTab[]> {
  const tabsClient = client ?? browserTabsClient(policy.unavailableMessage);
  const tabs = await tabsClient.query({ url: [...policy.queryUrls] });

  return tabs.flatMap((tab: chrome.tabs.Tab): readonly WorkTab[] => {
    const candidate = toWorkTabWith(policy, tab);
    return candidate ? [candidate] : [];
  });
}

// 선택 정보 자체가 규칙에 맞는지(ID 형식, 주소가 그 엔진의 탭인지) 확인합니다.
function isValidSelection(policy: TabPolicy, selected: WorkTab): boolean {
  if (!isValidTabId(selected.tabId)) return false;
  return policy.engineOf(selected.url) === selected.engine;
}

// 선택했을 때와 지금의 탭이 같은 탭·엔진·주소인지 확인합니다.
function isSameTab(current: WorkTab, selected: WorkTab): boolean {
  return (
    current.tabId === selected.tabId &&
    current.engine === selected.engine &&
    current.url === selected.url
  );
}

// 선택한 탭을 다시 조회해 닫힘·권한 제한·주소 변경·문서 준비 상태를 확인합니다.
export async function checkTabWith(
  policy: TabPolicy,
  selected: WorkTab,
  client?: TabsClient,
): Promise<TabCheck> {
  const tabsClient = client ?? browserTabsClient(policy.unavailableMessage);

  if (!isValidSelection(policy, selected)) {
    return { connected: false, reason: 'invalid_selection' };
  }

  let current: chrome.tabs.Tab;
  try {
    current = await tabsClient.get(selected.tabId);
  } catch {
    return { connected: false, reason: 'unavailable' };
  }

  const tab = toWorkTabWith(policy, current);
  if (!tab) return { connected: false, reason: 'unsupported_url' };
  if (!isSameTab(tab, selected)) return { connected: false, reason: 'url_changed' };
  if (!isTabLoaded(current)) return { connected: false, reason: 'not_ready' };

  return { connected: true, tab };
}

// ─────────────────────────────────────────────────────────────
// 색인 조회용 공개 함수
// ─────────────────────────────────────────────────────────────

// 지정된 검색엔진 호스트의 탭만 조회하며 탭 선택이나 포커스 변경은 하지 않습니다.
export function listWorkTabs(client?: TabsClient): Promise<readonly WorkTab[]> {
  return listTabsWith(WORK_TAB_POLICY, client);
}

// 선택한 탭을 다시 조회해 닫힘·권한 제한·주소 변경·문서 준비 상태를 확인합니다.
export function checkWorkTab(selected: WorkTab, client?: TabsClient): Promise<TabCheck> {
  return checkTabWith(WORK_TAB_POLICY, selected, client);
}
