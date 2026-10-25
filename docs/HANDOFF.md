# 작업 인계 문서

작성일: 2026-10-25 (Asia/Seoul)
프로젝트: StartPress 검색엔진 등록·발행 알림·색인 모니터링 자동화
작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`

## 가장 먼저 확인할 사항

1. **개발 환경은 Miniconda의 `startpress`다. 프로젝트 내부 venv는 사용하지 않는다.**
2. **사용자가 GitHub 연결·초기 업로드를 재개하도록 요청했다. 원격은 StartPress26/webmaster-automation이다. 이후 개발은 작업 브랜치와 PR을 사용한다.**
3. 공식 API 검증은 완료했지만, 본제품의 FastAPI 서버·화면·워커는 아직 구현하지 않았다.
4. 실제 색인 완료와 API 요청 성공은 별개다. 저장된 결과는 각 호출 당시의 관측이며 현재 상태를 의미하지 않는다.

## 목표와 합의된 방향

회사 팀원이 고객사 블로그 URL을 입력하고 다음 업무를 처리하는 내부 웹 어드민을 만든다.

1. 신규 사이트 등록·소유 확인.
2. 글의 신규 발행·수정·삭제 사실을 검색엔진에 통지.
3. 크롤링·색인 상태를 가능한 범위에서 관측하고 필요한 수동 작업 안내.

공식 API를 중심으로 구현한다. 브라우저 조작으로 등록·검사 기능을 대신하지 않는다. 브라우저는 최초 계정 설정·OAuth 로그인·동의에 사용했다. 파일 배포와 계정 권한 등 API 외부의 준비 단계는 별도로 관리해야 한다.

추천 설계는 FastAPI + PostgreSQL + Celery/Redis이며, 내부 화면은 Jinja2/HTMX로 작게 시작하는 방향이다. 이 스택의 서버·큐·DB 환경은 아직 설치·구현하지 않았으므로 다음 세션에서 실제 MVP 범위를 정한 뒤 진행한다.

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
- FastAPI 앱·DB 연결·마이그레이션·워커·스케줄러·웹 화면은 아직 없다.

## 다음에 해야 할 작업

1. 본개발 MVP 범위를 먼저 확정한다.
2. 기존 Google 인증 코드와 테스트를 제품 구조에 맞게 함께 옮기고, 엔진별 API 어댑터를 구현한다.
3. 작은 실행 흐름인 ‘URL 입력 → 작업 저장 → IndexNow 통지 → Google 검사 → 결과 표시’부터 완성한다.
4. 등록·소유 확인·URL 통지·색인 관측을 별도 상태로 관리한다. 401/403/429·타임아웃을 미색인으로 변환하지 않는다.
5. 다음 단계에서 큐·스케줄러·재시도·CMS 연동을 추가한다. 외부 제출 요청의 정확히 한 번 실행을 보장한다고 가정하지 않는다.
6. 이후 기능 개발은 작업 브랜치에서 진행하고, 커밋 전 비밀정보 제외 여부를 확인한다.

## Git 상태 — 초기 업로드 재개

- 원격: `https://github.com/StartPress26/webmaster-automation.git`.
- 사용자가 초기 main 업로드 명령을 제시했다가 환경 설정을 위해 보류했고, 이후 ‘그럼 이제 깃으로 연결해’라고 재개 요청했다.
- 기존 원격 이력이 없는 것을 확인한 뒤 로컬 Git을 초기화하고 `origin`을 연결했다.
- 초기 브랜치: `main`. README·환경 예시·검증 코드·테스트·인계 문서를 초기 업로드 대상으로 준비했다.
- 사용자 요청에 따라 DB 설계 자료는 업로드에서 제외하고 로컬에만 보관한다.
- `.env`, `.secrets/`, 가상환경·캐시는 제외한다. `.env.example`에는 비밀값 없이 설정 항목과 경로만 둔다.
- 최신 커밋과 원격 동기화 여부는 `git log -1 --oneline`, `git status -sb`로 확인한다.
- 이번 초기 업로드는 사용자가 제시한 main 푸시 요청의 재개다. 이후에는 기존 사용자 규칙에 따라 main/master에 직접 푸시하지 않고 작업 브랜치·PR을 사용한다.

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
- `.env`의 설정 항목은 `GOOGLE_OAUTH_CLIENT_FILE`, `GOOGLE_TOKEN_FILE`, `BING_API_KEY`다. 값은 문서에 복사하지 않는다.
- 이미 삭제한 `.secrets/google-site-verification.json`, `google-site-ownership-result.json`, `bing-target-site.json`을 코드가 읽는다고 가정하지 않는다. 재검증 시 필요하면 API에서 다시 받는다.
- 로컬 응답 기록을 삭제한 것과 **블로그의 공개 검증 파일**을 삭제하는 것은 다르다. 배포된 공개 검증 파일은 유지한다.
- 중복 Google/Bing 개별 결과 JSON은 삭제했다. 원래 관측 필드는 현재 엔진별 통합 JSON 안에 보존돼 있다.
- 같은 URL을 색인 확인 목적으로 반복 제출하지 않는다. 통지와 상태 조회를 구분한다.
- 현재 조회 대상은 `google_probe.py`의 `TARGET_SITE`에 고정돼 있다. 제품 구현에서는 입력 검증·사이트 권한 검사를 포함해 일반화해야 한다.

