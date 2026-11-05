# Docker PostgreSQL 로컬 실행

이 설정은 PostgreSQL과 DB 관리 도구 pgAdmin을 컨테이너에서 실행합니다. FastAPI와 Google API 검증 스크립트는
기존 Conda startpress 환경에서 실행합니다. Python 환경은 [environment.md](environment.md)를 참고하세요.

## 구성

```text
FastAPI: 내 컴퓨터에서 실행
   ↓ 127.0.0.1:5432
PostgreSQL 18.6: db 컨테이너
   ↓
postgres_data: 데이터를 보관하는 Docker 볼륨
```

- compose.yaml: 이미지 버전, 포트, 볼륨, 준비 상태 확인 설정.
- .env: 실제 DB 이름, 사용자, 비밀번호, 이후 사용할 DATABASE_URL.
- .env.example: 팀원이 채울 설정 항목. 실제 비밀번호는 포함하지 않음.

Compose는 .env의 DB 변수 세 개만 PostgreSQL 컨테이너에 전달합니다.
Google·Bing 인증정보는 DB 컨테이너에 전달하지 않습니다.
이 계정은 로컬 DB 초기 관리용 계정입니다. 운영 환경의 애플리케이션 전용 권한은 별도로 설계합니다.

## 처음 시작하기

1. Docker Desktop을 실행합니다.
2. 프로젝트 루트의 .env에 POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD를 설정합니다.
   현재 컴퓨터에서는 설정 과정에서 생성한 무작위 비밀번호를 사용합니다.
   다른 컴퓨터에서는 .env.example을 참고해 각자 새 비밀번호를 설정합니다.
   pgAdmin의 PGADMIN_DEFAULT_EMAIL과 PGADMIN_DEFAULT_PASSWORD도 설정합니다.
   Compose는 전체 서비스 설정을 검증하므로 db만 실행할 때도 두 값이 필요합니다.
3. 프로젝트 루트에서 실행합니다.

```bash
docker compose config --quiet
docker compose up -d --wait db
docker compose ps
```

db가 healthy이면 PostgreSQL이 접속을 받을 준비가 된 것입니다.
처음에는 공식 이미지를 내려받으므로 시간이 걸릴 수 있습니다.

## pgAdmin으로 DB 보기

```bash
docker compose up -d pgadmin
```

`http://127.0.0.1:5050/browser/`에서 `.env`에 지정한 pgAdmin 계정으로 로그인합니다.
새 서버를 추가할 때 호스트는 `db`, 포트는 `5432`이며 DB 이름·사용자·비밀번호는
`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` 값을 사용합니다.
pgAdmin 로그인과 DB 로그인은 별개입니다. 두 서비스의 포트는 이 컴퓨터에서만 접근할 수 있습니다.

## 접속과 확인

컨테이너 안의 psql에 접속합니다. 명령 안의 사용자·DB 이름은 .env에서 읽습니다.

```bash
docker compose exec db sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

psql에서 다음을 실행합니다.

```sql
SELECT current_database(), current_user, version();
```

psql 종료는 `\q`입니다.

컨테이너 내부의 TCP 접속과 비밀번호 인증을 함께 확인하려면 다음 명령을 사용합니다.

```bash
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -w -c "SELECT current_database(), current_user;"'
```

## 평소 실행과 종료

```bash
# 시작
docker compose up -d --wait db

# 종료: 컨테이너를 멈추고 데이터는 보관
docker compose stop db

# 상태 확인
docker compose ps

# 최근 로그
docker compose logs --tail 50 db
```

볼륨을 유지하면 컨테이너를 다시 만들어도 데이터를 사용할 수 있습니다.
데이터를 지우는 볼륨 삭제 명령은 일반 종료 절차에 포함하지 않습니다.
이미 초기화한 DB의 비밀번호는 .env 값만 바꿔도 변경되지 않습니다.

## FastAPI 연결과 테이블

FastAPI를 컴퓨터에서 실행할 때 DB 주소는 127.0.0.1:5432입니다.
나중에 FastAPI도 같은 Compose 네트워크에서 실행하면 DB 호스트는 db가 됩니다.

DATABASE_URL은 비동기 SQLAlchemy/asyncpg 연결을 위한 설정입니다.
드라이버 설치와 FastAPI DB 세션 코드는 별도 구현 단계입니다.

Docker 설정은 DB 서버 실행·접속을 담당합니다. 확정한 clients, sites,
engine_registrations, site_engine_statuses의 4개 테이블은 Alembic으로 생성합니다.
적용·확인 명령은 [database-setup.md](database-setup.md)에 정리했습니다.
기존 db/schema.sql은 이전 8개 테이블 초안이므로 적용에 사용하지 않습니다.

## 접속이 안 될 때

- Docker daemon 연결 오류: Docker Desktop이 실행 중인지 확인합니다.
- 5432 포트 충돌: 다른 PostgreSQL이 실행 중인지 확인합니다.
- DB 컨테이너가 unhealthy: docker compose logs --tail 50 db로 원인을 확인합니다.
- .env를 Git에 추가하지 않습니다. 확장된 실제 비밀번호가 출력되는
  docker compose config 대신 문법 확인용 --quiet 옵션을 사용합니다.

근거: [PostgreSQL 공식 이미지](https://hub.docker.com/_/postgres),
[Docker 볼륨](https://docs.docker.com/get-started/docker-concepts/running-containers/persisting-container-data/).
