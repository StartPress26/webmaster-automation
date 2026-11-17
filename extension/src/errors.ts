// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 오류가 난 작업의 종류. 화면 안내와 "이미 저장됐을 수 있음" 판단에 쓰입니다.
export type Operation = 'read' | 'save' | 'submit' | 'inspect';

// 다음 행동을 정하기 위한 오류 분류
export type ErrorKind =
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'network'
  | 'timeout'
  | 'server'
  | 'response'
  | 'unknown';

// 서버가 알려준 폼 필드 단위 오류
export interface FieldIssue {
  readonly field: string;
  readonly message: string;
}

// ApiError를 만들 때 넘기는 선택 정보
interface ErrorOptions {
  readonly code?: string;
  readonly kind?: ErrorKind;
  readonly operation?: Operation;
  readonly fields?: readonly FieldIssue[];
  readonly retryAfterSeconds?: number | null;
}

// 화면의 오류 패널에 표시할 내용
export interface ErrorPresentation {
  readonly title: string;
  readonly message: string;
  readonly advice: string;
  readonly authHelp: boolean;
  readonly tone: 'error' | 'warning';
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 서버 메시지와 필드 오류를 화면에 보여줄 때의 최대 길이·개수
const MAX_DETAIL_LENGTH = 600;
const MAX_DETAIL_ITEMS = 20;
const MAX_FIELD_MESSAGE_LENGTH = 400;

// 서버 오류 코드 형식: 대문자로 시작하는 대문자·숫자·밑줄 1~80자
const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,79}$/;
// 폼 필드 이름 형식: 소문자·밑줄 1~60자
const FIELD_NAME_PATTERN = /^[a-z_]{1,60}$/;
// Retry-After 헤더로 허용하는 값: 숫자 1~7자리(초)
const RETRY_AFTER_PATTERN = /^\d{1,7}$/;

const DEFAULT_DETAIL_MESSAGE = '요청을 처리하지 못했습니다.';
const UNCERTAIN_WRITE_ADVICE =
  '이미 저장·전송됐을 수 있습니다. 먼저 저장 결과를 확인하세요. 자동 재전송하지 않습니다.';

// 오류 종류별 복구 안내. conflict·rate_limit·unknown은 오류 내용에 따라 달라져 함수로 따로 둡니다.
const ADVICE_BY_KIND: Readonly<Record<Exclude<ErrorKind, 'conflict' | 'rate_limit' | 'unknown'>, string>> = {
  validation: '표시된 입력을 수정하세요. 작성한 내용은 유지됩니다.',
  authentication:
    '서버의 검색엔진 API 연결 설정을 확인하세요. Chrome의 로그인 상태와는 별개입니다.',
  permission: '연결된 계정에 이 사이트의 접근 권한이 있는지 확인하세요.',
  not_found: '사이트·글이 삭제됐거나 대상이 달라졌을 수 있습니다. 목록을 다시 읽어 주세요.',
  network: 'SSH 터널 연결 상태와 서버 실행 상태, 네트워크 연결을 확인하세요. 연결을 복구한 뒤 저장된 결과를 다시 읽을 수 있습니다.',
  timeout: '응답 시간이 초과됐습니다. 기존 결과를 유지하며 자동으로 반복 요청하지 않습니다.',
  server: '서버 상태를 확인한 뒤 목록 또는 저장된 결과를 다시 읽어 주세요.',
  response: '응답 형식을 확인하지 못했습니다. 저장된 결과를 먼저 다시 읽어 주세요.',
};

// ─────────────────────────────────────────────────────────────
// 오류 종류 판별
// ─────────────────────────────────────────────────────────────

// HTTP 상태와 안정적인 오류 코드로 다음 행동에 필요한 종류를 판별합니다. 위에서부터 먼저 맞는 것이 우선입니다.
function kindOf(status: number, code: string): ErrorKind {
  if (code.startsWith('GOOGLE_AUTH_') || code === 'ENGINE_AUTHENTICATION' || status === 401) {
    return 'authentication';
  }
  if (code === 'ENGINE_PERMISSION' || status === 403) return 'permission';
  if (code.includes('TIMEOUT') || status === 504) return 'timeout';
  if (code === 'NETWORK_ERROR' || code === 'ENGINE_CONNECTION') return 'network';
  if (code === 'INVALID_RESPONSE' || code === 'ENGINE_RESPONSE') return 'response';
  if (status === 422) return 'validation';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';

  return 'unknown';
}

