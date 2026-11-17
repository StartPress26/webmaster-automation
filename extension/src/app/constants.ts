import type { IndexStatus, Property, View } from '../types.ts';

// 아이콘·화면 이름·상태 문구 등 바뀌지 않는 값

export type Icon =
  | 'dashboard'
  | 'menu'
  | 'search'
  | 'chevron'
  | 'globe'
  | 'plus'
  | 'send'
  | 'inspect'
  | 'users'
  | 'refresh'
  | 'external'
  | 'check'
  | 'clock'
  | 'info'
  | 'close'
  | 'arrow'
  | 'link'
  | 'mail';

const iconPaths: Record<Icon, string> = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="18" width="7" height="3" rx="1"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a19 19 0 0 1 0 18 19 19 0 0 1 0-18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  inspect:
    '<rect x="4" y="3" width="13" height="17" rx="2"/><path d="M8 7h5M8 11h3"/><circle cx="16" cy="16" r="4"/><path d="m19 19 3 3"/>',
  users:
    '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v2"/>',
  refresh:
    '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
  external:
    '<path d="M14 3h7v7m0-7L11 13M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  link: '<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 4 1-1a4 4 0 0 0 6-6l-1-1a4 4 0 0 0-6 0l-2 2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
};

export const viewTitles: Record<View, string> = {
  dashboard: '대시보드',
  inspect: '색인 상태 확인',
  register: '사이트 등록',
  notify: '새 글 발행 알림',
  clients: '고객사 관리',
};

export const statusNames: Record<IndexStatus, string> = {
  indexed: '색인됨',
  waiting: '수집 대기',
  crawled: '크롤링됨',
  not_indexed: '색인되지 않음',
};

export const emptyProperty: Property = {
  id: '',
  clientId: '',
  name: '사이트를 선택하세요',
  origin: '',
  siteUrl: '',
  owned: false,
  active: false,
  indexNow: null,
};

// 지정한 아이콘의 접근성 장식용 마크업을 반환합니다.
export function icon(name: Icon, className = ''): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
}
