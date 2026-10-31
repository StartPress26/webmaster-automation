"""로그인 에이전트가 사용할 AI 모델을 Chat Completions 형식으로 비동기 호출합니다."""

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

import httpx
from dotenv import dotenv_values

from app.core.config import PROJECT_ROOT

DEFAULT_BASE_URL = "https://factchat-cloud.mindlogic.ai/v1/gateway"
DEFAULT_MODEL = "deepseek-v4.1-flash"
DEFAULT_KEY_ENV = "KONKUK_AI_API_KEY"
MAX_OUTPUT_TOKENS = 4000
REQUEST_TIMEOUT = httpx.Timeout(60.0, connect=10.0)
CODE_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)
ErrorCode = Literal["timeout", "network", "http", "incomplete", "invalid_response", "invalid_json"]


class ModelSettingsError(ValueError):
    """키 값을 포함하지 않는 AI 모델 설정 오류입니다."""


class ModelClientError(Exception):
    """키·응답 원문·원본 예외를 포함하지 않는 AI 호출 오류입니다."""

    # 호출자가 구분할 수 있는 오류 분류와 안전한 메시지만 보관합니다.
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class ModelSettings:
    """AI 게이트웨이 주소·모델·키이며 객체 출력 시 키를 숨깁니다."""

    base_url: str
    model: str
    api_key: str = field(repr=False)


# .env와 환경변수에서 설정을 읽고 키를 HTTPS 주소에만 전달하도록 검증합니다.
def load_model_settings(root: Path = PROJECT_ROOT) -> ModelSettings:
    values = dotenv_values(root / ".env", interpolate=False) | dict(os.environ)
    base_url = (values.get("BROWSER_BOT_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    model = values.get("BROWSER_BOT_MODEL") or DEFAULT_MODEL
    api_key = values.get(values.get("BROWSER_BOT_API_KEY_ENV") or DEFAULT_KEY_ENV) or ""

    parsed = urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ModelSettingsError("BROWSER_BOT_BASE_URL에 인증정보·쿼리 없는 HTTPS 주소를 설정하세요.")
    if not api_key:
        raise ModelSettingsError("BROWSER_BOT_API_KEY_ENV가 가리키는 API 키를 설정하세요.")
    return ModelSettings(base_url=base_url, model=model, api_key=api_key)


@dataclass(frozen=True)
class ModelClient:
    """전용 AsyncClient를 주입받으며 연결 생성·종료는 호출자가 담당합니다.

    로그인 에이전트가 전달한 인증정보와 화면을 모델 서버로 전송합니다.
    동작 검증과 로컬 기록의 인증정보 보호는 호출자가 담당합니다.
    """

    settings: ModelSettings
    http_client: httpx.AsyncClient = field(repr=False)

    # 프롬프트와 선택적 이미지를 보내고 모델이 답한 JSON 객체를 반환합니다.
    async def complete_json(
        self, system: str, user_text: str, image_data_url: str | None = None
    ) -> dict[str, object]:
        try:
            response = await self.http_client.post(
                self.settings.base_url + "/chat/completions/",
                headers={"Authorization": "Bearer " + self.settings.api_key},
                json=self._payload(system, user_text, image_data_url),
                timeout=REQUEST_TIMEOUT,
                # 키가 포함된 요청이 리다이렉트 대상에 재전송되지 않도록 합니다.
                follow_redirects=False,
            )
        except httpx.TimeoutException:
            raise ModelClientError("timeout", "AI 응답 시간이 초과되었습니다.") from None
        except httpx.RequestError:
            # 원본 예외에 포함될 수 있는 주소·헤더를 외부로 전달하지 않습니다.
            raise ModelClientError("network", "AI 서버와 통신하지 못했습니다.") from None

        if response.status_code != 200:
            raise ModelClientError("http", f"AI 서버가 HTTP {response.status_code}로 응답했습니다.")
        return _parse_object(_extract_answer(response))

    # 시스템·사용자 메시지와 이미지를 Chat Completions 요청 본문으로 구성합니다.
    def _payload(self, system: str, user_text: str, image_data_url: str | None) -> dict[str, object]:
        content: tuple[dict[str, object], ...] = ({"type": "text", "text": user_text},)
        if image_data_url is not None:
            content = (*content, {"type": "image_url", "image_url": {"url": image_data_url}})
        return {
            "model": self.settings.model,
            "max_tokens": MAX_OUTPUT_TOKENS,
            "store": False,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": list(content)},
            ],
            "response_format": {"type": "json_object"},
        }


# 응답 본문에서 첫 번째 선택지의 텍스트를 꺼내고 미완료 응답을 거부합니다.
def _extract_answer(response: httpx.Response) -> str:
    try:
        choice = response.json()["choices"][0]
        answer = choice["message"].get("content") or ""
        finish_reason = choice.get("finish_reason")
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise ModelClientError("invalid_response", "AI 응답 형식이 올바르지 않습니다.") from None
    if not isinstance(answer, str):
        raise ModelClientError("invalid_response", "AI 응답 형식이 올바르지 않습니다.")
    if finish_reason == "length" or not answer.strip():
        raise ModelClientError("incomplete", "AI 출력이 미완료이거나 비어 있습니다.")
    return answer.strip()


# 코드펜스를 제거한 뒤 JSON 객체 하나인지 확인합니다.
def _parse_object(answer: str) -> dict[str, object]:
    fenced = CODE_FENCE.fullmatch(answer)
    text = fenced.group(1) if fenced else answer
    try:
        value = json.loads(text)
    except ValueError:
        raise ModelClientError("invalid_json", "AI 출력이 JSON 형식이 아닙니다.") from None
    if not isinstance(value, dict):
        raise ModelClientError("invalid_json", "AI 출력이 JSON 객체가 아닙니다.")
    return value
