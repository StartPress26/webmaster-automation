"""실제 Discord 전송 없이 설정 보호와 연결·전송·종료 동작을 검증합니다."""

import asyncio
from pathlib import Path
from unittest.mock import MagicMock

import discord
import pytest

from app.login_bot import discord_auth
from app.login_bot.discord_auth import (
    AuthCodeModal,
    AuthCodeView,
    DiscordConnectionError,
    DiscordSettings,
    DiscordSettingsError,
    DiscordSmsCodeProvider,
    check_discord_connection,
    check_discord_input,
    check_discord_handoff,
    load_discord_settings,
    request_discord_code,
)

SETTINGS = DiscordSettings(token="test-secret", channel_id=123, allowed_user_id=456)
pytestmark = pytest.mark.anyio


# Discord 클라이언트와 동일한 asyncio 환경을 사용합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 실제 환경변수가 로컬 설정 테스트에 섞이지 않게 합니다.
@pytest.fixture
def env_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    for key in ("DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID", "DISCORD_ALLOWED_USER_ID"):
        monkeypatch.delenv(key, raising=False)
    (tmp_path / ".env").write_text(
        "DISCORD_BOT_TOKEN=test-${UNCHANGED}\nDISCORD_CHANNEL_ID=123\nDISCORD_ALLOWED_USER_ID=456\n",
        encoding="utf-8",
    )
    return tmp_path


