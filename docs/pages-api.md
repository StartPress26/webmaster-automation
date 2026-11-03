# 개별 글 등록·발행 알림

`POST /sites/{main_site_id}/pages` 한 번으로 글을 DB에 저장하고 기본으로 IndexNow 알림까지 실행합니다.
`main_site_id`는 이미 저장된 부모 메인 사이트의 UUID입니다. 별도 submissions API는 없습니다.

## 요청

```json
{
  "name": "첫 번째 글",
  "url": "https://example.com/posts/hello",
  "notify_search_engines": true
}
```

`notify_search_engines`는 생략하면 true이며 false이면 저장만 합니다.
글 URL은 부모의 출처(프로토콜·호스트·유효 포트)와 경로 범위 안에 있어야 합니다.
부모 메인페이지와 정확히 같은 URL은 거절합니다. URL의 쿼리는 유지합니다.
고객사·소유 구분·부모·대상 유형은 서버가 정하며 요청으로 받지 않습니다.

## 응답

글 저장에 성공하면 알림 성공·실패와 관계없이 HTTP 201을 반환합니다.

```json
{
  "page": {
    "id": "a4e9c493-4e20-441c-8af4-790e75f92a13",
    "client_id": "7496decc-8f30-4c94-9164-5c4d35fc72a2",
    "parent_site_id": "f37220c8-fc11-4221-9788-bd8bd2f02901",
    "target_type": "page",
    "owner_type": "internal",
    "name": "첫 번째 글",
    "url": "https://example.com/posts/hello",
    "is_active": true,
    "created_at": "2026-11-03T05:00:00Z"
  },
  "submission": {
    "protocol": "indexnow",
    "status": "accepted",
    "upstream_http_status": 200,
    "requested_at": "2026-11-03T05:00:00Z",
    "error_code": null
  }
}
```

| submission.status | 의미 |
|---|---|
| accepted | IndexNow HTTP 200 접수 |
| key_pending | IndexNow HTTP 202, 키 확인 중 |
| failed | 외부 HTTP 거절 또는 부모 설정 불일치·검증 실패 |
| unknown | 타임아웃·통신 오류로 접수 여부 불명 |
| skipped | 사용자가 알림 비활성화 또는 부모 키 미설정 |

알림 비활성은 `NOTIFICATION_DISABLED`, 키 미설정은 `INDEXNOW_NOT_CONFIGURED`,
키 불일치는 `INDEXNOW_SETTINGS_INCONSISTENT`, 키 범위·형식 오류는 `INVALID_INDEXNOW_SETTINGS`,
외부 거절은 `INDEXNOW_REJECTED`, 통신 오류는 `INDEXNOW_TIMEOUT` 또는 `INDEXNOW_TRANSPORT_ERROR`입니다.
HTTP 응답을 받지 못했거나 전송을 생략하면 upstream_http_status와 requested_at은 null입니다.

## 처리와 한계

- 부모를 공유 잠금으로 조회하고 활성 상태·글 URL 범위를 확인합니다.
- 부모의 고객사·소유 구분을 상속해 기존 sites 테이블에 target_type=page로 저장합니다.
- 글 저장을 커밋한 뒤 기존 notify_published_urls()로 공통 IndexNow에 한 번 제출합니다.
- 외부 호출 중에는 DB 트랜잭션을 열지 않습니다. 실패해도 글은 유지합니다.
- 알림 결과는 이번 응답에서 제공하며 별도 테이블·색인 상태에 저장하지 않습니다. 마이그레이션은 없습니다.
- IndexNow는 Naver·Bing 공통 알림이며 Google·Brave 제출은 포함하지 않습니다. 접수는 색인 완료가 아닙니다.
- 부모 없음·글을 부모로 지정하면 404, 비활성 부모·같은 고객사의 URL 중복은 409, 입력·범위 오류는 422입니다.
- 중복 요청은 글을 새로 만들거나 알림을 다시 보내지 않습니다. 시간 초과·요청 취소·프로세스 종료 시 저장만 됐을 수 있으므로 자동 재요청하지 않습니다.
- 글 목록 GET·화면 연결·알림 재시도 API·예약·제출 이력은 이번 범위에 포함하지 않습니다.
