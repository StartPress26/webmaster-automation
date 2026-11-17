import type { IndexNowSettings } from './types';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// IndexNow 키 형식: 8~128자의 16진수 문자와 하이픈
const KEY_PATTERN = /^[a-fA-F0-9-]{8,128}$/;
// 주소 문자열이 http(s)://로 시작하는지
const HTTP_PREFIX = /^https?:\/\//;
// 주소 문자열에 공백이나 역슬래시가 있는지
const WHITESPACE_OR_BACKSLASH = /[\s\\]/;
// 디코딩한 경로에 남아 있으면 안 되는 문자: %, 역슬래시, 제어 문자
const FORBIDDEN_PATH_CHARS = /[%\\\u0000-\u001f\u007f]/;

// ─────────────────────────────────────────────────────────────
// 경로 처리
// ─────────────────────────────────────────────────────────────

// 경로 조각에 현재(.)나 상위(..) 참조가 있는지 확인합니다.
function hasRelativeSegment(path: string): boolean {
  return path.split('/').some((part: string): boolean => part === '.' || part === '..');
}

// 키 파일과 제출 URL의 모호한 경로를 거부하고, 디코딩한 경로를 돌려줍니다.
function safePath(value: string): string {
  const rawPath = /^https?:\/\/[^/?#]+([^?#]*)/.exec(value)?.[1] ?? '/';
  let decoded: string;

  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error('URL 경로의 인코딩을 확인하세요.');
  }

  if (hasRelativeSegment(decoded) || FORBIDDEN_PATH_CHARS.test(decoded)) {
    throw new Error('URL 경로에 상위 경로 참조나 모호한 인코딩을 사용할 수 없습니다.');
  }

  return decoded || '/';
}

// 파일 경로에서 마지막 슬래시까지의 디렉터리 부분만 돌려줍니다.
function directoryOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

// ─────────────────────────────────────────────────────────────
// 키 파일 URL 검사
// ─────────────────────────────────────────────────────────────

// 키 파일 URL 문자열을 URL 객체로 해석합니다. 해석할 수 없으면 안내 메시지와 함께 예외를 던집니다.
function parseKeyLocation(keyLocation: string): URL {
  try {
    return new URL(keyLocation);
  } catch {
    throw new Error('올바른 키 파일 URL을 입력하세요.');
  }
}

// 키 파일 URL이 인증정보·쿼리·프래그먼트 없는 HTTP(S) 주소인지 확인합니다.
function isPlainKeyLocation(keyLocation: string, location: URL): boolean {
  if (!HTTP_PREFIX.test(keyLocation)) return false;
  if (WHITESPACE_OR_BACKSLASH.test(keyLocation)) return false;
  if (location.username || location.password) return false;
  if (keyLocation.includes('?') || keyLocation.includes('#')) return false;
  return true;
}

// 사이트별 키 설정의 쌍과 형식·호스트·경로 범위를 검사합니다. 둘 다 비어 있으면 "설정 없음"(null)입니다.
export function validateIndexNowSettings(
  origin: string,
  keyValue: string,
  locationValue: string,
): IndexNowSettings | null {
  const key = keyValue.trim();
  const keyLocation = locationValue.trim();

  if (!key && !keyLocation) return null;
  if (!key || !keyLocation) {
    throw new Error('IndexNow 키와 키 파일 URL을 함께 입력하세요.');
  }
  if (!KEY_PATTERN.test(key)) {
    throw new Error('키는 8~128자의 16진수 문자(0~9, a~f)와 하이픈으로 입력하세요.');
  }

  const location = parseKeyLocation(keyLocation);
  if (!isPlainKeyLocation(keyLocation, location)) {
    throw new Error('키 파일 URL은 인증정보·쿼리·프래그먼트 없는 HTTP(S) 주소여야 합니다.');
  }
  if (location.hostname !== new URL(origin).hostname) {
    throw new Error('키 파일은 알림 대상 사이트와 같은 호스트에 있어야 합니다.');
  }

  const path = safePath(keyLocation);
  if (path.endsWith('/')) {
    throw new Error('키 파일의 전체 URL을 입력하세요.');
  }
  if (!safePath(origin).startsWith(directoryOf(path))) {
    throw new Error(
      '키 파일의 디렉터리가 사이트 적용 범위를 포함해야 합니다. 도메인 루트에 설치하세요.',
    );
  }

  return { key, keyLocation };
}
