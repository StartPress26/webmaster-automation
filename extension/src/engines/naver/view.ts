import { inspectionTime } from '../../inspection/format.ts';
import type { NaverPreviewState } from './preview';

// 사이트·입력 URL·오류 안내를 HTML에 안전하게 표시합니다.
function escape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char: string): string =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );
}

// 화면 관측은 저장된 색인 상태와 분리하고 URL 연결이 아직 미검증임을 명시합니다.
export function renderNaverPreview(
  scope: string,
  preview: NaverPreviewState | undefined,
  allowed: boolean,
): string {
  const observation = preview?.observation;

  return `<div class="naver-preview"><div class="naver-preview-heading"><h3>네이버 화면 관측 미리보기</h3><button class="inspection-text-button" id="read-naver-preview" data-scope="${escape(scope)}" ${!allowed || preview?.loading ? 'disabled' : ''}>${preview?.loading ? '화면 읽는 중…' : '현재 네이버 결과 읽기'}</button></div>
    <p class="field-help">네이버 탭에서 검증 → 색인 상태 확인을 열고 URL을 조회한 뒤 읽으세요. 결과는 서버에 저장하지 않습니다.</p>
    ${preview?.error ? `<p class="inspection-error" role="alert">${escape(preview.error)}</p>` : ''}
    ${
      observation
        ? `<div role="status"><p>${escape(observation.message)}</p><dl class="naver-preview-facts"><div><dt>현재 사이트</dt><dd>${escape(observation.siteUrl)}</dd></div><div><dt>입력창 URL</dt><dd>${escape(observation.inputUrl)}</dd></div><div><dt>화면을 읽은 시각</dt><dd>${escape(inspectionTime(observation.readAt))}</dd></div><div><dt>엔진 표시 업데이트</dt><dd>${escape(observation.engineUpdatedText ?? '표시 확인 안 됨')}</dd></div></dl>
      <p class="naver-preview-warning">기존 결과와 입력 URL의 연결·최신 조회 여부는 아직 검증하지 않았습니다. 이 미리보기로 색인 상태나 전체 조회 완료 건수를 변경하지 않습니다.</p></div>`
        : ''
    }
  </div>`;
}
