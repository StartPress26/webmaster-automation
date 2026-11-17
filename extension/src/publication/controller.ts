import { PageSubmissionSkipped, submitPageBatch } from '../batch.ts';
import { ApiError, isUncertainFailure } from '../errors.ts';
import { createWorkTabController } from '../tabs/controller.ts';
import type { WorkTabController, WorkTabState } from '../tabs/controller';
import { runNaverCollectionAutomation } from '../engines/naver/collection-automation.ts';
import { canonicalNaverTarget, naverTargetInSite, NaverAutomationError } from '../engines/naver/observation.ts';
import type { NaverCollectionReceipt } from '../engines/naver/collection';
import type { Article, PageCreateResult, PageOutcome, PageRead } from '../types';
import type { ClientInspectionTarget } from '../inspection/client-plan';
import { checkPublicationNaverTab, listPublicationNaverTabs } from './tabs.ts';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 발행 화면에서 사용자가 입력한 값
export interface PublicationInput {
  readonly clientId: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly siteUrl: string;
  readonly articles: readonly Article[];
  readonly notify: boolean; // IndexNow 알림 체크 여부
  readonly gui: boolean;    // 네이버 GUI 수집 요청 체크 여부
  readonly demo: boolean;   // 데모 모드 (실제 요청 없음)
}

// 글 1개에 대한 네이버 GUI 수집 요청 결과
export interface PublicationGuiResult {
  readonly targetUrl: string;
  readonly status: 'queued' | 'requesting' | 'accepted' | 'unconfirmed' | 'blocked' | 'cancelled';
  readonly receipt?: NaverCollectionReceipt;
  readonly message: string;
}

// "이미 등록된 글" 확인 모달에 보여줄 정보
export interface PublicationDuplicate {
  readonly article: Article;
  readonly page: PageRead;
  readonly confirmationId: string;
}

// 새 글 발행 알림 작업 1회의 현재 상황을 모두 담는 상태 객체
export interface PublicationState {
  readonly scope: string;
  readonly clientId: string;
  readonly siteId: string;
  readonly phase: 'idle' | 'preparing_tabs' | 'awaiting_tabs' | 'saving' | 'awaiting_duplicate' | 'requesting_gui' | 'finished' | 'cancelled' | 'failed';
  readonly tab?: WorkTabState;
  readonly outcomes: readonly PageOutcome[];
  readonly guiResults: readonly PublicationGuiResult[];
  readonly message: string;
  readonly cancelRequested: boolean;
  readonly input?: PublicationInput;
  readonly duplicate?: PublicationDuplicate;
}

// 컨트롤러가 바깥(main.ts, 테스트)에서 넘겨받는 함수들
interface PublicationDependencies {
  readonly submit: (input: PublicationInput, article: Article) => Promise<PageCreateResult>;
  readonly changed: () => void;
  readonly report: (input: PublicationInput, outcomes: readonly PageOutcome[]) => void;
  readonly tabs?: WorkTabController;
  readonly runner?: typeof runNaverCollectionAutomation;
  readonly blocked?: () => boolean;
  readonly listPages?: (siteId: string) => Promise<readonly PageRead[]>;
  readonly notifyExisting?: (input: PublicationInput, page: PageRead) => Promise<PageCreateResult>;
}

