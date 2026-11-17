import type {
  Article,
  AuthAccountRead,
  ClientRead,
  IndexNowSettings,
  IndexNowSettingsRead,
  PageCreateResult,
  SiteRead,
  SiteWrite,
  SiteAuthAccountsUpdate,
  PageRead,
  InspectionRead,
  GuiInspectionCreate,
} from './types';

import { ApiError, httpError } from './errors.ts';
import type { Operation } from './errors';
import { defaultApiBase } from './runtime.ts';
import type { ClientDashboard, SitemapSubmission } from './types';
export { ApiError, errorDetail } from './errors.ts';

// 글 저장·알림 응답에서 허용하는 submission.status 값
export const VALID_SUBMISSION_STATUSES: readonly string[] = ['accepted', 'key_pending', 'failed', 'unknown', 'skipped'];

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
  readonly inspect: (id: string, engine: 'google' | 'bing') => Promise<InspectionRead>;
  readonly saveGuiInspection: (id: string, data: GuiInspectionCreate) => Promise<InspectionRead>;
  readonly submitSitemap: (
    id: string,
    engine: 'google' | 'bing',
    sitemapUrl: string,
  ) => Promise<SitemapSubmission>;
}

// 검사 응답에서 대상·엔진·상태와 nullable 필드를 확인합니다.
function validateInspection(
  value: unknown,
  targetId: string,
  operation: Operation = 'read',
): InspectionRead {
  if (!value || typeof value !== 'object')
    throw new ApiError(0, '검사 응답 형식을 확인하지 못했습니다.', {
      code: 'INVALID_RESPONSE',
      operation,
    });

  const item = value as Record<string, unknown>;
  if (
    item.site_id !== targetId ||
    !['google', 'bing', 'naver', 'brave'].includes(String(item.engine)) ||
    !['unknown', 'submitted', 'crawled', 'indexed', 'not_indexed', 'failed'].includes(
      String(item.index_status),
    ) ||
    ['last_checked_at', 'next_check_at', 'error_message'].some(
      (field: string): boolean => item[field] !== null && typeof item[field] !== 'string',
    )
  ) {
    throw new ApiError(
      0,
      '검사 응답의 대상·상태를 확인하지 못했습니다. 저장 결과를 다시 읽어 주세요.',
      { code: 'INVALID_RESPONSE', operation },
    );
  }

  return value as InspectionRead;
}

