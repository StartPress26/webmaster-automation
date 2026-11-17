import { ApiError } from './api.ts';
import { isUncertainFailure } from './errors.ts';
import type { Article, PageCreateResult, PageOutcome } from './types';

// ─────────────────────────────────────────────────────────────
// 타입·상수
// ─────────────────────────────────────────────────────────────

// 사용자가 중복 글 확인에서 거절했거나 취소해서 이 글을 보내지 않았음을 나타내는 예외
export class PageSubmissionSkipped extends Error {}

const CANCELLED_MESSAGE = '사용자가 취소해 아직 전송하지 않았습니다.';
const STOPPED_MESSAGE = '앞선 요청을 확인하거나 대기해야 하므로 실행하지 않았습니다.';
const UNKNOWN_ERROR_MESSAGE = '결과를 확인하지 못했습니다.';
// 서버가 "요청이 너무 많다"고 응답한 상태 코드. 이후 글은 보내지 않습니다.
const TOO_MANY_REQUESTS = 429;

// ─────────────────────────────────────────────────────────────
// 글 하나의 결과 만들기
// ─────────────────────────────────────────────────────────────

// 보내지 않은 글의 결과. 취소 때문인지 앞선 실패 때문인지 메시지로 구분합니다.
function notSentOutcome(article: Article, cancelled: boolean): PageOutcome {
  return {
    article,
    saveStatus: 'not_sent',
    message: cancelled ? CANCELLED_MESSAGE : STOPPED_MESSAGE,
  };
}

// 저장(또는 기존 글 재사용)에 성공한 글의 결과
function savedOutcome(article: Article, result: PageCreateResult): PageOutcome {
  const saveStatus = result.reused ? 'existing' : 'saved';
  return { article, saveStatus, result, message: '' };
}

// 저장에 실패한 글의 결과. 서버에 닿았는지 모르면 unknown, 명확히 거절됐으면 rejected입니다.
function failedOutcome(article: Article, error: unknown, ambiguous: boolean): PageOutcome {
  const message = error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE;
  const outcome: PageOutcome = {
    article,
    saveStatus: ambiguous ? 'unknown' : 'rejected',
    message,
  };
  if (error instanceof ApiError) {
    return { ...outcome, error };
  }
  return outcome;
}

// 이 글의 실패 뒤에 남은 글을 보내지 말아야 하는지 판단합니다. 결과가 불확실하거나 429면 중단합니다.
function shouldStopAfter(error: unknown, ambiguous: boolean): boolean {
  if (ambiguous) return true;
  return error instanceof ApiError && error.status === TOO_MANY_REQUESTS;
}

// ─────────────────────────────────────────────────────────────
// 배치 실행
// ─────────────────────────────────────────────────────────────

// 글별 결과를 보존하며 순차 실행하고 접수 불명 또는 서버 오류 뒤에는 중단합니다.
export async function submitPageBatch(
  articles: readonly Article[],
  submit: (article: Article) => Promise<PageCreateResult>,
  report: (outcomes: readonly PageOutcome[]) => void,
  cancelled: () => boolean = (): boolean => false,
): Promise<readonly PageOutcome[]> {
  let outcomes: readonly PageOutcome[] = [];
  let stopped = false;

  for (const article of articles) {
    const isCancelled = cancelled();

    // 앞선 글에서 중단됐거나 사용자가 취소했으면 보내지 않고 기록만 남깁니다.
    if (stopped || isCancelled) {
      outcomes = [...outcomes, notSentOutcome(article, isCancelled)];
      report(outcomes);
      continue;
    }

    try {
      const result = await submit(article);
      outcomes = [...outcomes, savedOutcome(article, result)];
    } catch (error: unknown) {
      // 사용자가 거절·취소한 글은 실패가 아니라 "보내지 않음"으로 기록하고 다음 글로 넘어갑니다.
      if (error instanceof PageSubmissionSkipped) {
        outcomes = [...outcomes, { article, saveStatus: 'not_sent', message: error.message }];
        report(outcomes);
        continue;
      }

      const ambiguous = isUncertainFailure(error);
      outcomes = [...outcomes, failedOutcome(article, error, ambiguous)];
      stopped = shouldStopAfter(error, ambiguous);
    }

    report(outcomes);
  }

  return outcomes;
}
