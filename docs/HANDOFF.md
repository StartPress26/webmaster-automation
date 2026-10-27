# 작업 인계 문서

## 최신 추가 진행 — 2026-10-27

- 메인 사이트 등록 스키마·서비스·라우터·DB 검증을 완료했다. 아래 2026-10-26 기록의 미구현 설명보다 이 기록을 우선한다.
- `app/schemas/site.py`: SiteCreate·SiteRead·SiteList, HTTP·HTTPS URL 정규화와 UTF-8 2,048바이트 제한, 서버 지정 필드 입력 차단, can_edit_site의 true/false/null 구분.
- `app/services/site.py`: 고객사 존재 확인 후 target_type="site", parent_site_id=None으로 저장한다. 고객사 키 공유 잠금과 uq_sites_client_url 대상 ON CONFLICT DO NOTHING으로 삭제 경합·동시 중복에 대응한다. 서비스 예외는 고객사 없음과 중복 URL을 구분한다.
- `app/api/sites.py`를 `app/main.py`에 연결했다. POST /sites는 201·404·409·422를 반환하며 GET /sites는 client_id 필수, limit 1~100(기본 100), offset 0 이상(기본 0)을 지원한다. 목록은 메인 사이트만 반환하며 없는 고객사의 목록은 빈 items다.
- 스키마 30개, 사이트 서비스 7개, 사이트 API 17개 테스트를 추가했다. 전체 81개 테스트를 임시 PostgreSQL DB에서 검증했다.
- 검증 명령: `RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider`.
- API는 고객사·사이트 정보의 DB 저장·조회 범위이며 검색엔진 등록을 실행하지 않는다. 프론트 폼은 이 API와 별도 커밋으로 정리한다.
- 사용자 요청으로 로컬 main에 커밋한다. 다른 세션의 엔진 구현·관련 테스트, 로컬 ERD 자료는 제외하고 원격 푸시는 하지 않는다. 공동 작성자 트레일러를 추가하지 않는다.

