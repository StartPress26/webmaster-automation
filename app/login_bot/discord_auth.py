"""Discord 설정을 읽고 Gateway 연결과 지정 채널의 메시지 전송을 확인합니다."""

import argparse
import asyncio
import os
import re
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from pathlib import Path

import discord
from dotenv import dotenv_values

from app.core.config import PROJECT_ROOT
from app.login_bot.human_auth import AuthCode, AuthCodeRequest, create_auth_code_request

TEST_MESSAGE = "Webmaster 인증봇 연결 테스트입니다. Discord 연결이 준비되었습니다."
CONNECTION_TIMEOUT_SECONDS = 30.0
INPUT_TIMEOUT_SECONDS = 180.0
INPUT_DEMO_MESSAGE = (
    "인증 코드 입력창 테스트입니다. 실제 문자 발송이나 로그인은 진행하지 않습니다.\n"
    "[인증 코드 입력]을 눌러 가짜 6자리 코드(예: 123456)를 제출해주세요. 3분 뒤 종료됩니다."
)


# 입력 내용과 예외 원문 대신 제출자에게만 고정 오류 안내를 보냅니다.
async def _notify_ui_error(interaction: discord.Interaction) -> None:
    if not interaction.response.is_done():
        try:
            await interaction.response.send_message("입력을 처리하지 못했습니다. 다시 시도해주세요.", ephemeral=True)
        except discord.HTTPException:
            pass


class AuthCodeView(discord.ui.View):
    """지정 사용자에게만 인증 입력창을 열어주는 일회성 버튼입니다."""

    # 요청별 상태와 절대 만료 시각을 만들고 코드 원문은 보관하지 않습니다.
    def __init__(
        self, allowed_user_id: int, channel_id: int, *, code_request: AuthCodeRequest | None = None,
        demo: bool = True,
    ) -> None:
        super().__init__(timeout=None)
        self.allowed_user_id = allowed_user_id
        self.channel_id = channel_id
        self.demo = demo
        self.code_request = code_request if code_request is not None else create_auth_code_request(INPUT_TIMEOUT_SECONDS)
        self.deadline = self.code_request.deadline
        self.received = asyncio.Event()
        self.open_modal.custom_id = f"auth-code:{self.code_request.request_id}"

    # 버튼과 입력창 제출 양쪽에서 사용자·채널·만료·중복 여부를 검사합니다.
    async def interaction_check(self, interaction: discord.Interaction) -> bool:
        if interaction.user.id != self.allowed_user_id or interaction.channel_id != self.channel_id:
            await interaction.response.send_message("이 인증 요청을 처리할 권한이 없습니다.", ephemeral=True)
            return False
        if self.is_finished() or not self.code_request.is_pending:
            await interaction.response.send_message("이미 처리되었거나 만료된 요청입니다.", ephemeral=True)
            return False
        return True

    # Discord가 전달한 버튼 클릭에 코드 입력창으로 응답합니다.
    @discord.ui.button(label="인증 코드 입력", style=discord.ButtonStyle.primary)
    async def open_modal(self, interaction: discord.Interaction, button: discord.ui.Button) -> None:
        await interaction.response.send_modal(AuthCodeModal(self))

    # 기본 예외 로거 대신 비밀값 없는 안내만 전달합니다.
    async def on_error(
        self, interaction: discord.Interaction, error: Exception, item: discord.ui.Item
    ) -> None:
        await _notify_ui_error(interaction)


class AuthCodeModal(discord.ui.Modal):
    """6자리 코드 제출을 해당 요청에서 기다리는 작업에 전달합니다."""

    # 입력창은 요청의 남은 시간 안에서만 유효하게 유지합니다.
    def __init__(self, request: AuthCodeView) -> None:
        super().__init__(
            title="인증 코드 입력 테스트" if request.demo else "문자 인증 코드 입력",
            timeout=max(0.01, request.deadline - time.monotonic()),
        )
        self.request = request
        self.code_input = discord.ui.TextInput(
            placeholder="123456" if request.demo else "문자로 받은 6자리 숫자", min_length=6, max_length=6
        )
        self.add_item(discord.ui.Label(
            text="테스트용 6자리 숫자" if request.demo else "문자 인증 코드", component=self.code_input
        ))

    # 입력창을 열어둔 동안 만료되거나 다른 요청이 처리된 경우도 거부합니다.
    async def on_submit(self, interaction: discord.Interaction) -> None:
        if not await self.request.interaction_check(interaction):
            return
        if re.fullmatch(r"[0-9]{6}", self.code_input.value) is None:
            await interaction.response.send_message(
                "6자리 숫자를 입력해주세요. 버튼을 눌러 다시 입력할 수 있습니다.", ephemeral=True
            )
            return
        # 검사와 표시 사이에 await가 없어 동시에 제출해도 한 번만 수신 처리합니다.
        if not self.request.code_request.submit(self.request.code_request.request_id, self.code_input.value):
            await interaction.response.send_message("이미 처리되었거나 만료된 요청입니다.", ephemeral=True)
            return
        self.request.received.set()
        try:
            await interaction.response.send_message(
                "테스트 코드를 받았습니다. 실제 로그인에는 사용하지 않았습니다." if self.request.demo
                else "인증 코드를 받았습니다. 로그인 결과는 별도로 확인합니다.", ephemeral=True
            )
        finally:
            self.request.stop()

    # 코드가 포함될 수 있는 예외와 입력창 객체를 기본 로거에 전달하지 않습니다.
    async def on_error(self, interaction: discord.Interaction, error: Exception) -> None:
        await _notify_ui_error(interaction)


