# IndexNow 설정 API

기존 메인 사이트의 IndexNow 설정을 조회하거나 추가·교체합니다. 사이트 등록 시 설정 저장 기능은 유지합니다.
외부 검색엔진 호출, 키 생성, 파일 배포·접근 확인, 화면 버튼은 이번 범위에 포함하지 않습니다.
DB 컬럼은 기존 Alembic 0002를 사용하므로 새 마이그레이션이 필요하지 않습니다.

## PUT /sites/{main_site_id}/indexnow-settings

```json
{
  "key": "0123456789abcdef0123456789abcdef",
  "key_location": "https://example.com/0123456789abcdef0123456789abcdef.txt"
}
```

두 필드는 필수입니다. 기존 IndexNow 스키마로 키 형식, 파일 주소, 사이트와의 호스트·경로 범위를 검증합니다.
키 파일은 대상 사이트에 사람이 배포해야 합니다. 저장 성공은 배포 또는 소유권 확인을 의미하지 않습니다.

성공 응답은 신규·교체 모두 200입니다.

```json
{
  "configured": true,
  "key_location": "https://example.com/0123456789abcdef0123456789abcdef.txt"
}
```

사이트 행 잠금으로 같은 사이트의 변경을 직렬화합니다. Naver·Bing 두 행을 같은 트랜잭션에서 upsert하고,
기존 행에서는 키·파일 주소만 변경합니다. 등록 상태·확인 시각·오류 기록은 보존합니다.
한 행만 존재하면 다른 행을 생성하며, 저장 실패 시 전체 트랜잭션을 롤백합니다.

## GET /sites/{main_site_id}/indexnow-settings

두 엔진의 완전한 설정이 일치하면 위 성공 응답을 반환합니다.
설정 행이 없거나 저장된 대상 엔진 행의 키·주소가 모두 NULL이면 아래 응답을 반환합니다.

```json
{"configured": false, "key_location": null}
```

한 엔진만 설정되거나 키·파일 주소가 불완전하거나 엔진 간 값이 다르면 409입니다.
PUT으로 두 엔진 설정을 함께 복구할 수 있습니다. GET은 외부 API를 호출하지 않습니다.
키 원문은 성공 응답과 이 라우터의 입력 검증 오류 응답에서 제외합니다.
키 파일 주소 자체는 키 문자열을 포함할 수 있는 공개 주소입니다.

## 오류

| HTTP | 코드·형태 | 의미 |
|---|---|---|
| 404 | MAIN_SITE_NOT_FOUND | 없는 사이트 또는 메인 사이트가 아닌 글 |
| 409 | INDEXNOW_SETTINGS_INCONSISTENT | 기존 엔진 설정 불일치·불완전 |
| 422 | INVALID_INDEXNOW_SCOPE | 메인 사이트와 키 파일의 호스트·경로 불일치 |
| 422 | detail 배열 | UUID·필드 형식·필수 입력 검증 실패 |

서비스 오류는 `{"detail":{"code":"...","message":"..."}}`입니다.
입력 검증 오류 배열에는 `loc`, `type`, `msg`만 포함하며 입력값·예외 문맥은 제외합니다.
