// HTML 특수 문자를 엔티티로 바꾸는 대응표
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// 사용자 입력이나 외부 문자열을 HTML 텍스트와 속성 값에 안전하게 넣을 수 있도록 이스케이프합니다.
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char: string): string => HTML_ESCAPES[char] ?? char);
}