# 토큰 보간 방지·객체 출력 보호·환경변수 우선순위를 확인합니다.
def test_settings(env_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    settings = load_discord_settings(env_file)
    assert settings.token == "test-${UNCHANGED}"
    assert settings.token not in repr(settings)
    monkeypatch.setenv("DISCORD_CHANNEL_ID", "789")
    assert load_discord_settings(env_file).channel_id == 789


# 누락·숫자가 아닌 ID·범위 초과를 원문 노출 없이 거부합니다.
@pytest.mark.parametrize("value", ["", "secret-id", "-1", "0", str(2**64), "１２３"])
def test_invalid_id(env_file: Path, monkeypatch: pytest.MonkeyPatch, value: str) -> None:
    monkeypatch.setenv("DISCORD_ALLOWED_USER_ID", value)
    with pytest.raises(DiscordSettingsError, match="DISCORD_ALLOWED_USER_ID") as error:
        load_discord_settings(env_file)
    if value:
        assert value not in str(error.value)


# 빈 환경변수는 파일의 토큰으로 조용히 대체하지 않습니다.
def test_missing_token(env_file: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DISCORD_BOT_TOKEN", "")
    with pytest.raises(DiscordSettingsError, match="DISCORD_BOT_TOKEN"):
        load_discord_settings(env_file)


# 준비·종료 이벤트를 가진 가짜 연결로 외부 통신을 막습니다.
@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> MagicMock:
    ready = asyncio.Event()
    closed = asyncio.Event()
    fake = MagicMock(spec=discord.Client)
    fake.__aenter__.return_value = fake
    fake.wait_until_ready.side_effect = ready.wait
    fake.close.side_effect = closed.set
    fake.fetch_channel.return_value = MagicMock(spec=discord.TextChannel)

    # Gateway 연결이 준비되면 종료 요청을 받을 때까지 유지합니다.
    async def connect(*, reconnect: bool) -> None:
        assert reconnect is False
        ready.set()
        await closed.wait()

    fake.connect.side_effect = connect
    monkeypatch.setattr(discord_auth.discord, "Client", MagicMock(return_value=fake))
    return fake


# 준비 후 지정 채널에 한 번만 전송하며 메시지 읽기 권한은 요청하지 않습니다.
async def test_ready_send_close(client: MagicMock) -> None:
    await check_discord_connection(SETTINGS)
    client.login.assert_awaited_once_with(SETTINGS.token)
    client.fetch_channel.assert_awaited_once_with(SETTINGS.channel_id)
    client.fetch_channel.return_value.send.assert_awaited_once_with(discord_auth.TEST_MESSAGE)
    client.close.assert_awaited_once()
    options = discord_auth.discord.Client.call_args.kwargs
    assert not options["intents"].message_content
    assert not options["intents"].members
    assert options["allowed_mentions"].everyone is False


# 채널 접근·전송 오류에서도 연결을 정리하고 응답에 포함된 비밀값을 숨깁니다.
@pytest.mark.parametrize("operation", ["fetch_channel", "send"])
async def test_request_failure(client: MagicMock, operation: str) -> None:
    target = client.fetch_channel if operation == "fetch_channel" else client.fetch_channel.return_value.send
    target.side_effect = RuntimeError(SETTINGS.token)
    with pytest.raises(DiscordConnectionError) as error:
        await check_discord_connection(SETTINGS)
    assert SETTINGS.token not in str(error.value)
    client.close.assert_awaited_once()


# 잘못된 토큰은 인증 오류로 안내하며 Gateway 연결이나 메시지 전송을 시작하지 않습니다.
async def test_invalid_token(client: MagicMock) -> None:
    client.login.side_effect = discord.LoginFailure(SETTINGS.token)
    with pytest.raises(DiscordConnectionError, match="토큰 인증") as error:
        await check_discord_connection(SETTINGS)
    assert SETTINGS.token not in str(error.value)
    client.connect.assert_not_called()
    client.fetch_channel.assert_not_called()
    client.__aexit__.assert_awaited_once()


# DM·음성·포럼 등 텍스트 채널이 아닌 대상에는 보내지 않습니다.
async def test_wrong_channel_type(client: MagicMock) -> None:
    channel = MagicMock(spec=discord.DMChannel)
    client.fetch_channel.return_value = channel
    with pytest.raises(DiscordConnectionError):
        await check_discord_connection(SETTINGS)
    channel.send.assert_not_called()
    client.close.assert_awaited_once()


# Gateway가 실패하면 준비 대기를 취소하고 안전한 오류로 종료합니다.
async def test_gateway_failure(client: MagicMock) -> None:
    client.connect.side_effect = RuntimeError(SETTINGS.token)
    with pytest.raises(DiscordConnectionError):
        await asyncio.wait_for(check_discord_connection(SETTINGS), timeout=1)
    client.fetch_channel.assert_not_called()
    client.close.assert_awaited_once()


# 준비 이벤트가 오지 않으면 제한 시간 안에 연결을 닫습니다.
async def test_timeout(client: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    client.wait_until_ready.side_effect = asyncio.Event().wait
    monkeypatch.setattr(discord_auth, "CONNECTION_TIMEOUT_SECONDS", 0.01)
    with pytest.raises(DiscordConnectionError):
        await check_discord_connection(SETTINGS)
    client.fetch_channel.assert_not_called()
    client.close.assert_awaited_once()


# 사용자가 취소하면 전송하지 않고 취소 신호를 호출자에게 돌려줍니다.
async def test_cancellation(client: MagicMock) -> None:
    client.wait_until_ready.side_effect = asyncio.CancelledError
    with pytest.raises(asyncio.CancelledError):
        await check_discord_connection(SETTINGS)
    client.fetch_channel.assert_not_called()
    client.close.assert_awaited_once()


# Discord가 전달하는 사용자·채널과 응답 인터페이스를 재현합니다.
@pytest.fixture
def interaction() -> MagicMock:
    event = MagicMock(spec=discord.Interaction)
    event.user = MagicMock(id=SETTINGS.allowed_user_id)
    event.channel_id = SETTINGS.channel_id
    event.response = MagicMock(spec=discord.InteractionResponse)
    event.response.is_done.return_value = False
    return event


# 허용된 사용자의 버튼 클릭이 실제 Modal 객체를 응답하는지 확인합니다.
async def test_button_opens_modal(interaction: MagicMock) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    assert await view.interaction_check(interaction)
    await view.open_modal.callback(interaction)
    modal = interaction.response.send_modal.call_args.args[0]
    assert isinstance(modal, AuthCodeModal)
    assert modal.request is view
    assert modal.to_components()[0]["component"]["type"] == 4
    view.stop()
    modal.stop()


# 버튼 클릭과 직접 제출 모두 다른 사용자·채널을 거부합니다.
@pytest.mark.parametrize("wrong_field", ["user", "channel"])
async def test_input_authorization(interaction: MagicMock, wrong_field: str) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    if wrong_field == "user":
        interaction.user.id = 999
    else:
        interaction.channel_id = 999
    assert not await view.interaction_check(interaction)
    await AuthCodeModal(view).on_submit(interaction)
    assert not view.received.is_set()
    assert interaction.response.send_message.call_args.kwargs["ephemeral"] is True
    view.stop()


# 코드는 공개 메시지·성공 응답·표준 출력 어디에도 재출력하지 않습니다.
async def test_valid_submission(interaction: MagicMock, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "654321"))
    await AuthCodeModal(view).on_submit(interaction)
    assert view.received.is_set()
    assert view.is_finished()
    assert not await view.wait()
    assert "654321" not in str(interaction.response.mock_calls)
    assert "654321" not in capsys.readouterr().out
    assert interaction.response.send_message.call_args.kwargs["ephemeral"] is True


# 숫자가 아닌 입력·길이 오류는 수신 완료로 취급하지 않습니다.
@pytest.mark.parametrize("code", ["abc123", "１２３４５６", "12345", "1234567"])
async def test_invalid_code(interaction: MagicMock, monkeypatch: pytest.MonkeyPatch, code: str) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: code))
    await AuthCodeModal(view).on_submit(interaction)
    assert not view.received.is_set()
    assert not view.is_finished()
    assert code not in str(interaction.response.mock_calls)
    view.stop()


