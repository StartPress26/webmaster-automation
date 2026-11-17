import type { ApiClient } from '../api';
import type { Engine, PageRead, SiteRead } from '../types';
import type { BingAutomationObservation } from '../engines/bing/observation';
import type { NaverAutomationObservation } from '../engines/naver/observation';

// ─────────────────────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────────────────────

// 색인 조회 대상 하나(메인 사이트 또는 글)와 그 소속 사이트 정보
export interface ClientInspectionTarget {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly siteUrl: string;
}

// 대상 하나를 엔진 하나로 조회하는 작업. API 조회와 GUI 조회는 별도 작업입니다.
export interface ClientInspectionTask {
  readonly id: string;
  readonly target: ClientInspectionTarget;
  readonly engine: Engine;
  readonly route: 'api' | 'gui';
  readonly status:
    | 'queued'
    | 'running'
    | 'saving'
    | 'save_failed'
    | 'succeeded'
    | 'partial'
    | 'observed'
    | 'gui_required'
    | 'skipped'
    | 'failed'
    | 'blocked'
    | 'cancelled';
  readonly message: string;
  readonly guiObservation?: NaverAutomationObservation | BingAutomationObservation;
}

// 대상 수집 도중 사용자가 취소했음을 나타내는 예외
export class InspectionCollectionCancelled extends Error {}

type ApiEngine = 'google' | 'bing';

// ─────────────────────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────────────────────

const NAVER_QUEUED_MESSAGE = '네이버 사이트 선택·URL별 GUI 검사 대기';
const BING_GUI_QUEUED_MESSAGE = 'Bing 사이트 선택·URL별 GUI 검사 대기';
const BING_API_QUEUED_MESSAGE = '크롤링 API 조회 대기';
const GOOGLE_API_QUEUED_MESSAGE = 'API 조회 대기';
const BING_API_SKIPPED_MESSAGE = '이 사이트는 Bing API 지원 범위 밖입니다. 별도 GUI 작업에서 색인을 확인합니다.';
const GOOGLE_API_SKIPPED_MESSAGE = 'Google 속성 URL은 쿼리 없이 /로 끝나야 합니다.';

// ─────────────────────────────────────────────────────────────
// 대상 수집
// ─────────────────────────────────────────────────────────────

// 사이트나 글 하나를 조회 대상으로 바꿉니다.
function toTarget(item: SiteRead | PageRead, site: SiteRead): ClientInspectionTarget {
  return {
    id: item.id,
    name: item.name,
    url: item.url,
    siteId: site.id,
    siteName: site.name,
    siteUrl: site.url,
  };
}

// 글 목록이 모두 이 고객사·이 사이트에 속하는지 확인합니다.
function pagesBelongToSite(pages: readonly PageRead[], clientId: string, siteId: string): boolean {
  return pages.every((page): boolean => page.client_id === clientId && page.parent_site_id === siteId);
}

// 같은 ID의 대상이 이미 있으면 사이트·URL이 같은지 확인하고, 없으면 목록에 추가합니다.
function mergeTarget(
  targets: readonly ClientInspectionTarget[],
  target: ClientInspectionTarget,
): readonly ClientInspectionTarget[] {
  const existing = targets.find((item): boolean => item.id === target.id);
  if (!existing) return [...targets, target];
  if (existing.siteId !== target.siteId || existing.url !== target.url) {
    throw new Error('동일한 대상 ID의 사이트·URL 정보가 다릅니다.');
  }
  return targets;
}

// 해당 고객사의 활성 메인 사이트와 활성 글을 모두 읽은 뒤 실행 대상을 확정합니다.
export async function collectClientInspectionTargets(
  api: Pick<ApiClient, 'listSites' | 'listPages'>,
  clientId: string,
  cancelled: () => boolean = (): boolean => false,
): Promise<readonly ClientInspectionTarget[]> {
  let targets: readonly ClientInspectionTarget[] = [];

  const sites = await api.listSites(clientId);
  if (cancelled()) throw new InspectionCollectionCancelled();

  for (const site of sites) {
    if (site.client_id !== clientId) throw new Error('고객사와 사이트 목록의 소속이 다릅니다.');
    if (!site.is_active) continue;

    const pages = await api.listPages(site.id);
    if (cancelled()) throw new InspectionCollectionCancelled();
    if (!pagesBelongToSite(pages, clientId, site.id)) {
      throw new Error('사이트와 글 목록의 소속이 다릅니다.');
    }

    // 메인 사이트 자체와 활성 글들을 대상으로 추가합니다.
    const activePages = pages.filter((page): boolean => page.is_active);
    for (const item of [site, ...activePages]) {
      targets = mergeTarget(targets, toTarget(item, site));
    }
  }

  return targets;
}

// ─────────────────────────────────────────────────────────────
// 작업 만들기
// ─────────────────────────────────────────────────────────────

// 서버 API가 이 사이트를 조회할 수 있는지 확인합니다. Google은 쿼리 없이 /로 끝나는 속성 URL, Bing은 쿼리 없는 도메인 루트만 지원합니다.
function isApiSupported(engine: ApiEngine, siteUrl: string): boolean {
  const parent = new URL(siteUrl);
  if (parent.search) return false;
  if (engine === 'google') return parent.pathname.endsWith('/');
  return parent.pathname === '/';
}

// 네이버는 GUI 조회만 가능합니다.
function naverTask(target: ClientInspectionTarget): ClientInspectionTask {
  return {
    id: `${target.id}:naver`,
    target,
    engine: 'naver',
    route: 'gui',
    status: 'queued',
    message: NAVER_QUEUED_MESSAGE,
  };
}

// Google·Bing의 API 조회 작업. 지원 범위 밖이면 건너뜀(skipped)으로 만듭니다.
function apiTask(target: ClientInspectionTarget, engine: ApiEngine): ClientInspectionTask {
  const base = { id: `${target.id}:${engine}`, target, engine, route: 'api' as const };

  if (!isApiSupported(engine, target.siteUrl)) {
    const message = engine === 'bing' ? BING_API_SKIPPED_MESSAGE : GOOGLE_API_SKIPPED_MESSAGE;
    return { ...base, status: 'skipped', message };
  }

  const message = engine === 'bing' ? BING_API_QUEUED_MESSAGE : GOOGLE_API_QUEUED_MESSAGE;
  return { ...base, status: 'queued', message };
}

// Bing은 API 조회와 별도로 GUI 조회 작업도 만듭니다.
function bingGuiTask(target: ClientInspectionTarget): ClientInspectionTask {
  return {
    id: `${target.id}:bing-gui`,
    target,
    engine: 'bing',
    route: 'gui',
    status: 'queued',
    message: BING_GUI_QUEUED_MESSAGE,
  };
}

// API 관측과 GUI 색인 관측을 별도 작업으로 만들어 저장 여부를 구분합니다.
// 대상마다 Google API, 네이버 GUI, Bing API, Bing GUI 순서로 작업 4개를 만듭니다.
export function buildClientInspectionTasks(
  targets: readonly ClientInspectionTarget[],
): readonly ClientInspectionTask[] {
  return targets.flatMap((target): readonly ClientInspectionTask[] => [
    apiTask(target, 'google'),
    naverTask(target),
    apiTask(target, 'bing'),
    bingGuiTask(target),
  ]);
}
