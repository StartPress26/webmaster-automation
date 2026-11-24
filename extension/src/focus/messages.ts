import type { FocusErrorCode, NaverFocusError } from './protocol.ts';

// 브라우저의 원본 오류 대신 원인별로 사용자가 확인할 수 있는 안내를 제공합니다.
const FOCUS_ERROR_MESSAGES: Readonly<Record<FocusErrorCode, string>> = {
  invalid_request: '네이버 작업 연결 정보를 확인하지 못했습니다. 관리 화면을 새로고침한 뒤 다시 실행하세요.',
  invalid_tab: '네이버 작업 탭의 주소와 로딩 상태를 확인해 주세요. 아직 GUI 요청을 시작하지 않았습니다.',
  busy: '다른 네이버 작업이 연결을 사용 중입니다. 작업이 끝난 뒤 다시 실행하세요.',
  attach_failed: '네이버 작업 연결을 시작하지 못했습니다. 해당 탭의 개발자 도구를 닫고 확장 권한을 확인해 주세요.',
  emulation_failed: '네이버 화면의 백그라운드 실행 준비에 실패했습니다. 해당 탭과 확장을 새로고침한 뒤 확인해 주세요.',
  cancelled: '네이버 작업 연결을 취소했습니다. 이미 접수된 요청은 유지됩니다.',
  session_lost: '네이버 작업 연결이 종료됐습니다. 요청 내역을 확인해 주세요. 자동 재요청하지 않습니다.',
  tab_closed: '네이버 작업 탭이 닫혔습니다. 이미 보낸 요청은 네이버 요청 내역에서 확인해 주세요.',
  scope_changed: '네이버 작업 탭의 주소가 변경되어 중단했습니다. 요청 내역을 확인한 뒤 다시 준비해 주세요.',
  auth_required: '네이버 인증이 필요합니다. 작업 탭에서 직접 로그인한 뒤 다시 준비해 주세요.',
  cleanup_unconfirmed: '네이버 작업 연결 해제를 확인하지 못했습니다. 확장을 새로고침해 연결을 정리한 뒤 사용해 주세요.',
  connection_lost: '확장의 네이버 작업 연결이 끊겼습니다. 요청 내역과 확장 상태를 확인해 주세요.',
  timeout: '네이버 작업 연결 준비를 제한 시간 안에 확인하지 못했습니다. 탭과 확장 상태를 확인해 주세요.',
};

// 오류 코드의 내부 표기 없이 화면에 표시할 고정 안내를 반환합니다.
export function naverFocusErrorMessage(error: NaverFocusError): string {
  return FOCUS_ERROR_MESSAGES[error.code];
}
