# StartPress Console · webmaster-automation

StartPress 내부 운영용 검색엔진 상태 관리 도구입니다. Chrome 확장 프로그램에서 고객사·사이트·글 URL을 관리하고, FastAPI 서버와 로그인된 네이버·Bing 탭으로 수집·색인 상태를 조회합니다.

검색엔진에 이미 등록하고 접근 권한을 확보한 사이트를 대상으로 합니다. 사이트 정보의 DB 저장, 실제 블로그 발행, 검색엔진 알림 접수, 수집 확인, 색인 확인은 서로 다른 작업입니다.

## 구현된 기능

| 기능 | 현재 동작 |
|---|---|
| 고객사·사이트 관리 | 고객사·메인 사이트 등록과 목록, 사이트별 계정 연결 |
| 글 등록·발행 알림 | 부모 사이트에 글 제목·URL 저장, 선택 시 IndexNow 알림 |
| 상태 조회 | Google API 색인 조회, Bing API 크롤링 조회, 네이버·Bing GUI 색인 조회 |
| 고객사 전체 조회 | 활성 메인 사이트·활성 글을 확정한 뒤 API 순차 실행 → 네이버·Bing GUI 병렬 실행 |
| 결과 저장 | 엔진별 최신 요약 상태·확인 시각 저장과 재조회 |
| 대시보드 | 고객사별 블로그·글 수와 Google·Bing·네이버 저장 상태 집계 |
| 사이트맵 | 별도 버튼으로 Google·Bing에 명시적으로 제출 |
| 인증 계정 관리 | 이메일·비밀파일 참조 등록과 사이트 연결 정보 관리 |

- 각 GUI 엔진 안에서는 사이트·URL을 순차 처리합니다. 관측 저장이 끝난 뒤 다음 URL로 진행하며, 쓰기 요청은 자동 재시도하지 않습니다.
- `site_engine_statuses`는 같은 대상·엔진의 최신 요약 상태 하나를 유지합니다. Bing API·GUI는 같은 행을 공유합니다. 실행 목록과 GUI 판정 원문·대표 URL·제외 사유 등 상세 관측은 관리 탭 메모리에만 남습니다.
- 대시보드는 저장된 등록 글 상태를 집계합니다. 메인페이지는 제외하고 비활성 항목은 포함하며, 대시보드 조회 자체는 외부 검사를 실행하지 않습니다.
- IndexNow 접수 성공은 색인 완료가 아닙니다. Bing의 `crawled`는 `indexed`와 다르고, `unknown`은 미색인 확정이 아닙니다.
- 신규 도메인 등록·소유권 확인 워크플로, 자동 로그인, 주기 실행, 네이버·Bing GUI 수집 요청 자동화는 후속 범위입니다.

## 구성

```text
Chrome 확장 / Vite 개발 화면
  ├─ FastAPI → PostgreSQL
  │    ├─ Google OAuth → Search Console API
  │    ├─ Bing API 키 → Webmaster API
  │    └─ IndexNow → 발행 알림
  └─ 로그인된 네이버·Bing 작업 탭 → GUI 조회 → FastAPI에 요약 저장
```

Python 3.13·FastAPI·SQLAlchemy 비동기 세션·Alembic·PostgreSQL 18.6을 사용합니다. 프론트는 TypeScript·Vite·Chrome Manifest V3이며 Node.js 24 환경을 기준으로 사용합니다. 의존성은 `pyproject.toml`·`uv.lock`, `extension/package-lock.json`으로 관리합니다.

## 로컬 개발 시작

### 1. 환경과 설정 준비

Miniconda의 `startpress` 환경을 사용합니다. 새 컴퓨터에서는 먼저 [개발 환경 복원](docs/environment.md)을 따르세요. 프로젝트 내부 `.venv`를 만드는 `uv sync`·`uv run`은 사용하지 않습니다.

프로젝트 루트에서 실행합니다. 기존 `.env`가 있으면 값을 유지하세요.

```bash
conda activate startpress
export PYTHONNOUSERSITE=1
cp -n .env.example .env
mkdir -p .secrets
chmod 700 .secrets
chmod 600 .env
```

