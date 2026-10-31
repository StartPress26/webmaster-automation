"""실제 AI 호출 없이 모델 클라이언트의 요청 구성·응답 해석·안전한 실패를 검증합니다."""

import json
from pathlib import Path
from unittest.mock import Mock

import httpx
import pytest

from app.login_bot.model_client import (
    DEFAULT_BASE_URL,
    DEFAULT_MODEL,
    ModelClient,
    ModelClientError,
    ModelSettings,
    ModelSettingsError,
    load_model_settings,
)

pytestmark = pytest.mark.anyio
TEST_KEY = "test-model-key"
SETTINGS = ModelSettings(base_url="https://gateway.example.com/v1", model="test-model", api_key=TEST_KEY)
ENV_NAMES = ("BROWSER_BOT_BASE_URL", "BROWSER_BOT_MODEL", "BROWSER_BOT_API_KEY_ENV", "KONKUK_AI_API_KEY", "CUSTOM_KEY")


# 프로젝트에서 사용하는 asyncio 백엔드로만 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# 실제 프로세스 환경변수가 설정 테스트에 섞이지 않도록 제거합니다.
@pytest.fixture
def clean_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ENV_NAMES:
        monkeypatch.delenv(name, raising=False)


# 지정한 응답을 돌려주는 가짜 서버로 클라이언트를 호출하고 보낸 요청을 함께 반환합니다.
async def call(
    response: httpx.Response, *, image: str | None = None
) -> tuple[dict[str, object], httpx.Request]:
    handler = Mock(return_value=response)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        result = await ModelClient(SETTINGS, http_client).complete_json("system", "user", image)
    return result, handler.call_args.args[0]