최종 갱신일: 2026-10-26 (Asia/Seoul)
프로젝트: StartPress 검색엔진 등록·발행 알림·색인 모니터링 자동화
작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`

## 가장 먼저 확인할 사항

1. **개발 환경은 Miniconda의 `startpress`다. 프로젝트 내부 venv는 사용하지 않는다.**
2. **현재 브랜치는 `main`이다. DB 구성과 고객사 API는 이미 커밋됐다. 사용자 요청으로 이번 설명 주석·규칙·인계 문서도 로컬 main에 커밋하며 원격 푸시는 하지 않는다. main/master 직접 푸시 금지는 유지한다.**
3. 0단계 API 검증, FastAPI 기본 앱, Docker PostgreSQL, DB 모델·초기 마이그레이션, 고객사 등록·목록 API까지 완료했다. 메인 사이트 등록은 스키마·URL 검증만 작성했으며 미커밋이다. 화면·워커는 아직 없다.
4. 실제 색인 완료와 API 요청 성공은 별개다. 저장된 결과는 각 호출 당시의 관측이며 현재 상태를 의미하지 않는다.

## 목표와 합의된 방향

회사 팀원이 고객사 블로그 URL을 입력하고 다음 업무를 처리하는 내부 웹 어드민을 만든다.

1. 신규 사이트 등록·소유 확인.
2. 글의 신규 발행·수정·삭제 사실을 검색엔진에 통지.
3. 크롤링·색인 상태를 가능한 범위에서 관측하고 필요한 수동 작업 안내.

공식 API를 중심으로 구현한다. 브라우저 조작으로 등록·검사 기능을 대신하지 않는다. 브라우저는 최초 계정 설정·OAuth 로그인·동의에 사용했다. 파일 배포와 계정 권한 등 API 외부의 준비 단계는 별도로 관리해야 한다.

추천 설계는 FastAPI + PostgreSQL + Celery/Redis이며, 내부 화면은 Jinja2/HTMX로 작게 시작하는 방향이다. 현재 FastAPI 기본 앱과 로컬 Docker PostgreSQL 18.6은 구현·실행 검증을 마쳤다. Redis·Celery·스케줄러·웹 화면은 아직 설치·구현하지 않았다.

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
- [x] 실제 DB의 sites 컬럼·제약을 읽기 전용으로 확인하고 메인 사이트 스키마·URL 검증 작성. 해당 구현은 미완성이므로 커밋 제외.

## API 검증 결과와 실제 한계

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
- 소유 확인·사이트맵 제출·색인 검사·Bing 요청은 개별 Python 실행으로 검증했다. 제품용 재실행 워크플로로 구현돼 있다고 가정하면 안 된다.
- 테스트 4개는 인증파일 경로 제한, 공식 인증 엔드포인트 검증, 토큰 저장 권한, 결과 요약 시 다른 사이트·오류 본문 제외를 검증한다.
- FastAPI 기본 앱(`/health`), 비동기 DB 연결·세션, 4개 SQLAlchemy 모델, Alembic 초기 마이그레이션, 고객사 생성·목록 API를 구현했다. 워커·스케줄러·웹 화면은 아직 없다.
- 고객사 API는 `app/schemas/client.py` → `app/api/clients.py` → `app/services/client.py` → 요청별 DB 세션으로 연결된다. 등록 성공은 201, 입력 오류는 422다. 목록은 생성 시각·ID 순이며 limit(1~100, 기본 100)·offset(0 이상)을 지원한다.
- 고객사 서비스는 `session.begin()` 안에서 저장·응답 변환을 수행하고 정상 종료 시 커밋한다. `get_db()` 자체는 커밋하지 않고 세션 제공·정리를 담당한다.

## 진행 중인 작업 — 메인 사이트 등록 (커밋 제외)

- [x] 1단계: `app/schemas/site.py`에 SiteCreate·SiteRead·SiteList 작성.
- [x] 2단계: HTTP·HTTPS URL 검증·정규화, 저장 문자열의 UTF-8 2,048바이트 제한 적용.
- [ ] 3단계: 고객사 존재 확인·메인 사이트 저장·목록 조회 서비스.
- [ ] 4단계: POST /sites·GET /sites 라우터 및 앱 연결.
- [ ] 5단계: 201·404·409·422 응답 및 PostgreSQL 통합 테스트.
- [ ] 이후: 고객사 선택·사이트 등록 화면.

작성한 요청 스키마는 client_id·name·url·owner_type 필수, cms_type·can_edit_site 선택이다.
can_edit_site는 엄격한 true/false/null만 허용한다. target_type·parent_site_id·is_active는
사용자가 보낼 수 없게 막았다. 서비스 구현 시 target_type="site", parent_site_id=None을
서버에서 설정해야 한다. SiteRead는 메인 사이트만 표현한다.

URL은 호스트·스킴을 정규화하고 `/blog/` 경로와 쿼리는 유지한다. 잘못된 스킴·호스트,
공백·제어 문자·역슬래시·사용자 인증정보·프래그먼트(#...)를 거부한다. 외부 URL 접속이나
고객사 존재·중복 검사는 아직 하지 않는다. 이는 URL 형식 검증이며 SSRF 방어 완료를 뜻하지 않는다.

`app/schemas/site.py`, `tests/test_site_schemas.py`는 사용자 요청에 따라 **미추적 로컬 파일로 보존**한다.
새 체크아웃에는 없을 수 있으므로 다음 세션에서 존재 여부를 확인한다. 미완성이라는 이유로 삭제하지 않는다.

## 다음에 해야 할 작업

1. **메인 사이트 등록의 3단계 서비스부터 이어서 구현한다.** 로컬 SiteCreate/Read/List와 Site 모델을 먼저 확인한다. 트랜잭션 안에서 고객사 존재를 확인하고 저장하며, 없는 고객사는 404, 동일 고객사·정규화 URL 중복은 409로 처리한다. 동시 등록 충돌도 DB 제약에 맞춰 처리한다.
2. POST /sites와 GET /sites?client_id=...를 연결한다. 목록은 target_type="site"만 조회하고 고객사 필터·limit·offset을 지원한다. 서비스·라우터·오류 응답·실제 DB 저장 테스트가 완료된 뒤 site 작업을 별도 커밋한다.
3. 이후 고객사 선택 화면·사이트 등록 폼과 개별 글 추가를 구현한다. client_id는 모든 URL에서 필수다. 글 추가 시 부모를 조회해 고객사·소유 구분을 서버에서 채우는 기존 입력 흐름을 따른다. 외부 URL 접근 기능을 추가할 때 사이트 제어 범위와 SSRF 방어를 별도로 검증한다.
4. 검증용 Google 코드와 응답을 참고해 엔진별 실제 어댑터를 구현한다. `app/engines/` 파일의 존재만으로 API 연동 구현 완료라고 판단하지 않는다.
5. URL 변경 이벤트 → 제출 작업 저장 → IndexNow 공통 통지 → Google 상태 조회를 연결한다. Naver/Bing에 같은 변경을 중복 전송하지 않도록 실행 경로별 중복 방지를 별도로 구현한다. 현재 4개 테이블만으로 제출·재시도·관측 이력이 관리되는 것은 아니다.
6. 이후 상태 이력·작업 큐·스케줄러·재시도·대시보드를 추가한다. API 오류를 미색인으로 치환하지 않으며 외부 제출의 정확히 한 번 실행을 보장한다고 가정하지 않는다.
7. 미커밋 site 작업·빈 엔진 파일·로컬 ERD 자료를 보존한다. 이후 개발은 작업 브랜치·PR을 기본으로 하고, 이번 로컬 main 커밋 요청을 main 직접 푸시 승인으로 해석하지 않는다. 공동 작성자 트레일러를 넣지 않는다.

## Git 상태 — DB·고객사 API 커밋 완료

- 원격: `https://github.com/StartPress26/webmaster-automation.git`.
- 초기 main 업로드는 과거의 사용자 요청으로 완료했다. 현재 Git 연결이나 초기 업로드를 다시 실행할 필요는 없다.
- 기존 원격 이력이 없는 것을 확인한 뒤 로컬 Git을 초기화하고 `origin`을 연결했다.
- 주요 기존 커밋: `dd30267` 초기 구성, `9f47662` DB 모델·마이그레이션, `9099c96` 고객사 등록·목록 API. 현재 브랜치는 main이다.
- 사용자 요청으로 설명 주석·가독성 개선·주석 규칙과 최신 인계를 로컬 main에 두 커밋으로 정리한다. 실제 마지막 SHA와 origin 대비 상태는 `git log -3 --oneline`, `git status -sb`로 확인한다.
- 커밋 제외: `app/schemas/site.py`, `tests/test_site_schemas.py`(미완성 site 구현), `app/engines/*.py`(0바이트 자리표시자), `outputs/startpress-db-erd.png`, `outputs/db-erd-prompt.txt`(로컬 DB 설계 자료).
- 사용자 요청에 따라 DB 설계 자료는 업로드에서 제외하고 로컬에만 보관한다.
- `.env`, `.secrets/`, 가상환경·캐시는 제외한다. `.env.example`에는 비밀값 없이 설정 항목과 경로만 둔다.
- 최신 커밋과 원격 동기화 여부는 `git log -1 --oneline`, `git status -sb`로 확인한다.
- 현재는 main/master에 직접 푸시하지 않고 작업 브랜치·PR을 사용한다. 과거의 초기 업로드 요청을 새 main 푸시의 승인으로 해석하지 않는다.

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
- 이전 DB 인계에서 컨테이너 healthy와 Alembic `0001 (head)`를 확인했다. 이번 작업에서는 실제 sites 컬럼·제약을 읽기 조회로 확인했고, 테스트용 별도 DB에 마이그레이션을 적용해 검증했다.
- 기본 실행은 `docker compose up -d --wait db`, 일반 종료는 `docker compose stop db`다.
- 데이터 볼륨을 삭제하는 종료 명령은 사용하지 않는다. 초기화 이후 비밀번호는 .env 값만 바꿔도 DB에 반영되지 않는다.

