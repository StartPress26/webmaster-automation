# 작업 인계 문서

## 현재 인계 요약 — 2026-11-04 / Asia/Seoul

**새 세션은 이 절을 먼저 읽는다. 이 절과 맨 아래 최신 마지막 상태가 과거 스냅샷보다 우선한다. 아래 과거의 DB 0002·extension 미추적·사이트맵 API 미연결 설명은 현재 상태가 아니다.**

### 사용자의 작업 방식·확정 범위

- 한국어로 간결하게 설명하고, 사용자가 Python·FastAPI 코드를 한 함수씩 이해하며 진행하도록 지도한다. 사용자가 요청한 범위를 구현하며 부가 기능을 앞서 만들지 않는다.
- **현재 익스텐션은 이미 검색엔진에 등록되어 있고 서버 계정에 접근 권한이 있는 사이트를 대상으로 한다. 신규 도메인의 Google·Bing 사이트 등록·인증 파일 발급·소유권 확인 UI/API는 현재 범위에서 제외한다.** 기존 Python 어댑터는 보존한다.
- 새 글은 `POST /sites/{main_site_id}/pages` 한 번으로 DB 저장과 기본 IndexNow 알림을 처리한다. 별도 `/submissions` API·제출 이력 테이블은 복구하지 않는다.
- **사이트맵 제출은 `/pages`에 자동 연결하지 않는다.** 색인 상태 확인 화면에서 사용자가 별도 버튼으로 실행한다.
- 사이트맵 제출은 이미 공개된 글 목록 URL을 검색엔진에 알리는 기능이다. 새 글을 사이트맵에 반영하는 작업은 실제 블로그·CMS가 담당한다. 우리 DB 글 저장으로 블로그의 sitemap.xml이 바뀌지는 않는다. 글마다 사이트맵 재제출이 필수는 아니다.
- 접수 성공과 수집·색인 완료를 구분한다. `unknown`을 수집 대기·미색인으로 바꾸지 않는다. Bing 검사 결과는 현재 `crawled`·`unknown`만 판정한다.
- 한국어 `[타입] 제목`, Git 작성자 유지, 공동 작성자 트레일러 없음. main/master 직접 push 금지. 새 브랜치는 `feat/`·`fix/` 등 사용하며 `codex/` 접두사를 사용하지 않는다.

### 현재 Git 상태와 완료 기능

현재 브랜치는 **feat/chrome-extension**이다. 마지막 기능 커밋은 **037a394**, pgAdmin 구성 커밋은 **988fb0d**이며 이후 문서·main 동기화 커밋은 `git log -1`로 확인한다. 사용자는 남은 변경을 세 커밋으로 정리하고 이 브랜치를 push해 **main 대상 PR을 생성**하도록 요청했다. PR 병합은 요청하지 않았다.

| 커밋 | 기능 |
|---|---|
| 1cda961 | IndexNow 설정 조회·변경 PUT·GET |
| e4e2a54 | 개별 글 저장과 기본 IndexNow 알림 연결 |
| 0b4cf4b | Google·Bing 상태 검사 POST·GET과 DB 저장 |
| 730f7d0 | 부모 사이트별 글 목록 GET |
| f4283ba | 검색엔진 관리 프론트와 Chrome 확장 실행 구성 |
| 27a6b3a | 고객사별 대시보드와 블로그 선택 |
| afa2ef8 | Google·Bing 사이트맵 제출 API와 화면 연결 |
| 037a394 | 검사 오류 코드 저장·Google 인증 원인 세분화·0003 마이그레이션 |
| 988fb0d | pgAdmin Compose·환경변수 예시·실행 안내 |

- `POST·GET /clients`, `POST·GET /sites`: 고객사·메인 사이트의 DB 저장·목록. 사이트 정보 저장은 외부 검색엔진 등록·소유 확인을 수행하지 않는다.
- `GET /clients/{client_id}/dashboard`: 선택 고객사의 사이트·글 수, Google·Bing 저장 상태·오류·블로그별 통계. 외부 엔진을 호출하지 않는다. 첫 화면은 고객사 대시보드이며 소속 블로그 선택·초안 분리·이전 고객사의 늦은 응답 무시 기능이 있다.
- `PUT·GET /sites/{main_site_id}/indexnow-settings`: Naver·Bing 공통 설정 저장·조회. 키 원문 응답 제외, 불완전·불일치 조회는 409.
- `POST /sites/{main_site_id}/pages`: 글 저장 후 선택적 IndexNow 공통 알림. `notify_search_engines` 기본 true. 알림 실패에도 글은 보존하고 201의 `page`·`submission`으로 결과를 구분한다. 중복 409는 재전송하지 않는다.
- `GET /sites/{main_site_id}/pages`: 부모별 저장 글 목록, limit 1~100·offset 0 이상, 생성 시각·ID 정렬. 비활성 글도 조회한다.
- `POST /sites/{site_id}/inspections`: `engine=google|bing` 실제 상태 조회·요약 저장. 글은 부모 속성 사용. 외부 호출 전 DB 트랜잭션 종료, Google 동기 작업은 스레드 실행.
- `GET /sites/{site_id}/inspections`: 외부 호출 없이 저장된 최신 상태만 조회. 실패 시 이전 판정·성공 관측 시각 보존, 첫 실패는 unknown·last_checked_at=null.

### 이번 작업 — 사이트맵 API·프론트 완료

- **`POST /sites/{main_site_id}/sitemaps`**: 요청 `{"engine":"google","sitemap_url":"https://example.com/sitemap.xml"}`. Google 또는 Bing 하나에 기존 어댑터로 한 번 제출한다.
- 성공 HTTP 200: `main_site_id`, `engine`, `sitemap_url`, `status="accepted"`. 접수 성공이며 다운로드·파싱·글 수집·색인 완료가 아니다.
- 존재하는 활성 메인 사이트만 지원한다. 개별 글 ID·없는 ID는 404, 비활성은 409. 사이트맵은 같은 스킴·호스트·유효 포트와 하위 경로여야 한다. 입력·범위 오류 422, 한도 429, 엔진 오류 502, 인증 설정 503, 시간 초과 504.
- Google은 쿼리 없이 `/`로 끝나는 URL-prefix 속성, 이 API의 Bing 지원 범위는 쿼리·하위 경로 없는 루트 사이트다.
- 외부 제출 전 조회 트랜잭션 종료. Google 토큰 갱신 잠금은 기존 검사와 공유하며 동기 요청은 스레드풀 실행. Google·Bing 자원은 성공·실패 모두 정리한다. 자동 재시도 없음.
- 사이트맵 파일 생성·갱신·제출 이력·설정·색인 상태 DB 저장은 없다. 이 기능에 신규 마이그레이션은 필요 없다.
- 프론트 **색인 상태 확인 → 사이트·Google/Bing 선택 → ‘사이트맵 제출’ → URL 확인·수정 → 엔진에 제출** 흐름을 연결했다. 기존 ‘인덱스 업데이트’ 버튼은 오해를 줄이기 위해 **‘색인 상태 조회’**로 변경했다.
- 사이트맵 폼은 버튼 클릭으로 열리며 선택 엔진·메인 사이트를 표시한다. 개별 글을 선택해도 부모 메인 사이트 ID로 제출한다. 네이버·미선택·비활성 사이트에서는 제출 버튼을 막는다.
- 제출 중 중복 클릭 방지, 응답의 사이트·엔진·URL·accepted 검증, 실패 시 입력 유지, 다른 사이트·엔진에 이전 피드백을 섞지 않도록 처리했다. 예시 모드는 외부 요청하지 않는다.
- 성공 문구: **‘Google 사이트맵 제출 접수 완료. 수집·색인 반영에는 시간이 걸릴 수 있습니다.’** 사용자가 눈에 띄게 요청해 ‘색인됨’ 배지와 같은 초록색 **#27775f**로 변경했다. 실패 문구는 `inspection-error` 빨간색을 유지한다.
- 실패 메시지는 `extension/src/main.ts`의 `submitSitemap()` catch에서 조합한다. 인계 시 **868~872줄**, 872줄 `sitemapFeedback` 대입. 렌더는 `sitemapForm()`(약 242줄), 색상은 `styles.css`의 `.sitemap-feedback` 규칙(약 228~229줄). 줄 번호는 후속 수정으로 달라질 수 있다.
- 백엔드 원인별 고정 메시지는 `app/services/sitemap.py`의 `messages`(약 66줄). 프론트는 인증·권한·한도·URL 오류를 안내하고, 통신·시간 초과 등은 **‘접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.’**라고 표시한다.

### 남은 변경 정리와 PR 범위

- `037a394`: Google 인증 오류 세부 코드 전달, 검사 `error_code` 저장·조회·성공 시 초기화, 관련 테스트, **0003 마이그레이션 파일**, 검사 API 문서를 함께 커밋했다. 신규 환경에서는 API 실행 전에 `alembic upgrade head`가 필요하다.
- `988fb0d`: pgAdmin 서비스·전용 볼륨·로컬 5050 포트와 `.env.example`의 빈 로그인 설정, 실행 안내를 함께 커밋했다. Compose 전체 설정을 검증하므로 db만 시작해도 `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`가 필요하다. 실제 값은 `.env`에만 둔다.
- 세 번째 커밋은 `app/main.py`의 기존 라우터 설명과 이 인계 문서 정리다. 최신 main의 확장 전환 문서·README·실행 기록 규칙도 함께 반영하며 인계 문서 충돌을 해결한다.
- `main`과 비교한 PR에는 기존 IndexNow 설정·글 저장/목록·검사 API와 기본 프론트·대시보드·사이트맵 커밋도 포함된다. PR 제목·본문은 전체 변경 범위를 설명해야 한다.
- 최종 문서 커밋 이후 원격 상태·PR URL·충돌·검사 상태는 `gh pr view`와 `git status`로 확인한다. main 직접 push·자동 병합은 하지 않는다.
- 기존 AI 로그인봇 실험은 `feat/ai-login-bot`에 보존하며 이 브랜치에 가져오지 않는다. 실제 브라우저·확장 검증 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 민감값 없는 실행 기록을 비공개로 남긴다.

### 실제 개발 DB — 2026-11-04 재확인

- 인계 시 로컬 DB를 읽기 전용 SQL로 조회했다: **alembic_version=0003**, **site_engine_statuses.error_code 존재=true**.
- 따라서 과거의 ‘0002·error_code 없음’ 불일치는 현재 확인 결과와 다르다. 이 인계 요청에서 마이그레이션을 적용하거나 데이터를 변경하지 않았다.
- 0003 파일과 관련 코드도 이제 `037a394`에 커밋됐다. 개발 DB는 이미 0003이므로 임의 롤백·초기화하지 않는다. 이번 커밋·PR 검증에서는 개발 DB 마이그레이션을 재적용하지 않았다.

### 실행 환경·현재 프론트 구성

