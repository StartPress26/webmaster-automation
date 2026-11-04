// 도구 모음 아이콘을 누르면 설치된 확장 프로그램의 관리 화면을 엽니다.
async function openManagementPage(): Promise<void> {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html') });
  } catch {
    console.error('StartPress 관리 화면을 열지 못했습니다.');
  }
}

chrome.action.onClicked.addListener(openManagementPage);
