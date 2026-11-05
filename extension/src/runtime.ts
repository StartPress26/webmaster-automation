// 설치된 확장 프로그램은 로컬 API에 직접 연결하고 웹 미리보기는 프록시를 사용합니다.
export function defaultApiBase(protocol: string): string {
  return protocol === 'chrome-extension:' ? 'http://127.0.0.1:8000' : '/api';
}
