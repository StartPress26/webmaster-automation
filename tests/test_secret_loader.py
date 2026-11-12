"""실제 비밀파일을 사용하지 않고 공통 로더의 파일 접근 경계를 검증합니다."""

import traceback
from pathlib import Path

import pytest

from app.core.secret_loader import SecretFileError, load_secret_json, resolve_secret_path


# 엔진별 하위 폴더와 이메일 파일명으로 JSON 객체를 읽습니다.
@pytest.mark.parametrize("engine", ["google", "bing"])
def test_load_account_json(tmp_path: Path, engine: str) -> None:
    path = tmp_path / engine / "user@example.com.json"
    path.parent.mkdir()
    path.write_text('{"api_key": "test-key", "scopes": ["test-scope"]}', encoding="utf-8")

    assert load_secret_json(f"{engine}/user@example.com.json", secrets_root=tmp_path) == {
        "api_key": "test-key", "scopes": ["test-scope"],
    }
    assert resolve_secret_path(f"{engine}/user@example.com.json", secrets_root=tmp_path) == path


# DB 등록 검증을 거치지 않은 경우에도 잘못된 파일 참조를 거부합니다.
@pytest.mark.parametrize("reference", [
    "", ".", "..", "../outside.json", "/tmp/outside.json", "google/../key.json",
    "google//key.json", "google/./key.json", "google/", "google\\key.json",
    "C:/key.json", "google/key\x00.json", "google/key\n.json", "google/ key.json",
])
def test_invalid_reference_is_rejected(tmp_path: Path, reference: str) -> None:
    with pytest.raises(SecretFileError) as caught:
        load_secret_json(reference, secrets_root=tmp_path)
    assert caught.value.code == "invalid_path"


# 파일과 부모 폴더의 링크 모두 비공개 폴더 밖을 읽지 못하게 합니다.
@pytest.mark.parametrize("directory_link", [False, True])
def test_symlink_escape_is_rejected(tmp_path: Path, directory_link: bool) -> None:
    root = tmp_path / "secrets"
    root.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "key.json").write_text('{"api_key": "outside-secret"}', encoding="utf-8")
    if directory_link:
        (root / "bing").symlink_to(outside, target_is_directory=True)
        reference = "bing/key.json"
    else:
        (root / "key.json").symlink_to(outside / "key.json")
        reference = "key.json"

    with pytest.raises(SecretFileError) as caught:
        load_secret_json(reference, secrets_root=root)
    assert caught.value.code == "invalid_path"


# 파일 누락과 폴더 지정은 읽기 오류로 처리합니다.
@pytest.mark.parametrize("reference", ["missing.json", "bing"])
def test_unreadable_file(tmp_path: Path, reference: str) -> None:
    (tmp_path / "bing").mkdir()
    with pytest.raises(SecretFileError) as caught:
        load_secret_json(reference, secrets_root=tmp_path)
    assert caught.value.code == "file_unreadable"


# JSON 구문과 문자 인코딩 오류를 처리하고 배열과 단일 값도 거부합니다.
@pytest.mark.parametrize("contents", [
    b'{"api_key": "private-test-value"', b"\xff", b"[]", b"null", b'"private-test-value"', b"42",
])
def test_invalid_json_is_sanitized(tmp_path: Path, contents: bytes) -> None:
    path = tmp_path / "private-file.json"
    path.write_bytes(contents)
    with pytest.raises(SecretFileError) as caught:
        load_secret_json(path.name, secrets_root=tmp_path)

    assert caught.value.code == "invalid_json"
    formatted = "".join(traceback.format_exception(caught.type, caught.value, caught.tb))
    assert "private-test-value" not in formatted
    assert str(path) not in formatted


# 권한 오류의 원본 예외에 포함된 경로와 비밀값을 노출하지 않습니다.
def test_permission_error_is_sanitized(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # 운영체제 실행 사용자와 관계없이 권한 오류를 재현합니다.
    def deny_read(self: Path, *args: object, **kwargs: object) -> str:
        raise PermissionError("private-test-value")

    monkeypatch.setattr(Path, "read_text", deny_read)
    with pytest.raises(SecretFileError) as caught:
        load_secret_json("bing/private-file.json", secrets_root=tmp_path)

    assert caught.value.code == "file_unreadable"
    formatted = "".join(traceback.format_exception(caught.type, caught.value, caught.tb))
    assert "private-test-value" not in formatted
