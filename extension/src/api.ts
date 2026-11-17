import type {
  Article,
  AuthAccountRead,
  ClientDashboard,
  ClientRead,
  GuiInspectionCreate,
  IndexNowSettings,
  IndexNowSettingsRead,
  InspectionRead,
  PageCreateResult,
  PageRead,
  SiteAuthAccountsUpdate,
  SiteRead,
  SiteWrite,
  SitemapSubmission,
} from './types';
import { ApiError, httpError } from './errors.ts';
import type { Operation } from './errors';
import { defaultApiBase } from './runtime.ts';
export { ApiError, errorDetail } from './errors.ts';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 서버가 색인 검사를 지원하는 엔진 (사이트맵 제출·API 조회에 쓰임)
type ApiEngine = 'google' | 'bing';

// FastAPI 서버와 통신하는 클라이언트
export interface ApiClient {
  readonly listAuthAccounts: () => Promise<readonly AuthAccountRead[]>;
  readonly getDashboard: (clientId: string) => Promise<ClientDashboard>;
  readonly listClients: () => Promise<readonly ClientRead[]>;
  readonly listSites: (clientId: string) => Promise<readonly SiteRead[]>;
  readonly addClient: (name: string, manager: string) => Promise<ClientRead>;
  readonly addSite: (data: SiteWrite) => Promise<SiteRead>;
  readonly updateSiteAuthAccounts: (id: string, data: SiteAuthAccountsUpdate) => Promise<SiteRead>;
  readonly getSettings: (id: string) => Promise<IndexNowSettingsRead>;
  readonly putSettings: (id: string, data: IndexNowSettings) => Promise<IndexNowSettingsRead>;
  readonly addPage: (id: string, article: Article, notify: boolean) => Promise<PageCreateResult>;
  readonly listPages: (id: string) => Promise<readonly PageRead[]>;
  readonly notifyPage: (id: string, page: PageRead) => Promise<PageCreateResult>;
  readonly getInspections: (id: string) => Promise<readonly InspectionRead[]>;
  readonly inspect: (id: string, engine: ApiEngine) => Promise<InspectionRead>;
  readonly saveGuiInspection: (id: string, data: GuiInspectionCreate) => Promise<InspectionRead>;
  readonly submitSitemap: (
    id: string,
    engine: ApiEngine,
    sitemapUrl: string,
  ) => Promise<SitemapSubmission>;
}

// 목록 응답 형식
interface ListResponse<T> {
  readonly items: readonly T[];
}

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

// 요청 하나의 기본 응답 대기 시간
const DEFAULT_TIMEOUT_MS = 45000;
// 목록 조회 시 한 페이지 크기
const PAGE_SIZE = 100;

// 글 저장·알림 응답에서 허용하는 submission.status 값
export const VALID_SUBMISSION_STATUSES: readonly string[] = ['accepted', 'key_pending', 'failed', 'unknown', 'skipped'];

// 검사 응답에서 허용하는 엔진·상태 값과 null일 수 있는 필드
const INSPECTION_ENGINES: readonly string[] = ['google', 'bing', 'naver', 'brave'];
const INSPECTION_STATUSES: readonly string[] = ['unknown', 'submitted', 'crawled', 'indexed', 'not_indexed', 'failed'];
const NULLABLE_INSPECTION_FIELDS: readonly string[] = ['last_checked_at', 'next_check_at', 'error_message'];
// GUI로 관측해 저장할 수 있는 엔진
const GUI_ENGINES: readonly string[] = ['naver', 'bing'];
// 사이트 인증 계정 응답에서 확인하는 이메일 필드
const ACCOUNT_EMAIL_FIELDS: readonly (keyof SiteRead)[] = ['google_account_email', 'bing_account_email', 'naver_account_email'];
// 시각 문자열 끝에 시간대 표기(Z 또는 ±HH:MM)가 있는지
const TIMEZONE_SUFFIX = /(Z|[+-]\d{2}:\d{2})$/i;

// ─────────────────────────────────────────────────────────────
// 응답 검증 (순수 함수)
// ─────────────────────────────────────────────────────────────

// 서버 응답 형식이 맞지 않을 때 쓰는 오류를 만듭니다.
function invalidResponse(message: string, operation: Operation = 'read'): ApiError {
  return new ApiError(0, message, { code: 'INVALID_RESPONSE', operation });
}

// 검사 응답 객체가 요청한 대상의 올바른 엔진·상태·nullable 필드를 가졌는지 확인합니다.
function isValidInspection(item: Record<string, unknown>, targetId: string): boolean {
  if (item.site_id !== targetId) return false;
  if (!INSPECTION_ENGINES.includes(String(item.engine))) return false;
  if (!INSPECTION_STATUSES.includes(String(item.index_status))) return false;

  const hasInvalidNullable = NULLABLE_INSPECTION_FIELDS.some(
    (field: string): boolean => item[field] !== null && typeof item[field] !== 'string',
  );
  return !hasInvalidNullable;
}

