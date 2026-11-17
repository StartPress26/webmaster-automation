import { checkTabWith, listTabsWith } from '../tabs/client.ts';
import type { Engine } from '../types';
import type { TabCheck, TabPolicy, TabsClient, WorkTab } from '../tabs/client';

// 네이버 서치어드바이저의 출처
const NAVER_ORIGIN = 'https://searchadvisor.naver.com';

// 네이버 안내·홈에서도 웹마스터 도구로 이동할 수 있게 정확한 출처의 일반 화면을 허용합니다.
// 인증 화면(/auth, login 포함 경로)은 제외합니다.
function publicationNaverUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== NAVER_ORIGIN) return false;
    if (url.username || url.password) return false;
    if (url.pathname.startsWith('/auth')) return false;
    if (/login/i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

// 허용되는 네이버 주소면 'naver', 아니면 null
function publicationEngineOf(url: string): Engine | null {
  return publicationNaverUrl(url) ? 'naver' : null;
}

// 발행(네이버 GUI 수집 요청) 작업 탭 규칙. 다른 서비스의 탭은 조회하지 않습니다.
const PUBLICATION_TAB_POLICY: TabPolicy = {
  queryUrls: [`${NAVER_ORIGIN}/*`],
  engineOf: publicationEngineOf,
  unavailableMessage: '네이버 GUI 수집은 설치된 Chrome 확장에서 지원합니다.',
};

// 다른 서비스의 탭을 조회하지 않고 네이버의 로그인 화면을 제외한 후보만 반환합니다.
export function listPublicationNaverTabs(client?: TabsClient): Promise<readonly WorkTab[]> {
  return listTabsWith(PUBLICATION_TAB_POLICY, client);
}

// 선택 이후 탭의 주소·문서 준비 상태가 달라졌다면 발행을 시작하지 않습니다.
export function checkPublicationNaverTab(selected: WorkTab, client?: TabsClient): Promise<TabCheck> {
  return checkTabWith(PUBLICATION_TAB_POLICY, selected, client);
}
