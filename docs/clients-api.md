# 고객사 등록과 목록 조회

기존 Conda `startpress` 환경에서 실행합니다. DB 설정과 마이그레이션은
[DB 안내](database-setup.md)를 따릅니다.

```bash
conda activate startpress
python -m uvicorn app.main:app --reload
```

http://127.0.0.1:8000/docs 에서 고객사 API를 실행할 수 있습니다.

## 등록

`POST /clients` 요청 예시:

```json
{
  "name": "테스트 고객사",
  "manager_name": "김담당"
}
```

이름은 필수이며 앞뒤 공백을 제거합니다. 빈 이름은 422로 거부합니다.
담당자는 생략하거나 null로 보낼 수 있습니다. id와 created_at은 서버가 DB에서
생성된 값을 반환합니다. 성공 시 HTTP 201이며, 응답 전에 트랜잭션을 커밋합니다.
이름의 유일성 제약은 없으므로 같은 이름으로 여러 고객사를 등록할 수 있습니다.

## 목록

`GET /clients?limit=100&offset=0`으로 조회합니다.

- limit: 기본 100, 최소 1, 최대 100
- offset: 기본 0, 최소 0
- 생성 시각 오름차순, 같은 시각이면 UUID 오름차순
- 응답 구조: `{"items": [...]}`, 조회 결과가 없으면 `{"items": []}`

## 코드 흐름

`app/api/clients.py`가 HTTP 요청을 받고, `app/schemas/client.py`로 검증합니다.
`app/services/client.py`가 저장·조회와 트랜잭션을 담당하며,
`app/core/database.py`의 요청별 세션을 사용합니다.

## 검증

```bash
RUN_POSTGRES_TESTS=1 python -m pytest -q tests/integration/test_clients_api.py
```

개발 DB와 별개의 임시 DB에서 등록·실제 커밋·목록·입력 오류·페이지 조회를 검증하고,
테스트가 생성한 임시 DB만 정리합니다.