`.env`의 `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`을 설정합니다. 로컬 Compose는 pgAdmin 설정도 요구하므로 `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`를 함께 채웁니다. DB 비밀번호에 특수문자가 있으면 `DATABASE_URL`에서 URL 인코딩합니다.

### 2. DB와 API 실행

```bash
docker compose up -d --wait db
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 18001
```

- [API 문서](http://127.0.0.1:18001/docs): 요청·응답 스키마와 API 실행
- [상태 확인](http://127.0.0.1:18001/health): `{"status":"ok"}` 반환
- [기존 관리 화면](http://127.0.0.1:18001/): 고객사·사이트 등록용 서버 정적 화면

전체 대시보드는 아래 확장 프로그램 또는 Vite 화면에서 사용합니다. `/health`는 앱 응답만 확인하며 DB 연결이나 검색엔진 인증을 검사하지 않습니다.

현재 마이그레이션 소스의 head는 `0004`이며 인증 계정 테이블과 사이트별 계정 컬럼을 포함합니다. 실제 DB 적용 버전은 `python -m alembic current`로 확인합니다.

### 3. Chrome 확장 로드

```bash
npm --prefix extension ci
npm --prefix extension run build
```

1. Chrome의 `chrome://extensions`에서 개발자 모드를 켭니다.
2. **압축해제된 확장 프로그램 로드**로 `extension/dist`를 선택합니다.
3. StartPress 아이콘을 눌러 관리 탭을 엽니다.

설치된 확장은 `http://127.0.0.1:18001`로 직접 연결합니다. 변경 후에는 다시 빌드하고 확장·네이버/Bing 작업 탭을 새로고침한 뒤 관리 탭을 다시 엽니다. `.env`·토큰·API 키는 확장 패키지에 넣지 않습니다.

웹 화면 개발은 별도 터미널에서 실행합니다.

```bash
npm --prefix extension run dev
```

- [Vite API 모드](http://127.0.0.1:5173/): `/api`를 `127.0.0.1:18001`로 프록시합니다. 저장과 알림은 실제 요청입니다.
- [예시 모드](http://127.0.0.1:5173/?mode=demo): 서버 호출·DB 저장·외부 전송 없이 화면을 확인합니다.

저장소 기본 프록시는 `18001`입니다. `extension/vite.config.ts`의 프록시를 로컬 개발용 `http://127.0.0.1:8000`으로 바꿨다면 API도 `--port 8000`으로 실행하고 Swagger는 `http://127.0.0.1:8000/docs`를 사용하세요. 이 로컬 프록시 변경은 이번 커밋에서 제외하며, 설치된 확장의 API 주소 `18001`에는 영향을 주지 않습니다.

네이버·Bing GUI 자동 조회는 설치된 확장에서 사용합니다. Vite 화면에서는 API 조회 경로를 사용합니다.

## 사용 순서

1. 고객사를 등록·선택하고 해당 고객사의 메인 사이트를 등록합니다.
2. 글 제목·URL을 등록합니다. 발행 알림을 사용하려면 먼저 사이트의 IndexNow 키·키 파일 주소를 설정합니다. 알림을 해제하면 글만 저장할 수 있습니다.
3. 네이버 Search Advisor와 Bing Webmaster Tools에 직접 로그인하고 사이트에 접근 가능한 탭을 준비합니다.
4. **고객사 전체 색인 조회**에서 작업 탭을 확인·선택합니다. 탭 준비를 건너뛰고 API 조회만 진행할 수도 있습니다.
5. 저장된 결과와 대시보드를 확인합니다. 화면의 블로그·URL·엔진 필터는 전체 실행 범위를 제한하지 않습니다.

사이트맵 제출은 별도 작업이며 글 등록이나 전체 조회에 자동으로 포함되지 않습니다. 관리 탭을 닫거나 새로고침하면 진행 내역은 사라지고 자동 재개하지 않지만 서버에 저장된 요약 상태는 다시 조회할 수 있습니다.

## 검색엔진 인증과 계정 연결

| 설정 | 용도 |
|---|---|
| `GOOGLE_OAUTH_CLIENT_FILE` | 로컬 `google_probe.py`의 최초 사용자 동의용 OAuth 클라이언트 JSON |
| `GOOGLE_TOKEN_FILE` | 로컬 `google_probe.py`가 읽고 저장하는 OAuth 토큰 경로 (`.secrets/` 내부) |
| `auth_accounts.google_secret_ref` | 검사·사이트맵에서 사용하는 Google OAuth JSON의 상대 경로 |
| `auth_accounts.bing_secret_ref` | 검사·사이트맵에서 사용하는 Bing 키 JSON의 상대 경로 |
| 사이트별 IndexNow 키·파일 주소 | 발행 알림 설정. Bing API 키와 별개 |
| 로그인된 네이버·Bing 탭 | 확장의 GUI 조회. 로그인·추가 인증은 사용자가 직접 수행 |

Google 최초 인증·연결 확인에는 검증용 도구를 사용합니다.

```bash
python google_probe.py auth
python google_probe.py sites
```

이 도구는 `.env`의 `GOOGLE_OAUTH_CLIENT_FILE`·`GOOGLE_TOKEN_FILE`을 읽습니다. 계정별 파일을 발급할 때는 저장 경로를 `.secrets/google/<이메일>.json`으로 맞춥니다. `auth`는 토큰 파일이 없을 때 사용자 로그인·동의를 진행하고, 이미 있으면 기존 토큰을 확인·갱신합니다. 갱신 토큰이 거부되면 기존 파일을 비공개 위치에 백업해 대상 경로를 비운 뒤 재인증합니다. `sites`는 사이트 목록을 실제 조회합니다. 인증파일·키·토큰과 비공개 실행 기록은 Git에 포함하지 않습니다.

인증 계정 API는 이메일과 서버 비밀파일의 상대 경로 참조를 저장하며, 조회 시 이메일과 엔진별 참조 등록 여부만 반환합니다. 사이트 등록·변경 시 Google·Bing 계정을 연결할 수 있고 네이버 이메일은 참고 정보입니다. **검사·사이트맵은 메인 사이트의 엔진별 이메일 → 인증 계정의 파일 참조 → 비밀파일 순서로 인증정보를 선택합니다.** 개별 글 검사는 부모 메인 사이트의 계정을 사용합니다. 연결 계정이나 파일 참조가 없으면 503을 반환하며 공통 환경변수의 인증정보로 대체하지 않습니다. 인증파일 오류도 503으로 처리하고 비밀값은 응답·검사 이력에 저장하지 않습니다.

로컬 파일과 DB 참조는 다음처럼 대응합니다.

```text
.secrets/google/<이메일>.json  ← google_secret_ref: google/<이메일>.json
.secrets/bing/<이메일>.json    ← bing_secret_ref:   bing/<이메일>.json
```

Google은 OAuth 토큰 JSON 형식을 유지하며 갱신 후 선택한 파일에 저장합니다. 검사·사이트맵은 동일 프로세스의 갱신 잠금을 공유합니다. Bing 파일은 `{"api_key": "..."}` 형식이며 키가 비어 있거나 잘못된 형식이면 요청 전에 거부합니다. DB 참조에는 `.secrets/`나 절대 경로를 넣지 않습니다. 공통 로더는 상위 폴더 이동과 심볼릭 링크를 통한 기준 폴더 이탈을 차단합니다.

- `POST /auth-accounts`, `GET /auth-accounts`: 인증 계정 등록·목록 조회. 실제 키가 아닌 `google/<이메일>.json` 같은 상대 파일 참조를 받습니다. 중복 이메일 POST는 409이며 기존 참조를 갱신하지 않습니다. 파일 참조 변경 API는 아직 없습니다.
- `POST /sites`: 선택적인 Google·Bing·네이버 이메일과 함께 사이트를 등록합니다. Google·Bing 이메일은 인증 테이블에 존재해야 합니다.
- `PATCH /sites/{site_id}/auth-accounts`: 기존 메인 사이트의 계정 연결을 변경합니다. 생략한 필드는 유지하고 `null`은 연결 해제이며 빈 객체는 변경하지 않습니다. 없는 메인 사이트·개별 글·없는 인증 계정은 `404`, 잘못된 이메일은 `422`입니다.
- 사이트 등록 화면에서 계정을 선택하고, 고객사 관리 화면에서 기존 사이트의 계정을 변경할 수 있습니다. 참조 등록 여부는 파일 존재나 인증 성공을 의미하지 않습니다.

## Lightsail 운영 연결

운영 API는 SSH 터널을 통해 사용합니다. API의 팀원 인증·공개 HTTPS 연결은 후속 과제이며 서버 API는 localhost 바인딩을 유지합니다.

```text
확장 또는 Vite → 내 컴퓨터 127.0.0.1:18001
              → SSH 터널 → Lightsail 127.0.0.1:18000
              → API 컨테이너 :8000 → PostgreSQL
```

아래 자리표시자를 실제 SSH 키 경로와 현재 서버 주소로 바꿉니다. 로컬 개발 API와 SSH 터널은 같은 `18001` 포트를 동시에 사용할 수 없습니다.

```bash
ssh -i /path/to/lightsail-key.pem \
  -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:18001:127.0.0.1:18000 \
  ubuntu@YOUR_LIGHTSAIL_HOST
```

터널을 유지한 상태에서 `curl -fsS http://127.0.0.1:18001/health`로 연결을 확인합니다.

운영 구성은 `compose.prod.yaml`과 `.env.prod.example`에 있습니다. API·마이그레이션·DB를 함께 구성하며 기본 호스트 포트는 `18000`입니다. 서버 비밀폴더 `/home/ubuntu/webmaster-secrets`를 컨테이너의 `/srv/startpress/.secrets`로 연결합니다. 호스트의 `google/<이메일>.json`·`bing/<이메일>.json`을 준비하고 DB에는 같은 상대 경로를 등록합니다. 토큰 갱신을 위해 컨테이너 사용자 `10001:10001`에 Google 파일·상위 폴더 쓰기 권한이 필요합니다. 폴더·파일 권한은 각각 `700`·`600`으로 관리합니다. 운영 Compose는 공통 `GOOGLE_TOKEN_FILE`·`BING_API_KEY`를 요구하거나 API 컨테이너에 전달하지 않습니다.

사이트별 인증으로 전환할 때는 main 반영 후 서버 코드를 갱신하고 API 이미지를 빌드합니다. 같은 이미지로 마이그레이션을 적용해 `0004` 테이블·컬럼을 준비한 뒤, 계정별 파일·DB 참조·메인 사이트 계정을 연결하고 API를 재생성해 조회를 확인합니다. 연결이 없는 기존 사이트는 검사·사이트맵에서 503을 반환하므로 사용할 사이트의 계정 연결을 함께 준비해야 합니다. 로컬에서 갱신한 Google 파일은 서버에 자동 반영되지 않습니다.

로컬 자동 검증은 백엔드 단위 655개·검사 및 사이트맵 API의 임시 PostgreSQL 통합 81개가 통과했습니다. Google 재인증 후 에이전트가 Search Console 사이트 목록 HTTP 200을 확인했고, 사용자가 로컬 Google·Bing 검사 성공을 확인했습니다. 실제 사이트맵 제출과 Lightsail 운영 인증·배포는 아직 검증하지 않았습니다.

현재 배포 준비와 검증 범위는 [HANDOFF](docs/HANDOFF.md)의 **맨 위 현재 인계 요약**을 참고하세요. 코드 구현·로컬 빌드 완료는 서버 반영이나 운영 인증 성공을 뜻하지 않습니다.

## 주요 API

| 경로 | 메서드 | 용도 |
|---|---|---|
| `/clients` | GET·POST | 고객사 목록·등록 |
| `/clients/{client_id}/dashboard` | GET | 저장된 상태 통계 |
| `/auth-accounts` | GET·POST | 인증 계정 목록·등록 |
| `/sites` | GET·POST | 메인 사이트 목록·등록 |
| `/sites/{site_id}/auth-accounts` | PATCH | 기존 메인 사이트의 계정 연결 변경 |
| `/sites/{main_site_id}/indexnow-settings` | GET·PUT | IndexNow 설정 조회·교체 |
| `/sites/{main_site_id}/pages` | GET·POST | 글 목록·저장 및 선택적 알림 |
| `/sites/{site_id}/inspections` | GET·POST | 저장 결과 조회·새 Google/Bing API 검사 |
| `/sites/{site_id}/gui-inspections` | POST | 검증된 네이버/Bing GUI 요약 관측 저장 |
| `/sites/{main_site_id}/sitemaps` | POST | Google/Bing 사이트맵 제출 |

## 검증

프로젝트 루트에서 실행합니다. 기본 테스트는 실제 검색엔진 API를 호출하지 않습니다.

```bash
conda activate startpress
export PYTHONNOUSERSITE=1
python -m pytest -q -m "not integration"
npm --prefix extension test
npm --prefix extension run build
```

PostgreSQL 통합 테스트는 `CREATE DATABASE` 권한이 있는 로컬 DB에서 별도로 실행합니다. UUID 이름의 임시 DB를 생성하고 실행 후 정리합니다.

```bash
RUN_POSTGRES_TESTS=1 python -m pytest -q tests/integration
```

실제 브라우저 자동화·확장 검증 전에는 [실행 기록 규칙](.cursor/rules/bot-execution-records.mdc)을 읽고 민감값을 제거한 기록을 비공개 `.secrets/bot_runs/`에 남깁니다.

### 검증·배포 상태의 한계

- HANDOFF의 2026-11-10 기록에는 사용자가 Chrome Web Store 심사 제출을 완료했다고 확인한 내용이 있습니다. 승인·게시·팀원 설치 완료 여부는 별도 확인 대상입니다.
- 네이버·Bing 실제 병렬 실행, 여러 사이트 전체 순회, GUI 결과의 Lightsail DB 저장·대시보드 반영과 운영 API 인증은 HANDOFF 기준 완료 근거가 남아 있지 않습니다.
- 이 README는 인증 계정·사이트 연결 구현을 반영합니다. 원격 서버 배포나 실제 계정 전환 완료를 의미하지 않습니다.

## 디렉터리와 문서

```text
app/
  api/          # FastAPI 라우터
  schemas/      # 요청·응답 검증
  services/     # DB 트랜잭션·조회·저장 흐름
  engines/      # Google·Bing·IndexNow 어댑터
  models/       # SQLAlchemy 모델
  core/         # 설정·비동기 DB 세션
  static/       # 기존 고객사·사이트 관리 화면
extension/      # 대시보드·작업 탭 제어·엔진별 콘텐츠 스크립트
migrations/     # Alembic 마이그레이션
tests/          # 백엔드 단위·PostgreSQL 통합 테스트
outputs/        # 검증 보고서·스토어 자료
```

| 문서 | 내용 |
|---|---|
| [작업 인계](docs/HANDOFF.md) | 날짜별 진행·배포·검증 근거. 최신 요약부터 확인 |
| [개발 환경](docs/environment.md) | Conda 환경·잠금 의존성 복원 |
| [DB 설정](docs/database-setup.md) | DB 실행·마이그레이션·임시 DB 테스트 |
| [확장 상세](extension/README.md) | 화면·탭 자동화·오류 정책·프론트 구조 |
| [고객사 API](docs/clients-api.md) · [기존 관리 화면](docs/site-admin.md) | 고객사·사이트 관리 |
| [글 API](docs/pages-api.md) · [IndexNow 설정](docs/indexnow-settings-api.md) | 글 저장·발행 알림 |
| [검사 API](docs/inspections-api.md) · [대시보드 API](docs/dashboard-api.md) | 관측 저장·집계 계약 |
| [사이트맵 API](docs/sitemaps-api.md) · [Bing 어댑터](docs/bing-engine.md) | 엔진별 동작·제한 |

상세 문서에는 이전 구현 시점의 설명이 남아 있습니다. 특히 `extension/README.md`의 API `8000` 안내와 저장소 기본 연결 `18001`을 구분하세요. Vite 프록시를 로컬 `8000`으로 변경한 환경은 위 로컬 개발 안내를 따릅니다. DB 구조에는 `0004`의 인증 계정 변경도 함께 확인하세요.
