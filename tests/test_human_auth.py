"""외부 서비스 없이 인증 코드 대기·요청 격리·취소·만료를 검증합니다."""

import asyncio

import pytest

from app.login_bot.human_auth import AuthCode, create_auth_code_request

pytestmark = pytest.mark.anyio


# 실제 로그인봇과 같은 asyncio 백엔드에서 Future를 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 코드 제출이 대기 중인 작업을 깨우고 정확한 값을 전달하는지 확인합니다.
async def test_wait_and_resume() -> None:
    request = create_auth_code_request()
    async with asyncio.TaskGroup() as tasks:
        waiter = tasks.create_task(request.wait())
        await asyncio.sleep(0)
        assert not waiter.done()
        assert request.submit(request.request_id, "234567")
    assert waiter.result().value == "234567"
    assert "234567" not in repr(waiter.result())
    assert "234567" not in repr(request)
    assert not request.is_pending


# 대기 시작 전에 도착한 코드도 잃지 않으며 두 번째 제출은 거부합니다.
async def test_early_and_duplicate_submission() -> None:
    request = create_auth_code_request()
    assert request.submit(request.request_id, "234567")
    assert not request.submit(request.request_id, "345678")
    assert (await request.wait()).value == "234567"


# 서로 다른 로그인 요청의 ID를 섞어 제출해도 코드가 전달되지 않습니다.
async def test_request_isolation() -> None:
    first = create_auth_code_request()
    second = create_auth_code_request()
    try:
        assert first.request_id != second.request_id
        assert not first.submit(second.request_id, "234567")
        assert first.is_pending
        assert second.submit(second.request_id, "345678")
        assert (await second.wait()).value == "345678"
        assert first.is_pending
    finally:
        first.cancel()
        second.cancel()


# 만료 시 대기 Future도 취소하고 늦게 도착한 코드는 거부합니다.
async def test_timeout_rejects_late_submission() -> None:
    request = create_auth_code_request(0.01)
    with pytest.raises(TimeoutError):
        await request.wait()
    assert not request.is_pending
    assert not request.submit(request.request_id, "234567")


# 대기 전에도 만료된 요청에는 제출할 수 없습니다.
async def test_expiry_before_wait() -> None:
    request = create_auth_code_request(0.001)
    await asyncio.sleep(0.002)
    assert not request.submit(request.request_id, "234567")
    with pytest.raises(TimeoutError):
        await request.wait()


# 요청 취소는 대기 중인 작업을 즉시 깨웁니다.
async def test_explicit_cancel() -> None:
    request = create_auth_code_request()
    task = asyncio.create_task(request.wait())
    await asyncio.sleep(0)
    request.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not request.submit(request.request_id, "234567")


# 로그인 작업 취소가 Future까지 전파되어 유효한 대기가 남지 않습니다.
async def test_waiter_cancel() -> None:
    request = create_auth_code_request()
    task = asyncio.create_task(request.wait())
    await asyncio.sleep(0)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert not request.is_pending
    assert not request.submit(request.request_id, "234567")


# 하나의 코드를 여러 작업이 재사용하지 못하도록 두 번째 소비자를 거부합니다.
async def test_single_waiter() -> None:
    request = create_auth_code_request()
    task = asyncio.create_task(request.wait())
    await asyncio.sleep(0)
    with pytest.raises(RuntimeError, match="하나의 작업"):
        await request.wait()
    assert request.submit(request.request_id, "234567")
    assert (await task).value == "234567"


# 잘못된 코드가 들어와도 정상 입력을 받을 기회는 유지합니다.
@pytest.mark.parametrize("code", ["", "abc123", "１２３４５６", "12345", "1234567"])
async def test_invalid_code(code: str) -> None:
    request = create_auth_code_request()
    assert not request.submit(request.request_id, code)
    assert request.is_pending
    request.cancel()


# 무한 대기와 음수 제한을 설정 단계에서 거부합니다.
@pytest.mark.parametrize("timeout", [0, -1, float("inf"), float("nan")])
async def test_invalid_timeout(timeout: float) -> None:
    with pytest.raises(ValueError):
        create_auth_code_request(timeout)


# 코드 객체의 문자열 변환도 비밀값을 숨깁니다.
def test_code_representation() -> None:
    assert "234567" not in str(AuthCode("234567"))
