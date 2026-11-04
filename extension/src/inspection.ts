import type { Engine, InspectionRead, InspectionTarget, Property } from './types';

export const inspectionStatusNames: Readonly<Record<InspectionRead['index_status'], string>> = {
  unknown: '미확인',
  submitted: '알림 접수됨 · 이후 수집 여부 미확인',
  crawled: '크롤링 확인 · 색인 여부 미확인',
  indexed: '색인됨',
  not_indexed: '색인되지 않음',
  failed: '제출·조회 오류',
};

// 미지원 엔진·비활성 대상·속성 범위 제한의 실행 불가 사유를 반환합니다.
export function inspectionUnavailable(engine: Engine, parent: Property, target: InspectionTarget | undefined): string {
  if (engine === 'naver') return '로그인된 서치어드바이저 작업 탭 연결을 준비 중입니다. 네이버 조회는 서버 API로 실행하지 않습니다.';
  if (!parent.id || !target) return '먼저 사이트와 검사할 페이지를 선택하세요.';
  if (!parent.active || !target.active) return '비활성 사이트·글은 저장 결과만 볼 수 있으며 새 조회는 실행할 수 없습니다.';
  const url = new URL(parent.siteUrl);
  if (engine === 'bing' && (url.pathname !== '/' || url.search)) return 'Bing API 조회는 하위 경로·쿼리가 없는 루트 사이트만 지원합니다.';
  if (engine === 'google' && (!url.pathname.endsWith('/') || url.search)) return 'Google 속성 URL은 쿼리 없이 /로 끝나야 합니다.';
  return '';
}

// 서버의 성공 관측 시각을 한국 시간으로 표시하며 누락값을 추정하지 않습니다.
export function inspectionTime(value: string | null): string {
  if (!value) return '성공 관측 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(date);
}