# 모델 응답 텍스트를 Chat Completions 응답 본문으로 감쌉니다.
def chat_response(content: object, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(
        200, json={"choices": [{"message": {"content": content}, "finish_reason": finish_reason}]}
    )


# 주소·인증 헤더·모델·메시지·JSON 응답 형식·타임아웃을 확인합니다.
async def test_request_payload() -> None:
    result, sent = await call(chat_response('{"action": "wait"}'))

    assert result == {"action": "wait"}
    assert str(sent.url) == "https://gateway.example.com/v1/chat/completions/"
    assert sent.headers["Authorization"] == "Bearer " + TEST_KEY
    body = json.loads(sent.content)
    assert body["model"] == "test-model"
    assert body["messages"] == [
        {"role": "system", "content": "system"},
        {"role": "user", "content": [{"type": "text", "text": "user"}]},
    ]
    assert body["response_format"] == {"type": "json_object"}
    assert sent.extensions["timeout"] == {"connect": 10.0, "read": 60.0, "write": 60.0, "pool": 60.0}


# 캡차 이미지가 있으면 사용자 메시지에 image_url 항목으로 첨부하는지 확인합니다.
async def test_image_attached() -> None:
    image = "data:image/png;base64,AAAA"

    _, sent = await call(chat_response('{"action": "wait"}'), image=image)

    content = json.loads(sent.content)["messages"][1]["content"]
    assert content[1] == {"type": "image_url", "image_url": {"url": image}}


# 코드펜스로 감싼 JSON도 객체로 해석하는지 확인합니다.
@pytest.mark.parametrize("answer", ['```json\n{"action": "back"}\n```', '```\n{"action": "back"}\n```'])
async def test_code_fence_removed(answer: str) -> None:
    result, _ = await call(chat_response(answer))

    assert result == {"action": "back"}


# 응답 상태·형식별로 정해진 오류 분류를 반환하고 키·응답 원문을 노출하지 않는지 확인합니다.
@pytest.mark.parametrize(
    ("response", "code"),
    [
        (httpx.Response(401, text=f"bad key {TEST_KEY}"), "http"),
        (httpx.Response(302, headers={"Location": "https://other.example.com/"}), "http"),
        (httpx.Response(200, text="not json"), "invalid_response"),
        (httpx.Response(200, json={"choices": []}), "invalid_response"),
        (chat_response(["list"]), "invalid_response"),
        (chat_response('{"action": "wa', finish_reason="length"), "incomplete"),
        (chat_response("   "), "incomplete"),
        (chat_response("secret-answer not json"), "invalid_json"),
        (chat_response('["secret-answer"]'), "invalid_json"),
    ],
)
async def test_response_errors(response: httpx.Response, code: str) -> None:
    with pytest.raises(ModelClientError) as error:
        await call(response)

    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    assert "secret-answer" not in str(error.value)
    assert error.value.__cause__ is None


# 시간 초과와 통신 오류를 원본 예외 없이 구분하는지 확인합니다.
@pytest.mark.parametrize(
    ("exception", "code"),
    [(httpx.ReadTimeout("timeout"), "timeout"), (httpx.ConnectError("refused"), "network")],
)
async def test_transport_errors(exception: Exception, code: str) -> None:
    handler = Mock(side_effect=exception)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        with pytest.raises(ModelClientError) as error:
            await ModelClient(SETTINGS, http_client).complete_json("system", "user")

    assert error.value.code == code
    assert error.value.__cause__ is None
    assert error.value.__suppress_context__


# 객체 출력에 키와 HTTP 클라이언트가 나타나지 않는지 확인합니다.
async def test_repr_hides_key() -> None:
    async with httpx.AsyncClient() as http_client:
        client = ModelClient(SETTINGS, http_client)

    assert TEST_KEY not in repr(SETTINGS)
    assert TEST_KEY not in repr(client)


# 설정이 없으면 기본 게이트웨이·모델과 기본 키 변수를 사용하는지 확인합니다.
@pytest.mark.usefixtures("clean_env")
def test_settings_defaults(tmp_path: Path) -> None:
    (tmp_path / ".env").write_text(f"KONKUK_AI_API_KEY={TEST_KEY}\n")

    settings = load_model_settings(tmp_path)

    assert settings == ModelSettings(DEFAULT_BASE_URL, DEFAULT_MODEL, TEST_KEY)


# 키 변수 이름 지정과 프로세스 환경변수 우선 적용을 확인합니다.
@pytest.mark.usefixtures("clean_env")
def test_settings_custom(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    (tmp_path / ".env").write_text(
        "BROWSER_BOT_BASE_URL=https://gateway.example.com/v1/\n"
        "BROWSER_BOT_MODEL=env-file-model\nBROWSER_BOT_API_KEY_ENV=CUSTOM_KEY\nCUSTOM_KEY=file-key\n"
    )
    monkeypatch.setenv("BROWSER_BOT_MODEL", "process-model")

    settings = load_model_settings(tmp_path)

    assert settings == ModelSettings("https://gateway.example.com/v1", "process-model", "file-key")


# HTTPS가 아니거나 인증정보·쿼리가 있는 주소, 키 누락을 값 없이 거부하는지 확인합니다.
@pytest.mark.usefixtures("clean_env")
@pytest.mark.parametrize(
    "env_text",
    [
        f"BROWSER_BOT_BASE_URL=http://gateway.example.com\nKONKUK_AI_API_KEY={TEST_KEY}\n",
        f"BROWSER_BOT_BASE_URL=https://user:pw@gateway.example.com\nKONKUK_AI_API_KEY={TEST_KEY}\n",
        f"BROWSER_BOT_BASE_URL=https://gateway.example.com?x=1\nKONKUK_AI_API_KEY={TEST_KEY}\n",
        "BROWSER_BOT_MODEL=test-model\n",
    ],
)
def test_settings_rejected(tmp_path: Path, env_text: str) -> None:
    (tmp_path / ".env").write_text(env_text)

    with pytest.raises(ModelSettingsError) as error:
        load_model_settings(tmp_path)

    assert TEST_KEY not in str(error.value)
