"""사이트 구현에 주입하는 인증정보의 검증과 값 숨김을 확인합니다."""

import dataclasses

import pytest

from app.login_bot.schemas import LoginCredentials


# 출력 문자열에 로그인 ID·비밀번호가 나타나지 않는지 확인합니다.
def test_credentials_repr_hides_values() -> None:
    credentials = LoginCredentials(login_id="private-id", password="private-pw")

    text = repr(credentials)

    assert "private-id" not in text
    assert "private-pw" not in text


# 둘 중 하나라도 비어 있으면 값 없이 거부하는지 확인합니다.
@pytest.mark.parametrize(("login_id", "password"), [("", "private-pw"), ("private-id", "")])
def test_credentials_reject_empty(login_id: str, password: str) -> None:
    with pytest.raises(ValueError) as error:
        LoginCredentials(login_id=login_id, password=password)

    assert "private" not in str(error.value)


# 생성 후 인증정보를 바꿀 수 없는지 확인합니다.
def test_credentials_are_immutable() -> None:
    credentials = LoginCredentials(login_id="private-id", password="private-pw")

    with pytest.raises(dataclasses.FrozenInstanceError):
        credentials.password = "changed"  # type: ignore[misc]