// 검사 응답에서 대상·엔진·상태와 nullable 필드를 확인합니다.
function validateInspection(
  value: unknown,
  targetId: string,
  operation: Operation = 'read',
): InspectionRead {
  if (!value || typeof value !== 'object') {
    throw invalidResponse('검사 응답 형식을 확인하지 못했습니다.', operation);
  }

  const item = value as Record<string, unknown>;
  if (!isValidInspection(item, targetId)) {
    throw invalidResponse('검사 응답의 대상·상태를 확인하지 못했습니다. 저장 결과를 다시 읽어 주세요.', operation);
  }

  return value as InspectionRead;
}

// 인증 계정 항목이 이메일과 두 엔진의 설정 여부를 올바른 형식으로 가졌는지 확인합니다.
function isValidAuthAccount(item: AuthAccountRead | null | undefined): boolean {
  if (!item) return false;
  if (typeof item.email !== 'string' || !item.email) return false;
  if (typeof item.google_configured !== 'boolean') return false;
  if (typeof item.bing_configured !== 'boolean') return false;
  return true;
}

// 사이트맵 접수 응답이 요청한 사이트·엔진·주소와 일치하고 접수됨(accepted)인지 확인합니다.
function isValidSitemapSubmission(
  result: SitemapSubmission | null | undefined,
  id: string,
  engine: ApiEngine,
  sitemapUrl: string,
): boolean {
  if (result?.main_site_id !== id) return false;
  if (result?.engine !== engine) return false;
  if (result?.status !== 'accepted') return false;
  if (result?.sitemap_url !== sitemapUrl) return false;
  return true;
}

// GUI 저장 응답이 요청한 엔진이고 시간대가 붙은 올바른 확인 시각을 가졌는지 확인합니다.
function isValidGuiInspection(result: InspectionRead, data: GuiInspectionCreate): boolean {
  if (result.engine !== data.engine) return false;
  if (!GUI_ENGINES.includes(result.engine)) return false;
  if (!result.last_checked_at) return false;
  if (!TIMEZONE_SUFFIX.test(result.last_checked_at)) return false;
  if (!Number.isFinite(Date.parse(result.last_checked_at))) return false;
  return true;
}

// 사이트 응답의 세 엔진 이메일 필드가 모두 null 또는 문자열인지 확인합니다.
function hasValidAccountEmails(result: SiteRead): boolean {
  return ACCOUNT_EMAIL_FIELDS.every((key): boolean => {
    const value = result[key];
    return value === null || typeof value === 'string';
  });
}

// 기존 글 알림 응답이 요청한 글(같은 ID·URL·고객사·부모·활성)과 허용되는 접수 상태를 가졌는지 확인합니다.
function isValidNotifyResponse(
  result: (PageCreateResult & { readonly page: PageRead }) | null | undefined,
  id: string,
  page: PageRead,
): boolean {
  if (result?.page?.id !== page.id) return false;
  if (result.page.url !== page.url) return false;
  if (result.page.client_id !== page.client_id) return false;
  if (result.page.parent_site_id !== id) return false;
  if (result.page.target_type !== 'page') return false;
  if (result.page.is_active !== true) return false;
  if (!result.submission) return false;
  return VALID_SUBMISSION_STATUSES.includes(result.submission.status);
}

// 새 글 저장 응답이 글 ID와 허용되는 접수 상태를 가졌는지 확인합니다.
function isValidPageCreateResult(result: PageCreateResult | null | undefined): boolean {
  if (!result?.page?.id) return false;
  if (!result?.submission) return false;
  return VALID_SUBMISSION_STATUSES.includes(result.submission.status);
}

// 응답 본문에 detail 필드가 있으면 그 값을, 없으면 null을 돌려줍니다.
function errorDetailOf(data: unknown): unknown {
  if (data && typeof data === 'object' && 'detail' in data) {
    return data.detail;
  }
  return null;
}

// 경로에 이미 쿼리가 있으면 &로, 없으면 ?로 이어 붙입니다.
function querySeparator(path: string): string {
  return path.includes('?') ? '&' : '?';
}

// ─────────────────────────────────────────────────────────────
// API 클라이언트
// ─────────────────────────────────────────────────────────────

