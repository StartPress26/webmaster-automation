import type { ApiError } from './errors';

// ─────────────────────────────────────────────────────────────
// 화면 상태 (관리 화면 안에서만 쓰는 값)
// ─────────────────────────────────────────────────────────────
// 왼쪽 메뉴의 화면 이름
export type View = 'dashboard' | 'inspect' | 'register' | 'notify' | 'clients';
// 지원하는 검색엔진
export type Engine = 'google' | 'naver' | 'bing';
// 데모 데이터와 색인 상태 화면에서 쓰는 글의 색인 상태
export type IndexStatus = 'indexed' | 'waiting' | 'crawled' | 'not_indexed';
// 발행 알림 화면의 전달 방식
export type NotifyRoute = 'direct' | 'link' | 'request';

// 화면에서 쓰는 고객사
export interface Client {
  readonly id: string;
  readonly name: string;
  readonly manager: string;
}

// 화면에서 쓰는 사이트(메인 페이지). 서버의 SiteRead를 화면용으로 바꾼 형태
export interface Property {
  readonly googleAccountEmail?: string | null;
  readonly bingAccountEmail?: string | null;
  readonly naverAccountEmail?: string | null;
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly origin: string;
  readonly siteUrl: string;
  readonly active: boolean;
  readonly owned: boolean;
  readonly indexNow: IndexNowSettingsRead | null;
}

// 사이트 등록 폼에서 입력한 IndexNow 키 설정
export interface IndexNowSettings {
  readonly key: string;
  readonly keyLocation: string;
}

// ─────────────────────────────────────────────────────────────
// 서버 응답 (snake_case 필드는 FastAPI 스키마 그대로)
// ─────────────────────────────────────────────────────────────
// 사이트의 IndexNow 설정 조회 응답. 키 값은 돌려주지 않음
export interface IndexNowSettingsRead {
  readonly configured: boolean;
  readonly key_location: string | null;
}

// 고객사 조회 응답
export interface ClientRead {
  readonly id: string;
  readonly name: string;
  readonly manager_name: string | null;
}

// 사이트(메인 페이지) 조회 응답
export interface SiteRead {
  readonly google_account_email?: string | null;
  readonly bing_account_email?: string | null;
  readonly naver_account_email?: string | null;
  readonly id: string;
  readonly client_id: string;
  readonly name: string;
  readonly url: string;
  readonly owner_type: 'internal' | 'client';
  readonly is_active: boolean;
}

// 글(하위 페이지) 조회 응답. 사이트와 같은 표에 저장되며 부모 사이트 ID가 붙음
export interface PageRead extends SiteRead {
  readonly parent_site_id: string;
  readonly target_type: 'page';
}

// 색인 조회 대상(사이트 또는 글) 목록 항목
export interface InspectionTarget {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly active: boolean;
  readonly type: 'site' | 'page';
}

// 저장된 색인 검사 결과 조회 응답
export interface InspectionRead {
  readonly site_id: string;
  readonly engine: 'google' | 'bing' | 'naver' | 'brave';
  readonly index_status: 'unknown' | 'submitted' | 'crawled' | 'indexed' | 'not_indexed' | 'failed';
  readonly last_checked_at: string | null;
  readonly next_check_at: string | null;
  readonly error_message: string | null;
  readonly error_code?: string | null;
}

// ─────────────────────────────────────────────────────────────
// 서버 요청
// ─────────────────────────────────────────────────────────────
// 브라우저 GUI로 관측한 색인 상태를 서버에 저장하는 요청
export interface GuiInspectionCreate {
  readonly engine: 'naver' | 'bing';
  readonly site_url: string;
  readonly target_url: string;
  readonly index_status: 'indexed' | 'crawled' | 'not_indexed' | 'unknown';
  readonly queried_at: string;
  readonly observed_at: string;
}

// 사이트맵 제출 응답
export interface SitemapSubmission {
  readonly main_site_id: string;
  readonly engine: 'google' | 'bing';
  readonly sitemap_url: string;
  readonly status: 'accepted';
}

