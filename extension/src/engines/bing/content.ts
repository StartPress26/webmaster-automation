import {
  BING_AUTOMATION_MESSAGE,
  BingAutomationError,
  inspectBingUrl,
  bingPageState,
  selectBingSite,
} from './observation';
import { isValidRequestId, trustedSender } from '../shared/content-guard';

// Bing 웹마스터 도구 페이지 안에서 실행되는 콘텐츠 스크립트입니다.
// 확장 관리 화면이 보낸 메시지를 받아 화면 상태를 알려주거나 자동화 한 단계를 실행합니다.

// ─────────────────────────────────────────────────────────────
// 상수·상태
// ─────────────────────────────────────────────────────────────

// 기억해 두는 취소된 작업 ID 최대 개수 (오래된 것부터 버림)
const MAX_REMEMBERED_CANCELLATIONS = 64;

type Request = Record<string, unknown>;
type SendResponse = (response: unknown) => void;

interface ActiveOperation {
  readonly requestId: string;
  readonly abort: AbortController;
}

// 이 문서(페이지 로드)를 식별하는 토큰. 관리 화면이 보낸 토큰과 다르면 페이지가 바뀐 것입니다.
const documentToken = crypto.randomUUID();
// 지금 실행 중인 자동화 (한 번에 하나만)
let active: ActiveOperation | null = null;
// 취소 요청을 받은 작업 ID들
let cancelledOperations: readonly string[] = [];

// ─────────────────────────────────────────────────────────────
// 응답 도우미
// ─────────────────────────────────────────────────────────────

// 예외를 응답 코드로 바꿉니다. 자동화 예외가 아니면 invalid_response입니다.
function errorCodeOf(error: unknown): string {
  return error instanceof BingAutomationError ? error.code : 'invalid_response';
}

// 실패 응답을 보냅니다.
function respondError(sendResponse: SendResponse, requestId: string, error: unknown): void {
  sendResponse({ requestId, ok: false, code: errorCodeOf(error) });
}

// ─────────────────────────────────────────────────────────────
// 동작 처리
// ─────────────────────────────────────────────────────────────

// 취소 요청: 작업 ID를 기억하고, 지금 실행 중인 작업이면 중단 신호를 보냅니다.
function handleCancel(request: Request, requestId: string, sendResponse: SendResponse): void {
  if (isValidRequestId(request.operationId)) {
    cancelledOperations = [...cancelledOperations.slice(-(MAX_REMEMBERED_CANCELLATIONS - 1)), request.operationId];
  }
  if (request.operationId === active?.requestId) active?.abort.abort();
  sendResponse({ requestId, ok: true });
}

// 동작 이름에 맞는 자동화를 시작합니다.
function startOperation(request: Request, siteUrl: string, signal: AbortSignal): Promise<unknown> {
  if (request.action === 'select_site') return selectBingSite(document, siteUrl, signal);
  return inspectBingUrl(document, siteUrl, request.targetUrl as string, signal);
}

// 비동기 자동화 동작을 실행하고 끝나면 응답을 보냅니다. 응답을 나중에 보내므로 true를 돌려줍니다.
function runOperation(request: Request, requestId: string, siteUrl: string, sendResponse: SendResponse): boolean {
  const operation: ActiveOperation = { requestId, abort: new AbortController() };
  active = operation;

  void startOperation(request, siteUrl, operation.abort.signal)
    .then((value): void => {
      sendResponse({ requestId, ok: true, value });
    })
    .catch((error: unknown): void => {
      respondError(sendResponse, requestId, error);
    })
    .finally((): void => {
      if (active === operation) active = null;
    });

  return true;
}

// 자동화 메시지 하나를 처리합니다. 즉시 응답했으면 false, 나중에 응답하면 true를 돌려줍니다.
function handleAutomation(request: Request, requestId: string, sendResponse: SendResponse): boolean {
  // 상태 조회와 취소는 문서 토큰 검사 없이 항상 응답합니다.
  if (request.action === 'state') {
    sendResponse({ requestId, ok: true, value: bingPageState(document, location.href, documentToken) });
    return false;
  }
  if (request.action === 'cancel') {
    handleCancel(request, requestId, sendResponse);
    return false;
  }

  // 나머지 동작은 같은 문서이고, 취소되지 않았고, 다른 작업이 없을 때만 실행합니다.
  if (request.documentToken !== documentToken) throw new BingAutomationError('page_changed');
  if (cancelledOperations.includes(requestId)) throw new BingAutomationError('cancelled');
  if (active) throw new BingAutomationError('busy');
  if (typeof request.siteUrl !== 'string') throw new BingAutomationError('invalid_response');

  // 사이트 선택, 또는 대상 URL이 있는 URL 검사만 실행합니다. 그 밖에는 응답하지 않습니다.
  const isSelectSite = request.action === 'select_site';
  const isInspectUrl = request.action === 'inspect_url' && typeof request.targetUrl === 'string';
  if (!isSelectSite && !isInspectUrl) return false;

  return runOperation(request, requestId, request.siteUrl, sendResponse);
}

// 같은 확장의 명시적 검사·사이트 선택 명령만 처리하며 수집 요청은 제공하지 않습니다.
function handleObservation(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: SendResponse,
): boolean {
  if (!trustedSender(sender)) return false;
  if (!message || typeof message !== 'object') return false;

  const request = message as Request;
  const requestId = request.requestId;
  if (!isValidRequestId(requestId)) return false;
  if (request.type !== BING_AUTOMATION_MESSAGE) return false;

  try {
    return handleAutomation(request, requestId, sendResponse);
  } catch (error: unknown) {
    respondError(sendResponse, requestId, error);
  }

  return false;
}

// 관리 화면에서 오는 메시지에 위 처리기를 연결합니다.
chrome.runtime.onMessage.addListener(handleObservation);