## 관련 파일

| 파일 | 용도 |
|---|---|
| [environment.md](environment.md) | Conda 실행·복원 방법 |
| [../google_probe.py](../google_probe.py) | OAuth·Google 사이트 목록 검증 코드 |
| [../tests/test_google_probe.py](../tests/test_google_probe.py) | 로컬 보호 동작 테스트 4개 |
| [../pyproject.toml](../pyproject.toml) | Python·의존성·pytest 설정 |
| [../uv.lock](../uv.lock) | 정확한 의존성 버전·해시 |
| [../outputs/phase0-api-verification-report.ko.md](../outputs/phase0-api-verification-report.ko.md) | 0단계 전체 검증 보고서 |
| [../outputs/google-api-verification-result.ko.md](../outputs/google-api-verification-result.ko.md) | Google 상세 보고서 |
| [../outputs/google-api-verification-status.json](../outputs/google-api-verification-status.json) | Google 통합 응답·검증 상태 |
| [../outputs/bing-api-verification-status.json](../outputs/bing-api-verification-status.json) | Bing 통합 응답·검증 상태 |
| [../outputs/indexnow-api-test-result.json](../outputs/indexnow-api-test-result.json) | IndexNow 최종 200 및 과거 202 이력 |

요구사항 원문: [Notion — Indexing 자동화](https://app.notion.com/p/Indexing-4034977b8e6980c2b41cc0e5a841c914).
이전에는 Notion 연결 도구가 404였지만 로그인된 Notion 앱에서 읽을 수 있었다. 원문에 접근하지 못하면 검증 보고서와 이 문서의 요구사항을 우선 참고한다.

## 마지막 상태

- 브랜치: `main` — 사용자 요청에 따라 초기 Git 연결·업로드 재개.
- 마지막 커밋: 이 문서를 포함한 초기 커밋. 정확한 SHA는 `git log -1 --oneline`로 확인.
- 실행 환경: **Miniconda `startpress` / Python 3.13.17**.
- 의존성 검사: `No broken requirements found.`
- Conda 환경에서 테스트: **4 passed**, 사용자 전역 패키지 비활성화 확인.
- 최초 인계 작성 후 사용자가 Git 연결·초기 업로드를 재개했다. 이 문서 갱신에서 API 재호출·토큰 출력은 하지 않았다.

새 세션에서: **‘docs/HANDOFF.md 읽고, Miniconda startpress 환경에서 이어서 작업해줘.’**