// 사이트 등록 요청
export interface SiteWrite {
  readonly google_account_email: string | null;
  readonly bing_account_email: string | null;
  readonly naver_account_email: string | null;
  readonly client_id: string;
  readonly name: string;
  readonly url: string;
  readonly owner_type: 'internal' | 'client';
  readonly cms_type: string | null;
  readonly can_edit_site: boolean | null;
  readonly indexnow_key: string | null;
  readonly indexnow_key_location: string | null;
}

// 등록된 인증 계정 조회 응답
export interface AuthAccountRead {
  readonly email: string;
  readonly google_configured: boolean;
  readonly bing_configured: boolean;
}

// 사이트별 엔진 인증 계정
export interface SiteAuthAccounts {
  readonly google_account_email: string | null;
  readonly bing_account_email: string | null;
  readonly naver_account_email: string | null;
}

// 사이트 인증 계정 변경 요청(바꿀 필드만)
export type SiteAuthAccountsUpdate = Partial<SiteAuthAccounts>;

// ─────────────────────────────────────────────────────────────
// 글 발행
// ─────────────────────────────────────────────────────────────
// 발행 알림 폼에서 입력한 글 하나
export interface Article {
  readonly name: string;
  readonly url: string;
}

// 글 저장(+IndexNow 알림) 응답. reused가 true면 기존 글을 재사용한 것
export interface PageCreateResult {
  readonly reused?: boolean;
  readonly page: { readonly id: string; readonly name: string; readonly url: string };
  readonly submission: {
    readonly status: 'accepted' | 'key_pending' | 'failed' | 'unknown' | 'skipped';
    readonly error_code: string | null;
    readonly upstream_http_status: number | null;
  };
}

// 글 하나의 저장 처리 결과(확장 프로그램 쪽에서 정리한 형태)
export interface PageOutcome {
  readonly article: Article;
  readonly saveStatus: 'saved' | 'existing' | 'rejected' | 'unknown' | 'not_sent';
  readonly result?: PageCreateResult;
  readonly message: string;
  readonly error?: ApiError;
}

// ─────────────────────────────────────────────────────────────
// 데모 데이터와 앱 상태
// ─────────────────────────────────────────────────────────────
// 데모 모드의 색인 검사 행
export interface Inspection {
  readonly id: string;
  readonly propertyId: string;
  readonly path: string;
  readonly title: string;
  readonly engine: Engine;
  readonly status: IndexStatus;
  readonly crawledAt: string | null;
  readonly checkedAt: string;
}

// 고객사 관리 화면의 활동 기록 한 줄
export interface Activity {
  readonly label: string;
  readonly time: string;
}

// 관리 화면 전체의 현재 상태
export interface AppState {
  readonly view: View;
  readonly clientId: string;
  readonly propertyId: string;
  readonly engine: Engine;
  readonly filter: 'all' | IndexStatus;
  readonly route: NotifyRoute;
  readonly selectedId: string | null;
  readonly mobileNav: boolean;
  readonly notice: string;
  readonly noticeTone?: 'success' | 'warning' | 'error' | 'info';
}

// ─────────────────────────────────────────────────────────────
// 대시보드
// ─────────────────────────────────────────────────────────────
// 엔진별 글 색인 상태 집계
export interface EngineSummary {
  readonly indexed: number;
  readonly not_indexed: number;
  readonly crawled: number;
  readonly submitted: number;
  readonly failed: number;
  readonly unknown: number;
  readonly error_count: number;
  readonly last_checked_at: string | null;
}

// 메인 페이지의 엔진별 최신 검사 결과
export interface MainPageInspection {
  readonly google: InspectionRead | null;
  readonly naver: InspectionRead | null;
  readonly bing: InspectionRead | null;
}

// 대시보드의 사이트 한 줄
export interface DashboardSite {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly is_active: boolean;
  readonly page_count: number;
  readonly google: EngineSummary;
  readonly naver: EngineSummary;
  readonly bing: EngineSummary;
  readonly main_page?: MainPageInspection;
}

// 고객사 대시보드 조회 응답
export interface ClientDashboard {
  readonly client: ClientRead;
  readonly site_count: number;
  readonly page_count: number;
  readonly google: EngineSummary;
  readonly naver: EngineSummary;
  readonly bing: EngineSummary;
  readonly sites: readonly DashboardSite[];
}
