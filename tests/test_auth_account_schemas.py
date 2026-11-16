"""인증 계정 입력과 비밀파일 참조를 숨긴 응답을 검증합니다."""

import pytest
from pydantic import ValidationError

from app.schemas.auth_account import AuthAccountCreate, AuthAccountList, AuthAccountRead


# 인증정보 없이 계정을 먼저 등록하고 엔진별 참조를 선택적으로 입력합니다.
def test_account_create_optional_references() -> None:
    account = AuthAccountCreate(email=" user@example.com ")
    assert account.email == "user@example.com"
    assert account.google_secret_ref is None
    assert account.bing_secret_ref is None

    configured = AuthAccountCreate(
        email="user@example.com", google_secret_ref="google/account-a.json",
        bing_secret_ref="bing/account-a.json",
    )
    assert configured.google_secret_ref == "google/account-a.json"
    assert "google/account-a.json" not in repr(configured)
    assert "bing/account-a.json" not in repr(configured)


# 비공개 폴더를 벗어나거나 모호한 파일 경로의 입력을 거부합니다.
@pytest.mark.parametrize("field", ["google_secret_ref", "bing_secret_ref"])
@pytest.mark.parametrize("reference", [
    "", "   ", "/tmp/token.json", "../token.json", "google/../token.json",
    "google/./token.json", "google//token.json", "google/", "C:\\token.json",
    "https://example.com/token", "google/to\nken.json", "google/to\x00ken.json",
])
def test_invalid_secret_reference(field: str, reference: str) -> None:
    with pytest.raises(ValidationError):
        AuthAccountCreate.model_validate({"email": "user@example.com", field: reference})


# 잘못된 이메일 형식과 정의하지 않은 필드의 입력을 거부합니다.
@pytest.mark.parametrize("changes", [{"email": "invalid"}, {"token": "not-allowed"}])
def test_invalid_account_input(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        AuthAccountCreate.model_validate({"email": "user@example.com"} | changes)


# 응답에는 이메일과 참조 등록 여부만 포함하고 참조값 입력도 거부합니다.
def test_account_response_contains_only_public_fields() -> None:
    account = AuthAccountRead(email="user@example.com", google_configured=True, bing_configured=False)
    response = AuthAccountList(items=(account,))
    assert response.model_dump(mode="json") == {"items": [{
        "email": "user@example.com", "google_configured": True, "bing_configured": False,
    }]}
    with pytest.raises(ValidationError):
        AuthAccountRead.model_validate(account.model_dump() | {"google_secret_ref": "private.json"})
