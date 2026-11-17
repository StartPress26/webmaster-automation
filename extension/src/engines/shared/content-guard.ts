// 이 파일은 콘텐츠 스크립트(네이버·Bing 페이지 안)에 번들되므로 다른 모듈을 import하지 않습니다.

// 요청 ID와 작업 ID에 허용하는 형식: 영문·숫자·하이픈 1~80자
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9-]{1,80}$/;

// 값이 허용 형식의 ID 문자열인지 확인합니다.
export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

// 같은 확장의 관리 페이지(index.html)에서 보낸 메시지인지 확인하며 잘못된 발신 URL은 거부합니다.
export function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const managementUrl = new URL(chrome.runtime.getURL('index.html'));
    return (
      senderUrl.protocol === managementUrl.protocol &&
      senderUrl.host === managementUrl.host &&
      senderUrl.pathname === managementUrl.pathname
    );
  } catch {
    return false;
  }
}
