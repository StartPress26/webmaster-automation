# webmaster-automation

StartPress 내부 운영용 검색엔진 사이트 등록·발행 알림·색인 모니터링 프로젝트입니다.

현재 Google·Bing·IndexNow의 공식 API 검증을 마쳤고, 본제품 개발 전 단계입니다.
API 접수 성공과 실제 검색엔진 색인 완료는 별도로 관리합니다.

## 개발 환경

**Miniconda의 `startpress` 환경을 사용합니다. 프로젝트 내부 `.venv`는 사용하지 않습니다.**

```bash
conda activate startpress
python -m pytest -q
```

새 환경 생성과 고정 버전 의존성 설치 방법은 [환경 안내](docs/environment.md)를 참고하세요.
`pyproject.toml`과 `uv.lock`은 의존성 명세·잠금 기록으로 유지합니다.

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

## 주요 자료

- [작업 인계](docs/HANDOFF.md)
- [개발 환경](docs/environment.md)
- [0단계 API 검증 보고서](outputs/phase0-api-verification-report.ko.md)

`outputs/`에는 민감정보를 제외한 검증 보고서와 통합 결과가 있습니다.
