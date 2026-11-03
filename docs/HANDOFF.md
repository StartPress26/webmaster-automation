# 작업 인계 문서

## 실험 종료·브랜치 보존 — 2026-11-03

이 절이 아래의 설치형 앱·AI 로그인 후속 계획보다 우선한다. `feat/ai-login-bot`은 실험 보존 브랜치로 남기고 main에 병합하지 않는다. 확장 프로그램 개발은 아직 시작하지 않았다.

### 결정과 확인 범위

- 운영 방향은 설치형 앱 + Playwright 대신 평소 Chrome 프로필의 로그인 상태를 사용하는 확장 프로그램 + 중앙 FastAPI + 공용 PostgreSQL이다.
- 로그인봇·Discord 인증·관련 테스트·네이버 조회 코드는 이 브랜치에 보존한다. 부분 성공 기록을 안정적인 인증 유지나 운영 검증 완료로 해석하지 않는다.
- 이번 정리는 문서 작업이다. 추가 실로그인·보호조치 해제·비밀번호 입력·인증 화면의 AI 전송을 실행하지 않는다.

### 사용자가 전달한 별도 수동 로그인 실험

아래는 사용자가 사이드 챗에서 전달한 결과이며, 이번 정리에서 재실행하거나 비공개 기록을 독립적으로 재검증한 결과가 아니다.

- `channel="chrome"`으로 설치된 Google Chrome을 실행했다. 번들 Chromium을 사용하지 않았다.
- 개인 프로필과 분리한 영구 프로필에서 사용자가 직접 네이버에 로그인했고 서치어드바이저 인증 성공을 코드로 확인했다.
- 종료 후 같은 프로필로 두 차례 재실행했으나 인증 성공을 확인하지 못했고, 마지막 실행에서 로그인 입력 화면을 확인했다.
- 이후 사용자가 네이버 보호조치 재발을 알렸다. 자동 비밀번호 입력과 AI 전송은 수행하지 않았다.
- 보호조치 원인은 미확정이다. 재로그인 화면도 프로필 저장 문제인지 서버 측 인증 무효화인지 구분되지 않았다. 확장 프로그램 전환이 보호조치 해소를 보장하지 않는다.
- 테스트 Chrome은 종료됐다. 프로필 `.secrets/browser_profiles/manual_naver_test`와 실행 기록 `.secrets/bot_runs/manual_profile_*.jsonl`은 로컬 비공개 자료로 보존하며 커밋하지 않는다.

### main과의 비교 및 남은 파일

- 기준 main `78819fa`에는 FastAPI·고객사/사이트 API·DB/마이그레이션·Google/Bing 공식 API·IndexNow·발행 알림 서비스가 이미 포함돼 있다. 이 기능을 로그인봇 브랜치에서 다시 가져올 필요가 없다.
- main 반영 대상은 실행 기록 규칙·일반 개발 안내·전환 결정 문서다. 별도 `docs/extension-transition` 브랜치와 PR로 분리한다. 로그인봇 코드·테스트·의존성·인증 설정은 포함하지 않는다.
- README 미커밋 개선은 현재 보존 브랜치에서 최신 상태로 정리한다. `.env.example`의 기존 미커밋 AI/Naver 설정 예시는 이번 문서 커밋에 넣지 않고 로컬에 보존한다.
- `naver_probe.py`, `tests/test_naver_probe.py`, `browser_bot_test/`는 별도 실험 파일로 로컬에 보존한다. `CLAUDE.md`, ERD 자료와 빈 `app/engines/brave.py`, `app/services/index_status.py`도 삭제하거나 자동 커밋하지 않는다.
- 보존용 Draft PR은 실험 종료 결론을 본문에 기록한 뒤 merge 없이 닫는다. 원격 브랜치를 삭제하지 않는다. 공통 문서 PR은 검토 가능한 열린 상태로 남기며 main 직접 push나 자동 병합은 하지 않는다.

### 다음 작업

1. 확장 프로그램에서 이미 열린 네이버 결과 화면 읽기.
2. 전용 비활성 탭에서 단일 URL 조회와 포커스 유지 검증.
3. 팀원 인증·중앙 서버·공용 DB 연결.
4. 여러 URL 순차 실행·중단·복구.

등록 사이트와 조회 대상 글 URL을 분리한다. 글 DB 등록·실제 발행·수집 요청 접수·수집 확인·색인 확인을 각각 구분한다. 새 브랜치에서는 직접 로그인된 정상 탭만 사용하고 쿠키를 서버로 보내지 않는다.

**2026-11-02 인계는 두 절로 나뉜다:** 아래의 네이버 이력·로컬 앱 전환 요약과 `병행 최신 인계 — Discord 문자 인증 연결·Google 실검증·Chrome 전환`을 함께 읽는다. 두 채팅의 실행·테스트·커밋 범위를 합쳐 해석하지 않는다.

## 최신 인계 — 로그인 이력·중복 입력 보완, 보호조치 조사와 로컬 앱 전환 / 2026-11-02

**다음 세션은 이 절부터 읽는다. 이 절은 아래 2026-10-31 기록보다 우선한다.** 사용자는 오늘 작업의 인계 문서 갱신과 커밋 계획을 요청한 뒤, **계획한 두 커밋과 현재 브랜치 push를 명시적으로 승인**했다. 아래 범위만 커밋·푸시하며 병행 변경을 섞지 않는다. 실로그인은 추가 실행하지 않는다.

### 사용자 의도와 내일의 작업

- 사용자는 코드를 이해하면서 단계별로 개발하기를 원한다. 한국어로 짧게 설명하고, 한 단계씩 구현·검증한다.
- 반복되는 네이버 보호조치는 사용자가 **과거 사례까지 모두 이 프로젝트의 실검증 중 발생했다**고 확인했다. 과거 이력을 프로젝트와 무관한 현상으로 해석하지 않는다.
- 다음 작업일 **2026-11-03**에는 팀원 노트북에 설치하는 앱과 로컬 브라우저를 활용하는 방향을 구현하고자 한다. 오늘은 설계 논의까지이며 앱·패키징·영구 프로필 구현은 아직 없다.
- 논의한 기본 흐름: 앱 설치 → 앱 전용 브라우저에서 팀원이 직접 로그인·캡차·추가 인증 처리 → 같은 인증 브라우저로 사이트 조회 → 프로필을 로컬에 보존 → 만료 시 사람이 재연결. 인증정보를 AI에게 전달하는 자동 신규 로그인은 이 설계에서 제거하는 방향이다.
- **두 방식 중 최종 구현 방식은 미확정**: (A) 앱 전용 Chrome 영구 프로필 + 기존 Playwright 조회 코드 재사용, (B) 평소 Chrome의 로그인된 탭을 사용하는 확장 프로그램 + 필요하면 로컬 앱 연결. 사용자가 평소 Chrome 세션 그대로 사용을 필수로 보는지 확인하여 선택한다. 두 가지를 동시에 구현하지 않는다.
- (A)는 기존 코드 재사용이 쉽지만 Playwright로 실행한 창에서 사람이 입력해도 Google이 로그인을 차단할 수 있다. 영구 프로필이나 Chrome 선택만으로 네이버 보호조치 해소를 보장하지 않는다.
- (B)는 기존 Chrome 세션을 활용하는 요구에 더 맞지만 확장 프로그램 통신·권한·화면 조작 계층이 필요하다. 단순히 `channel="chrome"`으로 바꾸는 것과 다르다.
- 각 노트북의 프로필·쿠키는 로컬에 보관하고 중앙 서버가 필요하면 작업·조회 결과만 주고받는 설계를 검토한다. 계정별 사이트 접근 권한, 계정 공유 여부, 대상 OS·설치 방식은 아직 정하지 않았다.
- 이번 문서 요청은 추가 실로그인 승인이 아니다. 원인 조사용 반복 인증을 자동 재개하지 않는다. 다음 구현 검증은 로컬 가짜 화면부터 진행한다.

### 오늘 완료한 변경 — 최종적으로 남긴 코드

1. **진행 이력 보강** (`app/login_bot/login_agent.py`)
   - `_action_history()`가 fill 대상의 `target_index`, `target_label`, `target_type`, 실행 직후 `input_state`와 `outcome`을 기록한다. 원문 답·비밀번호는 history에 넣지 않으며 라벨에 알려진 계정값·현재 입력값이 섞이면 마스킹한다.
   - history는 **URL이 바뀔 때만 초기화**한다. 같은 URL에서 버튼·입력 요소가 추가·교체되어도 과거 행동 이력은 유지한다. AI 요청에는 최근 8개를 전달한다.
   - 프롬프트에 같은 URL에서도 화면·문제가 달라질 수 있으므로 과거 번호·입력 완료가 현재도 유효하다고 단정하지 말고 현재 화면을 기준으로 판단하도록 추가했다. 오류·문제 변경이 없고 값이 유지되면 확인·다음을 우선한다.
   - 처음 구현했던 DOM 요소 개수·동일성 기준 초기화는 사용자 논의 후 제거했다. ID 입력 후 지우기 버튼 등이 나타나면 이력이 사라질 수 있었기 때문이다.
2. **1번 개선: 실검증 실행기의 세션 재사용**
   - 제품의 `SessionStore` 복원·저장은 원래 구현되어 있었다. 문제는 이 채팅에서 만든 검증 실행기가 캡차 재현을 위해 매번 `TemporaryDirectory`의 빈 저장소를 사용하고 성공 세션도 삭제한 점이었다.
   - `/private/tmp/naver_history_live_check.py`를 기본 `SessionStore()`와 기존 네이버 계정 키를 사용하도록 변경했다. 세션을 삭제하지 않으며 성공 상태를 같은 파일에 저장한다.
   - `session_loaded.state_available`와 `login_result.session_reused`를 구분해 기록한다. 파일 읽기 성공을 인증 재사용 성공으로 표현하지 않는다.
   - **이 수정은 저장소 밖 임시 파일에만 존재한다.** 제품 코드 수정이나 추적 파일 커밋으로 포함된 것처럼 기록하지 않는다. 임시 파일은 사라질 수 있다.
   - 현재 제품은 세션 복원 인증 실패 시 AI 로그인으로 넘어간다. **복원 실패 시 신규 로그인 중단은 아직 미구현**이다.
3. **2번 개선: 같은 값의 실제 재입력 생략**
   - `_execute_action()`에서 기존 URL·폼 검사 후, fill 직전에 현재 DOM 값과 `action.text`를 비교한다. 같으면 fill을 실행하지 않고 `이미 같은 값이 있어 입력 생략`을 반환한다. 빈 값·다른 값은 정상 입력한다.
   - 실행 함수 반환값을 history의 outcome으로 전달한다. 임시 실행기 래퍼도 반환값을 보존하고 결과를 기록하도록 수정했다.
   - AI가 동일 행동을 또 요청하는 것까지 막지는 않는다. `contenteditable`처럼 value 속성이 없는 대상은 생략 검사 없이 기존 입력 경로를 따른다.
4. **클릭 후 고정 1초 대기**
   - 사용자 요청으로 `_execute_action()`의 `await element.click()` 바로 다음에 `await asyncio.sleep(1)` 추가.
   - **모든 AI click 행동에 적용**한다. fill에는 적용하지 않는다. 네이버 엔진의 로그인 이후 고정 조회 코드는 이 실행 함수를 쓰지 않는다.
   - 이는 결과 확인 기반 대기가 아니다. 1초 뒤에도 렌더링 중이면 AI 호출이 발생할 수 있다.
5. **회귀 테스트** (`tests/test_login_bot_ai_flow.py`)
   - 같은 URL의 요소 추가·화면 교체에도 이력 유지, URL 변경 시 초기화, 입력 대상·상태 전달과 민감값 제외, 정당한 다른 값 수정, 동일 값의 실제 fill 미호출, 생략 결과의 다음 AI 요청 전달을 검증했다.

### 사용자 요청으로 롤백한 3번 — 복원하지 말 것

- 한때 제출 전후 상태를 비교하는 최대 8초 조건 대기를 구현하고 115개 테스트를 통과했으나, 사용자가 복잡성을 이유로 **3번 전체 롤백**을 요청했다.
- `_wait_for_submission`, `SubmissionState`, `SubmissionAwareSite`, 네이버 `is_submission`·`submission_state`, 오류/캡차 지문 비교, 관련 테스트와 임시 실행기의 조건 대기 기록 훅을 모두 제거했다.
- 최종 선택은 위의 **클릭 후 1초 sleep**이다. 115개 통과는 롤백된 중간 구현의 결과이며 현재 결과로 인용하지 않는다.
- 기존 최초 진입의 `wait_until_ready()`는 유지한다. 병행 작업의 SMS 인증 대기 코드와 이번에 롤백한 네이버 제출 대기를 혼동하여 삭제하지 않는다.

### 실제 실행 결과 — 모두 2026-11-02 KST

| 실행 | 결과 | 관찰 |
| --- | --- | --- |
| 18:23:30~18:24:15 | 로그인·색인 조회 성공, AI 13회 | 새 빈 세션. 캡차 두 차례 각각 입력→확인. 사용자가 **첫 캡차 오답 때문에 두 번째 제출**이었다고 확인. 당시 일반 입력 이력은 초기화되는 문제 관찰. |
| 18:51:49~18:52:38 | 로그인 전 `requires_user`, 조회 미실행 | URL 기준 이력 유지 적용. 캡차 같은 요청값을 3회 입력 후 확인 1회. AI가 보호조치·비밀번호 변경 필요로 판단해 human 반환. |
| 19:32:35~19:33:04 | 로그인·색인 조회 성공, 약 28초, AI 8회 | 세션 복원 우선·동일 값 생략·클릭 후 1초 적용. 세션 파일은 읽었으나 인증 재사용 실패하여 신규 로그인. 캡차 입력→확인 1회. 비밀번호 재입력→로그인. 성공 세션 저장. 이후 사용자가 **보호조치 재발** 확인. |

- 비공개 기록: `.secrets/bot_runs/naver_history_s2vhpa33.jsonl`, `naver_history_ozi_i7qw.jsonl`, `naver_history_59kf54wr.jsonl`.
- 마지막 행동 순서: ID fill → PW fill → 로그인 click(1초 대기) → 캡차 fill → 확인 click(1초 대기) → PW fill → 로그인 click(1초 대기) → 콘솔 주소에서 AI 호출 1회 → 인증 판정 성공 → 고정 조회.
- 마지막 콘솔 주소에서의 호출은 인증 판정 전 발생했다. 실행 행동 기록은 없으며 원인을 확정할 수 없다. 화면이 덜 준비됐을 가능성은 있지만 **불필요한 호출이라고 단정하지 않는다**. 과거의 모델 요청 후 행동 기록 없는 단계들도 URL 변경으로 응답을 버렸을 수 있으나 정확한 생략 사유는 미기록이다.
- `changed_input=false`는 **직전 AI 요청 입력값과 같음**을 뜻하며, 화면에서 값이 유지됐음을 증명하지 않는다. 값·문제 이미지·서버 오답 메시지를 저장하지 않아 재입력이 필요했는지까지 판단할 수 없다.
- 각 실행 종료 시 브라우저 종료. ID/PW·API 키·캡차 답·쿠키·스크린샷·원문 AI 요청/응답은 실행 로그에 저장하지 않았다. 마지막 로그 권한 0600, 폴더 0700 및 알려진 인증정보 미포함 확인.
- 실로그인은 당시 사용자가 네이버 인증정보·화면의 학교 게이트웨이 `https://factchat-cloud.mindlogic.ai/v1/gateway`, 모델 `deepseek-v4.1-flash` 전송을 명시적으로 승인한 뒤 진행했다. 향후 다른 계정·목적지·무제한 반복으로 확대 해석하지 않는다.

### 보호조치 조사 — 사실과 추정 구분

- 사용자가 기존 Chrome 화면을 확인하도록 요청하여 계정 활동 이력을 읽었다. **11/02 18:59, 10/31 21:40·19:52, 10/29 21:52, 9/21 22:31에 보호조치 해제 시 비밀번호 변경** 기록을 확인했다. 실제 IP·계정 ID·전화번호·보호조치 URL 토큰은 문서에 저장하지 않는다.
- 11/02 18:24·18:59 로그인 기록은 같은 IP, 대한민국, PC 웹이었다. 18:52 실패 실행은 표시된 로그인 기록에 없었다. 이 관찰로 모든 접속 경로나 서버 위험 판정을 확정할 수는 없다.
- 최신 열린 보호조치 화면도 직접 읽었다. 정보 노출·스팸/불법 게시·타인 로그인 의심의 **일반 목록**만 표시되며 계정별 확정 사유는 없다. 상세 링크도 일반 도움말이다. 목록 중 하나를 이번 계정의 실제 사유로 단정하지 않는다.
- 마지막 조사 시 기존 Chrome의 활동 기록 접근도 로그인 화면으로 이동해 추가 확인하지 않았다. 새 로그인·보호조치 해제·비밀번호 변경을 수행하지 않았다.
- 로컬 세션 메타데이터: 마지막 성공 시각 **19:32:58**에 저장, 쿠키 13개·origin 2개, `NID_AUT`/`NID_SES` 모두 존재하며 `.naver.com`, `/`, 세션 쿠키(expires=-1). 이 값만으로 서버 인증 유효/무효를 알 수 없다. IndexedDB는 저장되어 있지 않지만 네이버가 이를 요구한다는 증거도 없다.
- 현재 파일은 마지막 성공 상태로 덮어써져 **복원 실패 당시 이전 파일의 만료·내용은 소급 확인 불가**. 18:59 비밀번호 변경과 이전 세션 무효화의 연관성은 추정이다.
- 캡차 중복 입력이 없고 로그인·조회에 성공한 뒤에도 보호조치가 재발했다. sleep·중복 입력 방지가 보호조치 해결책이라고 주장하지 않는다. 자동화 브라우저 환경과 신규 인증 반복은 우선 가설이나 정확한 차단 신호는 알 수 없다.
- **평소 Chrome과 동시에 로그인해서 충돌했다는 직접 근거는 찾지 못했다.** 다른 자동화 프로젝트·개인 사례의 보호조치 보고는 있지만 네이버 내부 판정의 증거는 아니다.

### 배포 방향 조사 근거

