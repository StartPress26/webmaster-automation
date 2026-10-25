# 0단계 — 검색엔진 공식 API 검증 결과

검증 대상: https://otteru.vercel.app/
문서 갱신: 2026-10-25 15:58:30 KST

| 저장된 최신 실험 | 관측 시각 |
|---|---|
| Google URL 검사 | 2026-10-25 15:28:39 KST |
| IndexNow 제출 | 2026-10-25 15:36:56 KST |
| Bing URL 정보 | 2026-10-25 15:47:48 KST |

이번 작업은 저장된 실험 결과를 문서에 반영한 것이다. API를 다시 호출하지 않았고 원래 관측 시각·응답 값도 변경하지 않았다.

## 결론

단일 테스트 도메인에서 Google·Bing의 인증, 사이트 등록·소유 확인, 사이트맵 제출, 상태 조회를 실제 공식 API로 검증했다. IndexNow도 후속 실험에서 HTTP 200 접수 성공을 확인했다. 이 범위의 0단계 기술 검증은 완료됐으며, 실제 검색엔진의 색인 완료와 제품 구현 완료를 뜻하지 않는다.

사이트 추가·검증·조회 기능을 브라우저 GUI로 대신하지 않았다. 최초 인증정보 발급·로그인·사용자 동의와 검증 파일의 사이트 배포는 별도 준비 과정이었다.

## 실제 요청 결과

| 제공자 | API | HTTP | 확인 결과 |
|---|---|---|---|
| Google | OAuth | 토큰 발급 | 사용자 승인 및 Access/Refresh Token 저장 |
| Google | Sites list | 200 | 최초 대상 속성 없음 |
| Google | Site Verification getToken | 200 | FILE 방식 검증 파일명 발급 |
| Google | Site Verification insert | 200 | 소유 확인 성공 |
| Google | Sites add / get | 204 / 200 | 사이트 등록 및 siteOwner 확인 |
| Google | Sitemaps submit / get | 204 / 200 | 접수 당시 isPending=true |
| Google | URL Inspection index.inspect | 200 | 당시 대표 URL은 Google에 아직 알려지지 않음 |
| Bing | GetUserSites | 200 | API 키 인증 성공, 최초 대상 사이트 없음 |
| Bing | AddSite / GetUserSites | 200 / 200 | GUI 없이 등록, 당시 IsVerified=false |
| Bing | VerifySite / GetUserSites | 200 / 200 | d=true 및 IsVerified=true 확인 |
| Bing | SubmitFeed | 200 | 사이트맵 접수 |
| Bing | GetUrlInfo | 200 | 대표 URL의 정보와 크롤링 시각 반환 |
| IndexNow | POST /indexnow | 200 | 대표 URL 1개 접수 성공 |

IndexNow는 앞선 실험에서 HTTP 202(접수·키 확인 대기)를 받았으나, 2026-10-25 15:36:56 KST의 후속 실험은 HTTP 200이었다. 최신 검증 상태는 접수 성공으로 정리하며, 이전 202는 원본 실험 JSON의 previous_test에 남긴다. 어느 응답도 개별 엔진의 수집·색인 완료를 뜻하지 않는다.

## 마지막 저장 관측과 한계

Google은 2026-10-25 15:28:39 KST에 verdict=NEUTRAL, ‘Google에는 아직 알려지지 않은 URL입니다.’를 반환했다. 당시 lastCrawlTime은 없었다. 사이트맵 조회의 isPending=true도 당시 응답이며 현재 상태로 단정하지 않는다.

Bing은 2026-10-25 15:47:48 KST에 다음 값을 반환했다.

- IsPage: true
- HttpStatus: 0 — 바깥쪽 API HTTP 200과 별도 필드이며 정상 수집 HTTP 200의 근거로 사용하지 않음.
- DocumentSize: 0
- LastCrawledDate: 2026-10-25 15:38:27 KST
- DiscoveryDate: 2026-10-25 16:00:00 KST
- 내부 색인 상태: unknown. IsPage=true만으로 색인 완료를 확정하지 않음.

