import { canonicalNaverTarget, isNaverInspectionPage, NAVER_INDEXED_MESSAGE, NAVER_NO_RESULT_MESSAGE, NAVER_READ_MESSAGE } from './observation.ts';
import type { NaverVisibleObservation } from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';

export interface NaverPreviewState {
  readonly loading: boolean;
  readonly observation?: NaverVisibleObservation;
  readonly error?: string;
}

interface ReaderClient {
  readonly get: (tabId: number) => Promise<chrome.tabs.Tab>;
  readonly send: (tabId: number, message: unknown) => Promise<unknown>;
}

// 탭 이동·닫힘과 메시지 수신 실패를 공개 가능한 안내로 변환합니다.
function readerClient(): ReaderClient {
  if (!globalThis.chrome?.tabs) throw new Error('설치된 Chrome 확장에서만 네이버 화면을 읽을 수 있습니다.');
  return { get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id), send: (id, message): Promise<unknown> => chrome.tabs.sendMessage(id, message, { frameId: 0 }) };
}

// 선택한 탭의 현재 검사 화면을 읽고 현재 고객사의 등록 대상과 응답 형식을 다시 검증합니다.
export async function readNaverPreview(
  selected: WorkTab, targets: readonly ClientInspectionTarget[], client: ReaderClient = readerClient(), timeoutMs = 8000,
): Promise<NaverVisibleObservation> {
  if (selected.engine !== 'naver') throw new Error('네이버 작업 탭을 먼저 선택하세요.');
  const before = await client.get(selected.tabId).catch((): null => null);
  if (!before?.url || before.id !== selected.tabId || !isNaverInspectionPage(before.url)) throw new Error('선택한 네이버 탭에서 검증 → 색인 상태 확인 화면을 열어주세요.');
  if (before.incognito || before.status !== 'complete' || before.discarded || before.pendingUrl) throw new Error('네이버 탭의 로딩을 마친 뒤 다시 읽어주세요.');
  const requestId = crypto.randomUUID();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let response: unknown;
  try {
    response = await Promise.race([
      client.send(selected.tabId, { type: NAVER_READ_MESSAGE, requestId }),
      new Promise<never>((_, reject): void => { timer = setTimeout((): void => reject(new Error('NAVER_READ_TIMEOUT')), timeoutMs); }),
    ]);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'NAVER_READ_TIMEOUT') throw new Error('네이버 읽기 스크립트의 응답 시간이 초과됐습니다. 탭 상태를 확인하고 다시 읽어주세요.');
    if (/Receiving end does not exist|Could not establish connection/i.test(message)) throw new Error('네이버 읽기 스크립트가 연결되지 않았습니다. chrome://extensions에서 StartPress를 새로고침한 뒤 네이버 탭도 새로고침하세요.');
    throw new Error('네이버 읽기 연결이 종료됐습니다. 확장과 네이버 탭의 새로고침 상태를 확인해주세요.');
  } finally { clearTimeout(timer); }
  const after = await client.get(selected.tabId).catch((): null => null);
  if (!after || after.id !== selected.tabId || after.url !== before.url || after.status !== 'complete' || after.pendingUrl || after.discarded) throw new Error('화면을 읽는 동안 탭이 이동하거나 닫혔습니다. 다시 확인하세요.');
  if (!response || typeof response !== 'object') throw new Error('네이버 화면 읽기 응답을 확인하지 못했습니다.');
  const envelope = response as Record<string, unknown>;
  if (envelope.requestId !== requestId || !envelope.result || typeof envelope.result !== 'object') throw new Error('요청한 작업과 화면 읽기 응답이 다릅니다.');
  const result = envelope.result as Record<string, unknown>;
  if (result.ok !== true) throw new Error('표시된 색인 결과를 확인하지 못했습니다. 색인 상태 확인 화면에서 URL을 조회한 뒤 다시 읽어주세요.');
  const value = result.observation as Partial<NaverVisibleObservation> | undefined;
  if (!value || value.kind !== 'visible_preview' || value.targetVerified !== false
    || !((value.indexStatus === 'indexed' && value.message === NAVER_INDEXED_MESSAGE) || (value.indexStatus === 'unknown' && value.message === NAVER_NO_RESULT_MESSAGE))
    || typeof value.siteUrl !== 'string' || typeof value.inputUrl !== 'string'
    || typeof value.readAt !== 'string' || !Number.isFinite(Date.parse(value.readAt))
    || (value.engineUpdatedText !== null && (typeof value.engineUpdatedText !== 'string' || !/^최종\s*업데이트\s*\d{2,4}\.\s*\d{1,2}\.\s*\d{1,2}\.?$/.test(value.engineUpdatedText)))) {
    throw new Error('네이버 화면 읽기 응답 형식이 올바르지 않습니다.');
  }
  if (canonicalNaverTarget(new URL(before.url).searchParams.get('site') ?? '') !== value.siteUrl
    || !targets.some((target): boolean => canonicalNaverTarget(target.siteUrl) === value.siteUrl && canonicalNaverTarget(target.url) === value.inputUrl)) {
    throw new Error('표시된 사이트·URL이 이번 고객사의 등록된 조회 대상과 일치하지 않습니다.');
  }
  return value as NaverVisibleObservation;
}