- Python은 Miniconda `startpress`, 직접 실행 시 `PYTHONNOUSERSITE=1`. `.venv` 생성·`uv sync`·`uv run` 금지.
- DB는 Docker `db` 서비스(PostgreSQL 18.6), 호스트 접근 `127.0.0.1:5432`. pgAdmin은 `http://127.0.0.1:5050/browser/`, 컨테이너에서 DB 호스트는 `db`다. 비밀값은 출력하지 않는다.
- 프론트 로컬 실행: 프로젝트의 `extension/`에서 `npm run dev` → `http://127.0.0.1:5173/`. 예시는 `/?mode=demo`. Vite의 `/api` 프록시가 FastAPI `127.0.0.1:8000`으로 전달한다.
- FastAPI 실행: `PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`. 중복 시작 전에 기존 포트 확인.
- **Manifest V3 실행 구성이 추가되어 있다.** `extension/public/manifest.json`, `src/background.ts`, `src/runtime.ts` 참조. `npm run build` 후 Chrome 개발자 모드에서 `extension/dist`를 압축해제 로드하면 아이콘 클릭으로 관리 탭을 연다. 확장에서는 로컬 API 8000으로 직접 요청한다.
- 빌드 후 확장 새로고침과 관리 탭 재열기가 필요하다. 네이버 탭 연결·Content Script·GUI 조회·팀원 로그인은 아직 구현하지 않았다. 자세한 실행법은 `extension/README.md`.

### 검증 근거·한계

- 이번 커밋·PR 정리 단계에서 **전체 백엔드 650 passed**를 다시 확인했다. 인증 오류 코드·저장·성공 시 초기화와 임시 PostgreSQL의 마이그레이션 upgrade/downgrade 검증을 포함한다.
- 프론트 **42 passed**, TypeScript·Vite 빌드 통과. 실제 화면 코드를 jsdom에서 실행한 고객사 전환·초안 분리·늦은 응답·사이트맵 이벤트와 접수 문구 검증을 포함한다. 현재 초록색 CSS 변경도 포함한 작업 트리에서 실행했다.
- `docker compose config --quiet`, 비밀값 없는 `.env.example`에 테스트용 환경변수를 주입한 Compose 설정 검증, `git diff --check`를 통과했다.
- 개발 DB 대신 UUID 이름의 임시 DB만 생성·삭제하고 외부 엔진은 모의 응답으로 검증했다. 실제 검색엔진 제출·상태 검사를 반복하지 않았다.
- 실제 브라우저 도구는 연결 불가였으므로 화면 배치·반응형 시각 검증은 하지 못했다. 팀원 인증·운영 배포·네이버 탭 연결은 구현 범위 밖이다.
- 이전 단계의 647개·609개 백엔드 및 28개·35개 프론트 수치는 각 커밋 사본 기준의 과거 기록이다. 최신 650개·42개와 합산하지 않는다.

### 다음 작업

1. main 대상 PR의 변경 범위·충돌·검사 상태를 확인하고 리뷰를 받는다. 사용자 요청은 PR 생성까지이며 병합은 하지 않는다.
2. 다음 핵심 기능이나 화면 개선은 사용자 요청에 따라 진행한다. 사이트맵은 이미 완료이며 `/pages` 자동 연결·신규 도메인 등록/소유 확인을 추가하지 않는다.
3. 네이버 GUI 조회·주기 검사·팀원 인증·운영 배포는 후속 범위다. 브라우저 작업을 재개할 때 main에서 합류한 실행 기록 규칙을 먼저 읽는다.

### 관련 파일

- 사이트맵: `app/api/sitemaps.py` → `app/services/sitemap.py` → `app/engines/sitemap.py` → 기존 `GoogleEngine.submit_sitemap()` / `BingEngine.submit_sitemap()`. 스키마 `app/schemas/sitemap.py`.
- 명세: [sitemaps-api.md](sitemaps-api.md), [dashboard-api.md](dashboard-api.md), [pages-api.md](pages-api.md), [inspections-api.md](inspections-api.md), [indexnow-settings-api.md](indexnow-settings-api.md).
- 프론트: `extension/src/main.ts`, `api.ts`, `types.ts`, `styles.css`, `errors.ts`, `forms.ts`, `dashboard.ts`.
- 테스트: `tests/test_sitemap_runner.py`, `tests/integration/test_sitemaps_api.py`, `extension/tests/sitemap.test.mjs`, `extension/tests/workspace.test.mjs`.
- DB 변경: `migrations/versions/0003_add_inspection_error_code.py`.
- `.env`·`.secrets/`·OAuth 토큰·API 키·기존 공개 검증 파일·개발 데이터를 보존한다. 비밀값을 문서에 옮기지 않는다.

## 과거 전환 결정 — 2026-11-03

이 절의 미구현 상태는 당시 기록이며 2026-11-04 최신 구현 요약이 우선한다.

아래 과거 인계보다 [Chrome 확장 프로그램 전환 결정](extension-transition.md)을 우선한다. 확장 프로그램은 아직 미구현이다. AI 로그인봇 실험은 `feat/ai-login-bot`에 보존하며 이 문서 PR에 코드·의존성을 포함하지 않는다. 설치형 앱 배포는 진행하지 않는다.

main에는 고객사/사이트 API·DB·Google/Bing API·IndexNow 서비스가 이미 있다. 다음 작업은 로그인된 기존 네이버 결과 탭 읽기부터 시작한다. 추가 실로그인은 자동 실행하지 않는다. 상세 실험 성공 범위와 인증 유지 실패의 원인 미확정 사항은 전환 문서를 확인한다.


---

## 최신 추가 진행 — 저장된 글 목록 GET / 2026-11-03

이 절은 아래 과거 기록의 ‘글 목록 GET 미구현’ 설명보다 우선한다.

- `GET /sites/{main_site_id}/pages` 추가. 기존 POST와 같은 경로에서 저장된 글 목록·ID를 items 배열로 반환한다.
- 부모가 메인 사이트인지 확인하고 parent_site_id·target_type=page·부모 client_id로 필터링한다. 생성 시각·ID 오름차순, limit 1~100(기본 100)·offset 0 이상(기본 0)을 지원한다.
- 비활성 부모·글도 조회 가능하다. 빈 목록은 200·items=[], 미존재 부모·글 ID를 부모로 지정한 경우 404, UUID·페이지 조건 오류는 422다.
- 외부 엔진·인증·IndexNow 클라이언트를 호출하지 않으며 마이그레이션은 없다.
- 관련 사이트 API 통합 테스트 **55 passed**, git diff --check 통과. 임시 DB에서만 검증했으며 실제 외부 호출·개발 데이터 추가는 하지 않았다.
- [pages-api.md](pages-api.md)에 GET 계약을 추가했다. 커밋·push는 아직 하지 않았으며 기존 extension/은 보존했다.

## 최신 추가 진행 — 수집·색인 상태 검사 POST·GET / 2026-11-03

이 절은 아래 과거의 ‘Google·Bing 상태 검사 FastAPI·DB 연결 미구현’ 설명보다 우선한다.

- 같은 `/sites/{site_id}/inspections`에 POST·GET을 구현했다. POST 본문은 `{"engine":"google"}` 또는 bing이며 기존 GoogleEngine.inspect_url·BingEngine.inspect_url을 호출하고 site_engine_statuses에 최신 요약 상태를 저장한다.
- GET은 엔진별 저장 상태만 읽으며 인증 준비·외부 호출을 하지 않는다. 대상이 존재하고 상태 행이 없으면 items=[]이다.
- 메인페이지·글 모두 지원하며 글은 부모 속성 URL을 사용한다. 부모 관계·고객사·소유 구분·활성 상태·출처·경로와 엔진별 지원 URL을 검증한다.
- Google 동기 인증·요청은 스레드풀에서 실행하고 Google 세션·Bing 클라이언트는 종료 시 정리한다. 토큰 갱신 파일 쓰기는 프로세스 내 잠금으로 직렬화한다.
- DB 트랜잭션은 외부 조회 중 열어두지 않는다. 성공 결과는 최신 checked_at 기준으로 upsert하고 실패는 기존 판정·확인 시각을 보존하며 안전한 오류만 저장한다. 첫 실패는 unknown·last_checked_at=null이다. 성공 재조회 시 오류를 지운다.
- 기존 0002 테이블만 사용해 마이그레이션은 없다. 상세 canonical·크롤링 시각 저장·검사 이력·예약·자동 재시도·프론트 연결은 이번 범위에 포함하지 않았다. Bing은 crawled·unknown만 판정한다.
- 전체 PostgreSQL 통합 포함 **599 passed**. 엔진 연결·스레드·자원 정리·GET 읽기 전용·오류 상태 보존·오래된 관측 차단·기존 기능 회귀를 확인했다. 실제 외부 조회·개발 DB 테스트 행 생성은 하지 않았다.
- 사용 명세: [inspections-api.md](inspections-api.md). 커밋·push는 아직 하지 않았고 기존 extension/은 보존했다.

## 최신 추가 진행 — 글 등록과 기본 발행 알림 / 2026-11-03

이 절은 아래 과거의 ‘개별 글 등록 미구현’·‘다음 작업은 별도 제출 API’ 설명보다 우선한다.

- 사용자 요청에 따라 별도 `/submissions` API·제출 이력 테이블 구현은 롤백했다. 개발 DB는 기존 0002이며 기존 데이터는 유지했다. 커밋된 IndexNow 설정 PUT·GET은 유지한다.
- `POST /sites/{main_site_id}/pages` 구현. 본문은 name·url·선택 notify_search_engines(기본 true). 한 요청으로 글을 저장한 뒤 기존 notify_published_urls()를 호출한다.
- 부모는 활성 메인 사이트여야 하며 글 URL의 출처·경로 범위를 확인한다. 고객사·소유 구분은 부모에서 가져오고 target_type=page·parent_site_id를 서버가 지정한다.
- 부모 IndexNow 설정은 같은 저장 트랜잭션에서 읽는다. 글을 커밋하고 트랜잭션·잠금을 해제한 뒤 공통 엔드포인트로 한 번 전송한다.
- 저장 성공은 HTTP 201. 응답은 page와 submission으로 나누며 알림은 accepted·key_pending·failed·unknown·skipped를 반환한다. 키 누락·불일치·외부 실패에도 글을 보존한다. notify_search_engines=false이면 저장만 한다.
- 중복 URL은 409이며 자동 재전송하지 않는다. 외부 알림 결과는 응답으로만 제공하고 별도 제출 테이블·기존 색인 관측값에 저장하지 않는다. 신규 마이그레이션은 없다.
- 전체 PostgreSQL 통합 포함 **567 passed**. 전송 전 글 커밋, 외부 실패 후 글 유지, DB 저장 실패 시 롤백·전송 차단, 동시 중복의 단일 저장·단일 전송, 부모 검증·URL 범위·입력 검증을 확인했다. 실제 외부 제출·개발 데이터 추가는 하지 않았다.
- 상세 사용법: [pages-api.md](pages-api.md). 글 목록 GET·화면 연결·재알림 API·예약·제출 이력은 이번 범위에 포함하지 않았다.
- 커밋·push는 하지 않았으며 기존 미추적 extension/은 보존했다.

## 최신 추가 진행 — IndexNow 설정 조회·교체 / 2026-11-03

이 절은 아래 과거 기록의 ‘기존 사이트의 IndexNow 설정 변경 미구현’ 설명보다 우선한다.

