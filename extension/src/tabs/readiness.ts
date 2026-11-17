// 탭이 로딩을 마쳤고(complete), 이동 대기 중인 주소가 없으며, 메모리에서 내려가지 않은 상태인지 확인합니다.
export function isTabLoaded(tab: chrome.tabs.Tab): boolean {
  return tab.status === 'complete' && !tab.pendingUrl && !tab.discarded;
}
