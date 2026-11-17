import { runNaverCollectionAutomation } from '../engines/naver/collection-automation.ts';
import { NaverAutomationError } from '../engines/naver/observation.ts';
import { withNaverFocus } from './client.ts';
import { NaverFocusError } from './protocol.ts';

// 사용자가 취소하지 않았는데 '취소'로 끝났다면, 연결이 끊긴 실제 이유를 돌려줍니다.
function actualFailure(
  error: unknown,
  userSignal: AbortSignal,
  focusSignal: AbortSignal,
): unknown {
  // 네이버 자동화 오류 종류 중 '취소'라고 보고한 경우만 다시 판단합니다.
  const reportedAsCancelled = error instanceof NaverAutomationError && error.code === 'cancelled';
  if (!reportedAsCancelled) {
    return error;
  }

  // 사용자가 정말 취소했다면 '취소'가 맞습니다.
  if (userSignal.aborted) {
    return error;
  }

  // 연결 쪽에서 끊긴 것이라면 표지판에 적힌 이유를 사용합니다.
  if (focusSignal.reason instanceof NaverFocusError) {
    return focusSignal.reason;
  }

  return error;
}

// 기존 수집 동작 앞뒤에 백그라운드 화면 준비와 연결 해제를 추가합니다.
export function createFocusedNaverRunner(
  onCleanupError?: (error: NaverFocusError) => void,
): typeof runNaverCollectionAutomation {
  // 1. 연결을 준비하고 2. 기존 작업을 실행한 뒤 3. 성공·실패 모두 연결을 해제합니다.
  return async (selected, targets, hooks, client): Promise<void> => {
    await withNaverFocus(
      selected.tabId,
      hooks.signal,
      async (focusSignal): Promise<void> => {
        // focus signal 업데이트
        const focusedHooks = { ...hooks, signal: focusSignal };

        try {
          await runNaverCollectionAutomation(selected, targets, focusedHooks, client);
        } catch (error: unknown) {
          // 연결이 끊겨 멈춘 것을 사용자 취소로 표시하지 않습니다.
          throw actualFailure(error, hooks.signal, focusSignal);
        }
      },
      { onCleanupError },
    );
  };
}
