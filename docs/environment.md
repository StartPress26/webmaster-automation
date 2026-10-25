# 로컬 개발 환경

이 프로젝트는 Miniconda의 `startpress` 환경을 사용합니다.
프로젝트 내부 `.venv`는 사용하지 않습니다.

## 실행

```bash
conda activate startpress
python google_probe.py sites
python -m pytest -q
```

환경 활성화 없이 실행하려면 다음 명령을 사용합니다.

```bash
conda run -n startpress python google_probe.py sites
conda run -n startpress python -m pytest -q
```

API 명령은 실제 Google API를 호출합니다. `pytest`는 로컬 테스트만 실행합니다.
`auth` 명령은 토큰이 없을 때 사용자 로그인·동의 흐름을 시작합니다.

## 설치된 환경

- 환경 경로: `/opt/miniconda3/envs/startpress`
- Python: 3.13 계열
- 프로젝트 의존성: `uv.lock`의 고정 버전으로 설치
- 개발 의존성: pytest 포함
- 사용자 전역 패키지 제외: 환경 변수 `PYTHONNOUSERSITE=1`

`pyproject.toml`과 `uv.lock`은 의존성 명세와 잠금 기록으로 유지합니다.
실행은 Conda로 진행하며, `.venv`를 만드는 `uv sync`·`uv run`은 사용하지 않습니다.

## 새 컴퓨터에서 복원

프로젝트 루트에서 실행합니다. 의존성을 변경했다면 먼저 `uv.lock`을 갱신해야 합니다.

```bash
conda create -n startpress --override-channels -c conda-forge python=3.13 pip -y
conda env config vars set -n startpress PYTHONNOUSERSITE=1
uv export --frozen --no-emit-project --all-groups --format requirements.txt --output-file /tmp/startpress-requirements.lock.txt
conda run -n startpress python -m pip install --require-hashes -r /tmp/startpress-requirements.lock.txt
```

위 `uv export`는 잠금 파일을 변환하기만 하며 가상환경을 생성하지 않습니다.
`.env`와 `.secrets/`의 인증정보는 별도로 준비하고 Git에는 포함하지 않습니다.
