import type { Engine } from '../types';

export interface WorkTab {
  readonly tabId: number;
  readonly engine: Engine;
  readonly url: string;
  readonly title: string;
}

export interface TabsClient {
  // Promise -> 나중에 완료될 작업의 결과를 받는 객체
  // query -> 찾기, get -> 가져오기
  readonly query: (query: chrome.tabs.QueryInfo) => Promise<chrome.tabs.Tab[]>;
  readonly get: (tabId: number) => Promise<chrome.tabs.Tab>;
}

export type TabCheck =
  | { readonly connected: true; readonly tab: WorkTab }
  | { readonly connected: false; readonly reason: 'invalid_selection' | 'unavailable' | 'unsupported_url' | 'url_changed' | 'not_ready' };

const consoleLocations: Readonly<Record<Engine, readonly [string, string]>> = {
  naver: ['https://searchadvisor.naver.com', '/console'],
  google: ['https://search.google.com', '/search-console'],
  bing: ['https://www.bing.com', '/webmasters'],
};

// 정확한 HTTPS 출처와 콘솔 경로만 허용하며 로그인 여부는 판정하지 않습니다.
export function identifyTabEngine(value: string): Engine | null {
  try {
    const url = new URL(value);
    // url에 id혹은 비번이 포함되어 있으면 허용 x
    if (url.username || url.password) return null;

    return (Object.keys(consoleLocations) as Engine[]).find((engine: Engine): boolean => {
      // origin은 출처와 path는 라우팅 경로
      const [origin, path] = consoleLocations[engine];
      // 허용된 콘솔 경로 또는 하위 경로인지 비교
      return url.origin === origin && (url.pathname === path || url.pathname.startsWith(`${path}/`));
    }) ?? null;
  } catch {
    return null;
  }
}

// 일반 웹 미리보기에서는 Chrome 탭 API를 호출하지 못하도록 명시적으로 중단합니다.
function browserTabs(): TabsClient {
  if (!globalThis.chrome?.tabs) throw new Error('작업 탭 연결은 설치된 Chrome 확장 프로그램에서 지원합니다.');
  return chrome.tabs;
}

// URL이 허용되고 식별 가능한 탭만 화면에 전달할 읽기 전용 모델로 변환합니다.
function toWorkTab(tab: chrome.tabs.Tab): WorkTab | null {
  if (typeof tab.id !== 'number' || !Number.isInteger(tab.id) || tab.id < 0 || !tab.url || tab.incognito) return null;
  const engine = identifyTabEngine(tab.url);
  return engine ? { tabId: tab.id, engine, url: tab.url, title: tab.title ?? '' } : null;
}

// 지정된 검색엔진 호스트의 탭만 조회하며 탭 선택이나 포커스 변경은 하지 않습니다.
export async function listWorkTabs(client: TabsClient = browserTabs()): Promise<readonly WorkTab[]> {
  // 지정한 검색엔진 호스트에 맞는 열린 탭을 조회합니다.
  const tabs = await client.query({ url: Object.values(consoleLocations).map(([origin]): string => `${origin}/*`) });

  // flatMap -> merge
  return tabs.flatMap((tab: chrome.tabs.Tab): readonly WorkTab[] => {
    const candidate = toWorkTab(tab);
    return candidate ? [candidate] : [];
  });
}

// 선택한 탭을 다시 조회해 닫힘·권한 제한·주소 변경·문서 준비 상태를 확인합니다.
export async function checkWorkTab(selected: WorkTab, client: TabsClient = browserTabs()): Promise<TabCheck> {
  if (!Number.isInteger(selected.tabId) || selected.tabId < 0 || identifyTabEngine(selected.url) !== selected.engine) {
    return { connected: false, reason: 'invalid_selection' };
  }

  let current: chrome.tabs.Tab;

  try {
    current = await client.get(selected.tabId);
  } catch {
    return { connected: false, reason: 'unavailable' };
  }

  const tab = toWorkTab(current);
  if (!tab) return { connected: false, reason: 'unsupported_url' };
  if (tab.tabId !== selected.tabId || tab.engine !== selected.engine || tab.url !== selected.url) {
    return { connected: false, reason: 'url_changed' };
  }
  if (current.status !== 'complete' || current.pendingUrl || current.discarded) {
    return { connected: false, reason: 'not_ready' };
  }

  return { connected: true, tab };
}
