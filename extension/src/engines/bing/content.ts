import {
  BING_AUTOMATION_MESSAGE,
  BingAutomationError,
  inspectBingUrl,
  bingPageState,
  selectBingSite,
} from './observation';

const documentToken = crypto.randomUUID();
let active: { readonly requestId: string; readonly abort: AbortController } | null = null;
let cancelledOperations: readonly string[] = [];

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

// 같은 확장의 명시적 검사·사이트 선택 명령만 처리하며 수집 요청은 제공하지 않습니다.
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
  if (request.type !== BING_AUTOMATION_MESSAGE) return false;

  try {
    if (request.action === 'state') {
      sendResponse({
        requestId: request.requestId,
        ok: true,
        value: bingPageState(document, location.href, documentToken),
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

    if (request.documentToken !== documentToken) throw new BingAutomationError('page_changed');
    if (cancelledOperations.includes(request.requestId)) throw new BingAutomationError('cancelled');
    if (active) throw new BingAutomationError('busy');
    if (typeof request.siteUrl !== 'string') throw new BingAutomationError('invalid_response');
    if (
      request.action !== 'select_site' &&
      (request.action !== 'inspect_url' || typeof request.targetUrl !== 'string')
    )
      return false;

    const operation = { requestId: request.requestId, abort: new AbortController() };

    active = operation;

    const work =
      request.action === 'select_site'
        ? selectBingSite(document, request.siteUrl, operation.abort.signal)
        : inspectBingUrl(
            document,
            request.siteUrl,
            request.targetUrl as string,
            operation.abort.signal,
          );

    void work
      .then((value): void => {
        sendResponse({ requestId: request.requestId, ok: true, value });
      })
      .catch((error: unknown): void => {
        sendResponse({
          requestId: request.requestId,
          ok: false,
          code: error instanceof BingAutomationError ? error.code : 'invalid_response',
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
      code: error instanceof BingAutomationError ? error.code : 'invalid_response',
    });
  }

  return false;
}

chrome.runtime.onMessage.addListener(handleObservation);
