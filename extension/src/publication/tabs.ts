import type { TabCheck, TabsClient, WorkTab } from '../tabs/client';
import { isTabLoaded } from '../tabs/readiness.ts';

// 네이버 안내·홈에서도 웹마스터 도구로 이동할 수 있게 정확한 출처의 일반 화면을 허용합니다.
function publicationNaverUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://searchadvisor.naver.com' && !url.username && !url.password &&
      !url.pathname.startsWith('/auth') && !/login/i.test(url.pathname);
  } catch {
    return false;
  }
}

// 설치된 확장의 네이버 호스트 권한으로만 탭 API를 호출합니다.
function browserTabs(): TabsClient {
  if (!globalThis.chrome?.tabs) throw new Error('네이버 GUI 수집은 설치된 Chrome 확장에서 지원합니다.');
  return chrome.tabs;
}

// 네이버 홈·가이드·콘솔 탭을 발행 전용 읽기 모델로 바꿉니다.
function publicationTab(tab: chrome.tabs.Tab): WorkTab | null {
  if (!Number.isInteger(tab.id) || tab.id === undefined || tab.id < 0 ||
    !tab.url || tab.incognito || !publicationNaverUrl(tab.url)) return null;
  return { tabId: tab.id, engine: 'naver', url: tab.url, title: tab.title ?? '' };
}

// 다른 서비스의 탭을 조회하지 않고 네이버의 로그인 화면을 제외한 후보만 반환합니다.
export async function listPublicationNaverTabs(client: TabsClient = browserTabs()): Promise<readonly WorkTab[]> {
  const tabs = await client.query({ url: ['https://searchadvisor.naver.com/*'] });
  return tabs.flatMap((tab): readonly WorkTab[] => {
    const candidate = publicationTab(tab);
    return candidate ? [candidate] : [];
  });
}

// 선택 이후 탭의 주소·문서 준비 상태가 달라졌다면 발행을 시작하지 않습니다.
export async function checkPublicationNaverTab(
  selected: WorkTab,
  client: TabsClient = browserTabs(),
): Promise<TabCheck> {
  if (selected.engine !== 'naver' || !Number.isInteger(selected.tabId) || selected.tabId < 0 ||
    !publicationNaverUrl(selected.url)) return { connected: false, reason: 'invalid_selection' };
  let current: chrome.tabs.Tab;
  try { current = await client.get(selected.tabId); }
  catch { return { connected: false, reason: 'unavailable' }; }
  const tab = publicationTab(current);
  if (!tab) return { connected: false, reason: 'unsupported_url' };
  if (tab.tabId !== selected.tabId || tab.url !== selected.url)
    return { connected: false, reason: 'url_changed' };
  if (!isTabLoaded(current))
    return { connected: false, reason: 'not_ready' };
  return { connected: true, tab };
}