// 재시도 없이 한 번 요청하고 오류 응답에서 필요한 메시지만 추출합니다.
export function createApi(
  fetcher: typeof fetch = fetch,
  base = defaultApiBase(globalThis.location?.protocol ?? ''),
  timeoutMs = DEFAULT_TIMEOUT_MS,
): ApiClient {
  // fetch에 넘길 옵션을 만듭니다. 본문이 있을 때만 JSON 헤더와 body를 붙입니다.
  function requestInit(method: string, body: unknown, signal: AbortSignal): RequestInit {
    const init: RequestInit = {
      method,
      signal,
      headers: { Accept: 'application/json' },
    };
    if (body === undefined) return init;
    return {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  }

  // 응답을 받지 못했을 때의 오류. 타임아웃과 연결 실패를 구분합니다.
  function transportError(aborted: boolean, operation: Operation): ApiError {
    if (aborted) {
      return new ApiError(0, '요청의 응답 대기 시간이 초과됐습니다.', { code: 'REQUEST_TIMEOUT', operation });
    }
    return new ApiError(0, '서버에 연결하지 못했습니다.', { code: 'NETWORK_ERROR', operation });
  }

  // 타임아웃에도 쓰기 요청을 자동 재전송하지 않습니다.
  async function request<T>(
    path: string,
    method = 'GET',
    body?: unknown,
    operation: Operation = method === 'GET' ? 'read' : 'save',
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout((): void => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(`${base}${path}`, requestInit(method, body, controller.signal));
      const data: unknown = await response.json().catch((): null => null);

      if (!response.ok) {
        throw httpError(response.status, errorDetailOf(data), operation, response.headers.get('Retry-After'));
      }
      if (data === null) {
        throw invalidResponse('서버 응답의 형식을 확인하지 못했습니다.', operation);
      }

      return data as T;
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw transportError(controller.signal.aborted, operation);
    } finally {
      clearTimeout(timer);
    }
  }

  // 목록의 모든 페이지를 읽어 100개 이후 항목도 선택할 수 있게 합니다.
  async function list<T>(path: string): Promise<readonly T[]> {
    let items: readonly T[] = [];

    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await request<ListResponse<T>>(
        `${path}${querySeparator(path)}limit=${PAGE_SIZE}&offset=${offset}`,
      );
      items = [...items, ...result.items];
      if (result.items.length < PAGE_SIZE) return items;
    }
  }

  // ── 인증 계정 ─────────────────────────────────────────────

  // 모든 인증 계정을 읽고 이메일·참조 등록 여부만 화면에 전달합니다.
  async function listAuthAccounts(): Promise<readonly AuthAccountRead[]> {
    const accounts = await list<AuthAccountRead>('/auth-accounts');
    if (accounts.some((item): boolean => !isValidAuthAccount(item))) {
      throw invalidResponse('인증 계정 목록의 형식을 확인하지 못했습니다.');
    }
    return accounts.map((item): AuthAccountRead => ({
      email: item.email,
      google_configured: item.google_configured,
      bing_configured: item.bing_configured,
    }));
  }

  // ── 고객사·사이트 ─────────────────────────────────────────

  // 선택한 고객사의 등록 글 통계를 외부 검사 없이 읽습니다.
  function getDashboard(clientId: string): Promise<ClientDashboard> {
    return request(`/clients/${encodeURIComponent(clientId)}/dashboard`);
  }

  // 고객사 목록을 모두 읽습니다.
  function listClients(): Promise<readonly ClientRead[]> {
    return list('/clients');
  }

  // 고객사에 속한 메인 사이트 목록을 모두 읽습니다.
  function listSites(clientId: string): Promise<readonly SiteRead[]> {
    return list(`/sites?client_id=${encodeURIComponent(clientId)}`);
  }

  // 고객사와 담당자를 저장합니다.
  function addClient(name: string, manager: string): Promise<ClientRead> {
    return request('/clients', 'POST', { name, manager_name: manager || null });
  }

  // 사이트 정보를 저장하며 실제 검색엔진 등록은 실행하지 않습니다.
  function addSite(data: SiteWrite): Promise<SiteRead> {
    return request('/sites', 'POST', data);
  }

  // 변경한 필드만 보내 생략에 의한 유지와 null에 의한 연결 해제를 구분합니다.
  async function updateSiteAuthAccounts(id: string, data: SiteAuthAccountsUpdate): Promise<SiteRead> {
    const result = await request<SiteRead>(`/sites/${encodeURIComponent(id)}/auth-accounts`, 'PATCH', data);
    if (result.id !== id || !hasValidAccountEmails(result)) {
      throw invalidResponse('계정 변경 응답의 사이트·이메일 정보를 확인하지 못했습니다.', 'save');
    }
    return result;
  }

  // ── IndexNow 설정 ─────────────────────────────────────────

  // 키 원문 없이 설정 여부와 공개 파일 주소를 조회합니다.
  function getSettings(id: string): Promise<IndexNowSettingsRead> {
    return request(`/sites/${encodeURIComponent(id)}/indexnow-settings`);
  }

  // 설정을 교체하고 키 원문 없는 응답을 받습니다.
  function putSettings(id: string, data: IndexNowSettings): Promise<IndexNowSettingsRead> {
    return request(`/sites/${encodeURIComponent(id)}/indexnow-settings`, 'PUT', {
      key: data.key,
      key_location: data.keyLocation,
    });
  }

  // ── 글 ────────────────────────────────────────────────────

  // 부모 사이트에 속한 저장된 글을 외부 호출 없이 읽습니다.
  function listPages(id: string): Promise<readonly PageRead[]> {
    return list(`/sites/${encodeURIComponent(id)}/pages`);
  }

  // 새 글을 저장하고 선택한 경우 서버에서 한 번 알립니다.
  async function addPage(id: string, article: Article, notify: boolean): Promise<PageCreateResult> {
    const operation: Operation = notify ? 'submit' : 'save';
    const result = await request<PageCreateResult>(
      `/sites/${encodeURIComponent(id)}/pages`,
      'POST',
      { ...article, notify_search_engines: notify },
      operation,
    );
    if (!isValidPageCreateResult(result)) {
      throw invalidResponse('글 저장·알림 응답 형식을 확인하지 못했습니다.', operation);
    }
    return result;
  }

  // 기존 글을 다시 저장하지 않고 해당 글의 IndexNow 알림만 한 번 전송합니다.
  async function notifyPage(id: string, page: PageRead): Promise<PageCreateResult> {
    const result = await request<PageCreateResult & { readonly page: PageRead }>(
      `/sites/${encodeURIComponent(id)}/pages/${encodeURIComponent(page.id)}/notifications`,
      'POST',
      { expected_url: page.url },
      'submit',
    );
    if (!isValidNotifyResponse(result, id, page)) {
      throw invalidResponse('기존 글 알림 응답의 대상과 접수 결과를 확인하지 못했습니다.', 'submit');
    }
    return result;
  }

  // ── 색인 검사 ─────────────────────────────────────────────

  // 엔진을 실행하지 않고 DB에 저장된 최신 상태만 읽습니다.
  async function getInspections(id: string): Promise<readonly InspectionRead[]> {
    const result = await request<ListResponse<InspectionRead>>(`/sites/${encodeURIComponent(id)}/inspections`);
    if (!Array.isArray(result.items)) {
      throw new ApiError(0, '저장된 검사 목록의 형식을 확인하지 못했습니다.');
    }
    return result.items.map((item: unknown): InspectionRead => validateInspection(item, id));
  }

  // 지원하는 엔진 하나를 명시적으로 조회하며 자동 재시도하지 않습니다.
  async function inspect(id: string, engine: ApiEngine): Promise<InspectionRead> {
    if (engine !== 'google' && engine !== 'bing') {
      throw new ApiError(422, '네이버는 작업 탭 연결이 필요합니다.');
    }
    const response = await request(`/sites/${encodeURIComponent(id)}/inspections`, 'POST', { engine }, 'inspect');
    const result = validateInspection(response, id, 'inspect');
    if (result.engine !== engine) {
      throw invalidResponse('요청한 검색엔진과 검사 응답이 다릅니다.', 'inspect');
    }
    return result;
  }

  // GUI 관측을 한 번 저장하고 서버가 보관한 최신 결과를 반환합니다.
  async function saveGuiInspection(id: string, data: GuiInspectionCreate): Promise<InspectionRead> {
    const response = await request(`/sites/${encodeURIComponent(id)}/gui-inspections`, 'POST', data, 'save');
    const result = validateInspection(response, id, 'save');
    if (!isValidGuiInspection(result, data)) {
      throw invalidResponse('GUI 저장 응답의 엔진·확인 시각을 확인하지 못했습니다.', 'save');
    }
    return result;
  }

  // ── 사이트맵 ──────────────────────────────────────────────

  // 선택한 메인 사이트의 사이트맵을 한 번 제출하고 접수 응답을 검증합니다.
  async function submitSitemap(id: string, engine: ApiEngine, sitemapUrl: string): Promise<SitemapSubmission> {
    if (engine !== 'google' && engine !== 'bing') {
      throw new ApiError(422, '사이트맵 제출은 Google과 Bing만 지원합니다.', { operation: 'submit' });
    }
    const result = await request<SitemapSubmission>(
      `/sites/${encodeURIComponent(id)}/sitemaps`,
      'POST',
      { engine, sitemap_url: sitemapUrl },
      'submit',
    );
    if (!isValidSitemapSubmission(result, id, engine, sitemapUrl)) {
      throw invalidResponse('사이트맵 접수 응답을 확인하지 못했습니다.', 'submit');
    }
    return result;
  }

  return {
    listAuthAccounts,
    getDashboard,
    listClients,
    listSites,
    addClient,
    addSite,
    updateSiteAuthAccounts,
    getSettings,
    putSettings,
    addPage,
    listPages,
    notifyPage,
    getInspections,
    inspect,
    saveGuiInspection,
    submitSitemap,
  };
}
