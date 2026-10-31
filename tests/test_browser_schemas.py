"""AI가 고른 로그인 동작의 허용 형식과 거부 조건을 검증합니다."""

import pytest
from pydantic import ValidationError

from app.login_bot.schemas import (
    LOGIN_ACTION,
    ElementAction,
    HumanAction,
    ScrollAction,
    SimpleAction,
)


# 허용한 동작 5종이 각각 알맞은 모델로 변환되는지 확인합니다.
@pytest.mark.parametrize(
    ("payload", "model"),
    [
        ({"action": "click", "index": 0}, ElementAction),
        ({"action": "fill", "index": 2, "text": "답"}, ElementAction),
        ({"action": "scroll", "direction": "down"}, ScrollAction),
        ({"action": "wait"}, SimpleAction),
        ({"action": "human", "reason": "휴대폰 승인이 필요합니다."}, HumanAction),
    ],
)
def test_valid_actions(payload: dict[str, object], model: type) -> None:
    assert isinstance(LOGIN_ACTION.validate_python(payload), model)


# 로그인 전용으로 제외한 동작과 잘못된 필드를 거부하는지 확인합니다.
@pytest.mark.parametrize(
    "payload",
    [
        {"action": "done", "summary": "성공"},
        {"action": "back"},
        {"action": "login"},
        {"action": "select", "index": 0, "text": "a"},
        {"action": "click", "index": -1},
        {"action": "click", "index": "0"},
        {"action": "click", "index": 0, "text": "값"},
        {"action": "fill", "index": 0},
        {"action": "scroll", "direction": "left"},
        {"action": "human"},
        {"action": "wait", "extra": True},
    ],
)
def test_invalid_actions(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        LOGIN_ACTION.validate_python(payload)


# 검증 오류 메시지에 AI가 보낸 입력값이 포함되지 않는지 확인합니다.
def test_error_hides_input() -> None:
    with pytest.raises(ValidationError) as error:
        LOGIN_ACTION.validate_python({"action": "fill", "index": 0, "text": "x" * 2001 + "secret-text"})

    assert "secret-text" not in str(error.value)
