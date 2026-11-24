import {
  canonicalNaverTarget,
  hasConsistentNaverJudgement,
  isNaverInspectionPage,
  NAVER_LAST_UPDATED_TEXT,
  NAVER_READ_MESSAGE,
} from './observation.ts';
import type { NaverVisibleObservation } from './observation';
import type { WorkTab } from '../../tabs/client';
import type { ClientInspectionTarget } from '../../inspection/client-plan';
import { isTabLoaded } from '../../tabs/readiness.ts';

// 이 파일은 관리 화면 쪽에서 실행됩니다. 네이버 탭의 콘텐츠 스크립트에 "지금 화면을 읽어 달라"고 요청합니다.

// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

// 미리보기 영역의 상태
export interface NaverPreviewState {
  readonly loading: boolean;
  readonly observation?: NaverVisibleObservation;
  readonly error?: string;
}

// chrome.tabs 중 읽기에 쓰는 기능. 테스트에서는 가짜 객체를 넘깁니다.
interface ReaderClient {
  readonly get: (tabId: number) => Promise<chrome.tabs.Tab>;
  readonly send: (tabId: number, message: unknown) => Promise<unknown>;
}

// 콘텐츠 스크립트 응답 대기 시간
const DEFAULT_READ_TIMEOUT_MS = 8000;
// 내부 타임아웃 표식
const READ_TIMEOUT_MARK = 'NAVER_READ_TIMEOUT';
// Chrome이 콘텐츠 스크립트와 연결되지 않았을 때 내는 오류 문구
const CONNECTION_LOST = /Receiving end does not exist|Could not establish connection/i;

// ─────────────────────────────────────────────────────────────
// 탭 통신
// ─────────────────────────────────────────────────────────────

// 탭 이동·닫힘과 메시지 수신 실패를 공개 가능한 안내로 변환합니다.
function readerClient(): ReaderClient {
  if (!globalThis.chrome?.tabs) {
    throw new Error('설치된 Chrome 확장에서만 네이버 화면을 읽을 수 있습니다.');
  }
  return {
    get: (id): Promise<chrome.tabs.Tab> => chrome.tabs.get(id),
    send: (id, message): Promise<unknown> => chrome.tabs.sendMessage(id, message, { frameId: 0 }),
  };
}

// 읽기 실패 원인을 사용자 안내 문구로 바꿉니다.
function readFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === READ_TIMEOUT_MARK) {
    return '네이버 읽기 스크립트의 응답 시간이 초과됐습니다. 탭 상태를 확인하고 다시 읽어주세요.';
  }
  if (CONNECTION_LOST.test(message)) {
    return '네이버 읽기 스크립트가 연결되지 않았습니다. chrome://extensions에서 StartPress를 새로고침한 뒤 네이버 탭도 새로고침하세요.';
  }
  return '네이버 읽기 연결이 종료됐습니다. 확장과 네이버 탭의 새로고침 상태를 확인해주세요.';
}

