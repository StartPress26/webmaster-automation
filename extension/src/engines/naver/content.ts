import {
  NAVER_READ_MESSAGE,
  readNaverVisibleObservation,
  NAVER_AUTOMATION_MESSAGE,
  NaverAutomationError,
  inspectNaverUrl,
  naverPageState,
  selectNaverSite,
} from './observation';
import { openNaverBoard, openNaverCollection, requestNaverCollection, selectNaverCollectionSite } from './collection';

const documentToken = crypto.randomUUID();
let active: { readonly requestId: string; readonly abort: AbortController } | null = null;
let cancelledOperations: readonly string[] = [];
let collectionOperations: readonly string[] = [];

// 같은 확장의 관리 페이지인지 확인하며 잘못된 발신 URL은 거부합니다.
function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const managementUrl = new URL(chrome.runtime.getURL('index.html'));
    return (
      senderUrl.protocol === managementUrl.protocol &&
      senderUrl.host === managementUrl.host &&
      senderUrl.pathname === managementUrl.pathname
    );
  } catch {
    return false;
  }
}

// 같은 확장의 명시적 검사·사이트 선택·수집 요청을 구분해 처리합니다.
function handleObservation(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean {
  if (!trustedSender(sender)) return false;
  if (!message || typeof message !== 'object') return false;

  const request = message as Record<string, unknown>;
  if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(request.requestId))
    return false;

  if (request.type === NAVER_READ_MESSAGE) {
    sendResponse({
      requestId: request.requestId,
      result: readNaverVisibleObservation(document, location.href),
    });
    return false;
  }

  if (request.type !== NAVER_AUTOMATION_MESSAGE) return false;

  try {
    if (request.action === 'state') {
      sendResponse({
        requestId: request.requestId,
        ok: true,
        value: naverPageState(document, location.href, documentToken),
      });
      return false;
    }

    if (request.action === 'cancel') {
      if (
        typeof request.operationId === 'string' &&
        /^[a-zA-Z0-9-]{1,80}$/.test(request.operationId)
      )
        cancelledOperations = [...cancelledOperations.slice(-63), request.operationId];
      if (request.operationId === active?.requestId) active?.abort.abort();
      sendResponse({ requestId: request.requestId, ok: true });
      return false;
    }

    if (request.documentToken !== documentToken) throw new NaverAutomationError('page_changed');
    if (cancelledOperations.includes(request.requestId))
      throw new NaverAutomationError('cancelled');
    if (active) throw new NaverAutomationError('busy');
    if (request.action === 'open_board') {
      openNaverBoard(document, location.href);
      sendResponse({ requestId: request.requestId, ok: true });
      return false;
    }
    if (typeof request.siteUrl !== 'string') throw new NaverAutomationError('invalid_response');

    if (request.action === 'select_site') {
      selectNaverSite(document, location.href, request.siteUrl);
      sendResponse({ requestId: request.requestId, ok: true });
      return false;
    }

    if (
      !['inspect_url', 'request_collection', 'open_collection', 'select_collection_site'].includes(String(request.action)) ||
      (!['open_collection', 'select_collection_site'].includes(String(request.action)) && typeof request.targetUrl !== 'string')
    )
      return false;

    if (request.action === 'request_collection') {
      if (collectionOperations.includes(request.requestId))
        throw new NaverAutomationError('receipt_unconfirmed');
      if (collectionOperations.length >= 64) throw new NaverAutomationError('busy');
      collectionOperations = [...collectionOperations, request.requestId];
    }

    const operation = { requestId: request.requestId, abort: new AbortController() };

    active = operation;
    const targetUrl = typeof request.targetUrl === 'string' ? request.targetUrl : '';
    const execution = request.action === 'select_collection_site'
      ? selectNaverCollectionSite(document, request.siteUrl, operation.abort.signal)
      : request.action === 'open_collection'
        ? openNaverCollection(document, request.siteUrl, operation.abort.signal)
      : request.action === 'request_collection'
        ? requestNaverCollection(document, request.siteUrl, targetUrl, operation.abort.signal)
        : inspectNaverUrl(document, request.siteUrl, targetUrl, operation.abort.signal);
    void execution
      .then((value): void => {
        sendResponse({ requestId: request.requestId, ok: true, value });
      })
      .catch((error: unknown): void => {
        sendResponse({
          requestId: request.requestId,
          ok: false,
          code: error instanceof NaverAutomationError ? error.code : 'invalid_response',
        });
      })
      .finally((): void => {
        if (active === operation) active = null;
      });

    return true;
  } catch (error: unknown) {
    sendResponse({
      requestId: request.requestId,
      ok: false,
      code: error instanceof NaverAutomationError ? error.code : 'invalid_response',
    });
  }

  return false;
}

chrome.runtime.onMessage.addListener(handleObservation);