// ─────────────────────────────────────────────────────────────
// ApiError
// ─────────────────────────────────────────────────────────────

// 서버·네트워크·로컬 검증 오류를 한 형태로 다루는 예외
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly kind: ErrorKind;
  readonly operation: Operation;
  readonly fields: readonly FieldIssue[];
  readonly retryAfterSeconds: number | null;

  // 원본 요청·입력·서버 응답은 보관하지 않고 공개 가능한 오류 정보만 유지합니다.
  constructor(status: number, message: string, options: ErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code ?? `HTTP_${status}`;
    this.kind = options.kind ?? kindOf(status, this.code);
    this.operation = options.operation ?? 'read';
    this.fields = options.fields ?? [];
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }
}

// ─────────────────────────────────────────────────────────────
// 서버 오류 응답 해석
// ─────────────────────────────────────────────────────────────

// 배열·객체·문자열 오류에서 공개 메시지만 읽습니다.
export function errorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail.slice(0, MAX_DETAIL_LENGTH);
  if (Array.isArray(detail)) return detail.slice(0, MAX_DETAIL_ITEMS).map(errorDetail).join(' / ');

  if (detail && typeof detail === 'object') {
    const item = detail as Record<string, unknown>;
    if (typeof item.message === 'string') return item.message.slice(0, MAX_DETAIL_LENGTH);
    if (typeof item.msg === 'string') return item.msg.slice(0, MAX_DETAIL_LENGTH);
  }

  return DEFAULT_DETAIL_MESSAGE;
}

// detail이 (배열이 아닌) 객체일 때만 그 객체를, 아니면 빈 객체를 돌려줍니다.
function detailObject(detail: unknown): Record<string, unknown> {
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  return {};
}

// 서버가 준 code가 허용 형식이면 그대로, 아니면 HTTP 상태 기반 코드를 씁니다.
function errorCodeOf(item: Record<string, unknown>, status: number): string {
  if (typeof item.code === 'string' && ERROR_CODE_PATTERN.test(item.code)) {
    return item.code;
  }
  return `HTTP_${status}`;
}

// FastAPI 검증 오류 항목 하나({ loc, msg })를 필드 오류로 바꿉니다. 형식이 맞지 않으면 빈 배열입니다.
function toFieldIssue(value: unknown): readonly FieldIssue[] {
  if (!value || typeof value !== 'object') return [];

  const issue = value as Record<string, unknown>;
  const location = Array.isArray(issue.loc)
    ? issue.loc.filter((part: unknown): boolean => typeof part === 'string')
    : [];
  const field = location.at(-1);

  if (typeof field !== 'string') return [];
  if (!FIELD_NAME_PATTERN.test(field)) return [];
  if (typeof issue.msg !== 'string') return [];

  return [{ field, message: issue.msg.slice(0, MAX_FIELD_MESSAGE_LENGTH) }];
}

// detail이 배열(필드 검증 오류 목록)일 때만 필드 오류를 모읍니다.
function fieldIssuesOf(detail: unknown): readonly FieldIssue[] {
  if (!Array.isArray(detail)) return [];
  return detail.slice(0, MAX_DETAIL_ITEMS).flatMap(toFieldIssue);
}

// Retry-After 헤더 값이 초 단위 숫자일 때만 숫자로 바꿉니다.
function retryAfterSecondsOf(retryAfter: string | null): number | null {
  if (retryAfter && RETRY_AFTER_PATTERN.test(retryAfter)) {
    return Number(retryAfter);
  }
  return null;
}

// 입력 원문과 예외 문맥 없이 서버의 코드·필드 위치를 정규화합니다.
export function httpError(
  status: number,
  detail: unknown,
  operation: Operation,
  retryAfter: string | null = null,
): ApiError {
  const item = detailObject(detail);

  return new ApiError(status, errorDetail(detail), {
    code: errorCodeOf(item, status),
    operation,
    fields: fieldIssuesOf(detail),
    retryAfterSeconds: retryAfterSecondsOf(retryAfter),
  });
}

