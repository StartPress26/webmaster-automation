# webmaster-automation

> **실험 보존 브랜치:** AI 로그인봇은 운영 경로로 채택하지 않았습니다. 이 브랜치는 main에 병합하지 않고 보존합니다. 2026-11-03부터 Chrome 확장 프로그램 방식으로 전환하며, 구현은 아직 시작하지 않았습니다. 최신 결정과 수동 로그인 실험 결과는 [인계 문서](docs/HANDOFF.md)의 첫 절을 확인하세요.

StartPress 내부 운영용 검색엔진 사이트 등록·발행 알림·색인 모니터링 프로젝트입니다.
FastAPI 관리 화면과 Google·Bing API 어댑터, 공통 IndexNow 알림, AI 브라우저 로그인봇 실험 코드를 보존하고 있습니다.

**API 접수 성공·브라우저 로그인 성공·실제 검색엔진 색인 완료는 각각 별도로 확인합니다.**

## 현재 구현 상태

| 영역 | 구현 범위 |
| --- | --- |
| 관리 화면·API | 고객사 생성·목록, 메인 사이트 생성·목록, 사이트별 IndexNow 설정 저장 |
| Google | OAuth 인증, 속성 조회·추가, FILE 소유 확인, 사이트맵 제출, URL 색인 상태 검사 |
| Bing | 사이트 조회·등록, 소유 확인 파일 안내·검증, 사이트맵 제출, URL 수집 상태 조회 |
| IndexNow | 검증된 URL 목록을 한 번 전송하는 공통 클라이언트·발행 알림 서비스 |
| 로그인봇 | 인증 상태 복원, AI 입력·클릭·스크롤·대기, 코드 기반 성공 판정, 인증 상태 저장 |
| 네이버 로그인 | 실제 서치어드바이저 로그인·상태 저장·새 브라우저 복원 확인 |
| Google 로그인 | 어댑터·Discord 문자 인증 연결 구현. 실제 Google 로그인 성공은 미검증 |

엔진 어댑터는 관리 화면·API의 모든 기능에 연결된 상태가 아닙니다.
개별 글 저장과 발행 알림 연결, 제출·조회 결과의 DB 저장은 후속 작업입니다. 네이버 고정 조회 코드는 이 실험 브랜치에 구현돼 있습니다.

## 개발 환경

**Miniconda의 `startpress` 환경을 사용하며 프로젝트 내부 `.venv`는 사용하지 않습니다.**
새 컴퓨터의 환경 생성·고정 버전 의존성 설치는 [개발 환경 안내](docs/environment.md)를 참고하세요.
`pyproject.toml`과 `uv.lock`은 의존성 명세·잠금 기록입니다.

```bash
conda activate startpress
export PYTHONNOUSERSITE=1
```

제품 로그인봇은 설치된 Chrome을 실행합니다. 일부 로컬 브라우저 테스트에는 별도로 Chromium 설치가 필요합니다.

```bash
python -m playwright install chromium
```

## 환경변수와 인증정보

프로젝트 루트에서 예시 설정을 복사합니다. 기존 `.env`가 있다면 덮어쓰지 말고 필요한 항목만 추가하세요.

```bash
cp -n .env.example .env
mkdir -p .secrets
chmod 700 .secrets
chmod 600 .env
```

| 환경변수 | 용도 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_FILE` | Google OAuth 클라이언트 설정 파일 경로 |
| `GOOGLE_TOKEN_FILE` | OAuth 토큰 저장 경로. `.secrets/` 내부 사용 |
| `BING_API_KEY` | Bing Webmaster API 키 |
| `BROWSER_BOT_BASE_URL` | Chat Completions 호환 AI 게이트웨이 주소 |
| `BROWSER_BOT_MODEL` | 로그인 화면 판단에 사용할 모델 |
| `BROWSER_BOT_API_KEY_ENV` | API 키를 담은 환경변수의 **이름**. 기본값 `KONKUK_AI_API_KEY` |
| `KONKUK_AI_API_KEY` | 기본 학교 AI 게이트웨이의 실제 API 키 |
| `NAVER_LOGIN_ID`, `NAVER_LOGIN_PASSWORD` | 실행 코드가 읽어 `LoginCredentials`에 전달할 네이버 인증정보 |
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | 로컬 PostgreSQL 컨테이너 설정 |
| `DATABASE_URL` | FastAPI의 `postgresql+asyncpg://...` 연결 주소 |

