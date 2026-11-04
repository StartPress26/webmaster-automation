# 사이트맵 제출 API

`POST /sites/{main_site_id}/sitemaps`

기존 메인 사이트의 공개 사이트맵 주소를 Google 또는 Bing에 한 번 제출한다.
신규 도메인 등록·소유권 확인·사이트맵 파일 생성 및 갱신은 수행하지 않는다.
서버에 설정된 Google OAuth 계정 또는 Bing API 키에 대상 사이트 권한이 필요하다.

## 요청

경로의 `main_site_id`는 우리 DB의 메인 사이트 UUID다. 개별 글 ID는 허용하지 않는다.

```json
{
  "engine": "google",
  "sitemap_url": "https://example.com/sitemap.xml"
}
```

- 두 필드 모두 필수다. `engine`은 `google` 또는 `bing`이며 추가 필드는 거부한다.
- URL은 인증정보·프래그먼트·공백·모호한 경로 인코딩 없는 HTTP(S) 주소여야 한다.
- 정규화 후 UTF-8 기준 최대 2,048바이트다.
- 사이트맵은 메인 사이트와 같은 스킴·호스트·유효 포트 및 하위 경로에 있어야 한다.
- Google은 쿼리 없이 `/`로 끝나는 URL-prefix 속성을 지원한다.
- 이 API의 Bing 지원 범위는 쿼리·하위 경로 없는 루트 사이트다.
- 사이트맵 내용에 새 글이 포함되어 있는지는 검사하지 않는다. CMS에서 먼저 갱신해야 한다.

## 성공 응답 — 200

```json
{
  "main_site_id": "00000000-0000-4000-8000-000000000001",
  "engine": "google",
  "sitemap_url": "https://example.com/sitemap.xml",
  "status": "accepted"
}
```

`accepted`는 검색엔진이 제출 요청을 접수했다는 뜻이며 사이트맵 다운로드·파싱·글 수집·색인
완료를 의미하지 않는다. 화면에는 ‘사이트맵 제출 접수 완료’로 표시한다.

## 오류

| HTTP | 코드 | 의미 |
|---|---|---|
| 404 | `MAIN_SITE_NOT_FOUND` | 메인 사이트 없음 또는 개별 글 ID |
| 409 | `SITE_INACTIVE` | 비활성 사이트 |
| 422 | `INVALID_SITEMAP_SCOPE` | 사이트 범위 밖 또는 엔진이 지원하지 않는 속성 |
| 422 | FastAPI 검증 오류 | UUID·필수값·엔진·URL·추가 필드 오류 |
| 429 | `ENGINE_RATE_LIMIT` | 엔진 제출 한도 초과 |
| 502 | `ENGINE_PERMISSION` | 엔진 사이트 접근 권한 없음 |
| 502 | `ENGINE_CONNECTION` | 통신 오류 |
| 502 | `ENGINE_RESPONSE` | 정상 접수 응답 확인 불가 |
| 503 | `ENGINE_AUTHENTICATION` | 서버 인증 설정·토큰·키 확인 필요 |
| 504 | `ENGINE_TIMEOUT` | 요청 시간 초과 |

서비스 오류 형식:

```json
{
  "detail": {
    "code": "MAIN_SITE_NOT_FOUND",
    "message": "메인 사이트를 찾을 수 없습니다."
  }
}
```

통신 오류·시간 초과에서는 이미 접수됐을 가능성이 있으므로 접수 실패로 단정하지 않는다.
자동 재시도는 하지 않는다. 인증정보나 외부 응답 원문은 오류 응답에 포함하지 않는다.

## 저장·실행 범위

- 조회 트랜잭션을 종료한 뒤 외부 엔진을 호출한다.
- Google 동기 작업은 스레드풀에서 실행하고 인증 토큰 갱신 잠금은 기존 검사와 공유한다.
- Google 세션·Bing HTTP 클라이언트는 성공·실패 모두 종료한다.
- 제출 이력·사이트맵 설정·색인 상태를 DB에 저장하지 않는다. 신규 마이그레이션은 없다.
- 기존 `/pages`의 IndexNow 발행 알림과 `/inspections`의 상태 검사는 그대로 사용한다.
- 프론트 색인 상태 확인 화면의 ‘색인 상태 조회’ 옆 ‘사이트맵 제출’ 버튼에서 연결한다.
- 선택한 Google·Bing 엔진과 메인 사이트를 표시하고, 수정 가능한 사이트맵 URL을 입력받는다.
- 개별 글 선택과 관계없이 메인 사이트 ID로 제출한다. 네이버·미선택·비활성 사이트는 제출을 막는다.
- 제출 중 중복 실행을 막고, 오류 시 입력을 유지한다. 예시 모드는 실제 요청을 보내지 않는다.
