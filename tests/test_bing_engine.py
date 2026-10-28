"""실제 네트워크 없이 Bing 공통 요청의 인증·응답·오류 처리를 검증합니다."""

import asyncio
import json
import traceback
from datetime import datetime, timezone
from unittest.mock import Mock
from typing import Literal
from xml.etree import ElementTree

import httpx
import pytest

from app.engines.bing import BingEngine, BingEngineError, BingSite, ErrorCode

pytestmark = pytest.mark.anyio
TEST_KEY = "test-bing-key"


# 프로젝트에서 사용하는 asyncio 백엔드로만 실행합니다.
@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


# GET 쿼리·POST 본문·인증 키·타임아웃과 입력 보존을 확인합니다.
@pytest.mark.parametrize("method", ["get", "post"])
async def test_request_payload(method: Literal["get", "post"]) -> None:
    params = {"siteUrl": "https://example.com/?lang=ko"}
    payload = {"siteUrl": "https://example.com/"}
    handler = Mock(return_value=httpx.Response(200, json={"d": None}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        engine = BingEngine(TEST_KEY, client)
        assert TEST_KEY not in repr(engine)
        result = await engine._request(
            method, "GetUrlInfo" if method == "get" else "AddSite",
            params=params if method == "get" else None,
            json=payload if method == "post" else None,
        )
        assert not client.is_closed
    sent = handler.call_args.args[0]
    assert sent.url.host == "ssl.bing.com"
    assert sent.url.path.startswith("/webmaster/api.svc/json/")
    assert sent.url.params["apikey"] == TEST_KEY
    assert sent.method == method.upper()
    assert sent.headers["Content-Type"] == "application/json; charset=utf-8"
    assert sent.extensions["timeout"] == {
        "connect": 10.0, "read": 30.0, "write": 30.0, "pool": 30.0,
    }
    if method == "get":
        assert sent.url.params["siteUrl"] == params["siteUrl"]
        assert sent.content == b""
    else:
        assert json.loads(sent.content) == payload
        assert "siteUrl" not in sent.url.params
    assert params == {"siteUrl": "https://example.com/?lang=ko"}
    assert payload == {"siteUrl": "https://example.com/"}
    assert result is None
    handler.assert_called_once()


# null과 false를 오류로 오해하지 않고 결과 그대로 반환합니다.
@pytest.mark.parametrize("value", [None, False, True, [], {"IsPage": True}])
async def test_result_envelope(value: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": value}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await BingEngine(TEST_KEY, client)._request("get", "GetUserSites") == value


# JSON이 아닌 HTTP 오류에서도 상태에 맞는 안전한 예외를 반환합니다.
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (429, "rate_limit"),
    (400, "response"), (404, "response"), (500, "response"), (201, "response"),
])
async def test_http_errors(status: int, code: ErrorCode) -> None:
    handler = Mock(return_value=httpx.Response(status, text=TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client)._request("get", "GetUserSites")
    assert error.value.code == code
    assert error.value.status_code == status
    assert TEST_KEY not in str(error.value)
    handler.assert_called_once()


# HTTP 200·400 모두 Bing의 숫자 오류 코드로 분류합니다.
@pytest.mark.parametrize("status", [200, 400])
@pytest.mark.parametrize("api_error, code", [
    (3, "authentication"), (4, "rate_limit"), (5, "rate_limit"),
    (6, "permission"), (13, "permission"), (14, "permission"), (999, "response"),
])
async def test_api_errors(status: int, api_error: int, code: ErrorCode) -> None:
    handler = Mock(return_value=httpx.Response(
        status, json={"ErrorCode": api_error, "Message": TEST_KEY, "d": None},
    ))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client)._request("get", "GetUserSites")
    assert error.value.code == code
    assert error.value.status_code == status
    assert TEST_KEY not in repr(error.value)


# 성공 응답에서도 잘못된 JSON·결과 구조·오류 자료형을 거부합니다.
@pytest.mark.parametrize("body", [
    "not json", "null", "[]", "{}", '{"d":null,"ErrorCode":"3"}',
    '{"d":null,"ErrorCode":false}',
])
async def test_invalid_response(body: str) -> None:
    handler = Mock(return_value=httpx.Response(200, text=body))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client)._request("get", "GetUserSites")
    assert error.value.code == "response"