- `PUT /sites/{main_site_id}/indexnow-settings`, `GET /sites/{main_site_id}/indexnow-settings` 구현.
- PUT은 기존 스키마로 입력·사이트 범위를 검증하고 Naver·Bing 설정을 같은 트랜잭션에서 upsert한다. 사이트 행 잠금으로 같은 사이트의 변경을 직렬화한다. 기존 등록 상태·확인 시각·오류는 유지한다.
- GET은 미설정 시 `configured=false`, 완전한 두 엔진 설정이 일치하면 `configured=true`와 파일 주소를 반환한다. 불완전·불일치 설정은 409이며 PUT으로 복구한다.
- 없는 사이트·개별 글은 404. 키 원문은 성공 응답과 새 라우터의 검증 오류에서 제외한다. 공개 파일 주소 자체에는 키 문자열이 포함될 수 있다.
- 기존 컬럼을 사용하므로 새 마이그레이션은 없다. 외부 제출·파일 배포·화면 연결은 이번 범위에 포함하지 않았다.
- 검증: DB 없는 테스트 469 passed, 관련 사이트 API·서비스 PostgreSQL 통합 테스트 42 passed. 통합 테스트는 별도 임시 DB를 생성·삭제했으며 개발 DB 데이터는 변경하지 않았다.
- Docker Desktop과 기존 PostgreSQL 컨테이너를 시작했다. 실제 외부 검색엔진 호출·원격 push·커밋은 실행하지 않았다. 기존 미추적 `extension/`은 보존했다.
- 상세 계약: [indexnow-settings-api.md](indexnow-settings-api.md). 다음 작업은 DB 기반 URL 제출 서비스·API다.

## 현재 세션 인계 요약 — IndexNow / 2026-10-27

이 절과 마지막 상태가 아래의 과거 스냅샷보다 우선한다. Google 세션의 구현·보류 기록은 그대로 보존한다.

### 완료된 작업

- [x] `app/engines/indexnow/schemas.py`: Pydantic 불변 요청·응답, 공통 `IndexNowKey`·`IndexNowUrl`, 키 형식·호스트·적용 경로·URL 개수 검사, 중복 제거. 별도 types.py·validation.py는 schemas.py로 통합했다.
- [x] `client.py`: 외부에서 주입받은 httpx.AsyncClient로 공통 엔드포인트에 POST. urls→urlList, key_location→keyLocation 변환. 연결 10초, 읽기·쓰기·풀 대기 각각 30초. 리다이렉트·자체 재시도 없음. 200 접수 성공, 202 키 확인 중, 다른 HTTP 응답 실패. 타임아웃·통신 오류는 별도 예외이며 접수 여부를 단정하지 않는다.
- [x] Alembic `0002`로 engine_registrations에 nullable TEXT `indexnow_key`, `indexnow_key_location` 추가. 로컬 개발 DB 적용, 기존 데이터 보존·모델 일치 확인.
- [x] 사이트 폼·SiteCreate에 선택 키 설정 추가. 둘 다 생략 가능, 입력 시 두 값 필수. sites 저장값에서 두 필드를 제외하고 `services/engine_registration.py`에서 Naver·Bing 행을 생성한다. 같은 세션·트랜잭션을 사용하고 엔진 설정 실패 시 사이트도 롤백한다. 등록 상태는 unknown이며 실제 소유 확인을 의미하지 않는다.
- [x] PostgreSQL 통합 포함 전체 테스트 **284 passed**, JavaScript 구문 검사·git diff --check 통과. DB 없는 테스트는 **230 passed, 54 deselected**. 서로 다른 테스트 범위의 수치를 합산하지 않는다.
- [x] Notion의 DB 컬럼 표·설정 운영 규칙·사용자 입력 항목을 갱신했다. ‘개인용’ 연결을 사용하며 문서 주소는 아래 요구사항 원문을 따른다.

### 실제 Vercel 블로그 검증 및 남아 있는 데이터

- 대상: `https://otteru.vercel.app/`. 별도 블로그 저장소는 `/Users/kim-yudam/Desktop/study/sideProject/nextjs-notion-starter-kit`이다.
- 기존 `public/e142bcd0c702707f9db3194cd5ee9dd0.txt`를 재사용했다. 운영 파일 HTTP 200, UTF-8 텍스트·키 일치·로컬 파일과 일치를 확인했다. 새 파일 배포나 새 키 생성은 하지 않았다.
- **2026-10-27 19:09 KST** 테스트 실행에서 실제 앱의 POST /clients·POST /sites를 ASGITransport로 호출했다. 사이트 API 201 후 별도 DB 세션으로 Naver·Bing 설정을 재조회하고 기존 IndexNowClient로 메인 URL을 공통 엔드포인트에 **한 번 제출해 HTTP 200·accepted**를 확인했다.
- 개발 DB에는 고객사 **김유담 개인 블로그 테스트**, 사이트 **유담 블로그**가 남아 있다. 사용자의 실제 테스트 요청으로 생성한 데이터이므로 임의로 삭제·중복 생성하지 않는다.
- client_id: `a6eb3bdc-215f-48a5-b2b3-eab3b51af806`, site_id: `7d337e4c-bbd1-4172-8b4c-58fe77312943`.
- Naver·Bing registration_status는 unknown으로 유지했다. site_engine_statuses에 제출 결과를 저장하지 않았다. 실제 테스트 결과는 `outputs/indexnow-live-test-2026-10-27.json`에 있으며 키·토큰 값은 포함하지 않는다.
- 이 실험은 테스트용 실행으로 DB 조회와 외부 제출을 연결했다. **DB 설정 조회→제출 전용 제품 서비스·API·화면 버튼이 구현된 것은 아니다.** 실제 색인 완료나 Naver/Bing 각각의 수집 완료를 확인한 것도 아니다.

### 진행 중인 작업과 다음 구현 순서

1. 사용자가 제시한 네 커밋 구성을 승인해 `codex/indexnow-integration` 브랜치에서 실행했다. 아래 커밋 기록을 확인한다. 원격 push는 요청하지 않았고 실행하지 않았다.
2. 기존 사이트의 IndexNow 설정 추가·변경 API·화면. 두 엔진 설정은 하나의 트랜잭션에서 함께 갱신하고 이미 확인된 등록 상태를 unknown으로 되돌리지 않는다.
3. 사이트 ID로 DB의 URL·두 엔진 설정을 읽는 제출 서비스와 POST /sites/{site_id}/indexnow 같은 API·화면 버튼. 키 누락·설정 불일치는 전송 전에 차단한다. 같은 이벤트를 엔진별로 중복 제출하지 않는다.
4. 제출 결과의 저장 의미·오류 처리 계약을 먼저 정한다. 작업 재시도·관측 이력이 없는 현재 테이블만으로 정확히 한 번 실행이나 엔진별 색인 완료를 보장하지 않는다.
5. 실제 키 파일 설치 확인을 제품화할 때는 대상 URL·리다이렉트·DNS/IP 검증과 SSRF 방어를 별도 구현한다. 현재 등록 스키마는 형식·호스트·경로만 검사하며 외부 URL을 요청하지 않는다.
6. 개별 글 등록과 부모 설정 조회, Google 등록·검사 결과의 DB 연동, 워커·예약·이력은 별도 후속 작업이다. Google 절의 보류 요청을 유지한다.

### 승인한 커밋 구성과 실행 기록

1. `646155b` — `[feat] IndexNow 공통 제출 클라이언트와 스키마 구현`: app/engines/indexnow/, tests/test_indexnow_client.py, tests/test_indexnow_schemas.py, pyproject.toml, uv.lock.
2. `cf256d7` — `[feat] 검색엔진 등록 정보에 IndexNow 설정 컬럼 추가`: app/models/engine_registration.py, migrations/versions/0002_add_indexnow_settings.py, tests/integration/test_database_schema.py.
3. `383965f` — `[feat] 사이트 등록 시 IndexNow 설정 함께 저장`: app/schemas/site.py, app/services/site.py, app/services/engine_registration.py, app/static/index.html, app/static/admin.js, tests/test_site_schemas.py, tests/integration/test_site_service.py, tests/integration/test_sites_api.py, docs/site-admin.md.
4. `[docs] IndexNow 실사용 검증 결과와 작업 인계 갱신`: docs/HANDOFF.md, outputs/indexnow-live-test-2026-10-27.json. 이 인계 파일을 담은 문서 커밋이며 SHA는 git log에서 확인한다. 다른 세션의 진행 기록도 보존했다.

- 현재 작업 브랜치는 `codex/indexnow-integration`이다. 기존 main의 `1765f5b`에서 분기했으며 원격 push는 하지 않았다.
- 제외: 빈 app/engines/naver.py·bing.py·brave.py, 로컬 ERD 이미지·프롬프트, .env·.secrets/·캐시. 전체 git add를 사용하지 않고 파일별로 선별한다.
- 커밋 메시지는 한국어 `[타입] 제목`, Git 작성자 유지, 공동 작성자 트레일러 없음. main/master 직접 push 금지.

## 사이트 등록과 IndexNow 설정 저장 연결 — 2026-10-27

- 등록 화면과 `SiteCreate`에 선택 입력 `indexnow_key`, `indexnow_key_location`을 추가했다. 둘 다 생략할 수 있지만 설정 시에는 함께 입력하며 기존 IndexNow 스키마로 형식·호스트·경로를 검사한다.
- `services/engine_registration.py`의 `create_indexnow_registrations()`를 사이트 서비스에서 같은 DB 세션으로 호출한다. 키 설정이 있을 때만 Naver·Bing 행을 생성하고 `registration_status=unknown`으로 저장한다.
- `site.py`가 전체 트랜잭션을 관리하며 새 서비스는 별도로 커밋하지 않는다. 엔진 저장 오류 시 사이트와 설정이 함께 롤백된다. 사이트 응답·목록에는 키를 반환하지 않는다.
- 외부 키 파일 접근 확인·실제 엔진 등록·IndexNow 제출·기존 사이트의 키 설정 변경은 아직 연결하지 않았다. 아래 과거 기록의 ‘설정 저장 API 미구현’보다 이 상태가 최신이다.
- PostgreSQL 통합을 포함한 전체 테스트 284개 통과. 화면 확인 단계에서는 실제 개발 데이터를 추가하지 않았다. 이후 실사용 테스트에서 추가한 고객사·사이트는 최상단 기록을 따른다.

## IndexNow DB 구조 업데이트 — 2026-10-27

- `engine_registrations`에 `indexnow_key`, `indexnow_key_location` nullable TEXT 컬럼을 추가했다. 별도 테이블이나 sites 컬럼은 추가하지 않았다.
- 로컬 PostgreSQL에 Alembic `0002`를 적용했고 기존 네 테이블의 데이터 보존과 모델 일치를 확인했다. 아래 과거의 `0001(head)` 기록보다 이 상태가 최신이다.
- Naver·Bing 행에는 같은 설정을 저장하고 Google·Brave는 NULL을 사용한다. 개별 글은 부모 사이트의 등록 정보를 조회하고 host는 사이트 URL에서 추출한다.
- 두 엔진의 키 동시 갱신은 이후 서비스에서 하나의 트랜잭션으로 구현해야 한다. 초기 DB 변경 당시에는 모델·마이그레이션만 추가했으며, 이후 POST /sites의 설정 저장 연결까지 완료했다. 키 생성·배포 API는 아직 없다.
- PostgreSQL 스키마 통합 테스트 16개 통과. Notion의 engine_registrations 컬럼 표와 운영 규칙도 갱신했다.

