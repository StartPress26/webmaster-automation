// http/https 프로토콜이고 인증정보(아이디·비밀번호)와 프래그먼트(#)가 없는 URL인지 확인합니다.
export function isPlainHttpUrl(url: URL): boolean {
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.hash;
}

// 문자열을 URL로 해석해 위 조건을 만족하면 정규화된 주소(href)를, 아니면 null을 돌려줍니다.
export function canonicalHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return isPlainHttpUrl(url) ? url.href : null;
  } catch {
    return null;
  }
}
