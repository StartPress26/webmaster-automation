# PostgreSQL 테이블과 Alembic 사용

## 구현 구조

| 위치 | 역할 |
|---|---|
| app/core/config.py | .env와 프로세스 환경변수에서 DB 설정 읽기 |
| app/core/database.py | 비동기 연결 풀과 FastAPI 의존성용 세션 제공 |
| app/models/ | 확정한 4개 테이블의 SQLAlchemy 모델 |
| alembic.ini | 마이그레이션 폴더 위치와 로그 설정 |
| migrations/env.py | 환경설정·모델·Alembic 연결 |
| migrations/versions/ | DB 변경 이력과 부모 관계 검증 트리거 |
| tests/integration/ | 실제 PostgreSQL의 임시 DB에서 실행하는 검증 |

실행 환경은 기존 Conda startpress를 사용합니다. 의존성 복원 방법은
[environment.md](environment.md)를 참고하세요.

## 테이블

```text
clients
  └─ sites: 메인 사이트와 개별 글
       ├─ parent_site_id → sites의 메인 사이트
       ├─ engine_registrations: 메인 사이트의 등록·소유 확인
       └─ site_engine_statuses: 각 URL의 제출·수집·색인 상태
```

- 모든 기본키는 DB에서 생성하는 UUID입니다.
- client_id는 메인 사이트와 글 모두 필수입니다.
- 같은 고객사 안에서 같은 URL을 중복 등록하지 않습니다.
- target_type은 site/page, owner_type은 internal/client입니다.
- 메인 사이트는 부모가 없고, 글은 반드시 메인 사이트를 부모로 둡니다.
- cms_type과 can_edit_site는 메인 사이트에만 저장합니다.
- target_type은 생성 후 변경하지 않습니다. 다른 유형의 대상은 새 행으로 등록합니다.
  이 규칙으로 이미 연결한 부모의 역할이 동시 요청 중 바뀌는 것도 방지합니다.
- 글의 고객사가 부모 사이트의 고객사와 반드시 같아야 한다는 제약은 추가하지 않았습니다.
  공용 회사 블로그에 여러 고객사의 글이 연결될 수 있기 때문입니다.
- engine_registrations는 메인 사이트에만 연결할 수 있습니다.
- 메인 사이트·엔진별 등록 정보와 각 URL·엔진별 색인 상태는 각각 하나만 허용합니다.
- 연결 데이터가 있는 고객사·사이트의 삭제는 RESTRICT로 차단합니다.

## 상태 값

| 구분 | 값 |
|---|---|
| registration_status | unknown, submitted, verified, failed 또는 NULL |
| index_status | unknown, submitted, crawled, indexed, not_indexed, failed |

등록 절차가 해당 없는 엔진은 registration_status에 명시적으로 NULL을 넣습니다.
index_status의 failed는 제출·조회 작업 오류이며 not_indexed와 다릅니다.
홈페이지의 indexed는 홈페이지 URL 하나에 대한 결과입니다.
크론으로 상태를 덮어쓰기 시작하기 전에는 상태 이력·제출 작업 기록을 별도로 추가해
이전의 마지막 정상 관측값을 보존해야 합니다. 현재 4개 테이블은 최신 상태 저장 범위입니다.

URL의 http(s) 접두사·2,048바이트 길이만 DB에서 검사합니다. 호스트·경로 범위 검증,
안전한 URL 정규화, SSRF 방어, 고객사별 접근권한은 이후 API·서비스 계층에서 구현합니다.
engine_registrations에는 인증 토큰을 저장하지 않습니다. 인증정보 참조는 별도 연동 단계입니다.

## 현재 DB에 적용

프로젝트 루트에서 실행합니다.

```bash
docker compose up -d --wait db
conda run -n startpress python -m alembic upgrade head
conda run -n startpress python -m alembic current
conda run -n startpress python -m alembic check
```

업무 테이블 4개 외에 Alembic의 버전 관리 테이블인 alembic_version도 생성됩니다.
서버 시작 시 create_all을 호출하지 않습니다. DB 변경은 Alembic으로 적용합니다.
DB 주소·비밀번호는 alembic.ini에 기록하지 않고 .env에서 읽습니다.

테이블을 직접 확인하려면:

```bash
docker compose exec db psql -U webmaster -d webmaster
```

psql에서:

```sql
\dt
\d sites
\d engine_registrations
```

## FastAPI에서 세션 사용

라우트에 get_db를 Depends로 주입합니다. 세션은 요청 종료 시 정리되며,
여러 변경을 묶는 트랜잭션과 커밋은 서비스 계층에서 명시합니다.
FastAPI에 연결할 때는 앱 종료 시 생성된 연결 풀을 dispose_database로 정리하도록 구성합니다.

SQLAlchemy 모델에는 저장 구조와 외래키를 정의했습니다. ORM의 relationship 기반
편의 조회는 필요한 서비스 조회 흐름을 구현할 때 추가할 수 있습니다.

## 테스트

```bash
# 외부 API나 DB 접속 없이 실행하는 기본 테스트
conda run -n startpress python -m pytest -q -m 'not integration'

# 개발 DB와 별개의 임시 DB를 만들어 검증 후 정리
RUN_POSTGRES_TESTS=1 conda run -n startpress python -m pytest -q tests/integration
```

통합 테스트는 현재 로컬 DB 계정의 CREATE DATABASE 권한이 필요합니다.
현재 접속 DB를 삭제하거나 초기화하지 않고 이 실행에서 생성한 UUID 이름의 임시 DB만
정리합니다. downgrade 검증도 그 임시 DB에서만 실행합니다.

## 이후 컬럼을 변경할 때

1. 모델을 수정합니다.
2. 새 변경 파일을 만듭니다.
3. 자동 생성된 SQL과 제약조건을 검토합니다.
4. 테스트 DB에서 검증한 뒤 적용합니다.

```bash
conda run -n startpress python -m alembic revision --autogenerate -m '변경 설명'
conda run -n startpress python -m alembic upgrade head
```

트리거·함수 변경은 autogenerate가 자동으로 관리하지 않으므로 새 마이그레이션에 직접
작성하고 통합 테스트로 검증합니다. 적용한 변경 파일을 나중에 고치지 않습니다.
기존 db/schema.sql은 이전 8개 테이블 설계 자료이므로 현재 DB 적용에 사용하지 않습니다.

근거: [Alembic 튜토리얼](https://alembic.sqlalchemy.org/en/latest/tutorial.html),
[비동기 Alembic](https://alembic.sqlalchemy.org/en/latest/cookbook.html#using-asyncio-with-alembic).