실제 비밀번호·API 키는 `.env`, OAuth JSON·토큰·브라우저 인증 상태는 `.secrets/`에 보관합니다.
두 경로는 Git에서 제외되며 인증값·쿠키를 소스나 출력 자료에 복사하지 않습니다.

## 개발 서버 실행

`.env`의 DB 설정을 채우고 프로젝트 루트에서 실행합니다.

```bash
docker compose up -d --wait db
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- [관리 화면](http://127.0.0.1:8000/): 고객사·사이트 등록과 목록
- [API 문서](http://127.0.0.1:8000/docs)
- [상태 확인](http://127.0.0.1:8000/health): `{"status":"ok"}`

`/health`는 앱 응답만 확인하며 DB·검색엔진 API 연결을 검사하지 않습니다.
DB 구성과 관리 화면 사용법은 [DB 안내](docs/database-setup.md), [관리 화면 안내](docs/site-admin.md)를 참고하세요.

## Google API 인증과 고객사 권한

최초 OAuth 로그인·동의 후 접근 가능한 속성을 조회할 수 있습니다.

```bash
python google_probe.py auth
python google_probe.py sites
```

`auth`는 실제 사용자 인증을 진행하고, `sites`는 실제 Google API를 호출합니다.
이 인증은 브라우저 로그인봇의 쿠키와 별개입니다.

고객사가 우리 Google 계정을 Search Console의 **전체 사용자(Full user)**로 추가했다면,
그 계정의 OAuth 토큰으로 속성 조회·URL 색인 상태 검사를 사용할 수 있습니다.
API 권한 값은 `siteFullUser`입니다. 사이트 권한과 OAuth 접근 범위를 모두 충족해야 하며
고객사 비밀번호를 받을 필요는 없습니다.
[권한 안내](https://support.google.com/webmasters/answer/7687615?hl=en),
[API 권한 값](https://developers.google.com/webmaster-tools/v1/sites).

현재 코드에는 다음 제한이 있습니다.

- `register_new_site()`는 소유자(`siteOwner`)가 아니면 소유 확인을 요구합니다.
  이미 권한을 받은 고객사 속성을 연결하는 흐름은 별도 보완이 필요합니다.
- `inspect_url()`은 현재 URL-prefix 속성(`https://example.com/`)만 처리합니다.
  Google API가 지원하는 도메인 속성(`sc-domain:example.com`)을 검사하려면 코드 보완이 필요합니다.