# 연결·읽기·쓰기·풀 대기 시간 초과를 통신 장애와 구분합니다.
@pytest.mark.parametrize("error_type, code", [
    (httpx.ConnectTimeout, "timeout"), (httpx.ReadTimeout, "timeout"),
    (httpx.WriteTimeout, "timeout"), (httpx.PoolTimeout, "timeout"),
    (httpx.ConnectError, "connection"), (httpx.RemoteProtocolError, "connection"),
])
async def test_transport_errors(error_type: type[httpx.RequestError], code: ErrorCode) -> None:
    handler = Mock(side_effect=error_type(TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client)._request("post", "AddSite")
    assert error.value.code == code
    assert error.value.status_code is None
    assert TEST_KEY not in "".join(traceback.format_exception(error.value))
    handler.assert_called_once()


# 자동 리다이렉트가 켜져 있어도 다른 주소로 API 키를 보내지 않습니다.
async def test_redirect_is_not_followed() -> None:
    handler = Mock(return_value=httpx.Response(
        307, headers={"Location": "https://other.test/collect"},
    ))
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(handler), follow_redirects=True,
    ) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client)._request("post", "AddSite")
    assert error.value.status_code == 307
    handler.assert_called_once()


# API 키의 공백·제어 문자를 외부 통신 전에 거부합니다.
@pytest.mark.parametrize("key", ["", " ", "key\n", "key\x00", "key\x7f"])
async def test_invalid_key(key: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            BingEngine(key, client)
    assert error.value.code == "authentication"
    handler.assert_not_called()


# 외부 URL·경로·쿼리를 API 작업 이름으로 받지 않습니다.
@pytest.mark.parametrize("operation", ["", "../AddSite", "https://other.test/", "AddSite?apikey=x"])
async def test_invalid_operation(operation: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client)._request("get", operation)
    handler.assert_not_called()


# 요청 쿼리로 API 키를 덮어쓰는 시도를 거부합니다.
async def test_key_override_is_rejected() -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client)._request("get", "GetUserSites", params={"APIKEY": "other"})
    handler.assert_not_called()


# 취소는 통신 오류로 바꾸지 않고 호출자에게 전달합니다.
async def test_cancellation_propagates() -> None:
    handler = Mock(side_effect=asyncio.CancelledError)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(asyncio.CancelledError):
            await BingEngine(TEST_KEY, client)._request("get", "GetUserSites")
    handler.assert_called_once()


# 다른 사이트와 구분하여 소유 확인 여부·인증 코드를 반환합니다.
@pytest.mark.parametrize("verified", [True, False])
async def test_get_site_found(verified: bool) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": [
        {"Url": "https://other.test/", "IsVerified": True},
        {"Url": "https://example.com/", "IsVerified": verified, "AuthenticationCode": "sample-code"},
    ]}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).get_site("https://example.com/")
    assert result == BingSite("https://example.com/", verified, "sample-code")
    assert "sample-code" not in repr(result)
    sent = handler.call_args.args[0]
    assert sent.method == "GET"
    assert sent.url.path == "/webmaster/api.svc/json/GetUserSites"
    assert dict(sent.url.params) == {"apikey": TEST_KEY}
    handler.assert_called_once()


