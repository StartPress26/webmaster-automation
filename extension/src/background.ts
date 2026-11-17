// 확장 프로그램의 서비스 워커. 도구 모음 아이콘 클릭에만 반응합니다.

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