DiscoveryDate는 당시 조회 시각보다 미래로 반환됐다. 원본 값은 보존하되 이벤트 순서나 수집 지연시간 계산에는 사용하지 않는다. 원인은 확정하지 않았다.

각 조회는 대표 URL 한 개를 대상으로 한다. 전체 게시물의 색인 여부를 판정하지 않으며, 제공 필드와 관측 시각이 달라 엔진 간 성능 비교 자료로도 사용하지 않는다.

## 확인한 운영 전제

- 공식 API를 사용해도 대상 사이트에 대한 적절한 권한과 소유 확인이 필요하다.
- 검증 파일 배포에는 CMS·호스팅 접근권한 또는 소유자의 협조가 필요하다.
- 이번 Bing 계정은 사이트 GUI 등록 전에 API 키 발급과 AddSite 호출이 가능했다. 모든 계정의 사전 조건이 같다고 일반화하지 않는다.
- Bing 인증은 API 키 방식으로 검증했다. 고객 계정 연결용 OAuth 위임은 미검증이다.
- Naver·Brave의 신규 사이트 등록과 개별 상태 조회는 이번 실험에 포함하지 않았다. Naver 관련 전달 근거는 IndexNow 공통 엔드포인트의 접수에 한정한다.
- CMS 발행 이벤트, 큐·스케줄러·재시도, 여러 고객 계정 운영은 아직 구현·검증하지 않았다.

## 보관된 코드와 증거

- google_probe.py: 로컬 OAuth 인증 및 Google 사이트 목록 조회 코드.
- tests/: 인증정보 보호·요약 처리 테스트 4개가 앞선 실행에서 통과했다. 이번 문서 갱신에서 재실행하지 않았다.
- [Google 통합 JSON](google-api-verification-status.json): 소유 확인·등록·사이트맵·색인 검사 응답.
- [Bing 통합 JSON](bing-api-verification-status.json): 최초 조회·등록·소유 확인·사이트맵·URL 정보 응답.
- [IndexNow 실험 JSON](indexnow-api-test-result.json): 후속 200 응답, 사전 점검, 과거 202 이력.
- 개별 Google/Bing 응답 JSON과 임시 로그·스크린샷은 정리 과정에서 삭제했다. 응답 값은 통합 JSON에 보존돼 있다.
- OAuth JSON·Access/Refresh Token·Bing API 키는 공개 블로그 저장소와 결과 JSON에 포함하지 않았다.
- 공개 검증 파일 배포: otteru 저장소 PR #4(IndexNow), #5(Google), #6(Bing).

Google/Bing의 나머지 API는 개별 Python 실행으로 검증했다. 재실행 가능한 제품용 전체 워크플로 코드는 아직 구현하지 않았다.

## 다음 개발 단계

1. 검증한 요청·응답을 바탕으로 엔진별 API 어댑터를 구현한다.
2. 사이트 등록·소유 확인·URL 통지·상태 관측을 독립 작업으로 구성한다.
3. 계정별 자격증명과 사이트별 권한을 분리한다.
4. 검증 파일 배포가 필요한 단계는 담당자 작업과 재개 지점을 둔다.
5. 통지 재시도와 상태 재확인 스케줄을 분리하고 접수 성공·색인 상태를 별도로 저장한다.
6. 기존 검증 코드와 테스트를 함께 제품 구조에 맞게 정리한다.

## 공식 명세

- [Google Site Verification](https://developers.google.com/site-verification/v1/getting_started)
- [Google Search Console API](https://developers.google.com/webmaster-tools/v1/api_reference_index)
- [Bing VerifySite](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.verifysite?view=bing-webmaster-dotnet)
- [Bing SubmitFeed](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.submitfeed?view=bing-webmaster-dotnet)
- [Bing GetUrlInfo](https://learn.microsoft.com/en-us/dotnet/api/microsoft.bing.webmaster.api.interfaces.iwebmasterapi.geturlinfo?view=bing-webmaster-dotnet)
- [IndexNow](https://www.indexnow.org/documentation)