class DiscordSettingsError(ValueError):
    """설정값을 노출하지 않는 Discord 설정 오류입니다."""


class DiscordConnectionError(RuntimeError):
    """응답 원문과 토큰을 노출하지 않는 연결 확인 오류입니다."""


@dataclass(frozen=True)
class DiscordSettings:
    """봇 인증정보와 대상 채널·후속 입력 단계의 허용 사용자를 보관합니다."""

    token: str = field(repr=False)
    channel_id: int
    allowed_user_id: int


@dataclass(frozen=True)
class DiscordSmsCodeProvider:
    """공통 로그인봇의 문자 코드 요청을 Discord 입력창에 연결합니다."""

    settings: DiscordSettings = field(repr=False)

    # 실제 로그인 요청에는 테스트 안내 대신 서비스·마스킹 번호를 표시합니다.
    async def request_code(
        self, *, service: str, masked_phone: str | None, timeout_seconds: float
    ) -> AuthCode | None:
        return await request_discord_code(
            self.settings, service=service, masked_phone=masked_phone, timeout_seconds=timeout_seconds
        )


# 서비스 표시명과 마스킹 번호만 사용해 인증정보 없는 요청 문구를 만듭니다.
def _sms_message(service: str, masked_phone: str | None) -> str:
    label = {"google": "Google", "bing": "Bing", "naver": "네이버"}.get(service, "사이트")
    if masked_phone is not None and (
        re.fullmatch(r"[+0-9 ()*•●·xX-]{4,40}", masked_phone) is None
        or re.search(r"[*•●·xX]{2,}", masked_phone) is None
    ):
        raise ValueError("문자 인증 안내에는 마스킹된 번호만 사용할 수 있습니다.")
    destination = f"`{masked_phone}`으로" if masked_phone else "등록된 전화번호로"
    return (
        f"{label} 브라우저 로그인에 문자 인증이 필요합니다.\n"
        f"로그인 화면에 {destination} 인증 문자를 보냈다고 표시되어 있습니다.\n"
        "[인증 코드 입력]을 눌러 문자로 받은 코드를 입력해주세요."
    )


# 숫자로 된 Discord ID만 허용하고 잘못된 값은 오류에 포함하지 않습니다.
def _parse_id(value: str | None, name: str) -> int:
    if value is None or re.fullmatch(r"[0-9]{1,20}", value) is None:
        raise DiscordSettingsError(f"{name}에 복사한 숫자 ID를 설정하세요.")
    parsed = int(value)
    if not 0 < parsed < 2**64:
        raise DiscordSettingsError(f"{name}의 ID 범위를 확인하세요.")
    return parsed


# 환경변수를 우선하며 .env의 토큰을 보간하거나 출력하지 않습니다.
def load_discord_settings(root: Path = PROJECT_ROOT) -> DiscordSettings:
    values = dotenv_values(root / ".env", interpolate=False) | dict(os.environ)
    token = (values.get("DISCORD_BOT_TOKEN") or "").strip()
    if not token or any(character.isspace() for character in token):
        raise DiscordSettingsError("DISCORD_BOT_TOKEN에 Bot 메뉴에서 발급한 토큰을 설정하세요.")
    return DiscordSettings(
        token=token,
        channel_id=_parse_id(values.get("DISCORD_CHANNEL_ID"), "DISCORD_CHANNEL_ID"),
        allowed_user_id=_parse_id(values.get("DISCORD_ALLOWED_USER_ID"), "DISCORD_ALLOWED_USER_ID"),
    )


# Gateway와 채널을 준비하고 사용이 끝나면 성공·실패 모두 연결을 정리합니다.
@asynccontextmanager
async def _connected_channel(settings: DiscordSettings) -> AsyncIterator[discord.TextChannel]:
    client = discord.Client(
        intents=discord.Intents(guilds=True),
        allowed_mentions=discord.AllowedMentions.none(),
    )
    try:
        async with client:
            async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                await client.login(settings.token)
            async with asyncio.TaskGroup() as tasks:
                connection = tasks.create_task(client.connect(reconnect=False))
                try:
                    async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                        await client.wait_until_ready()
                        channel = await client.fetch_channel(settings.channel_id)
                        if not isinstance(channel, discord.TextChannel):
                            raise DiscordConnectionError("서버의 텍스트 채널 ID가 필요합니다.")
                    yield channel
                finally:
                    await client.close()
                    connection.cancel()
    except asyncio.CancelledError:
        raise
    except discord.LoginFailure:
        raise DiscordConnectionError(
            "Discord 봇 토큰 인증에 실패했습니다. Developer Portal → Bot → Reset Token으로 발급한 값을 DISCORD_BOT_TOKEN에 설정하세요."
        ) from None
    except Exception:
        # 라이브러리 예외에는 요청·응답 원문이 포함될 수 있어 고정 안내로 바꿉니다.
        raise DiscordConnectionError(
            "Discord 연결 확인에 실패했습니다. 토큰, 채널 ID, 채널 보기·메시지 보내기 권한과 네트워크를 확인하세요."
        ) from None