# 이미 열어둔 입력창도 요청의 절대 만료 시각 이후에는 제출할 수 없습니다.
async def test_expired_modal(interaction: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discord_auth, "INPUT_TIMEOUT_SECONDS", 0.001)
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    await asyncio.sleep(0.002)
    await AuthCodeModal(view).on_submit(interaction)
    assert not view.received.is_set()
    assert "만료" in interaction.response.send_message.call_args.args[0]
    view.stop()


# 여러 입력창이 동시에 제출되어도 최초 한 번만 접수합니다.
async def test_duplicate_submission(interaction: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "123456"))
    await asyncio.gather(AuthCodeModal(view).on_submit(interaction), AuthCodeModal(view).on_submit(interaction))
    messages = [call.args[0] for call in interaction.response.send_message.call_args_list]
    assert sum("테스트 코드를 받았습니다" in message for message in messages) == 1
    assert sum("이미 처리" in message for message in messages) == 1


# 제출 시점까지 Gateway를 유지하고 완료 후 버튼을 제거한 뒤 종료합니다.
async def test_input_runner(client: MagicMock, interaction: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "123456"))
    sent = client.fetch_channel.return_value.send
    message = sent.return_value

    # 메시지 전송 직후 도착한 코드도 Future에 보관되어 호출자에게 전달됩니다.
    async def submit(content: str, *, view: AuthCodeView) -> MagicMock:
        client.close.assert_not_called()
        await AuthCodeModal(view).on_submit(interaction)
        return message

    sent.side_effect = submit
    assert await check_discord_input(SETTINGS)
    assert isinstance(sent.call_args.kwargs["view"], AuthCodeView)
    sent.return_value.edit.assert_awaited_once()
    assert sent.return_value.edit.call_args.kwargs["view"] is None
    client.close.assert_awaited_once()


# 입력이 없으면 만료 후 버튼과 연결을 정리합니다.
async def test_input_runner_timeout(client: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discord_auth, "INPUT_TIMEOUT_SECONDS", 0.01)
    assert not await check_discord_input(SETTINGS)
    client.fetch_channel.return_value.send.return_value.edit.assert_awaited_once()
    client.close.assert_awaited_once()


# UI 오류 처리기는 제출값이 포함된 예외를 로깅하지 않습니다.
async def test_ui_error_redaction(interaction: MagicMock, caplog: pytest.LogCaptureFixture) -> None:
    view = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    await view.on_error(interaction, RuntimeError("654321"), view.open_modal)
    await AuthCodeModal(view).on_error(interaction, RuntimeError("654321"))
    assert "654321" not in caplog.text
    assert "654321" not in str(interaction.response.mock_calls)
    view.stop()


