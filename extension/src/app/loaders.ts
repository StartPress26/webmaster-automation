import { ApiError, asAppError } from '../errors.ts';
import { clientSelection } from '../dashboard.ts';
import { capturePublicationDraft } from './actions.ts';
import { applyAvailability } from './events.ts';
import { render } from './render.ts';
import { api, demo, property, store } from './store.ts';
import type { Client, InspectionTarget, Property, SiteRead } from '../types.ts';

// 서버에서 목록·설정·저장 결과를 읽어 store에 반영하는 함수들. 늦게 도착한 이전 요청의 응답은 버립니다.

// 고객사 전환 중 늦게 도착한 이전 고객사의 통계 응답은 무시합니다.
export async function loadDashboard(): Promise<void> {
  const version = ++store.dashboardVersion;
  const id = store.state.clientId;

  store.dashboardData = null;
  store.dashboardError = null;
  store.dashboardLoading = !demo && !!id;

  if (store.state.view === 'dashboard') render();

  if (demo || !id) return;

  try {
    const result = await api.getDashboard(id);

    if (version === store.dashboardVersion && id === store.state.clientId) {
      if (result.client.id !== id) throw new ApiError(0, '요청한 고객사와 통계 응답이 다릅니다.');
      store.dashboardData = result;
    }
  } catch (error: unknown) {
    if (version === store.dashboardVersion && id === store.state.clientId) store.dashboardError = asAppError(error);
  } finally {
    if (version === store.dashboardVersion && id === store.state.clientId) {
      store.dashboardLoading = false;
      if (store.state.view === 'dashboard') render();
    }
  }
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

// 선택 대상의 저장 결과를 읽고 이전 대상에 대한 늦은 응답은 무시합니다.
export async function loadStoredInspections(): Promise<void> {
  if (demo || !store.inspectionTargetId) return;

  const version = ++store.observationVersion;
  const id = store.inspectionTargetId;

  store.inspectionLoading = true;
  store.inspectionError = null;

  if (store.state.view === 'inspect') render();

  try {
    const rows = await api.getInspections(id);
    if (version === store.observationVersion && id === store.inspectionTargetId) store.storedInspections = rows;
  } catch (error: unknown) {
    if (version === store.observationVersion && id === store.inspectionTargetId)
      store.inspectionError = asAppError(error);
  } finally {
    if (version === store.observationVersion && id === store.inspectionTargetId) {
      store.inspectionLoading = false;
      if (store.state.view === 'inspect') render();
    }
  }
}

// 메인페이지와 저장된 글 목록을 읽고 검색엔진 호출 없이 조회 대상을 준비합니다.
export async function loadInspectionTargets(): Promise<void> {
  if (demo) return;

  const version = ++store.targetsVersion;

  ++store.observationVersion;

  const site = property();
  const oldTargetId = store.inspectionTargetId;

  store.inspectionTargetId = site.id;
  store.storedInspections = [];
  store.inspectionLoading = false;
  store.targetsLoading = true;
  store.targetsError = null;
  store.inspectionError = null;
  store.inspectionTargets = site.id
    ? [{ id: site.id, name: site.name, url: site.siteUrl, active: site.active, type: 'site' }]
    : [];

  if (store.state.view === 'inspect') render();

  if (!site.id) {
    store.targetsLoading = false;
    if (store.state.view === 'inspect') render();
    return;
  }

  try {
    const pages = await api.listPages(site.id);
    if (version !== store.targetsVersion || site.id !== store.state.propertyId) return;
    store.inspectionTargets = [
      ...store.inspectionTargets,
      ...pages.map(
        (page): InspectionTarget => ({
          id: page.id,
          name: page.name,
          url: page.url,
          active: page.is_active,
          type: 'page',
        }),
      ),
    ];
    store.inspectionTargetId = store.inspectionTargets.some(
      (target: InspectionTarget): boolean => target.id === oldTargetId,
    )
      ? oldTargetId
      : site.id;
  } catch (error: unknown) {
    if (version === store.targetsVersion && site.id === store.state.propertyId)
      store.targetsError = asAppError(error);
  } finally {
    if (version === store.targetsVersion && site.id === store.state.propertyId) {
      store.targetsLoading = false;
      if (store.state.view === 'inspect') render();
    }
  }

  if (version === store.targetsVersion && site.id === store.state.propertyId) await loadStoredInspections();
}

// 현재 사이트의 설정을 조회하고 이전 사이트의 늦은 응답은 무시합니다.
export async function loadSettings(): Promise<void> {
  if (demo || !property().id) return;

  const version = ++store.settingsRequest;
  const id = property().id;

  store.settingsLoading = true;
  store.settingsError = null;

  if (store.state.view === 'notify') {
    capturePublicationDraft();
    render();
  }

  try {
    const settings = await api.getSettings(id);
    if (version !== store.settingsRequest || id !== store.state.propertyId) return;
    store.properties = store.properties.map(
      (item: Property): Property => (item.id === id ? { ...item, indexNow: settings } : item),
    );
  } catch (error: unknown) {
    if (version !== store.settingsRequest || id !== store.state.propertyId) return;
    store.settingsError = asAppError(error);
  } finally {
    if (version === store.settingsRequest && id === store.state.propertyId) {
      capturePublicationDraft();
      store.settingsLoading = false;
      if (store.state.view === 'notify') render();
      else applyAvailability();
    }
  }
}

// 계정 목록 조회 실패를 빈 목록과 구분하고 등록 폼의 다른 입력은 보존합니다.
export async function loadAuthAccounts(): Promise<void> {
  if (demo || store.authAccountsLoading) return;
  store.authAccountsLoading = true;
  store.authAccountsError = null;
  if (store.state.view === 'register' || (store.state.view === 'clients' && store.accountEditor)) render();
  try {
    store.authAccounts = await api.listAuthAccounts();
  } catch (error: unknown) {
    store.authAccountsError = asAppError(error);
  } finally {
    store.authAccountsLoading = false;
    if (store.state.view === 'register' || (store.state.view === 'clients' && store.accountEditor)) render();
  }
}

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
    store.clients = result.map(
      (item): Client => ({ id: item.id, name: item.name, manager: item.manager_name ?? '' }),
    );
    store.properties = siteLists.flat().map(mapSite);

    const clientId = store.clients.some((item): boolean => item.id === store.state.clientId)
      ? store.state.clientId
      : (store.clients[0]?.id ?? '');

    store.state = { ...store.state, ...clientSelection(store.properties, clientId, store.state.propertyId) };
  } catch (error: unknown) {
    store.loadError = asAppError(error);
  } finally {
    store.loading = false;
    render();
  }

  if (!store.loadError) await Promise.all([loadSettings(), loadInspectionTargets(), loadDashboard()]);
}
