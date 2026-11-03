# 수집·색인 상태 검사 API

같은 `/sites/{site_id}/inspections` 경로에서 POST는 외부 조회·DB 저장을,
GET은 DB에 저장된 엔진별 최신 상태 조회를 수행합니다. 검사 이력을 생성하는 API는 아닙니다.
`site_id`는 기존 sites 테이블의 메인 사이트 또는 개별 글 UUID입니다.

## POST /sites/{site_id}/inspections

```json
{"engine": "google"}
```

지원 엔진은 google·bing입니다. 글은 부모 메인 사이트의 URL을 엔진의 속성 URL로 사용합니다.
서버에서 기존 Google OAuth 토큰 또는 BING_API_KEY를 읽으며 요청 본문에는 키·URL을 받지 않습니다.
네이버·Brave 또는 추가 필드는 422로 거절합니다.

성공 응답은 200입니다.

```json
{
  "site_id": "66be81b6-b6c7-46f8-b385-a3d607a86e90",
  "engine": "google",
  "index_status": "indexed",
  "last_checked_at": "2026-11-03T05:00:00Z",
  "next_check_at": null,
  "error_message": null
}
```

- Google은 기존 엔진의 unknown·crawled·indexed·not_indexed 판정을 저장합니다.
- Bing은 기존 엔진의 unknown·crawled 판정만 저장합니다. IsPage·HTTP 200으로 색인을 추정하지 않습니다.
- last_checked_at은 마지막 성공 관측 시각입니다. next_check_at은 기존 값을 보존하며 예약 실행을 추가하지 않습니다.
- Google 속성 URL은 쿼리 없이 /로 끝나야 합니다. Bing은 쿼리·하위 경로 없는 루트 사이트만 지원합니다.
- 글은 부모와 고객사·소유 구분이 같고 동일 출처·허용 경로 안에 있어야 합니다.
- 대상·부모가 비활성이면 새 검사를 실행하지 않습니다.
- 외부 조회 중에는 DB 트랜잭션을 열어두지 않습니다. Google의 동기 인증·조회는 스레드에서 실행합니다.
- 조회 결과는 기존 site_engine_statuses에 저장합니다. 제출·사이트 등록·사이트맵 갱신은 실행하지 않습니다.

## GET /sites/{site_id}/inspections

```json
{
  "items": [
    {
      "site_id": "66be81b6-b6c7-46f8-b385-a3d607a86e90",
      "engine": "google",
      "index_status": "indexed",
      "last_checked_at": "2026-11-03T05:00:00Z",
      "next_check_at": null,
      "error_message": null
    }
  ]
}
```

엔진 이름 순으로 저장된 최신 상태를 반환합니다. 아직 저장된 행이 없으면 items=[]입니다.
비활성 대상도 기존 저장 결과를 읽을 수 있으며 없는 대상은 404입니다.
인증 파일 로드·외부 엔진 호출·상태 갱신은 하지 않습니다.
기존 테이블에 다른 엔진 상태가 있다면 함께 반환하지만 POST 지원 엔진이 늘어나는 것은 아닙니다.

## 실패와 상태 보존

외부 조회 오류는 기존 index_status·last_checked_at·next_check_at을 유지하고 안전한 오류 메시지만 저장합니다.
성공 관측이 없는 첫 실패는 unknown·last_checked_at=null로 저장합니다.
오류를 not_indexed로 바꾸지 않습니다. 이후 성공하면 오류 메시지를 지웁니다.
원본 키·토큰·응답 본문은 오류 응답과 저장 메시지에 포함하지 않습니다.

| HTTP | 코드 | 의미 |
|---|---|---|
| 404 | TARGET_NOT_FOUND | 대상·부모 없음 |
| 409 | SITE_INACTIVE | 대상 또는 부모 비활성 |
| 422 | INVALID_INSPECTION_SCOPE 또는 요청 검증 오류 | URL 범위·엔진·입력 오류 |
| 429 | ENGINE_RATE_LIMIT | 엔진 호출 한도 |
| 502 | ENGINE_PERMISSION / ENGINE_CONNECTION / ENGINE_RESPONSE | 외부 접근 권한·통신·응답 오류 |
| 503 | ENGINE_AUTHENTICATION | 서버의 엔진 인증 설정 확인 필요 |
| 504 | ENGINE_TIMEOUT | 외부 조회 시간 초과 |

서비스 오류 응답은 `{"detail":{"code":"...","message":"..."}}`입니다.

## 범위와 검증

DB 구조 변경은 없습니다. 상세 canonical·크롤링 시각 등 엔진 원본 상세 필드는 이번 API에서 저장·노출하지 않고
기존 테이블의 요약 상태를 사용합니다. 검사 이력·스케줄러·자동 재시도·화면 연결은 이번 범위에 포함하지 않습니다.
동시 성공 관측은 checked_at이 오래된 결과가 최신 결과를 덮어쓰지 않도록 저장합니다.

임시 PostgreSQL과 모의 엔진으로 메인페이지·글의 조회·독립 DB 저장·엔진별 분리,
오류 시 이전 상태 보존·복구·최초 실패·GET 외부 호출 없음·입력·활성·범위 검증을 확인했습니다.
Google 스레드 실행·인증 오류 비공개·엔진 세션 및 HTTP 클라이언트 정리도 검증했습니다.
실제 외부 검색엔진 조회는 실행하지 않았습니다.
