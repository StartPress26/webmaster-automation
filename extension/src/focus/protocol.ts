// 관리 화면과 서비스 워커가 포커스 세션을 위해 사용하는 고정 이름입니다.
export const NAVER_FOCUS_PORT = 'startpress-naver-focus-v1';
export const FOCUS_COMMAND = 'Emulation.setFocusEmulationEnabled';

// Chrome 원본 오류 대신 이 목록에 있는 코드만 관리 화면으로 전달합니다.
export const FOCUS_CODES = [
  'invalid_request',
  'invalid_tab',
  'busy',
  'attach_failed',
  'emulation_failed',
  'cancelled',
  'session_lost',
  'tab_closed',
  'scope_changed',
  'auth_required',
  'cleanup_unconfirmed',
  'connection_lost',
  'timeout',
] as const;

export type FocusErrorCode = typeof FOCUS_CODES[number];

// 관리 화면은 세션 획득과 해제만 요청할 수 있습니다.
export type FocusRequest =
  | {
      readonly type: 'acquire';
      readonly requestId: string;
      readonly tabId: number;
    }
  | {
      readonly type: 'release';
      readonly requestId: string;
    };

// 요청의 완료 응답과 예상하지 못한 세션 상실 알림을 구분합니다.
export type FocusReply =
  | {
      readonly type: 'ready' | 'released';
      readonly requestId: string;
    }
  | {
      readonly type: 'error';
      readonly requestId: string;
      readonly code: FocusErrorCode;
    }
  | {
      readonly type: 'lost';
      readonly code: FocusErrorCode;
    };

export class NaverFocusError extends Error {
  readonly code: FocusErrorCode;

  // 원본 API 오류와 주소 대신 고정된 원인 코드만 보관합니다.
  constructor(code: FocusErrorCode) {
    super(`네이버 화면 준비 연결 오류: ${code}`);
    this.name = 'NaverFocusError';
    this.code = code;
  }
}

// 알 수 없는 메시지의 오류 코드가 허용 목록에 있는지 확인합니다.
export function isFocusCode(value: unknown): value is FocusErrorCode {
  if (typeof value !== 'string') {
    return false;
  }

  return (FOCUS_CODES as readonly string[]).includes(value);
}

// 포트 요청 ID는 제한된 길이의 공개 식별자만 허용합니다.
export function isRequestId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  return /^[a-zA-Z0-9-]{1,80}$/.test(value);
}
