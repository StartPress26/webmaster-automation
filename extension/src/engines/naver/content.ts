import {
  NAVER_READ_MESSAGE,
  readNaverVisibleObservation,
  NAVER_AUTOMATION_MESSAGE,
  NaverAutomationError,
  inspectNaverUrl,
  naverPageState,
} from './observation';
import { openNaverBoard, openNaverCollection, requestNaverCollection, selectNaverCollectionSite } from './collection';
import { isValidRequestId, trustedSender } from '../shared/content-guard';

// 네이버 서치어드바이저 페이지 안에서 실행되는 콘텐츠 스크립트입니다.
// 확장 관리 화면이 보낸 메시지를 받아 화면을 읽거나 자동화 한 단계를 실행합니다.

// ─────────────────────────────────────────────────────────────
// 상수·상태
// ─────────────────────────────────────────────────────────────

// 기억해 두는 취소된 작업 ID 최대 개수 (오래된 것부터 버림)
const MAX_REMEMBERED_CANCELLATIONS = 64;
// 이 문서에서 받아들이는 수집 요청 최대 개수. 넘으면 새로고침이 필요합니다.
const MAX_COLLECTION_OPERATIONS = 64;

// 비동기로 실행되는 자동화 동작
const OPERATION_ACTIONS: readonly string[] = [
  'inspect_url',
  'request_collection',
  'open_collection',
  'select_collection_site',
  'select_site',
];
// 그중 대상 URL(targetUrl)이 필요 없는 동작
const SITE_ONLY_ACTIONS: readonly string[] = ['open_collection', 'select_collection_site', 'select_site'];

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
// 이미 수집 요청을 받은 작업 ID들 (같은 ID로 두 번 요청하지 않도록)
let collectionOperations: readonly string[] = [];

// ─────────────────────────────────────────────────────────────
// 응답 도우미
// ─────────────────────────────────────────────────────────────

// 예외를 응답 코드로 바꿉니다. 자동화 예외가 아니면 invalid_response입니다.
function errorCodeOf(error: unknown): string {
  return error instanceof NaverAutomationError ? error.code : 'invalid_response';
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
function startOperation(action: unknown, siteUrl: string, targetUrl: string, signal: AbortSignal): Promise<unknown> {
  // 색인 조회(select_site)와 수집 요청(select_collection_site) 모두 사이트 링크가 나타날 때까지 기다립니다.
  if (action === 'select_site' || action === 'select_collection_site') {
    return selectNaverCollectionSite(document, siteUrl, signal);
  }
  if (action === 'open_collection') return openNaverCollection(document, siteUrl, signal);
  if (action === 'request_collection') return requestNaverCollection(document, siteUrl, targetUrl, signal);
  return inspectNaverUrl(document, siteUrl, targetUrl, signal);
}

// 비동기 자동화 동작을 실행하고 끝나면 응답을 보냅니다. 응답을 나중에 보내므로 true를 돌려줍니다.
function runOperation(request: Request, requestId: string, siteUrl: string, sendResponse: SendResponse): boolean {
  if (request.action === 'request_collection') {
    if (collectionOperations.includes(requestId)) throw new NaverAutomationError('receipt_unconfirmed');
    if (collectionOperations.length >= MAX_COLLECTION_OPERATIONS) throw new NaverAutomationError('busy');
    collectionOperations = [...collectionOperations, requestId];
  }

  const operation: ActiveOperation = { requestId, abort: new AbortController() };
  active = operation;

  const targetUrl = typeof request.targetUrl === 'string' ? request.targetUrl : '';
  void startOperation(request.action, siteUrl, targetUrl, operation.abort.signal)
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
    sendResponse({ requestId, ok: true, value: naverPageState(document, location.href, documentToken) });
    return false;
  }
  if (request.action === 'cancel') {
    handleCancel(request, requestId, sendResponse);
    return false;
  }

  // 나머지 동작은 같은 문서이고, 취소되지 않았고, 다른 작업이 없을 때만 실행합니다.
  if (request.documentToken !== documentToken) throw new NaverAutomationError('page_changed');
  if (cancelledOperations.includes(requestId)) throw new NaverAutomationError('cancelled');
  if (active) throw new NaverAutomationError('busy');

  if (request.action === 'open_board') {
    openNaverBoard(document, location.href);
    sendResponse({ requestId, ok: true });
    return false;
  }

  if (typeof request.siteUrl !== 'string') throw new NaverAutomationError('invalid_response');

  // 알 수 없는 동작이거나, 대상 URL이 필요한데 없으면 응답하지 않습니다.
  const action = String(request.action);
  if (!OPERATION_ACTIONS.includes(action)) return false;
  if (!SITE_ONLY_ACTIONS.includes(action) && typeof request.targetUrl !== 'string') return false;

  return runOperation(request, requestId, request.siteUrl, sendResponse);
}

// 같은 확장의 명시적 검사·사이트 선택·수집 요청을 구분해 처리합니다.
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

  // 화면 읽기(미리보기)는 동기로 바로 응답합니다.
  if (request.type === NAVER_READ_MESSAGE) {
    sendResponse({ requestId, result: readNaverVisibleObservation(document, location.href) });
    return false;
  }

  if (request.type !== NAVER_AUTOMATION_MESSAGE) return false;

  try {
    return handleAutomation(request, requestId, sendResponse);
  } catch (error: unknown) {
    respondError(sendResponse, requestId, error);
  }

  return false;
}

// 관리 화면에서 오는 메시지에 위 처리기를 연결합니다.
chrome.runtime.onMessage.addListener(handleObservation);