### 확정한 테이블 4개

1. `clients`: id(UUID), name, manager_name(선택), created_at.
2. `sites`: 메인 사이트와 개별 글을 모두 저장. client_id는 필수이고 target_type은 site/page다. 글의 parent_site_id는 같은 테이블의 메인 사이트를 참조한다. URL은 이 테이블에 저장하며 상태 테이블에 중복 저장하지 않는다.
3. `engine_registrations`: 메인 사이트·엔진별 등록과 소유권 확인을 한 상태로 관리. main_site_id는 메인 사이트만 참조한다.
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
- `app/main.py`: `/health`와 고객사 라우터 연결, lifespan에서 사용한 DB 연결 풀 정리.
- `app/api/clients.py`, `app/services/client.py`: 고객사 등록·목록 요청 처리와 DB 저장·조회.
- `app/models/`: Base와 4개 모델. 관계는 외래키로 정의했으며 ORM relationship 편의 속성은 아직 없다.
- `alembic.ini`: 경로·로그 설정만 저장. 연결 주소나 비밀번호를 넣지 않는다.
- `migrations/env.py`: .env와 Base.metadata 연결. 테스트는 Config.attributes로 임시 DB URL을 주입한다.
- `migrations/versions/0001_create_tracking_tables.py`: 테이블·인덱스·제약·검증 트리거 생성과 downgrade.
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

이번 종료 작업에서 커밋 대상 기준으로 기본·기존 Google 테스트 8개와 PostgreSQL 통합
테스트 19개(고객사 API 6개 포함)를 재실행해 **27 passed**를 확인했다.
미커밋 site 스키마 테스트는 앞선 구현 검증에서 **30 passed**였고, 당시 DB 없는 전체
기본 테스트는 **38 passed**였다. site 테스트는 이번 커밋 대상 검증 명령에서 제외했다.
- `alembic current`: 0001 (head).
- `alembic check`: No new upgrade operations detected.
- FastAPI용 실제 get_db 세션으로 SELECT 1 성공.
- 기존 `/health`: HTTP 200, status=ok.
- compileall·git diff --check 통과, pip check: No broken requirements found.

