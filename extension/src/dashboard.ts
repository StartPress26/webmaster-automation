import { inspectionTime } from './inspection/format.ts';
import type { Client, ClientDashboard, Engine, EngineSummary, Inspection, Property } from './types';

// 선택 고객사 소속 사이트만 반환합니다.
export function clientProperties(
  properties: readonly Property[],
  clientId: string,
): readonly Property[] {
  return properties.filter((item: Property): boolean => item.clientId === clientId);
}

// 고객사 변경 시 이전 고객사의 사이트 ID가 남지 않도록 선택 범위를 정합니다.
export function clientSelection(
  properties: readonly Property[],
  clientId: string,
  preferred = '',
): { readonly clientId: string; readonly propertyId: string } {
  const sites = clientProperties(properties, clientId);
  return {
    clientId,
    propertyId:
      sites.find((site: Property): boolean => site.id === preferred)?.id ?? sites[0]?.id ?? '',
  };
}

// 화면 문자열의 HTML 특수 문자를 이스케이프합니다.
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char: string): string =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

// 엔진별 글 상태를 독립적으로 표시하며 오류는 상태와 겹칠 수 있음을 안내합니다.
function engineReport(engine: string, summary: EngineSummary, total: number): string {
  const statuses =
    engine !== 'Bing'
      ? ([
          ['색인 확인', summary.indexed],
          ['미색인 확인', summary.not_indexed],
          ['크롤링 확인 · 색인 미확인', summary.crawled],
          ['알림 접수 · 이후 미확인', summary.submitted],
          ['미확인', summary.unknown],
          ['처리 오류 상태', summary.failed],
        ] as const)
      : ([
          ['크롤링 확인 · 색인 미확인', summary.crawled],
          ['미확인', summary.unknown],
          ['알림 접수 · 이후 미확인', summary.submitted],
          ['처리 오류 상태', summary.failed],
          ['저장된 색인 확인', summary.indexed],
          ['저장된 미색인 확인', summary.not_indexed],
        ] as const);
  return `<section class="report dashboard-engine"><div class="report-header"><h2>${engine} · 등록 글 상태</h2><span class="muted small">${total}개 글</span></div><dl class="engine-counts">${statuses.map(([label, count]): string => `<div><dt>${label}</dt><dd>${count}<span>개</span></dd></div>`).join('')}</dl><p class="dashboard-note">최근 조회 오류 ${summary.error_count}개 · 이전 성공 상태와 중복될 수 있습니다.</p><p class="dashboard-note">글 최근 성공 관측: ${escape(inspectionTime(summary.last_checked_at))}</p></section>`;
}

// 고객사 전체 요약과 블로그별 상세 이동 표를 표시합니다.
export function dashboardContent(data: ClientDashboard): string {
  const cards = [
    ['등록 블로그', data.site_count],
    ['등록 글', data.page_count],
    ['Google 색인 확인', data.google.indexed],
    ['네이버 색인 확인', data.naver.indexed],
    ['Bing 크롤링 확인', data.bing.indexed],
  ] as const;

  return `<div class="dashboard-cards">${cards.map(([label, count]): string => `<section class="dashboard-card"><h2>${label}</h2><p>${count}<span>개</span></p></section>`).join('')}</div>
    <p class="dashboard-note dashboard-scope">등록된 글 기준 · 메인페이지 제외 · 비활성 블로그와 글 포함 · 저장된 최신 관측을 집계합니다.</p>
    <div class="dashboard-engines">${engineReport('Google', data.google, data.page_count)}${engineReport('네이버', data.naver, data.page_count)}${engineReport('Bing', data.bing, data.page_count)}</div>
    <section class="report"><div class="report-header"><div><h2>블로그별 현황</h2><p>블로그를 선택하면 색인 상태 화면으로 이동합니다.</p></div></div>${data.sites.length ? `<div class="table-scroll"><table class="dashboard-table"><thead><tr><th scope="col">블로그</th><th scope="col">등록 글</th><th scope="col">Google 색인 확인</th><th scope="col">네이버 색인 확인</th><th scope="col">Bing 크롤링 확인</th><th scope="col">글 최근 성공 관측</th></tr></thead><tbody>${data.sites.map((site): string => `<tr><td><button class="url-button" data-dashboard-site="${escape(site.id)}"><strong>${escape(site.name)}${site.is_active ? '' : ' (비활성)'}</strong><span class="url-title">${escape(site.url)}</span></button></td><td>${site.page_count}개</td><td>${site.google.indexed}개</td><td>${site.naver.indexed}개</td><td>${site.bing.crawled}개</td><td class="small">Google: ${escape(inspectionTime(site.google.last_checked_at))}<br>네이버: ${escape(inspectionTime(site.naver.last_checked_at))}<br>Bing: ${escape(inspectionTime(site.bing.last_checked_at))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty-state">등록된 블로그가 없습니다.<p>사이트 등록 메뉴에서 첫 블로그를 추가하세요.</p><button class="button primary" data-view="register">사이트 등록</button></div>'}</section>
    <div class="explanation"><p>네이버는 작업 탭에서 확인해 저장한 상태를 집계합니다. Bing 크롤링 확인은 색인 완료를 의미하지 않습니다. 이 대시보드는 새 검사 없이 DB에 저장된 결과만 보여줍니다.</p></div>`;
}

// 예시 모드에서는 메인페이지를 제외한 예시 URL로만 통계를 만듭니다.
export function demoDashboard(
  client: Client,
  properties: readonly Property[],
  inspections: readonly Inspection[],
): ClientDashboard {
  const sites = clientProperties(properties, client.id).map((site) => {
    const rows = inspections.filter(
      (item): boolean => item.propertyId === site.id && item.path !== '/',
    );
    const paths = new Set(rows.map((item): string => item.path));
    // 예시 상태의 수집 대기는 실제 관측으로 간주하지 않습니다.
    const summary = (engine: Engine): EngineSummary => {
      const observed = rows.filter((item): boolean => item.engine === engine);
      return {
        indexed: observed.filter((item): boolean => item.status === 'indexed').length,
        not_indexed: observed.filter((item): boolean => item.status === 'not_indexed').length,
        crawled: observed.filter((item): boolean => item.status === 'crawled').length,
        submitted: 0,
        failed: 0,
        unknown: paths.size - observed.filter((item): boolean => item.status !== 'waiting').length,
        error_count: 0,
        last_checked_at: null,
      };
    };

    return {
      id: site.id,
      name: site.name,
      url: site.siteUrl,
      is_active: site.active,
      page_count: paths.size,
      google: summary('google'),
      naver: summary('naver'),
      bing: summary('bing'),
    };
  });
  // 블로그별 예시 상태를 엔진별 합계로 변환합니다.
  const sum = (engine: Engine): EngineSummary => ({
    indexed: sites.reduce((n, site): number => n + site[engine].indexed, 0),
    not_indexed: sites.reduce((n, site): number => n + site[engine].not_indexed, 0),
    crawled: sites.reduce((n, site): number => n + site[engine].crawled, 0),
    unknown: sites.reduce((n, site): number => n + site[engine].unknown, 0),
    submitted: 0,
    failed: 0,
    error_count: 0,
    last_checked_at: null,
  });

  return {
    client: { id: client.id, name: client.name, manager_name: client.manager || null },
    site_count: sites.length,
    page_count: sites.reduce((n, site): number => n + site.page_count, 0),
    google: sum('google'),
    naver: sum('naver'),
    bing: sum('bing'),
    sites,
  };
}