# 인증 코드의 누락·null·빈 값은 미설정으로 반환합니다.
@pytest.mark.parametrize("extra", [{}, {"AuthenticationCode": None}, {"AuthenticationCode": ""}])
async def test_get_site_optional_code(extra: dict[str, object]) -> None:
    site = {"Url": "https://example.com/", "IsVerified": True} | extra
    handler = Mock(return_value=httpx.Response(200, json={"d": [site]}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).get_site("https://example.com/")
    assert result == BingSite("https://example.com/", True)


# 빈 목록과 정확히 일치하지 않는 사이트는 현재 계정에서 찾지 못한 결과입니다.
@pytest.mark.parametrize("sites", [
    [], [{"Url": "https://example.com", "IsVerified": True}],
    [{"Url": "http://example.com/", "IsVerified": True}],
    [{"Url": "https://example.com/post", "IsVerified": True}],
    [{"Url": "https://example.com/?lang=ko", "IsVerified": True}],
])
async def test_get_site_not_found(sites: list[dict[str, object]]) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": sites}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        assert await BingEngine(TEST_KEY, client).get_site("https://example.com/") is None


# 잘못된 목록·필드를 미등록·미인증으로 숨기지 않습니다.
@pytest.mark.parametrize("data", [
    None, {}, False, [None], [{}],
    [{"Url": 123, "IsVerified": True}],
    [{"Url": " ", "IsVerified": True}],
    [{"Url": "https://example.com/"}],
    [{"Url": "https://example.com/", "IsVerified": "false"}],
    [{"Url": "https://example.com/", "IsVerified": 1}],
    [{"Url": "https://example.com/", "IsVerified": False, "AuthenticationCode": 123}],
    [{"Url": "https://example.com/", "IsVerified": True},
     {"Url": "https://example.com/", "IsVerified": False}],
])
async def test_get_site_invalid_response(data: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": data}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).get_site("https://example.com/")
    assert error.value.code == "response"
    assert error.value.status_code == 200


# 불완전한 URL은 사이트 목록 요청 전에 거부합니다.
@pytest.mark.parametrize("site_url", [
    "", "example.com", "ftp://example.com/", "https://example.com:bad/",
    "https://example.com:0/", "https://user:pass@example.com/",
    "https://example.com/#part", "https://example.com/\n", "https://example.com/\\post",
])
async def test_get_site_invalid_input(site_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).get_site(site_url)
    handler.assert_not_called()


# 조회 오류는 사이트가 없다는 결과로 바꾸지 않습니다.
async def test_get_site_api_error_propagates() -> None:
    handler = Mock(return_value=httpx.Response(400, json={"ErrorCode": 3}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).get_site("https://example.com/")
    assert error.value.code == "authentication"


# 등록 요청 후 조회만 수행하며 기존 소유 확인 상태도 그대로 반환합니다.
@pytest.mark.parametrize("verified", [False, True])
async def test_register_site_confirmed(verified: bool) -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": None}),
        httpx.Response(200, json={"d": [{
            "Url": "https://example.com/", "IsVerified": verified,
            "AuthenticationCode": "sample-code",
        }]}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        site = await BingEngine(TEST_KEY, client).register_site("https://example.com/")
    assert site == BingSite("https://example.com/", verified, "sample-code")
    registered, checked = (call.args[0] for call in handler.call_args_list)
    assert registered.method == "POST"
    assert registered.url.path == "/webmaster/api.svc/json/AddSite"
    assert json.loads(registered.content) == {"siteUrl": "https://example.com/"}
    assert registered.url.params["apikey"] == TEST_KEY
    assert checked.method == "GET"
    assert checked.url.path == "/webmaster/api.svc/json/GetUserSites"
    assert handler.call_count == 2


# 잘못된 입력은 AddSite 호출 전에 거부합니다.
@pytest.mark.parametrize("site_url", [
    "", "example.com", "ftp://example.com/", "https://example.com:bad/",
    "https://example.com/#part", "https://user:pass@example.com/",
])
async def test_register_site_invalid_input(site_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).register_site(site_url)
    handler.assert_not_called()


# 공식 null 응답이 아닌 값은 등록 성공으로 해석하지 않습니다.
@pytest.mark.parametrize("result", [True, False, {}, []])
async def test_register_site_invalid_response(result: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": result}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).register_site("https://example.com/")
    assert error.value.code == "response"
    handler.assert_called_once()


# 등록 후 조회에서 대상이 없으면 확인 불가를 알리고 등록을 반복하지 않습니다.
async def test_register_site_not_confirmed() -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": None}), httpx.Response(200, json={"d": []}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError, match="다시 조회") as error:
            await BingEngine(TEST_KEY, client).register_site("https://example.com/")
    assert error.value.code == "response"
    assert handler.call_count == 2


# 등록 또는 후속 조회의 오류를 숨기지 않고 재전송 없이 전달합니다.
@pytest.mark.parametrize("stage", ["register", "lookup"])
@pytest.mark.parametrize("status, code", [(401, "authentication"), (429, "rate_limit"), (500, "response")])
async def test_register_site_error_propagates(stage: str, status: int, code: ErrorCode) -> None:
    responses = ([httpx.Response(200, json={"d": None})] if stage == "lookup" else [])
    handler = Mock(side_effect=responses + [httpx.Response(status, text=TEST_KEY)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).register_site("https://example.com/")
    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    assert handler.call_count == (2 if stage == "lookup" else 1)


# 등록 요청 시간 초과는 결과 불명으로 전달하고 자동 재등록하지 않습니다.
async def test_register_site_timeout() -> None:
    handler = Mock(side_effect=httpx.ReadTimeout(TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).register_site("https://example.com/")
    assert error.value.code == "timeout"
    handler.assert_called_once()


# 인증 코드를 조회해 XML과 정확한 설치 주소를 반환하며 배포 요청은 하지 않습니다.
@pytest.mark.parametrize("site_url, expected_url", [
    ("https://example.com/", "https://example.com/BingSiteAuth.xml"),
    ("https://example.com", "https://example.com/BingSiteAuth.xml"),
    ("http://example.com:8080/", "http://example.com:8080/BingSiteAuth.xml"),
])
@pytest.mark.parametrize("verified", [False, True])
async def test_get_verification_file(
    site_url: str, expected_url: str, verified: bool,
) -> None:
    code = "258CAD36B9EEE22F1CFDEB4C239D26BB"
    handler = Mock(return_value=httpx.Response(200, json={"d": [{
        "Url": site_url, "IsVerified": verified, "AuthenticationCode": code,
    }]}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).get_verification_file(site_url)
    assert result.file_name == "BingSiteAuth.xml"
    assert result.verification_url == expected_url
    root = ElementTree.fromstring(result.file_content)
    assert root.tag == "users"
    assert len(root) == 1
    assert root.findtext("user") == code
    assert TEST_KEY not in result.file_content
    sent = handler.call_args.args[0]
    assert sent.method == "GET"
    assert sent.url.path == "/webmaster/api.svc/json/GetUserSites"
    handler.assert_called_once()


# 외부 응답의 특수 문자를 XML 태그로 해석하지 않고 텍스트로 보존합니다.
async def test_verification_code_is_xml_text() -> None:
    code = "A&<tag>B</tag>"
    handler = Mock(return_value=httpx.Response(200, json={"d": [{
        "Url": "https://example.com/", "IsVerified": False, "AuthenticationCode": code,
    }]}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).get_verification_file("https://example.com/")
    root = ElementTree.fromstring(result.file_content)
    assert root.findtext("user") == code
    assert root.find("user/tag") is None


# 미등록 사이트를 자동으로 추가하지 않고 먼저 등록하도록 안내합니다.
async def test_verification_file_requires_registered_site() -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": []}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError, match="먼저 등록") as error:
            await BingEngine(TEST_KEY, client).get_verification_file("https://example.com/")
    assert error.value.code == "permission"
    handler.assert_called_once()


# 누락·빈 값·공백·제어 문자가 있는 코드로 인증 파일을 만들지 않습니다.
@pytest.mark.parametrize("extra", [
    {}, {"AuthenticationCode": None}, {"AuthenticationCode": ""},
    {"AuthenticationCode": " "}, {"AuthenticationCode": "sample\ncode"},
    {"AuthenticationCode": "sample\x00code"}, {"AuthenticationCode": 123},
])
async def test_verification_file_invalid_code(extra: dict[str, object]) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": [
        {"Url": "https://example.com/", "IsVerified": False} | extra,
    ]}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).get_verification_file("https://example.com/")
    assert error.value.code == "response"


# 지원하지 않는 주소를 루트 주소로 몰래 바꾸지 않고 통신 전에 거부합니다.
@pytest.mark.parametrize("site_url", [
    "", "example.com", "ftp://example.com/", "https://example.com/blog/",
    "https://example.com/?lang=ko", "https://user:pass@example.com/",
    "https://example.com/#part",
])
async def test_verification_file_invalid_url(site_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).get_verification_file(site_url)
    handler.assert_not_called()


# 인증 정보 조회의 API 오류를 파일 설치 안내로 바꾸지 않고 전달합니다.
async def test_verification_file_api_error_propagates() -> None:
    handler = Mock(return_value=httpx.Response(400, json={"ErrorCode": 3}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).get_verification_file("https://example.com/")
    assert error.value.code == "authentication"


# 확인 요청의 true와 사이트 조회의 인증 완료가 모두 확인돼야 성공합니다.
async def test_verify_ownership_confirmed() -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": True}),
        httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": True}]}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        site = await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert site == BingSite("https://example.com/", True)
    verified, checked = (call.args[0] for call in handler.call_args_list)
    assert verified.method == "POST"
    assert verified.url.path == "/webmaster/api.svc/json/VerifySite"
    assert verified.url.params["apikey"] == TEST_KEY
    assert json.loads(verified.content) == {"siteUrl": "https://example.com/"}
    assert checked.method == "GET"
    assert checked.url.path == "/webmaster/api.svc/json/GetUserSites"
    assert handler.call_count == 2


# false 응답을 HTTP 200이라는 이유로 인증 완료로 처리하지 않습니다.
async def test_verify_ownership_not_verified() -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": False}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError, match="배포") as error:
            await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert error.value.code == "permission"
    handler.assert_called_once()


# 숫자·문자열 등 참처럼 보이는 값도 bool 응답이 아니면 거부합니다.
@pytest.mark.parametrize("value", [None, 1, 0, "true", "false", {}, []])
async def test_verify_ownership_invalid_response(value: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": value}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert error.value.code == "response"
    handler.assert_called_once()


# 성공 응답 뒤에도 사이트가 없거나 미인증이면 확인 불가를 알립니다.
@pytest.mark.parametrize("sites", [[], [{"Url": "https://example.com/", "IsVerified": False}]])
async def test_verify_ownership_not_confirmed(sites: list[dict[str, object]]) -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": True}), httpx.Response(200, json={"d": sites}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError, match="다시 조회") as error:
            await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert error.value.code == "permission"
    assert handler.call_count == 2


# 잘못된 URL로는 소유 확인을 요청하지 않습니다.
@pytest.mark.parametrize("site_url", ["", "example.com", "https://example.com/#part"])
async def test_verify_ownership_invalid_url(site_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).verify_ownership(site_url)
    handler.assert_not_called()


# 확인 요청과 재조회 양쪽의 API 오류를 숨기거나 자동 재시도하지 않습니다.
@pytest.mark.parametrize("stage", ["verify", "lookup"])
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (429, "rate_limit"), (500, "response"),
])
async def test_verify_ownership_error_propagates(stage: str, status: int, code: ErrorCode) -> None:
    responses = [httpx.Response(200, json={"d": True})] if stage == "lookup" else []
    handler = Mock(side_effect=responses + [httpx.Response(status, text=TEST_KEY)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    assert handler.call_count == (2 if stage == "lookup" else 1)


# 확인 요청과 재조회에서 시간 초과가 발생하면 결과를 추측하지 않습니다.
@pytest.mark.parametrize("stage", ["verify", "lookup"])
async def test_verify_ownership_timeout(stage: str) -> None:
    responses = [httpx.Response(200, json={"d": True})] if stage == "lookup" else []
    handler = Mock(side_effect=responses + [httpx.ReadTimeout(TEST_KEY)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).verify_ownership("https://example.com/")
    assert error.value.code == "timeout"
    assert handler.call_count == (2 if stage == "lookup" else 1)


# 정확한 필드명으로 주소를 한 번 제출하며 사이트맵 다운로드나 소유 확인은 하지 않습니다.
@pytest.mark.parametrize("sitemap_url", [
    "https://example.com/sitemap.xml",
    "https://example.com/sitemap-index.xml",
    "https://example.com/feed?format=rss&lang=ko",
])
async def test_submit_sitemap_accepted(sitemap_url: str) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": None}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        accepted = await BingEngine(TEST_KEY, client).submit_sitemap("https://example.com/", sitemap_url)
    assert accepted is True
    sent = handler.call_args.args[0]
    assert sent.method == "POST"
    assert sent.url.path == "/webmaster/api.svc/json/SubmitFeed"
    assert dict(sent.url.params) == {"apikey": TEST_KEY}
    assert json.loads(sent.content) == {"siteUrl": "https://example.com/", "feedUrl": sitemap_url}
    handler.assert_called_once()


# 어느 쪽 URL이 잘못됐든 외부 제출 전에 거부합니다.
@pytest.mark.parametrize("site_url, sitemap_url", [
    ("", "https://example.com/sitemap.xml"),
    ("example.com", "https://example.com/sitemap.xml"),
    ("https://example.com/", ""),
    ("https://example.com/", "/sitemap.xml"),
    ("https://example.com/", "ftp://example.com/sitemap.xml"),
    ("https://example.com/", "https://user:pass@example.com/sitemap.xml"),
    ("https://example.com/", "https://example.com/sitemap.xml#part"),
])
async def test_submit_sitemap_invalid_url(site_url: str, sitemap_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).submit_sitemap(site_url, sitemap_url)
    handler.assert_not_called()


# 공식 null 응답과 다른 값을 임의로 성공으로 해석하지 않습니다.
@pytest.mark.parametrize("value", [True, False, {}, [], "accepted"])
async def test_submit_sitemap_invalid_response(value: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": value}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).submit_sitemap(
                "https://example.com/", "https://example.com/sitemap.xml",
            )
    assert error.value.code == "response"
    handler.assert_called_once()


# 제출 오류를 숨기지 않고 분류를 유지하며 자동 재시도하지 않습니다.
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (429, "rate_limit"), (500, "response"),
])
async def test_submit_sitemap_api_error(status: int, code: ErrorCode) -> None:
    handler = Mock(return_value=httpx.Response(status, text=TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).submit_sitemap(
                "https://example.com/", "https://example.com/sitemap.xml",
            )
    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    handler.assert_called_once()


# HTTP 200으로 반환된 Bing 오류도 제출 성공으로 처리하지 않습니다.
async def test_submit_sitemap_bing_error() -> None:
    handler = Mock(return_value=httpx.Response(200, json={"ErrorCode": 14, "d": None}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).submit_sitemap(
                "https://example.com/", "https://example.com/sitemap.xml",
            )
    assert error.value.code == "permission"
    handler.assert_called_once()


# 시간 초과와 연결 실패에서는 접수를 단정하지 않고 오류를 전달합니다.
@pytest.mark.parametrize("error_type, code", [
    (httpx.ReadTimeout, "timeout"), (httpx.ConnectError, "connection"),
])
async def test_submit_sitemap_transport_error(
    error_type: type[httpx.RequestError], code: ErrorCode,
) -> None:
    handler = Mock(side_effect=error_type(TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).submit_sitemap(
                "https://example.com/", "https://example.com/sitemap.xml",
            )
    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    handler.assert_called_once()


# 신규 등록과 기존 미인증 사이트 모두 파일 설치 안내에서 멈춥니다.
@pytest.mark.parametrize("registered", [False, True])
async def test_setup_requires_verification(registered: bool) -> None:
    site_response = httpx.Response(200, json={"d": [{
        "Url": "https://example.com/", "IsVerified": False, "AuthenticationCode": "sample-code",
    }]})
    responses = ([site_response] if registered else [
        httpx.Response(200, json={"d": []}),
        httpx.Response(200, json={"d": None}), site_response,
    ]) + [site_response]
    handler = Mock(side_effect=responses)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).register_new_site(
            "https://example.com/", "https://example.com/sitemap.xml",
        )
    assert result.status == "verification_required"
    assert result.verification_file is not None
    assert result.verification_file.verification_url == "https://example.com/BingSiteAuth.xml"
    assert ElementTree.fromstring(result.verification_file.file_content).findtext("user") == "sample-code"
    operations = tuple(call.args[0].url.path.rsplit("/", 1)[-1] for call in handler.call_args_list)
    assert operations == (("GetUserSites", "GetUserSites") if registered else (
        "GetUserSites", "AddSite", "GetUserSites", "GetUserSites",
    ))


# 설치 후 재호출하면 재등록 없이 실제 소유 확인과 사이트맵 제출을 진행합니다.
async def test_setup_resumes_after_installation() -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": False}]}),
        httpx.Response(200, json={"d": True}),
        httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": True}]}),
        httpx.Response(200, json={"d": None}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).register_new_site(
            "https://example.com/", "https://example.com/sitemap.xml", verification_ready=True,
        )
    assert result.status == "completed"
    assert result.verification_file is None
    assert tuple(call.args[0].url.path.rsplit("/", 1)[-1] for call in handler.call_args_list) == (
        "GetUserSites", "VerifySite", "GetUserSites", "SubmitFeed",
    )
    assert json.loads(handler.call_args.args[0].content) == {
        "siteUrl": "https://example.com/", "feedUrl": "https://example.com/sitemap.xml",
    }


# 이미 인증된 사이트는 설치 완료 입력과 관계없이 사이트맵 제출로 진행합니다.
@pytest.mark.parametrize("ready", [False, True])
async def test_setup_already_verified(ready: bool) -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": True}]}),
        httpx.Response(200, json={"d": None}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).register_new_site(
            "https://example.com/", "https://example.com/sitemap.xml", verification_ready=ready,
        )
    assert result.status == "completed"
    assert result.verification_file is None
    assert tuple(call.args[0].url.path.rsplit("/", 1)[-1] for call in handler.call_args_list) == (
        "GetUserSites", "SubmitFeed",
    )


# 모든 입력을 먼저 검사하여 잘못된 사이트맵이나 인증 범위로 사이트가 등록되지 않게 합니다.
@pytest.mark.parametrize("site_url, sitemap_url", [
    ("https://example.com/", "/sitemap.xml"),
    ("https://example.com/blog/", "https://example.com/sitemap.xml"),
    ("https://example.com/?lang=ko", "https://example.com/sitemap.xml"),
    ("example.com", "https://example.com/sitemap.xml"),
])
async def test_setup_invalid_input(site_url: str, sitemap_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).register_new_site(site_url, sitemap_url)
    handler.assert_not_called()


# 단계별 오류가 발생하면 다음 단계나 자동 재시도로 넘어가지 않습니다.
@pytest.mark.parametrize("stage", ["lookup", "register", "file", "verify", "sitemap"])
async def test_setup_stops_on_error(stage: str) -> None:
    unverified = httpx.Response(200, json={"d": [{
        "Url": "https://example.com/", "IsVerified": False, "AuthenticationCode": "sample-code",
    }]})
    verified = httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": True}]})
    before_error = {
        "lookup": [],
        "register": [httpx.Response(200, json={"d": []})],
        "file": [unverified],
        "verify": [unverified],
        "sitemap": [verified],
    }[stage]
    handler = Mock(side_effect=before_error + [httpx.Response(429, text=TEST_KEY)])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).register_new_site(
                "https://example.com/", "https://example.com/sitemap.xml",
                verification_ready=stage == "verify",
            )
    assert error.value.code == "rate_limit"
    assert handler.call_count == len(before_error) + 1


# 설치 완료를 입력해도 Bing 확인이 실패하면 사이트맵을 제출하지 않습니다.
async def test_setup_verification_ready_is_not_proof() -> None:
    handler = Mock(side_effect=[
        httpx.Response(200, json={"d": [{"Url": "https://example.com/", "IsVerified": False}]}),
        httpx.Response(200, json={"d": False}),
    ])
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).register_new_site(
                "https://example.com/", "https://example.com/sitemap.xml", verification_ready=True,
            )
    assert error.value.code == "permission"
    assert handler.call_count == 2


# 메인페이지·글의 정확한 주소와 쿼리를 보존하고 UTC 날짜·수집 상태를 반환합니다.
@pytest.mark.parametrize("page_url", ["https://example.com/", "https://example.com/post?lang=ko&x=1"])
@pytest.mark.parametrize("offset", ["", "+0900", "-0700"])
async def test_inspect_url_crawled(page_url: str, offset: str) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": {
        "Url": page_url, "LastCrawledDate": f"/Date(1792910307000{offset})/",
        "DiscoveryDate": "/Date(1792911600000)/", "HttpStatus": 0,
        "IsPage": True, "DocumentSize": 0,
    }}))
    before = datetime.now(timezone.utc)
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).inspect_url("https://example.com/", page_url)
    assert result.index_status == "crawled"
    assert result.last_crawl_time == datetime(2026, 10, 25, 6, 38, 27, tzinfo=timezone.utc)
    assert result.discovery_date == datetime(2026, 10, 25, 7, tzinfo=timezone.utc)
    assert before <= result.checked_at <= datetime.now(timezone.utc)
    assert result.http_status == 0 and result.is_page is True and result.document_size == 0
    assert result.page_url == page_url
    sent = handler.call_args.args[0]
    assert sent.method == "GET"
    assert sent.url.path == "/webmaster/api.svc/json/GetUrlInfo"
    assert dict(sent.url.params) == {"apikey": TEST_KEY, "siteUrl": "https://example.com/", "url": page_url}
    handler.assert_called_once()


# 미지정 날짜·기본 날짜·미래 날짜로 수집이나 미색인을 단정하지 않습니다.
@pytest.mark.parametrize("extra", [
    {}, {"LastCrawledDate": None}, {"LastCrawledDate": "/Date(0)/"},
    {"LastCrawledDate": "/Date(-62135596800000)/"},
    {"LastCrawledDate": "/Date(253402214400000)/"},
])
@pytest.mark.parametrize("is_page", [True, False])
async def test_inspect_url_unknown(extra: dict[str, object], is_page: bool) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": {
        "Url": "https://example.com/", "IsPage": is_page,
        "DiscoveryDate": "/Date(253402214400000)/",
    } | extra}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await BingEngine(TEST_KEY, client).inspect_url("https://example.com/", "https://example.com/")
    assert result.index_status == "unknown"
    assert result.discovery_date == datetime(9999, 12, 31, tzinfo=timezone.utc)
    assert result.http_status is None and result.document_size is None


