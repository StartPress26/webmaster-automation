export type Operation = 'read' | 'save' | 'submit' | 'inspect';
export type ErrorKind = 'validation' | 'authentication' | 'permission' | 'not_found' | 'conflict' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'response' | 'unknown';
export interface FieldIssue { readonly field: string; readonly message: string }
interface ErrorOptions {
  readonly code?: string;
  readonly kind?: ErrorKind;
  readonly operation?: Operation;
  readonly fields?: readonly FieldIssue[];
  readonly retryAfterSeconds?: number | null;
}

// HTTP 상태와 안정적인 오류 코드로 다음 행동에 필요한 종류를 판별합니다.
function kindOf(status: number, code: string): ErrorKind {
  if (code.startsWith('GOOGLE_AUTH_') || code === 'ENGINE_AUTHENTICATION' || status === 401) return 'authentication';
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

// 배열·객체·문자열 오류에서 공개 메시지만 읽습니다.
export function errorDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail.slice(0, 600);
  if (Array.isArray(detail)) return detail.slice(0, 20).map(errorDetail).join(' / ');
  if (detail && typeof detail === 'object') {
    const item = detail as Record<string, unknown>;
    if (typeof item.message === 'string') return item.message.slice(0, 600);
    if (typeof item.msg === 'string') return item.msg.slice(0, 600);
  }
  return '요청을 처리하지 못했습니다.';
}

// 입력 원문과 예외 문맥 없이 서버의 코드·필드 위치를 정규화합니다.
export function httpError(status: number, detail: unknown, operation: Operation, retryAfter: string | null = null): ApiError {
  const item = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
  const code = typeof item.code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(item.code) ? item.code : `HTTP_${status}`;
  const fields: readonly FieldIssue[] = Array.isArray(detail) ? detail.slice(0, 20).flatMap((value: unknown): readonly FieldIssue[] => {
    if (!value || typeof value !== 'object') return [];
    const issue = value as Record<string, unknown>;
    const location = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown): boolean => typeof part === 'string') : [];
    const field = location.at(-1);
    return typeof field === 'string' && /^[a-z_]{1,60}$/.test(field) && typeof issue.msg === 'string' ? [{ field, message: issue.msg.slice(0, 400) }] : [];
  }) : [];
  const seconds = retryAfter && /^\d{1,7}$/.test(retryAfter) ? Number(retryAfter) : null;
  return new ApiError(status, errorDetail(detail), { code, operation, fields, retryAfterSeconds: seconds });
}

// 로컬 검증 오류와 네트워크 오류를 공통 화면 모델로 변환합니다.
export function asAppError(value: unknown, operation: Operation = 'read'): ApiError {
  if (value instanceof ApiError) return value;
  return new ApiError(422, value instanceof Error ? value.message : '입력값 또는 연결 상태를 확인하세요.', { code: 'LOCAL_VALIDATION', kind: 'validation', operation });
}

// 저장·전송 결과가 확정되지 않은 요청인지 보수적으로 판단합니다.
export function uncertainWrite(error: ApiError): boolean {
  return (error.operation === 'save' || error.operation === 'submit') && (error.status === 0 || error.status >= 500);
}

export interface ErrorPresentation {
  readonly title: string;
  readonly message: string;
  readonly advice: string;
  readonly authHelp: boolean;
  readonly tone: 'error' | 'warning';
}

// 확인된 사실과 실행 가능한 복구 안내를 분리해 표시합니다.
export function presentError(error: ApiError, title: string): ErrorPresentation {
  const advice: Readonly<Record<ErrorKind, string>> = {
    validation: '표시된 입력을 수정하세요. 작성한 내용은 유지됩니다.',
    authentication: '서버의 검색엔진 API 연결 설정을 확인하세요. Chrome의 로그인 상태와는 별개입니다.',
    permission: '연결된 계정에 이 사이트의 접근 권한이 있는지 확인하세요.',
    not_found: '사이트·글이 삭제됐거나 대상이 달라졌을 수 있습니다. 목록을 다시 읽어 주세요.',
    conflict: error.code === 'INDEXNOW_SETTINGS_INCONSISTENT' ? '사이트의 IndexNow 키와 파일 URL을 함께 저장해 두 엔진의 설정을 맞춰 주세요.' : '기존 목록과 처리 결과를 확인하세요. 같은 글을 다시 전송하지 않습니다.',
    rate_limit: error.retryAfterSeconds !== null ? `서버가 안내한 ${error.retryAfterSeconds}초 뒤 수동으로 다시 실행하세요. 자동 재시도하지 않습니다.` : '호출 한도 또는 제한 해제 여부를 확인한 뒤 수동으로 실행하세요. 자동 재시도하지 않습니다.',
    network: '서버 실행 상태와 네트워크 연결을 확인하세요. 저장된 결과는 다시 읽을 수 있습니다.',
    timeout: '응답 시간이 초과됐습니다. 기존 결과를 유지하며 자동으로 반복 요청하지 않습니다.',
    server: '서버 상태를 확인한 뒤 목록 또는 저장된 결과를 다시 읽어 주세요.',
    response: '응답 형식을 확인하지 못했습니다. 저장된 결과를 먼저 다시 읽어 주세요.',
    unknown: error.code === 'SAVED_INSPECTION_ERROR' ? '이전 오류 기록에는 세부 코드가 없습니다. 위 오류 문구와 서버 설정을 확인하세요. 새 조회는 색인 상태 조회 버튼으로 수동 실행할 수 있습니다.' : '기존 목록과 마지막 처리 결과를 확인해 주세요.',
  };
  return { title, message: error.message, advice: uncertainWrite(error) ? '이미 저장·전송됐을 수 있습니다. 먼저 저장 결과를 확인하세요. 자동 재전송하지 않습니다.' : advice[error.kind], authHelp: error.kind === 'authentication', tone: uncertainWrite(error) || error.kind === 'rate_limit' ? 'warning' : 'error' };
}
