# Bing 엔진

`app/engines/bing.py`는 공식 Bing Webmaster JSON API를 호출하는 비동기 어댑터다.
DB 저장·FastAPI 라우터·관리 화면·파일 배포·예약 실행은 포함하지 않는다.

## 사용 방법

API 키는 환경설정에서 읽어 주입한다. 키와 원본 응답을 로그에 출력하지 않는다.
HTTP 클라이언트는 호출자가 생성·종료하며 다른 서비스의 인증 설정과 공유하지 않는다.
API 키가 쿼리에 포함되므로 HTTP 클라이언트의 요청 URL 로그도 운영 환경에서 출력하지 않아야 한다.

```python
async with httpx.AsyncClient() as client:
    engine = BingEngine(api_key=api_key, http_client=client)
    result = await engine.register_new_site(site_url, sitemap_url)
```

- `get_site()`: 현재 계정 목록에서 URL이 정확히 일치하는 사이트를 반환한다. 없으면 `None`이다.
- `register_site()`: 사이트를 추가하고 재조회한 `BingSite`를 반환한다.
- `get_verification_file()`: 인증 코드로 `BingSiteAuth.xml`의 이름·내용·설치 주소를 반환한다.
- `verify_ownership()`: Bing의 확인 응답과 재조회한 `is_verified=True`를 모두 확인한다.
- `submit_sitemap()`: `SubmitFeed` 정상 접수 시 `True`를 반환한다. 실제 다운로드·크롤링·색인을 보장하지 않는다.
- `register_new_site()`: 미등록이면 추가하고, 미인증이면 `verification_required`와 파일 정보를 반환한다.
  사람이 대상 사이트에 파일을 배포한 후 `verification_ready=True`로 재호출한다.
  이미 인증된 사이트는 사이트맵 제출로 진행한다. `completed`는 사이트맵 접수까지 성공했다는 뜻이다.
- `inspect_url()`: 같은 출처의 메인페이지·글을 조회한다. 유효한 과거 크롤링 기록은 `crawled`, 그 외는 `unknown`이다.
  `IsPage`·HTTP 200만으로 `indexed` 또는 `not_indexed`를 만들지 않는다.

전체 등록·인증 파일 안내·URL 조회는 HTTP·HTTPS 루트 사이트를 지원한다.
URL의 끝 슬래시·경로·쿼리를 임의로 보정하지 않는다. DNS 인증·고객 계정 OAuth는 구현하지 않았다.
기술 오류는 `BingEngineError`로 전달하며 자동 재시도하지 않는다. 시간 초과는 접수 실패를 확정하지 않는다.

## 검증과 남은 한계

2026-10-28 실제 `https://otteru.vercel.app/` 관측:

- 사이트 조회에서 소유 확인 완료, 배포 XML의 인증 코드 일치·HTTP 200을 확인했다.
- 메인페이지는 `crawled`, 사이트맵에서 선택한 실제 게시글은 `unknown`이었다. 색인 여부는 확인하지 않았다.
- `GetFeeds`는 기존 사이트맵을 `Success`로 반환했다.
- 기존 사이트맵 재제출은 HTTP 400·Bing `ErrorCode=8`로 실패했다. 원인은 확정하지 못했다.
  이 오류를 성공으로 바꾸거나 중복 등록이라고 추정해 무시하지 않는다.
- 신규 사이트의 추가 → 파일 배포 → 소유 확인 → 사이트맵 제출 전체 경로는 현재 모의 테스트로 검증했다.
  별도 신규 테스트 사이트를 사용한 실제 전체 검증은 남아 있다. 기존 사이트의 소유권을 삭제해 시험하지 않는다.

실사용 관측은 `outputs/bing-live-validation-2026-10-28.json`에 저장했다.
이번 코드는 엔진 구현이며 실사용 전체 등록 흐름의 검증 완료를 뜻하지 않는다.

로컬 모의 테스트:

```bash
PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider tests/test_bing_engine.py
```

## 공식 문서

- [GetUserSites](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.getusersites?view=bing-webmaster-dotnet)
- [VerifySite](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.verifysite?view=bing-webmaster-dotnet)
- [SubmitFeed](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.submitfeed?view=bing-webmaster-dotnet)
- [GetUrlInfo](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturlinfo?view=bing-webmaster-dotnet)