# 대상 URL 누락·불일치와 필드 오류를 미색인이나 관측 없음으로 숨기지 않습니다.
@pytest.mark.parametrize("data", [
    None, [], {}, {"Url": "https://other.test/"},
    {"Url": "https://example.com/", "LastCrawledDate": "invalid"},
    {"Url": "https://example.com/", "DiscoveryDate": 123},
    {"Url": "https://example.com/", "LastCrawledDate": "/Date(999999999999999999)/"},
    {"Url": "https://example.com/", "LastCrawledDate": "/Date(1000+2460)/"},
    {"Url": "https://example.com/", "IsPage": "true"},
    {"Url": "https://example.com/", "IsPage": 1},
    {"Url": "https://example.com/", "HttpStatus": True},
    {"Url": "https://example.com/", "HttpStatus": 99},
    {"Url": "https://example.com/", "HttpStatus": 600},
    {"Url": "https://example.com/", "DocumentSize": -1},
    {"Url": "https://example.com/", "DocumentSize": "0"},
])
async def test_inspect_url_invalid_response(data: object) -> None:
    handler = Mock(return_value=httpx.Response(200, json={"d": data}))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).inspect_url("https://example.com/", "https://example.com/")
    assert error.value.code == "response"


# 다른 출처와 지원하지 않는 속성은 요청 전에 거부합니다.
@pytest.mark.parametrize("site_url, page_url", [
    ("https://example.com/", "https://example.com.evil.test/post"),
    ("https://example.com/", "https://sub.example.com/post"),
    ("https://example.com/", "http://example.com/post"),
    ("https://example.com/", "https://example.com:8443/post"),
    ("https://example.com/blog/", "https://example.com/blog/post"),
    ("https://example.com/?x=1", "https://example.com/"),
    ("https://example.com/", "https://example.com/post#part"),
    ("https://example.com/", "not-a-url"),
])
async def test_inspect_url_invalid_scope(site_url: str, page_url: str) -> None:
    handler = Mock()
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):
            await BingEngine(TEST_KEY, client).inspect_url(site_url, page_url)
    handler.assert_not_called()


# API 오류는 unknown이나 not_indexed가 아니라 분류된 예외로 전달합니다.
@pytest.mark.parametrize("status, code", [
    (401, "authentication"), (403, "permission"), (429, "rate_limit"), (500, "response"),
])
async def test_inspect_url_api_error(status: int, code: ErrorCode) -> None:
    handler = Mock(return_value=httpx.Response(status, text=TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).inspect_url("https://example.com/", "https://example.com/")
    assert error.value.code == code
    assert TEST_KEY not in str(error.value)
    handler.assert_called_once()


# URL 조회의 통신 오류에서도 수집·색인 여부를 추측하지 않고 재전송하지 않습니다.
@pytest.mark.parametrize("error_type, code", [
    (httpx.ReadTimeout, "timeout"), (httpx.ConnectError, "connection"),
])
async def test_inspect_url_transport_error(error_type: type[httpx.RequestError], code: ErrorCode) -> None:
    handler = Mock(side_effect=error_type(TEST_KEY))
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(BingEngineError) as error:
            await BingEngine(TEST_KEY, client).inspect_url("https://example.com/", "https://example.com/")
    assert error.value.code == code
    handler.assert_called_once()