## Google 엔진 진행·추후 할 일 — 2026-10-27

이 절은 Google 엔진에 관한 아래 과거의 미구현·빈 파일 기록보다 우선한다. DB·관리 화면 작업은 별도 세션에서 진행하며 해당 파일을 덮어쓰지 않는다.

- `app/engines/google/google_auth.py`: 저장된 OAuth 토큰 로드·권한 확인·만료 시 갱신·비공개 파일 저장을 구현했다.
- `app/engines/google/google.py`: `get_site()`, `register_site()`, `get_verification_token()`, `verify_ownership()`, `submit_sitemap()`과 이를 묶는 `register_new_site()`를 구현했다. 대표 메서드는 인증 파일 설치가 필요하면 `verification_required`와 파일 정보를 반환하며, 설치 후 `verification_ready=True`로 재호출한다. 기존 소유자는 사이트맵 제출로 진행한다. `completed`는 등록·소유 확인·사이트맵 접수 완료이며 색인 완료가 아니다.
- 현재 전체 등록 흐름은 HTTP·HTTPS URL-prefix 속성과 FILE 인증을 지원한다. `sc-domain:` 속성의 DNS 인증은 지원 범위 밖이다.
- Notion의 Google 요구사항 1번과 대조했다. Google 인증·엔진·기존 검증 도구 관련 테스트 **86개 통과**. 이 수치는 프로젝트 전체 테스트 개수가 아니다.
- 실제 `https://otteru.vercel.app/`에서 OAuth 유효·`siteOwner`·대표 메서드 `completed`·사이트맵 제출 성공을 확인했다. `?lang=ko`는 이번 사이트 속성에서 제외했다. 최종 읽기 검수에서 사이트맵 `isPending=false`, 오류 0·경고 0·다운로드 기록을 확인했고, 인증 파일 발급 및 배포 파일 HTTP 200·내용 일치도 확인했다. 미등록 테스트 경로의 속성 조회는 `None`이었다. 이 결과는 각 호출 당시 관측이다.

### 추후 할 일 — 사용자 요청으로 보류

- [ ] **새로운 테스트 사이트에서 요구사항 1번 전체 실사용 검증**: 미등록 조회 → Search Console 등록 → 인증 파일 발급 → 프론트 설치 안내 → 사람이 실제 배포 → 설치 완료 후 재호출 → 소유 확인·권한 재확인 → 사이트맵 제출 → DB 상태 저장까지 확인한다. 이번 사이트는 이미 소유자였으므로 신규 등록·설치 후 재개 전체 경로는 현재 어댑터의 모의 테스트로 검증했다. 과거 0단계 API 실험과 현재 제품 코드의 전체 검증을 구분한다. 검증을 위해 기존 운영 사이트의 등록·소유권·인증 파일을 삭제하지 않는다.
- [ ] Google 엔진을 FastAPI 서비스·등록 상태 DB 저장·프론트 인증 파일 설치 안내와 연결한다. 엔진은 DB 저장·메일 발송을 담당하지 않는다.

### 다음 설계 대상

- Google 요구사항 **2. 새로운 블로그 글 발행 알림**은 별도 메서드 구현을 보류하고 3번부터 진행했다. 사이트 자체의 사이트맵 자동 갱신을 먼저 확인해야 한다. 사이트맵을 매 글마다 재제출하거나 Search Console GUI로 개별 색인 요청을 해야 하는 것은 아니다. 일반 블로그용 Indexing API·Search Console 브라우저 자동화는 구현하지 않는 기존 공식 API 중심 방향을 유지한다.

### Google 3번 상태 조회 구현 — 2026-10-27

- `GoogleEngine.inspect_url(site_url, page_url)` 구현. 현재는 HTTP·HTTPS URL-prefix 속성 안의 메인페이지·글을 지원하며 정확한 URL과 쿼리를 유지한다. Google에 기록된 상태를 조회하고 크롤링·색인 요청은 실행하지 않는다. DB 저장·스케줄러·FastAPI 연결은 아직 없다.
- `GoogleUrlInspection`에 관측 시각(UTC), 색인 상태, 원본 verdict·coverageState, 마지막 크롤링 시각, 수집·robots·noindex 상태, Google·사용자 canonical, 검사 화면 링크를 반환한다. PASS는 indexed, FAIL·NEUTRAL은 not_indexed, 판정 미지정 상태에서 크롤링 시각이 있으면 crawled, 그 외는 unknown이다. API 오류는 예외로 반환하며 not_indexed로 바꾸지 않는다. 수집 대기 여부는 제출 이력과 서비스에서 결합해야 하며 크롤링 시각 누락만으로 단정하지 않는다.
- Google 인증·엔진·기존 검증 도구 테스트 **121개 통과**. 조회 범위·응답 누락·미색인 판정·오류·호출 제한·타임아웃을 검증했다.
- 실제 조회: **2026-10-27 18:16 KST**. `https://otteru.vercel.app/`는 PASS·indexed·Google canonical이 동일하며 마지막 크롤링은 **2026-10-25 15:37:52 KST**였다. `https://otteru.vercel.app/?lang=ko`는 NEUTRAL·not_indexed·‘Google에는 아직 알려지지 않은 URL입니다.’·마지막 크롤링 시각 없음이었다. 두 결과는 각 URL의 당시 관측으로 전체 게시물 상태나 실시간 상태를 뜻하지 않는다.

## 최신 추가 진행 — 2026-10-27

- 메인 사이트 등록 **스키마·서비스·라우터·DB 검증 완료**. 사이트 API는 `139af94`, 프론트 화면은 `58f4514`로 로컬 main에 별도 커밋했다. 원격 푸시는 하지 않았다. 아래 2026-10-26 기록의 미구현·다음 단계 설명보다 이 기록을 우선한다.
- `app/services/site.py`: `create_site()`는 하나의 트랜잭션에서 고객사 존재를 확인하고 `target_type="site"`, `parent_site_id=None`으로 저장한다. 고객사 조회 시 키 공유 잠금으로 저장 전 삭제를 방지한다.
- 없는 고객사는 `SiteClientNotFoundError`, 동일 고객사·정규화 URL 중복은 `DuplicateSiteError`로 구분한다. `uq_sites_client_url` 대상 `ON CONFLICT DO NOTHING`으로 동시 중복도 처리하며, 다른 DB 오류는 숨기지 않는다.
- `list_sites()`는 필수 `client_id`와 `target_type="site"`로 필터링하고 생성 시각·ID 정렬, limit·offset을 지원한다. 대상 고객사의 메인 사이트가 없으면 빈 튜플이다.
- `tests/integration/test_site_service.py`에 저장·서버 지정값·true/false/null·롤백·고객사 분리·글 제외·페이지 분할·동시 등록 검증 7개를 추가했다. 사이트 서비스 구현 당시 임시 PostgreSQL DB 검증을 통과했다. 최종 커밋 기준 수치는 아래 81개·82개 기록을 따른다.
- 실행: `RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider`. 직접 Python 실행 시에도 사용자 전역 패키지 충돌을 막기 위해 `PYTHONNOUSERSITE=1`을 지정한다.
- 검증을 위해 Docker Desktop과 기존 PostgreSQL 컨테이너를 시작했다. 테스트는 별도 임시 DB만 생성·삭제하며 개발 DB 데이터는 변경하지 않았다.
- `app/api/sites.py`를 `app/main.py`에 연결했다. `POST /sites`는 등록 성공 시 201, 고객사 없음은 404, 동일 고객사·URL 중복은 409를 반환한다. `GET /sites`는 UUID `client_id` 필수, limit 1~100(기본 100), offset 0 이상(기본 0)이다. 없는 고객사의 목록은 200과 빈 items다.
- `tests/integration/test_sites_api.py`에서 실제 앱에 임시 DB 세션을 주입해 등록 후 별도 연결의 DB 저장, 201·404·409·422, 고객사 분리, 글 제외, 페이지 분할, 빈 목록, OpenAPI·`/docs`를 검증했다. 사이트 API 커밋 `139af94`의 스테이징 스냅샷을 별도 임시 디렉터리에 내보내 **81개 테스트 통과**를 확인했다. 프론트·다른 세션의 미추적 엔진 파일 없이 독립 검증했다.
- **프론트 화면 구현 완료**: `/`에서 `app/static/index.html`을 제공하며 CSS·JS는 `/static/`으로 제공한다. 프레임워크 추가 없이 기존 FastAPI API를 동일 출처에서 호출한다. 고객사 추가 대화상자, 고객사 선택, 6개 필드 사이트 등록, 고객사별 메인 사이트 목록·페이지 조회, 필드별 오류·성공 안내를 지원한다. 고객사 목록은 API 페이지를 모두 읽어 선택지로 제공한다.
- 브라우저에서 별도 임시 DB로 고객사 추가→자동 선택, 사이트 등록→목록 갱신, 빈 입력·중복 오류, 390px 모바일 배치를 검증했다. 미리보기용 예시 데이터는 개발 DB에 넣지 않았다. 프론트 커밋 `58f4514`의 스테이징 스냅샷을 별도 임시 디렉터리에 내보내 **82개 테스트 통과**, JS 구문 검사 통과를 확인했다. 이 수치는 다른 세션의 미추적 엔진 테스트를 포함한 현재 작업 트리 전체 수치가 아니다. 관련 안내는 `docs/site-admin.md`에 기록했다.
- **남은 작업**: 개별 글 등록 API·화면, 엔진 결과의 DB 저장·조회 연결, 주기적 상태 확인. 구체적인 우선순위는 아래 다음 작업 절을 따른다. API 기능은 실제 검색엔진 등록까지 수행하지 않으며, 현재는 로컬 DB 저장·조회 범위다.
- 사이트 스키마·서비스·라우터·테스트는 사이트 API 커밋에, 관리 화면·정적 자산·화면 테스트·사용 안내는 프론트 커밋에 포함했다. 다른 세션의 `app/engines/`와 관련 테스트 및 로컬 ERD 자료는 커밋에서 제외한다. 작성자는 기존 Git 설정을 유지하며 공동 작성자 트레일러와 원격 푸시는 추가하지 않는다.

