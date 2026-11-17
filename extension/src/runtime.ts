// 설치된 확장 프로그램이 직접 연결하는 로컬 API 주소
const EXTENSION_API_BASE = 'http://127.0.0.1:18001';
// 웹 미리보기(vite dev 서버)에서 프록시를 거치는 API 경로
const PREVIEW_API_BASE = '/api';

// 설치된 확장 프로그램은 로컬 API에 직접 연결하고 웹 미리보기는 프록시를 사용합니다.
export function defaultApiBase(protocol: string): string {
  return protocol === 'chrome-extension:' ? EXTENSION_API_BASE : PREVIEW_API_BASE;
}