```bash
# 커밋된 코드의 기본·DB 통합 테스트 (미커밋 site 테스트 제외)
RUN_POSTGRES_TESTS=1 conda run -n startpress python -m pytest -q tests/test_google_probe.py tests/test_database_config.py tests/integration

# 로컬 site 작업까지 포함한 DB 없는 테스트
conda run -n startpress python -m pytest -q -m 'not integration'
```

통합 테스트는 개발 DB를 지우지 않는다. UUID 이름의 임시 DB를 생성해 초기 마이그레이션,
중복 상태 차단, 잘못된 부모 참조 차단, 글의 등록 정보 차단, 부모 유형 변경 차단,
삭제 제한, NULL 보존, downgrade/upgrade와 모델 일치를 검증한 뒤 자신이 만든 임시 DB만 삭제한다.
이를 위해 로컬 계정에 CREATE DATABASE 권한이 필요하다.

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
기존 인계 기록에는 2026-10-26 19:03 KST에 **Notion 연결 도구의 `fetch`로 본문 조회 성공**한 것으로 남아 있다. 이번 인계 갱신에서는 Notion을 재조회하지 않았다. 과거의 404를 영구적인 접근 불가로 간주하지 않는다. 다음 세션에서도 위 링크 또는 페이지 ID `4034977b-8e69-80c2-b41c-c0e5a841c914`로 조회한다. 접근 권한은 달라질 수 있으므로 실패하면 검증 보고서와 이 문서의 요구사항을 우선 참고한다.

조회한 원문에는 요구사항 1·2·3, 엔진별 자동화 조사, DB 설계(`clients`, `sites`, `engine_registrations`, `site_engine_statuses`), ‘사용자가 처음 넣어줘야 하는 정보’가 포함되어 있다. 입력 흐름은 다음과 같다.

- 고객사 등록: 고객사 이름과 선택적인 담당자 이름 입력.
- 메인 사이트 등록: 고객사 이름 목록에서 선택하되 서버에는 `client_id` 전달. 사이트 이름·URL·소유 구분과 선택적인 플랫폼·인증 파일/태그 설치 가능 여부 입력. 설치 가능 여부는 가능/불가능/모름을 `true`/`false`/`NULL`로 저장.
- 개별 글 등록: 등록된 메인 사이트 상세에서 ‘글 추가’로 제목·URL 입력. 선택한 부모 ID를 요청에 포함하고, 서버가 부모에서 고객사·소유 구분을 가져와 `target_type=page`로 설정.

Notion은 요구사항·설계 자료다. 실제 구현·적용 여부는 아래 최신 DB 구현 상태와 코드·Alembic 버전을 기준으로 확인한다. 원문의 브라우저 자동화 제안은 이 문서의 공식 API 중심 합의와 구분한다. 이번 확인에서는 Notion 본문 수정이나 연결·권한 변경을 수행하지 않았다.

## 마지막 상태

- 갱신일: **2026-10-26 / Asia/Seoul**.
- 작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`.
- 현재 브랜치: **main** — 사용자가 로컬 main 커밋을 명시적으로 요청했다.
- 기존 기능 커밋: **9099c96** — `[feat] 고객사 등록 및 목록 조회 API 구현`.
- 설명 주석·규칙 커밋: **d359a15** — `[refactor] DB 세션 생성 흐름과 한국어 주석 규칙 정리`. 이 인계 문서를 담은 후속 커밋의 SHA는 `git log -1 --oneline`으로 확인한다.
- origin: `https://github.com/StartPress26/webmaster-automation.git`.
- 종료 커밋 구성: `[refactor] DB 세션 생성 흐름과 한국어 주석 규칙 정리`(AGENTS.md·config.py·database.py), `[docs] 고객사 API 완료와 사이트 등록 인계 갱신`(이 문서). 원격 푸시는 하지 않는다.
- 남기는 미추적 파일: `app/schemas/site.py`, `tests/test_site_schemas.py`, 빈 `app/engines/*.py`, 로컬 ERD 이미지·프롬프트. 삭제하거나 전체 add로 커밋하지 않는다.
- 실행 환경: **Miniconda startpress**, .venv 사용 금지.
- DB: **PostgreSQL 18.6 / 초기 마이그레이션 0001**. 임시 DB에서 마이그레이션 재적용·모델 일치 검증 통과.
- 마지막 종료 검증: **기본 8 + 통합 19 = 27 tests passed**. 로컬 site 작업은 별도로 30개 테스트 통과 이력이 있다.
- 다음 구현 단위: **메인 사이트 저장·조회 서비스(계획의 3단계)**. 로컬 미커밋 스키마·테스트를 먼저 확인한다.

새 세션에서: **‘docs/HANDOFF.md 읽고, 로컬 미커밋 site 파일을 보존하면서 Miniconda startpress 환경에서 메인 사이트 등록 서비스부터 이어서 진행해줘.’**
