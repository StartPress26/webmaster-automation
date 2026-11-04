# webmaster-automation

StartPress 내부 운영용 검색엔진 사이트 등록·발행 알림·색인 모니터링 프로젝트입니다.

FastAPI 관리 화면과 고객사·메인 사이트 API, PostgreSQL·SQLAlchemy·Alembic, Google·Bing API 어댑터와 공통 IndexNow 서비스를 구현했습니다. 엔진의 모든 기능이 관리 API에 연결된 것은 아닙니다.

**다음 실행 경로는 Chrome 확장 프로그램으로 전환합니다. 아직 구현하지 않았습니다.** AI 로그인봇은 운영 경로로 채택하지 않고 별도 브랜치에 실험으로 보존합니다. [전환 결정과 검증 순서](docs/extension-transition.md)를 먼저 확인하세요.

글 DB 등록·블로그 실제 발행·수집 요청 접수·수집 확인·색인 확인은 각각 구분합니다. 글 등록 API·팀원 인증·작업 배분·결과 저장은 후속 작업입니다.

## 개발 환경

**Miniconda의 `startpress` 환경을 사용합니다. 프로젝트 내부 `.venv`는 사용하지 않습니다.**

```bash
conda activate startpress
export PYTHONNOUSERSITE=1
python -m pytest -q -m "not integration"
```

새 환경 생성과 고정 버전 의존성 설치 방법은 [환경 안내](docs/environment.md)를 참고하세요.
`pyproject.toml`과 `uv.lock`은 의존성 명세·잠금 기록으로 유지합니다.

## 개발 서버 실행

`.env`의 DB 설정을 준비한 뒤 프로젝트 루트에서 실행합니다. 기존 `.env`를 덮어쓰지 마세요.

```bash
conda activate startpress
export PYTHONNOUSERSITE=1
docker compose up -d --wait db
python -m alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- [관리 화면](http://127.0.0.1:8000/): 고객사·사이트 등록과 목록
- 상태 확인: http://127.0.0.1:8000/health → `{"status":"ok"}`
- API 문서: http://127.0.0.1:8000/docs

`/health`는 앱의 응답 여부를 확인합니다. DB나 검색엔진 API 연결은 검사하지 않습니다.

## 인증 설정

`.env.example`을 `.env`로 복사하고, 실제 OAuth JSON·토큰은 `.secrets/`에 보관합니다.
Bing API 키는 `.env`의 `BING_API_KEY`에 설정합니다.
`.env`와 `.secrets/`는 Git에서 제외됩니다.

```bash
cp -n .env.example .env
mkdir -p .secrets
chmod 700 .secrets
chmod 600 .env
```

이미 `.env`가 있다면 덮어쓰지 마세요. 설정 후 다음 명령으로 Google 검증 도구를 실행할 수 있습니다.

```bash
python google_probe.py auth
python google_probe.py sites
```

`auth`는 사용자 로그인·동의를 진행합니다. `sites`는 실제 Google API를 호출합니다.
소유 확인·사이트맵 제출·색인 검사를 자동 수행하는 제품용 워크플로는 아직 구현하지 않았습니다.

## 테스트

기본 테스트 명령은 외부 서비스 인증을 진행하지 않는 로컬 테스트를 실행합니다. PostgreSQL 통합 테스트는 별도 임시 DB 생성 권한과 실행 설정이 필요합니다. [DB 안내](docs/database-setup.md)를 확인하세요.

```bash
RUN_POSTGRES_TESTS=1 python -m pytest -q
```

## 주요 자료

- [전환 결정](docs/extension-transition.md)
- [DB 구성](docs/database-setup.md)
- [관리 화면](docs/site-admin.md)
- [작업 인계](docs/HANDOFF.md)
- [개발 환경](docs/environment.md)
- [0단계 API 검증 보고서](outputs/phase0-api-verification-report.ko.md)

`outputs/`에는 민감정보를 제외한 검증 보고서와 통합 결과가 있습니다.