// 콘텐츠 스크립트에 읽기 요청을 보내고 제한 시간 안의 응답만 받습니다.
async function sendReadRequest(
  client: ReaderClient,
  tabId: number,
  requestId: string,
  timeoutMs: number,
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject): void => {
    timer = setTimeout((): void => reject(new Error(READ_TIMEOUT_MARK)), timeoutMs);
  });

  try {
    return await Promise.race([client.send(tabId, { type: NAVER_READ_MESSAGE, requestId }), timeout]);
  } catch (error: unknown) {
    throw new Error(readFailureMessage(error));
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────
// 응답 검증
// ─────────────────────────────────────────────────────────────

// 엔진 표시 업데이트 문구는 null이거나 "최종 업데이트 YYYY. M. D." 형식이어야 합니다.
function hasValidUpdatedText(value: Partial<NaverVisibleObservation>): boolean {
  if (value.engineUpdatedText === null) return true;
  return typeof value.engineUpdatedText === 'string' && NAVER_LAST_UPDATED_TEXT.test(value.engineUpdatedText);
}

// 콘텐츠 스크립트가 돌려준 관측이 올바른 형식인지 확인합니다.
function isValidObservation(value: Partial<NaverVisibleObservation> | undefined): value is NaverVisibleObservation {
  if (!value) return false;
  if (value.kind !== 'visible_preview') return false;
  if (value.targetVerified !== false) return false;
  if (!hasConsistentNaverJudgement(value.message, value.indexStatus)) return false;
  if (typeof value.siteUrl !== 'string') return false;
  if (typeof value.inputUrl !== 'string') return false;
  if (typeof value.readAt !== 'string') return false;
  if (!Number.isFinite(Date.parse(value.readAt))) return false;
  return hasValidUpdatedText(value);
}

// 화면의 사이트가 탭 주소의 사이트와 같고, 입력 URL이 이번 고객사의 조회 대상 중 하나인지 확인합니다.
function matchesTargets(
  value: NaverVisibleObservation,
  pageUrl: string,
  targets: readonly ClientInspectionTarget[],
): boolean {
  const pageSite = canonicalNaverTarget(new URL(pageUrl).searchParams.get('site') ?? '');
  if (pageSite !== value.siteUrl) return false;
  return targets.some(
    (target): boolean =>
      canonicalNaverTarget(target.siteUrl) === value.siteUrl &&
      canonicalNaverTarget(target.url) === value.inputUrl,
  );
}

// ─────────────────────────────────────────────────────────────
// 읽기
// ─────────────────────────────────────────────────────────────

// 선택한 탭의 현재 검사 화면을 읽고 현재 고객사의 등록 대상과 응답 형식을 다시 검증합니다.
export async function readNaverPreview(
  selected: WorkTab,
  targets: readonly ClientInspectionTarget[],
  client: ReaderClient = readerClient(),
  timeoutMs = DEFAULT_READ_TIMEOUT_MS,
): Promise<NaverVisibleObservation> {
  if (selected.engine !== 'naver') throw new Error('네이버 작업 탭을 먼저 선택하세요.');

  // 1. 읽기 전 탭이 색인 상태 확인 화면에 있고 로딩을 마쳤는지 확인합니다.
  const before = await client.get(selected.tabId).catch((): null => null);
  if (!before?.url || before.id !== selected.tabId || !isNaverInspectionPage(before.url)) {
    throw new Error('선택한 네이버 탭에서 검증 → 색인 상태 확인 화면을 열어주세요.');
  }
  if (before.incognito || !isTabLoaded(before)) {
    throw new Error('네이버 탭의 로딩을 마친 뒤 다시 읽어주세요.');
  }

  // 2. 콘텐츠 스크립트에 읽기를 요청합니다.
  const requestId = crypto.randomUUID();
  const response = await sendReadRequest(client, selected.tabId, requestId, timeoutMs);

  // 3. 읽는 동안 탭이 바뀌지 않았는지 확인합니다.
  const after = await client.get(selected.tabId).catch((): null => null);
  if (!after || after.id !== selected.tabId || after.url !== before.url || !isTabLoaded(after)) {
    throw new Error('화면을 읽는 동안 탭이 이동하거나 닫혔습니다. 다시 확인하세요.');
  }

  // 4. 응답 봉투와 결과를 검증합니다.
  if (!response || typeof response !== 'object') {
    throw new Error('네이버 화면 읽기 응답을 확인하지 못했습니다.');
  }
  const envelope = response as Record<string, unknown>;
  if (envelope.requestId !== requestId || !envelope.result || typeof envelope.result !== 'object') {
    throw new Error('요청한 작업과 화면 읽기 응답이 다릅니다.');
  }
  const result = envelope.result as Record<string, unknown>;
  if (result.ok !== true) {
    throw new Error('표시된 색인 결과를 확인하지 못했습니다. 색인 상태 확인 화면에서 URL을 조회한 뒤 다시 읽어주세요.');
  }

  const value = result.observation as Partial<NaverVisibleObservation> | undefined;
  if (!isValidObservation(value)) {
    throw new Error('네이버 화면 읽기 응답 형식이 올바르지 않습니다.');
  }
  if (!matchesTargets(value, before.url, targets)) {
    throw new Error('표시된 사이트·URL이 이번 고객사의 등록된 조회 대상과 일치하지 않습니다.');
  }

  return value;
}
