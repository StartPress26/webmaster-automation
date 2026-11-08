import { NAVER_READ_MESSAGE, readNaverVisibleObservation, NAVER_AUTOMATION_MESSAGE, NaverAutomationError, inspectNaverUrl, naverPageState, selectNaverSite } from './observation';

const documentToken = crypto.randomUUID();
let active: { readonly requestId: string; readonly abort: AbortController } | null = null;
let cancelledOperations: readonly string[] = [];

// 같은 확장의 관리 페이지인지 확인하며 잘못된 발신 URL은 거부합니다.
function trustedSender(sender: chrome.runtime.MessageSender): boolean {
  if (sender.id !== chrome.runtime.id || !sender.url) return false;

  try {
    const senderUrl = new URL(sender.url);
    const managementUrl = new URL(chrome.runtime.getURL('index.html'));
    return senderUrl.protocol === managementUrl.protocol && senderUrl.host === managementUrl.host && senderUrl.pathname === managementUrl.pathname;
  } catch { return false; }
}

// 같은 확장의 명시적 검사·사이트 선택 명령만 처리하며 수집 요청은 제공하지 않습니다.
function handleObservation(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response: unknown) => void): boolean {
  if (!trustedSender(sender)) return false;
  if (!message || typeof message !== 'object') return false;

  const request = message as Record<string, unknown>;
  if (typeof request.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(request.requestId)) return false;

  if (request.type === NAVER_READ_MESSAGE) {
    sendResponse({ requestId: request.requestId, result: readNaverVisibleObservation(document, location.href) });
    return false;
  }

  if (request.type !== NAVER_AUTOMATION_MESSAGE) return false;

  try {
    if (request.action === 'state') {
      sendResponse({ requestId: request.requestId, ok: true, value: naverPageState(document, location.href, documentToken) });
      return false;
    }

    if (request.action === 'cancel') {
      if (typeof request.operationId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(request.operationId)) cancelledOperations = [...cancelledOperations.slice(-63), request.operationId];
      if (request.operationId === active?.requestId) active?.abort.abort();
      sendResponse({ requestId: request.requestId, ok: true });
      return false;
    }

    if (request.documentToken !== documentToken) throw new NaverAutomationError('page_changed');
    if (cancelledOperations.includes(request.requestId)) throw new NaverAutomationError('cancelled');
    if (active) throw new NaverAutomationError('busy');
    if (typeof request.siteUrl !== 'string') throw new NaverAutomationError('invalid_response');

    if (request.action === 'select_site') {
      selectNaverSite(document, location.href, request.siteUrl);
      sendResponse({ requestId: request.requestId, ok: true });
      return false;
    }

    if (request.action !== 'inspect_url' || typeof request.targetUrl !== 'string') return false;

    const operation = { requestId: request.requestId, abort: new AbortController() };

    active = operation;
    void inspectNaverUrl(document, request.siteUrl, request.targetUrl, operation.abort.signal).then((value): void => {
      sendResponse({ requestId: request.requestId, ok: true, value });
    }).catch((error: unknown): void => {
      sendResponse({ requestId: request.requestId, ok: false, code: error instanceof NaverAutomationError ? error.code : 'invalid_response' });
    }).finally((): void => { if (active === operation) active = null; });

    return true;
  } catch (error: unknown) {
    sendResponse({ requestId: request.requestId, ok: false, code: error instanceof NaverAutomationError ? error.code : 'invalid_response' });
  }

  return false;
}

chrome.runtime.onMessage.addListener(handleObservation);