// 재시도 없이 한 번 요청하고 오류 응답에서 필요한 메시지만 추출합니다.
export function createApi(
  fetcher: typeof fetch = fetch,
  base = defaultApiBase(globalThis.location?.protocol ?? ''),
  timeoutMs = 45000,
): ApiClient {
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
      const response = await fetcher(`${base}${path}`, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data: unknown = await response.json().catch((): null => null);
      if (!response.ok)
        throw httpError(
          response.status,
          data && typeof data === 'object' && 'detail' in data ? data.detail : null,
          operation,
          response.headers.get('Retry-After'),
        );
      if (data === null)
        throw new ApiError(0, '서버 응답의 형식을 확인하지 못했습니다.', {
          code: 'INVALID_RESPONSE',
          operation,
        });

      return data as T;
    } catch (error: unknown) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        0,
        controller.signal.aborted
          ? '요청의 응답 대기 시간이 초과됐습니다.'
          : '서버에 연결하지 못했습니다.',
        { code: controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR', operation },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // 목록의 모든 페이지를 읽어 100개 이후 항목도 선택할 수 있게 합니다.
  async function list<T>(path: string): Promise<readonly T[]> {
    let items: readonly T[] = [];

    for (let offset = 0; ; offset += 100) {
      const result = await request<{ readonly items: readonly T[] }>(
        `${path}${path.includes('?') ? '&' : '?'}limit=100&offset=${offset}`,
      );
      items = [...items, ...result.items];
      if (result.items.length < 100) return items;
    }
  }

  return {
    // 모든 인증 계정을 읽고 이메일·참조 등록 여부만 화면에 전달합니다.
    listAuthAccounts: async (): Promise<readonly AuthAccountRead[]> => {
      const accounts = await list<AuthAccountRead>('/auth-accounts');
      if (accounts.some((item): boolean => !item || typeof item.email !== 'string' ||
          !item.email || typeof item.google_configured !== 'boolean' ||
          typeof item.bing_configured !== 'boolean')) {
        throw new ApiError(0, '인증 계정 목록의 형식을 확인하지 못했습니다.', {
          code: 'INVALID_RESPONSE',
        });
      }
      return accounts.map((item): AuthAccountRead => ({
        email: item.email, google_configured: item.google_configured,
        bing_configured: item.bing_configured,
      }));
    },
    // 선택한 메인 사이트의 사이트맵을 한 번 제출하고 접수 응답을 검증합니다.
    submitSitemap: async (
      id: string,
      engine: 'google' | 'bing',
      sitemapUrl: string,
    ): Promise<SitemapSubmission> => {
      if (engine !== 'google' && engine !== 'bing')
        throw new ApiError(422, '사이트맵 제출은 Google과 Bing만 지원합니다.', {
          operation: 'submit',
        });

      const result = await request<SitemapSubmission>(
        `/sites/${encodeURIComponent(id)}/sitemaps`,
        'POST',
        { engine, sitemap_url: sitemapUrl },
        'submit',
      );
      if (
        result?.main_site_id !== id ||
        result?.engine !== engine ||
        result?.status !== 'accepted' ||
        result?.sitemap_url !== sitemapUrl
      ) {
        throw new ApiError(0, '사이트맵 접수 응답을 확인하지 못했습니다.', {
          code: 'INVALID_RESPONSE',
          operation: 'submit',
        });
      }

      return result;
    },
    // 선택한 고객사의 등록 글 통계를 외부 검사 없이 읽습니다.
    getDashboard: (clientId: string): Promise<ClientDashboard> =>
      request(`/clients/${encodeURIComponent(clientId)}/dashboard`),
    // 부모 사이트에 속한 저장된 글을 외부 호출 없이 읽습니다.
    listPages: (id: string): Promise<readonly PageRead[]> =>
      list(`/sites/${encodeURIComponent(id)}/pages`),
    // 엔진을 실행하지 않고 DB에 저장된 최신 상태만 읽습니다.
    getInspections: async (id: string): Promise<readonly InspectionRead[]> => {
      const result = await request<{ readonly items: readonly InspectionRead[] }>(
        `/sites/${encodeURIComponent(id)}/inspections`,
      );
      if (!Array.isArray(result.items))
        throw new ApiError(0, '저장된 검사 목록의 형식을 확인하지 못했습니다.');
      return result.items.map((item: unknown): InspectionRead => validateInspection(item, id));
    },
    // 지원하는 엔진 하나를 명시적으로 조회하며 자동 재시도하지 않습니다.
    inspect: async (id: string, engine: 'google' | 'bing'): Promise<InspectionRead> => {
      if (engine !== 'google' && engine !== 'bing')
        throw new ApiError(422, '네이버는 작업 탭 연결이 필요합니다.');
      const result = validateInspection(
        await request(
          `/sites/${encodeURIComponent(id)}/inspections`,
          'POST',
          { engine },
          'inspect',
        ),
        id,
        'inspect',
      );
      if (result.engine !== engine)
        throw new ApiError(0, '요청한 검색엔진과 검사 응답이 다릅니다.', {
          code: 'INVALID_RESPONSE',
          operation: 'inspect',
        });
      return result;
    },
    // GUI 관측을 한 번 저장하고 서버가 보관한 최신 결과를 반환합니다.
    saveGuiInspection: async (id: string, data: GuiInspectionCreate): Promise<InspectionRead> => {
      const result = validateInspection(
        await request(`/sites/${encodeURIComponent(id)}/gui-inspections`, 'POST', data, 'save'),
        id,
        'save',
      );
      if (result.engine !== data.engine || !['naver', 'bing'].includes(result.engine) ||
          !result.last_checked_at || !/(Z|[+-]\d{2}:\d{2})$/i.test(result.last_checked_at) ||
          !Number.isFinite(Date.parse(result.last_checked_at))) {
        throw new ApiError(0, 'GUI 저장 응답의 엔진·확인 시각을 확인하지 못했습니다.', {
          code: 'INVALID_RESPONSE', operation: 'save',
        });
      }
      return result;
    },
    // 고객사 목록을 모두 읽습니다.
    listClients: (): Promise<readonly ClientRead[]> => list('/clients'),
    // 고객사에 속한 메인 사이트 목록을 모두 읽습니다.
    listSites: (clientId: string): Promise<readonly SiteRead[]> =>
      list(`/sites?client_id=${encodeURIComponent(clientId)}`),
    // 고객사와 담당자를 저장합니다.
    addClient: (name: string, manager: string): Promise<ClientRead> =>
      request('/clients', 'POST', { name, manager_name: manager || null }),
    // 사이트 정보를 저장하며 실제 검색엔진 등록은 실행하지 않습니다.
    addSite: (data: SiteWrite): Promise<SiteRead> => request('/sites', 'POST', data),
    // 변경한 필드만 보내 생략에 의한 유지와 null에 의한 연결 해제를 구분합니다.
    updateSiteAuthAccounts: async (id: string, data: SiteAuthAccountsUpdate): Promise<SiteRead> => {
      const result = await request<SiteRead>(`/sites/${encodeURIComponent(id)}/auth-accounts`, 'PATCH', data);
      if (result.id !== id || !['google_account_email', 'bing_account_email', 'naver_account_email'].every(
        (key): boolean => result[key as keyof SiteRead] === null || typeof result[key as keyof SiteRead] === 'string',
      )) throw new ApiError(0, '계정 변경 응답의 사이트·이메일 정보를 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', operation: 'save',
      });
      return result;
    },
    // 키 원문 없이 설정 여부와 공개 파일 주소를 조회합니다.
    getSettings: (id: string): Promise<IndexNowSettingsRead> =>
      request(`/sites/${encodeURIComponent(id)}/indexnow-settings`),
    // 설정을 교체하고 키 원문 없는 응답을 받습니다.
    putSettings: (id: string, data: IndexNowSettings): Promise<IndexNowSettingsRead> =>
      request(`/sites/${encodeURIComponent(id)}/indexnow-settings`, 'PUT', {
        key: data.key,
        key_location: data.keyLocation,
      }),
    // 기존 글을 다시 저장하지 않고 해당 글의 IndexNow 알림만 한 번 전송합니다.
    notifyPage: async (id: string, page: PageRead): Promise<PageCreateResult> => {
      const result = await request<PageCreateResult & { readonly page: PageRead }>(
        `/sites/${encodeURIComponent(id)}/pages/${encodeURIComponent(page.id)}/notifications`,
        'POST', { expected_url: page.url }, 'submit',
      );
      if (
        result?.page?.id !== page.id || result.page.url !== page.url ||
        result.page.client_id !== page.client_id || result.page.parent_site_id !== id ||
        result.page.target_type !== 'page' || result.page.is_active !== true ||
        !result.submission ||
        !VALID_SUBMISSION_STATUSES.includes(result.submission.status)
      ) throw new ApiError(0, '기존 글 알림 응답의 대상과 접수 결과를 확인하지 못했습니다.', {
        code: 'INVALID_RESPONSE', operation: 'submit',
      });
      return result;
    },
    // 새 글을 저장하고 선택한 경우 서버에서 한 번 알립니다.
    addPage: async (id: string, article: Article, notify: boolean): Promise<PageCreateResult> => {
      const result = await request<PageCreateResult>(
        `/sites/${encodeURIComponent(id)}/pages`,
        'POST',
        { ...article, notify_search_engines: notify },
        notify ? 'submit' : 'save',
      );
      if (
        !result?.page?.id ||
        !result?.submission ||
        !VALID_SUBMISSION_STATUSES.includes(
          result.submission.status,
        )
      ) {
        throw new ApiError(0, '글 저장·알림 응답 형식을 확인하지 못했습니다.', {
          code: 'INVALID_RESPONSE',
          operation: notify ? 'submit' : 'save',
        });
      }

      return result;
    },
  };
}