최종 갱신일: 2026-10-27 (Asia/Seoul)
프로젝트: StartPress 검색엔진 등록·발행 알림·색인 모니터링 자동화
작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`

## 가장 먼저 확인할 사항

1. **개발 환경은 Miniconda `startpress`다. `.venv`를 만들거나 `uv sync`·`uv run`을 실행하지 않는다.** 직접 Python을 실행할 때도 `PYTHONNOUSERSITE=1`을 지정한다.
2. **현재 브랜치는 codex/indexnow-integration**이다. Google 구현 `1765f5b`를 기준으로 승인한 IndexNow 변경을 네 커밋으로 나눴다. main/master 직접 push 금지는 유지하며 이번에도 원격 push는 하지 않았다.
3. DB 4개 테이블, 고객사·메인 사이트 등록/목록 API, 고객사 추가·사이트 등록 관리 화면까지 완료했다. 개별 글 등록과 엔진 결과의 DB 연결, 워커·스케줄러는 아직 없다.
4. **Google 구현은 별도 세션에서 `1765f5b`로 커밋했다. IndexNow는 현재 작업 브랜치의 커밋으로 정리했다.** 이 문서의 Google 진행 절과 다른 세션의 변경을 보존한다. `pyproject.toml`·`uv.lock`, 엔진 관련 미추적 테스트도 임의로 되돌리거나 전체 add로 커밋하지 않는다.
5. 실제 색인 완료와 API 요청 성공은 별개다. 저장된 결과는 각 호출 당시 관측이다. DB 최신 상태 4개 테이블만으로 작업·재시도·관측 이력이 관리되지는 않는다.
6. 관리 화면은 <http://127.0.0.1:8000/>이다. 이번 인계 확인 시 로컬 서버가 실행 중이었다. 현재 관리 화면의 등록은 DB 저장이며 검색엔진 등록을 자동 실행하지 않는다.

## 목표와 합의된 방향

회사 팀원이 고객사 블로그 URL을 입력하고 다음 업무를 처리하는 내부 웹 어드민을 만든다.

1. 신규 사이트 등록·소유 확인.
2. 글의 신규 발행·수정·삭제 사실을 검색엔진에 통지.
3. 크롤링·색인 상태를 가능한 범위에서 관측하고 필요한 수동 작업 안내.

공식 API를 중심으로 구현한다. 브라우저 조작으로 등록·검사 기능을 대신하지 않는다. 브라우저는 최초 계정 설정·OAuth 로그인·동의에 사용했다. 파일 배포와 계정 권한 등 API 외부의 준비 단계는 별도로 관리해야 한다.

백엔드는 FastAPI + PostgreSQL이다. 관리 화면은 별도 빌드 없이 HTML·CSS·JavaScript를 FastAPI에서 제공하는 방식으로 구현했다. Jinja2/HTMX는 초기 검토안이며 현재 사용하지 않는다. Celery/Redis·스케줄러는 후속 검토 대상이며 아직 구현하지 않았다.

사용자는 개발자로 성장하기 위한 설명과 단계별 진행을 선호한다. 한국어로 간결하게 설명하고, 코드는 타입 힌팅과 읽기 쉬운 구조를 사용한다. 사용자가 묻는 개념은 난이도에 맞춰 설명한다.

## 개발 환경 — Miniconda startpress

- Conda 실행 파일: `/opt/miniconda3/bin/conda`
- 환경 이름: `startpress`
- 환경 경로: `/opt/miniconda3/envs/startpress`
- Python 실행 파일: `/opt/miniconda3/envs/startpress/bin/python`
- 설치된 Python: **3.13.17**
- 환경별 설정: `PYTHONNOUSERSITE=1` — 기존 사용자 전역 패키지가 섞이지 않도록 설정했다.
- `uv.lock`에서 해시와 고정 버전을 내보낸 뒤 Conda 환경의 pip로 의존성을 설치했다.
- 기존 프로젝트 `.venv/`는 Conda 환경 검증 후 삭제했다.
- `pyproject.toml`, `uv.lock`은 의존성 명세와 잠금 기록으로 유지한다.
- **`uv sync`, `uv run`, `python -m venv`로 프로젝트 venv를 다시 만들지 않는다.**

현재 주요 설치 버전:

| 패키지 | 버전 |
|---|---|
| google-auth | 2.62.0 |
| google-auth-oauthlib | 1.5.0 |
| python-dotenv | 1.2.4 |
| pytest | 9.1.1 |
| FastAPI | 0.162.0 |
| SQLAlchemy | 2.1.6 |
| Alembic | 1.20.1 |
| asyncpg | 0.32.0 |

터미널에서:

```bash
conda activate startpress
python -m pytest -q
```

에이전트의 셸이 여전히 base 환경일 수 있으므로 실행 환경을 추측하지 않는다. 활성화 없이 실행할 때는 다음 방식을 권장한다.

```bash
conda run --no-capture-output -n startpress python -m pytest -q
conda run --no-capture-output -n startpress python google_probe.py sites
```

두 번째 명령은 **실제 Google API를 호출한다.** 로컬 테스트만 원하면 pytest만 실행한다.

캐시를 다시 만들지 않고 테스트하려면:

```bash
PYTHONDONTWRITEBYTECODE=1 conda run --no-capture-output -n startpress python -m pytest -q -p no:cacheprovider
```

환경 복원·설치 방법은 [environment.md](environment.md)를 참고한다. `uv export`는 잠금 기록 변환 용도로 사용 가능하며 venv를 생성하지 않는다.

## 완료된 작업

- [x] Notion 요구사항 분석 및 공식 문서·사례 기반 스택·구조 보고서 작성.
- [x] 테스트 도메인 `https://otteru.vercel.app/`의 robots·사이트맵·canonical 점검.
- [x] 기존 `yudam.com` 대표 도메인 설정을 `otteru.vercel.app`으로 변경·배포.
- [x] Google OAuth 사용자 로그인·동의 및 Access/Refresh Token 저장.
- [x] Google API로 소유 확인 파일 발급 → 파일 배포 → 소유 확인 → 사이트 등록 → 사이트맵 제출 → URL 검사 수행.
- [x] Bing API 키 인증 및 API로 사이트 등록 → 검증 코드 수령 → XML 배포 → 소유 확인 → 사이트맵 제출 → URL 정보 조회 수행.
- [x] IndexNow 실제 POST 요청 검증. 다른 세션의 최종 실험에서 HTTP 200 접수 성공 확인.
- [x] API 응답·관측 결과를 민감정보 없는 통합 JSON과 보고서로 보관.
- [x] 임시 로그·스크린샷·중복 JSON·캐시 및 불필요한 인증 관련 응답 기록 삭제.
- [x] 남겨둔 보고서와 통합 JSON을 Google·Bing 완료 및 IndexNow 200 기준으로 최신화.
- [x] Miniconda `startpress` 생성·의존성 설치·격리 설정·테스트 검증.
- [x] FastAPI 기본 앱과 `/health`, 종료 시 DB 연결 풀 정리 구현.
- [x] Docker PostgreSQL 18.6 실행·로컬 전용 포트·데이터 볼륨·접속 검증.
- [x] 확정한 4개 테이블의 SQLAlchemy 모델과 비동기 세션 구현.
- [x] Alembic 초기 마이그레이션·부모 검증 트리거 작성 후 개발 DB에 0001 적용.
- [x] 기본 8개·PostgreSQL 통합 13개 테스트 통과 및 모델·DB 일치 확인.
- [x] PK·FK·자기참조 관계를 표시한 ERD 이미지와 생성 프롬프트 저장.
- [x] 고객사 등록 `POST /clients`와 목록 조회 `GET /clients` 구현·커밋 (`9099c96`).
- [x] 요청별 세션과 서비스의 트랜잭션을 연결하고, 별도 DB 연결에서 고객사 저장 결과 확인.
- [x] 실제 HTTP로 `/clients` 조회·OpenAPI·`/docs` 응답 확인. 개발 서버 재시작 후 정상 동작 확인.
- [x] DB 설정·연결 코드의 한국어 설명 주석과 `get_db()` 가독성 개선.
- [x] AGENTS.md에 모든 함수·메서드 앞 간단한 한국어 주석 작성 규칙 추가.
- [x] 메인 사이트 스키마·URL 검증·저장/조회 서비스·라우터·실제 DB 검증 완료 (`139af94`).
- [x] 고객사 추가·선택, 사이트 등록·목록 화면과 모바일 배치, 사용 안내 완료 (`58f4514`).
- [x] Notion DB 설계와 4개 모델 비교, 실제 DB의 Alembic 0001(head)·모델 차이 없음 확인. Notion 그 조회 단계에서는 본문을 수정하지 않았으며 이후 IndexNow 세션에서 DB 컬럼과 사용자 입력·구현 상태를 업데이트했다.

## 0단계 API 검증 결과와 실제 한계 — 2026-10-25 관측

### Google

- OAuth 프로젝트: `startpress-512704`. 데스크톱 앱용 클라이언트 JSON을 사용했다.
- 승인한 범위: `webmasters`, `siteverification.verify_only`.
- Sites list: HTTP 200, 최초 대상 속성 없음.
- Site Verification getToken / insert: 각각 HTTP 200.
- Sites add / get: HTTP 204 / 200, `siteOwner` 확인.
- Sitemaps submit / get: HTTP 204 / 200, 당시 `isPending=true`.
- URL Inspection: HTTP 200.
- 마지막 저장 관측: **2026-10-25 15:28:39 KST**.
- 당시 결과: `verdict=NEUTRAL`, ‘Google에는 아직 알려지지 않은 URL입니다.’, 마지막 수집 시각 없음.
- OAuth는 Search Console 속성 권한과 별개이며, 실제 속성의 소유 확인도 완료했다.
- 일반 블로그에 Google Indexing API는 사용하지 않는다. 사이트맵과 URL Inspection을 활용한다.

### Bing

- API 키 방식으로 인증했다. Bing OAuth 위임 인증은 아직 시험하지 않았다.
- GUI URL 입력이나 Google Search Console 가져오기로 사이트를 등록하지 않았다.
- GetUserSites / AddSite: 각각 HTTP 200.
- VerifySite: HTTP 200, `d=true`; 재조회에서 `IsVerified=true` 확인.
- SubmitFeed: HTTP 200, 사이트맵 접수.
- GetUrlInfo: HTTP 200.
- 마지막 저장 관측: **2026-10-25 15:47:48 KST**.
- 당시 `IsPage=true`, 내부 `HttpStatus=0`, `DocumentSize=0`.
- 반환된 마지막 크롤링 시각: **2026-10-25 15:38:27 KST**.
- 반환된 DiscoveryDate가 당시 조회 시각보다 미래인 **16:00:00 KST**였다. 원본을 보존하되 시간 순서·지연시간 계산에 사용하지 않는다.
- `IsPage=true`나 바깥쪽 HTTP 200만으로 색인 완료를 확정하지 않는다. 통합 기록의 색인 상태는 `unknown`이다.
- 이 계정에서는 GUI 사이트 등록 전에 API 키 발급이 가능했다. 다른 계정에 동일 조건을 일반화하지 않는다.

### IndexNow

- 공통 엔드포인트: `https://api.indexnow.org/indexnow`.
- 대상은 대표 URL 1개였다.
- 처음 HTTP 202를 받았으며, 후속 실험은 **2026-10-25 15:36:56 KST에 HTTP 200**이었다.
- 최신 결론은 ‘접수 성공’이며, ‘키 확인 대기’를 최신 상태로 남기지 않는다.
- 개별 Naver·Bing 엔진의 수집·색인 완료를 확인한 것은 아니다.
- 같은 이벤트를 Naver와 Bing에 항상 중복 전송하는 구조를 만들지 않는다.

### 미검증 범위

- Naver·Brave의 신규 사이트 등록 및 개별 색인 상태 조회.
- Bing 고객 계정용 OAuth 위임 인증.
- CMS Webhook·RSS/사이트맵 변경 감지·자동 예약·재시도·다수 고객 운영.
- 대표 URL 외 전체 게시물의 색인 상태 및 장기간의 상태 변화.

