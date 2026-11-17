import { isPlainHttpUrl } from '../url.ts';
import { property } from './store.ts';

// 사용자가 입력한 URL이 올바르고 현재 사이트에 속하는지 검사

// HTTP(S) 주소를 검증하고 인증정보와 프래그먼트를 거부합니다.
export function parseUrl(value: string): URL {
  const parsed = new URL(value);
  if (!isPlainHttpUrl(parsed)) {
    throw new Error('인증정보나 #이 없는 HTTP(S) URL을 입력하세요.');
  }

  return parsed;
}

// 현재 사이트에 속하는 URL인지 확인합니다.
export function targetUrl(value: string, allowHomepage = false): URL {
  const parsed = parseUrl(value);
  if (!property().id) throw new Error('먼저 사이트를 등록하거나 선택하세요.');

  const parent = new URL(property().siteUrl);
  const prefix = decodeURIComponent(parent.pathname).replace(/\/$/, '') + '/';
  if (
    parsed.origin !== parent.origin ||
    !decodeURIComponent(parsed.pathname).startsWith(prefix) ||
    (!allowHomepage && parsed.href === parent.href)
  )
    throw new Error('선택한 사이트의 출처·경로에 속한 개별 글 URL을 입력하세요.');

  return parsed;
}