# Gateway 준비 후 텍스트 채널에 테스트 메시지를 한 번 전송합니다.
async def check_discord_connection(settings: DiscordSettings) -> None:
    async with _connected_channel(settings) as channel:
        async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
            await channel.send(TEST_MESSAGE)


# 요청별 Future에서 코드를 받아 호출자에게 반환하고 모든 종료 경로에서 UI를 정리합니다.
async def request_discord_code(
    settings: DiscordSettings, *, service: str | None = None, masked_phone: str | None = None,
    timeout_seconds: float | None = None,
) -> AuthCode | None:
    prompt = INPUT_DEMO_MESSAGE if service is None else _sms_message(service, masked_phone)
    async with _connected_channel(settings) as channel:
        request = create_auth_code_request(INPUT_TIMEOUT_SECONDS if timeout_seconds is None else timeout_seconds)
        # Discord에 표시할 버튼
        view = AuthCodeView(settings.allowed_user_id, settings.channel_id, code_request=request, demo=service is None)
        message: discord.Message | None = None
        try:
            async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                # 메세지 보내기
                message = await channel.send(f"{prompt}\n요청 ID: `{request.request_id}`", view=view)
            print("Discord에 코드 입력 버튼을 보냈습니다. 입력을 기다립니다.", flush=True)
            try:
                # 사용자 코드 입력 대기
                code = await request.wait()
                # 제출자에게 보내는 응답까지 마친 뒤 Gateway를 닫습니다.
                async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                    # 입력창 처리 시간도 따로 기다리기
                    await view.wait()
            except TimeoutError:
                return None
            return code
        finally:
            request.cancel()
            view.stop()
            if message is not None:
                try:
                    async with asyncio.timeout(CONNECTION_TIMEOUT_SECONDS):
                        await message.edit(
                            content="인증 코드 입력창 테스트가 종료되었습니다." if service is None
                            else "인증 코드 입력 요청이 종료되었습니다. 로그인 성공 여부는 별도 확인이 필요합니다.",
                            view=None,
                        )
                except (discord.HTTPException, TimeoutError):
                    print("종료된 테스트 버튼을 제거하지 못했습니다. 해당 메시지는 더 이상 처리되지 않습니다.")


# 기존 입력창 테스트는 원문 대신 수신 여부만 반환합니다.
async def check_discord_input(settings: DiscordSettings) -> bool:
    return await request_discord_code(settings) is not None


# 가짜 로그인 작업이 Discord 코드를 기다렸다가 다음 단계로 재개되는지 확인합니다.
async def check_discord_handoff(settings: DiscordSettings) -> bool:
    print("가짜 로그인 작업: 인증 코드 도착을 기다립니다.", flush=True)
    code = await request_discord_code(settings)
    if code is None:
        return False
    # 실제 입력 대신 전달된 코드의 형식만 확인하며 원문은 출력하지 않습니다.
    if re.fullmatch(r"[0-9]{6}", code.value) is None:
        raise ValueError("전달된 인증 코드 형식이 올바르지 않습니다.")
    print("가짜 로그인 작업: 코드를 전달받아 다음 단계로 재개했습니다.", flush=True)
    return True


# 명시적으로 실행했을 때만 실제 연결과 테스트 알림 한 건을 수행합니다.
def main() -> int:
    parser = argparse.ArgumentParser(description="Discord 연결 또는 가짜 인증 코드 입력을 확인합니다.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--interactive", action="store_true", help="버튼과 입력창을 열고 최대 3분 기다립니다.")
    mode.add_argument("--handoff", action="store_true", help="가짜 로그인 작업이 코드를 받아 재개되는지 확인합니다.")
    args = parser.parse_args()
    try:
        settings = load_discord_settings()
        if args.interactive or args.handoff:
            received = asyncio.run(check_discord_handoff(settings) if args.handoff else check_discord_input(settings))
            print("테스트 코드 수신 완료. 연결을 종료했습니다." if received else "입력 대기 시간이 만료되었습니다.")
            return 0 if received else 1
        asyncio.run(check_discord_connection(settings))
    except (DiscordSettingsError, DiscordConnectionError) as error:
        print(str(error))
        return 1
    except KeyboardInterrupt:
        print("Discord 연결 확인을 취소했습니다.")
        return 130
    print("Discord Gateway 연결·테스트 메시지 전송 완료. 연결을 종료했습니다.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
