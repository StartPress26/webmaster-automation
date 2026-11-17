import { ApiError, asAppError } from '../errors.ts';
import { clientSelection } from '../dashboard.ts';
import { capturePublicationDraft } from './actions.ts';
import { applyAvailability } from './events.ts';
import { render } from './render.ts';
import { api, demo, property, store } from './store.ts';
import type { Client, ClientRead, InspectionTarget, PageRead, Property, SiteRead, View } from '../types.ts';

// 서버에서 목록·설정·저장 결과를 읽어 store에 반영하는 함수들.
// 각 함수는 요청 번호(version)와 당시 선택(id)을 기억해 두고, 응답이 왔을 때 아직 같은 요청·같은 선택일 때만 반영합니다.
// 그래서 고객사나 사이트를 빠르게 바꿔도 늦게 도착한 이전 응답이 화면을 덮어쓰지 않습니다.

// ─────────────────────────────────────────────────────────────
// 공용 도우미
// ─────────────────────────────────────────────────────────────

// 지금 그 화면을 보고 있을 때만 다시 그립니다.
function renderIfViewing(view: View): void {
  if (store.state.view === view) render();
}

// API 필드를 화면 모델로 변환하고 키 원문은 보관하지 않습니다.
export function mapSite(item: SiteRead): Property {
  return {
    id: item.id,
    clientId: item.client_id,
    name: item.name,
    origin: new URL(item.url).origin,
    siteUrl: item.url,
    active: item.is_active,
    owned: item.owner_type === 'internal',
    indexNow: null,
    googleAccountEmail: item.google_account_email ?? null,
    bingAccountEmail: item.bing_account_email ?? null,
    naverAccountEmail: item.naver_account_email ?? null,
  };
}

// 고객사 응답을 화면 모델로 바꿉니다.
function mapClient(item: ClientRead): Client {
  return { id: item.id, name: item.name, manager: item.manager_name ?? '' };
}

// 메인 사이트를 조회 대상 항목으로 바꿉니다.
function siteTarget(site: Property): InspectionTarget {
  return { id: site.id, name: site.name, url: site.siteUrl, active: site.active, type: 'site' };
}

// 글을 조회 대상 항목으로 바꿉니다.
function pageTarget(page: PageRead): InspectionTarget {
  return { id: page.id, name: page.name, url: page.url, active: page.is_active, type: 'page' };
}

// ─────────────────────────────────────────────────────────────
// 대시보드
// ─────────────────────────────────────────────────────────────