// 로컬 검증 오류와 네트워크 오류를 공통 화면 모델로 변환합니다.
export function asAppError(value: unknown, operation: Operation = 'read'): ApiError {
  if (value instanceof ApiError) return value;

  const message = value instanceof Error ? value.message : '입력값 또는 연결 상태를 확인하세요.';
  return new ApiError(422, message, { code: 'LOCAL_VALIDATION', kind: 'validation', operation });
}

// ─────────────────────────────────────────────────────────────
// 실패 성격 판정
// ─────────────────────────────────────────────────────────────

// 요청이 서버에 닿았는지조차 알 수 없는 실패인지 판단합니다.
// ApiError가 아니거나(네트워크·예상 밖 예외), 상태 0(전송 실패·타임아웃), 5xx 응답이면 불확실로 봅니다.
export function isUncertainFailure(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status === 0 || error.status >= 500;
}

// 저장·전송 결과가 확정되지 않은 요청인지 보수적으로 판단합니다.
export function uncertainWrite(error: ApiError): boolean {
  const isWrite = error.operation === 'save' || error.operation === 'submit';
  const isUncertain = error.status === 0 || error.status >= 500;
  return isWrite && isUncertain;
}

// ─────────────────────────────────────────────────────────────
// 화면 표시
// ─────────────────────────────────────────────────────────────

// 충돌(409) 오류의 안내. IndexNow 설정 불일치만 별도 문구를 씁니다.
function conflictAdvice(error: ApiError): string {
  if (error.code === 'INDEXNOW_SETTINGS_INCONSISTENT') {
    return '사이트의 IndexNow 키와 파일 URL을 함께 저장해 두 엔진의 설정을 맞춰 주세요.';
  }
  return '기존 목록과 처리 결과를 확인하세요. 같은 글을 다시 전송하지 않습니다.';
}

// 요청 과다(429) 오류의 안내. 서버가 대기 시간을 알려줬으면 그 값을 보여줍니다.
function rateLimitAdvice(error: ApiError): string {
  if (error.retryAfterSeconds !== null) {
    return `서버가 안내한 ${error.retryAfterSeconds}초 뒤 수동으로 다시 실행하세요. 자동 재시도하지 않습니다.`;
  }
  return '호출 한도 또는 제한 해제 여부를 확인한 뒤 수동으로 실행하세요. 자동 재시도하지 않습니다.';
}

// 분류되지 않은 오류의 안내. 저장된 과거 오류 기록만 별도 문구를 씁니다.
function unknownAdvice(error: ApiError): string {
  if (error.code === 'SAVED_INSPECTION_ERROR') {
    return '이전 오류 기록에는 세부 코드가 없습니다. 위 오류 문구와 서버 설정을 확인하세요. 새 조회는 색인 상태 조회 버튼으로 수동 실행할 수 있습니다.';
  }
  return '기존 목록과 마지막 처리 결과를 확인해 주세요.';
}

// 오류에 맞는 복구 안내를 고릅니다. 저장·전송 여부가 불확실하면 그 안내가 우선입니다.
function adviceFor(error: ApiError): string {
  if (uncertainWrite(error)) return UNCERTAIN_WRITE_ADVICE;
  if (error.kind === 'conflict') return conflictAdvice(error);
  if (error.kind === 'rate_limit') return rateLimitAdvice(error);
  if (error.kind === 'unknown') return unknownAdvice(error);
  return ADVICE_BY_KIND[error.kind];
}

// 오류 패널의 색조. 불확실한 쓰기와 요청 과다는 경고, 나머지는 오류입니다.
function toneFor(error: ApiError): ErrorPresentation['tone'] {
  if (uncertainWrite(error) || error.kind === 'rate_limit') return 'warning';
  return 'error';
}

// 확인된 사실과 실행 가능한 복구 안내를 분리해 표시합니다.
export function presentError(error: ApiError, title: string): ErrorPresentation {
  return {
    title,
    message: error.message,
    advice: adviceFor(error),
    authHelp: error.kind === 'authentication',
    tone: toneFor(error),
  };
}
