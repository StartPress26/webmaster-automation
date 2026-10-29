"""실제 인증정보 없이 공통 세션 파일의 보존·분리·안전한 실패를 검증합니다."""

import json
import os
import stat
from pathlib import Path
from typing import cast

import pytest
from playwright.async_api import StorageState

from app.browser.schemas import SessionKey
from app.browser.session import SessionStore, SessionStoreError

KEY = SessionKey(site="naver", account_id="primary")


# 테스트마다 별도 임시 폴더를 사용하며 실제 세션 저장소에는 접근하지 않습니다.
@pytest.fixture
def store(tmp_path: Path) -> SessionStore:
    return SessionStore(root_dir=tmp_path / "sessions")


# 쿠키·브라우저 저장소·추가 필드가 변경 없이 왕복 저장되는지 확인합니다.
def test_round_trip_and_permissions(store: SessionStore) -> None:
    state: StorageState = {
        "cookies": [{"name": "session", "value": "private-cookie", "domain": ".example.com", "path": "/", "expires": -1, "httpOnly": True, "secure": True, "sameSite": "Lax"}],
        "origins": [{"origin": "https://example.com", "localStorage": [{"name": "token", "value": "private-token"}], "indexedDB": []}],
    }
    store.save(KEY, state)
    path = store.root_dir / "naver" / "primary.json"
    assert store.load(KEY) == state
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert stat.S_IMODE(store.root_dir.stat().st_mode) == 0o700
    assert stat.S_IMODE(path.parent.stat().st_mode) == 0o700
    path.chmod(0o644)
    store.load(KEY)
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert not tuple(path.parent.glob(".session-*"))


# 존재하지 않는 세션을 읽거나 삭제할 때 디렉터리를 새로 만들지 않습니다.
def test_missing_session_is_not_an_error(store: SessionStore) -> None:
    assert store.load(KEY) is None
    store.delete(KEY)
    assert not store.root_dir.exists()


# 브라우저에 저장될 수 있는 단독 유니코드 서로게이트도 손실 없이 JSON으로 보존합니다.
def test_preserve_unpaired_surrogate(store: SessionStore) -> None:
    state: StorageState = {
        "cookies": [],
        "origins": [{"origin": "https://example.com", "localStorage": [{"name": "token", "value": "private-token\ud800"}]}],
    }
    store.save(KEY, state)
    assert store.load(KEY) == state


# 사이트와 계정이 다르면 서로 다른 파일을 사용하며 삭제도 해당 파일에만 적용됩니다.
def test_account_and_site_isolation(store: SessionStore) -> None:
    other_account = SessionKey(site="naver", account_id="secondary")
    other_site = SessionKey(site="google", account_id="primary")
    store.save(KEY, {"cookies": [], "origins": []})
    store.save(other_account, {"cookies": [], "origins": [{"origin": "https://example.com", "localStorage": []}]})
    store.save(other_site, {"cookies": [], "origins": []})
    store.delete(KEY)
    store.delete(KEY)
    assert store.load(KEY) is None
    assert store.load(other_account) is not None
    assert store.load(other_site) is not None


# 손상된 JSON과 구조가 잘못된 파일을 없는 세션으로 오인하지 않습니다.
@pytest.mark.parametrize("payload", (b'{"secret":"private-token",', b'[]', b'{}', b'{"cookies":[],"origins":null}', b'\xff'))
def test_corrupted_file_is_reported_safely(store: SessionStore, payload: bytes) -> None:
    store.save(KEY, {"cookies": [], "origins": []})
    (store.root_dir / "naver" / "primary.json").write_bytes(payload)
    with pytest.raises(SessionStoreError) as error:
        store.load(KEY)
    assert error.value.code == "invalid_state"
    assert "private-token" not in str(error.value)
    assert error.value.__context__ is None or error.value.__suppress_context__


# 잘못된 상태를 저장하려 해도 이전 인증 파일을 유지합니다.
@pytest.mark.parametrize("state", ({}, {"cookies": [1], "origins": []}, {"cookies": [], "origins": [], "bad": float("nan")}))
def test_invalid_state_preserves_previous_file(store: SessionStore, state: object) -> None:
    previous: StorageState = {"cookies": [], "origins": []}
    store.save(KEY, previous)
    with pytest.raises(SessionStoreError) as error:
        store.save(KEY, cast(StorageState, state))
    assert error.value.code == "invalid_state"
    assert store.load(KEY) == previous


# 파일 교체 단계에서 실패해도 이전 파일을 유지하고 임시 인증 파일은 제거합니다.
def test_failed_replace_preserves_previous_file(store: SessionStore, monkeypatch: pytest.MonkeyPatch) -> None:
    previous: StorageState = {"cookies": [], "origins": []}
    store.save(KEY, previous)

    # 저장소의 실제 쓰기 후 교체 단계에만 오류를 발생시킵니다.
    def fail_replace(source: Path, destination: Path) -> None:
        raise OSError("private-token")

    monkeypatch.setattr("app.browser.session.os.replace", fail_replace)
    with pytest.raises(SessionStoreError) as error:
        store.save(KEY, {"cookies": [], "origins": [{"origin": "https://other.example", "localStorage": []}]})
    assert error.value.code == "io"
    assert "private-token" not in str(error.value)
    assert store.load(KEY) == previous
    assert not tuple((store.root_dir / "naver").glob(".session-*"))


# 저장소·사이트·파일의 심볼릭 링크를 통해 외부 인증 파일에 접근하지 않습니다.
@pytest.mark.parametrize("component", ("root", "site", "file"))
@pytest.mark.parametrize("operation", ("load", "save", "delete"))
def test_reject_symlinks(store: SessionStore, tmp_path: Path, component: str, operation: str) -> None:
    outside = tmp_path / "outside"
    if component == "root":
        outside.mkdir()
        store.root_dir.symlink_to(outside, target_is_directory=True)
    elif component == "site":
        outside.mkdir()
        store.root_dir.mkdir()
        (store.root_dir / "naver").symlink_to(outside, target_is_directory=True)
    else:
        outside.write_text("preserve")
        (store.root_dir / "naver").mkdir(parents=True)
        (store.root_dir / "naver" / "primary.json").symlink_to(outside)
    with pytest.raises(SessionStoreError) as error:
        if operation == "save":
            store.save(KEY, {"cookies": [], "origins": []})
        else:
            getattr(store, operation)(KEY)
    assert error.value.code == "unsafe_path"
    if component == "file":
        assert outside.read_text() == "preserve"


# 검증을 우회해 만든 식별자도 저장소에서 다시 검증하여 경로 이탈을 막습니다.
def test_revalidate_session_key(store: SessionStore) -> None:
    key = SessionKey.model_construct(site="..", account_id="outside")
    with pytest.raises(SessionStoreError) as error:
        store.save(key, {"cookies": [], "origins": []})
    assert error.value.code == "unsafe_path"


# 파일 대신 디렉터리·하드 링크가 있으면 읽거나 덮어쓰지 않습니다.
@pytest.mark.parametrize("kind", ("directory", "hardlink"))
def test_reject_non_private_files(store: SessionStore, tmp_path: Path, kind: str) -> None:
    directory = store.root_dir / "naver"
    directory.mkdir(parents=True)
    path = directory / "primary.json"
    if kind == "directory":
        path.mkdir()
    else:
        source = tmp_path / "source.json"
        source.write_text(json.dumps({"cookies": [], "origins": []}))
        os.link(source, path)
    with pytest.raises(SessionStoreError) as error:
        store.load(KEY)
    assert error.value.code == "unsafe_path"
