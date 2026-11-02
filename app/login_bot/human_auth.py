"""로그인 요청별로 일회용 인증 코드의 도착을 기다리고 전달합니다."""

import asyncio
import math
import re
import time
from dataclasses import dataclass, field
from typing import Protocol
from uuid import uuid4


@dataclass(frozen=True)
class AuthCode:
    """객체 출력에서 원문을 숨기는 메모리 전용 인증 코드입니다."""

    value: str = field(repr=False)


class SmsCodeProvider(Protocol):
    """로그인봇이 사용자에게 문자 코드를 요청하는 전달 수단의 계약입니다."""

    # 계정정보 없이 서비스명과 마스킹 번호만 전달하고 코드 또는 만료를 반환합니다.
    async def request_code(
        self, *, service: str, masked_phone: str | None, timeout_seconds: float
    ) -> AuthCode | None: ...


@dataclass(frozen=True)
class AuthCodeRequest:
    """하나의 로그인과 하나의 대기 작업에 연결되는 인증 요청입니다.

    같은 이벤트 루프에서 사용합니다. 별도 전역 저장소 없이 UI와 호출자가
    같은 요청을 공유하고, 끝난 요청은 참조가 해제되면 함께 정리됩니다.
    """

    request_id: str
    deadline: float
    _result: asyncio.Future[AuthCode] = field(repr=False, compare=False)
    _waiting: asyncio.Event = field(repr=False, compare=False)

    # 완료·취소·만료된 요청에는 새로운 코드를 받지 않습니다.
    @property
    def is_pending(self) -> bool:
        return not self._result.done() and time.monotonic() < self.deadline

    # 요청 ID와 코드 형식을 검사하고 최초 제출만 대기 중인 작업에 전달합니다.
    def submit(self, request_id: str, code: str) -> bool:
        if request_id != self.request_id or not self.is_pending:
            return False
        if re.fullmatch(r"[0-9]{6}", code) is None:
            return False
        self._result.set_result(AuthCode(code))
        return True

    # 한 작업만 값을 소비하며 만료·호출자 취소 시 Future도 취소합니다.
    async def wait(self) -> AuthCode:
        if self._waiting.is_set():
            raise RuntimeError("인증 요청은 하나의 작업에서만 기다릴 수 있습니다.")
        self._waiting.set()
        try:
            async with asyncio.timeout(max(0.0, self.deadline - time.monotonic())):
                return await self._result
        finally:
            self.cancel()

    # 대기 작업을 깨우고 이후 도착하는 제출을 거부합니다.
    def cancel(self) -> None:
        self._result.cancel()


# 실행 중인 이벤트 루프에서 고유 ID와 제한 시간이 있는 요청을 생성합니다.
def create_auth_code_request(timeout_seconds: float = 180.0) -> AuthCodeRequest:
    if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise ValueError("인증 대기 시간은 유한한 양수여야 합니다.")
    return AuthCodeRequest(
        request_id=uuid4().hex,
        deadline=time.monotonic() + timeout_seconds,
        _result=asyncio.get_running_loop().create_future(),
        _waiting=asyncio.Event(),
    )
