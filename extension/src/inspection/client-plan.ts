import type { ApiClient } from '../api';
import type { Engine } from '../types';
import type { BingAutomationObservation } from '../engines/bing/observation';
import type { NaverAutomationObservation } from '../engines/naver/observation';

export interface ClientInspectionTarget {
  readonly id: string;
  readonly name: string;
  readonly url: string;
  readonly siteId: string;
  readonly siteName: string;
  readonly siteUrl: string;
}

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

export class InspectionCollectionCancelled extends Error {}

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
    if (
      pages.some((page): boolean => page.client_id !== clientId || page.parent_site_id !== site.id)
    ) {
      throw new Error('사이트와 글 목록의 소속이 다릅니다.');
    }

    const added: readonly ClientInspectionTarget[] = [
      site,
      ...pages.filter((page): boolean => page.is_active),
    ].map(
      (item): ClientInspectionTarget => ({
        id: item.id,
        name: item.name,
        url: item.url,
        siteId: site.id,
        siteName: site.name,
        siteUrl: site.url,
      }),
    );

    for (const target of added) {
      const existing = targets.find((item): boolean => item.id === target.id);
      if (existing && (existing.siteId !== target.siteId || existing.url !== target.url))
        throw new Error('동일한 대상 ID의 사이트·URL 정보가 다릅니다.');
      if (!existing) targets = [...targets, target];
    }
  }

  return targets;
}

// API 관측과 GUI 색인 관측을 별도 작업으로 만들어 저장 여부를 구분합니다.
export function buildClientInspectionTasks(
  targets: readonly ClientInspectionTarget[],
): readonly ClientInspectionTask[] {
  return targets.flatMap((target): readonly ClientInspectionTask[] => [
    ...(['google', 'naver', 'bing'] as const).map((engine): ClientInspectionTask => {
      const task = {
        id: `${target.id}:${engine}`,
        target,
        engine,
        route: engine === 'naver' ? ('gui' as const) : ('api' as const),
      };
      if (engine === 'naver')
        return { ...task, status: 'queued', message: '네이버 사이트 선택·URL별 GUI 검사 대기' };

      const parent = new URL(target.siteUrl);
      const supported =
        engine === 'google'
          ? parent.pathname.endsWith('/') && !parent.search
          : parent.pathname === '/' && !parent.search;
      if (!supported)
        return {
          ...task,
          status: 'skipped',
          message:
            engine === 'bing'
              ? '이 사이트는 Bing API 지원 범위 밖입니다. 별도 GUI 작업에서 색인을 확인합니다.'
              : 'Google 속성 URL은 쿼리 없이 /로 끝나야 합니다.',
        };

      return {
        ...task,
        status: 'queued',
        message: engine === 'bing' ? '크롤링 API 조회 대기' : 'API 조회 대기',
      };
    }),
    {
      id: `${target.id}:bing-gui`,
      target,
      engine: 'bing',
      route: 'gui',
      status: 'queued',
      message: 'Bing 사이트 선택·URL별 GUI 검사 대기',
    },
  ]);
}
