import { ApiError } from './api.ts';
import type { Article, PageCreateResult, PageOutcome } from './types';
import { isUncertainFailure } from './errors.ts';

export class PageSubmissionSkipped extends Error {}

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
    if (stopped || cancelled()) {
      outcomes = [
        ...outcomes,
        {
          article,
          saveStatus: 'not_sent',
          message: cancelled()
            ? '사용자가 취소해 아직 전송하지 않았습니다.'
            : '앞선 요청을 확인하거나 대기해야 하므로 실행하지 않았습니다.',
        },
      ];
      report(outcomes);
      continue;
    }

    try {
      const result = await submit(article);
      outcomes = [...outcomes, { article, saveStatus: result.reused ? 'existing' : 'saved', result, message: '' }];
    } catch (error: unknown) {
      if (error instanceof PageSubmissionSkipped) {
        outcomes = [...outcomes, { article, saveStatus: 'not_sent', message: error.message }];
        report(outcomes);
        continue;
      }
      const ambiguous = isUncertainFailure(error);
      outcomes = [
        ...outcomes,
        {
          article,
          saveStatus: ambiguous ? 'unknown' : 'rejected',
          message: error instanceof Error ? error.message : '결과를 확인하지 못했습니다.',
          ...(error instanceof ApiError ? { error } : {}),
        },
      ];
      stopped = ambiguous || (error instanceof ApiError && error.status === 429);
    }

    report(outcomes);
  }

  return outcomes;
}