## 현재 구현과 진행 상태

- `google_probe.py`는 **검증용 실행 도구**다. `auth`, `sites` 명령만 있다.
- `auth`: `.env`의 OAuth JSON을 읽고 사용자 동의 후 토큰 저장·기존 토큰 재사용.
- `sites`: 저장된 토큰으로 Google 사이트 목록 조회.
- 0단계 소유 확인·사이트맵 제출·색인 검사·Bing 요청은 개별 Python 실행으로 검증했다. 현재 Google 어댑터의 구현 범위는 문서 상단 Google 엔진 진행 절을 따른다. 엔진과 DB·관리 화면의 연결 완료로 해석하지 않는다.
- 테스트 4개는 인증파일 경로 제한, 공식 인증 엔드포인트 검증, 토큰 저장 권한, 결과 요약 시 다른 사이트·오류 본문 제외를 검증한다.
- FastAPI 기본 앱(`/health`), 비동기 DB 연결·세션, 4개 SQLAlchemy 모델, Alembic 초기 마이그레이션, 고객사·메인 사이트 생성/목록 API와 웹 관리 화면을 구현했다. 워커·스케줄러는 아직 없다.
- 고객사 API는 `app/schemas/client.py` → `app/api/clients.py` → `app/services/client.py` → 요청별 DB 세션으로 연결된다. 등록 성공은 201, 입력 오류는 422다. 목록은 생성 시각·ID 순이며 limit(1~100, 기본 100)·offset(0 이상)을 지원한다.
- 고객사 서비스는 `session.begin()` 안에서 저장·응답 변환을 수행하고 정상 종료 시 커밋한다. `get_db()` 자체는 커밋하지 않고 세션 제공·정리를 담당한다.

## 메인 사이트 등록 — 완료

- [x] 1단계: `app/schemas/site.py`에 SiteCreate·SiteRead·SiteList 작성.
- [x] 2단계: HTTP·HTTPS URL 정규화, UTF-8 2,048바이트 제한 적용.
- [x] 3단계: 고객사 확인·메인 사이트 저장·목록 조회 서비스.
- [x] 4단계: POST /sites·GET /sites 라우터 및 앱 연결.
- [x] 5단계: 201·404·409·422 응답과 실제 PostgreSQL 저장·동시 중복·목록 분리 검증.
- [x] 고객사 추가·선택, 사이트 등록 폼과 고객사별 목록, 모바일 배치.

요청 필드는 총 6개다. client_id·name·url·owner_type은 필수, cms_type·can_edit_site는 선택이다.
can_edit_site는 엄격한 true/false/null만 허용한다. target_type·parent_site_id·is_active는
사용자가 보낼 수 없고 서버·DB가 지정한다. SiteRead는 메인 사이트만 표현한다.

URL은 호스트·스킴을 정규화하고 `/blog/` 경로와 쿼리는 유지한다. 잘못된 스킴·호스트,
공백·제어 문자·역슬래시·인증정보·프래그먼트를 거부한다. 등록 시 해당 URL에 접속하지 않는다.
외부 URL 접근 기능의 SSRF 방어가 완료됐다는 의미는 아니다.

화면은 기존 API를 동일 출처로 호출한다. 고객사 목록은 100개씩 끝까지 읽고 사이트 목록은
6개씩 표시한다. 등록 실패 시 입력을 유지하며 오류를 해당 필드에 표시한다. 고객사 추가 후
자동 선택하고 사이트 등록 성공 시 목록을 갱신한다. 사용법은 [site-admin.md](site-admin.md).
브라우저 검증용 별도 임시 DB는 정리했고 개발 DB에 예시 데이터를 저장하지 않았다.

## 진행 중인 작업과 다음에 해야 할 작업

최상단의 현재 세션 인계 요약에 우선순위·미구현 범위·커밋 계획을 정리했다. IndexNow 제출 클라이언트와 사이트 등록 시 설정 저장은 완료했고, 기존 사이트 설정 변경·제출 전용 서비스/API·결과 저장은 아직 없다. 개별 글 등록·예약·이력은 후속 작업이며 Google 절의 보류 요청을 유지한다.

## Git 상태 — 기존 커밋과 IndexNow 작업 브랜치

- 브랜치: codex/indexnow-integration. 원격: `https://github.com/StartPress26/webmaster-automation.git`.
- `139af94` — `[feat] 메인 사이트 등록 및 목록 조회 API 구현`: 스키마·서비스·라우터·앱 연결·사이트 테스트·API 단계 인계. 프론트 없이 독립 검증 81개 통과.
- `58f4514` — `[feat] 고객사 선택 및 사이트 등록 관리 화면 구현`: 정적 HTML/CSS/JS·화면 제공·화면 테스트·사용 안내·프론트 단계 인계. 독립 검증 82개 및 JS 구문 검사 통과.
- 작성자는 기존 Git 설정을 유지했고 공동 작성자 트레일러는 없다. 두 커밋 모두 로컬 main에만 생성했으며 원격 푸시는 하지 않았다.
- 이전 주요 커밋: `9f47662` DB 모델·마이그레이션, `9099c96` 고객사 API, `d359a15` 설명 주석·세션 흐름, `eb9fd2c` 이전 인계.
- 최신 기존 커밋은 Google 구현 `1765f5b`다. 현재 IndexNow 커밋 기록은 최상단 목록을 따른다. 실제 git status를 다시 확인하고 다른 세션의 변경을 보존한다.
- 로컬 전용 제외 자료: `outputs/startpress-db-erd.png`, `outputs/db-erd-prompt.txt`. 전체 add로 함께 커밋하지 않는다.
- `docs/HANDOFF.md`에는 다른 세션의 Google 진행 기록과 이번 갱신을 함께 보존해 문서 커밋에 포함했다. 과거 버전으로 되돌리지 않는다.
- `.env`, `.secrets/`, 가상환경·캐시는 커밋하지 않는다. 원격 상태는 git status -sb로 확인하되 이번 작업에서 새 fetch·push는 하지 않는다.

별도 블로그 저장소 `/Users/kim-yudam/Desktop/study/sideProject/nextjs-notion-starter-kit`에는 공개 검증 파일을 배포했다.