// 화면(main.ts)이 사용할 수 있는 컨트롤러 기능
export interface PublicationController {
  readonly getState: () => PublicationState;
  readonly start: (input: PublicationInput) => Promise<void>;
  readonly chooseTab: (scope: string, candidateId?: string) => Promise<void>;
  readonly cancel: () => void;
  readonly confirmDuplicate: (scope: string, confirmationId: string, approved: boolean) => void;
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const MAX_ARTICLES = 50;
const MAX_URL_LENGTH = 2048;

// 이 단계 중 하나에 있으면 "진행 중"으로 보고 새 발행을 막는다
const BUSY_PHASES: readonly PublicationState['phase'][] = [
  'preparing_tabs', 'awaiting_tabs', 'saving', 'awaiting_duplicate', 'requesting_gui',
];

// 저장이 확인된 것으로 보는 saveStatus (새로 저장 / 기존 글 재사용)
const SAVED_STATUSES: readonly PageOutcome['saveStatus'][] = ['saved', 'existing'];

// 서버 알림 응답에서 허용하는 submission.status
const VALID_SUBMISSION_STATUSES: readonly string[] = ['accepted', 'key_pending', 'failed', 'unknown', 'skipped'];

// 이 상태 코드의 에러는 알림 결과로 바꾸지 않고 그대로 위로 던진다 (인증·권한·대상 없음·충돌·검증 실패)
const RETHROW_STATUS_CODES: readonly number[] = [401, 403, 404, 409, 422];

// ─────────────────────────────────────────────────────────────
// 컨트롤러 밖의 순수 함수 (state를 읽거나 바꾸지 않음)
// ─────────────────────────────────────────────────────────────

// 탭 준비부터 GUI 요청 종료까지 동일 관리 화면의 중복 발행 실행을 막습니다.
export function publicationBusy(state: PublicationState): boolean {
  return BUSY_PHASES.includes(state.phase);
}

// 글 1개의 제목·URL을 검증하고 정규화한 URL로 고정된 사본을 만듭니다.
function snapshotArticle(article: Article, siteUrl: string): Article {
  const url = canonicalNaverTarget(article.url);
  const hasName = Boolean(article.name?.trim());

  if (!hasName || !url || url.length > MAX_URL_LENGTH || !naverTargetInSite(siteUrl, url)) {
    throw new Error('선택한 사이트의 올바른 제목과 URL만 발행할 수 있습니다.');
  }

  return Object.freeze({ name: article.name, url });
}

// 외부 동작 전에 전체 URL을 검증하고 이후 화면 변경과 독립적인 입력 사본을 만듭니다.
function snapshot(input: PublicationInput): PublicationInput {
  const siteUrl = canonicalNaverTarget(input.siteUrl);
  const articleCount = input.articles.length;

  if (!input.clientId || !input.siteId || !siteUrl || articleCount === 0 || articleCount > MAX_ARTICLES) {
    throw new Error('고객사·사이트와 한 번에 최대 50개의 발행 URL을 확인하세요.');
  }

  const articles = input.articles.map((article) => snapshotArticle(article, siteUrl));

  const uniqueUrls = new Set(articles.map((article) => article.url));
  if (uniqueUrls.size !== articles.length) {
    throw new Error('중복 URL을 제거하고 다시 실행하세요.');
  }

  return Object.freeze({ ...input, siteUrl, articles: Object.freeze(articles) });
}

// GUI 요청을 실제로 할지(체크했고 데모가 아닌지) 확인합니다.
function guiEnabled(input: PublicationInput): boolean {
  return input.gui && !input.demo;
}

// 발행을 시작할 때 GUI 요청 대상 글을 모두 "대기" 상태로 만듭니다.
function initialGuiResults(input: PublicationInput): readonly PublicationGuiResult[] {
  if (!guiEnabled(input)) {
    return [];
  }

  return input.articles.map((article): PublicationGuiResult => {
    return { targetUrl: article.url, status: 'queued', message: '글 저장 후 수집 요청 대기' };
  });
}

// 저장 결과 목록에서 저장이 확인된 글만 고릅니다.
function savedOutcomes(outcomes: readonly PageOutcome[]): readonly PageOutcome[] {
  return outcomes.filter((outcome) => SAVED_STATUSES.includes(outcome.saveStatus));
}

// 저장 결과 중 저장 여부가 불명확한 글이 하나라도 있는지 확인합니다.
function hasUnknownSave(outcomes: readonly PageOutcome[]): boolean {
  return outcomes.some((outcome) => outcome.saveStatus === 'unknown');
}

// 저장 목록에 없는 URL의 GUI 요청을 "막힘"으로 바꿉니다.
function blockUnsaved(
  guiResults: readonly PublicationGuiResult[],
  saved: readonly PageOutcome[],
): readonly PublicationGuiResult[] {
  const savedUrls = new Set(saved.map((outcome) => outcome.article.url));

  return guiResults.map((result): PublicationGuiResult => {
    if (savedUrls.has(result.targetUrl)) {
      return result;
    }
    return { ...result, status: 'blocked', message: '글 저장이 확인되지 않아 GUI 요청하지 않았습니다.' };
  });
}

// 아직 "대기" 중인 GUI 요청만 지정한 상태와 메시지로 바꿉니다.
function replaceQueued(
  guiResults: readonly PublicationGuiResult[],
  status: PublicationGuiResult['status'],
  message: string,
): readonly PublicationGuiResult[] {
  return guiResults.map((result): PublicationGuiResult => {
    if (result.status !== 'queued') {
      return result;
    }
    return { ...result, status, message };
  });
}

// 저장된 글을 네이버 GUI 자동화가 받는 대상 형식으로 바꾸고, 서버가 저장한 URL과 입력 URL이 같은지 검증합니다.
function toGuiTarget(outcome: PageOutcome, input: PublicationInput): ClientInspectionTarget {
  const page = outcome.result?.page;

  if (!page?.id || canonicalNaverTarget(page.url) !== outcome.article.url) {
    throw new Error('PUBLICATION_SAVED_TARGET_MISMATCH');
  }

  return {
    id: page.id,
    name: outcome.article.name,
    url: outcome.article.url,
    siteId: input.siteId,
    siteName: input.siteName,
    siteUrl: input.siteUrl,
  };
}

// 실행 중 예외가 났을 때 화면에 보여줄 메시지를 고릅니다.
function failureMessage(error: unknown): string {
  if (error instanceof NaverAutomationError) {
    return error.message;
  }
  return '발행 후속 작업을 확인하지 못했습니다. 저장·알림·네이버 요청 내역을 확인하세요. 자동 재요청하지 않습니다.';
}

// "요청 중"이던 글이 실패했을 때, 요청이 나가지 않은 게 확실하면 blocked, 아니면 unconfirmed를 고릅니다.
function interruptedStatus(error: unknown): PublicationGuiResult['status'] {
  const surelyNotSent = error instanceof NaverAutomationError && error.code !== 'receipt_unconfirmed';
  if (surelyNotSent) {
    return 'blocked';
  }
  // 확인 버튼을 눌렀을 수도 있으므로, 중복 요청을 피하려고 "미확인"으로 둡니다.
  return 'unconfirmed';
}

// 예외로 작업이 끝났을 때 각 GUI 요청의 최종 상태를 정합니다.
function failGuiResults(
  guiResults: readonly PublicationGuiResult[],
  error: unknown,
  message: string,
  cancelled: boolean,
): readonly PublicationGuiResult[] {
  return guiResults.map((result): PublicationGuiResult => {
    if (result.status === 'requesting') {
      return { ...result, status: interruptedStatus(error), message };
    }
    if (result.status === 'queued') {
      const status = cancelled ? 'cancelled' : 'blocked';
      return { ...result, status, message: '앞선 작업이 종료되어 추가 수집 요청하지 않았습니다.' };
    }
    // accepted 등 이미 끝난 결과는 그대로 둡니다.
    return result;
  });
}

// 기존 글 목록에서 고른 글이 현재 고객사·사이트의 활성 글인지 확인합니다.
function isVerifiedExistingPage(page: PageRead | undefined, input: PublicationInput): page is PageRead {
  if (!page) return false;
  if (typeof page.id !== 'string' || !page.id) return false;
  if (typeof page.name !== 'string' || !page.name.trim()) return false;
  if (page.client_id !== input.clientId) return false;
  if (page.parent_site_id !== input.siteId) return false;
  if (page.target_type !== 'page') return false;
  if (page.is_active !== true) return false;
  return true;
}

// 기존 글 알림 응답이 요청한 글에 대한 올바른 형식인지 확인합니다.
function isValidNotifyResponse(result: PageCreateResult, page: PageRead): boolean {
  if (result?.page?.id !== page.id) return false;
  if (canonicalNaverTarget(result?.page?.url ?? '') !== page.url) return false;
  if (!result.submission) return false;
  return VALID_SUBMISSION_STATUSES.includes(result.submission.status);
}

// 기존 글 알림 실패를 저장 결과와 분리된 알림 결과(failed 또는 unknown)로 바꿉니다.
function notifyFailureResult(error: unknown, page: PageRead): PageCreateResult {
  const apiError = error instanceof ApiError ? error : null;

  // 서버가 명확히 거절했는지, 아니면 전달됐는지조차 모르는지 구분합니다.
  const uncertain = isUncertainFailure(error);

  let errorCode: string;
  if (apiError?.kind === 'timeout') {
    errorCode = 'INDEXNOW_TIMEOUT';
  } else if (apiError?.code === 'INVALID_RESPONSE') {
    errorCode = 'INDEXNOW_RESPONSE_ERROR';
  } else if (uncertain) {
    errorCode = 'INDEXNOW_TRANSPORT_ERROR';
  } else {
    errorCode = 'INDEXNOW_REJECTED';
  }

  let upstreamStatus: number | null = null;
  if (apiError && apiError.status > 0) {
    upstreamStatus = apiError.status;
  }

  return {
    page,
    reused: true,
    submission: {
      status: uncertain ? 'unknown' : 'failed',
      error_code: errorCode,
      upstream_http_status: upstreamStatus,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 컨트롤러
// ─────────────────────────────────────────────────────────────

// 글 저장·IndexNow와 선택한 네이버 GUI 요청의 결과를 각각 보존합니다.
export function createPublicationController(dependencies: PublicationDependencies): PublicationController {
  const tabs = dependencies.tabs ?? createWorkTabController({
    list: listPublicationNaverTabs,
    check: checkPublicationNaverTab,
    available: (): boolean => Boolean(globalThis.chrome?.tabs),
  });
  const runner = dependencies.runner ?? runNaverCollectionAutomation;

  // 실행 중인 GUI 자동화를 취소할 때 쓰는 신호
  let abort = new AbortController();
  // 탭 준비를 기다리는 사이에 새 실행이나 취소가 끼어들었는지 확인하는 번호
  let version = 0;
  // 중복 글 확인 모달이 기다리고 있는 사용자 응답
  let pendingConfirmation: {
    readonly scope: string;
    readonly confirmationId: string;
    readonly resolve: (approved: boolean) => void;
  } | null = null;

  let state: PublicationState = {
    scope: '',
    clientId: '',
    siteId: '',
    phase: 'idle',
    outcomes: [],
    guiResults: [],
    message: '',
    cancelRequested: false,
  };

  // ── 상태 변경 ──────────────────────────────────────────────

  // 변경된 필드만 새 상태 객체에 반영해 화면을 갱신합니다.
  function update(patch: Partial<PublicationState>): void {
    state = { ...state, ...patch };
    dependencies.changed();
  }

  // 특정 URL의 GUI 결과만 바꾸고 다른 URL의 이미 확인한 접수를 보존합니다.
  function updateGui(targetUrl: string, patch: Partial<PublicationGuiResult>): void {
    const guiResults = state.guiResults.map((result): PublicationGuiResult => {
      if (result.targetUrl !== targetUrl) {
        return result;
      }
      return { ...result, ...patch };
    });
    update({ guiResults });
  }

  // 현재 요청을 재전송하지 않고 아직 시작하지 않은 GUI 요청만 종료 상태로 바꿉니다.
  function finishCancelled(): void {
    update({
      phase: 'cancelled',
      message: '발행 작업을 취소했습니다. 이미 저장되거나 접수된 결과는 유지됩니다.',
      guiResults: replaceQueued(state.guiResults, 'cancelled', '취소하여 수집 요청하지 않았습니다.'),
    });
  }

  // ── 중복 글 처리 ──────────────────────────────────────────

  // 중복 응답은 같은 고객사·부모·URL의 활성 글 하나가 확인된 경우에만 재사용합니다.
  async function existingPage(input: PublicationInput, article: Article): Promise<PageRead> {
    const pages = await dependencies.listPages!(input.siteId);

    if (state.cancelRequested) {
      throw new PageSubmissionSkipped('사용자가 취소해 기존 글에 요청하지 않았습니다.');
    }

    const matches = pages.filter((page) => canonicalNaverTarget(page.url) === article.url);
    const page = matches[0];

    if (matches.length !== 1 || !isVerifiedExistingPage(page, input)) {
      throw new ApiError(409, '현재 고객사·사이트의 활성 글을 확인하지 못해 요청하지 않았습니다.',
        { code: 'EXISTING_PAGE_UNVERIFIED', operation: 'read' });
    }

    return Object.freeze({ ...page, url: article.url });
  }

  // 모달의 현재 실행·확인 ID가 일치하는 명시적인 응답만 한 번 소비합니다.
  function confirmDuplicate(scope: string, confirmationId: string, approved: boolean): void {
    const pending = pendingConfirmation;
    if (!pending) return;
    if (state.phase !== 'awaiting_duplicate') return;
    if (state.cancelRequested) return;
    if (scope !== state.scope || scope !== pending.scope) return;
    if (confirmationId !== pending.confirmationId) return;

    pendingConfirmation = null;

    let message: string;
    if (approved) {
      message = '기존 글로 선택한 발행 알림을 처리합니다.';
    } else {
      message = '이 글의 기존 등록 정보를 유지하고 요청을 건너뜁니다.';
    }
    update({ phase: 'saving', duplicate: undefined, message });

    // approveExisting에서 기다리던 Promise를 풀어줍니다.
    pending.resolve(approved);
  }

  // 외부 알림 전에 사용자 승인을 기다리고 취소된 작업에는 모달을 열지 않습니다.
  async function approveExisting(article: Article, page: PageRead): Promise<boolean> {
    if (state.cancelRequested) {
      return false;
    }

    // 모달을 띄우고, confirmDuplicate(또는 cancel)가 resolve를 호출할 때까지 기다립니다.
    return await new Promise<boolean>((resolve): void => {
      const confirmationId = crypto.randomUUID();
      pendingConfirmation = { scope: state.scope, confirmationId, resolve };
      update({
        phase: 'awaiting_duplicate',
        duplicate: { article, page, confirmationId },
        message: '이미 등록된 글입니다. 선택한 인덱싱 요청을 계속할지 확인하세요.',
      });
    });
  }

  // 기존 글 재알림의 통신 실패는 저장 여부와 분리해 보존하고 자동 재전송하지 않습니다.
  async function notifyExisting(input: PublicationInput, page: PageRead): Promise<PageCreateResult> {
    if (!input.notify) {
      return {
        page,
        reused: true,
        submission: { status: 'skipped', error_code: 'NOTIFICATION_DISABLED', upstream_http_status: null },
      };
    }

    try {
      if (!dependencies.notifyExisting) {
        throw new Error('EXISTING_NOTIFICATION_UNAVAILABLE');
      }

      const result = await dependencies.notifyExisting(input, page);

      if (!isValidNotifyResponse(result, page)) {
        throw new ApiError(0, '기존 글 알림 응답을 확인하지 못했습니다.', { code: 'INVALID_RESPONSE', operation: 'submit' });
      }

      return { ...result, page, reused: true };
    } catch (error: unknown) {
      if (error instanceof ApiError && RETHROW_STATUS_CODES.includes(error.status)) {
        throw error;
      }
      return notifyFailureResult(error, page);
    }
  }

  // 서버의 에러가 "이미 등록된 글(409 DUPLICATE_PAGE)"이고 기존 글 경로로 이어갈 수 있는지 확인합니다.
  function canReuseExisting(error: unknown, input: PublicationInput): boolean {
    if (!(error instanceof ApiError)) return false;
    if (error.status !== 409 || error.code !== 'DUPLICATE_PAGE') return false;
    if (!dependencies.listPages) return false;
    if (!input.notify && !input.gui) return false; // 보낼 요청이 없으면 기존 글을 쓸 이유도 없음
    if (input.demo) return false;
    return true;
  }

  // 새 글 저장을 먼저 시도하고 명시적인 중복인 경우에만 기존 글 승인 경로로 이어갑니다.
  async function submit(input: PublicationInput, article: Article): Promise<PageCreateResult> {
    try {
      // 컨트롤러는 API를 직접 import하지 않고, 생성할 때 바깥에서 함수를 넘겨받습니다(의존성 주입). 실제로 넘겨주는 곳은 main.ts입니다.
      // await를 붙여야 실패했을 때 아래 catch로 들어옵니다.
      return await dependencies.submit(input, article);
    } catch (error: unknown) {
      if (!canReuseExisting(error, input)) {
        throw error;
      }

      const page = await existingPage(input, article);
      const approved = await approveExisting(article, page);

      if (!approved || state.cancelRequested) {
        throw new PageSubmissionSkipped('사용자가 기존 글의 인덱싱 요청을 취소했습니다.');
      }

      return await notifyExisting(input, page);
    }
  }

  // ── 발행 실행 ─────────────────────────────────────────────

  // 글 여러 개를 하나씩 순서대로 저장하고 IndexNow 알림을 보내며 진행 상황을 화면에 반영합니다.
  async function saveArticles(input: PublicationInput): Promise<readonly PageOutcome[]> {
    // 글 1개 처리
    const submitOne = (article: Article): Promise<PageCreateResult> => {
      return submit(input, article);
    };
    // 글 1개가 끝날 때마다 결과 보고
    const reportProgress = (results: readonly PageOutcome[]): void => {
      dependencies.report(input, results);
      update({ outcomes: results });
    };
    // 사용자가 취소했는지 확인
    const isCancelled = (): boolean => {
      return state.cancelRequested;
    };

    return await submitPageBatch(input.articles, submitOne, reportProgress, isCancelled);
  }

  // GUI 요청을 하지 않는 경우(체크 해제 또는 데모)의 종료 메시지를 표시합니다.
  function finishWithoutGui(input: PublicationInput): void {
    let message: string;
    if (input.demo) {
      message = '예시 처리 결과입니다. 실제 저장·알림·GUI 요청은 실행하지 않았습니다.';
    } else {
      message = '글 저장과 IndexNow 알림 처리를 마쳤습니다. 아래 결과를 확인하세요.';
    }
    update({ phase: 'finished', message });
  }

  // 저장 여부가 불명확한 글이 있으면 GUI 요청 전체를 막고 실패로 끝냅니다.
  function failForUnknownSave(): void {
    update({
      phase: 'failed',
      message: '글 저장 여부가 불명확해 GUI 요청을 시작하지 않았습니다. 저장 결과를 먼저 확인하세요.',
      guiResults: replaceQueued(state.guiResults, 'blocked', '배치 저장 결과가 불명확해 GUI 요청하지 않았습니다.'),
    });
  }

  // 선택한 네이버 탭에서 저장된 글들의 웹페이지 수집 요청을 실행합니다.
  async function requestNaverCollection(
    selected: NonNullable<WorkTabState['selected']>,
    targets: readonly ClientInspectionTarget[],
  ): Promise<void> {
    update({ phase: 'requesting_gui', message: '네이버 탭에서 웹페이지 수집 요청을 진행합니다.' });

    await runner(selected, targets, {
      signal: abort.signal,
      // 글 1개 요청을 시작할 때
      onStart: (target): void => {
        updateGui(target.url, { status: 'requesting', message: '네이버 수집 요청 접수를 확인하는 중입니다.' });
      },
      // 글 1개 요청 접수가 확인됐을 때
      onResult: (target, receipt): void => {
        updateGui(target.url, { status: 'accepted', receipt, message: '수집 요청 접수 확인 · 수집·색인 완료는 미확인입니다.' });
      },
    });
  }

  // 실행 중 예외가 나면 진행 중·대기 중인 GUI 요청의 상태를 정리하고 실패(또는 취소)로 끝냅니다.
  function failExecution(error: unknown): void {
    const message = failureMessage(error);
    const cancelled = state.cancelRequested;

    update({
      phase: cancelled ? 'cancelled' : 'failed',
      message,
      guiResults: failGuiResults(state.guiResults, error, message, cancelled),
    });
  }

  // 현재 응답을 보존한 뒤 저장된 URL만 네이버 GUI 수집 대상으로 전달합니다.
  async function execute(input: PublicationInput): Promise<void> {
    update({ phase: 'saving', message: '글을 저장하고 선택한 IndexNow 알림을 처리합니다.' });

    try {
      // 1. 글 저장 + IndexNow 알림
      const outcomes = await saveArticles(input);

      // 2. 저장이 확인된 글들만 골라내고, 나머지는 GUI 요청을 막습니다.
      const saved = savedOutcomes(outcomes);
      update({ guiResults: blockUnsaved(state.guiResults, saved) });

      // 3. GUI 요청 없이 여기서 끝나는 경우들
      if (state.cancelRequested) {
        finishCancelled();
        return;
      }
      if (!guiEnabled(input)) {
        finishWithoutGui(input);
        return;
      }
      if (hasUnknownSave(outcomes)) {
        failForUnknownSave();
        return;
      }

      // 4. 네이버 탭과 요청 대상 확인
      const selected = state.tab?.selected;
      if (!selected) {
        throw new Error('PUBLICATION_TAB_MISSING');
      }
      const targets = saved.map((outcome) => toGuiTarget(outcome, input));
      if (targets.length === 0) {
        update({ phase: 'finished', message: '저장이 확인된 글이 없어 네이버 GUI 요청을 실행하지 않았습니다.' });
        return;
      }

      // 5. 네이버 GUI 수집 요청
      await requestNaverCollection(selected, targets);

      if (state.cancelRequested) {
        finishCancelled();
        return;
      }
      update({ phase: 'finished', message: '글 저장·IndexNow·네이버 GUI 처리 결과를 확인하세요. 요청 접수는 색인 완료가 아닙니다.' });
    } catch (error: unknown) {
      failExecution(error);
    }
  }

  // ── 탭 준비와 시작 ────────────────────────────────────────

  // 발행 시작 시 선택한 탭을 재검증하고 다중 후보는 저장 전에 선택을 기다립니다.
  async function prepare(input: PublicationInput, candidateId?: string): Promise<void> {
    const currentVersion = version;
    update({ phase: 'preparing_tabs', message: '글 저장 전에 네이버 작업 탭을 확인합니다.' });

    const preparation = tabs.prepare(state.scope, 'naver', candidateId);
    update({ tab: tabs.getState() });
    await preparation;

    // 기다리는 동안 새 실행이 시작됐거나 취소됐으면 이 준비 결과는 버립니다.
    if (currentVersion !== version || state.cancelRequested) {
      return;
    }

    update({ tab: tabs.getState() });

    if (!state.tab?.selected) {
      update({
        phase: 'awaiting_tabs',
        message: '네이버에 로그인한 탭을 준비하고 선택하세요. 아직 글 저장·알림·수집 요청은 실행하지 않았습니다.',
      });
      return;
    }

    await execute(input);
  }

  // 새 발행의 입력과 취소 신호를 고정하고 선택한 경우에만 네이버 탭을 준비합니다.
  async function start(value: PublicationInput): Promise<void> {
    if (publicationBusy(state)) return;
    if (dependencies.blocked?.()) return;

    const input = snapshot(value);

    version += 1;
    abort = new AbortController();
    tabs.reset();

    update({
      scope: crypto.randomUUID(),
      clientId: input.clientId,
      siteId: input.siteId,
      input,
      phase: 'preparing_tabs',
      tab: undefined,
      duplicate: undefined,
      outcomes: [],
      cancelRequested: false,
      guiResults: initialGuiResults(input),
      message: '',
    });

    if (guiEnabled(input)) {
      // GUI를 할 때는 탭부터 확인하고, 확인되면 prepare 안에서 execute를 호출합니다.
      await prepare(input);
    } else {
      await execute(input);
    }
  }

  // 현재 발행 실행에서 제시한 탭 후보만 선택하고 준비되면 저장부터 이어갑니다.
  async function chooseTab(scope: string, candidateId?: string): Promise<void> {
    if (scope !== state.scope) return;
    if (state.phase !== 'awaiting_tabs') return;
    if (!state.input) return;

    if (candidateId !== undefined) {
      const isCandidate = state.tab?.candidates.some((tab) => String(tab.tabId) === candidateId);
      if (!isCandidate) return;
    }

    await prepare(state.input, candidateId);
  }

  // 탭 대기는 즉시 끝내고 저장 중에는 진행 중인 응답을 보존한 뒤 취소합니다.
  function cancel(): void {
    if (!publicationBusy(state)) return;
    if (state.cancelRequested) return;

    update({ cancelRequested: true });
    abort.abort();

    // 중복 글 모달이 열려 있으면 "거절"로 답해서 기다림을 풉니다.
    if (pendingConfirmation) {
      const pending = pendingConfirmation;
      pendingConfirmation = null;
      update({ phase: 'saving', duplicate: undefined });
      pending.resolve(false);
    }

    // 아직 저장을 시작하기 전(탭 준비 단계)이면 바로 취소로 끝냅니다.
    if (state.phase === 'preparing_tabs' || state.phase === 'awaiting_tabs') {
      version += 1;
      tabs.reset();
      finishCancelled();
    }
  }

  // 현재 상태를 돌려줍니다.
  function getState(): PublicationState {
    return state;
  }

  return { getState, start, chooseTab, confirmDuplicate, cancel };
}