# 가짜 로그인 작업이 대기 중임을 확인하고 실제 입력 콜백으로 재개합니다.
async def test_handoff_resumes_waiter(
    client: MagicMock, interaction: MagicMock, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "765432"))
    sent = client.fetch_channel.return_value.send
    message = sent.return_value
    displayed = asyncio.Event()

    # UI가 준비됐다는 신호만 보내고 사용자 입력을 기다리게 합니다.
    async def display(content: str, *, view: AuthCodeView) -> MagicMock:
        displayed.set()
        return message

    sent.side_effect = display
    async with asyncio.TaskGroup() as tasks:
        login = tasks.create_task(check_discord_handoff(SETTINGS))
        await asyncio.wait_for(displayed.wait(), timeout=1)
        assert not login.done()
        view = sent.call_args.kwargs["view"]
        await AuthCodeModal(view).on_submit(interaction)
    assert login.result() is True
    output = capsys.readouterr().out
    assert "재개했습니다" in output
    assert "765432" not in output
    assert not view.code_request.is_pending
    message.edit.assert_awaited_once()


# 실행 취소 시 대기 요청과 버튼을 정리하고 늦은 제출을 차단합니다.
async def test_handoff_cancel_cleans_request(client: MagicMock) -> None:
    sent = client.fetch_channel.return_value.send
    message = sent.return_value
    displayed = asyncio.Event()

    # 취소 시점을 메시지가 표시된 직후로 고정합니다.
    async def display(content: str, *, view: AuthCodeView) -> MagicMock:
        displayed.set()
        return message

    sent.side_effect = display
    async with asyncio.TaskGroup() as tasks:
        login = tasks.create_task(check_discord_handoff(SETTINGS))
        await asyncio.wait_for(displayed.wait(), timeout=1)
        view = sent.call_args.kwargs["view"]
        login.cancel()
    assert login.cancelled()
    assert not view.code_request.is_pending
    assert not view.code_request.submit(view.code_request.request_id, "123456")
    assert view.is_finished()
    message.edit.assert_awaited_once()


# 메시지 전송 실패도 생성한 요청을 취소하여 남은 대기를 없앱니다.
async def test_handoff_send_failure_cleans_request(client: MagicMock) -> None:
    sent = client.fetch_channel.return_value.send
    sent.side_effect = RuntimeError("전송 실패")
    with pytest.raises(DiscordConnectionError):
        await check_discord_handoff(SETTINGS)
    view = sent.call_args.kwargs["view"]
    assert not view.code_request.is_pending
    assert view.is_finished()


# 두 요청의 버튼 식별자가 다르고 제출한 요청의 Future만 완료됩니다.
async def test_modal_request_isolation(interaction: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "123456"))
    first = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    second = AuthCodeView(SETTINGS.allowed_user_id, SETTINGS.channel_id)
    try:
        assert first.open_modal.custom_id != second.open_modal.custom_id
        await AuthCodeModal(second).on_submit(interaction)
        assert first.code_request.is_pending
        assert (await second.code_request.wait()).value == "123456"
    finally:
        first.code_request.cancel()
        second.code_request.cancel()
        first.stop()
        second.stop()


# 실제 요청용 안내·입력창·응답은 테스트 문구 없이 마스킹 번호만 표시합니다.
async def test_real_sms_provider(client: MagicMock, interaction: MagicMock, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(discord.ui.TextInput, "value", property(lambda self: "123456"))
    sent = client.fetch_channel.return_value.send
    message = sent.return_value

    # 실제 입력창 모드에서 제출하고 응답까지 완료합니다.
    async def submit(content: str, *, view: AuthCodeView) -> MagicMock:
        assert not view.demo
        modal = AuthCodeModal(view)
        assert "테스트" not in modal.title
        await modal.on_submit(interaction)
        return message

    sent.side_effect = submit
    code = await DiscordSmsCodeProvider(SETTINGS).request_code(
        service="google", masked_phone="010-****-5523", timeout_seconds=5.0
    )
    assert code is not None and code.value == "123456"
    content = sent.call_args.args[0]
    assert "Google" in content and "010-****-5523" in content
    assert "테스트" not in content and "123456" not in content
    assert "테스트" not in interaction.response.send_message.call_args.args[0]
    assert "123456" not in str(message.edit.call_args)


# 전체 전화번호·멘션 등 허용되지 않은 안내 값은 연결 전 거부합니다.
@pytest.mark.parametrize("phone", ["010-1234-5523", "@everyone", "010-****-5523 secret"])
async def test_rejects_unsafe_sms_notice(client: MagicMock, phone: str) -> None:
    with pytest.raises(ValueError):
        await request_discord_code(SETTINGS, service="google", masked_phone=phone)
    client.login.assert_not_called()