- [PR #4 — 도메인·IndexNow 준비](https://github.com/otteru/nextjs-notion-starter-kit/pull/4)
- [PR #5 — Google 소유 확인 파일](https://github.com/otteru/nextjs-notion-starter-kit/pull/5)
- [PR #6 — Bing 소유 확인 XML](https://github.com/otteru/nextjs-notion-starter-kit/pull/6)

위 변경은 운영 응답으로 반영을 확인했다. 블로그를 원본 포크와 일괄 동기화하는 작업은 진행하지 않았다. 원본의 Next.js 16/App Router 변경과 커스텀 기능 충돌 때문에 별도 마이그레이션을 권장한 상태다.

## 주의사항

- [프로젝트 커밋 규칙](../AGENTS.md)에 따라 공동 작성자 트레일러는 추가하지 않는다. 초기 커밋의 공동 작성자 표시는 사용자 요청으로 제거했다.
- `.env`, `.secrets/`는 Git에 포함하지 않고 비밀값을 로그·채팅·보고서에 출력하지 않는다.
- `.secrets/`에는 현재 실제 인증파일 2개만 남아 있다.
  - `google_search_console_api_user_oauthjson`: 데스크톱 OAuth 클라이언트 JSON. `.env`가 이 파일명을 가리킨다.
  - `google-token.json`: 실제 Access/Refresh Token. 삭제하면 재인증이 필요할 수 있다.
- `.env`에는 기존 `GOOGLE_OAUTH_CLIENT_FILE`, `GOOGLE_TOKEN_FILE`, `BING_API_KEY`와 로컬 DB용 `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`이 있다. 값은 문서·로그에 복사하지 않는다.
- 이미 삭제한 `.secrets/google-site-verification.json`, `google-site-ownership-result.json`, `bing-target-site.json`을 코드가 읽는다고 가정하지 않는다. 재검증 시 필요하면 API에서 다시 받는다.
- 로컬 응답 기록을 삭제한 것과 **블로그의 공개 검증 파일**을 삭제하는 것은 다르다. 배포된 공개 검증 파일은 유지한다.
- 중복 Google/Bing 개별 결과 JSON은 삭제했다. 원래 관측 필드는 현재 엔진별 통합 JSON 안에 보존돼 있다.
- 같은 URL을 색인 확인 목적으로 반복 제출하지 않는다. 통지와 상태 조회를 구분한다.
- 현재 조회 대상은 `google_probe.py`의 `TARGET_SITE`에 고정돼 있다. 제품 구현에서는 입력 검증·사이트 권한 검사를 포함해 일반화해야 한다.

## 최신 DB·FastAPI 구현 상태

### 로컬 DB

- Compose 파일: `compose.yaml`, 서비스 이름: `db`.
- 이미지: `postgres:18.6`.
- 컨테이너: `webmaster-automation-db-1`.
- 주소: `127.0.0.1:5432` — 로컬 컴퓨터에서만 접속하도록 바인딩.
- DB 이름·사용자: `webmaster`. 실제 비밀번호는 `.env`에 무작위 생성·저장했으며 출력하지 않았다.
- 데이터 볼륨: `webmaster-automation_postgres_data`, 컨테이너 경로 `/var/lib/postgresql`.
- 현재 개발 DB는 Alembic `0002 (head)`다. IndexNow 컬럼 적용 시 기존 네 테이블의 데이터 보존과 모델 일치를 확인했다. 통합 테스트의 되돌리기·재적용은 임시 DB에서만 실행했다.
- 기본 실행은 `docker compose up -d --wait db`, 일반 종료는 `docker compose stop db`다.
- 데이터 볼륨을 삭제하는 종료 명령은 사용하지 않는다. 초기화 이후 비밀번호는 .env 값만 바꿔도 DB에 반영되지 않는다.

### 확정한 테이블 4개

1. `clients`: id(UUID), name, manager_name(선택), created_at.
2. `sites`: 메인 사이트와 개별 글을 모두 저장. client_id는 필수이고 target_type은 site/page다. 글의 parent_site_id는 같은 테이블의 메인 사이트를 참조한다. URL은 이 테이블에 저장하며 상태 테이블에 중복 저장하지 않는다.
3. `engine_registrations`: 메인 사이트·엔진별 등록과 소유권 확인 및 IndexNow 키·파일 주소를 관리. main_site_id는 메인 사이트만 참조한다. Naver·Bing에 같은 설정을 저장하며 글은 부모를 통해 조회한다.
4. `site_engine_statuses`: 메인 홈페이지와 글 URL 각각의 엔진별 제출·수집·색인 최신 상태를 저장.

업무 테이블 외에 Alembic이 `alembic_version`을 생성했다. 따라서 public 테이블 조회에 총 5개가 보이는 것은 정상이다.

상태 값:

- registration_status: unknown / submitted / verified / failed, 해당 없는 경우 NULL.
- index_status: unknown / submitted / crawled / indexed / not_indexed / failed.
- submitted는 접수 후 후속 상태 미확인, crawled는 수집 확인 후 색인 미확인이다.
- failed는 작업 오류이고 not_indexed와 다르다. 현재 모델은 최신 상태 저장용이며 정상 관측 이력은 추후 별도 구현이 필요하다.

적용한 제약:

- 모든 ID는 DB에서 UUID 자동 생성, 시각은 TIMESTAMPTZ.
- 같은 고객사와 URL 조합은 유일하다.
- 메인 사이트는 parent_site_id가 NULL, 글은 부모가 필수다.
- 글의 부모와 등록 대상이 반드시 메인 사이트인지 트리거로 검사한다.
- target_type은 생성 후 고정한다. 이 규칙으로 기존 참조 대상의 역할 변경을 방지한다.
- cms_type과 can_edit_site는 메인 사이트에만 저장한다.
- (main_site_id, engine), (site_id, engine)은 각각 UNIQUE.
- 연결된 행이 있는 상위 고객사·사이트 삭제는 RESTRICT로 차단한다.
- URL은 http(s) 접두사와 UTF-8 2,048바이트 길이를 검사한다. 호스트·경로 범위와 권한은 API 계층에서 추가 검증해야 한다.
- 부모·글의 고객사나 owner_type이 같아야 한다는 별도 DB 제약은 없다. 현재 입력 흐름에서는 서버가 부모에서 이 정보를 가져오도록 계획했다.

### 코드와 마이그레이션

- `app/core/config.py`: frozen Settings, 프로세스 환경변수 우선, 비밀번호가 repr·설정 오류에 노출되지 않도록 처리.
- `app/core/database.py`: SQLAlchemy 비동기 연결 풀·요청별 AsyncSession·종료 정리. 커밋은 서비스 계층에서 명시한다.
- `app/main.py`: `/health`, 고객사·사이트 라우터, `/` 관리 화면, `/static/` 자산 제공. lifespan에서 사용한 DB 연결 풀 정리.
- `app/api/clients.py`, `app/services/client.py`: 고객사 등록·목록 요청 처리와 DB 저장·조회.
- `app/schemas/site.py`, `app/api/sites.py`, `app/services/site.py`: 메인 사이트 입력 검증·등록·고객사별 목록과 서비스 예외의 HTTP 변환.
- `app/static/`: 고객사 추가·사이트 등록 관리 화면. 추가 프론트 프레임워크나 빌드 과정은 없다.
- `app/models/`: Base와 4개 모델. 관계는 외래키로 정의했으며 ORM relationship 편의 속성은 아직 없다.
- `alembic.ini`: 경로·로그 설정만 저장. 연결 주소나 비밀번호를 넣지 않는다.
- `migrations/env.py`: .env와 Base.metadata 연결. 테스트는 Config.attributes로 임시 DB URL을 주입한다.
- `migrations/versions/0001_create_tracking_tables.py`: 테이블·인덱스·제약·검증 트리거 생성과 downgrade.
- `migrations/versions/0002_add_indexnow_settings.py`: engine_registrations에 IndexNow 키·파일 주소 컬럼 추가.
- `app/services/engine_registration.py`: 같은 DB 세션으로 Naver·Bing 설정 저장. 독립 커밋하지 않는다.
- `db/schema.sql`은 과거 8개 테이블 보관본이다. 최신 적용에 사용하지 않는다는 주석을 추가했다. 현재 기준은 모델과 Alembic이다.
- 트리거·함수는 autogenerate가 자동으로 관리하지 않는다. 변경 시 새 마이그레이션에 직접 작성하고 통합 테스트한다.

```bash
conda run -n startpress python -m alembic current
conda run -n startpress python -m alembic check
```

확인용 DB 접속:

```bash
docker compose exec db psql -U webmaster -d webmaster
```

psql 안에서 `\dt`, `\d sites`로 테이블과 제약을 볼 수 있다.

### 검증 기록

- 사이트 API 커밋 스냅샷: **81 passed**. 프론트 커밋 스냅샷: **82 passed**. 각각 인덱스 내용을 별도 임시 디렉터리로 내보내 검증했으며, 다른 세션의 미추적 엔진·테스트는 포함하지 않았다.
- `node --check app/static/admin.js`, `git diff --check` 통과.
- 실제 PostgreSQL 임시 DB에서 커밋·중복·동시 등록·고객사별 조회·글 제외·서버 지정값·true/false/null·롤백·HTTP 응답을 확인했다.
- 브라우저에서 별도 임시 DB로 고객사 추가/자동 선택, 등록/목록 갱신, 빈 입력·URL 중복 안내와 390px 모바일 배치를 확인했다. 브라우저 경고·오류 로그는 없었다.
- 2026-10-27 읽기 확인: `alembic current`는 0001(head), `alembic check`는 No new upgrade operations detected.
- 다른 세션의 Google 테스트 86개 통과 기록은 상단 해당 절을 따른다. 프로젝트 전체 또는 위 82개와 합산한 수치로 표현하지 않는다.

```bash
# 임시 PostgreSQL DB를 생성·검증·정리합니다. 외부 검색엔진 API는 호출하지 않습니다.
RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider

# DB 없이 기본 테스트만 실행합니다.
PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -m 'not integration' -p no:cacheprovider
```

통합 테스트는 개발 DB를 지우지 않는다. UUID 이름의 임시 DB를 만들고 자신이 만든 DB만
삭제한다. 로컬 계정에 CREATE DATABASE 권한이 필요하다. 다른 세션이 테스트를 추가 중이므로
현재 작업 트리 전체 테스트 수는 위 커밋 스냅샷 수보다 늘어날 수 있다.

### 관리 화면 실행

```bash
docker compose up -d --wait db
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

이번 인계 확인 시 이미 127.0.0.1:8000에 개발 서버가 실행 중이었다. 중복 실행 전에 포트를
확인한다. 서버는 `.env` 또는 프로세스 환경변수의 DB에 연결하며 화면 등록은 실제 저장이다.
검증용 8001 서버와 임시 DB는 정리했다. 관리 화면은 [로컬 화면](http://127.0.0.1:8000/),
API 문서는 [Swagger UI](http://127.0.0.1:8000/docs)에서 확인한다.

### ERD 이미지

- 아래 자료는 기존 DB 설계 자료 제외 방침에 따라 로컬에만 보존하며 이번 커밋에서도 제외한다. 새 체크아웃에는 없을 수 있다.
- `outputs/startpress-db-erd.png`: 내장 imagegen으로 생성한 4개 업무 테이블의 컬럼·PK·FK·1:N·자기참조 관계 이미지.
- `outputs/db-erd-prompt.txt`: 사용한 전체 프롬프트.
- 이미지는 설명용이며 실제 정의는 모델·마이그레이션을 기준으로 확인한다.

## 관련 파일

| 파일 | 용도 |
|---|---|
| [environment.md](environment.md) | Conda 실행·복원 방법 |
| [../google_probe.py](../google_probe.py) | OAuth·Google 사이트 목록 검증 코드 |
| [../tests/test_google_probe.py](../tests/test_google_probe.py) | 로컬 보호 동작 테스트 4개 |
| [../pyproject.toml](../pyproject.toml) | Python·의존성·pytest 설정 |
| [../uv.lock](../uv.lock) | 정확한 의존성 버전·해시 |
| [docker-postgres.md](docker-postgres.md) | Docker DB 실행·접속 방법 |
| [database-setup.md](database-setup.md) | 현행 스키마·Alembic·통합 테스트 안내 |
| [../compose.yaml](../compose.yaml) | 로컬 PostgreSQL 18.6 실행 설정 |
| [../app/main.py](../app/main.py) | FastAPI 앱·health·연결 풀 종료 처리 |
| [../app/core/database.py](../app/core/database.py) | 비동기 DB 연결과 요청별 세션 |
| [../app/core/config.py](../app/core/config.py) | 비밀값 노출을 제한한 DB 설정 |
| [../app/models/__init__.py](../app/models/__init__.py) | 4개 모델·메타데이터 진입점 |
| [../app/schemas/client.py](../app/schemas/client.py) | 고객사 생성·조회·목록 Pydantic 스키마 |
| [../app/api/clients.py](../app/api/clients.py) | 고객사 등록·목록 라우터 |
| [../app/services/client.py](../app/services/client.py) | 고객사 저장·조회 트랜잭션 |
| [clients-api.md](clients-api.md) | 고객사 API 사용·검증 안내 |
| [site-admin.md](site-admin.md) | 관리 화면 실행·사용·검증 안내 |
| [../app/schemas/site.py](../app/schemas/site.py) | 사이트 요청·응답·URL 검증 |
| [../app/api/sites.py](../app/api/sites.py) | 메인 사이트 등록·목록 라우터 |
| [../app/services/site.py](../app/services/site.py) | 사이트 저장·조회와 중복 처리 |
| [../app/static/index.html](../app/static/index.html) | 관리 화면 폼·대화상자·목록 |
| [../app/static/admin.css](../app/static/admin.css) | 반응형 배치·포커스 스타일 |
| [../app/static/admin.js](../app/static/admin.js) | API 호출·목록 갱신·오류 안내 |
| [../tests/test_site_schemas.py](../tests/test_site_schemas.py) | 사이트 스키마 테스트 |
| [../tests/integration/test_site_service.py](../tests/integration/test_site_service.py) | 사이트 저장·동시 중복 테스트 |
| [../tests/integration/test_sites_api.py](../tests/integration/test_sites_api.py) | 사이트 HTTP·DB 통합 테스트 |
| [../tests/test_admin_page.py](../tests/test_admin_page.py) | 관리 화면·정적 파일 응답 테스트 |
| [../tests/integration/test_clients_api.py](../tests/integration/test_clients_api.py) | 실제 DB 커밋·API 검증 |
| [../alembic.ini](../alembic.ini) | 마이그레이션 실행 설정 |
| [../migrations/versions/0001_create_tracking_tables.py](../migrations/versions/0001_create_tracking_tables.py) | 초기 4개 테이블·검증 트리거 |
| [../tests/integration/test_database_schema.py](../tests/integration/test_database_schema.py) | PostgreSQL 관계·제약 검증 |
| [../tests/test_database_config.py](../tests/test_database_config.py) | DB 설정의 비밀값 노출 방지 테스트 |
| [../outputs/startpress-db-erd.png](../outputs/startpress-db-erd.png) | ERD 이미지 |
| [../outputs/db-erd-prompt.txt](../outputs/db-erd-prompt.txt) | ERD 생성 프롬프트 |
| [../outputs/phase0-api-verification-report.ko.md](../outputs/phase0-api-verification-report.ko.md) | 0단계 전체 검증 보고서 |
| [../outputs/google-api-verification-result.ko.md](../outputs/google-api-verification-result.ko.md) | Google 상세 보고서 |
| [../outputs/google-api-verification-status.json](../outputs/google-api-verification-status.json) | Google 통합 응답·검증 상태 |
| [../outputs/bing-api-verification-status.json](../outputs/bing-api-verification-status.json) | Bing 통합 응답·검증 상태 |
| [../outputs/indexnow-api-test-result.json](../outputs/indexnow-api-test-result.json) | IndexNow 최종 200 및 과거 202 이력 |

요구사항 원문: [Notion — Indexing 자동화](https://app.notion.com/p/Indexing-4034977b8e6980c2b41cc0e5a841c914).
2026-10-27 이 세션에서 Notion 연결 도구 fetch로 다시 조회했다. 조회 결과의 마지막 편집 시각은 2026-10-26 19:03 KST였다. 연결 이름 `Notion`에서는 404였지만 `개인용` 연결에서 StartPress HQ / 개발 아래 페이지를 조회했다. 한 연결의 404를 페이지 자체의 접근 불가로 단정하지 않는다. 다음 세션에서도 위 링크 또는 ID `4034977b-8e69-80c2-b41c-c0e5a841c914`로 조회한다. 그 조회 단계에서는 본문을 수정하지 않았으며 이후 IndexNow 세션에서 DB 컬럼과 사용자 입력·구현 상태를 업데이트했다.

조회한 원문에는 요구사항 1·2·3, 엔진별 자동화 조사, DB 설계(`clients`, `sites`, `engine_registrations`, `site_engine_statuses`), ‘사용자가 처음 넣어줘야 하는 정보’가 포함되어 있다. 입력 흐름은 다음과 같다.

- 고객사 등록: 고객사 이름과 선택적인 담당자 이름 입력.
- 메인 사이트 등록: 고객사 이름 목록에서 선택하되 서버에는 `client_id` 전달. 사이트 이름·URL·소유 구분과 선택적인 플랫폼·인증 파일/태그 설치 가능 여부 입력. 설치 가능 여부는 가능/불가능/모름을 `true`/`false`/`NULL`로 저장.
- 개별 글 등록: 등록된 메인 사이트 상세에서 ‘글 추가’로 제목·URL 입력. 선택한 부모 ID를 요청에 포함하고, 서버가 부모에서 고객사·소유 구분을 가져와 `target_type=page`로 설정.

Notion은 요구사항·설계 자료다. 실제 구현·적용 여부는 이 문서의 최신 구현 상태와 코드·Alembic 버전을 기준으로 확인한다. 원문의 브라우저 자동화 제안은 이 문서의 공식 API 중심 합의와 구분한다. 초기 조회 이후 IndexNow 세션에서 DB 컬럼·입력 항목·저장 구현 상태를 수정했다. 연결·권한은 변경하지 않았다.

## 과거 마지막 상태 — 2026-10-27

- 갱신일: **2026-10-27 / Asia/Seoul**.
- 작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`.
- 브랜치: **codex/indexnow-integration**, 기준 커밋 **1765f5b** — Google 구현. 마지막 기능 커밋은 **383965f**이고, 이후 이 파일을 담은 문서 커밋을 git log로 확인한다.
- 사용자가 네 커밋 구성을 승인했다. 기능 세 커밋과 검증 보고서·인계 문서 커밋으로 정리했으며 원격 push는 하지 않았다.
- 실행 환경: **Miniconda startpress**, 직접 실행 시 **PYTHONNOUSERSITE=1**, .venv 사용 금지.
- DB: **PostgreSQL 18.6 / Alembic 0002(head)**. 테스트 고객사·블로그와 Naver·Bing 키 설정이 저장돼 있다.
- 마지막 전체 검증: PostgreSQL 통합 포함 **284 passed**. 이후 실사용 테스트는 별도이며 반복 제출하지 않는다.
- 실제 IndexNow: **2026-10-27 19:09 KST, 메인 URL 1개·1회 제출·HTTP 200 accepted**. 개별 엔진의 수집·색인 완료를 뜻하지 않는다.
- 다음 작업: 기능 구현은 기존 사이트의 키 설정 변경 → DB 기반 제출 서비스·API·화면 버튼 → 결과 저장 흐름 순서다.
- 보존: Google 세션 기록·기존 공개 검증 파일·로컬 ERD 자료. .env·토큰은 커밋·출력하지 않는다.

새 세션에서: **‘docs/HANDOFF.md의 현재 세션 인계 요약을 읽고 이어서 진행해줘. Google은 1765f5b에 커밋됐고 IndexNow 클라이언트·설정 저장은 codex/indexnow-integration 브랜치에 커밋했어. 실제 Vercel 블로그 제출은 HTTP 200이었으며 기록된 URL을 테스트 목적으로 반복 제출하지 마. 추가 변경과 원격 push는 별도 요청 범위에 맞춰 진행해.’**


## 과거 마지막 상태 — 2026-11-03

- 브랜치: **feat/chrome-extension**. HEAD: **730f7d0 — [feat] 부모 사이트별 글 목록 조회 API 구현**.
- 네 API 기능 커밋은 위 최신 요약을 따른다. 원격 push는 하지 않았다.
- 미커밋: 인증 오류 세분화·error_code 저장·관련 테스트, pgAdmin compose 변경, 새 0003 오류 코드 마이그레이션, 미추적 extension/.
- 실제 개발 DB는 **0002**, error_code 컬럼 없음. **새 0003은 미적용**이며 코드·DB 불일치를 다음 작업에서 먼저 확인한다.
- 검증 기록: 전체 599개는 검사 API 구현 시점, 관련 55개는 글 목록 추가 시점. 현재 미커밋 전체는 미검증이다.
- 다음 작업: 미커밋 변경·DB 정합성 검증 → 프론트 글 목록·검사 API 연결 마무리·전체 흐름 확인.
- .env·OAuth 토큰·API 키·기존 운영 검증 파일·개발 데이터를 보존한다. 별도 /submissions 구현은 복구하지 않는다.
- 이 요청에서는 docs/HANDOFF.md만 업데이트했다. 인계 문서는 아직 커밋하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약을 읽고 이어서 진행해줘. HEAD는 730f7d0이고 extension/과 인증 오류 코드 변경은 미커밋이야. 새 0003 오류 코드 마이그레이션은 실제 DB에 아직 적용되지 않았으니 먼저 코드·DB 상태부터 확인해줘. 핵심 기능을 우선하고 별도 submissions API는 만들지 마.”**


## 추가 인계 기록 — 2026-11-04

- 브랜치 **feat/chrome-extension**, HEAD **afa2ef8**. 이번 세 커밋은 **f4283ba → 27a6b3a → afa2ef8** 순서이며 원격 push는 하지 않았다.
- `extension/`은 커밋 완료. 고객사 선택·대시보드와 Google·Bing 사이트맵 제출 API·화면까지 구현돼 있다.
- 마지막 커밋 사본 검증: 백엔드 **647 passed**, 프론트 **42 passed**, TypeScript·Vite 빌드 통과. 다른 시점 테스트와 합산하지 않는다.
- 개발 DB는 이번 인계 확인 기준 **0003**, **error_code 컬럼 존재**. 해당 마이그레이션 소스는 여전히 미추적이며 이번 요청에서 적용한 것은 아니다.
- 남은 미커밋은 인증 오류 코드 관련 소스·테스트·0003·문서, pgAdmin compose, 기존 라우터 설명 주석이다. 임의로 되돌리거나 커밋하지 않는다.
- 대시보드의 Google 색인 0개는 **메인페이지 제외·등록 글 0개** 때문임을 확인했다. 메인페이지는 Google indexed다. 메인페이지 상태 분리 표시는 개선 후보이며 아직 구현 요청은 없다.
- 이번 인계 요청은 **docs/HANDOFF.md만 갱신**했다. 문서 커밋·push·DB 변경·외부 검색엔진 호출은 하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약과 맨 아래 최신 상태를 읽고 이어서 진행해줘. feat/chrome-extension의 HEAD는 afa2ef8이고 프론트·대시보드·사이트맵을 세 커밋으로 나눴어. 개발 DB는 0003·error_code 있음이 확인됐지만 인증 오류 코드와 마이그레이션 소스는 아직 미커밋이야. 대시보드는 등록 글만 집계해 메인페이지 색인과 숫자가 다를 수 있으니 구분해줘. 실제 외부 제출을 테스트 목적으로 반복하지 마.”**


## 과거 마지막 상태 — 2026-11-04

- 브랜치 **feat/chrome-extension**, HEAD **afa2ef8 — [feat] Google·Bing 사이트맵 제출 API와 화면 연결**.
- 사이트맵은 `POST /sites/{main_site_id}/sitemaps`와 프론트 버튼 연결까지 완료했다. `/pages`에 자동 제출을 추가하지 않는다.
- 성공은 초록색 `#27775f`, 실패는 빨간색. 실패 메시지 조합은 `extension/src/main.ts`의 `submitSitemap()` catch, 현재 약 868~872줄이다.
- 개발 DB를 읽기 전용으로 재확인: **0003**, **error_code 컬럼 존재**. 다만 0003 파일과 인증 오류 코드 변경은 미커밋이다.
- 대시보드·Chrome Manifest V3 실행 구성·extension/은 커밋되어 있다. app/main.py의 미커밋 라우터·주석 변경도 보존한다.
- 검증 기록: 사이트맵 신규 백엔드 38 passed, 당시 전체 백엔드 650 passed, 버튼 연결 후 프론트 42 passed·빌드 통과. 색상 변경 후에는 diff 검사만 수행했다.
- 현재 요청에서는 docs/HANDOFF.md만 갱신했다. 커밋·push·실제 검색엔진 요청·DB 변경은 하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약을 읽고 이어서 진행해줘. HEAD는 afa2ef8이고 사이트맵 API·프론트 버튼은 완료됐어. DB는 0003과 error_code 컬럼이 확인됐지만 관련 마이그레이션·인증 오류 코드 변경은 아직 미커밋이야. 기존 변경을 보존하고, 신규 도메인 등록·소유권 확인은 현재 범위에서 제외해.”**


## 마지막 상태 — 최신 / 2026-11-04 커밋·PR 정리

- 작업 브랜치는 **feat/chrome-extension**, PR 대상은 **main**이다. 기존 프론트·대시보드·사이트맵 커밋 위에 오류 코드 **037a394**, pgAdmin **988fb0d**, 문서·main 동기화 커밋을 순서대로 추가한다. 최신 HEAD는 `git log -1`로 확인한다.
- 오류 코드와 **0003 소스도 커밋 완료**다. 개발 DB는 0003·error_code 있음이 확인됐으며 기존 데이터는 보존했다.
- 마지막 검증은 **백엔드 650개**, **프론트 42개**, TypeScript·Vite 빌드·Compose 설정·diff 공백 검사 통과다. 실제 엔진 호출은 하지 않았다.
- main의 문서 변경과 HANDOFF 충돌을 해결해 PR에 반영한다. 기존 AI 로그인봇 실험과 네이버 실로그인은 범위 밖이며, 브라우저 작업 전 실행 기록 규칙을 확인한다.
- 사용자 승인 범위는 이 브랜치 push와 main 대상 PR 생성까지다. 원격 PR URL·상태는 `gh pr view`로 확인하며 main 직접 push·PR 병합을 하지 않는다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최신 인계 요약을 읽고 이어서 진행해줘. feat/chrome-extension에서 오류 코드·0003·pgAdmin까지 커밋했고 main 대상 PR 생성 작업을 진행했어. gh pr view와 git status로 최종 원격 상태를 먼저 확인해줘. DB·실제 검색엔진 상태를 테스트 목적으로 바꾸지 말고 신규 도메인 등록·소유 확인은 현재 범위에서 제외해.”**
