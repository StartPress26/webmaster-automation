import { createApi } from '../api';
import type { ApiError } from '../errors';
import type { FormDrafts } from '../forms';
import { initialClients, initialInspections, initialProperties } from '../mocks/data';
import type {
  Activity,
  AppState,
  AuthAccountRead,
  Client,
  ClientDashboard,
  Engine,
  Inspection,
  InspectionRead,
  InspectionTarget,
  PageOutcome,
  Property,
  SiteAuthAccounts,
} from '../types';
import { emptyProperty } from './constants.ts';

// 관리 화면 전체가 공유하는 가변 상태를 한곳에 모았습니다.
// 여러 파일이 같은 값을 읽고 바꾸므로 ES 모듈의 export let 대신 객체 하나(store)의 필드로 둡니다.

// ─────────────────────────────────────────────────────────────
// 환경
// ─────────────────────────────────────────────────────────────

// 주소에 ?mode=demo가 있으면 서버 없이 예시 데이터로 동작합니다.
export const demo = new URLSearchParams(window.location.search).get('mode') === 'demo';
// FastAPI 서버 클라이언트
export const api = createApi();

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('화면을 표시할 요소가 없습니다.');
// 화면 전체를 그리는 루트 요소
export const app: HTMLDivElement = root;

// 데모 모드의 색인 검사 예시 데이터 (API 모드에서는 쓰지 않음)
export const inspections: readonly Inspection[] = initialInspections;

// ─────────────────────────────────────────────────────────────
// 상태 타입
// ─────────────────────────────────────────────────────────────

// 고객사 관리 화면에서 사이트 계정을 편집 중일 때의 정보
export interface AccountEditor {
  readonly siteId: string;
  readonly clientId: string;
  readonly formId: string;
  readonly original: SiteAuthAccounts;
}

// 사이트맵 제출 결과 안내
export interface SitemapFeedback {
  readonly siteId: string;
  readonly engine: Engine;
  readonly message: string;
  readonly failed: boolean;
}

// 화면 전체의 가변 상태. 모든 필드는 다시 그릴 때 읽히고, 사용자 동작·서버 응답으로 바뀝니다.
export interface AppStore {
  // 목록 데이터
  clients: readonly Client[];
  properties: readonly Property[];
  activities: readonly Activity[];
  // 현재 화면·선택
  state: AppState;
  // 대시보드
  dashboardData: ClientDashboard | null;
  dashboardLoading: boolean;
  dashboardError: ApiError | null;
  dashboardVersion: number;
  // 고객사·사이트 목록 로딩
  loading: boolean;
  loadError: ApiError | null;
  // 인증 계정
  authAccounts: readonly AuthAccountRead[];
  authAccountsLoading: boolean;
  authAccountsError: ApiError | null;
  accountEditor: AccountEditor | null;
  accountEditorError: ApiError | null;
  // IndexNow 설정
  settingsLoading: boolean;
  settingsError: ApiError | null;
  settingsRequest: number;
  // 진행 중 표시 (저장·전송 중 입력 잠금)
  pending: boolean;
  // 글 발행 결과
  outcomes: readonly PageOutcome[];
  outcomeHistory: ReadonlyMap<string, readonly PageOutcome[]>;
  outcomesError: ApiError | null;
  uncertainSaves: ReadonlySet<string>;
  // 색인 조회 대상·저장 결과
  inspectionTargets: readonly InspectionTarget[];
  inspectionTargetId: string;
  storedInspections: readonly InspectionRead[];
  inspectionLoading: boolean;
  inspectionError: ApiError | null;
  // 발행 모달 포커스 관리
  completedPublicationScope: string;
  duplicateFocusKey: string;
  duplicateReturnFocusId: string;
  // 조회 대상 목록 로딩
  targetsLoading: boolean;
  targetsError: ApiError | null;
  targetsVersion: number;
  observationVersion: number;
  // 발행 폼 초안
  notificationDraft: string;
  notificationTitles: string;
  notifyEnabled: boolean;
  naverGuiEnabled: boolean;
  requestText: string;
  // 다시 그리기 전후 폼 입력 보존
  formDrafts: FormDrafts;
  renderedScope: string;
  // 사이트맵 패널
  sitemapOpen: boolean;
  sitemapFeedback: SitemapFeedback | null;
}

// ─────────────────────────────────────────────────────────────
// 초기 상태
// ─────────────────────────────────────────────────────────────

export const store: AppStore = {
  clients: demo ? initialClients : [],
  properties: demo ? initialProperties : [],
  activities: [],
  state: {
    view: 'dashboard',
    clientId: demo ? 'otter' : '',
    propertyId: demo ? 'otter-site' : '',
    engine: 'google',
    filter: 'all',
    route: 'direct',
    selectedId: null,
    mobileNav: false,
    notice: '',
  },
  dashboardData: null,
  dashboardLoading: false,
  dashboardError: null,
  dashboardVersion: 0,
  loading: !demo,
  loadError: null,
  authAccounts: [],
  authAccountsLoading: false,
  authAccountsError: null,
  accountEditor: null,
  accountEditorError: null,
  settingsLoading: false,
  settingsError: null,
  settingsRequest: 0,
  pending: false,
  outcomes: [],
  outcomeHistory: new Map(),
  outcomesError: null,
  uncertainSaves: new Set(),
  inspectionTargets: [],
  inspectionTargetId: '',
  storedInspections: [],
  inspectionLoading: false,
  inspectionError: null,
  completedPublicationScope: '',
  duplicateFocusKey: '',
  duplicateReturnFocusId: 'submit-pages',
  targetsLoading: false,
  targetsError: null,
  targetsVersion: 0,
  observationVersion: 0,
  notificationDraft: '',
  notificationTitles: '',
  notifyEnabled: true,
  naverGuiEnabled: false,
  requestText: '',
  formDrafts: new Map(),
  renderedScope: '',
  sitemapOpen: false,
  sitemapFeedback: null,
};

// ─────────────────────────────────────────────────────────────
// 상태를 읽는 도우미
// ─────────────────────────────────────────────────────────────

// 현재 선택한 사이트를 반환합니다.
export function property(): Property {
  return (
    store.properties.find(
      (item: Property): boolean => item.id === store.state.propertyId && item.clientId === store.state.clientId,
    ) ?? emptyProperty
  );
}

// 현재 고객사와 담당자 정보를 반환합니다.
export function selectedClient(): Client | undefined {
  return store.clients.find((item: Client): boolean => item.id === store.state.clientId);
}

// 작업 이력에 남길 현재 시각을 "YYYY.MM.DD HH:MM" 형식(한국 시간)으로 만듭니다.
function now(): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(new Date())
    .replaceAll('-', '.');
}

// 현재 속성과 검색엔진에 해당하는 예시 관측 기록을 반환합니다.
export function currentRows(): readonly Inspection[] {
  if (!demo) return [];
  return inspections.filter(
    (item: Inspection): boolean =>
      item.propertyId === store.state.propertyId && item.engine === store.state.engine,
  );
}

// 작업 이력으로 보존하는 최대 개수
const MAX_ACTIVITIES = 8;

// 작업 결과를 이력 맨 앞에 추가하고 오래된 것은 버립니다.
export function addActivity(label: string): void {
  store.activities = [{ label, time: now() }, ...store.activities].slice(0, MAX_ACTIVITIES);
}

// 선택한 메인페이지 또는 글의 검사 대상을 반환합니다.
export function inspectionTarget(): InspectionTarget | undefined {
  return store.inspectionTargets.find(
    (target: InspectionTarget): boolean => target.id === store.inspectionTargetId,
  );
}
