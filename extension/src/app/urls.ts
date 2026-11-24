import { isPlainHttpUrl } from '../url.ts';
import { property } from './store.ts';

// 사용자가 입력한 URL이 올바르고 현재 사이트에 속하는지 검사

// HTTP(S) 주소를 검증하고 인증정보와 프래그먼트를 거부합니다. 해석할 수 없는 문자열이면 URL 생성자가 예외를 던집니다.
export function parseUrl(value: string): URL {
  const parsed = new URL(value);
  if (!isPlainHttpUrl(parsed)) {
    throw new Error('인증정보나 #이 없는 HTTP(S) URL을 입력하세요.');
  }
  return parsed;
}

// 주어진 URL이 사이트 URL과 같은 출처이고 그 경로 아래(또는 같은 경로)에 있는지 확인합니다.
function isUnderSite(parsed: URL, parent: URL): boolean {
  if (parsed.origin !== parent.origin) return false;
  // 인코딩된 경로도 비교할 수 있도록 디코딩한 뒤, 사이트 경로 끝에 /를 붙여 접두사로 삼습니다.
  const prefix = decodeURIComponent(parent.pathname).replace(/\/$/, '') + '/';
  return decodeURIComponent(parsed.pathname).startsWith(prefix);
}

// 현재 사이트에 속하는 URL인지 확인합니다. allowHomepage가 아니면 사이트 메인 주소 자체는 거부합니다.
export function targetUrl(value: string, allowHomepage = false): URL {
  const parsed = parseUrl(value);
  if (!property().id) throw new Error('먼저 사이트를 등록하거나 선택하세요.');

  const parent = new URL(property().siteUrl);
  const isHomepage = parsed.href === parent.href;
  if (!isUnderSite(parsed, parent) || (!allowHomepage && isHomepage)) {
    throw new Error('선택한 사이트의 출처·경로에 속한 개별 글 URL을 입력하세요.');
  }
  return parsed;
}