- [네이버 반복 보호조치 안내](https://help.naver.com/service/5640/contents/1805?lang=ko&osType=COMMONOS): 비정상 로그인·특정 브라우저 환경의 대량 로그인 등을 설명하며 탐지 임계값은 미공개.
- [Google 지원 브라우저 안내](https://support.google.com/accounts/answer/7675428?co=GENIE.Platform%3DDesktop&hl=en): 소프트웨어 자동 제어 및 앱 내장 브라우저 등의 로그인을 차단할 수 있다고 명시. Chromium 이름 자체보다 자동화 실행 환경이 문제일 수 있다. 네이버도 동일 신호라는 증거는 아니다.
- [Playwright 영구 프로필](https://playwright.dev/python/docs/api/class-browsertype#browser-type-launch-persistent-context): `launch_persistent_context(user_data_dir=...)`로 앱 전용 프로필 유지 가능. `channel="chrome"`은 실행 브라우저 선택일 뿐 기존 사용자 Chrome 프로필 재사용이 아니다.
- [Chrome 원격 디버깅 변경](https://developer.chrome.com/blog/remote-debugging-port): Chrome 136부터 기본 데이터 디렉터리의 remote-debugging 포트/파이프 제한. 일상 Chrome 프로필을 그대로 Playwright에 지정하지 않는다. CDP 연결도 기존 브라우저가 연결 가능한 상태여야 한다.
- [Chrome 콘텐츠 스크립트](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) 및 [Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): 기존 로그인된 탭과 로컬 앱을 연결하는 별도 설계 후보.
- [Search Console 공식 OAuth 인증](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing): Google은 기존 공식 API/OAuth 경로 활용을 우선 검토한다. Google 웹 로그인 차단을 단순 브라우저 교체로 해결한다고 가정하지 않는다.

### 검증 상태와 병행 변경 주의

- 오늘 최종 1초 sleep 추가 직후: `tests/test_login_bot_ai_flow.py` + `tests/test_browser_login_agent.py` **33 passed in 16.51s**. 해당 시점의 범위 결과이며 전체 프로젝트 테스트가 아니다.
- 조건 대기 롤백 직후에는 위 두 파일 + `tests/test_login_bot_naver.py` **53 passed in 17.70s**. 이후 sleep 추가·병행 변경 이전 결과다.
- HANDOFF 최초 갱신에서는 테스트를 재실행하지 않았다. 이후 커밋·push 승인에 따라 선택 변경만 담은 별도 스냅샷에서 아래 33개 테스트를 실행했다. 최신 병행 코드가 섞인 현재 전체 작업 트리에 이 결과를 적용하지 않는다.
- **현재 작업 트리는 마지막 실검증 시점과 다르다.** `login_agent.py`에 이 채팅 외 변경으로 `channel="chrome"`, SMS/Discord 대기·재개 및 `_is_visible_in_viewport()` 필터가 들어왔고, `tests/test_login_bot_ai_flow.py`에도 화면 밖 요소 제외 테스트가 추가됐다. 이를 오늘 실검증으로 검증한 것으로 기록하지 않는다.
- 병행 변경 파일: `app/login_bot/human_auth.py`, `discord_auth.py`, `sites/google.py`, `schemas.py`, `sites/base.py`, 관련 SMS/Google/Discord 테스트, `docs/discord-auth.md`, `.env.example`, `README.md`, `pyproject.toml`, `uv.lock`. 기존 `CLAUDE.md`, `app/engines/brave.py`, `app/services/index_status.py`, `browser_bot_test/`, `naver_probe.py`, `tests/test_naver_probe.py`, outputs 자료도 보존한다.
- **임시 실행기 호환성 주의:** 현재 `authenticated_page()`가 `_ensure_login(..., sms_provider=...)`를 호출하는데, 임시 실행기의 `ensure(page, site, model)` 기록 래퍼는 새 키워드를 받지 않는다. 새 코드에서 그대로 재실행하면 TypeError가 날 수 있다. 오늘 문서 작업에서는 실행기나 병행 구현을 수정하지 않는다. 나중에 필요하면 새 인터페이스에 맞춰 래퍼를 보완한 뒤 로컬 검증부터 한다.
- `.env`·인증 JSON·쿠키·프로필·실행 로그·임시 실행기는 커밋 대상이 아니다. Chrome 원본 프로필을 복사하거나 토큰·비밀번호를 문서에 넣지 않는다.

### 커밋 구성과 실행 상태 — 사용자 커밋·push 승인

현재 브랜치 `feat/ai-login-bot`, 확인한 HEAD **30d48bf** (`[docs] 네이버 전체 조회 검증과 캡차 재입력 후속 작업 정리`). 인덱스는 확인 시 비어 있었다. 새 브랜치는 필요 시 `fix/`·`docs/` 등 프로젝트 규칙을 사용하며 `codex/`는 사용하지 않는다.

| 순서 | 제안 커밋 메시지 | 포함 범위 |
| --- | --- | --- |
| 1 | `[fix] 로그인 행동 이력과 중복 입력 방지 보완` | `login_agent.py`의 이력 프롬프트·URL 초기화·`_action_history`·outcome 전달·동일 값 생략·클릭 후 1초만, `test_login_bot_ai_flow.py`의 해당 회귀 테스트·AsyncMock import만 |
| 2 | `[docs] 로그인 실검증 결과와 로컬 앱 전환 인계 정리` | `docs/HANDOFF.md`의 오늘 요약·검증 한계·보호조치 조사·내일 설계·커밋 계획 |

- **두 코드 파일 모두 병행 변경이 섞여 있으므로 파일 전체 `git add` 금지.** SMS import·함수·타임아웃, Chrome channel 변경, viewport 필터와 그 테스트를 1번에 섞지 않는다. 필요하면 HEAD 기반 임시 스냅샷에 해당 변경만 적용해 patch 단위로 스테이징한다. 작업 트리의 병행 변경은 되돌리지 않는다.
- 1번의 선택 스테이징 상태만 분리한 스냅샷에서 로그인 AI 흐름·브라우저 수명 테스트를 실행해 미추적 SMS 모듈 없이도 동작하는지 확인한다. 현재 작업 트리 통과만으로 독립 커밋의 검증을 대체하지 않는다.
- 임시 실행기의 세션 재사용 개선은 위 두 커밋에 코드로 포함되지 않는다. 영구 실행기 편입은 내일 앱 구현 범위에서 별도 결정한다.
- 한국어 `[타입] 제목`, Git 작성자 유지, **Co-Authored-By 없음**. 민감값·공백·선택 범위를 확인하고 현재 사용자가 계획한 두 커밋·현재 브랜치 push를 승인했다. 다른 변경이나 PR 생성까지 확대하지 않는다.

### 승인 후 커밋 검증 기록

- 1번 커밋 생성 완료: **f025298** (`[fix] 로그인 행동 이력과 중복 입력 방지 보완`). 코드·테스트 두 파일의 해당 부분만 스테이징했고, 작업 트리 원문은 변경하지 않았다.
- HEAD `30d48bf` 기반 별도 스냅샷에 선택 변경만 적용하여 `tests/test_login_bot_ai_flow.py` + `tests/test_browser_login_agent.py` **33 passed in 15.57s** 확인. 병행 SMS/Google 모듈·viewport 테스트·Chrome channel 변경 없이 독립적으로 통과했다. 스테이징 파일 내용과 검증 스냅샷 내용 일치도 확인했다.
- 이 문서를 2번 커밋으로 작성한 뒤 `origin/feat/ai-login-bot`에 정상 push한다. 문서 커밋 해시는 생성 후 `git log -1`로, 원격 반영은 로컬 HEAD와 원격 브랜치 SHA 일치로 확인한다. force push·PR 생성은 하지 않는다.
- 변경 패치의 알려진 실제 인증정보 미포함과 공백 검사 통과. 신규 인계 절에도 인증정보 원문·보호조치 URL 토큰을 추가하지 않았다. 과거 본문의 공개 사이트/GitHub 이름과 로그인 ID 문자열의 일치는 새 비밀값 추가와 구분했다.
- `.env.example`, README, SMS/Discord·Google 코드, viewport 필터·테스트, `channel="chrome"`, 설정·의존성 및 다른 미추적 파일은 미커밋 상태로 보존한다.

### 최신 마지막 상태 / 다음 세션 시작 문구

- 날짜: **2026-11-02 Asia/Seoul**, 브랜치 **feat/ai-login-bot**. 기준 HEAD **30d48bf**, 코드 커밋 **f025298** 생성 완료. 이 문서가 후속 docs 커밋이며 최종 HEAD는 `git log -1`로 확인한다.
- 오늘 최종 코드: URL 기준 history 유지·대상/상태 이력·동일 값 fill 생략·모든 click 후 1초. 복잡한 네이버 제출 조건 대기는 롤백 완료.
- 로그인 성공과 보호조치 방지는 별개의 검증이다. 실조회 성공 후에도 보호조치가 재발했다. 세션 복원 실패 시 자동 신규 로그인 중단과 로컬 앱 배포는 미구현이다.
- 다음에는 팀원이 직접 로그인하는 로컬 앱/브라우저 연결 구조부터 선택·구현한다. 병행 SMS/Discord 코드를 보존한다. 과거 실검증 승인만으로 자동 로그인부터 재실행하지 않는다.

> docs/HANDOFF.md 최상단 2026-11-02 요약을 읽고 이어서 진행해줘. 로그인 이력·같은 값 입력 생략·클릭 후 1초는 구현했고 복잡한 제출 조건 대기는 롤백했어. 실로그인 성공 후에도 네이버 보호조치가 반복돼. 내일은 팀원 노트북에 설치할 앱에서 사람이 로그인하고 로컬 세션을 활용하는 구조를 구현하려고 해. 앱 전용 Chrome 영구 프로필과 기존 Chrome 확장 방식 중 요구사항에 맞게 먼저 정하자. 현재 파일에는 병행 SMS/Discord·viewport·Chrome 실행 변경도 있으니 보존하고, 실로그인은 추가로 하지 말고 로컬 검증부터 진행해줘.

---


## 병행 최신 인계 — Discord 문자 인증 연결·Google 실검증·Chrome 전환 / 2026-11-02

**Google·Discord 작업은 이 절을 읽는다. 아래 2026-10-31 Google·Discord 기록보다 우선한다.** 상단 병행 세션의 네이버 보호조치 조사·로컬 앱 전환 방향을 보존한다. 해당 채팅의 결정과 이 채팅에서 제안만 한 대안을 혼동하지 않는다.
최초 요청은 **오늘 작업 인계 업데이트와 커밋 계획**이었고, 이후 사용자가 **커밋·푸시를 승인**했다. 아래 Google·Discord 범위의 5개 커밋을 현재 브랜치에 반영하며 새 실로그인은 실행하지 않는다. PR 생성은 요청받지 않았다.
브랜치 `feat/ai-login-bot`. 인계 작성 시 HEAD는 `30d48bf`였고, 커밋 준비 중 병행 채팅이 네이버 코드 `f025298`과 인계 `e6c7a2b`를 커밋했다. 그 완료 후 **`e6c7a2b`를 새 기준으로 사본을 다시 만들어** Google·Discord 작업을 진행했다. 최초 원격 조회는 `30d48bf`였으며 최종 push 후 SHA를 다시 확인한다.

### 사용자 의도와 구현 상태

- 사용자와 함수·클래스를 하나씩 설명하며 구현했다. 직접 추가한 코드 주석과 다른 채팅의 변경을 보존한다.
- 목표: Google 로그인 → 문자 인증 선택·발송 → Discord에 서비스·마스킹 번호 안내 → 본인 코드 제출 → 같은 Playwright 탭에 입력·확인 → 최종 인증 후 세션 저장.
- **Discord 입력 방식은 버튼 + 모달로 확정·구현**했다. Python 프로그램이 Gateway에 연결해 이벤트를 받는다. 코드가 Discord 서버에서 실행되는 구조가 아니다.
- **Google 실로그인 성공과 실제 문자 인증 전체 흐름은 확인하지 못했다.** Discord 단독 성공·로컬 모의 성공·기존 Chrome 세션 접근 성공과 구분한다.
- Bing Google 로그인 어댑터는 미구현이다. 공식 OAuth/API 코드는 별도로 유지한다.

### 완료된 작업 — Discord·Future 연결부

- [x] `app/login_bot/discord_auth.py`: 불변 설정·환경변수 로더, Gateway 연결·종료, 지정 텍스트 채널 전송, 테스트 CLI 구현.
- [x] `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `DISCORD_ALLOWED_USER_ID` 사용. 환경변수가 `.env`보다 우선하며 토큰을 repr에서 숨긴다. `.env.example`에 빈 필드 추가. 실제 값은 문서·로그·커밋에 넣지 않는다.
- [x] `AuthCodeView`의 버튼과 `AuthCodeModal`의 입력창 구현. 사용자·채널·만료·중복 검사, 6자리 ASCII 숫자 검사, 본인에게만 접수 응답, 완료/만료/취소 시 버튼 제거와 연결 정리.
- [x] `app/login_bot/human_auth.py`: `AuthCode`, `AuthCodeRequest`, `create_auth_code_request()`, `SmsCodeProvider` 구현. 요청별 ID·마감 시각·Future를 사용하며 `wait()` 소비자 한 명, `submit()` 최초 유효 코드 한 번만 허용한다. 늦은 제출과 취소된 요청을 거부한다.
- [x] `DiscordSmsCodeProvider.request_code()`가 실제 로그인 요청과 Discord를 연결한다. 테스트 문구와 실제 서비스·마스킹 번호 안내를 구분한다. 전체 전화번호·멘션 등 허용되지 않은 안내 값을 거부한다.
- [x] `discord.py` 의존성·`uv.lock` 갱신, Miniconda `startpress`에 잠금 버전 **discord-py 2.7.1**과 관련 패키지 설치. `.venv`는 생성하지 않았다.
- [x] `docs/discord-auth.md`, `tests/test_discord_auth.py`, `tests/test_human_auth.py` 추가.

Discord는 Application ID·Public Key·Message Content Intent 없이 현재 Gateway+모달 흐름을 사용한다. 프로그램이 꺼져 있으면 입력을 받을 수 없다. 코드 원문은 채널 응답·로그·파일·AI에 넣지 않지만 Discord를 통해 전달되고 관련 객체 참조가 남은 동안 메모리에 있을 수 있다. 즉시 메모리 삭제나 암호화 보장은 아니다.

```bash
# 실제 Discord에 연결·테스트 메시지 한 건 전송 후 종료
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth
# 아래 두 모드는 가짜 코드만 사용
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth --interactive
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth --handoff
```

### 완료된 작업 — Google 감지·로그인 루프 연결

- [x] 이전 세션의 미추적 `GoogleLoginSite`에 `detect_sms_challenge()`와 `sms_code_error_visible()` 추가. Google 인증 경로, 한·영 문자 발송 완료 안내, 유일한 편집 가능 입력칸·활성 확인 버튼을 함께 확인한다.
- [x] `sites/base.py`에 불변 `SmsChallenge`, 선택적 확장 계약 `SmsLoginSite` 추가. `GoogleSmsChallenge`는 현재 `SmsChallenge`의 별칭이다. 마스킹 번호가 없거나 모호하면 `None`. 안내 표시는 휴대전화의 실제 수신 보장이 아니다.
- [x] `authenticated_page(..., sms_provider=...)` → `_ensure_login()` → `_run_login()`에 제공자 전달. **AI 관찰 전에** 문자 인증을 감지하고 `_complete_sms_login()`으로 분기한다. 제공자 미주입 시 `requires_user`로 종료한다.
- [x] 사용자 대기 전후와 코드 입력 직후 URL·마스킹 번호·입력칸·버튼의 동일성을 검사한다. GET 폼·외부 전송 목적지를 거부한다. Playwright가 직접 코드 입력·확인을 한 번 수행하며 성공 판정 후에만 세션을 저장한다.
- [x] 문자 인증 분기에 들어간 이후 오류가 나도 AI 관찰로 돌아가지 않는다. 입력 코드가 후속 AI 요청·스크린샷으로 전달되는 경로를 막는다.
- [x] `LoginPolicy.human_timeout_seconds` 기본 180초 추가. 사용자 대기 중 자동 조작 예산의 잔여 시간을 보존한다. 제출 후 결과 확인은 최대 30초이며 자동 조작 잔여 예산도 적용된다. 오답·만료·추가 인증은 자동 재발송 없이 종료한다. 정리에는 추가 제한 시간이 필요할 수 있다.
- [x] Google goal에 문자 방식이 제공될 때 선택·발송 요청하도록 명시. 실제 Google이 해당 방법이나 자동화를 허용한다는 보장은 아니다.
- [x] `tests/test_login_bot_sms.py`: 같은 탭 대기·입력·성공·세션 저장, 실패 시 저장 방지, 시간 분리·취소·만료, stale 요소·전송 목적지 검사, 입력 후 AI 재호출 방지 검증.

호출부는 `sms_provider=DiscordSmsCodeProvider(load_discord_settings())`를 명시적으로 주입한다. **영구 Google 실행 CLI/API는 아직 없고**, 실제 시도는 아래 임시 실행기로 모델·Google 계정·제공자를 구성했다. `.env`만으로 자동 실행되지 않는다.

### 완료된 작업 — 화면 안 요소 필터·Chrome 실행

- [x] `_is_visible_in_viewport()` 추가. `is_visible()` 이후 `getClientRects()`와 `window.innerWidth/innerHeight`를 비교해 화면과 겹치는 요소만 `_observe_page()` 후보로 제공한다. 일부 겹침은 포함, 스크롤 후 들어온 요소는 재관찰 시 포함한다.
- [x] 초기의 문서 높이 기준은 스크롤 테스트에서 실패해 실제 viewport 높이 기준으로 수정했다. 최종 관련 테스트 통과.
- [x] **가림·활성화 추가 검사, 클릭 직전 viewport 재검사, 동일 요소 반복 실패 제한은 미구현**이다. 사용자가 우선 요소 수집의 화면 범위 조건만 구현하도록 요청했다.
- [x] 사용자 요청으로 `authenticated_page()`를 `runtime.chromium.launch(channel="chrome", headless=headless)`로 변경했다. 설치된 Chrome을 사용하고 개인 기본 프로필은 재사용하지 않는다. **공통 진입점이므로 네이버 등에도 적용**된다.
- [x] Chrome 실행 파일 존재 및 변경 후 공통 로그인 테스트 16개 통과 확인. 실제 Chrome 로그인은 자동 승인 검토에서 차단돼 시작되지 않았다. 일부 테스트 fixture는 여전히 번들 Chromium을 직접 사용한다.

### 실제 실행 결과 — 성공 범위를 구분

1. **Discord 연결 성공**: 초기 토큰 실패·키 미설정 이후 사용자의 `.env` 수정으로 Gateway 연결과 지정 채널 메시지 전송 성공.
2. **Discord 버튼·모달 실수신 성공**: `--interactive` 종료 출력 `테스트 코드 수신 완료. 연결을 종료했습니다.`를 확인했다. Google 실제 OTP 흐름 성공은 아니다.
3. `--handoff`는 실제 버튼 전송·대기 시작까지 확인했다. 최종 출력은 회수하지 못했고 인계 시 실행 세션도 조회되지 않았다. **실제 가짜 작업 재개 완료로 단정하지 않는다.** Future 전달·재개 자체는 로컬 테스트로 검증했다.
4. **Chromium 첫 Google 시도**: 2026-11-02 **20:31:03~20:32:00 KST**, AI 6회, 0번 요소 클릭 시간 초과 반복으로 중단. Google 로그인 전이며 Discord 요청·세션 저장 없음.
   - `.secrets/bot_runs/google_discord_7a978dbdef00.jsonl`.
5. **Computer Use 조사**: 사용자 승인 후 Chrome의 새 탭에서 공개 소개 화면 확인. viewport 폭 1440인데 첫 시작하기 링크 x=1620으로 화면 밖, 본문 버튼은 화면 안이었다. 본문 버튼으로 개요 화면 진입 성공. **기존 Chrome 로그인 세션으로 접근한 결과**이며 새 로그인·문자 인증 성공이 아니다. 최초 실패 당시 DOM은 저장하지 않아 정확한 동일성을 단정하지 않는다.
   - `.secrets/bot_runs/google_start_ui_diagnosis_6d9a08e17f.jsonl`.
6. **viewport 수정 후 Chromium 재시도**: **21:18:44~21:19:04 KST**, AI 7회, Google 로그인 화면 진입 및 fill 2회·click 4회 완료. 최종 `failed / 로그인 행동 횟수를 초과했습니다.`. Discord 요청·세션 저장 없음.
   - `.secrets/bot_runs/google_discord_7c37a6b27bb6.jsonl`.
   - 사용자는 Google의 수상한/안전하지 않은 브라우저 안내를 봤다고 말했다. 해당 실행에서 차단 안내 DOM은 별도로 기록하지 않았으므로 로그만으로 원인을 확정하지 않는다. AI 호출 수와 전체 루프 횟수를 동일하게 해석하지 않는다.
7. **Chrome 변경 후 실로그인 미실행**: 자동 승인 검토가 실행·재검토·새 명시적 승인 후 실행을 거부했다. 마지막 거부는 승인 누락이 아니라 **Google 비밀번호·화면을 외부 AI 게이트웨이로 전송하는 행위 자체를 불허**한 것이다. Chrome 전환 후 로그인 결과나 차단 해소 증거는 없다.

임시 실행기 `/private/tmp/webmaster_google_discord_live.py`는 제품 함수를 위임하는 계측과 모델·어댑터·제공자 구성을 포함한다. 실행마다 새 비공개 JSONL과 새 Google 세션 키를 만든다. 커밋하지 않으며 사라질 수 있다.
기록 파일 0600·폴더 0700. 원문 인증정보·코드·토큰·쿠키·화면·AI 요청/응답은 저장하지 않는다. 첫 실행에서 알려진 비밀값 미포함을 확인했다. human 사유는 정제 후 기록한다.
현재 임시 실행기에는 종료 시 차단 안내 boolean 확인도 추가했지만 그 추가 이후 실제 실행은 거부돼 수행되지 않았다. **파일 확인 목적으로 `--execute`를 재실행하지 않는다.**

### 실행 제한·미구현 대안

- 사용자는 Google ID/PW·화면을 학교 게이트웨이 `https://factchat-cloud.mindlogic.ai/v1/gateway`의 `deepseek-v4.1-flash`로 전송하는 범위를 승인했고 일부 Chromium 실행은 실제 수행됐다.
- 그러나 마지막 Chrome 검증의 자동 승인 검토는 그 승인을 인정하면서도 전송 자체를 거부했다. 단순 승인 누락으로 기록하거나 같은 승인을 반복 요청하지 않는다. 다른 도구·간접 실행으로 차단을 우회하지 않는다.
- 이 채팅에서 제안한 대안은 **ID/PW를 AI에 보내지 않고 고정 Playwright로 Google에만 입력**하는 방식이다. 아직 구현하지 않았고 현재 제품은 미인증 시 계정정보를 AI에 보낸다.
- 직접 최초 로그인 후 전용 프로필/세션 재사용, 공식 API/OAuth, 별도 자동화 드라이버도 조사했지만 이 채팅에서는 구현하지 않았다. 상단 병행 인계의 로컬 앱 전환 방향과 함께 판단한다.
- Chrome 선택만으로 로그인 차단이 해결된다고 보장하지 않는다. 참고: [Google 브라우저 제한](https://support.google.com/accounts/answer/7675428?hl=ko), [Playwright 이슈](https://github.com/microsoft/playwright/issues/19420), [인증 상태 재사용](https://playwright.dev/python/docs/auth), [Chrome 실행](https://playwright.dev/python/docs/browsers#google-chrome--microsoft-edge), [Chrome 기본 프로필 제한](https://developer.chrome.com/blog/remote-debugging-port).

### 테스트 기록 — 시점·범위가 달라 합산하지 않음

| 시점 | 범위 | 결과 |
| --- | --- | --- |
| Discord 코드 전달 | human·Discord 2개 파일 | 51 passed |
| Google SMS 감지 | Google 어댑터 테스트 | 63 passed |
| 문자 로그인 연결 | SMS·Google·공통 로그인·AI 흐름·네이버·Discord·human·schemas 8개 파일 | 207 passed in 53.88s |
| 취소·화면 변경 추가 | SMS 테스트 | 21 passed in 10.39s |
| 인터페이스 정리 | SMS·공통 로그인·네이버 | 57 passed in 27.22s |
| viewport 최종 수정 | AI 흐름·Google·네이버·SMS | 132 passed in 54.84s |
| Chrome 채널 변경 후 | 공통 로그인 `test_browser_login_agent.py` | 16 passed in 8.06s |

모두 로컬 HTML·가짜 모델/코드 제공자 테스트다. 프로젝트 전체·DB 통합·Chrome 전환 이후 전체 재검증 수치가 아니다. 이번 문서 요청에서는 코드 테스트·실로그인을 재실행하지 않고 상태·기록·문서 차이와 공백 검사를 확인한다.

### 커밋 구성 — 이 채팅 범위, 사용자 커밋·푸시 승인

기존 Google 어댑터는 이전 세션에서 시작한 미추적 파일이지만 이번 기능의 의존성이므로 함께 계획한다. 상단 네이버 입력 이력 작업의 커밋 계획과 충돌하지 않도록 hunk 단위로 분리한다.

| 순서 | 제안 메시지 | 범위 |
| --- | --- | --- |
| 1 | `[feat] Google 로그인 어댑터와 문자 인증 화면 감지 구현` | `sites/google.py`, `sites/base.py`, `test_login_bot_google.py`, `.env.example`의 Google ID/PW 부분 |
| 2 | `[feat] Discord 인증 코드 입력과 요청별 대기 구현` | `discord_auth.py`, `human_auth.py`, 관련 두 테스트, `pyproject.toml`, `uv.lock`, `.env.example`의 Discord 부분 |
| 3 | `[feat] 로그인봇에 문자 인증 대기와 재개 연결` | `login_agent.py`의 SMS import·제공자 주입·대기/입력/결과 확인 부분, `schemas.py`, `test_login_bot_sms.py` |
| 4 | `[fix] 로그인봇의 화면 내 요소 선택과 Chrome 실행 적용` | `login_agent.py`의 viewport 헬퍼·필터·Chrome launch 부분, `test_login_bot_ai_flow.py`의 viewport 테스트 부분 |
| 5 | `[docs] Discord 인증 흐름과 Google 실검증 결과 인계` | `docs/discord-auth.md`, `docs/HANDOFF.md`; 병행 인계 내용을 보존하고 Chrome 요구·검증 한계 확인 |

- 3번은 1·2번에 의존한다. 실제 커밋 시 스테이징 스냅샷별 import·관련 테스트를 검증한다. 현재 작업 트리 통과를 분리된 중간 커밋 통과로 단정하지 않는다.
- `login_agent.py`, `test_login_bot_ai_flow.py`, `.env.example`, `HANDOFF.md`에는 다른 채팅/기존 변경도 있다. **파일 통째로 add하지 않고 hunk/패치로 분리**하며 `git add .` 금지.
- 이 계획에서 별도 보존: 네이버 입력 이력·동일 값 fill 생략·클릭 후 1초 대기 및 관련 테스트, README 대규모 개편, 기존 AI/Naver 환경변수 예시 추가, `CLAUDE.md`, `naver_probe.py`, `tests/test_naver_probe.py`, `browser_bot_test/`, `app/engines/brave.py`, `app/services/index_status.py`, ERD 자료. 네이버 변경은 상단 별도 계획을 따른다.
- `.env`, `.secrets/`, 인증 상태·프로필·실행 로그·임시 실행기는 커밋 제외. 한국어 `[타입] 제목`, Git 작성자 유지, Co-Authored-By 없음. main/master 직접 push 금지. 새 브랜치는 `feat/`, `fix/` 등 사용.
- 기존 README에 Chromium 실행·human 재개 미지원 등 과거 설명이 남아 있다. 다른 채팅의 편집을 보존하고 별도 정리한다. 신규 Discord 문서에는 Chrome 설치 요구와 일부 테스트의 Chromium 필요를 반영했다.

### 다음 작업과 마지막 상태 — Google·Discord

1. 이 문서와 상단 네이버 인계를 함께 읽고 현재 diff를 확인한다. 이후 사용자 승인으로 Google·Discord 범위의 커밋·푸시를 진행하므로 최종 상태는 git log와 원격 SHA로 확인한다. 다른 미커밋 파일을 자동 포함하지 않는다.
2. 상단 로컬 앱 전환 방향을 우선 고려하고, 인증정보를 AI에 전송하지 않는 구조 또는 직접 로그인·세션 재사용 방식 중 실제 구현 방향을 정한다. 제품 계정 자동 로그인을 반복 실행하지 않는다.
3. 자동화 차단을 명시적 종료 사유로 분류하는 기능은 미구현이다. 현재 `AUTOMATION_BLOCK`은 준비 대기·SMS 감지에만 사용된다.
4. viewport 검사와 실제 클릭 가능성 검사를 구분한다. 가림·활성 상태·클릭 직전 재확인·동일 요소 반복 실패 제한은 다음 작업이다.
5. Google 실제 문자 인증 DOM·최종 인증 판정은 검증 가능한 로그인 경로가 마련된 뒤 확인한다. IndexedDB 저장·손상된 복원 복구·Bing 어댑터는 기존 후속 과제다.
6. 현재 브랜치는 `feat/ai-login-bot`. Google·Discord 커밋은 아래 실행 상태를 참조한다. Chrome 옵션은 적용됐지만 Chrome 실로그인은 도구 검토에서 차단됐다.

관련 파일: `app/login_bot/{discord_auth,human_auth,login_agent,schemas}.py`, `app/login_bot/sites/{base,google}.py`, `tests/test_{discord_auth,human_auth,login_bot_google,login_bot_sms,login_bot_ai_flow}.py`, `docs/discord-auth.md`.

### 커밋 실행 상태와 선택 스냅샷 검증

사용자의 후속 **커밋·푸시 승인**으로 위 계획을 실행했다. 병행 네이버 커밋 `f025298`, `e6c7a2b`가 먼저 완료된 뒤 그 HEAD 기준으로 선택 사본을 다시 생성했으며 작업 트리 파일을 되돌리거나 병행 인덱스를 덮어쓰지 않았다.

| 순서 | 생성 커밋 | 해당 인덱스만 내보낸 검증 결과 |
| --- | --- | --- |
| 1 | `9a36e48` Google 어댑터·문자 감지 | Google 어댑터 63 passed in 20.49s |
| 2 | `eee667c` Discord 입력·요청별 대기 | Discord·human 55 passed in 0.29s |
| 3 | `9a374c9` 문자 인증 대기·재개 연결 | SMS·공통 로그인·AI 흐름·네이버 74 passed in 45.77s |
| 4 | `af32301` viewport·Chrome 적용 | 관련 8개 테스트 파일 220 passed in 60.57s |
| 5 | 이 인계와 Discord 사용 문서 | 문서 공백·추가 줄 비밀값 검사. 해시는 git log로 확인 |

4번 검증은 `test_login_bot_ai_flow.py`, `test_browser_login_agent.py`, `test_login_bot_sms.py`, `test_login_bot_naver.py`, `test_login_bot_google.py`, `test_discord_auth.py`, `test_human_auth.py`, `test_browser_schemas.py` 범위다. 프로젝트 전체·DB 통합·실제 Google 인증 결과는 아니다. 위 수치를 서로 합산하지 않는다.

추가 줄의 알려진 실제 인증정보 포함 여부와 `git diff --cached --check`를 확인했다. `.env`·실행 기록·인증 상태·임시 실행기는 포함하지 않았다.
AI/Naver 설정 예시 추가분과 README 개편, 기타 제외 파일은 작업 트리에 보존했다. `.env.example`에는 이번 계획의 Google·Discord 부분만 반영했다.
푸시 대상은 `origin/feat/ai-login-bot`이며 force push·PR 생성은 하지 않는다. 푸시 직전 원격은 병행 문서 커밋 `e6c7a2b`였다. 최종 문서 커밋 해시와 원격 반영 여부는 `git log -5` 및 원격 브랜치 SHA로 확인한다.

## 과거 세션 인계 요약 — 네이버 색인 조회 연결·실제 전체 흐름 검증 / 2026-10-31

**네이버 작업은 이 절부터 읽는다.** 이번 사용자 요청은 인계 문서 갱신과 커밋 계획 수립이다. **캡차 답을 다시 덮어쓰는 문제는 분석만 했고, 수정은 다음 작업으로 미뤘다.** 이후 사용자가 **현재 브랜치에 push**하도록 승인했다. 아래 네이버 범위만 4개 커밋으로 나눠 origin/feat/ai-login-bot에 반영하며 새 실로그인은 실행하지 않는다. Google·Bing·Discord 관련 병행 작업은 아래 기록을 보존하며 네이버 변경과 섞어 자동 구현·커밋하지 않는다.

### 완료된 작업

- [x] `app/engines/naver.py`의 `NaverEngine`에 `NaverLoginSite`, `SessionKey`, 모델, `SessionStore`를 주입하고 `async get_site_summary(site_url)`에서 제품 로그인봇을 호출하도록 연결했다. 기존 사용되지 않던 `IndexNowClient` 의존성은 제거했다. 발행 알림은 기존 공통 IndexNow 경로를 유지한다.
- [x] 최초 `_select_site()` 방식은 사용자 요청에 따라 **`_open_index_status()` 고정 이동 방식으로 교체**했다. 현재 사이트 선택 링크·메뉴를 차례로 클릭하는 방식이 아니다.
- [x] 실제 사용자가 열어둔 네이버 탭의 DOM과 주소를 확인했다. 로그인 후 `https://searchadvisor.naver.com/console/site/check/inspection?site=<등록 사이트 URL>`로 직접 이동 → `input[type="text"]`에 URL 입력 → 이름이 정확히 `확인`인 버튼 클릭 → 판정 메시지 대기 순서로 동작한다. 인증 콜백을 거쳐 돌아오는 경우도 최종 경로까지 기다린다.
- [x] 실제 DOM에서 `.v-card__text.primary--text`가 판정 메시지와 안내 문구의 두 요소임을 확인했다. `_read_site_summary()`는 **첫 번째 판정 메시지만** 읽고 `NaverSiteSummary(site_url, checked_at, text)`로 반환한다. `checked_at`은 UTC다. 상세 표의 날짜·수집 여부·응답 코드·색인 여부를 구조화해 추출하는 기능은 아직 없다.
- [x] 사이트 URL 정규화·현재 화면의 사이트 쿼리 일치·잘못된 이동·재로그인 필요·결과 대기 초과·기존 판정 잔존을 검사한다. 입력 URL은 HTTP(S)이며 인증정보·쿼리·프래그먼트를 허용하지 않는다. 판정 메시지를 수치 0이나 미색인으로 임의 변환하지 않는다.
- [x] `NaverLoginSite.name/policy`를 `LoginSite` Protocol과 같은 읽기 전용 property로 수정했다. `_policy`는 클래스 내부 공유 값이다. Google 구현에도 동일한 타입 수정이 보이며 해당 파일 전체는 병행 작업의 신규 파일이다.
- [x] 실제 로그인 페이지가 `/oauth2.0/authorize`에 표시되는 것을 확인해 네이버 준비 대기·계정 오류 감지가 이 경로와 `/nidlogin.login`을 모두 인식하도록 수정했다. `wait_until_ready()`의 기존 조건 대기와 공통 전체 시간 제한을 유지한다.
- [x] 사용자 지시에 따라 `AGENTS.md`와 `.cursor/rules/bot-execution-records.mdc`에 실제 봇 실행 기록 규칙을 추가했다. 실행별 파일·행동 결과·민감값 제거한 human 사유·로그인 전후 구분을 남긴다. **제품에 영구 자동 파일 로거를 추가한 것은 아니다.** 아래 실제 실행은 임시 실행기의 계측으로 기록했다.

### 현재 실행 흐름

```text
NaverEngine.get_site_summary(site_url)
  → authenticated_page(...)
    → 상태 복원 → 화면 준비 대기 → 인증 판정 → 필요하면 AI 로그인
    → 인증 상태 저장 → 같은 Page 제공
  → _open_index_status(page, site_url)
    → 전용 경로 이동 → URL 입력 → 확인 → 판정 대기
  → _read_site_summary(page)
    → 네이버 판정 메시지·입력 URL·UTC 시각 반환
  → 브라우저 종료
```

현재 `site_url` 하나를 등록 사이트 선택 키와 검사 URL로 함께 사용한다. 실제로 검증한 대상은 등록된 메인 사이트 URL이다. 개별 글을 검사하려면 등록 사이트 URL과 검사 대상 URL을 별도 매개변수로 구분하는 후속 설계가 필요하다. 서비스·DB·API 연결은 아직 없다.

### 실제 검증과 실행 기록

1. 구조 분석을 위해 저장 상태 복원을 시도했으나 콘솔 인증을 확인하지 못했다. 사용자 요청으로 제품 로그인봇을 실행했고, 첫 분석 시도는 **11단계에서 human으로 종료**됐다. 로그인 성공 전이며 사이트 선택은 실행되지 않았다. 이 당시 사유를 보존하지 않아 원인을 확정하지 않는다.
2. 사용자 제공 스크린샷과 이미 열린 Chrome의 인증된 탭에서 색인 확인 화면을 읽었다. 검증용 새 탭에서도 고정 주소 진입 → URL 입력 → 확인을 수행해 **‘문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.’** 표시를 확인했다. 기존 사용자 탭은 유지하고 추가 검증 탭만 닫았다. `수집 요청`은 누르지 않았다.
   - 기록: `.secrets/bot_runs/naver_index_structure_nsavqsla.jsonl`.
3. 사용자가 로그인봇 호출까지 포함한 테스트를 요청해 **제품 `get_site_summary()`를 실제로 한 번 호출**했다. 모델·사이트·실행 동작을 가짜로 대체하지 않았으며 임시 실행기는 원래 함수를 위임하는 기록 래퍼만 사용했다.
   - **2026-10-31 20:06:37~20:07:32 KST**, 기존에 구체적으로 승인된 학교 게이트웨이 `https://factchat-cloud.mindlogic.ai/v1/gateway`의 `deepseek-v4.1-flash` 사용.
   - **AI 14회 호출 후 콘솔 인증 성공 → 고정 Playwright로 색인 확인 → 위 성공 판정 메시지 반환 → 브라우저 컨텍스트 종료** 확인.
   - 로그인 이후 AI 호출은 **0회**다. `수집 요청`·사이트 등록·설정 변경은 하지 않았다.
   - 기록: `.secrets/bot_runs/naver_get_site_summary_6f2y2aka.jsonl`. 실제 ID/PW·키·쿠키·입력 답·원문 AI 요청/응답·이미지는 보관하지 않았다. 알려진 인증정보 포함 여부 false, 파일 0600·폴더 0700을 확인했다.
   - 임시 실행기: `/private/tmp/webmaster_naver_engine_e2e.py`. 저장소 커밋 대상이 아니다. 실제 AI·네이버 요청을 실행하므로 단순 조회용 파일로 오해해 재실행하지 않는다.

### 알려진 문제 — 캡차 재입력, 다음 작업으로 보류

사용자는 **처음 올바른 캡차 답을 입력했다가 AI가 다른 답으로 바꿔 틀리는 장면**을 관찰했다고 말했다.

기록에서 확인한 순서는 다음과 같다.

| 단계 | 시각(KST) | 기록된 행동 |
| --- | --- | --- |
| 5 | 20:06:50 | ‘정답을 입력해 주세요’ 입력칸에 fill 실행 완료 |
| 6 | 20:06:59 | 같은 번호·표시 이름의 입력칸에 다시 fill 실행 완료 |
| 7 | 20:07:07 | 확인 버튼 click 실행 완료 |

- **첫 확인 클릭 전에 두 번 입력**한 것은 확인된다. 서버가 첫 답을 오답 판정해서 재입력한 순서는 아니다.
- 답과 이미지·문제 지문을 보존하지 않았으므로 첫 답의 정오, 두 입력값이 실제로 달랐는지, 그 사이 문제가 변경됐는지는 기록만으로 확정할 수 없다. 사용자의 관찰과 로그로 확인된 사실을 구분한다.
- 구조적 원인: `_run_login()`의 history는 `{"action":"fill","outcome":"실행 완료"}`만 보존해 **어떤 입력칸을 채웠는지** 다음 호출에 전달하지 않는다. `_observe_page()`도 구조화된 입력값 대신 `has_value`만 제공한다. 단 스크린샷에서는 입력 텍스트가 보일 수 있으므로 ‘AI가 이전 값을 절대 볼 수 없다’고 표현하지 않는다.
- 모델 요청은 시스템 메시지와 현재 사용자 요청으로 구성되며 과거 대화 전체가 유지되는 구조가 아니다. 현재 `SYSTEM_PROMPT`에는 ‘입력 완료 후 재입력보다 확인 우선’ 규칙이 없고 `_execute_action()`은 후속 fill로 기존 값을 덮어쓸 수 있다. **모델이 정확히 왜 다른 답을 판단했는지에 대한 내부 추론은 알 수 없다.**
- **후속 보완안, 미구현**: 이력에 안전한 대상 식별·입력 완료 여부·실행 결과를 전달한다. 오류나 문제 변경이 없으면 재입력보다 제출을 우선하도록 지시하고 동일 필드의 불필요한 덮어쓰기를 검사한다. 비밀번호·OTP·캡차 답을 원문으로 로그에 남기는 방식은 사용하지 않는다. 입력값이 있다는 이유만으로 정당한 수정까지 무조건 차단하지 않도록 한다.
- 회귀 테스트: 문제 변경·오류가 없는 입력 완료 상태에서 확인으로 진행, 실제 문제 변경·오류 상태에서는 수정 가능, 입력/스크린샷 보호, URL/DOM 전환 시 과거 행동 폐기.
- 사용자가 **이 수정은 다음에 하도록 보류**했다. 이번 인계 요청에서는 프롬프트·이력·실행 코드를 고치지 않는다.

### 검증 상태

- 최종 네이버 엔진 범위: `tests/test_naver_engine.py` **19 passed in 6.28s**. 실제 DOM 기준 로컬 문서로 고정 이동·입력/확인·판정/안내 분리·인증 콜백·잘못된 도착·기존 결과 잔존·대기 초과·잘못된 URL·컨텍스트 종료를 검증했다.
- 네이버 OAuth 화면 대응 범위: `tests/test_login_bot_naver.py` **20 passed** 기록. 다른 범위의 결과이므로 19개와 합쳐 전체 테스트 통과 수로 표현하지 않는다.
- Google·네이버 property 수정 관련 **47 passed**는 당시 스냅샷 결과다. 병행 세션의 **137 passed**도 당시 별도 범위 결과이며 이후 엔진 변경까지 전부 재검증한 수치가 아니다.
- 인계 문서 갱신 당시에는 테스트를 재실행하지 않았다. 이후 사용자 push 승인에 따라 스테이징 스냅샷을 임시 폴더에 분리해 **1번 커밋 관련 7개 파일 112 passed in 13.69s**, **2번 커밋 엔진 테스트 19 passed in 7.02s**를 추가 확인했다. 병행 Google 파일·README·설정·실험 파일이 없어도 통과했다. 실제 봇·프로젝트 전체·DB 통합 테스트를 다시 실행한 것은 아니다. `git diff --cached --check`와 알려진 실제 키·비밀번호의 스테이징 파일 포함 여부 검사도 통과했다.

### 다음에 해야 할 작업

1. 사용자가 재개를 요청하면 위 **캡차 반복 덮어쓰기 문제**부터 작은 범위로 설명하고 보완·회귀 테스트한다. 이번 커밋에 미구현 수정이 포함된 것처럼 기록하지 않는다.
2. 계측은 현재 임시 실행기에 있으므로 제품의 재사용 가능한 기록 훅·로거가 필요할지 정한다. 모든 실제 실행에서는 현재 기록 규칙을 먼저 적용한다.
3. 상세 판정 표 구조화, 등록 사이트/개별 검사 URL 분리, `app/services/index_status.py`·DB/API 연결은 별도 단계로 진행한다.
4. 기존 미해결인 IndexedDB 인증 상태 수집·Playwright가 거부하는 복원 상태 처리·human 대기/재개를 보존한다. Google/Bing/Discord 후속은 아래 병행 작업 기록대로 별도로 진행한다.

### 커밋 구성과 실행 상태 — 사용자 push 승인

브랜치 **feat/ai-login-bot**, 기준 커밋 **feb8e0a**. 사용자가 아래 네이버 범위의 현재 브랜치 push를 승인했다. 생성된 코드·규칙 커밋은 **5b52f15**(1번), **e8e4ce0**(2번), **f1ba2c3**(3번)이다. 이 문서를 4번 커밋으로 작성하고 push한다. 4번 커밋 해시는 `git log -1`, 원격 반영 결과는 upstream과 원격 브랜치 SHA로 확인한다.

| 순서 | 커밋 메시지 | 포함 파일 |
| --- | --- | --- |
| 1 | `[fix] 로그인 화면 준비 대기와 네이버 인증 타입 보완` | `app/login_bot/login_agent.py`, `app/login_bot/sites/base.py`, `app/login_bot/sites/naver.py`, `tests/test_browser_login_agent.py`, `tests/test_login_bot_ai_flow.py`, `tests/test_login_bot_naver.py` |
| 2 | `[feat] 로그인봇을 이용한 네이버 색인 상태 조회 구현` | `app/engines/naver.py`, `tests/test_naver_engine.py` |
| 3 | `[chore] 브라우저 봇 실행 기록 규칙 추가` | `AGENTS.md`, `.cursor/rules/bot-execution-records.mdc` |
| 4 | `[docs] 네이버 전체 조회 검증과 캡차 재입력 후속 작업 정리` | `docs/HANDOFF.md` |

- 1번에는 네이버 property·OAuth 경로와 기존 초기 로딩 대기 변경이 함께 들어간다. 공통 Protocol과 가짜 사이트 구현 테스트를 같이 커밋해 중간 상태의 계약 불일치를 피한다.
- 2번은 1번에 의존한다. 실제 조회 결과 메시지 반환까지 구현됐으며 이전 `_select_site()`나 미구현 `_read_site_summary()` 초안이 현재 상태인 것으로 설명하지 않는다.
- 3번은 **실행 기록 규칙**이며 제품에 영구 자동 로깅 기능을 구현한 커밋이 아니다. 4번은 실제 성공과 미수정 캡차 문제를 함께 기록한다.
- **이번 네이버 커밋에서 제외하고 보존**: 병행 작업의 `app/login_bot/sites/google.py`, `tests/test_login_bot_google.py`, `.env.example`, `README.md`; 기존 `CLAUDE.md`, `naver_probe.py`, `tests/test_naver_probe.py`, `browser_bot_test/`, `app/engines/brave.py`, 빈 `app/services/index_status.py`, ERD 로컬 자료. Google 쪽 변경은 별도 승인 범위에서 별도 커밋으로 정리한다.
- `.env`, `.secrets/`, 실행 기록·인증 JSON·쿠키·토큰·임시 실행기는 제외한다. `.env.example`은 실제 `.env`와 다르지만 이번 계획에서는 병행 작업 범위라 제외한다. `git add .` 금지.
- 승인 범위 파일만 명시적으로 스테이징하고 커밋 간 의존성을 확인했다. 별도 스냅샷 테스트·공백 검사·알려진 비밀값 포함 여부 검사를 통과했다. 브랜치 변경·force push·다른 작업 커밋은 하지 않는다. 기존 변경을 되돌리지 않는다.
- 한국어 `[타입] 제목`, Git 작성자 유지, Co-Authored-By 없음. main/master 직접 push 금지. 새 브랜치를 만들 때는 `feat/`, `fix/` 등의 접두사를 사용하며 `codex/`를 새로 쓰지 않는다.


## 병행 세션 기록 — 세션 대기 수정·Google 어댑터·Discord 2차 인증 논의 / 2026-10-31

**새 세션은 이 절부터 읽는다.** 이 절과 맨 아래 마지막 상태가 아래 과거 기록보다 우선한다. 이번 요청은 **인계 문서 업데이트만**이며, 다음 세션에서 Discord 2차 인증 연동을 이어간다. 이번 변경의 커밋·push·실제 Google/Bing 로그인은 요청받거나 수행하지 않았다. 아래 과거 네이버 실로그인 전송 승인을 Google/Bing 또는 새 실행의 포괄 승인으로 해석하지 않는다.

### 사용자 의도와 이번 결정

- 사용자는 학습을 위해 코드 위치·동작을 이해하며 단계별로 진행한다. 한국어로 간결하게 설명하고 다음 기능을 앞서 구현하지 않는다.
- 목표: 기존 네이버 공통 AI 로그인봇에 Google Search Console과 Bing Webmaster Tools 로그인을 추가한다.
- **Bing은 Microsoft가 아니라 Google 계정으로 로그인한다.** Google과 Bing은 최종 성공 판정·세션을 사이트별로 분리한다. Bing 브라우저 어댑터는 아직 구현하지 않았다.
- 세션 복원 직후 false 문제는 캡차 후 재로그인 문제가 아니다. 저장 세션을 다음 실행에서 복원했지만 화면 렌더링 전에 인증 여부를 판단하는 문제였다.
- 고정 1초 sleep 대신 **인증된 콘솔 또는 로그인 화면이 준비될 때까지 조건 대기**하도록 수정했다.
- 사용자 인증 대기 기능은 처음에는 범위가 커져 보류했고 Google 어댑터를 먼저 구현했다. 이후 사용자가 **human 단계에서 Discord로 인증 코드를 받고 로그인을 재개하는 흐름**을 제안했다. 구현은 다음 세션으로 미뤘다.
- 사용자 전제: 로그인 계정에 **비밀번호가 반드시 있다**고 보고, 생체 인증·패스키가 먼저 나오면 취소 → 다른 방법으로 인증 → 비밀번호를 선택한다. 이는 후속 구현 요구사항이며 현재 goal·코드에 모두 반영된 상태가 아니다. 네이티브 인증창 취소는 현재 Playwright Page 조작만으로 지원하지 않는다.
- 캡차처럼 화면으로 해결할 수 있는 검증은 **AI가 직접 풀고 입력·확인**하도록 Google의 goal에 명시했다. 실제 캡차 해결 성공을 검증한 것은 아니다.

### 완료된 작업과 코드 상태

1. **초기 화면 준비 대기**
   - `app/login_bot/sites/base.py`: `LoginSite.wait_until_ready(page) -> None` 계약 추가.
   - `app/login_bot/login_agent.py`: `_ensure_login()`에서 `page.goto(..., wait_until="domcontentloaded")` 다음에 `await site.wait_until_ready(page)` 호출. 그 뒤 인증 판정·AI 진입.
   - `app/login_bot/sites/naver.py`: 인증 콘솔 또는 ID/PW 입력칸을 0.1초 간격으로 확인. 공통 `asyncio.timeout(site.policy.timeout_seconds)` 안에서 실행되어 전체 제한 시간을 따른다.
   - 관련 가짜 사이트 구현·지연 렌더링·대기 만료 테스트 보완. 준비 전 AI 호출을 막는다.
2. **Google 로그인 어댑터**
   - 신규 `app/login_bot/sites/google.py`: `GoogleLoginSite`, 불변 dataclass, 인증정보 외부 주입.
   - 시작 주소 `https://search.google.com/search-console`, 허용 호스트 `search.google.com`, `accounts.google.com`.
   - 계정 선택·ID/PW 단계·추가 인증·자동화 차단·소개 화면에서 AI로 넘길 준비 상태를 판정한다.
   - 인증 판정은 Search Console 경로(소개 `/about` 제외) + 표시된 Google 계정 메뉴 + 한국어/영어 콘솔·초기 시작 화면 문구를 조합한다. 사이트 없는 계정의 welcome 화면도 고려한다.
   - Google 로그인 호스트의 표시된 계정 오류만 감지한다. 기존 공식 API/OAuth 코드는 교체하지 않았다.
   - **실제 Google 계정으로 선택자·로그인·세션 재사용을 검증하지 않았다.** 로컬 테스트 성공을 실로그인 성공으로 표현하지 않는다.
   - 신규 테스트 `tests/test_login_bot_google.py`: 계약·성공/오인 방지·계정 오류·준비 대기·지연 콘솔·human 종료·ID 다음 PW 입력 후 콘솔 복귀를 검증한다. 화면 이동 모의 응답은 JavaScript navigation을 사용한다.
3. **환경변수 필드**
   - `.env`와 `.env.example`에 `GOOGLE_LOGIN_ID`, `GOOGLE_LOGIN_PASSWORD` 추가. Search Console 및 후속 Bing Google 로그인에 사용할 계정이다. 기존 값은 보존했다. 이후 사용자의 실제 입력 여부는 확인하지 않았다.
   - `.env`에 누락된 `BROWSER_BOT_BASE_URL`, `BROWSER_BOT_MODEL`, `BROWSER_BOT_API_KEY_ENV` 기본 설정도 추가했다. 기존 `KONKUK_AI_API_KEY` 항목을 유지했다.
   - `.env.example`은 AI 계정정보·화면 전송 안내와 네이버·Google 인증정보 필드를 포함한다.
   - `load_model_settings()`는 AI 설정을 읽지만 **Google 계정정보를 읽어 LoginCredentials/GoogleLoginSite에 주입하는 영구 실행 코드·CLI·API 연결은 아직 없다.** `.env` 작성만으로 로그인 기능이 실행되지는 않는다.
   - 기존 `GOOGLE_OAUTH_CLIENT_FILE`, `GOOGLE_TOKEN_FILE`, `BING_API_KEY`는 공식 API 인증용으로 브라우저 로그인과 별개다.

### 이번 세션의 검증 기록과 한계

- 세션 조건 대기 수정 뒤 관련 테스트 **107 passed**.
- Google 어댑터와 캡차 goal 반영 뒤 마지막 실행: **137 passed in 21.19s**. 아래 8개 파일 범위이며 프로젝트 전체·DB 통합 검증이 아니다.

```bash
PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest tests/test_login_bot_google.py tests/test_browser_login_agent.py tests/test_login_bot_naver.py tests/test_login_bot_ai_flow.py tests/test_browser_model_client.py tests/test_browser_schemas.py tests/test_browser_site.py tests/test_browser_session.py -q -p no:cacheprovider --tb=short
```

- Chromium 실행은 macOS 샌드박스의 MachPort 권한 오류가 있어 승격 환경에서 검증했다. 마지막 통과 실행은 로컬 HTML·가짜 AI를 사용했다. 실제 계정 로그인이나 외부 AI 호출은 하지 않았다.
- 인계 시점 코드에는 별도 작업의 변경도 보인다. 예: Naver/Google의 `name`, `policy` 읽기 전용 property와 `_policy`, 네이버 `/oauth2.0/authorize` 대응, 관련 테스트 변경. **위 137개 통과는 실행 당시 스냅샷의 기록이며 이후 모든 변경을 재검증한 결과가 아니다.** 문서 업데이트 요청에서는 테스트를 재실행하지 않는다.
- `.env` 변경 시 기존 파싱 값이 보존되고 신규 필드가 읽히는지 비밀값 출력 없이 검증했다. 문서 업데이트 뒤 `git diff --check`를 확인한다.
- 별도 서브에이전트 보안·코드 리뷰를 수행한 것으로 기록하지 않는다.

### 다음 세션 — Discord 2차 인증 연동

사용자가 제안한 흐름:

1. ID 입력 → 비밀번호 입력. 생체·패스키가 나오면 취소하고 다른 방법에서 비밀번호 선택.
2. 2차 인증 화면에서 휴대폰 문자 코드 발송 선택.
3. Discord에 인증 필요 알림 발송.
4. 사용자가 Discord에 코드를 보내면 로그인 봇이 받아 입력·확인.
5. 최종 사이트에서 로그인 성공을 검증하고 세션 저장.

현 상태와 후속 설계 사항:

- 현재 `_run_login()`의 `HumanAction`은 `requires_user`를 반환한다. `authenticated_page()`가 `LoginError`를 발생시키며 브라우저가 닫힌다. **대기·Discord 수신·재개는 미구현**이다.
- 사용자는 이 `human` 분기에서 처리하면 될 것 같다고 제안했다. 다만 계정 오류·자동화 차단도 사용자 개입으로 끝날 수 있으므로, 모든 requires_user를 문자 코드 요청으로 취급하지 않도록 후속 설계에서 구분한다.
- **기존 메시지 발송용 Discord incoming webhook URL만으로 일반 사용자 메시지를 수신할 수 없다.** Discord 봇의 Gateway 메시지 이벤트를 사용하면 사용자의 메시지 수신이 가능함을 조사·설명했다. `discord.py`의 `on_message()` / `wait_for("message")`가 후보이고 일반 서버 채널 메시지 내용 수신에는 Message Content Intent 설정이 필요하다.
- 코드 입력 UI는 **미확정**이다. 일반 메시지/요청 알림에 대한 답장 방식을 설명했고, 앞서 버튼·모달 방식도 제안했다. 사용자가 최종 방식을 선택하거나 봇을 설정한 상태로 기록하지 않는다.
- 권장 설계안: 지정 Discord 사용자 ID·채널 ID·로그인 요청/답장 ID 검증, 코드 대기 만료·취소·재시도 한도, 동시 로그인 코드 혼선 방지. 일회용 코드는 로그·파일·AI 요청에 보관하지 않고 직접 입력·제출하는 방향을 제안했다. 아직 구현·최종 합의하지 않았다.
- 문자 OTP와 휴대폰의 승인 버튼/숫자 선택은 별도 인증 유형이다. 사용자는 문자 코드 흐름을 원한다. 제공되는 인증 방식과 문자 발송 가능 여부는 실제 화면에서 확인한다.
- Discord 봇 생성·초대·토큰·사용자/채널 설정·의존성·실행 수명은 미구현이다. 이번 요청에서는 Discord에 어떤 메시지도 보내지 않았다.
- Google 자동화 브라우저 로그인 차단은 Discord 코드 수신으로 해결되지 않는다. iframe·팝업·드래그·네이티브 인증창 미지원도 그대로다.
- IndexedDB 저장, Playwright가 거부하는 저장 상태의 새 로그인 복구는 미해결이다. 이번 초기 화면 대기 수정과 구분한다.

### 업체가 Search Console 전체 사용자 권한을 주는 경우

- 업체 Google 계정 전체를 받지 않아도, **권한을 부여받은 우리 운영 Google 계정**으로 로그인해서 해당 업체 속성을 선택할 수 있다.
- ID/PW·2차 인증은 우리 운영 계정 기준이다. `.env`에는 그 계정을 넣는다. 업체 계정의 문자 코드를 받을 필요는 없다.
- 계정 로그인과 사이트 속성 권한은 별개다. 전체 사용자(Full user)는 URL 검사·색인 생성 요청 등이 가능하지만 사용자 권한 관리는 소유자 권한이 필요하다. Google 계정에 사이트 권한이 있다고 모든 관리 작업이 가능한 것으로 취급하지 않는다.
- 여러 업체가 같은 운영 계정에 권한을 주면 로그인 세션을 재사용하면서 **업체별 정확한 속성·URL·권한**을 별도로 확인하도록 설계한다. 이 선택/검증·DB/API 연동은 아직 구현하지 않았다.
- Search Console 권한을 Bing 권한으로 간주하지 않는다. Bing의 Google 로그인 연결·사이트 접근 권한도 별도로 검증해야 한다.

### 관련 조사 자료

- [Google 자동화 브라우저 로그인 제한](https://support.google.com/accounts/answer/7675428?hl=en)
- [Google 2단계 인증 문제와 다른 방법](https://support.google.com/accounts/answer/185834?hl=en)
- [Search Console 사용자 권한](https://support.google.com/webmasters/answer/7687615?hl=en)
- [URL 검사 도구의 색인 요청 권한](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl?hl=en)
- [Discord 웹훅과 봇](https://github.com/discord/discord-api-docs/blob/main/developers/platform/webhooks.mdx)
- [discord.py 메시지 수신 API](https://discordpy.readthedocs.io/en/latest/api.html)

### 브랜치·보존할 변경·실행 주의

- 인계 시 `feat/ai-login-bot`, HEAD **feb8e0a — [docs] 네이버 실로그인 검증 결과와 후속 작업 정리**, 이전 기능 커밋 `1c5467b`.
- 이번 세션의 세션 대기·Google 어댑터·설정 변경은 **미커밋**이다. 이번 인계 요청은 커밋·push 승인이 아니다. 이전 세션의 두 커밋 승인 기록과 구분한다.
- `git status --short`로 최신 상태를 확인하고 기존 변경을 보존한다. 현재 `.env.example`, `AGENTS.md`, `README.md`, 로그인 코드·테스트의 수정과 `.cursor/`, `CLAUDE.md`, 엔진 초안·실험·테스트·ERD 파일이 있다. 다른 작업 변경을 되돌리거나 이번 작업으로 묶지 않는다.
- 새 `app/login_bot/sites/google.py`, `tests/test_login_bot_google.py`는 미추적 상태다. 이후 커밋 시 명시적으로 선택한다.
- `.env`, `.secrets/`, 인증 코드·비밀번호·쿠키·토큰 원문은 출력하거나 커밋하지 않는다. 필드 이름만 문서화한다. `git add .` 금지.
- **실제 브라우저 봇 실행 전** 현재 `AGENTS.md` 및 `.cursor/rules/bot-execution-records.mdc`를 읽는다. 실행별 행동·결과·민감값 제거한 human 사유·로그인 전후 중단 위치를 비공개 기록으로 남기는 새 규칙이 있다. 이번 인계에서는 실제 봇을 실행하지 않았다.
- Miniconda `startpress`, 직접 실행 시 `PYTHONNOUSERSITE=1`, 프로젝트 `.venv` 사용 금지. 과거 임시 네이버 실행 파일을 설명 없이 재실행하지 않는다.

## 과거 세션 인계 요약 — AI 로그인봇 구현·네이버 실로그인 / 2026-10-31

**이 절은 이전 세션 기록이다. 현재 구현·다음 작업·승인 범위는 최상단의 최신 세션 요약을 따른다.** 사용자는 제안한 **기능·문서 2개 커밋을 현재 `feat/ai-login-bot` 브랜치에 만들고 push하도록 승인**했다. 기능 커밋은 `1c5467b`이며 문서 커밋과 최종 원격 상태는 `git log -2` 및 upstream으로 확인한다. PR 생성이나 기존 브랜치 삭제는 요청하지 않았다.

### 사용자 의도와 확정한 구조

- 사용자는 학습을 위해 각 함수·개념을 이해하며 단계별로 진행한다. 한국어로 간결하게 설명하고 요청 범위 밖의 기능을 먼저 구현하지 않는다.
- `app/browser/`를 `app/login_bot/`으로 변경했다. **Python Playwright 직접 사용 방식**이며 MCP로 전환하지 않았다. 브라우저는 Chromium이다.
- `BrowserContext`는 쿠키 등 인증 데이터를 공유하는 공간, `Page`는 그 안의 탭이다. 스키마가 Page를 생성하는 구조가 아니다.
- `authenticated_page(...)`가 브라우저 생성 → 상태 복원 → 로그인 확인·실행 → 상태 저장 → 같은 Page 제공을 담당한다. `async with` 블록 종료·예외 시 브라우저를 닫는다. 반환 타입은 Pylance 경고를 해결하기 위해 `AsyncGenerator[Page, None]`을 사용한다.
- 사용자 요청으로 **미인증 시 실제 ID·비밀번호를 변수로 AI API에 전달**하도록 변경했다. AI가 전체 로그인 과정의 요소 선택·입력·제출·캡차 대응을 판단한다. 인증정보를 AI에 숨기거나 고정 코드로 ID/PW를 제출하는 과거 합의는 현재 설계가 아니다.
- 특정 캡차 이미지만 찾는 선택자와 사이트별 보호 필드 선택자·`submit_credentials()`·`has_credential_form()`을 제거했다. 화면 텍스트·요소 목록·뷰포트 스크린샷을 공통 코드가 관찰한다.
- `LoginSite`는 사이트별 정책·인증정보·성공 판정·계정 오류 감지의 약속이다. 실제 구현은 `sites/naver.py`에 둔다. **`app/engines/naver.py`와 별개**이며 엔진 초안은 이번 작업에서 수정하지 않았다.

```text
app/login_bot/
├─ __init__.py
├─ schemas.py        # LoginPolicy, LoginResult, SessionKey, LoginCredentials, LoginAction
├─ session.py        # 기존 SessionStore, 저장 위치는 유지
├─ model_client.py   # 비동기 Chat Completions 통신
├─ login_agent.py    # 브라우저 수명과 AI 로그인 루프
└─ sites/
   ├─ __init__.py
   ├─ base.py        # LoginSite Protocol
   └─ naver.py       # NaverLoginSite
```

### 완료된 작업

- [x] 패키지 이름 변경과 관련 import·테스트·문서 경로 정리. 테스트 파일 이름의 `test_browser_*`는 현재 유지한다.
- [x] `LoginCredentials`를 `schemas.py`에 모았다. 불변 dataclass이고 ID/PW는 repr에서 숨긴다.
- [x] 동작 스키마 구현: `fill`, `click`, `scroll`, `wait`, `human`. 고정 인증 제출용 `login` 동작은 제거했다. `fill.text`는 최대 2,000자이며 repr에서 숨긴다.
- [x] `ModelSettings`, `load_model_settings()`, `ModelClient.complete_json()` 구현. HTTP 클라이언트 수명은 호출자가 관리한다. 코드펜스 JSON 처리·안전한 통신 오류·타임아웃·리다이렉트 거부·`store=False`를 적용했다. 모델 제공자의 실제 보관 정책을 보장한다는 뜻은 아니다.
- [x] `_run_login()` 구현: 상태 확인 → 화면 관찰 → AI 요청 → 동작 검증 → 주소 변경 시 재관찰 → 제한 검사 → 실행 → 성공 재확인. 시스템 프롬프트는 `SYSTEM_PROMPT`, 실행 목표는 `site.policy.goal`이다.
- [x] 현재 UI 관찰은 표시 중인 메인 탭 요소 최대 160개·본문 최대 16,000자·JPEG 뷰포트 이미지다. 원본 이미지·입력 텍스트·인증정보·AI human 사유는 로컬 행동 기록에 보존하지 않는다. AI 요청에는 실제 인증정보가 포함된다.
- [x] 허용 주소·폼 목적지·인증 폼의 POST 방식 검사, 전체 시간·행동 횟수·인식 가능한 인증 폼 제출 횟수 제한 구현. 시도 횟수는 비밀번호 또는 username 자동완성 필드를 가진 HTML 폼의 제출 버튼 클릭 기준이며 모든 JavaScript 제출을 포괄하지 않는다.
- [x] 네이버 정책·정확한 콘솔 URL과 표시된 ‘사이트 등록’ 요소 기반 성공 판정·계정 오류 감지 구현.
- [x] 현재 제품 코드로 실제 네이버 로그인과 인증 상태 저장에 성공했다. 별도 브라우저에서 AI 호출 없이 저장 상태 복원도 확인했다. 아래 알려진 타이밍 문제는 미수정이다.

### 실제 검증 결과 — 2026-10-31 / Asia/Seoul

- 사용자가 실로그인 시도를 요청했다. 자동 승인 검토가 실제 ID/PW·화면의 외부 AI 전송을 차단했고, 구체적 전송 대상에 대한 승인 질문 뒤 사용자가 **‘승인해’**라고 명시적으로 승인했다.
- 승인 대상은 학교 게이트웨이 `https://factchat-cloud.mindlogic.ai/v1/gateway`, 모델 `deepseek-v4.1-flash`다. 설정이 해당 주소·모델과 정확히 일치하는지 확인한 임시 실행 도구로 한 번 실행했다. 다른 목적지나 무제한 반복 실행에 대한 포괄 승인으로 확대하지 않는다.
- 로컬 `.env`의 `NAVER_LOGIN_ID`, `NAVER_LOGIN_PASSWORD`와 AI 키를 사용했다. 실제 값은 출력·문서·커밋에 포함하지 않는다.
- 새로운 내부 세션 키 `live_check_<임의 식별자>`로 실행했다. **AI API 10회 호출 후 `site.is_authenticated(page) == True`**, 인증 상태 파일 저장 확인. 사이트 등록·변경이나 색인 현황 조회는 수행하지 않았다.
- 최초 자동 재사용 확인은 `domcontentloaded` 직후 인증 확인이 false여서 AI 루프로 진입했다. 검증용 모델이 추가 AI 호출을 의도적으로 거부해 `RuntimeError`로 종료됐다. AI 서버 오류나 세션 만료로 해석하지 않는다.
- 저장 상태를 별도 브라우저에 복원한 **읽기 전용 확인에서는 즉시 false, 1초 대기 후 true**였다. AI를 추가 호출하지 않았다. 저장·복원은 동작하며 로그인 완료 화면 렌더링을 기다리는 코드가 필요하다.
- 실로그인 결과로 캡차 종류·자동 해결률·다른 계정의 성공을 일반화하지 않는다. 로컬 통합 테스트에서는 가짜 로그인 → 캡차 입력·확인 → 성공 화면 흐름을 검증했다.
- 인증 JSON은 기존 `.secrets/browser_sessions/naver/`에 비공개로 저장했다. 저장 위치는 패키지 이름 변경과 무관하게 유지한다. 쿠키·토큰·파일 본문은 출력하지 않는다.

### 검증 상태

- 마지막 관련 테스트: **103 passed in 10.60s**. 프로젝트 전체 테스트 수가 아니다.
- 실행 명령:

```bash
PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest tests/test_browser_login_agent.py tests/test_login_bot_naver.py tests/test_login_bot_ai_flow.py tests/test_browser_model_client.py tests/test_browser_schemas.py tests/test_browser_site.py tests/test_browser_session.py -q -p no:cacheprovider --tb=short
```

- 가짜 AI·로컬 HTML로 인증정보 전달·입력·제출·캡차 흐름·성공 검증·계정 오류·human 사유 비밀값 보호·동작/제출 제한·외부/GET 폼 차단·과거 요소 거부·세션 재사용·종료를 검증했다.
- Chromium 실행은 macOS 샌드박스 제한으로 승격 환경에서 수행했다. 실제 사이트·AI 호출은 위 실로그인 실행과 별도 복원 확인에 한정된다.
- `git diff --check` 통과. 프로젝트 전체·PostgreSQL 통합·과거 독립 실험 테스트는 이번에 다시 실행하지 않았다. 커밋·푸시 요청 후 위 103개를 최종 재실행해 통과했다. 실제 네이버·AI 호출은 추가 실행하지 않았다.
- 이번 세션은 코드 점검과 위 검증을 수행했으며 별도 서브에이전트 보안·최종 코드 리뷰를 수행한 것으로 기록하지 않는다.

### 알려진 문제와 다음 작업

1. **가장 먼저 세션 재사용의 초기 로딩 타이밍을 수정한다.** `page.goto(..., wait_until='domcontentloaded')` 직후 `is_authenticated()`가 너무 빨리 false를 반환한다. 인증 완료 또는 로그인 화면이 준비될 때까지 제한된 조건 대기를 넣고, 지연 렌더링 회귀 테스트로 불필요한 AI 호출을 막는다. 단순히 모든 실행에 1초 sleep을 넣는 것보다 조건 기반으로 처리한다. 이 버그는 발견만 했으며 수정하지 않았다.
2. 앞선 리뷰의 미수정 사항: `context.storage_state()`가 `indexed_db=True` 없이 저장하므로 IndexedDB 기반 인증 데이터를 잃을 수 있다. SessionStore 최소 검사는 통과하지만 Playwright에서 거부되는 상태의 복원 실패도 새 로그인으로 이어지지 않는다. 이번 네이버 성공과 별도로 보완·테스트한다.
3. `requires_user`는 결과를 담은 `LoginError`로 종료하며 현재 브라우저가 닫힌다. 앱 승인·OTP·패스키 등을 사용자가 처리한 뒤 이어가는 대기/재개 기능은 아직 없다.
4. iframe 내부·새 팝업·드래그·네이티브 패스키 조작은 미지원이다. 기본 조작 외의 UI는 성공을 보장하지 않는다. 다른 사이트 어댑터도 미구현이며 Google 기존 OAuth/API를 자동 교체하지 않는다.
5. AI 판단 중 URL 변경·요소 연결 해제는 감지하지만 URL이 같은 화면의 모든 의미 변화를 감지하는 것은 아니다. 현재 폼 검사·프롬프트도 사이트의 모든 상태 변경을 완전히 차단하는 보안 경계는 아니다.
6. 네이버 엔진의 고정 색인 조회·서비스·DB/API 연결은 별도 후속 작업이다. 사용자가 요청한 단계를 앞서 구현하지 않는다.

### 커밋 범위와 실행 상태 — 사용자 승인

현재 브랜치: **feat/ai-login-bot**. 기존 기준 커밋: **f16b12d**. 기능 커밋: **1c5467b — [feat] 공통 AI 로그인봇과 네이버 인증 구현**. 문서 커밋은 `git log -1`로 확인한다.

| 순서 | 커밋 메시지 | 포함 범위 |
| --- | --- | --- |
| 1 | `[feat] 공통 AI 로그인봇과 네이버 인증 구현` | `app/browser/` 기존 추적 파일 삭제와 `app/login_bot/` 새 경로 8개 파일, `tests/test_browser_session.py` 수정, 아래 로그인 관련 신규 테스트 6개 |
| 2 | `[docs] 네이버 실로그인 검증 결과와 후속 작업 정리` | `docs/HANDOFF.md` |

- 신규 테스트 6개: `tests/test_browser_login_agent.py`, `tests/test_browser_model_client.py`, `tests/test_browser_schemas.py`, `tests/test_browser_site.py`, `tests/test_login_bot_ai_flow.py`, `tests/test_login_bot_naver.py`.
- 1번에서 경로 변경과 의존하는 인터페이스·모델·에이전트·어댑터를 함께 커밋해 중간 커밋의 import가 깨지지 않게 한다. 2번은 그 코드의 검증과 미수정 사항을 설명한다.
- **제외하고 보존**: `CLAUDE.md`, `naver_probe.py`, `tests/test_naver_probe.py`, `browser_bot_test/`, `app/engines/naver.py`, `app/engines/brave.py`, `app/services/index_status.py`, `outputs/db-erd-prompt.txt`, `outputs/startpress-db-erd.png`.
- `.env`, `.secrets/`, 인증 JSON·쿠키·토큰, 캐시, 임시 실행 파일은 제외한다. `git add .`를 사용하지 않고 파일별로 명시한다.
- 커밋 직전 선택한 변경과 비밀값 포함 여부를 확인한다. 최종 스테이징 결과에서 rename이 삭제+추가로 보이더라도 실제 이동 파일을 확인한다. 새 패키지와 관련 테스트는 기능 커밋 `1c5467b`에 포함했다. 기존 제외 파일은 미추적 상태로 보존한다.
- 한국어 `[타입] 제목`, Git 작성자 유지, `Co-Authored-By` 없음, main/master 직접 push 금지. 사용자가 위 두 커밋의 생성과 현재 브랜치 push를 승인했다. 원격 이름은 `origin/feat/ai-login-bot`으로 맞추며 과거 원격 브랜치는 삭제하지 않는다.

### 기존 로컬 브랜치 확인

- `codex/publication-service`: `78819fa`를 가리키며 현재 `origin/main`과 동일하다. main에 없는 고유 커밋은 없다.
- `feat/fastapi-basic-app`: 초기 커밋 `dd30267`을 가리키며 `origin/main`보다 14개 커밋 뒤에 있다. main에 없는 고유 커밋은 없다.
- 두 브랜치는 main에 포함된 과거 작업 포인터다. 사용자는 용도를 물었으며 삭제는 요청하지 않아 보존했다. 원격은 fetch 후 확인했고 기존 `origin/codex/browser-login-foundation`도 삭제하지 않는다.

### 관련 실행 자료

- 실제 실행용 임시 파일: `/private/tmp/webmaster_naver_live_check.py`, `/private/tmp/webmaster_naver_reuse_check.py`. 첫 파일은 실제 AI 호출과 로그인을 수행하므로 설명 없이 재실행하지 않는다. 두 번째는 최근 검증 세션을 복원하며 실제 네이버에 접속한다. 두 파일은 저장소 커밋 범위 밖이고 다음 세션에 존재한다고 보장하지 않는다.
- 앱에는 별도의 영구 실행 CLI·관리 화면 연동을 추가하지 않았다. 실행 진입점은 위 임시 도구에서 확인할 수 있으나 인증값을 문서로 옮기지 않는다.
- `.secrets/browser_bot_test/`와 루트 probe의 과거 세션 파일은 이번 제품 실로그인 결과와 구분한다.

## 과거 세션 인계 요약 — 공통 로그인 스키마·세션 저장소 / 2026-10-29

**이 절은 2026-10-29 당시 기록이다. 현재 상태와 새 변경의 승인 범위는 최상단 2026-10-31 요약을 따른다.** 당시 안내: 아래 과거 기록의 브랜치·미구현·검증 상태보다 이 절과 맨 아래 마지막 상태가 우선한다. 사용자는 오늘 작업을 마무리하며 인계 문서 작성 후, 아래 계획의 **1·4·5번을 하나의 커밋으로 묶어 작업 브랜치에 push하도록 승인**했다. 네이버 probe·AI 탐색 실험은 제외하고 테스트는 재실행하지 않는다. 공통 저장소 단위 테스트 파일은 4번 범위에 포함한다.

### 사용자 의도와 확정한 구조

- 사용자는 개발 개념과 필드를 하나씩 이해하며 진행하기를 원한다. 한국어로 간결하게 설명하고, 요청하지 않은 다음 기능까지 구현하지 않는다.
- 여러 사이트에서 사용할 공통 브라우저 로그인 계층을 `app/login_bot/`에 만든다. 네이버·Google·Bing·Brave 중 브라우저 로그인이 필요한 기능은 같은 저장소를 재사용할 수 있다. 기존 공식 API·OAuth 인증까지 교체하는 작업은 아니다.
- Python Playwright를 직접 사용한다. Playwright MCP가 필수인 구조가 아니며 사용자가 브라우저를 미리 열 필요도 없다.
- `runtime.py` → `browser_manager.py` 분리를 논의했으나 **지금은 별도 관리 파일을 만들지 않고 login_agent.py에서 브라우저 수명까지 관리**하기로 했다.
- 엔진이 로그인 에이전트로 로그인된 `Page`를 얻고, 같은 `Page`를 고정 조회 코드가 사용한다. 조회가 끝난 뒤 브라우저가 종료되어야 한다. `async with login_agent.authenticated_page(...) as page:`는 설명용 구상이며 아직 실제 API가 아니다.
- 로그인 완료는 AI의 선언이 아니라 사이트별 코드로 검증한다. 주소·허용 호스트·성공 판정·인증정보 입력·캡차 제출 규칙은 사이트별로 제공한다.
- 제품의 공통 코드가 실험용 `browser_bot_test`나 루트 `naver_probe.py`를 import하지 않도록 한다. 서비스용 Playwright·AI HTTP 처리는 비동기로 작성하고 `input()`으로 요청을 막지 않는다.

### 완료된 작업

- [x] `app/login_bot/` 파일 생성. **schemas.py와 session.py는 구현 완료**, `__init__.py`, `model_client.py`, `login_agent.py`는 아직 0바이트다.
- [x] Pydantic 불변 스키마 3개 구현·검증·보안 검토·최종 코드 리뷰 완료. 사용자에게 완료 보고했다.
- [x] `SessionStore` 구현·테스트·보안 검토·최종 코드 리뷰 완료. 사용자에게 완료 보고했다.
- [x] 독립 AI 브라우저 실험에서 비밀번호 수정 후 캡차 확인·재로그인·서치어드바이저 콘솔·대상 사이트 진입에 성공했다. 제품 공통 로그인 에이전트 구현 완료를 뜻하지 않는다.

### 스키마 — app/login_bot/schemas.py

| 타입 | 필드 |
| --- | --- |
| `LoginPolicy` | `start_url`, `allowed_hosts: tuple[str, ...]`, `goal`, `max_steps=25`, `max_login_attempts=3`, `timeout_seconds=180.0` |
| `LoginResult` | `status: authenticated/requires_user/failed`, `reason`, `steps=0`, `login_attempts=0` |
| `SessionKey` | `site`, `account_id` |

- 세 모델 모두 `frozen=True`, `extra='forbid'`, `hide_input_in_errors=True`다.
- 정책은 기본 포트 HTTPS·인증정보 없는 시작 주소, 정확한 호스트 목록, 시작 호스트의 허용 목록 포함, 비공백 목표, 유한한 양수 시간과 양수 횟수를 검증한다.
- `goal`은 프롬프트의 일부이며 로그인 성공 판정 함수와 다르다. 인증정보 입력 함수·성공 판정 함수는 후속 사이트별 인터페이스로 전달한다.
- `SessionKey.site`는 DB 사이트 UUID가 아니라 `naver` 같은 로그인 서비스 식별자다. `account_id`는 로그인 ID·비밀번호 대신 계정별 내부 식별자다. 두 필드 모두 ASCII 영숫자·하이픈·밑줄, 최대 64자로 제한한다.
- `LoginResult.reason`은 안전한 사유를 받는 계약이며 스키마 자체가 비밀값을 자동 마스킹하지는 않는다. AI 동작 스키마는 아직 제품 코드에 추가하지 않았다.

### 세션 저장소 — app/login_bot/session.py

- `SessionStore(root_dir=...)`는 불변 dataclass이며 기본 저장 위치는 프로젝트의 `.secrets/browser_sessions/{site}/{account_id}.json`이다.
- `load(key) -> StorageState | None`: 파일이 없으면 None, 손상·접근 오류는 예외로 구분한다.
- `save(key, state) -> None`: 최소 cookies/origins 목록 구조를 검증하고 추가 필드(IndexedDB 등)는 보존한다. 같은 폴더의 임시 파일을 쓴 뒤 원자적으로 교체한다.
- `delete(key) -> None`: 해당 계정 파일만 삭제하며 파일이 없어도 정상 종료한다.
- `SessionStoreError.code`는 `unsafe_path`, `invalid_state`, `io`다. 인증값이나 원본 JSON·OS 예외를 메시지에 넣지 않는다.
- 전용 폴더는 0700, 파일은 0600. 심볼릭 링크·하드 링크·일반 파일이 아닌 경로를 거부하고 읽을 때 `O_NOFOLLOW`를 사용한다. 저장 실패 시 기존 파일을 유지하고 임시 파일을 정리한다.
- 리뷰에서 단독 유니코드 서로게이트 저장 문제를 발견해 `ensure_ascii=True`로 보존하도록 수정하고 회귀 테스트를 추가했다.
- **인증 상태 보관만 담당**한다. JSON으로 저장해도 세션의 유효기간은 연장되지 않는다. 서버 측 로그인 유효성은 후속 로그인 에이전트가 확인해야 한다.
- 현재 파일 I/O는 동기식이다. 비동기 에이전트에 연결할 때 필요하면 `asyncio.to_thread`로 호출한다. 동일 계정의 동시 로그인·저장은 호출자가 조정한다. 저장소 상위 디렉터리는 신뢰하는 로컬 프로세스가 관리하는 전제이며 다중 프로세스 잠금은 아직 없다.
- 실제 로그인 브라우저에서 추출한 상태를 이 새 저장소로 저장·복원하는 통합은 아직 구현하지 않았다.

### 실제 네이버 실험의 최종 결과

- 대상은 공개 사이트 `https://otteru.vercel.app/`. 학교 게이트웨이는 `https://factchat-cloud.mindlogic.ai/v1/gateway`, 키 변수명은 `KONKUK_AI_API_KEY`. 키·ID·비밀번호 값은 문서에 적지 않는다.
- 사용자 지정 `kupi/src/generate.ts`에서 호출 방식을 확인했다. 실험 기본 모델은 `deepseek-v4.1-flash`, Chat Completions를 사용한다. `--model kimi-k3` 등을 지원하고 GPT는 Responses를 사용한다.
- 캡차 전용 화면에는 ID/PW 칸이 없고 `input#captcha`와 `확인` 버튼이 있다. 프롬프트가 캡차 뒤 `login`을 다시 호출하던 버그를 `확인` click으로 수정했다. 폼 목적지는 `/nidlogin.rcaptcha`다.
- 캡차 확인 뒤 네이버가 로그인 화면으로 돌려보내며 “다시 로그인해 주세요.”를 표시하는 흐름을 실제 확인했다. 이후 계정 오류는 사용자가 잘못된 비밀번호를 확인하고 수정한 뒤 해소됐다. 이전 추측만으로 봇 차단·캡차 오답을 단정하지 않는다.
- 최신 성공 실험은 18단계, 콘솔 접속 확인, 대상 사이트 선택, 마지막 동작 `done`이었다. 최종 모델 보고는 “수집 정보가 없습니다”, 노출/클릭·사이트 진단 정보 없음이었다. **색인 수 0이나 미색인 확정으로 해석하지 않는다.**
- 모델이 요약·수집 현황 사이를 반복 이동하기도 해 제품에서는 로그인만 AI로, 이후 조회는 고정 Playwright 코드로 구현하기로 했다.
- 로컬 `.secrets/browser_bot_test/trace.json`, `result.json`은 최신 실행으로 덮어쓰는 민감 자료다. 커밋하지 않는다. 공개 도메인 일부가 로그인 ID와 겹쳐 `[REDACTED]`로 보일 수 있다.
- 사용자가 실험 중단을 요청한 이후 실제 네이버 접속·유료 AI 호출은 다시 하지 않았다. 이번 인계에서도 실행하지 않았다. 새 SessionStore와 실제 로그인봇은 아직 연결되지 않았다.

### 검증 상태

- `schemas.py`: 정상 생성·기본값·잘못된 입력·불변성 **17개 검사 통과**, 최종 코드 리뷰 발견 사항 없음. 전용 pytest 파일은 아직 없다.
- 새 `tests/test_browser_session.py`는 **25개 통과**. 기존 `test_naver_probe.py` 비브라우저 6개와 합쳐 최근 실행은 **31 passed, 2 deselected**다.
- 실행 명령: `/private/tmp/webmaster-browser-test-venv/bin/python -m pytest tests/test_browser_session.py tests/test_naver_probe.py -q -k 'not login_button'`. 제외된 2개는 기존 실제 Chromium 버튼 테스트다.
- 독립 `browser_bot_test/test_agent.py`는 마지막 코드 변경 후 **28 passed**였다. 기본 pytest testpaths 밖이므로 별도로 경로를 지정해야 한다. 이번 인계에서 재실행한 수치가 아니다.
- 프로젝트 전체·PostgreSQL 통합 테스트는 이번 공통 browser 작업에서 다시 실행하지 않았다. 과거 전체 284 passed 등의 수치를 현재 전체 검증으로 해석하지 않는다.
- `git diff --check`는 수정한 코드·테스트 범위에서 통과했다. 이번 인계에서는 문서만 갱신하며 테스트를 다시 돌리지 않았다.

### 다음에 할 일

1. 사용자가 구현 재개를 요청하면 `model_client.py`의 입력·출력·설정 방식을 간결하게 설명하고 다음 범위를 정한다. 스키마와 세션 저장소를 미완료로 되돌아가 재작성할 필요가 없다.
2. 비동기 AI 클라이언트를 구현한다. 학교 API 주소·모델·키는 설정에서 읽으며 네이버 로그인 선택자나 인증정보를 하드코딩하지 않는다.
3. 공통 `login_agent.py`를 구현한다. 브라우저 수명, 저장 상태 복원, 실제 로그인 유효성 확인, 필요 시 AI 실행, 성공 후 저장, 같은 Page 제공을 연결한다. 직접 인증이 필요하면 requires_user 결과를 반환한다.
4. 네이버 어댑터로 성공 판정·로컬 인증정보 입력·캡차 선택자를 제공해 첫 로그인과 다음 실행의 세션 재사용을 검증한다. 성공 선언만 믿거나 CAPTCHA와 일반 로그인을 혼동하지 않는다.
5. 네이버 엔진의 고정 색인 현황 조회·서비스·DB/API 연결은 별도 단계로 진행한다. `app/engines/naver.py`는 현재 IndexNowClient 주입 구조만 있고 `app/services/index_status.py`는 빈 파일이다.

### 커밋 범위 — 사용자 최종 승인

기준 커밋은 **78819fa — [feat] Bing 등록 및 URL 수집 상태 조회 구현**이며, 현재 브랜치는 **codex/browser-login-foundation**이다. 아래 표는 처음 제안한 분할 계획이고, 최종적으로 **1·4·5번만 한 커밋으로 묶어 push**한다. 2·3번은 로컬에 남긴다. 커밋 메시지는 `[feat] 공통 브라우저 로그인 스키마와 인증 상태 저장소 구현`을 사용한다.

| 순서 | 커밋 메시지 제안 | 포함 파일 |
| --- | --- | --- |
| 1 | `[chore] 브라우저 자동화를 위한 Playwright 의존성 추가` | `pyproject.toml`, `uv.lock` |
| 2 | `[feat] 네이버 로그인과 인증 상태 검증 도구 추가` | `naver_probe.py`, `tests/test_naver_probe.py` |
| 3 | `[test] AI 브라우저 탐색 실험과 검증 기록 추가` | `browser_bot_test/`의 소스·테스트·문서·`.env.example` |
| 4 | `[feat] 공통 로그인 스키마와 인증 상태 저장소 구현` | `app/login_bot/` 5개 파일, `tests/test_browser_session.py` |
| 5 | `[docs] 브라우저 로그인 작업 인계 문서 갱신` | `docs/HANDOFF.md` |

- 3번 실험은 루트 `naver_probe.py`를 사용하므로 2번 뒤에 둔다. 4번은 Playwright 타입을 사용하므로 1번에 의존한다. 빈 login_agent/model_client 파일은 사용자가 요청한 구조이며 구현 완료로 설명하지 않는다.
- 이전에 사용자가 네이버 엔진 초안을 커밋하지 않도록 요청한 기록을 보존한다. **`app/engines/naver.py`, 빈 `app/engines/brave.py`, 빈 `app/services/index_status.py`, 로컬 ERD 자료 `outputs/db-erd-prompt.txt`, `outputs/startpress-db-erd.png`는 이 계획에서 제외**한다.
- `.env`, `.secrets/`, 인증 JSON·토큰·쿠키, 임시 환경, 캐시는 제외한다. `git add .`로 일괄 스테이징하지 않는다.
- 실제 커밋 전에 변경 범위·비밀값 포함 여부·필요 검증을 확인한다. 프로젝트 규칙대로 한국어 `[타입] 제목`, Git에 설정된 작성자 유지, **Co-Authored-By 트레일러 없음**. main/master 직접 push 금지.
- 최종 승인 범위는 의존성 2개 파일, app/login_bot/ 5개 파일, tests/test_browser_session.py, docs/HANDOFF.md다. 새 테스트 실행은 생략하며 위 테스트 수치는 이전 실행 결과다. 최종 커밋·원격 상태는 `git log -1`과 브랜치 upstream으로 확인한다.

### 관련 파일·환경

- `app/login_bot/schemas.py`: 공통 정책·결과·세션 키. `app/login_bot/session.py`: 인증 상태 파일 저장소.
- `tests/test_browser_session.py`: 저장·읽기·삭제·오류·파일 권한·계정 분리·서로게이트 보존 검증.
- `app/login_bot/model_client.py`, `login_agent.py`: 다음 구현 대상, 현재 빈 파일.
- `browser_bot_test/agent.py`, `README.md`, `INVESTIGATION.md`, `test_agent.py`: 동기식 독립 실험 자료. 성공 후 최신 결론은 이 절이 우선한다.
- `naver_probe.py`, `tests/test_naver_probe.py`: 기존 네이버 로그인·비공개 파일 검증 참고 자료.
- `pyproject.toml`, `uv.lock`: Playwright 의존성이 포함된 미커밋 변경.
- 검증용 임시 환경은 `/private/tmp/webmaster-browser-test-venv/`다. 다음 세션에 남아 있다고 보장하지 않는다. 프로젝트 영구 환경으로 합의한 것이 아니며 기존 Miniconda 안내는 하단과 `docs/environment.md`를 참고한다.
- 기존 미커밋 작업은 보존한다. 최종 승인한 파일만 명시적으로 스테이징·커밋·push하고, 네이버 probe·AI 실험·엔진 초안·ERD 자료는 로컬에 남긴다.

## 과거 세션 인계 요약 — 서비스 정리·발행 알림 / 2026-10-28

이 절은 2026-10-28 당시 기록이다. 최신 브라우저 작업·브랜치·검증 상태는 최상단의 2026-10-29 요약을 따른다. Google의 구현·보류 요청과 기존 실사용 검증 기록은 보존한다.

### 완료된 작업과 커밋

- [x] `bf1ae01` — `[refactor] IndexNow 설정 저장을 사이트 서비스로 통합`
  - `services/engine_registration.py`의 `create_indexnow_registrations()`를 `services/site.py`의 내부 함수 `_save_indexnow_settings()`로 이동하고 기존 서비스 파일을 삭제했다.
  - 이 함수는 메인 사이트에 사용할 Naver·Bing 키 설정 행을 저장한다. 새 글 등록이나 외부 IndexNow 제출 함수가 아니다.
  - `create_site()`의 같은 세션·트랜잭션에서 두 행을 저장하며, 오류 시 사이트까지 롤백하는 동작을 유지했다. 통합 테스트의 오류 주입 위치도 변경했다.
  - `models/engine_registration.py`는 유지했다. `EngineRegistration` / `engine_registrations`와 이름이 일관되고 엔진별 등록·소유 확인 상태와 설정을 나타내므로 모델까지 합치거나 이름을 변경하지 않는다. DB 구조 변경·마이그레이션은 없다.
- [x] `d43823e` — `[feat] 공통 IndexNow 발행 알림 서비스 구현`
  - `services/publication.py`에 `async notify_published_urls(request: IndexNowRequest, *, client: IndexNowClient) -> IndexNowResult` 구현.
  - 기존 클라이언트의 `submit(request)`를 한 번 await하고 결과·통신 예외를 그대로 전달한다. 검증·URL 중복 제거는 기존 요청 스키마를 재사용한다.
  - 클라이언트 생성·종료는 호출자가 담당한다. 자동 재시도나 Naver·Bing별 중복 전송은 하지 않는다.
  - **현재는 검증된 요청을 전송하는 진입점만 구현했다. 새 글 DB 저장, 부모 설정 조회, API·화면 연결, 제출 결과 DB 저장은 아직 없다.**
- [x] `NaverEngine` 불변 구조를 `app/engines/naver.py`에 작성했으나, 사용자가 Naver를 커밋하지 말라고 요청하여 미추적 상태로 남겼다. `IndexNowClient`를 주입받는 구조만 있고 알림 메서드는 없다.
- [x] `app/services/index_status.py`를 빈 파일로 생성했다. 이 파일도 커밋하지 않았다.

### 합의한 서비스 역할

| 파일 | 최종적으로 담당할 업무 | 현재 구현 범위 |
| --- | --- | --- |
| `client.py` | 고객사 관리 | 생성·목록 조회 |
| `site.py` | 메인 사이트 저장·검색엔진 등록·소유 확인 | 사이트 생성·목록과 IndexNow 설정 저장. 실제 엔진 등록 연결은 후속 |
| `publication.py` | 개별 글 저장·발행 알림 | 검증된 요청으로 공통 IndexNow 알림만 구현 |
| `index_status.py` | 상태 조회·결과 저장 | 빈 파일 |

- 호출 방향은 API → 서비스 → 엔진/클라이언트다. 엔진이 서비스를 호출하지 않는다.
- 발행 알림은 NaverEngine·BingEngine을 거치지 않고 공통 IndexNowClient로 한 번 전송한다. 사이트 등록·조회 등 엔진 전용 기능은 해당 엔진이 담당한다.
- DB 저장과 외부 요청은 하나의 DB 트랜잭션으로 함께 롤백할 수 없다. 후속 연결 시 글 저장 후 제출 오류를 처리하는 계약을 먼저 정한다.
- 사용자는 학습을 위해 기능을 단계별로 설명하고 진행하는 방식을 선호한다. Naver 1번·3번은 이번 세션에서 구현하지 않았으며 브라우저 자동화도 시작하지 않았다.

### 검증 결과

- 서비스 통합: `test_site_service.py`·`test_sites_api.py` PostgreSQL 통합 **32 passed**, `test_site_schemas.py`·`test_admin_page.py` **39 passed**. 관련 범위 합계 71개이며 전체 테스트 수가 아니다.
- 발행 알림: `test_publication_service.py`·`test_indexnow_client.py`·`test_indexnow_schemas.py` **72 passed**. 공통 엔드포인트의 단일 전송, 중복 URL 제거, 200·202·429·500 응답, 통신 오류 시 재시도 없음·예외 전파와 클라이언트 수명을 검증했다.
- 각 변경의 코드 리뷰 발견 사항 없음. `git diff --check` 통과. 이번 세션에 실제 외부 IndexNow 제출은 하지 않았다.
- 로컬 Docker Desktop과 기존 PostgreSQL 컨테이너를 시작해 검증했다. 통합 테스트는 전용 임시 DB를 생성·삭제했고 개발 데이터는 변경하지 않았다. 관리 웹 서버 실행 여부는 이번 세션에서 확인하지 않았다.

### 다음 작업과 보존 사항

1. 사용자의 다음 단계 요청에 맞춰 개별 글 입력 스키마·DB 저장, 부모 메인 사이트 설정 조회와 발행 알림 연결을 구현한다. 부모 확인·호스트/경로 검증·키 누락 및 Naver/Bing 설정 불일치는 전송 전에 처리한다.
2. 제출 결과의 저장 의미·실패 처리·재시도 계약을 정한 뒤 API와 화면을 연결한다. IndexNow 접수를 엔진별 수집·색인 완료로 저장하지 않는다.
3. 기존 사이트의 키 설정 추가·변경, Google·Bing 등록 및 상태 조회 서비스 연결, 워커·예약은 여전히 후속 작업이다. Google 신규 사이트 전체 실사용 검증의 보류 요청은 유지한다.
- 현재 브랜치 `codex/publication-service`, HEAD `d43823e`. 이번 작업은 `main`의 `3198962`에서 분기했고, 요청받은 위 두 커밋만 생성했다. 원격 push는 하지 않았다.
- 미추적 보존 대상: `app/engines/naver.py`, `bing.py`, `brave.py`, `app/services/index_status.py`, `tests/test_bing_engine.py`, `outputs/db-erd-prompt.txt`, `outputs/startpress-db-erd.png`. Bing 작업·테스트는 다른 작업 내용이므로 임의 수정·일괄 커밋하지 않는다.
- 이번 인계 문서 갱신은 아직 커밋하지 않았다. 추가 커밋·push는 별도 요청 범위에 따른다.

## 과거 세션 인계 요약 — IndexNow / 2026-10-27

아래는 2026-10-27 당시 기록이다. 현재 서비스 파일 위치·브랜치·진행 상황은 최상단의 2026-10-28 요약을 따른다.

### 완료된 작업

- [x] `app/engines/indexnow/schemas.py`: Pydantic 불변 요청·응답, 공통 `IndexNowKey`·`IndexNowUrl`, 키 형식·호스트·적용 경로·URL 개수 검사, 중복 제거. 별도 types.py·validation.py는 schemas.py로 통합했다.
- [x] `client.py`: 외부에서 주입받은 httpx.AsyncClient로 공통 엔드포인트에 POST. urls→urlList, key_location→keyLocation 변환. 연결 10초, 읽기·쓰기·풀 대기 각각 30초. 리다이렉트·자체 재시도 없음. 200 접수 성공, 202 키 확인 중, 다른 HTTP 응답 실패. 타임아웃·통신 오류는 별도 예외이며 접수 여부를 단정하지 않는다.
- [x] Alembic `0002`로 engine_registrations에 nullable TEXT `indexnow_key`, `indexnow_key_location` 추가. 로컬 개발 DB 적용, 기존 데이터 보존·모델 일치 확인.
- [x] 사이트 폼·SiteCreate에 선택 키 설정 추가. 둘 다 생략 가능, 입력 시 두 값 필수. sites 저장값에서 두 필드를 제외하고 `services/engine_registration.py`에서 Naver·Bing 행을 생성한다. 같은 세션·트랜잭션을 사용하고 엔진 설정 실패 시 사이트도 롤백한다. 등록 상태는 unknown이며 실제 소유 확인을 의미하지 않는다.
- [x] PostgreSQL 통합 포함 전체 테스트 **284 passed**, JavaScript 구문 검사·git diff --check 통과. DB 없는 테스트는 **230 passed, 54 deselected**. 서로 다른 테스트 범위의 수치를 합산하지 않는다.
- [x] Notion의 DB 컬럼 표·설정 운영 규칙·사용자 입력 항목을 갱신했다. ‘개인용’ 연결을 사용하며 문서 주소는 아래 요구사항 원문을 따른다.

### 실제 Vercel 블로그 검증 및 남아 있는 데이터

- 대상: `https://otteru.vercel.app/`. 별도 블로그 저장소는 `/Users/kim-yudam/Desktop/study/sideProject/nextjs-notion-starter-kit`이다.
- 기존 `public/e142bcd0c702707f9db3194cd5ee9dd0.txt`를 재사용했다. 운영 파일 HTTP 200, UTF-8 텍스트·키 일치·로컬 파일과 일치를 확인했다. 새 파일 배포나 새 키 생성은 하지 않았다.
- **2026-10-27 19:09 KST** 테스트 실행에서 실제 앱의 POST /clients·POST /sites를 ASGITransport로 호출했다. 사이트 API 201 후 별도 DB 세션으로 Naver·Bing 설정을 재조회하고 기존 IndexNowClient로 메인 URL을 공통 엔드포인트에 **한 번 제출해 HTTP 200·accepted**를 확인했다.
- 개발 DB에는 고객사 **김유담 개인 블로그 테스트**, 사이트 **유담 블로그**가 남아 있다. 사용자의 실제 테스트 요청으로 생성한 데이터이므로 임의로 삭제·중복 생성하지 않는다.
- client_id: `a6eb3bdc-215f-48a5-b2b3-eab3b51af806`, site_id: `7d337e4c-bbd1-4172-8b4c-58fe77312943`.
- Naver·Bing registration_status는 unknown으로 유지했다. site_engine_statuses에 제출 결과를 저장하지 않았다. 실제 테스트 결과는 `outputs/indexnow-live-test-2026-10-27.json`에 있으며 키·토큰 값은 포함하지 않는다.
- 이 실험은 테스트용 실행으로 DB 조회와 외부 제출을 연결했다. **DB 설정 조회→제출 전용 제품 서비스·API·화면 버튼이 구현된 것은 아니다.** 실제 색인 완료나 Naver/Bing 각각의 수집 완료를 확인한 것도 아니다.

### 진행 중인 작업과 다음 구현 순서

1. 사용자가 제시한 네 커밋 구성을 승인해 `codex/indexnow-integration` 브랜치에서 실행했다. 아래 커밋 기록을 확인한다. 원격 push는 요청하지 않았고 실행하지 않았다.
2. 기존 사이트의 IndexNow 설정 추가·변경 API·화면. 두 엔진 설정은 하나의 트랜잭션에서 함께 갱신하고 이미 확인된 등록 상태를 unknown으로 되돌리지 않는다.
3. 사이트 ID로 DB의 URL·두 엔진 설정을 읽는 제출 서비스와 POST /sites/{site_id}/indexnow 같은 API·화면 버튼. 키 누락·설정 불일치는 전송 전에 차단한다. 같은 이벤트를 엔진별로 중복 제출하지 않는다.
4. 제출 결과의 저장 의미·오류 처리 계약을 먼저 정한다. 작업 재시도·관측 이력이 없는 현재 테이블만으로 정확히 한 번 실행이나 엔진별 색인 완료를 보장하지 않는다.
5. 실제 키 파일 설치 확인을 제품화할 때는 대상 URL·리다이렉트·DNS/IP 검증과 SSRF 방어를 별도 구현한다. 현재 등록 스키마는 형식·호스트·경로만 검사하며 외부 URL을 요청하지 않는다.
6. 개별 글 등록과 부모 설정 조회, Google 등록·검사 결과의 DB 연동, 워커·예약·이력은 별도 후속 작업이다. Google 절의 보류 요청을 유지한다.

### 승인한 커밋 구성과 실행 기록

1. `646155b` — `[feat] IndexNow 공통 제출 클라이언트와 스키마 구현`: app/engines/indexnow/, tests/test_indexnow_client.py, tests/test_indexnow_schemas.py, pyproject.toml, uv.lock.
2. `cf256d7` — `[feat] 검색엔진 등록 정보에 IndexNow 설정 컬럼 추가`: app/models/engine_registration.py, migrations/versions/0002_add_indexnow_settings.py, tests/integration/test_database_schema.py.
3. `383965f` — `[feat] 사이트 등록 시 IndexNow 설정 함께 저장`: app/schemas/site.py, app/services/site.py, app/services/engine_registration.py, app/static/index.html, app/static/admin.js, tests/test_site_schemas.py, tests/integration/test_site_service.py, tests/integration/test_sites_api.py, docs/site-admin.md.
4. `[docs] IndexNow 실사용 검증 결과와 작업 인계 갱신`: docs/HANDOFF.md, outputs/indexnow-live-test-2026-10-27.json. 이 인계 파일을 담은 문서 커밋이며 SHA는 git log에서 확인한다. 다른 세션의 진행 기록도 보존했다.

- 현재 작업 브랜치는 `codex/indexnow-integration`이다. 기존 main의 `1765f5b`에서 분기했으며 원격 push는 하지 않았다.
- 제외: 빈 app/engines/naver.py·bing.py·brave.py, 로컬 ERD 이미지·프롬프트, .env·.secrets/·캐시. 전체 git add를 사용하지 않고 파일별로 선별한다.
- 커밋 메시지는 한국어 `[타입] 제목`, Git 작성자 유지, 공동 작성자 트레일러 없음. main/master 직접 push 금지.

## 사이트 등록과 IndexNow 설정 저장 연결 — 2026-10-27

- 등록 화면과 `SiteCreate`에 선택 입력 `indexnow_key`, `indexnow_key_location`을 추가했다. 둘 다 생략할 수 있지만 설정 시에는 함께 입력하며 기존 IndexNow 스키마로 형식·호스트·경로를 검사한다.
- `services/engine_registration.py`의 `create_indexnow_registrations()`를 사이트 서비스에서 같은 DB 세션으로 호출한다. 키 설정이 있을 때만 Naver·Bing 행을 생성하고 `registration_status=unknown`으로 저장한다.
- `site.py`가 전체 트랜잭션을 관리하며 새 서비스는 별도로 커밋하지 않는다. 엔진 저장 오류 시 사이트와 설정이 함께 롤백된다. 사이트 응답·목록에는 키를 반환하지 않는다.
- 외부 키 파일 접근 확인·실제 엔진 등록·IndexNow 제출·기존 사이트의 키 설정 변경은 아직 연결하지 않았다. 아래 과거 기록의 ‘설정 저장 API 미구현’보다 이 상태가 최신이다.
- PostgreSQL 통합을 포함한 전체 테스트 284개 통과. 화면 확인 단계에서는 실제 개발 데이터를 추가하지 않았다. 이후 실사용 테스트에서 추가한 고객사·사이트는 최상단 기록을 따른다.

## IndexNow DB 구조 업데이트 — 2026-10-27

- `engine_registrations`에 `indexnow_key`, `indexnow_key_location` nullable TEXT 컬럼을 추가했다. 별도 테이블이나 sites 컬럼은 추가하지 않았다.
- 로컬 PostgreSQL에 Alembic `0002`를 적용했고 기존 네 테이블의 데이터 보존과 모델 일치를 확인했다. 아래 과거의 `0001(head)` 기록보다 이 상태가 최신이다.
- Naver·Bing 행에는 같은 설정을 저장하고 Google·Brave는 NULL을 사용한다. 개별 글은 부모 사이트의 등록 정보를 조회하고 host는 사이트 URL에서 추출한다.
- 두 엔진의 키 동시 갱신은 이후 서비스에서 하나의 트랜잭션으로 구현해야 한다. 초기 DB 변경 당시에는 모델·마이그레이션만 추가했으며, 이후 POST /sites의 설정 저장 연결까지 완료했다. 키 생성·배포 API는 아직 없다.
- PostgreSQL 스키마 통합 테스트 16개 통과. Notion의 engine_registrations 컬럼 표와 운영 규칙도 갱신했다.

## Google 엔진 진행·추후 할 일 — 2026-10-27

이 절은 Google 엔진에 관한 아래 과거의 미구현·빈 파일 기록보다 우선한다. DB·관리 화면 작업은 별도 세션에서 진행하며 해당 파일을 덮어쓰지 않는다.

- `app/engines/google/google_auth.py`: 저장된 OAuth 토큰 로드·권한 확인·만료 시 갱신·비공개 파일 저장을 구현했다.
- `app/engines/google/google.py`: `get_site()`, `register_site()`, `get_verification_token()`, `verify_ownership()`, `submit_sitemap()`과 이를 묶는 `register_new_site()`를 구현했다. 대표 메서드는 인증 파일 설치가 필요하면 `verification_required`와 파일 정보를 반환하며, 설치 후 `verification_ready=True`로 재호출한다. 기존 소유자는 사이트맵 제출로 진행한다. `completed`는 등록·소유 확인·사이트맵 접수 완료이며 색인 완료가 아니다.
- 현재 전체 등록 흐름은 HTTP·HTTPS URL-prefix 속성과 FILE 인증을 지원한다. `sc-domain:` 속성의 DNS 인증은 지원 범위 밖이다.
- Notion의 Google 요구사항 1번과 대조했다. Google 인증·엔진·기존 검증 도구 관련 테스트 **86개 통과**. 이 수치는 프로젝트 전체 테스트 개수가 아니다.
- 실제 `https://otteru.vercel.app/`에서 OAuth 유효·`siteOwner`·대표 메서드 `completed`·사이트맵 제출 성공을 확인했다. `?lang=ko`는 이번 사이트 속성에서 제외했다. 최종 읽기 검수에서 사이트맵 `isPending=false`, 오류 0·경고 0·다운로드 기록을 확인했고, 인증 파일 발급 및 배포 파일 HTTP 200·내용 일치도 확인했다. 미등록 테스트 경로의 속성 조회는 `None`이었다. 이 결과는 각 호출 당시 관측이다.

### 추후 할 일 — 사용자 요청으로 보류

- [ ] **새로운 테스트 사이트에서 요구사항 1번 전체 실사용 검증**: 미등록 조회 → Search Console 등록 → 인증 파일 발급 → 프론트 설치 안내 → 사람이 실제 배포 → 설치 완료 후 재호출 → 소유 확인·권한 재확인 → 사이트맵 제출 → DB 상태 저장까지 확인한다. 이번 사이트는 이미 소유자였으므로 신규 등록·설치 후 재개 전체 경로는 현재 어댑터의 모의 테스트로 검증했다. 과거 0단계 API 실험과 현재 제품 코드의 전체 검증을 구분한다. 검증을 위해 기존 운영 사이트의 등록·소유권·인증 파일을 삭제하지 않는다.
- [ ] Google 엔진을 FastAPI 서비스·등록 상태 DB 저장·프론트 인증 파일 설치 안내와 연결한다. 엔진은 DB 저장·메일 발송을 담당하지 않는다.

### 다음 설계 대상

- Google 요구사항 **2. 새로운 블로그 글 발행 알림**은 별도 메서드 구현을 보류하고 3번부터 진행했다. 사이트 자체의 사이트맵 자동 갱신을 먼저 확인해야 한다. 사이트맵을 매 글마다 재제출하거나 Search Console GUI로 개별 색인 요청을 해야 하는 것은 아니다. 일반 블로그용 Indexing API·Search Console 브라우저 자동화는 구현하지 않는 기존 공식 API 중심 방향을 유지한다.

### Google 3번 상태 조회 구현 — 2026-10-27

- `GoogleEngine.inspect_url(site_url, page_url)` 구현. 현재는 HTTP·HTTPS URL-prefix 속성 안의 메인페이지·글을 지원하며 정확한 URL과 쿼리를 유지한다. Google에 기록된 상태를 조회하고 크롤링·색인 요청은 실행하지 않는다. DB 저장·스케줄러·FastAPI 연결은 아직 없다.
- `GoogleUrlInspection`에 관측 시각(UTC), 색인 상태, 원본 verdict·coverageState, 마지막 크롤링 시각, 수집·robots·noindex 상태, Google·사용자 canonical, 검사 화면 링크를 반환한다. PASS는 indexed, FAIL·NEUTRAL은 not_indexed, 판정 미지정 상태에서 크롤링 시각이 있으면 crawled, 그 외는 unknown이다. API 오류는 예외로 반환하며 not_indexed로 바꾸지 않는다. 수집 대기 여부는 제출 이력과 서비스에서 결합해야 하며 크롤링 시각 누락만으로 단정하지 않는다.
- Google 인증·엔진·기존 검증 도구 테스트 **121개 통과**. 조회 범위·응답 누락·미색인 판정·오류·호출 제한·타임아웃을 검증했다.
- 실제 조회: **2026-10-27 18:16 KST**. `https://otteru.vercel.app/`는 PASS·indexed·Google canonical이 동일하며 마지막 크롤링은 **2026-10-25 15:37:52 KST**였다. `https://otteru.vercel.app/?lang=ko`는 NEUTRAL·not_indexed·‘Google에는 아직 알려지지 않은 URL입니다.’·마지막 크롤링 시각 없음이었다. 두 결과는 각 URL의 당시 관측으로 전체 게시물 상태나 실시간 상태를 뜻하지 않는다.

## 최신 추가 진행 — 2026-10-27

- 메인 사이트 등록 **스키마·서비스·라우터·DB 검증 완료**. 사이트 API는 `139af94`, 프론트 화면은 `58f4514`로 로컬 main에 별도 커밋했다. 원격 푸시는 하지 않았다. 아래 2026-10-26 기록의 미구현·다음 단계 설명보다 이 기록을 우선한다.
- `app/services/site.py`: `create_site()`는 하나의 트랜잭션에서 고객사 존재를 확인하고 `target_type="site"`, `parent_site_id=None`으로 저장한다. 고객사 조회 시 키 공유 잠금으로 저장 전 삭제를 방지한다.
- 없는 고객사는 `SiteClientNotFoundError`, 동일 고객사·정규화 URL 중복은 `DuplicateSiteError`로 구분한다. `uq_sites_client_url` 대상 `ON CONFLICT DO NOTHING`으로 동시 중복도 처리하며, 다른 DB 오류는 숨기지 않는다.
- `list_sites()`는 필수 `client_id`와 `target_type="site"`로 필터링하고 생성 시각·ID 정렬, limit·offset을 지원한다. 대상 고객사의 메인 사이트가 없으면 빈 튜플이다.
- `tests/integration/test_site_service.py`에 저장·서버 지정값·true/false/null·롤백·고객사 분리·글 제외·페이지 분할·동시 등록 검증 7개를 추가했다. 사이트 서비스 구현 당시 임시 PostgreSQL DB 검증을 통과했다. 최종 커밋 기준 수치는 아래 81개·82개 기록을 따른다.
- 실행: `RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider`. 직접 Python 실행 시에도 사용자 전역 패키지 충돌을 막기 위해 `PYTHONNOUSERSITE=1`을 지정한다.
- 검증을 위해 Docker Desktop과 기존 PostgreSQL 컨테이너를 시작했다. 테스트는 별도 임시 DB만 생성·삭제하며 개발 DB 데이터는 변경하지 않았다.
- `app/api/sites.py`를 `app/main.py`에 연결했다. `POST /sites`는 등록 성공 시 201, 고객사 없음은 404, 동일 고객사·URL 중복은 409를 반환한다. `GET /sites`는 UUID `client_id` 필수, limit 1~100(기본 100), offset 0 이상(기본 0)이다. 없는 고객사의 목록은 200과 빈 items다.
- `tests/integration/test_sites_api.py`에서 실제 앱에 임시 DB 세션을 주입해 등록 후 별도 연결의 DB 저장, 201·404·409·422, 고객사 분리, 글 제외, 페이지 분할, 빈 목록, OpenAPI·`/docs`를 검증했다. 사이트 API 커밋 `139af94`의 스테이징 스냅샷을 별도 임시 디렉터리에 내보내 **81개 테스트 통과**를 확인했다. 프론트·다른 세션의 미추적 엔진 파일 없이 독립 검증했다.
- **프론트 화면 구현 완료**: `/`에서 `app/static/index.html`을 제공하며 CSS·JS는 `/static/`으로 제공한다. 프레임워크 추가 없이 기존 FastAPI API를 동일 출처에서 호출한다. 고객사 추가 대화상자, 고객사 선택, 6개 필드 사이트 등록, 고객사별 메인 사이트 목록·페이지 조회, 필드별 오류·성공 안내를 지원한다. 고객사 목록은 API 페이지를 모두 읽어 선택지로 제공한다.
- 브라우저에서 별도 임시 DB로 고객사 추가→자동 선택, 사이트 등록→목록 갱신, 빈 입력·중복 오류, 390px 모바일 배치를 검증했다. 미리보기용 예시 데이터는 개발 DB에 넣지 않았다. 프론트 커밋 `58f4514`의 스테이징 스냅샷을 별도 임시 디렉터리에 내보내 **82개 테스트 통과**, JS 구문 검사 통과를 확인했다. 이 수치는 다른 세션의 미추적 엔진 테스트를 포함한 현재 작업 트리 전체 수치가 아니다. 관련 안내는 `docs/site-admin.md`에 기록했다.
- **남은 작업**: 개별 글 등록 API·화면, 엔진 결과의 DB 저장·조회 연결, 주기적 상태 확인. 구체적인 우선순위는 아래 다음 작업 절을 따른다. API 기능은 실제 검색엔진 등록까지 수행하지 않으며, 현재는 로컬 DB 저장·조회 범위다.
- 사이트 스키마·서비스·라우터·테스트는 사이트 API 커밋에, 관리 화면·정적 자산·화면 테스트·사용 안내는 프론트 커밋에 포함했다. 다른 세션의 `app/engines/`와 관련 테스트 및 로컬 ERD 자료는 커밋에서 제외한다. 작성자는 기존 Git 설정을 유지하며 공동 작성자 트레일러와 원격 푸시는 추가하지 않는다.

최종 갱신일: 2026-10-28 (Asia/Seoul)
프로젝트: StartPress 검색엔진 등록·발행 알림·색인 모니터링 자동화
작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`

## 가장 먼저 확인할 사항

1. **개발 환경은 Miniconda `startpress`다. `.venv`를 만들거나 `uv sync`·`uv run`을 실행하지 않는다.** 직접 Python을 실행할 때도 `PYTHONNOUSERSITE=1`을 지정한다.
2. **현재 브랜치는 codex/publication-service**, HEAD는 `d43823e`다. 서비스 통합·공통 발행 알림 두 커밋을 생성했다. main/master 직접 push 금지를 유지하며 원격 push는 하지 않았다.
3. DB 4개 테이블, 고객사·메인 사이트 등록/목록 API, 고객사 추가·사이트 등록 관리 화면까지 완료했다. 개별 글 등록과 엔진 결과의 DB 연결, 워커·스케줄러는 아직 없다.
4. **Google 구현은 별도 세션에서 `1765f5b`로 커밋했다. IndexNow는 현재 작업 브랜치의 커밋으로 정리했다.** 이 문서의 Google 진행 절과 다른 세션의 변경을 보존한다. `pyproject.toml`·`uv.lock`, 엔진 관련 미추적 테스트도 임의로 되돌리거나 전체 add로 커밋하지 않는다.
5. 실제 색인 완료와 API 요청 성공은 별개다. 저장된 결과는 각 호출 당시 관측이다. DB 최신 상태 4개 테이블만으로 작업·재시도·관측 이력이 관리되지는 않는다.
6. 관리 화면은 <http://127.0.0.1:8000/>이다. 이번 인계 확인 시 로컬 서버가 실행 중이었다. 현재 관리 화면의 등록은 DB 저장이며 검색엔진 등록을 자동 실행하지 않는다.

## 목표와 합의된 방향

회사 팀원이 고객사 블로그 URL을 입력하고 다음 업무를 처리하는 내부 웹 어드민을 만든다.

1. 신규 사이트 등록·소유 확인.
2. 글의 신규 발행·수정·삭제 사실을 검색엔진에 통지.
3. 크롤링·색인 상태를 가능한 범위에서 관측하고 필요한 수동 작업 안내.

공식 API를 중심으로 구현한다. 브라우저 조작으로 등록·검사 기능을 대신하지 않는다. 브라우저는 최초 계정 설정·OAuth 로그인·동의에 사용했다. 파일 배포와 계정 권한 등 API 외부의 준비 단계는 별도로 관리해야 한다.

백엔드는 FastAPI + PostgreSQL이다. 관리 화면은 별도 빌드 없이 HTML·CSS·JavaScript를 FastAPI에서 제공하는 방식으로 구현했다. Jinja2/HTMX는 초기 검토안이며 현재 사용하지 않는다. Celery/Redis·스케줄러는 후속 검토 대상이며 아직 구현하지 않았다.

사용자는 개발자로 성장하기 위한 설명과 단계별 진행을 선호한다. 한국어로 간결하게 설명하고, 코드는 타입 힌팅과 읽기 쉬운 구조를 사용한다. 사용자가 묻는 개념은 난이도에 맞춰 설명한다.

## 개발 환경 — Miniconda startpress

- Conda 실행 파일: `/opt/miniconda3/bin/conda`
- 환경 이름: `startpress`
- 환경 경로: `/opt/miniconda3/envs/startpress`
- Python 실행 파일: `/opt/miniconda3/envs/startpress/bin/python`
- 설치된 Python: **3.13.17**
- 환경별 설정: `PYTHONNOUSERSITE=1` — 기존 사용자 전역 패키지가 섞이지 않도록 설정했다.
- `uv.lock`에서 해시와 고정 버전을 내보낸 뒤 Conda 환경의 pip로 의존성을 설치했다.
- 기존 프로젝트 `.venv/`는 Conda 환경 검증 후 삭제했다.
- `pyproject.toml`, `uv.lock`은 의존성 명세와 잠금 기록으로 유지한다.
- **`uv sync`, `uv run`, `python -m venv`로 프로젝트 venv를 다시 만들지 않는다.**

현재 주요 설치 버전:

| 패키지 | 버전 |
|---|---|
| google-auth | 2.62.0 |
| google-auth-oauthlib | 1.5.0 |
| python-dotenv | 1.2.4 |
| pytest | 9.1.1 |
| FastAPI | 0.162.0 |
| SQLAlchemy | 2.1.6 |
| Alembic | 1.20.1 |
| asyncpg | 0.32.0 |

터미널에서:

```bash
conda activate startpress
python -m pytest -q
```

에이전트의 셸이 여전히 base 환경일 수 있으므로 실행 환경을 추측하지 않는다. 활성화 없이 실행할 때는 다음 방식을 권장한다.

```bash
conda run --no-capture-output -n startpress python -m pytest -q
conda run --no-capture-output -n startpress python google_probe.py sites
```

두 번째 명령은 **실제 Google API를 호출한다.** 로컬 테스트만 원하면 pytest만 실행한다.

캐시를 다시 만들지 않고 테스트하려면:

```bash
PYTHONDONTWRITEBYTECODE=1 conda run --no-capture-output -n startpress python -m pytest -q -p no:cacheprovider
```

환경 복원·설치 방법은 [environment.md](environment.md)를 참고한다. `uv export`는 잠금 기록 변환 용도로 사용 가능하며 venv를 생성하지 않는다.

## 완료된 작업

- [x] Notion 요구사항 분석 및 공식 문서·사례 기반 스택·구조 보고서 작성.
- [x] 테스트 도메인 `https://otteru.vercel.app/`의 robots·사이트맵·canonical 점검.
- [x] 기존 `yudam.com` 대표 도메인 설정을 `otteru.vercel.app`으로 변경·배포.
- [x] Google OAuth 사용자 로그인·동의 및 Access/Refresh Token 저장.
- [x] Google API로 소유 확인 파일 발급 → 파일 배포 → 소유 확인 → 사이트 등록 → 사이트맵 제출 → URL 검사 수행.
- [x] Bing API 키 인증 및 API로 사이트 등록 → 검증 코드 수령 → XML 배포 → 소유 확인 → 사이트맵 제출 → URL 정보 조회 수행.
- [x] IndexNow 실제 POST 요청 검증. 다른 세션의 최종 실험에서 HTTP 200 접수 성공 확인.
- [x] API 응답·관측 결과를 민감정보 없는 통합 JSON과 보고서로 보관.
- [x] 임시 로그·스크린샷·중복 JSON·캐시 및 불필요한 인증 관련 응답 기록 삭제.
- [x] 남겨둔 보고서와 통합 JSON을 Google·Bing 완료 및 IndexNow 200 기준으로 최신화.
- [x] Miniconda `startpress` 생성·의존성 설치·격리 설정·테스트 검증.
- [x] FastAPI 기본 앱과 `/health`, 종료 시 DB 연결 풀 정리 구현.
- [x] Docker PostgreSQL 18.6 실행·로컬 전용 포트·데이터 볼륨·접속 검증.
- [x] 확정한 4개 테이블의 SQLAlchemy 모델과 비동기 세션 구현.
- [x] Alembic 초기 마이그레이션·부모 검증 트리거 작성 후 개발 DB에 0001 적용.
- [x] 기본 8개·PostgreSQL 통합 13개 테스트 통과 및 모델·DB 일치 확인.
- [x] PK·FK·자기참조 관계를 표시한 ERD 이미지와 생성 프롬프트 저장.
- [x] 고객사 등록 `POST /clients`와 목록 조회 `GET /clients` 구현·커밋 (`9099c96`).
- [x] 요청별 세션과 서비스의 트랜잭션을 연결하고, 별도 DB 연결에서 고객사 저장 결과 확인.
- [x] 실제 HTTP로 `/clients` 조회·OpenAPI·`/docs` 응답 확인. 개발 서버 재시작 후 정상 동작 확인.
- [x] DB 설정·연결 코드의 한국어 설명 주석과 `get_db()` 가독성 개선.
- [x] AGENTS.md에 모든 함수·메서드 앞 간단한 한국어 주석 작성 규칙 추가.
- [x] 메인 사이트 스키마·URL 검증·저장/조회 서비스·라우터·실제 DB 검증 완료 (`139af94`).
- [x] 고객사 추가·선택, 사이트 등록·목록 화면과 모바일 배치, 사용 안내 완료 (`58f4514`).
- [x] Notion DB 설계와 4개 모델 비교, 실제 DB의 Alembic 0001(head)·모델 차이 없음 확인. Notion 그 조회 단계에서는 본문을 수정하지 않았으며 이후 IndexNow 세션에서 DB 컬럼과 사용자 입력·구현 상태를 업데이트했다.

## 0단계 API 검증 결과와 실제 한계 — 2026-10-25 관측

### Google

- OAuth 프로젝트: `startpress-512704`. 데스크톱 앱용 클라이언트 JSON을 사용했다.
- 승인한 범위: `webmasters`, `siteverification.verify_only`.
- Sites list: HTTP 200, 최초 대상 속성 없음.
- Site Verification getToken / insert: 각각 HTTP 200.
- Sites add / get: HTTP 204 / 200, `siteOwner` 확인.
- Sitemaps submit / get: HTTP 204 / 200, 당시 `isPending=true`.
- URL Inspection: HTTP 200.
- 마지막 저장 관측: **2026-10-25 15:28:39 KST**.
- 당시 결과: `verdict=NEUTRAL`, ‘Google에는 아직 알려지지 않은 URL입니다.’, 마지막 수집 시각 없음.
- OAuth는 Search Console 속성 권한과 별개이며, 실제 속성의 소유 확인도 완료했다.
- 일반 블로그에 Google Indexing API는 사용하지 않는다. 사이트맵과 URL Inspection을 활용한다.

### Bing

- API 키 방식으로 인증했다. Bing OAuth 위임 인증은 아직 시험하지 않았다.
- GUI URL 입력이나 Google Search Console 가져오기로 사이트를 등록하지 않았다.
- GetUserSites / AddSite: 각각 HTTP 200.
- VerifySite: HTTP 200, `d=true`; 재조회에서 `IsVerified=true` 확인.
- SubmitFeed: HTTP 200, 사이트맵 접수.
- GetUrlInfo: HTTP 200.
- 마지막 저장 관측: **2026-10-25 15:47:48 KST**.
- 당시 `IsPage=true`, 내부 `HttpStatus=0`, `DocumentSize=0`.
- 반환된 마지막 크롤링 시각: **2026-10-25 15:38:27 KST**.
- 반환된 DiscoveryDate가 당시 조회 시각보다 미래인 **16:00:00 KST**였다. 원본을 보존하되 시간 순서·지연시간 계산에 사용하지 않는다.
- `IsPage=true`나 바깥쪽 HTTP 200만으로 색인 완료를 확정하지 않는다. 통합 기록의 색인 상태는 `unknown`이다.
- 이 계정에서는 GUI 사이트 등록 전에 API 키 발급이 가능했다. 다른 계정에 동일 조건을 일반화하지 않는다.

### IndexNow

- 공통 엔드포인트: `https://api.indexnow.org/indexnow`.
- 대상은 대표 URL 1개였다.
- 처음 HTTP 202를 받았으며, 후속 실험은 **2026-10-25 15:36:56 KST에 HTTP 200**이었다.
- 최신 결론은 ‘접수 성공’이며, ‘키 확인 대기’를 최신 상태로 남기지 않는다.
- 개별 Naver·Bing 엔진의 수집·색인 완료를 확인한 것은 아니다.
- 같은 이벤트를 Naver와 Bing에 항상 중복 전송하는 구조를 만들지 않는다.

### 미검증 범위

- Naver·Brave의 신규 사이트 등록 및 개별 색인 상태 조회.
- Bing 고객 계정용 OAuth 위임 인증.
- CMS Webhook·RSS/사이트맵 변경 감지·자동 예약·재시도·다수 고객 운영.
- 대표 URL 외 전체 게시물의 색인 상태 및 장기간의 상태 변화.

## 현재 구현과 진행 상태

- `google_probe.py`는 **검증용 실행 도구**다. `auth`, `sites` 명령만 있다.
- `auth`: `.env`의 OAuth JSON을 읽고 사용자 동의 후 토큰 저장·기존 토큰 재사용.
- `sites`: 저장된 토큰으로 Google 사이트 목록 조회.
- 0단계 소유 확인·사이트맵 제출·색인 검사·Bing 요청은 개별 Python 실행으로 검증했다. 현재 Google 어댑터의 구현 범위는 문서 상단 Google 엔진 진행 절을 따른다. 엔진과 DB·관리 화면의 연결 완료로 해석하지 않는다.
- 테스트 4개는 인증파일 경로 제한, 공식 인증 엔드포인트 검증, 토큰 저장 권한, 결과 요약 시 다른 사이트·오류 본문 제외를 검증한다.
- FastAPI 기본 앱(`/health`), 비동기 DB 연결·세션, 4개 SQLAlchemy 모델, Alembic 초기 마이그레이션, 고객사·메인 사이트 생성/목록 API와 웹 관리 화면을 구현했다. 워커·스케줄러는 아직 없다.
- 고객사 API는 `app/schemas/client.py` → `app/api/clients.py` → `app/services/client.py` → 요청별 DB 세션으로 연결된다. 등록 성공은 201, 입력 오류는 422다. 목록은 생성 시각·ID 순이며 limit(1~100, 기본 100)·offset(0 이상)을 지원한다.
- 고객사 서비스는 `session.begin()` 안에서 저장·응답 변환을 수행하고 정상 종료 시 커밋한다. `get_db()` 자체는 커밋하지 않고 세션 제공·정리를 담당한다.

## 메인 사이트 등록 — 완료

- [x] 1단계: `app/schemas/site.py`에 SiteCreate·SiteRead·SiteList 작성.
- [x] 2단계: HTTP·HTTPS URL 정규화, UTF-8 2,048바이트 제한 적용.
- [x] 3단계: 고객사 확인·메인 사이트 저장·목록 조회 서비스.
- [x] 4단계: POST /sites·GET /sites 라우터 및 앱 연결.
- [x] 5단계: 201·404·409·422 응답과 실제 PostgreSQL 저장·동시 중복·목록 분리 검증.
- [x] 고객사 추가·선택, 사이트 등록 폼과 고객사별 목록, 모바일 배치.

요청 필드는 총 6개다. client_id·name·url·owner_type은 필수, cms_type·can_edit_site는 선택이다.
can_edit_site는 엄격한 true/false/null만 허용한다. target_type·parent_site_id·is_active는
사용자가 보낼 수 없고 서버·DB가 지정한다. SiteRead는 메인 사이트만 표현한다.

URL은 호스트·스킴을 정규화하고 `/blog/` 경로와 쿼리는 유지한다. 잘못된 스킴·호스트,
공백·제어 문자·역슬래시·인증정보·프래그먼트를 거부한다. 등록 시 해당 URL에 접속하지 않는다.
외부 URL 접근 기능의 SSRF 방어가 완료됐다는 의미는 아니다.

화면은 기존 API를 동일 출처로 호출한다. 고객사 목록은 100개씩 끝까지 읽고 사이트 목록은
6개씩 표시한다. 등록 실패 시 입력을 유지하며 오류를 해당 필드에 표시한다. 고객사 추가 후
자동 선택하고 사이트 등록 성공 시 목록을 갱신한다. 사용법은 [site-admin.md](site-admin.md).
브라우저 검증용 별도 임시 DB는 정리했고 개발 DB에 예시 데이터를 저장하지 않았다.

## 진행 중인 작업과 다음에 해야 할 작업

최상단의 현재 세션 인계 요약에 우선순위·미구현 범위·커밋 계획을 정리했다. IndexNow 제출 클라이언트와 사이트 등록 시 설정 저장은 완료했고, 기존 사이트 설정 변경·제출 전용 서비스/API·결과 저장은 아직 없다. 개별 글 등록·예약·이력은 후속 작업이며 Google 절의 보류 요청을 유지한다.

## Git 상태 — 기존 커밋과 IndexNow 작업 브랜치

- 브랜치: codex/indexnow-integration. 원격: `https://github.com/StartPress26/webmaster-automation.git`.
- `139af94` — `[feat] 메인 사이트 등록 및 목록 조회 API 구현`: 스키마·서비스·라우터·앱 연결·사이트 테스트·API 단계 인계. 프론트 없이 독립 검증 81개 통과.
- `58f4514` — `[feat] 고객사 선택 및 사이트 등록 관리 화면 구현`: 정적 HTML/CSS/JS·화면 제공·화면 테스트·사용 안내·프론트 단계 인계. 독립 검증 82개 및 JS 구문 검사 통과.
- 작성자는 기존 Git 설정을 유지했고 공동 작성자 트레일러는 없다. 두 커밋 모두 로컬 main에만 생성했으며 원격 푸시는 하지 않았다.
- 이전 주요 커밋: `9f47662` DB 모델·마이그레이션, `9099c96` 고객사 API, `d359a15` 설명 주석·세션 흐름, `eb9fd2c` 이전 인계.
- 최신 기존 커밋은 Google 구현 `1765f5b`다. 현재 IndexNow 커밋 기록은 최상단 목록을 따른다. 실제 git status를 다시 확인하고 다른 세션의 변경을 보존한다.
- 로컬 전용 제외 자료: `outputs/startpress-db-erd.png`, `outputs/db-erd-prompt.txt`. 전체 add로 함께 커밋하지 않는다.
- `docs/HANDOFF.md`에는 다른 세션의 Google 진행 기록과 이번 갱신을 함께 보존해 문서 커밋에 포함했다. 과거 버전으로 되돌리지 않는다.
- `.env`, `.secrets/`, 가상환경·캐시는 커밋하지 않는다. 원격 상태는 git status -sb로 확인하되 이번 작업에서 새 fetch·push는 하지 않는다.

별도 블로그 저장소 `/Users/kim-yudam/Desktop/study/sideProject/nextjs-notion-starter-kit`에는 공개 검증 파일을 배포했다.

- [PR #4 — 도메인·IndexNow 준비](https://github.com/otteru/nextjs-notion-starter-kit/pull/4)
- [PR #5 — Google 소유 확인 파일](https://github.com/otteru/nextjs-notion-starter-kit/pull/5)
- [PR #6 — Bing 소유 확인 XML](https://github.com/otteru/nextjs-notion-starter-kit/pull/6)

위 변경은 운영 응답으로 반영을 확인했다. 블로그를 원본 포크와 일괄 동기화하는 작업은 진행하지 않았다. 원본의 Next.js 16/App Router 변경과 커스텀 기능 충돌 때문에 별도 마이그레이션을 권장한 상태다.

## 주의사항

- [프로젝트 커밋 규칙](../AGENTS.md)에 따라 공동 작성자 트레일러는 추가하지 않는다. 초기 커밋의 공동 작성자 표시는 사용자 요청으로 제거했다.
- `.env`, `.secrets/`는 Git에 포함하지 않고 비밀값을 로그·채팅·보고서에 출력하지 않는다.
- `.secrets/`에는 현재 실제 인증파일 2개만 남아 있다.
  - `google_search_console_api_user_oauthjson`: 데스크톱 OAuth 클라이언트 JSON. `.env`가 이 파일명을 가리킨다.
  - `google-token.json`: 실제 Access/Refresh Token. 삭제하면 재인증이 필요할 수 있다.
- `.env`에는 기존 `GOOGLE_OAUTH_CLIENT_FILE`, `GOOGLE_TOKEN_FILE`, `BING_API_KEY`와 로컬 DB용 `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `DATABASE_URL`이 있다. 값은 문서·로그에 복사하지 않는다.
- 이미 삭제한 `.secrets/google-site-verification.json`, `google-site-ownership-result.json`, `bing-target-site.json`을 코드가 읽는다고 가정하지 않는다. 재검증 시 필요하면 API에서 다시 받는다.
- 로컬 응답 기록을 삭제한 것과 **블로그의 공개 검증 파일**을 삭제하는 것은 다르다. 배포된 공개 검증 파일은 유지한다.
- 중복 Google/Bing 개별 결과 JSON은 삭제했다. 원래 관측 필드는 현재 엔진별 통합 JSON 안에 보존돼 있다.
- 같은 URL을 색인 확인 목적으로 반복 제출하지 않는다. 통지와 상태 조회를 구분한다.
- 현재 조회 대상은 `google_probe.py`의 `TARGET_SITE`에 고정돼 있다. 제품 구현에서는 입력 검증·사이트 권한 검사를 포함해 일반화해야 한다.

## 최신 DB·FastAPI 구현 상태

### 로컬 DB

- Compose 파일: `compose.yaml`, 서비스 이름: `db`.
- 이미지: `postgres:18.6`.
- 컨테이너: `webmaster-automation-db-1`.
- 주소: `127.0.0.1:5432` — 로컬 컴퓨터에서만 접속하도록 바인딩.
- DB 이름·사용자: `webmaster`. 실제 비밀번호는 `.env`에 무작위 생성·저장했으며 출력하지 않았다.
- 데이터 볼륨: `webmaster-automation_postgres_data`, 컨테이너 경로 `/var/lib/postgresql`.
- 현재 개발 DB는 Alembic `0002 (head)`다. IndexNow 컬럼 적용 시 기존 네 테이블의 데이터 보존과 모델 일치를 확인했다. 통합 테스트의 되돌리기·재적용은 임시 DB에서만 실행했다.
- 기본 실행은 `docker compose up -d --wait db`, 일반 종료는 `docker compose stop db`다.
- 데이터 볼륨을 삭제하는 종료 명령은 사용하지 않는다. 초기화 이후 비밀번호는 .env 값만 바꿔도 DB에 반영되지 않는다.

### 확정한 테이블 4개

1. `clients`: id(UUID), name, manager_name(선택), created_at.
2. `sites`: 메인 사이트와 개별 글을 모두 저장. client_id는 필수이고 target_type은 site/page다. 글의 parent_site_id는 같은 테이블의 메인 사이트를 참조한다. URL은 이 테이블에 저장하며 상태 테이블에 중복 저장하지 않는다.
3. `engine_registrations`: 메인 사이트·엔진별 등록과 소유권 확인 및 IndexNow 키·파일 주소를 관리. main_site_id는 메인 사이트만 참조한다. Naver·Bing에 같은 설정을 저장하며 글은 부모를 통해 조회한다.
4. `site_engine_statuses`: 메인 홈페이지와 글 URL 각각의 엔진별 제출·수집·색인 최신 상태를 저장.

업무 테이블 외에 Alembic이 `alembic_version`을 생성했다. 따라서 public 테이블 조회에 총 5개가 보이는 것은 정상이다.

상태 값:

- registration_status: unknown / submitted / verified / failed, 해당 없는 경우 NULL.
- index_status: unknown / submitted / crawled / indexed / not_indexed / failed.
- submitted는 접수 후 후속 상태 미확인, crawled는 수집 확인 후 색인 미확인이다.
- failed는 작업 오류이고 not_indexed와 다르다. 현재 모델은 최신 상태 저장용이며 정상 관측 이력은 추후 별도 구현이 필요하다.

적용한 제약:

- 모든 ID는 DB에서 UUID 자동 생성, 시각은 TIMESTAMPTZ.
- 같은 고객사와 URL 조합은 유일하다.
- 메인 사이트는 parent_site_id가 NULL, 글은 부모가 필수다.
- 글의 부모와 등록 대상이 반드시 메인 사이트인지 트리거로 검사한다.
- target_type은 생성 후 고정한다. 이 규칙으로 기존 참조 대상의 역할 변경을 방지한다.
- cms_type과 can_edit_site는 메인 사이트에만 저장한다.
- (main_site_id, engine), (site_id, engine)은 각각 UNIQUE.
- 연결된 행이 있는 상위 고객사·사이트 삭제는 RESTRICT로 차단한다.
- URL은 http(s) 접두사와 UTF-8 2,048바이트 길이를 검사한다. 호스트·경로 범위와 권한은 API 계층에서 추가 검증해야 한다.
- 부모·글의 고객사나 owner_type이 같아야 한다는 별도 DB 제약은 없다. 현재 입력 흐름에서는 서버가 부모에서 이 정보를 가져오도록 계획했다.

### 코드와 마이그레이션

- `app/core/config.py`: frozen Settings, 프로세스 환경변수 우선, 비밀번호가 repr·설정 오류에 노출되지 않도록 처리.
- `app/core/database.py`: SQLAlchemy 비동기 연결 풀·요청별 AsyncSession·종료 정리. 커밋은 서비스 계층에서 명시한다.
- `app/main.py`: `/health`, 고객사·사이트 라우터, `/` 관리 화면, `/static/` 자산 제공. lifespan에서 사용한 DB 연결 풀 정리.
- `app/api/clients.py`, `app/services/client.py`: 고객사 등록·목록 요청 처리와 DB 저장·조회.
- `app/schemas/site.py`, `app/api/sites.py`, `app/services/site.py`: 메인 사이트 입력 검증·등록·고객사별 목록과 서비스 예외의 HTTP 변환.
- `app/static/`: 고객사 추가·사이트 등록 관리 화면. 추가 프론트 프레임워크나 빌드 과정은 없다.
- `app/models/`: Base와 4개 모델. 관계는 외래키로 정의했으며 ORM relationship 편의 속성은 아직 없다.
- `alembic.ini`: 경로·로그 설정만 저장. 연결 주소나 비밀번호를 넣지 않는다.
- `migrations/env.py`: .env와 Base.metadata 연결. 테스트는 Config.attributes로 임시 DB URL을 주입한다.
- `migrations/versions/0001_create_tracking_tables.py`: 테이블·인덱스·제약·검증 트리거 생성과 downgrade.
- `migrations/versions/0002_add_indexnow_settings.py`: engine_registrations에 IndexNow 키·파일 주소 컬럼 추가.
- `app/services/engine_registration.py`: 같은 DB 세션으로 Naver·Bing 설정 저장. 독립 커밋하지 않는다.
- `db/schema.sql`은 과거 8개 테이블 보관본이다. 최신 적용에 사용하지 않는다는 주석을 추가했다. 현재 기준은 모델과 Alembic이다.
- 트리거·함수는 autogenerate가 자동으로 관리하지 않는다. 변경 시 새 마이그레이션에 직접 작성하고 통합 테스트한다.

```bash
conda run -n startpress python -m alembic current
conda run -n startpress python -m alembic check
```

확인용 DB 접속:

```bash
docker compose exec db psql -U webmaster -d webmaster
```

psql 안에서 `\dt`, `\d sites`로 테이블과 제약을 볼 수 있다.

### 검증 기록

- 사이트 API 커밋 스냅샷: **81 passed**. 프론트 커밋 스냅샷: **82 passed**. 각각 인덱스 내용을 별도 임시 디렉터리로 내보내 검증했으며, 다른 세션의 미추적 엔진·테스트는 포함하지 않았다.
- `node --check app/static/admin.js`, `git diff --check` 통과.
- 실제 PostgreSQL 임시 DB에서 커밋·중복·동시 등록·고객사별 조회·글 제외·서버 지정값·true/false/null·롤백·HTTP 응답을 확인했다.
- 브라우저에서 별도 임시 DB로 고객사 추가/자동 선택, 등록/목록 갱신, 빈 입력·URL 중복 안내와 390px 모바일 배치를 확인했다. 브라우저 경고·오류 로그는 없었다.
- 2026-10-27 읽기 확인: `alembic current`는 0001(head), `alembic check`는 No new upgrade operations detected.
- 다른 세션의 Google 테스트 86개 통과 기록은 상단 해당 절을 따른다. 프로젝트 전체 또는 위 82개와 합산한 수치로 표현하지 않는다.

```bash
# 임시 PostgreSQL DB를 생성·검증·정리합니다. 외부 검색엔진 API는 호출하지 않습니다.
RUN_POSTGRES_TESTS=1 PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -p no:cacheprovider

# DB 없이 기본 테스트만 실행합니다.
PYTHONNOUSERSITE=1 PYTHONDONTWRITEBYTECODE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest -q -m 'not integration' -p no:cacheprovider
```

통합 테스트는 개발 DB를 지우지 않는다. UUID 이름의 임시 DB를 만들고 자신이 만든 DB만
삭제한다. 로컬 계정에 CREATE DATABASE 권한이 필요하다. 다른 세션이 테스트를 추가 중이므로
현재 작업 트리 전체 테스트 수는 위 커밋 스냅샷 수보다 늘어날 수 있다.

### 관리 화면 실행

```bash
docker compose up -d --wait db
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

이번 인계 확인 시 이미 127.0.0.1:8000에 개발 서버가 실행 중이었다. 중복 실행 전에 포트를
확인한다. 서버는 `.env` 또는 프로세스 환경변수의 DB에 연결하며 화면 등록은 실제 저장이다.
검증용 8001 서버와 임시 DB는 정리했다. 관리 화면은 [로컬 화면](http://127.0.0.1:8000/),
API 문서는 [Swagger UI](http://127.0.0.1:8000/docs)에서 확인한다.

### ERD 이미지

- 아래 자료는 기존 DB 설계 자료 제외 방침에 따라 로컬에만 보존하며 이번 커밋에서도 제외한다. 새 체크아웃에는 없을 수 있다.
- `outputs/startpress-db-erd.png`: 내장 imagegen으로 생성한 4개 업무 테이블의 컬럼·PK·FK·1:N·자기참조 관계 이미지.
- `outputs/db-erd-prompt.txt`: 사용한 전체 프롬프트.
- 이미지는 설명용이며 실제 정의는 모델·마이그레이션을 기준으로 확인한다.

## 관련 파일

| 파일 | 용도 |
|---|---|
| [environment.md](environment.md) | Conda 실행·복원 방법 |
| [../google_probe.py](../google_probe.py) | OAuth·Google 사이트 목록 검증 코드 |
| [../tests/test_google_probe.py](../tests/test_google_probe.py) | 로컬 보호 동작 테스트 4개 |
| [../pyproject.toml](../pyproject.toml) | Python·의존성·pytest 설정 |
| [../uv.lock](../uv.lock) | 정확한 의존성 버전·해시 |
| [docker-postgres.md](docker-postgres.md) | Docker DB 실행·접속 방법 |
| [database-setup.md](database-setup.md) | 현행 스키마·Alembic·통합 테스트 안내 |
| [../compose.yaml](../compose.yaml) | 로컬 PostgreSQL 18.6 실행 설정 |
| [../app/main.py](../app/main.py) | FastAPI 앱·health·연결 풀 종료 처리 |
| [../app/core/database.py](../app/core/database.py) | 비동기 DB 연결과 요청별 세션 |
| [../app/core/config.py](../app/core/config.py) | 비밀값 노출을 제한한 DB 설정 |
| [../app/models/__init__.py](../app/models/__init__.py) | 4개 모델·메타데이터 진입점 |
| [../app/schemas/client.py](../app/schemas/client.py) | 고객사 생성·조회·목록 Pydantic 스키마 |
| [../app/api/clients.py](../app/api/clients.py) | 고객사 등록·목록 라우터 |
| [../app/services/client.py](../app/services/client.py) | 고객사 저장·조회 트랜잭션 |
| [clients-api.md](clients-api.md) | 고객사 API 사용·검증 안내 |
| [site-admin.md](site-admin.md) | 관리 화면 실행·사용·검증 안내 |
| [../app/schemas/site.py](../app/schemas/site.py) | 사이트 요청·응답·URL 검증 |
| [../app/api/sites.py](../app/api/sites.py) | 메인 사이트 등록·목록 라우터 |
| [../app/services/site.py](../app/services/site.py) | 사이트 저장·조회와 중복 처리 |
| [../app/static/index.html](../app/static/index.html) | 관리 화면 폼·대화상자·목록 |
| [../app/static/admin.css](../app/static/admin.css) | 반응형 배치·포커스 스타일 |
| [../app/static/admin.js](../app/static/admin.js) | API 호출·목록 갱신·오류 안내 |
| [../tests/test_site_schemas.py](../tests/test_site_schemas.py) | 사이트 스키마 테스트 |
| [../tests/integration/test_site_service.py](../tests/integration/test_site_service.py) | 사이트 저장·동시 중복 테스트 |
| [../tests/integration/test_sites_api.py](../tests/integration/test_sites_api.py) | 사이트 HTTP·DB 통합 테스트 |
| [../tests/test_admin_page.py](../tests/test_admin_page.py) | 관리 화면·정적 파일 응답 테스트 |
| [../tests/integration/test_clients_api.py](../tests/integration/test_clients_api.py) | 실제 DB 커밋·API 검증 |
| [../alembic.ini](../alembic.ini) | 마이그레이션 실행 설정 |
| [../migrations/versions/0001_create_tracking_tables.py](../migrations/versions/0001_create_tracking_tables.py) | 초기 4개 테이블·검증 트리거 |
| [../tests/integration/test_database_schema.py](../tests/integration/test_database_schema.py) | PostgreSQL 관계·제약 검증 |
| [../tests/test_database_config.py](../tests/test_database_config.py) | DB 설정의 비밀값 노출 방지 테스트 |
| [../outputs/startpress-db-erd.png](../outputs/startpress-db-erd.png) | ERD 이미지 |
| [../outputs/db-erd-prompt.txt](../outputs/db-erd-prompt.txt) | ERD 생성 프롬프트 |
| [../outputs/phase0-api-verification-report.ko.md](../outputs/phase0-api-verification-report.ko.md) | 0단계 전체 검증 보고서 |
| [../outputs/google-api-verification-result.ko.md](../outputs/google-api-verification-result.ko.md) | Google 상세 보고서 |
| [../outputs/google-api-verification-status.json](../outputs/google-api-verification-status.json) | Google 통합 응답·검증 상태 |
| [../outputs/bing-api-verification-status.json](../outputs/bing-api-verification-status.json) | Bing 통합 응답·검증 상태 |
| [../outputs/indexnow-api-test-result.json](../outputs/indexnow-api-test-result.json) | IndexNow 최종 200 및 과거 202 이력 |

요구사항 원문: [Notion — Indexing 자동화](https://app.notion.com/p/Indexing-4034977b8e6980c2b41cc0e5a841c914).
2026-10-27 이 세션에서 Notion 연결 도구 fetch로 다시 조회했다. 조회 결과의 마지막 편집 시각은 2026-10-26 19:03 KST였다. 연결 이름 `Notion`에서는 404였지만 `개인용` 연결에서 StartPress HQ / 개발 아래 페이지를 조회했다. 한 연결의 404를 페이지 자체의 접근 불가로 단정하지 않는다. 다음 세션에서도 위 링크 또는 ID `4034977b-8e69-80c2-b41c-c0e5a841c914`로 조회한다. 그 조회 단계에서는 본문을 수정하지 않았으며 이후 IndexNow 세션에서 DB 컬럼과 사용자 입력·구현 상태를 업데이트했다.

조회한 원문에는 요구사항 1·2·3, 엔진별 자동화 조사, DB 설계(`clients`, `sites`, `engine_registrations`, `site_engine_statuses`), ‘사용자가 처음 넣어줘야 하는 정보’가 포함되어 있다. 입력 흐름은 다음과 같다.

- 고객사 등록: 고객사 이름과 선택적인 담당자 이름 입력.
- 메인 사이트 등록: 고객사 이름 목록에서 선택하되 서버에는 `client_id` 전달. 사이트 이름·URL·소유 구분과 선택적인 플랫폼·인증 파일/태그 설치 가능 여부 입력. 설치 가능 여부는 가능/불가능/모름을 `true`/`false`/`NULL`로 저장.
- 개별 글 등록: 등록된 메인 사이트 상세에서 ‘글 추가’로 제목·URL 입력. 선택한 부모 ID를 요청에 포함하고, 서버가 부모에서 고객사·소유 구분을 가져와 `target_type=page`로 설정.

Notion은 요구사항·설계 자료다. 실제 구현·적용 여부는 이 문서의 최신 구현 상태와 코드·Alembic 버전을 기준으로 확인한다. 원문의 브라우저 자동화 제안은 이 문서의 공식 API 중심 합의와 구분한다. 초기 조회 이후 IndexNow 세션에서 DB 컬럼·입력 항목·저장 구현 상태를 수정했다. 연결·권한은 변경하지 않았다.

## 병행 세션 마지막 상태 — Google·Discord

- 갱신일: **2026-10-31 / Asia/Seoul**.
- 브랜치: **feat/ai-login-bot**. HEAD: **feb8e0a**. 이번 구현·설정·인계 변경은 미커밋이다. 커밋·push는 요청하지 않았다.
- 초기 세션 인증 판정: `domcontentloaded` 다음 사이트별 **wait_until_ready** 조건 대기 추가 완료. 고정 1초 대기가 아니다.
- 네이버 실로그인 성공은 이전 세션 기록이다. Google 어댑터는 추가했지만 **실제 Google 로그인은 미검증**, Bing Google 로그인 어댑터는 미구현이다.
- Google goal에 AI 직접 캡차 해결을 명시했다. OTP·휴대폰 승인 등은 현재 human으로 종료하며 브라우저가 닫힌다.
- `.env`·`.env.example`에 Google ID/PW 필드 추가. 기존 값 보존. 계정정보를 어댑터로 주입하는 영구 실행 코드는 미구현이다.
- 마지막 관련 테스트 실행 기록: **137 passed in 21.19s**. 실행 당시 8개 파일 범위이며 이후 별도 변경까지 재검증한 기록은 아니다. 이번 문서 업데이트에서는 테스트를 다시 실행하지 않았다.
- 다음 세션: **비밀번호 로그인 → 문자 코드 발송 → Discord 요청/수신 → 같은 브라우저에서 로그인 재개** 흐름 설계·구현. 수신에는 Discord 봇이 필요하며 기존 발송 웹훅만으로는 안 된다. 답장/모달 방식·봇 설정은 미확정이다.
- 업체 전체 사용자 권한은 우리 운영 Google 계정에 부여받아 사용한다. 인증은 우리 계정 기준이며 로그인 후 업체 속성 접근 권한을 따로 확인한다.
- 실제 봇 실행 전 `.cursor/rules/bot-execution-records.mdc` 및 최신 `AGENTS.md`를 확인한다. 기존 미커밋·미추적 변경과 비밀 파일을 보존한다.

새 세션에서: **‘docs/HANDOFF.md 최상단 최신 요약을 읽고 이어서 진행해줘. 초기 화면 조건 대기와 Google 어댑터는 구현했고 관련 테스트 137개 통과 기록이 있어. Bing은 Google 계정으로 로그인할 예정이야. 다음에는 비밀번호가 있다는 전제로 human 단계에서 Discord로 문자 인증 코드를 받아 같은 브라우저에서 재개하는 기능을 설계·구현하고 싶어. 업체 계정 대신 Full user 권한을 받은 우리 운영 계정으로도 작업할 수 있어야 해. Discord 입력 방식과 봇 설정은 아직 미확정이고, 실제 Google 로그인도 검증하지 않았어. 기존 변경을 보존하고 코드 위치를 짚으며 단계별로 설명해줘.’**


## 과거 마지막 상태 — 2026-10-31 (최상단 최신 요약 우선)

- 갱신일: **2026-10-31 / Asia/Seoul**. 브랜치 **feat/ai-login-bot**, 기준 커밋 **feb8e0a**.
- 사용자 **‘현재 브랜치에 푸시해’** 승인에 따라 네이버 변경만 4개 커밋으로 정리한다. 생성된 커밋: **5b52f15**(로그인 대기·네이버 인증), **e8e4ce0**(색인 조회 엔진), **f1ba2c3**(실행 기록 규칙). 이 문서가 4번 커밋이다. 최종 문서 커밋 해시는 `git log -1`로 확인한다.
- 푸시 대상은 **origin/feat/ai-login-bot**. 최종 HEAD와 원격 브랜치 SHA가 일치하는지 확인한다. 이 승인을 다른 작업·브랜치·추가 기능의 push 승인으로 확대하지 않는다.
- 네이버 엔진: `get_site_summary()` → 로그인봇 → `_open_index_status()` → `_read_site_summary()` → 브라우저 종료까지 구현·실제 호출 성공.
- **20:07 KST 실제 전체 흐름 성공**, AI 로그인 14회 호출·로그인 이후 AI 0회·네이버 색인 성공 판정 메시지 반환. 기록은 `.secrets/bot_runs/naver_get_site_summary_6f2y2aka.jsonl`이며 민감값을 제외했다.
- push 전 스테이징 스냅샷 검증: 1번 커밋 관련 **112 passed**, 2번 커밋 엔진 **19 passed**. 두 실행 범위를 합쳐 프로젝트 전체 테스트 통과 수로 표현하지 않는다. 실제 봇·DB 통합 테스트를 새로 실행하지 않았다.
- **캡차 입력 후 같은 필드 재입력 문제는 분석만 했으며 사용자가 다음 작업으로 보류했다.** 다음 재개 시 대상 식별·입력 완료 이력과 불필요한 덮어쓰기 방지를 검토한다. 첫 답의 정오·문제 변경 여부는 로그만으로 단정하지 않는다.
- Google/README/설정·Discord 등 병행 변경은 이번 네이버 커밋에서 제외하고 작업 트리에 보존한다. .env·실행 로그·인증 상태·임시 실행기는 제외한다.
- 실제 봇 실행 전 기록 규칙을 읽고 실행별 기록을 남긴다. 제품 자동 파일 로깅은 아직 없으며 이번 기록은 임시 실행기의 계측이다.
- 실행 환경은 Miniconda startpress, 직접 실행 시 PYTHONNOUSERSITE=1, 프로젝트 .venv 사용 금지.

새 세션에서: **‘docs/HANDOFF.md 최상단 네이버 요약부터 읽고 이어서 진행해줘. get_site_summary는 로그인봇부터 네이버 색인 확인 결과 반환까지 실제 성공했어. 캡차 답을 입력하고 확인 전에 다시 덮어쓰는 문제는 아직 수정하지 않았고 다음 작업으로 남겼어. 이력에 입력 대상·완료 상태가 부족한 문제를 작은 범위로 설명하고 보완할 계획이야. 네이버 변경은 사용자 승인으로 4개 커밋으로 정리하고 feat/ai-login-bot에 push하는 범위였어. git log -4와 원격 SHA로 최종 상태를 확인해줘. Google·Discord 등 제외한 병행 변경과 인증정보·실행 기록은 보존해.’**
