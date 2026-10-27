# 사이트 관리 화면

기존 FastAPI가 `/`에서 관리 화면을 제공한다. HTML·CSS·JavaScript로 구현했으며 별도 프론트 빌드나 패키지 설치가 필요 없다.

## 실행

프로젝트 루트에서 PostgreSQL을 시작한 뒤 개발 서버를 실행한다.

```bash
docker compose up -d --wait db
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

브라우저에서 <http://127.0.0.1:8000/>을 연다. 서버는 `.env` 또는 프로세스 환경변수의 `DATABASE_URL`을 사용한다. 화면에서 등록한 데이터는 해당 DB에 저장된다.

## 사용 흐름

1. 고객사를 선택한다. 없는 고객사는 **고객사 추가**로 등록하면 바로 선택된다.
2. 사이트 이름·메인 URL·소유 구분을 입력한다.
3. 플랫폼과 인증 파일·태그 설치 가능 여부를 아는 만큼 입력한다. 모르는 설치 가능 여부는 `null`로 저장된다.
4. **사이트 등록하기**를 누르면 성공 안내와 함께 선택 고객사의 목록이 갱신된다.

등록 실패 시 입력값은 유지된다. URL 중복은 주소 입력 옆에 안내한다. 목록은 고객사별 메인 사이트만 생성 시각·ID 순으로 표시하며 페이지당 6개다. 고객사 목록은 100개씩 끝까지 읽어 선택지에서 누락되지 않게 한다.

현재 기능은 고객사와 사이트 정보의 저장·조회다. 검색엔진에 사이트를 등록하거나 소유 확인을 실행하지 않는다.

## 구성과 검증

- `app/main.py`: 관리 화면과 정적 파일 제공
- `app/static/index.html`: 입력 폼·고객사 대화상자·목록
- `app/static/admin.css`: 데스크톱·모바일 배치, 키보드 포커스
- `app/static/admin.js`: API 호출, 오류·성공 안내, 목록 갱신
- `tests/test_admin_page.py`: 관리 화면·정적 파일 응답 검증

```bash
node --check app/static/admin.js
RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider
```

전체 82개 테스트 통과. 별도 임시 PostgreSQL 미리보기 DB에서 브라우저로 고객사 추가·자동 선택, 사이트 등록·목록 갱신, 빈 필수값·중복 URL 오류와 모바일 390px 배치를 확인했다. 샘플 데이터는 개발 DB에 저장하지 않았다.
