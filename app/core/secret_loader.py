"""비공개 폴더의 JSON 파일을 읽고 경로와 비밀값이 오류에 노출되지 않게 합니다."""

import json
from pathlib import Path
from typing import Literal

SECRETS_ROOT = Path(__file__).resolve().parents[2] / ".secrets"
SecretFileCode = Literal["invalid_path", "file_unreadable", "invalid_json"]


class SecretFileError(Exception):
    """비밀파일의 경로와 내용을 포함하지 않는 로딩 오류입니다."""

    # 호출자가 오류 원인을 구분할 수 있도록 고정된 코드와 메시지만 저장합니다.
    def __init__(self, code: SecretFileCode) -> None:
        messages: dict[SecretFileCode, str] = {
            "invalid_path": "비밀파일 참조는 비공개 폴더 내부의 상대 파일 경로여야 합니다.",
            "file_unreadable": "비밀파일을 읽을 수 없습니다.",
            "invalid_json": "비밀파일은 JSON 객체 형식이어야 합니다.",
        }
        super().__init__(messages[code])
        self.code = code


# 상대 경로를 검증하고 심볼릭 링크를 해석한 뒤 기준 폴더 이탈을 차단합니다.
def resolve_secret_path(reference: str, *, secrets_root: Path = SECRETS_ROOT) -> Path:
    if (
        "\\" in reference or ":" in reference
        or any(character.isspace() or ord(character) < 32 or ord(character) == 127 for character in reference)
        or any(part in {"", ".", ".."} for part in reference.split("/"))
    ):
        raise SecretFileError("invalid_path")

    try:
        # resolve() - 경로 정리를 해서 실제 경로로 변경을 해준다.
        root = secrets_root.resolve()
        path = (root / reference).resolve()
    except (OSError, RuntimeError, ValueError):
        raise SecretFileError("invalid_path") from None

    if path == root or not path.is_relative_to(root):
        raise SecretFileError("invalid_path")
    return path


# UTF-8 JSON 객체를 읽으며 엔진별 인증 형식 검증과 토큰 갱신은 호출자에게 맡깁니다.
def load_secret_json(reference: str, *, secrets_root: Path = SECRETS_ROOT) -> dict[str, object]:
    path = resolve_secret_path(reference, secrets_root=secrets_root)
    try:
        contents = path.read_text(encoding="utf-8")
    except OSError:
        raise SecretFileError("file_unreadable") from None
    except UnicodeError:
        raise SecretFileError("invalid_json") from None

    try:
        data = json.loads(contents)
    except (ValueError, RecursionError):
        raise SecretFileError("invalid_json") from None

    if not isinstance(data, dict):
        raise SecretFileError("invalid_json")
    return data
