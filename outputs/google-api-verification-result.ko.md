# Google API 검증 결과

대상: https://otteru.vercel.app/
문서 갱신: 2026-10-25 15:58:30 KST
Google 마지막 저장 관측: 2026-10-25 15:28:39 KST

문서와 저장된 검증 기록을 동기화했다. 이번 갱신에서 API를 다시 호출하지 않았으며, 아래 상태는 각 요청 당시의 관측이다.

## 실제 검증 결과

| 실제 호출 | HTTP 응답 | 확인 결과 |
|---|---|---|
| OAuth 인증 | 토큰 발급 성공 | Access/Refresh Token 로컬 비공개 저장 |
| Sites 목록 조회 | 200 | 최초 조회 시 대상 속성 없음 |
| Site Verification getToken | 200 | FILE 방식 소유 확인 파일 발급 |
| 운영 검증 파일 접근 | 200 | API 발급값과 파일 본문 일치 |
| Site Verification insert | 200 | 소유 확인 성공 |
| Sites add / get | 204 / 200 | 사이트 등록 및 siteOwner 권한 확인 |
| Sitemaps submit / get | 204 / 200 | 접수 당시 isPending=true, lastDownloaded 없음 |
| URL Inspection index.inspect | 200 | 대표 URL의 색인 관측 조회 성공 |

## 마지막 저장 관측의 해석

- verdict: NEUTRAL
- coverageState: Google에는 아직 알려지지 않은 URL입니다.
- lastCrawlTime: 없음
- googleCanonical: 없음

위 값은 2026-10-25 15:28:39 KST의 응답이다. 현재도 같은 상태라고 단정하지 않는다. API 호출 성공과 색인 완료는 별개이며, 대표 URL 한 개의 결과로 전체 게시물을 판정하지 않는다.

계정 로그인·동의를 제외한 파일 발급, 소유 확인, 등록, 사이트맵 제출, 상태 조회는 실제 API 요청으로 수행했다. 검증 파일 배포는 블로그 저장소 PR #5와 Vercel 배포를 통해 진행했다.

## 관련 검증 최신 결과

- Bing: API 키 인증, API 사이트 등록, 소유 확인, 사이트맵 제출, URL 정보 조회 검증 완료. 마지막 저장 관측은 2026-10-25 15:47:48 KST이다.
- IndexNow: 2026-10-25 15:36:56 KST의 후속 실험에서 HTTP 200, URL 접수 성공 확인. 앞선 HTTP 202는 과거 이력이며 현재 검증 결과를 키 확인 대기로 표시하지 않는다.
- IndexNow 200 역시 개별 엔진의 수집·색인 완료를 보장하지 않는다.

남은 작업은 실제 수집·색인 변화의 후속 관측이다. Bing OAuth 위임 인증과 제품용 자동 실행 워크플로는 이번 실험에서 검증하지 않았다.

## 보관된 근거

- [Google 통합 검증 기록](google-api-verification-status.json)
- [Bing 통합 검증 기록](bing-api-verification-status.json)
- [IndexNow 최종 실험 기록](indexnow-api-test-result.json)
- [0단계 최종 보고서](phase0-api-verification-report.ko.md)

개별 응답 JSON은 정리 과정에서 삭제했으며, 원래 응답의 관측 필드는 엔진별 통합 JSON에 보존돼 있다. OAuth 비밀값과 토큰은 결과 파일에 포함하지 않았다.