// 고객사 전환 중 늦게 도착한 이전 고객사의 통계 응답은 무시합니다.
export async function loadDashboard(): Promise<void> {
  store.dashboardVersion += 1;
  const version = store.dashboardVersion;
  const id = store.state.clientId;
  const isCurrent = (): boolean => version === store.dashboardVersion && id === store.state.clientId;

  store.dashboardData = null;
  store.dashboardError = null;
  store.dashboardLoading = !demo && Boolean(id);
  renderIfViewing('dashboard');

  if (demo || !id) return;

  try {
    const result = await api.getDashboard(id);
    if (isCurrent()) {
      if (result.client.id !== id) throw new ApiError(0, '요청한 고객사와 통계 응답이 다릅니다.');
      store.dashboardData = result;
    }
  } catch (error: unknown) {
    if (isCurrent()) store.dashboardError = asAppError(error);
  } finally {
    if (isCurrent()) {
      store.dashboardLoading = false;
      renderIfViewing('dashboard');
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 색인 조회 대상과 저장 결과
// ─────────────────────────────────────────────────────────────

// 선택 대상의 저장 결과를 읽고 이전 대상에 대한 늦은 응답은 무시합니다.
export async function loadStoredInspections(): Promise<void> {
  if (demo || !store.inspectionTargetId) return;

  store.observationVersion += 1;
  const version = store.observationVersion;
  const id = store.inspectionTargetId;
  const isCurrent = (): boolean => version === store.observationVersion && id === store.inspectionTargetId;

  store.inspectionLoading = true;
  store.inspectionError = null;
  renderIfViewing('inspect');

  try {
    const rows = await api.getInspections(id);
    if (isCurrent()) store.storedInspections = rows;
  } catch (error: unknown) {
    if (isCurrent()) store.inspectionError = asAppError(error);
  } finally {
    if (isCurrent()) {
      store.inspectionLoading = false;
      renderIfViewing('inspect');
    }
  }
}

// 조회 대상 목록을 선택 사이트의 메인페이지만 담은 초기 상태로 되돌립니다.
function resetInspectionTargets(site: Property): void {
  store.inspectionTargetId = site.id;
  store.storedInspections = [];
  store.inspectionLoading = false;
  store.targetsLoading = true;
  store.targetsError = null;
  store.inspectionError = null;
  store.inspectionTargets = site.id ? [siteTarget(site)] : [];
}

// 메인페이지와 저장된 글 목록을 읽고 검색엔진 호출 없이 조회 대상을 준비합니다.
export async function loadInspectionTargets(): Promise<void> {
  if (demo) return;

  store.targetsVersion += 1;
  const version = store.targetsVersion;
  // 대상 목록이 바뀌면 이전 저장 결과 요청도 무효가 됩니다.
  store.observationVersion += 1;

  const site = property();
  const oldTargetId = store.inspectionTargetId;
  const isCurrent = (): boolean => version === store.targetsVersion && site.id === store.state.propertyId;

  resetInspectionTargets(site);
  renderIfViewing('inspect');

  if (!site.id) {
    store.targetsLoading = false;
    renderIfViewing('inspect');
    return;
  }

  try {
    const pages = await api.listPages(site.id);
    if (!isCurrent()) return;

    store.inspectionTargets = [...store.inspectionTargets, ...pages.map(pageTarget)];
    // 이전에 보던 대상이 새 목록에도 있으면 그 선택을 유지합니다.
    const keepOld = store.inspectionTargets.some((target: InspectionTarget): boolean => target.id === oldTargetId);
    store.inspectionTargetId = keepOld ? oldTargetId : site.id;
  } catch (error: unknown) {
    if (isCurrent()) store.targetsError = asAppError(error);
  } finally {
    if (isCurrent()) {
      store.targetsLoading = false;
      renderIfViewing('inspect');
    }
  }

  if (isCurrent()) await loadStoredInspections();
}

// ─────────────────────────────────────────────────────────────
// IndexNow 설정·인증 계정
// ─────────────────────────────────────────────────────────────

// 현재 사이트의 설정을 조회하고 이전 사이트의 늦은 응답은 무시합니다.
export async function loadSettings(): Promise<void> {
  if (demo || !property().id) return;

  store.settingsRequest += 1;
  const version = store.settingsRequest;
  const id = property().id;
  const isCurrent = (): boolean => version === store.settingsRequest && id === store.state.propertyId;

  store.settingsLoading = true;
  store.settingsError = null;
  if (store.state.view === 'notify') {
    capturePublicationDraft();
    render();
  }

  try {
    const settings = await api.getSettings(id);
    if (!isCurrent()) return;
    store.properties = store.properties.map(
      (item: Property): Property => (item.id === id ? { ...item, indexNow: settings } : item),
    );
  } catch (error: unknown) {
    if (!isCurrent()) return;
    store.settingsError = asAppError(error);
  } finally {
    if (isCurrent()) {
      capturePublicationDraft();
      store.settingsLoading = false;
      if (store.state.view === 'notify') render();
      else applyAvailability();
    }
  }
}

// 등록 화면이거나 고객사 화면에서 계정을 편집 중이면 계정 목록 변화를 바로 그립니다.
function renderIfAccountsVisible(): void {
  const editing = store.state.view === 'clients' && store.accountEditor;
  if (store.state.view === 'register' || editing) render();
}

// 계정 목록 조회 실패를 빈 목록과 구분하고 등록 폼의 다른 입력은 보존합니다.
export async function loadAuthAccounts(): Promise<void> {
  if (demo || store.authAccountsLoading) return;

  store.authAccountsLoading = true;
  store.authAccountsError = null;
  renderIfAccountsVisible();

  try {
    store.authAccounts = await api.listAuthAccounts();
  } catch (error: unknown) {
    store.authAccountsError = asAppError(error);
  } finally {
    store.authAccountsLoading = false;
    renderIfAccountsVisible();
  }
}

// ─────────────────────────────────────────────────────────────
// 전체 목록
// ─────────────────────────────────────────────────────────────

// 고객사와 메인 사이트 목록을 서버에서 읽고 실패 시 예시 데이터로 대체하지 않습니다.
export async function loadWorkspace(): Promise<void> {
  if (store.loading && store.clients.length > 0) return;

  store.loading = true;
  store.loadError = null;
  render();

  try {
    const result = await api.listClients();
    const siteLists = await Promise.all(
      result.map((item): Promise<readonly SiteRead[]> => api.listSites(item.id)),
    );
    store.clients = result.map(mapClient);
    store.properties = siteLists.flat().map(mapSite);

    // 이전에 선택한 고객사가 아직 있으면 유지하고, 없으면 첫 고객사를 고릅니다.
    const stillExists = store.clients.some((item): boolean => item.id === store.state.clientId);
    const clientId = stillExists ? store.state.clientId : (store.clients[0]?.id ?? '');
    store.state = { ...store.state, ...clientSelection(store.properties, clientId, store.state.propertyId) };
  } catch (error: unknown) {
    store.loadError = asAppError(error);
  } finally {
    store.loading = false;
    render();
  }

  if (!store.loadError) await Promise.all([loadSettings(), loadInspectionTargets(), loadDashboard()]);
}
