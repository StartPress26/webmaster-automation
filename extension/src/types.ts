import type { ApiError } from './errors';

export type View = 'dashboard' | 'inspect' | 'register' | 'notify' | 'clients';
export type Engine = 'google' | 'naver' | 'bing';
export type IndexStatus = 'indexed' | 'waiting' | 'crawled' | 'not_indexed';
export type NotifyRoute = 'direct' | 'link' | 'request';

export interface Client {
  readonly id: string;
  readonly name: string;
  readonly manager: string;
}

export interface Property {
  readonly id: string;
  readonly clientId: string;
  readonly name: string;
  readonly origin: string;
  readonly siteUrl: string;
  readonly active: boolean;
  readonly owned: boolean;
  readonly indexNow: IndexNowSettingsRead | null;
}

export interface IndexNowSettings {
  readonly key: string;
  readonly keyLocation: string;
}

export interface IndexNowSettingsRead {
  readonly configured: boolean;
  readonly key_location: string | null;
}

export interface ClientRead {
  readonly id: string;
  readonly name: string;
  readonly manager_name: string | null;
}

export interface SiteRead {
  readonly id: string;
  readonly client_id: string;
  readonly name: string;
  readonly url: string;
  readonly owner_type: 'internal' | 'client';
  readonly is_active: boolean;
}

export interface PageRead extends SiteRead {
  readonly parent_site_id: string;
  readonly target_type: 'page';
}

export interface InspectionTarget {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly active: boolean;
  readonly type: 'site' | 'page';
}

export interface InspectionRead {
  readonly site_id: string;
  readonly engine: 'google' | 'bing' | 'naver' | 'brave';
  readonly index_status: 'unknown' | 'submitted' | 'crawled' | 'indexed' | 'not_indexed' | 'failed';
  readonly last_checked_at: string | null;
  readonly next_check_at: string | null;
  readonly error_message: string | null;
  readonly error_code?: string | null;
}

export interface SiteWrite {
  readonly client_id: string;
  readonly name: string;
  readonly url: string;
  readonly owner_type: 'internal' | 'client';
  readonly cms_type: string | null;
  readonly can_edit_site: boolean | null;
  readonly indexnow_key: string | null;
  readonly indexnow_key_location: string | null;
}

export interface Article {
  readonly name: string;
  readonly url: string;
}

export interface PageCreateResult {
  readonly page: { readonly id: string; readonly name: string; readonly url: string };
  readonly submission: {
    readonly status: 'accepted' | 'key_pending' | 'failed' | 'unknown' | 'skipped';
    readonly error_code: string | null;
    readonly upstream_http_status: number | null;
  };
}

export interface PageOutcome {
  readonly article: Article;
  readonly saveStatus: 'saved' | 'rejected' | 'unknown' | 'not_sent';
  readonly result?: PageCreateResult;
  readonly message: string;
  readonly error?: ApiError;
}

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

export interface Activity {
  readonly label: string;
  readonly time: string;
}

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

export interface DashboardSite {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly is_active: boolean;
  readonly page_count: number;
  readonly google: EngineSummary;
  readonly bing: EngineSummary;
}

export interface ClientDashboard {
  readonly client: ClientRead;
  readonly site_count: number;
  readonly page_count: number;
  readonly google: EngineSummary;
  readonly bing: EngineSummary;
  readonly sites: readonly DashboardSite[];
}
