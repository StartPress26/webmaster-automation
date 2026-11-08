import type { InspectionRead } from '../types';

export const inspectionStatusNames: Readonly<Record<InspectionRead['index_status'], string>> = {
  unknown: '미확인',
  submitted: '알림 접수됨 · 이후 수집 여부 미확인',
  crawled: '크롤링 확인 · 색인 여부 미확인',
  indexed: '색인됨',
  not_indexed: '색인되지 않음',
  failed: '제출·조회 오류',
};

// 서버의 성공 관측 시각을 한국 시간으로 표시하며 누락값을 추정하지 않습니다.
export function inspectionTime(value: string | null): string {
  if (!value) return '성공 관측 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '시각 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(date);
}