- 사이트맵 제출은 Google 권한 표에 Full user도 가능하다고 표시되지만,
  사이트맵 보고서 안내는 소유자를 요구합니다. 실제 Full user의 API 제출 가능 여부는 미검증입니다.
  [권한 표](https://support.google.com/webmasters/answer/7687615?hl=en),
  [사이트맵 안내](https://support.google.com/webmasters/answer/7451001?hl=en).

URL Inspection API는 Google에 저장된 색인 상태를 조회하며 실시간 URL 테스트나 색인 요청을 수행하지 않습니다.
[공식 API 설명](https://developers.google.com/webmaster-tools/v1/urlInspection.index/inspect).

## AI 브라우저 로그인봇

Python Playwright를 직접 사용합니다. Playwright MCP를 연결한 구조는 아닙니다.

```text
인증 상태 복원 → 사이트 접속·화면 준비 대기 → 로그인 여부 확인
    ├─ 인증됨 → AI 호출 없이 인증 상태 저장·Page 제공
    └─ 미인증 → 화면 관찰 → AI 판단 → 입력·클릭 등 실행 → 성공 재확인
```

**미인증 시 실제 로그인 ID·비밀번호와 화면을 설정된 외부 AI 서버에 전달합니다.**
AI가 입력·제출·추가 인증 대응을 판단하고, 최종 성공은 사이트별 코드가 확인합니다.
로컬 행동 기록에는 입력 텍스트·인증정보·원본 이미지·모델의 사용자 개입 사유를 보존하지 않습니다.
모델 요청의 `store=False`가 제공자 측의 모든 로그·보관을 통제한다는 의미는 아닙니다.

호출자는 `LoginCredentials`, 사이트 어댑터, `ModelClient`, `SessionKey`를 구성해
`authenticated_page(...)`를 `async with`로 사용합니다.
블록 안에서는 로그인된 `Page`로 조회를 이어가고, 블록 종료·예외 시 브라우저가 닫힙니다.
**아직 영구 실행 CLI나 관리 화면·API 진입점은 없습니다.** `.env` 설정만으로 자동 실행되지는 않습니다.

인증 상태는 `.secrets/browser_sessions/{site}/{account_id}.json`에 저장합니다.
`account_id`는 실제 로그인 ID 대신 사용하는 내부 식별자이며, 저장 파일이 서버의 세션 유효기간을 연장하지는 않습니다.

```text
app/login_bot/
├─ schemas.py       # 정책·결과·계정 식별자·인증정보·행동 형식
├─ session.py       # 인증 상태 파일 저장·복원
├─ model_client.py  # 비동기 AI API 통신
├─ login_agent.py   # 브라우저 수명·관찰·AI 행동 반복
└─ sites/
   ├─ base.py       # LoginSite 인터페이스
   ├─ naver.py      # 네이버 정책·화면 준비·성공 판정
   └─ google.py     # Google 어댑터 초안, 실제 계정 미검증
```

현재 조작 대상은 메인 탭의 DOM 요소입니다. iframe 내부·새 팝업·드래그·네이티브 패스키 조작은 미지원입니다.
일반적인 `requires_user` 종료 시 브라우저도 닫힙니다. 별도로 구현한 Google 문자 인증 분기는 Discord 제공자를 주입하면 같은 브라우저에서 대기·재개하지만, 실제 Google 인증 성공은 검증하지 못했습니다.

2026-10-31 네이버 실로그인에서는 AI 10회 호출 후 콘솔 진입·인증 상태 저장에 성공했고,
별도 브라우저에서 AI 호출 없이 저장 상태를 복원했습니다.
당시 발견한 초기 로딩 문제에 대해 현재 작업 트리에는 `wait_until_ready()` 처리가 추가되어 있습니다.
이 README 갱신에서는 해당 변경의 테스트나 실제 계정 검증을 다시 실행하지 않았습니다.

## 테스트

외부 검색엔진·AI를 호출하지 않는 로컬 테스트를 실행합니다.
브라우저 테스트에는 위 Chromium 설치가 필요합니다.

```bash
python -m pytest -q -m 'not integration'
```

PostgreSQL 통합 테스트는 로컬 DB 서버와 임시 DB 생성 권한이 필요합니다.
개발 DB와 별도의 임시 DB를 생성·정리합니다.

```bash
RUN_POSTGRES_TESTS=1 python -m pytest -q
```

과거 통과 수치와 실제 API 검증 결과는 [작업 인계](docs/HANDOFF.md)에 실행 범위별로 기록합니다.
프로젝트 전체 검증과 로그인봇 관련 검증 수치를 합쳐 해석하지 않습니다.

## 주요 자료

- [작업 인계](docs/HANDOFF.md)
- [개발 환경](docs/environment.md)
- [DB 구성](docs/database-setup.md)
- [관리 화면](docs/site-admin.md)
- [Bing 엔진](docs/bing-engine.md)
- [0단계 API 검증 보고서](outputs/phase0-api-verification-report.ko.md)

`outputs/`에는 민감정보를 제외한 검증 보고서와 통합 결과가 있습니다.
