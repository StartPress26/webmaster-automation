"""관리 화면과 정적 자산이 FastAPI에서 함께 제공되는지 확인합니다."""

from fastapi.testclient import TestClient

from app.main import app


# 관리 화면과 스타일·스크립트의 경로 및 응답 형식을 확인합니다.
def test_admin_page_and_assets_are_served() -> None:
    with TestClient(app) as client:
        page = client.get("/")

        assert page.status_code == 200
        assert page.headers["content-type"].startswith("text/html")
        assert '<html lang="ko">' in page.text

        for asset, content_type in (
            ("/static/admin.css", "text/css"),
            ("/static/admin.js", "javascript"),
        ):
            response = client.get(asset)
            assert response.status_code == 200
            assert content_type in response.headers["content-type"]
