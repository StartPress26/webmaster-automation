import { installNaverFocusHost } from './focus/host.ts';

// 관리 화면이 닫혀도 네이버 작업의 디버거 연결을 정리할 수 있게 등록합니다.
installNaverFocusHost(chrome);

// 도구 모음 아이콘을 누르면 설치된 확장 프로그램의 관리 화면을 엽니다.
async function openManagementPage(): Promise<void> {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  } catch {
    console.error('StartPress 관리 화면을 열지 못했습니다.');
  }
}

// 아이콘 클릭 이벤트에 위 함수를 연결합니다.
chrome.action.onClicked.addListener(openManagementPage);
