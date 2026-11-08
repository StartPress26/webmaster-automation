import type { IndexNowSettings } from './types';

// 키 파일과 제출 URL의 모호한 경로를 거부합니다.
function safePath(value: string): string {
  const rawPath = /^https?:\/\/[^/?#]+([^?#]*)/.exec(value)?.[1] ?? '/';
  let decoded: string;

  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error('URL 경로의 인코딩을 확인하세요.');
  }

  if (
    decoded.split('/').some((part: string): boolean => part === '.' || part === '..') ||
    /[%\\\u0000-\u001f\u007f]/.test(decoded)
  ) {
    throw new Error('URL 경로에 상위 경로 참조나 모호한 인코딩을 사용할 수 없습니다.');
  }

  return decoded || '/';
}

// 사이트별 키 설정의 쌍과 형식·호스트·경로 범위를 검사합니다.
export function validateIndexNowSettings(
  origin: string,
  keyValue: string,
  locationValue: string,
): IndexNowSettings | null {
  const key = keyValue.trim();
  const keyLocation = locationValue.trim();
  if (!key && !keyLocation) return null;
  if (!key || !keyLocation) throw new Error('IndexNow 키와 키 파일 URL을 함께 입력하세요.');
  if (!/^[a-fA-F0-9-]{8,128}$/.test(key))
    throw new Error('키는 8~128자의 16진수 문자(0~9, a~f)와 하이픈으로 입력하세요.');

  let location: URL;

  try {
    location = new URL(keyLocation);
  } catch {
    throw new Error('올바른 키 파일 URL을 입력하세요.');
  }

  if (
    !/^https?:\/\//.test(keyLocation) ||
    /[\s\\]/.test(keyLocation) ||
    location.username ||
    location.password ||
    keyLocation.includes('?') ||
    keyLocation.includes('#')
  ) {
    throw new Error('키 파일 URL은 인증정보·쿼리·프래그먼트 없는 HTTP(S) 주소여야 합니다.');
  }
  if (location.hostname !== new URL(origin).hostname)
    throw new Error('키 파일은 알림 대상 사이트와 같은 호스트에 있어야 합니다.');

  const path = safePath(keyLocation);
  if (path.endsWith('/')) throw new Error('키 파일의 전체 URL을 입력하세요.');

  const directory = path.slice(0, path.lastIndexOf('/') + 1);
  if (!safePath(origin).startsWith(directory))
    throw new Error(
      '키 파일의 디렉터리가 사이트 적용 범위를 포함해야 합니다. 도메인 루트에 설치하세요.',
    );

  return { key, keyLocation };
}

// 제출할 URL이 저장된 키 파일의 호스트와 디렉터리 범위에 속하는지 확인합니다.
export function validateIndexNowTarget(settings: IndexNowSettings, target: string): void {
  const location = new URL(settings.keyLocation);
  const path = safePath(settings.keyLocation);
  const directory = path.slice(0, path.lastIndexOf('/') + 1);
  if (new URL(target).hostname !== location.hostname || !safePath(target).startsWith(directory)) {
    throw new Error('글 URL이 저장된 IndexNow 키 파일의 적용 범위를 벗어났습니다.');
  }
}
