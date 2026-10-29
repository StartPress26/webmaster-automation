"""사이트·계정별 Playwright 인증 상태를 파일로 저장하고 복원합니다."""

import json
import os
import stat
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

from playwright.async_api import StorageState
from pydantic import ValidationError

from app.browser.schemas import SessionKey

DEFAULT_SESSION_DIR = Path(__file__).resolve().parents[2] / ".secrets" / "browser_sessions"
ErrorCode = Literal["unsafe_path", "invalid_state", "io"]


class SessionStoreError(Exception):
    """인증값과 원본 예외를 포함하지 않는 세션 저장소 오류입니다."""

    # 호출자가 구분할 수 있는 오류 분류와 안전한 메시지만 보관합니다.
    def __init__(self, code: ErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code


# 최소 저장 형식을 확인하되 IndexedDB 등 추가 필드는 변경하지 않습니다.
def _validate_state(value: object) -> StorageState:
    if not isinstance(value, dict) or any(
        not isinstance(value.get(key), list)
        or any(not isinstance(item, dict) for item in value[key])
        for key in ("cookies", "origins")
    ):
        raise SessionStoreError("invalid_state", "인증 상태에는 cookies와 origins 객체 목록이 필요합니다.")
    return cast(StorageState, value)


@dataclass(frozen=True)
class SessionStore:
    """로컬 파일 저장소이며 로그인 성공·만료 여부와 브라우저 수명은 판단하지 않습니다.

    인증 상태는 민감한 평문 JSON입니다. 동일 계정의 동시 로그인은 호출자가 조정합니다.
    전용 디렉터리는 신뢰하는 로컬 프로세스가 관리해야 합니다.
    """

    root_dir: Path = DEFAULT_SESSION_DIR

    # 안전한 식별자로 경로를 만들고 심볼릭 링크·잘못된 파일 종류를 거부합니다.
    def _path(self, key: SessionKey, *, create: bool = False) -> Path:
        try:
            checked = SessionKey.model_validate(key.model_dump())
        except ValidationError:
            raise SessionStoreError("unsafe_path", "세션 식별자 형식을 확인하세요.") from None

        directory = self.root_dir / checked.site
        target = directory / f"{checked.account_id}.json"
        directories = (*reversed(self.root_dir.absolute().parents), self.root_dir, directory)

        for path in (*directories, target):
            if path.is_symlink():
                raise SessionStoreError("unsafe_path", "인증 경로에 심볼릭 링크를 사용할 수 없습니다.")
        for path in directories:
            if path.exists() and not path.is_dir():
                raise SessionStoreError("unsafe_path", "인증 저장 디렉터리 형식을 확인하세요.")
        if target.exists():
            info = target.stat()
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise SessionStoreError("unsafe_path", "인증 파일은 링크 없는 일반 파일이어야 합니다.")
        if create:
            directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        for path in (self.root_dir, directory):
            if path.exists():
                path.chmod(0o700)
        return target

    # 파일이 없으면 None을 반환하고 손상·접근 오류는 인증값 없는 예외로 구분합니다.
    def load(self, key: SessionKey) -> StorageState | None:
        try:
            path = self._path(key)
            try:
                descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
            except FileNotFoundError:
                return None
            with os.fdopen(descriptor, "r", encoding="utf-8") as source:
                info = os.fstat(source.fileno())
                if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                    raise SessionStoreError("unsafe_path", "인증 파일은 링크 없는 일반 파일이어야 합니다.")
                os.fchmod(source.fileno(), 0o600)
                value = json.load(source)
            state = _validate_state(value)
            # 표준 JSON이 아닌 NaN·Infinity 등의 값도 손상으로 분류합니다.
            json.dumps(state, allow_nan=False)
            return state
        except (ValueError, UnicodeError):
            raise SessionStoreError("invalid_state", "저장된 인증 상태가 손상되었습니다.") from None
        except OSError:
            raise SessionStoreError("io", "인증 상태 파일을 읽을 수 없습니다.") from None

    # 같은 폴더의 비공개 임시 파일을 원자적으로 교체해 기존 파일의 손상을 방지합니다.
    def save(self, key: SessionKey, state: StorageState) -> None:
        try:
            payload = json.dumps(_validate_state(state), ensure_ascii=True, allow_nan=False)
        except (TypeError, ValueError):
            raise SessionStoreError("invalid_state", "인증 상태를 JSON으로 저장할 수 없습니다.") from None
        try:
            path = self._path(key, create=True)
            descriptor, name = tempfile.mkstemp(dir=path.parent, prefix=".session-")
            temporary = Path(name)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as output:
                    output.write(payload)
                    output.flush()
                    os.fsync(output.fileno())
                os.replace(temporary, path)
            finally:
                temporary.unlink(missing_ok=True)
        except OSError:
            raise SessionStoreError("io", "인증 상태 파일을 저장할 수 없습니다.") from None

    # 지정한 사이트·계정 파일만 삭제하고 파일이 없어도 정상 종료합니다.
    def delete(self, key: SessionKey) -> None:
        try:
            self._path(key).unlink(missing_ok=True)
        except OSError:
            raise SessionStoreError("io", "인증 상태 파일을 삭제할 수 없습니다.") from None
