# 로컬 개발 환경과 같은 Python 3.13 계열을 사용합니다.
FROM python:3.13-slim

WORKDIR /srv/startpress

# 의존성 파일을 먼저 복사해 앱 코드 변경 시 설치 캐시를 재사용합니다.
# pyproject.toml - 프로젝트가 어떤 패키지를 필요로 하는가
# uv.lock - pyproject.toml을 만족하고 실제로 고른 버전을 기록한 것
COPY pyproject.toml uv.lock ./
# RUN - Docker 이미지를 만드는 중에 명령을 실행
# --mount -> 다른 이미지에서 쓸 파일들을 가져오는 것
RUN --mount=from=ghcr.io/astral-sh/uv:0.11.8,source=/uv,target=/usr/local/bin/uv \
    uv export --locked --no-dev --no-emit-project \
      --format requirements-txt --output-file /tmp/requirements.txt \
      # 여기서 말하는 requirements.txt는 도커 빌드 중에 사용하는 임시 파일
    && python -m pip install --no-cache-dir --require-hashes -r /tmp/requirements.txt \
    && rm /tmp/requirements.txt

# API와 정적 파일, Alembic 설정을 같은 이미지에 담습니다.
COPY app/ ./app/
# alembic - 데이터베이스의 테이블과 컬럼 구조를 버전별로 관리하는 도구 -> Migration을 실행시켜주는 얘
COPY alembic.ini ./
COPY migrations/ ./migrations/

# API는 일반 사용자 권한으로 실행합니다.
# Linux 권한 user, group 권한
USER 10001:10001
# 앱이 컨테이너에서 8000번 포트를 사용
EXPOSE 8000

# 이미지가 완성된 다음에 실행할 명령어
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
