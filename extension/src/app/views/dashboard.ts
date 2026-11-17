import { dashboardContent, demoDashboard } from '../../dashboard.ts';
import { escapeHtml } from '../../html.ts';
import { renderClientInspection } from '../../inspection/client-view.ts';
import { clientInspections } from '../controllers.ts';
import { errorPanel } from '../form-errors.ts';
import { demo, inspections, selectedClient, store } from '../store.ts';

// 대시보드 화면

// 현재 고객사 전체 실행 영역을 페이지 제목 아래에 일관되게 배치합니다.
export function clientInspectionPanel(): string {
  return renderClientInspection(
    clientInspections.getState(),
    store.state.clientId,
    selectedClient()?.name ?? '',
    demo,
  );
}

// 선택 고객사의 통계와 데이터 준비·빈 목록·오류 상태를 표시합니다.
export function dashboardView(): string {
  const client = selectedClient();
  const heading = `<div class="page-heading"><div><h1>${escapeHtml(client?.name ?? '고객사')} · 대시보드</h1><p>담당자: ${escapeHtml(client?.manager || '미지정')} · 선택한 고객사의 블로그 전체 현황</p></div>${client ? '<button class="button secondary" id="reload-dashboard">통계 새로고침</button>' : ''}</div>${clientInspectionPanel()}`;
  if (!client)
    return `${heading}<section class="report empty-state">선택할 고객사가 없습니다.<p>고객사 관리에서 첫 고객사를 추가하세요.</p><button class="button primary" data-view="clients">고객사 관리</button></section>`;
  if (store.dashboardLoading)
    return `${heading}<section class="report empty-state" role="status">고객사 통계를 불러오는 중…</section>`;
  if (store.dashboardError)
    return `${heading}${errorPanel(store.dashboardError, '고객사 통계를 불러오지 못했습니다')}`;

  const data = demo ? demoDashboard(client, store.properties, inspections) : store.dashboardData;

  return `${heading}${data && data.client.id === client.id ? dashboardContent(data) : '<section class="report empty-state">통계 새로고침으로 저장된 현황을 확인하세요.</section>'}`;
}
