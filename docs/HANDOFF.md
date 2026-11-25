# 작업 인계 문서

## 현재 인계 요약 — 2026-11-24 네이버 탭 재현·최종 검증 / Asia/Seoul

- 브랜치는 `feat/naver-url-collection`이며 `main` 대상 기존 [PR #11](https://github.com/StartPress26/webmaster-automation/pull/11)에 후속 변경을 반영한다. 기능 커밋 `0de01bd`는 네이버 사이트 목록의 링크 렌더링을 기다리고, **수집 완료·미색인** 문구를 `crawled`로 읽어 저장한다. `URL 검사 결과가 없습니다.`는 `unknown`으로 유지한다.
- **`receiver_missing` 재현 조건** — `chrome://extensions`에서 StartPress를 새로고침하고, 그전에 열어 둔 네이버 서치어드바이저 탭을 그대로 사용하면 첫 `state` 메시지를 받을 콘텐츠 스크립트가 연결돼 있지 않다. Chrome 디버거 연결과 포커스 에뮬레이션은 성공하지만, `automation.ts`가 수신기 연결을 기다리다가 약 18초 후 `timeout`으로 종료한다. 사이트 선택과 URL 제출 전 단계다.
- **복구·재검증 순서** — 확장을 새로고침한 다음, 이미 열려 있는 네이버 서치어드바이저 탭도 `⌘R`로 새로고침한다. 사이트 목록이 뜨면 StartPress 관리 탭으로 돌아와 네이버 탭을 비활성 상태로 둔 채 실행한다. 실제 Chrome에서 `state` 응답, 사이트 목록 → 요약 → 웹 페이지 수집 화면 진입, 종료 후 디버거 해제까지 확인했다. 작업 탭의 DevTools는 닫아 둔다.
- 임시 진단 패널과 스크립트는 제거하고 `dist`를 다시 빌드했다. 최종 검증은 확장 테스트 **241개**, TypeScript·빌드, 백엔드 단위 **698개**, PostgreSQL 통합 **213개**, `git diff --check` 통과다. 로컬 Vite 프록시 변경과 기존 ZIP은 커밋에서 제외했다.
- 남은 실검증은 실제 글 제출·접수, 권한 없는 출처로 이동했을 때 디버거 해제, 운영 API의 `crawled` 저장이다. 로컬 PostgreSQL 저장 왕복은 통합 테스트에서 확인했다. 배포할 때는 `crawled` 저장을 지원하는 서버를 먼저 올린다.

## 과거 인계 요약 — 2026-11-17 포커스 검토 보완·색인 조회 적용·커밋 완료 / Asia/Seoul

**2026-11-17 당시 기준이며, 아래 "포커스 모듈 적용·실제 연동 검증" 절의 미커밋·232 passed 기록을 갱신한 내용이다.**

### 완료된 작업

- [x] 포커스 모듈 커밋 전 검토와 보완 3건. ① 접수 성공 뒤 해제만 실패하면 해제 안내가 두 번 붙던 문제(`focus/client.ts`가 작업·해제 실패가 겹칠 때만 `onCleanupError` 호출). ② 작업 중 디버거 종료·주소 변경이 `네이버 자동 조회를 취소했습니다`로 표시되던 문제(`focus/naver-runner.ts`의 `actualFailure`가 사용자 취소가 아니면 `focusSignal.reason`으로 교체). ③ `focus/host.ts`의 `updated()`가 주소 없는 탭 변경을 모두 무시하던 문제(탭 주소를 볼 수 없으면 기존 22초 `startAuthTimer()` 시작). 각 회귀 테스트를 추가했고 수정 전 코드에서 실패함을 확인했다.
- [x] 다른 세션(또는 사용자)이 작업 트리에 만든 **전체 색인 조회의 포커스 적용**(`inspection/client-controller.ts`에서 `runNaverAutomation`을 `withNaverFocus`로 감쌈)을 검토했다. 같은 취소 오표시 문제가 있어 `actualFailure`를 export해 적용했고, 네이버가 연결 준비 뒤 시작하면서 깨진 병렬 테스트 2개의 시작 순서 고정을 정렬 비교로 바꿨다. 조회 중 연결 종료 회귀 테스트를 추가했다.
- [x] 작업 트리에 있던 백엔드 변경(네이버 GUI 저장 스키마에서 `not_indexed` 거부 검사 제거와 테스트)은 내용을 바꾸지 않고 별도 커밋으로 분리했다.
- [x] 커밋·push: `a6bd04e` 포커스 세션 모듈, `9732b79` 발행 GUI 연결, `840c22b` 문서, `c51c6fc` 색인 조회 포커스 적용, `e0d0ed7` 네이버 not_indexed 저장 허용. 모두 `feat/naver-url-collection`에 push했고 원격과 일치한다. 공동 작성자 트레일러는 넣지 않았다. PR은 만들지 않았다.
- [x] 최종 검증: 프론트 **237 passed**, 타입 검사·빌드·`git diff --check` 통과, 백엔드 단위 **696 passed**, `RUN_POSTGRES_TESTS=1`로 GUI 저장 통합 테스트 6개 통과(전체 통합 스위트는 이번에 돌리지 않음).

### 알려진 한계와 주의사항

- **③의 전제 미검증**: 호스트 권한이 없는 출처(`nid.naver.com`·외부 사이트)로 이동하면 Chrome이 `changeInfo.url`·`tab.url`을 주지 않는다는 것은 문서 기준 판단이다. 가짜 Chrome 테스트는 주소를 항상 넘긴다. 로그인 화면과 외부 사이트를 구분하지 못해 둘 다 `auth_required` 안내가 나오고, 외부 사이트에도 최대 22초 디버거가 남는다. 22초(`AUTH_TIMEOUT_MS`) 값의 근거 기록은 없다(화면 대기 18초보다 길게 잡은 것으로 추정).
- ② 적용으로 연결 종료 시 요청 중이던 발행 GUI 행은 `blocked`가 아니라 `unconfirmed`(접수 여부 미확인)로 표시된다. 중복 제출을 피하는 쪽이라 유지했다.
- **네이버 `not_indexed`는 서버만 허용한 상태다.** 확장의 네이버 판독은 `indexed`(색인 성공 문구)·`unknown`(`URL 검사 결과가 없습니다.`) 두 값만 만든다. `automation.ts`·`preview.ts`의 `hasConsistentJudgement`가 다른 값을 `invalid_response`로 버린다. 과거 결정상 "결과 없음"을 미색인으로 바꾸지 않는다.
- 해제 불명확 뒤 다음 실행의 `busy` 안내("작업이 끝난 뒤 다시 실행")는 실제 해결책(확장 새로고침)과 맞지 않는다. 미수정.
- `debugger` 권한은 스토어 업데이트 시 기존 사용자에게 새 권한 경고·비활성화를 일으킨다. 배포 시 고려한다.
- 커밋 제외로 보존: `extension/vite.config.ts`(로컬 프록시 8000), `extension/startpress-extension.zip`. `.env`·`.secrets`·`dist`는 커밋하지 않는다.

### 다음에 해야 할 작업

1. **실제 Chrome 확인**: `npm run build` → 확장 Reload → 네이버 탭을 띄워 두고 다른 탭을 보면서 (a) 전체 색인 조회와 (b) 발행 GUI 수집 화면 준비가 `site_missing` 없이 되는지, (c) 작업 중 네이버 탭을 다른 사이트로 이동했을 때 ③이 22초 안에 끊는지 확인한다. 브라우저 작업 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 비공개 기록을 남긴다.
2. **네이버 미색인 판독(선택)**: 먼저 미색인 URL로 네이버 색인 상태 확인 화면을 실제로 관측해 판정 문구 원문과 `색인 완료 아니오` 배지(`observation.ts`의 `NOT_INDEXED_BADGE`)의 표시 방식을 기록한다. 그 뒤 `observation.ts`(상수·타입·`resultMarkers`·`indexStatusOf`·모순 검사), `automation.ts`·`preview.ts`의 `hasConsistentJudgement`, 테스트, 판정 규칙 문서를 고친다. 표시·집계 코드는 이미 `not_indexed`를 지원한다. **서버를 먼저 배포한 뒤 확장을 배포**해야 옛 서버의 422를 피한다.
3. 실제 글 URL 입력·확인 버튼·접수는 여전히 미검증이다. 지정 글의 기존 요청 내역을 먼저 확인하고 반복 제출하지 않는다.
4. 사용자 요청 시 PR 생성. 리뷰 후 병합·배포는 별도 요청.

### 관련 파일

- `extension/src/focus/{protocol,host,client,naver-runner,messages}.ts`: 포커스 세션(서비스워커 소유, Port 요청, `actualFailure`).
- `extension/src/app/controllers.ts`, `extension/src/publication/controller.ts`: 발행 runner 주입·오류 안내.
- `extension/src/inspection/client-controller.ts`: 색인 조회의 네이버 포커스 적용.
- `extension/src/engines/naver/{observation,automation,preview}.ts`: 네이버 판정·응답 검증(미색인 작업 시 수정 대상).
- `app/schemas/inspection.py`: GUI 저장 스키마.
- `extension/tests/{naver-focus,client-inspection,workspace}.test.mjs`, `extension/tests/helpers/{focus-chrome,focus-session-port}.mjs`: 포커스 회귀.

## 현재 인계 요약 — 2026-11-17 포커스 모듈 적용·실제 연동 검증 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-17 포커스 모듈 실연동 확인`을 우선한다. 아래 다른 세션의 가독성 리팩토링 인계는 보존했다. 그 기록의 중간 타입/테스트 실패·포커스 작업 진행 중 상태는 이제 아래 최종 검증 결과로 갱신됐다. 실제 글 URL 제출·접수·수집·색인 완료는 여전히 미검증이다.**

- 시작 HEAD는 `025dceb`(가독성 리팩토링 PR #10 병합), 브랜치는 `feat/naver-url-collection`이다. 사용자 요청에 따라 현재 `app/controllers.ts`의 runner 주입 지점에 포커스 모듈을 연결했다. 옛 `main.ts` 구조를 복원하지 않았으며, 새 코드의 함수·조건은 풀어 쓰고 한국어 역할·단계 주석을 추가했다.
- 새 파일은 `extension/src/focus/{protocol,host,client,naver-runner,messages}.ts`다. 서비스워커가 디버거 세션을 소유하고 관리 문서는 Port로 요청한다. 연결 준비 → 기존 runner 한 번 실행 → 완료·취소·오류 시 해제 순서다. 사용자 탭 활성화·창 포커스 전환은 하지 않는다.
- manifest에 `debugger` 권한과 Chrome 118 하한을 추가했다. `background.ts`의 기존 아이콘 클릭 동작은 유지한다. 작업 중 Chrome의 디버깅 안내 배너가 나타날 수 있으며 네이버 탭의 DevTools와는 충돌할 수 있다.
- 같은 확장의 관리 문서, attach 전후 대상 탭 범위, 제한된 네이버 자동 인증 왕복을 검증한다. 지연 연결·문서 종료·탭 종료·세션 상실을 처리하고 해제 불명확 시 소유권을 유지한다. 원래 runner 오류·`receipt_unconfirmed`와 이미 확인된 접수 결과는 보존한다. 작업 오류와 해제 오류가 겹치면 두 안내를 모두 남긴다.
- 실제 개발 확장을 새 권한 포함 빌드로 Reload하고 네이버 DevTools를 닫은 상태에서 검증했다. 현재 source client를 임시 ESM으로 빌드해 관리 문서에서 호출하고 실제 host·네이버 콘텐츠 명령을 사용했다. 백그라운드 목록 로딩 → 사이트 선택 → **웹 페이지 수집 화면 준비**가 두 번 모두 성공했으며 사용자 탭 선택이 유지되고 각 실행 뒤 debugger detach가 확인됐다.
- 실제 취소 후 signal 중단·detach, 관리 문서 새로고침으로 Port 종료 후 detach, 검증용 임시 작업 탭 종료 후 signal 중단도 확인했다. 임시 탭을 제거하고 원래 네이버 작업 탭 하나를 남겼다. 최종 debugger 해제와 임시 관리 변수 제거를 확인했다. 검증용 ESM은 `dist`에서 제거했다.
- 검증 범위는 글 URL 입력·확인 버튼 클릭 직전까지다. 글 저장·IndexNow·실제 수집 제출은 실행하지 않았다. 전체 발행 폼에서 실제 글을 제출한 결과나 운영/스토어 배포 결과로 설명하지 않는다.
- 프론트 **232 passed**(포커스 수명주기 20개·UI 통합 4개 포함), 타입 검사·관리 화면/서비스워커/콘텐츠 빌드·diff 검사 통과. 코드·보안 리뷰 차단 이슈 없음. 백엔드는 변경하지 않아 이번에 다시 실행하지 않았다.
- **커밋 전 검토 보완(같은 날)**: ① 접수 성공 뒤 해제만 실패하면 같은 해제 안내가 두 번 붙던 문제를 고쳤다(`client.ts`는 작업·해제 실패가 겹칠 때만 `onCleanupError`를 호출). ② 작업 중 디버거 종료·주소 변경으로 멈췄는데 `네이버 자동 조회를 취소했습니다`로 표시되던 문제를 고쳤다(`naver-runner.ts`의 `actualFailure`가 사용자 취소가 아니면 포커스 사유로 교체). 이때 요청 중이던 글은 `blocked`가 아니라 `unconfirmed`로 표시된다. ③ `host.ts`의 `updated()`가 주소 없는 탭 변경을 모두 무시하던 것을 고쳐, 탭 주소를 볼 수 없으면 기존 22초 인증 대기 타이머를 시작한다. 회귀 테스트 4개 추가로 프론트 **236 passed**, 타입 검사·빌드 통과.
- **③의 미검증 전제**: 호스트 권한이 없는 출처(`nid.naver.com`·외부 사이트)로 이동하면 Chrome이 `changeInfo.url`·`tab.url`을 주지 않는다는 것은 문서 기준 판단이며 실제 Chrome에서 확인하지 않았다. 가짜 Chrome 테스트는 주소를 항상 넘긴다. 로그인 화면과 외부 사이트를 구분하지 못해 둘 다 `auth_required` 안내가 나오고, 외부 사이트에도 최대 22초 디버거가 남는다. 22초 값의 근거 기록은 없다.
- 비공개 기록: `.secrets/bot_runs/focus-integration-20261117T104325Z.jsonl`. 실제 인증값·쿼리·원본 응답은 커밋하지 않는다. 이번 적용은 미커밋이며 기존 Vite 프록시·ZIP을 보존했다. 커밋·push·PR·배포·버전 증가는 요청하지 않았다.

## 현재 인계 요약 — 2026-11-17 확장 프론트 가독성 리팩터 PR #10 병합·포커스 작업 진행 중 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-17 가독성 리팩터 병합·포커스 작업 진행 중`을 우선한다. 바로 아래 "과거 인계 요약 — 커밋 정리·포커스 에뮬레이션 검증"의 네이버 GUI·포커스 진단 내용은 여전히 유효하며 그 작업은 지금 작업 트리에서 미커밋 상태로 진행 중이다.**

### 완료된 작업 — 가독성 리팩터 (기능·화면 변경 없음)

- 사용자가 `publication/controller.ts`를 풀어 쓴 방식을 마음에 들어 해 `extension/src` 전체에 같은 방식(구역 헤더, 함수마다 한국어 주석, 다단 삼항·`||` 사슬 → if/이름 있는 헬퍼, 매직 값 → 상수)을 적용했다. 브랜치 `refactor/extension-readability`, 커밋 50개(파일 단위), [PR #10](https://github.com/StartPress26/webmaster-automation/pull/10)으로 `feat/naver-url-collection`에 **병합 완료**(merge `025dceb`). 베이스 브랜치 `feat/naver-url-collection`은 이 PR을 위해 처음 원격에 push됐고 현재 로컬·원격이 일치한다.
- 공용 헬퍼 신설: `src/html.ts`(6벌 중복 `escape` 통합), `src/url.ts`, `src/tabs/readiness.ts`, `src/engines/shared/content-guard.ts`, `src/engines/labels.ts`, `errors.isUncertainFailure`, `api.VALID_SUBMISSION_STATUSES`, `client-controller.SETTLED_RUN_PHASES`.
- 승인받아 통합한 것: `tabs/client.ts`+`publication/tabs.ts` → `TabPolicy` 기반 공용 구현, `renderWorkTabPanel` 옵션화로 `publication/view.ts`의 `replaceAll` 5개 제거, `runNaverGui`/`runBingGui` → 엔진 설정 표를 받는 `runGui`. 제거한 것: `validateIndexNowTarget`, 렌더되지 않던 `#reload-data` 리스너, 도달 불가 분기, 미사용 CSS 4종, 내부 전용 export.
- **`main.ts`(2005줄)를 분할했다.** 진입점 `main.ts` 11줄 + `src/app/{constants,store,render,loaders,controllers,form-errors,urls,actions,events}.ts` + `src/app/views/{shell,dashboard,inspection,registration,notification}.ts`. 모듈 변수 44개는 `src/app/store.ts`의 `store` 객체 필드다. `update()`는 `render.ts`에 있다(순환 import의 뿌리인 `store.ts`를 깨끗하게 두기 위해).
- 매 커밋 검증: tsc 0 오류, 프론트 테스트 208개, **렌더 HTML 스냅샷 134건 diff 0**(순수 뷰 고정 상태 + 데모 모드 56개 + 가짜 fetch API 모드 22개, 베이스 커밋 `c7a0721` worktree와 비교), 빌드 성공과 `naver-content.js`·`bing-content.js` IIFE 최상위 import 0건. 스냅샷 스크립트는 사용자 결정으로 커밋하지 않았고 세션 스크래치패드(`/private/tmp/claude-501/…/scratchpad/snapshot/`)에만 있었으므로 사라졌을 수 있다. 수동 Chrome 스모크는 하지 않았다.

### 통일하지 않고 보고만 한 항목 (고치면 동작이 바뀜)

- 네이버 로그인 경로 검사: `publication/tabs.ts`는 `/login/i`(대소문자 무시), `naver/observation.ts`·`collection-automation.ts`는 `includes('login')`.
- `naverTargetInSite`(사이트 경로 끝 슬래시 포함 비교)와 `bingTargetInSite`(슬래시 제거 비교 + `!parent.search`)의 범위 판정이 다르다.
- 후속으로 미룬 것: naver/bing `automation.ts`의 `command/waitPage/navigate` 통합, MutationObserver 패턴 5곳 통합(타이밍 민감). 50줄을 넘는 함수는 클로저 팩토리(`create*Controller`, `createApi`)와 Observer 블록(`inspectNaverUrl`, `inspectBingUrl`, `requestNaverCollection` 등)뿐이다.
- 문서 참조 갱신 필요: `docs/naver-collection.md:51`과 `docs/inspections-api.md:90`이 아직 `extension/src/main.ts`를 가리킨다. 발행 폼 이벤트는 `src/app/events.ts`(`bindForms`·`bindPublication`), 제출 처리는 `src/app/actions.ts`(`notifyPublication`), API 연결은 `src/app/loaders.ts`·`src/api.ts`다.

### 지금 작업 트리에 있는 다른 진행 중 작업 (이 세션의 것이 아님 — 건드리지 말 것)

- 인계 문서를 쓰는 동안 **다른 세션이 동시에** 네이버 포커스 에뮬레이션(DevTools `Emulation.setFocusEmulationEnabled`를 `chrome.debugger`로 적용하는) 구현을 진행 중이었다. 미추적: `extension/src/focus/{client,host,messages,naver-runner,protocol}.ts`, `extension/tests/helpers/focus-chrome.mjs`, `extension/tests/naver-focus.test.mjs`. 추적 파일 수정: `extension/public/manifest.json`(+2), `extension/src/app/controllers.ts`(+33), `extension/src/background.ts`(+5), `extension/src/publication/controller.ts`(+5). 이 파일들은 확인 중에도 바뀌고 있었다(`focus/client.ts`가 도중에 생김).
- 확인 시점의 상태: tsc가 `focus/naver-runner.ts`의 `./client.ts` 누락으로 실패했고(직후 파일이 생겼으므로 지금은 다를 수 있음), `tests/naver-focus.test.mjs`와 `tests/workspace.test.mjs`가 실패했다(`기대한 DOM 상태가 표시되지 않았습니다`). 원인은 미확정이며 리팩터 병합 커밋 `025dceb` 시점에는 208개 모두 통과했으므로, 이후 미커밋 변경(특히 `app/controllers.ts`·`background.ts`의 focus 연결)에서 생긴 것으로 보이지만 단정하지 않는다. 새 세션은 먼저 `git status`와 `npm run check && npm test`로 현재 상태를 다시 확인한다.
- `extension/vite.config.ts`(로컬 프록시 8000)와 `extension/startpress-extension.zip`은 이전과 같이 커밋 제외로 보존한다.

### 다음에 해야 할 작업

1. 포커스 작업 세션의 진행 상황을 확인한다. 그 세션이 끝났다면 tsc·테스트를 다시 돌려 실패 원인을 잡고, 끝나지 않았다면 해당 파일을 건드리지 않는다.
2. 리팩터 후 수동 스모크: `npm run build` → Chrome에 `extension/dist` Reload → 데모 모드(`?mode=demo`) 화면 5개·엔진 탭·필터·상세 모달·고객사 전환·폼 오류 확인. 콘솔 오류 0건이어야 한다.
3. `docs/naver-collection.md`·`docs/inspections-api.md`의 `main.ts` 참조를 `src/app/*` 경로로 갱신한다.
4. 네이버 실탭 `site_missing`·포커스 에뮬레이션 후속은 아래 과거 요약의 "후속 작업과 검증 한계"를 따른다.

## 과거 인계 요약 — 2026-11-17 커밋 정리·포커스 에뮬레이션 검증 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-17 커밋 정리·후속 검증`을 우선한다. 이전의 “원인 미확정·전부 미커밋” 기록은 아래 실제 재현 결과와 커밋 상태로 갱신됐다. 실제 네이버 URL 제출·접수 성공과 본 확장에 포커스 에뮬레이션 적용은 아직 미완료다.**

### 현재 구현과 커밋

- 현재 브랜치는 `feat/naver-url-collection`이다. 기존 글 재알림 API는 `2f8f94b`, 네이버 GUI 수집 엔진은 `93b0f0a`, 발행 체크박스·기존 글 확인 모달·결과 UI는 `cdf9c53`으로 로컬 커밋했다. 이 인계와 사용법은 별도 문서 커밋으로 정리한다. push·PR·병합·배포는 요청 범위가 아니다.
- 학습용 주석과 순수 함수 분해를 포함한 `publication/controller.ts` 최신 편집본을 그대로 보존했다. 기존 Vite 프록시 변경·ZIP·비밀파일·비공개 기록·`dist`는 커밋하지 않는다.

### 이번에 확인한 실패 원인과 대안

- 사이트 목록에 표시된 메인 URL과 실제 발행 명령의 정규화 대상이 일치했다. 실제 개발 확장 문맥에서도 정확한 링크 하나와 정상 가시성 조건을 확인했다. 사이트 미등록이나 고정된 URL 비교 오류로 단정하지 않는다.
- 새 네이버 board 문서를 비활성 탭에서 로드하면 `ready:false`가 유지됐다. 그 상태에서 실제 `select_collection_site`를 호출하자 약 15.6초 후 `site_missing`이 나왔다. **새로고침하지 않은 같은 문서**를 활성화하면 `ready:true`가 되고 같은 URL의 사이트 선택이 2ms 만에 성공했다.
- 실제 발행 runner는 먼저 `waitPage()`를 거친다. 표 자체가 없으면 앞 단계에서 `timeout`, 표는 있지만 대상 링크가 준비되지 않으면 선택 단계에서 `site_missing`이 날 수 있다. 직접 선택 함수 재현과 과거 발행 실패 당시의 DOM 관측 범위를 구분하며, 모든 과거 실패가 동일 원인이었다고 단정하지 않는다. Chrome 내부의 정확한 렌더링 중단 원인은 미확정이다.
- 사용자는 **Chrome을 계속 사용하는 동안 화면을 뺏지 않는 백그라운드 처리**를 원한다. 탭 활성화는 진단 조건이며, 이를 제품의 기본 해결책으로 적용하지 않는다.
- DevTools의 **Emulate a focused page**를 수동 적용해 끔→켬→켬→끔으로 비교했다. 끈 상태는 `site_missing`(약 15.7초·15.2초), 켠 상태 두 번은 새 문서의 사이트 선택(5ms·58ms)과 **요청 → 웹 페이지 수집** 화면 준비까지 성공했다. 네 번 모두 관리 탭 선택이 유지됐으며 글 URL 입력·실제 수집 제출·IndexNow 전송은 하지 않았다.
- 검증 후 에뮬레이션을 끄고 Rendering 패널을 닫았다. 관리 탭을 새로고침해 임시 함수 제거도 확인했다. 이 결과는 DevTools 수동 검증이며 현재 프로젝트 manifest에 `debugger` 권한이나 CDP 연결 코드를 추가한 것이 아니다.

### 후속 작업과 검증 한계

- 별도 실험 확장은 `/tmp/startpress-focus-probe-20261117`에만 준비했다. 타입·빌드·모의 수명주기 검사와 코드·보안 리뷰를 통과했지만 **로드·새 debugger 권한 부여·실제 CDP 연결은 하지 않았다**. 임시 폴더이므로 이후 파일 존재를 재확인한다. 이 실험 코드는 현재 저장소 커밋에 포함하지 않는다.
- 사용자에게 실험 확장의 `debugger` 권한 부여 직전 확인을 요청했으며 아직 승인 응답은 없다. 이후 질문은 필요한 권한과 스크립트 변경의 의미에 관한 것이었고, 현재 요청은 기존 변경의 로컬 커밋이다. 커밋 승인을 디버거 권한 승인으로 해석하지 않는다.
- 다음은 사용자 승인 후 실험 확장에서 DevTools를 닫은 상태의 CDP 연동·백그라운드 화면 전환·취소·페이지 종료 시 해제를 검증하는 것이다. 그 뒤 본 확장의 권한과 연결·정리 모듈 적용 여부를 결정한다. 실제 수집 제출·접수 확인은 별도 단계다.
- 이번 커밋 전 재검증: 프론트 **208 passed**, 백엔드 단위 **694 passed**, 로컬 PostgreSQL의 UUID 임시 DB 통합 **7 passed**, TypeScript·확장 빌드·diff 검사 통과. 코드·백엔드 보안 리뷰에서 커밋 차단 이슈는 발견하지 못했다. 단위 테스트는 동명 통합 모듈 충돌을 피하려고 `tests --ignore=tests/integration`으로 실행했다.
- 비공개 진단 기록: `.secrets/bot_runs/site-missing-deep-20261117T060214Z.jsonl`, `.secrets/bot_runs/focus-emulation-20261117T075146Z.jsonl`. 인증값·실제 입력값·쿼리·원본 요청/응답은 커밋하지 않는다.

## 과거 인계 요약 — 2026-11-17 네이버 GUI 실재현·접수 미완료 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-17 네이버 GUI 실검증 중단`을 우선한다. 아래 181/199개 테스트·실제 GUI 미실행 설명은 이전 단계 기록이다. 최신 프론트는 208개 통과했지만, 실제 네이버 수집 요청 접수는 여전히 확인하지 못했다. 테스트 통과나 로딩 대기 보완을 실제 문제 해결로 설명하지 않는다. 사용자 요청으로 디버깅을 중단하고 인계만 갱신한다.**

### 완료된 구현

- **새 글 발행 알림**의 별도 체크박스 `네이버 GUI로도 수집 요청` → 탭 준비/선택 → 글 저장·선택적 IndexNow → 네이버 GUI 수집 흐름을 구현했다. 전체 색인 조회를 먼저 할 필요가 없다. 처음 만들었던 조회 종료 후 수집 폼은 사용자 의도와 달라 제거했다. 현재 `collection-view.ts`는 없고 `publication/view.ts`가 발행 진행·접수 UI를 담당한다.
- `DUPLICATE_PAGE` 409에만 현재 고객사·부모·정확한 URL·활성 상태가 일치하는 기존 글을 GET으로 확인한 뒤 모달을 표시한다. **계속 요청**을 누르면 기존 글을 다시 저장하지 않고 체크한 IndexNow·네이버 GUI를 실행한다. 취소/닫기/Escape는 해당 URL만 건너뛰며 전체 취소는 배치를 중단한다. 실행 ID·확인 ID, 오래된 이벤트·이중 클릭·키보드 포커스/배경 inert를 검증한다.
- 기존 글 IndexNow 재알림: `POST /sites/{main_site_id}/pages/{page_id}/notifications`, 필수 JSON `expected_url`, `application/json`만 허용. 서버는 소속·활성·범위·승인 URL 일치를 재검증한 뒤 읽기 트랜잭션을 닫고 기존 IndexNow 클라이언트를 한 번 호출한다. DB 행·제목·생성일 변경과 마이그레이션은 없다. 기존 생성 API의 중복 409 동작은 유지한다.
- 신규 저장은 `saved`, 기존 글 재사용은 `existing`으로 구분하며, IndexNow/GUI 접수와 수집·색인 완료는 별개다. 외부 알림 실패를 DB 저장 여부 불명과 섞지 않고 자동 재전송하지 않는다. Bing GUI 제출·Google 개별 URL 제출은 추가하지 않았다.
- 디자인 요청을 반영해 중첩 결과 카드를 제거하고 헤더·문구·탭·표의 inset을 데스크톱 25px/모바일 18px로 통일했다. 체크박스와 설명을 묶었고 표는 검사 화면 전용 CSS 변수에 의존하지 않는다.

### 실제 화면에서 확인한 사실과 남은 문제

- 검증 대상은 사용자가 지정한 **RAG 고도화(1) - 데이터셋 구축**, 메인 `https://otteru.vercel.app/`, 글 `https://otteru.vercel.app/ko/3f0210261e9580279e7df70694ef7ddb`다. 이 글에 대해 모달과 **기존 글 사용 / 알림 접수됨**을 실제 StartPress 화면에서 읽었다. 이 IndexNow 접수는 사용자의 이전 실행 결과이며 에이전트가 새로 성공시킨 것이 아니다.
- 브라우저 DOM 도구는 `The browser access host is unavailable`였다. 처음에는 네이티브 Chrome 화면 읽기와 사용자 탭 전환으로 관찰했으나, 사용자가 **직접 조작하는 computer use**를 명시적으로 요구했다. 이후 `mcp__cua_repl`의 `cua.getApp('com.google.Chrome')`으로 클릭·체크박스·입력·탭 전환·새로고침을 직접 수행했다. 읽기 도구만으로 조작 불가라고 반복하지 않는다. 셸/AppleScript/외부 브라우저 자동화로 우회하지 않았다.
- 모든 재현 실행은 **IndexNow 체크 해제 / 네이버 GUI 체크** 상태였다. 중복 모달을 확인하고 GUI만 시도했다. IndexNow 재알림 API를 다시 실행하지 않았다. 네이버의 실제 확인 버튼·새 접수 행까지 도달하지 못했고, 관찰한 요청 내역에는 지정 글이 없었다. 실패 재현 횟수를 실제 수집 제출 횟수로 설명하지 않는다.
- 첫 재현은 일반 문구 `발행 후속 작업을 확인하지 못했습니다`였다. 네이버 탭 새로고침 후 자동 인증 리다이렉트가 정상 복귀했고, 다음 실행은 board로 이동한 뒤 `site_missing`이었다. 이후 이미 로딩된 board에서 실행하면 사이트 선택을 통과해 summary로 이동했으나 `ambiguous_control`로 멈췄다. 메뉴가 표시된 뒤 네이티브 UI로 **요청 → 웹 페이지 수집**을 클릭하면 정상 이동했다.
- 로딩 지연을 보완한 새 빌드를 **실제 개발 확장에 적용하고 네이버 탭도 새로고침**했지만, 마지막 실행은 15초 대기 후에도 `site_missing`으로 끝났다. 화면에는 이제 **요청 안 함**으로 표시된다. **따라서 실제 원인을 단순 로딩 지연으로 확정하거나 수정 완료로 말하면 안 된다.**
- 네이버 board의 실제 DOM을 DevTools에서 읽어 확인했다. 첫 사이트 링크는 `a[href="#"].d-block...api_link`, 표시 텍스트는 정확한 메인 URL, 계산된 href는 같은 출처의 `/console/board#`다. 텍스트의 canonical은 `https://otteru.vercel.app/`, rect 수 1, 계산된 visibility `visible`이며 숨김·비표시 조상도 없었다. 백그라운드 진단에서도 `document.visibilityState='hidden'`, rect 수 1, 텍스트 비교 true였다. 단순 백그라운드 rect=0 가설은 뒷받침되지 않았다.
- 로컬 API GET으로도 해당 메인 사이트 URL이 `https://otteru.vercel.app/`, 활성 true임을 확인했다. 화면과 DB URL 불일치는 현재 증거에서 발견하지 못했다. 공개 메인 URL·활성 여부만 읽었으며 키·쿠키·토큰은 읽거나 출력하지 않았다.
- Chrome 툴바에 StartPress 아이콘이 둘 보였고, 네이버 DevTools의 실행 문맥에는 같은 이름의 StartPress 항목이 여러 개 있었다. 한 문맥에서 `chrome.runtime.id`를 읽으려다 runtime이 undefined인 것을 관찰했으나, 유효/무효·확장/프레임 구분은 끝내지 못했다. **복수 확장이나 무효 컨텍스트가 원인이라는 것은 아직 추정**이다. 마지막에는 DevTools 문맥 선택 중 오래된 AX 요소 ID 오류가 발생했고 사용자가 인계를 요청했다.

### 이번 디버깅에서 보완한 코드

- `collection.ts`: 수집 전용 `selectNaverCollectionSite()`가 정확한 사이트 링크를 최대 15초 기다리고, `openNaverCollection()`도 요청 메뉴 헤더 렌더를 기다린다. 취소·사용자 조작·주소 변경·중복 컨트롤은 중단한다. 클릭 직전에 동일한 predicate와 유일성·동일 노드를 재검증하며 클릭은 한 번뿐이다. **이 보완만으로 실탭 문제는 해결되지 않았다.**
- `content.ts`/`collection-automation.ts`: 수집 사이트 선택은 비동기 `select_collection_site` 명령으로 분리했다. 기존 색인 검사 `select_site` 동작은 유지했다. 콘솔 이동은 `open_board` → 사이트 선택 → `open_collection` → `request_collection`이다.
- `automation.ts`/`observation.ts`: 제출 전 Chrome 메시지의 원본 Error를 `script_unavailable` 고정 안내로 변환하고, 문서 전환 중의 상태 조회는 제한 시간 내 재대기한다. 실제 `request_collection` 전송 후 연결 단절은 여전히 `receipt_unconfirmed`이며 자동 재전송하지 않는다.
- `publication/controller.ts`: 제출 전 `site_missing`·`ambiguous_control`·연결 오류 같은 타입 있는 실패는 `blocked`/요청 안 함으로 표시한다. 실제 제출 후 불확실과 구분한다. 이전에는 `onStart()`가 목록 이동 전부터 호출되므로 시작 전 실패도 접수 미확인으로 잘못 표시될 수 있었다.
- `publication/view.ts`: 탭 준비 설명은 주소·문서 로딩 확인이라는 사실만 표시하도록 수정했다. 탭 준비됨을 콘텐츠 연결·로그인·GUI 제출 성공으로 해석하지 않는다.

### 검증과 현재 작업 트리

- 최신 프론트 전체 **208 passed** (`/tmp/naver-live-final-tests.log`), TypeScript 검사·관리 화면/네이버/Bing 콘텐츠 스크립트 빌드·`git diff --check` 통과. 로딩 대기·클릭 직전 변조·연결 오류·제출 전/후 상태 구분 회귀를 추가했고 코드 리뷰를 받았다. 이 수치는 모의 테스트다.
- 직전 중복 모달/API 단계의 백엔드 단위 **694 passed**, UUID 임시 PostgreSQL 통합 **7 passed**는 완료했다. 그 이후 디버깅은 프론트만 바꿨으므로 백엔드 테스트를 다시 실행하지 않았다. 실제 외부 IndexNow/네이버 접수·수집·색인 성공이나 운영 배포 근거로 사용하지 않는다.
- 현재 브랜치 **`feat/naver-url-collection`**, HEAD **`da7155f` — Merge pull request #9 from StartPress26/feat/main-page-inspection-dashboard**. 새 변경은 전부 미커밋이다. 커밋·push·PR·운영 배포·버전 증가·ZIP 재생성은 하지 않았다. 로컬 manifest/package 버전은 0.1.1이다.
- 개발 확장 ID **`ibdnlkjpolhjadejfmllpkglggknmbpg`**, Chrome 확장 상세에서 **Unpacked / `~/Desktop/study/sideProject/webmaster_automation/extension/dist`**를 직접 확인했다. 로컬 빌드 후 해당 확장의 Reload를 눌렀고, 네이버 문서 새로고침 및 새 관리 탭 열기까지 수행했다. 마지막 빌드의 `naver-content.js`는 약 18.08 kB다. 실제 설치 확장과 작업 트리 소스를 혼동하지 않도록 다음 실행 직전에 재확인한다.
- 사용자는 로컬에서 `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 18001`로 API를 실행한다. 이 경우 저장된 Python 변경은 자동 반영되며 Docker 재빌드 안내는 현재 로컬 환경에 필요 없다. 운영 Docker와 구분한다. 설치 확장 API는 18001, 기존 Vite 개발 프록시는 사용자 변경인 8000이다.
- 보존할 기존 변경: **`extension/vite.config.ts`**, **`extension/startpress-extension.zip`**. `.env`·`.secrets`·`dist`·토큰·키·실행 원문은 커밋하지 않는다. 기존 ZIP은 최신 소스와 일치하는 산출물이 아니다. 사용자 학습용 주석 등 다른 로컬 편집을 임의로 되돌리지 않는다.

### 다음에 해야 할 작업

1. 가장 먼저 실탭의 `site_missing` 원인을 추적한다. top 문서의 실제 링크 predicate는 정상인 반면 콘텐츠 명령에서는 매칭되지 않는 이유가 미해결이다. **실제 수신하는 콘텐츠 스크립트의 확장 ID/문서/프레임, 명령 payload의 정규화된 대상과 DOM 탐색 결과**를 민감값 없이 비교하는 것이 다음 진단 후보다. 같은 이름의 여러 DevTools 문맥을 하나라고 가정하지 않는다.
2. 다음 조작 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 새 비공개 실행 기록을 만든다. `cua.getState()`의 브라우저 호스트가 없어도 사용자 명시 요청에 따라 네이티브 Chrome 앱 조작은 실제로 가능했으므로 도구의 현재 동작을 확인한다. AX 요소 ID는 새 상태에서 재획득한다.
3. 지정한 글의 기존 네이버 요청 내역을 먼저 확인한다. 이미 접수되어 있다면 반복 제출하지 않는다. 재현이 필요하면 **IndexNow 해제 / 네이버 GUI만 선택**하고 현재 문서·대상을 확인한 뒤 실행한다. 추가 인증·CAPTCHA는 자동 처리하지 않고 사용자에게 맡긴다.
4. 실제 접수 성공은 새 URL/갱신 등록일 행으로 확인한 뒤에만 말한다. 그 후 수집·색인 완료는 별도로 검사한다. mock 테스트가 통과했다는 이유로 실제 GUI 해결로 보고하지 않는다.
5. 사용자 요청 시 변경을 리뷰·커밋한다. 현재 미커밋이 많으며 백엔드 API·발행 UX·네이버 DOM·디자인·실재현 보완이 섞여 있으므로 파일별 변경을 확인한 뒤 나눈다. `main/master` 직접 push 금지, 한국어 `[타입] 제목`, 공동 작성자 없음.

### 관련 파일과 비공개 기록

- `extension/src/publication/{controller,tabs,view}.ts`, `extension/src/main.ts`, `extension/src/{api,batch,types}.ts`, `extension/src/styles.css`: 발행 UI·중복 승인·기존 글 재알림·실행 상태.
- `extension/src/engines/naver/{collection,collection-automation,content,observation,automation}.ts`: 이번 미해결 GUI 진단의 핵심.
- `app/api/pages.py`, `app/services/page.py`, `app/schemas/page.py`: 기존 글 IndexNow 재알림 API와 검증.
- `extension/tests/{publication,workspace,existing-notification-api,naver-collection,naver-collection-automation,naver-connection}.test.mjs`, `tests/test_page_notifications*.py`, `tests/integration/test_page_notifications_api.py`: 관련 회귀.
- `docs/pages-api.md`, `docs/naver-collection.md`: 계약·사용법. 이 인계의 실제 실패 상태가 기존 문서의 테스트/구현 완료 설명보다 우선한다.
- 이번 실제 조작 기록: **`.secrets/bot_runs/naver-gui-trace-20261116T124226828285Z.jsonl`**. 사용자 인계 요청으로 종료 상태를 append했다. 0700 디렉터리·0600 파일이며 쿼리·실제 입력값·인증값·원본 응답을 보존하지 않는다.
- 앞선 읽기 실패 기록: `.secrets/bot_runs/naver-gui-failure-20261116T124044Z.jsonl`. 과거 구조 관측/도구 중단 기록은 `.secrets/bot_runs/naver-collection-20261116T112500Z.jsonl`, `.secrets/bot_runs/naver-publication-ui-20261116T115754807933Z.jsonl`이다.
- Chrome에는 검증용 StartPress 관리 탭과 네이버 board가 열려 있고 네이버 DevTools도 남아 있을 수 있다. 마지막 체크박스는 IndexNow 해제·GUI 선택이었다. 인계 시 추가 화면 조작·폼 제출은 하지 않는다. 다음 실행은 반드시 현재 화면을 새로 관측한다.

## 최신 추가 — 2026-11-16 중복 글 모달과 IndexNow 재알림

- 사용자 요청으로 `DUPLICATE_PAGE` 발생 시 현재 고객사·부모·URL의 활성 기존 글을 확인한 뒤 모달을 띄운다. **계속 요청**을 승인하면 글을 재저장하지 않고 선택한 IndexNow 재알림과 네이버 GUI를 모두 실행한다. 취소·Escape는 해당 URL만 건너뛰며 전체 취소는 배치를 중단한다.
- 백엔드 `POST /sites/{main_site_id}/pages/{page_id}/notifications`를 추가했다. JSON `expected_url` 필수이며 DB 대상·활성·범위·승인 URL 일치를 검증한 뒤 트랜잭션을 닫고 한 번 알린다. 생성 API의 중복 409 의미는 유지한다. 기존 글 ID·제목·생성일을 바꾸지 않으며 마이그레이션은 없다.
- 기존 글은 `existing`/기존 글 사용으로 표시하고 IndexNow·GUI 접수와 색인 완료를 구분한다. 알림 실패가 저장 여부 불명으로 섞이지 않으며 모달 승인 전 전송·이중 확인·오래된 확인 이벤트·자동 재전송을 막는다.
- 최종 프론트 **199 passed**, 백엔드 단위 **694 passed**, UUID 임시 PostgreSQL 통합 **7 passed**, TypeScript·빌드·diff 검사 및 코드·보안 리뷰 통과. 실제 외부 제출·운영 DB 변경·배포는 하지 않았다. **운영에서 기존 글 IndexNow 재알림을 쓰려면 확장과 API를 함께 업데이트해야 한다.**
- 현재 `feat/naver-url-collection`의 미커밋 변경이며 기존 Vite·ZIP을 보존했다. 상세 사용법·계약은 `docs/naver-collection.md`, `docs/pages-api.md`를 따른다. 아래 기존 181개 검증과 신규 저장 글만 GUI 실행하던 설명은 모달 추가 전 기록이다.

## 현재 작업 — 2026-11-16 발행 알림에서 네이버 GUI 수집 요청 / Asia/Seoul

- 사용자 정정에 따라 GUI 수집을 **새 글 발행 알림**의 `네이버 GUI로도 수집 요청` 체크박스로 이동했다. 전체 색인 조회는 선행하지 않는다. 체크는 기본 해제이며 **글 저장 및 발행 알림**을 눌렀을 때 실행한다. 이전의 조회 종료 후 작업 탭 수집 폼은 제거했다.
- GUI를 선택하면 글 저장 전에 네이버 탭을 확인한다. 단일 후보는 자동 확인, 여러 후보는 선택 대기, 후보 없음은 탭 준비 안내이며 준비되기 전에는 DB 저장·IndexNow·GUI 제출을 하지 않는다. 선택 후 자동으로 이어간다.
- `publication/controller.ts`가 시작 고객사·사이트·글·체크박스를 고정하고 글 저장/IndexNow → 저장 확인된 글의 네이버 GUI 요청 순서로 진행한다. IndexNow를 끄고 GUI만 선택할 수 있다. 글 저장 여부 불명인 배치는 GUI를 실행하지 않는다.
- `publication/view.ts`가 발행 폼 밖에 탭 선택과 URL별 GUI 접수를 표시한다. 기존 전체조회 수집용 `collection-view.ts`와 inspection controller의 수집 진입점은 제거했다. 기존 색인 조회는 그대로 유지한다.
- 네이버 runner는 board가 아니면 상단 **웹마스터 도구** → 등록 사이트 선택 → **요청 → 웹 페이지 수집** 메뉴 클릭 → URL 입력·확인 순서다. 접수는 `accepted`, 수집·색인은 `unknown`이며 GUI 접수를 색인 관측 DB나 대시보드 통계로 저장하지 않는다.
- 발행 취소는 현재 저장 응답을 보존하고 다음 저장·GUI 요청을 중단한다. 제출 후 불확실한 요청은 자동 재전송하지 않는다. 발행 중 같은 관리 화면의 전체 조회와 중복 발행을 막는다.
- 이번 구체 구현 대상은 네이버 GUI다. Bing은 기존 IndexNow 알림을 유지한다. Google 개별 URL 제출은 추가하지 않았다.
- 현재 브랜치 `feat/naver-url-collection`, 시작 HEAD `da7155f`(PR #9 main 병합). 기존 `extension/vite.config.ts`·ZIP은 보존한다. 커밋·push·배포·ZIP 재생성은 하지 않았다.
- 이전 로그인 화면 조사는 사이트 선택·수집 화면 구조까지 확인했고 실제 제출은 하지 않았다. 이번 추가 브라우저 재확인은 도구 dispatch 전 중단되어 메뉴 클릭 코드의 추가 실탭 검증은 미완료다. 기록은 `.secrets/bot_runs/naver-publication-ui-20261116T115754807933Z.jsonl`이다. 기존 조사 기록도 유지한다.
- 최종 프론트 테스트 **181 passed**, TypeScript 검사·관리 화면/네이버/Bing 콘텐츠 빌드·`git diff --check` 통과. 코드 리뷰에서 다른 사이트 전환 시 진행·취소 UI가 숨는 문제를 보완하고 재검증했다. 사용법은 `docs/naver-collection.md`를 따른다. 실제 접수·수집·색인 완료는 미검증이다.

## 현재 인계 요약 — 2026-11-16 메인 사이트 대시보드·Bing 표시 통일·PR #9 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-16 메인 사이트 대시보드 PR #9`를 우선한다. 아래 메인페이지 표시 미구현·Bing 라벨 미정리·통합 테스트 미실행·push/PR 미승인 설명은 과거 상태다.**

- 브랜치는 `feat/main-page-inspection-dashboard`다. 기존 버전 0.1.1 커밋 `a92d0cf`와 인계 커밋 `858c1ec` 위에 기능·테스트·문서를 **`1616e68` — `[feat] 메인 사이트 검사 현황을 대시보드에 반영`**으로 커밋했다. 후속 사용자 요청으로 해당 기능 커밋을 같은 원격 브랜치에 push하고 main 대상 [PR #9](https://github.com/StartPress26/webmaster-automation/pull/9)를 생성했다. 이 인계 갱신은 별도 docs 커밋으로 정리해 같은 브랜치에 push한다. 병합·운영 배포는 하지 않는다.
- `GET /clients/{id}/dashboard`의 블로그별 응답에 `main_page.google/naver/bing`을 추가했다. 메인 사이트 ID의 기존 최신 관측을 일괄 조회하며, 저장 행이 없으면 null이다. 등록 글 수·글 통계에는 합산하지 않고 비활성 사이트의 이전 상태도 표시한다. DB 테이블·마이그레이션 추가는 없다.
- 대시보드에 메인 URL·엔진별 상태·성공 관측 시각·최근 오류를 별도 표로 표시한다. 성공 관측이 없으면 미확인으로 표시하며, 필드가 없는 이전 서버 응답은 서버 업데이트 안내로 구분한다. 예시 모드도 메인 관측과 글 통계를 분리한다.
- 기존 전체 조회는 이미 활성 메인 사이트와 활성 글을 검사하므로 재사용했다. 실행 목록에 메인 사이트·개별 글 구분을 추가했고, 글 0개 사이트 검사와 종료 후 대시보드 자동 재조회·결과 반영을 DOM 회귀 테스트로 확인했다.
- Bing 상세 상태 순서·문구를 Google·네이버와 통일했다. 상단 카드와 블로그별 표는 모두 `indexed`를 `Bing 색인 확인`으로 표시한다. `crawled`는 별도 상태로 유지하며 색인 완료로 변환하지 않는다. Bing API·GUI가 최신 상태 한 행을 공유하는 구조는 유지한다.
- 이번 최종 검증: 백엔드 단위 **655 passed**, 임시 PostgreSQL의 대시보드 API 통합 **5 passed**, 프론트 **136 passed**, TypeScript·관리 화면/네이버/Bing 콘텐츠 스크립트 빌드·`git diff --check` 통과. 통합 테스트는 UUID 이름의 임시 DB를 생성·삭제했고 개발 DB를 마이그레이션 대상으로 삼지 않았다. 리뷰에서 커밋을 막는 문제는 발견하지 못했다.
- 설치 확장의 API는 `127.0.0.1:18001`이다. 운영은 SSH 터널→Lightsail을 사용한다. 확장에서 로컬 API를 시험할 때는 같은 포트의 SSH 터널을 종료하고 API를 18001로 실행한다. 현재 Vite 개발 프록시는 로컬 8000이며 설치 확장에는 적용되지 않는다. 로컬 API는 `.env`의 DB를 사용하므로 Docker 로컬 DB·등록 데이터·인증파일을 운영과 구분한다.
- 실제 Chrome GUI 전체 순회·Lightsail 배포·이번 변경의 스토어 업로드는 이번 검증에 포함하지 않았다. 버전은 **0.1.1**을 유지했고 기존 ZIP은 재생성하지 않았다. 다음 스토어 업데이트는 더 높은 버전과 새 ZIP이 필요하다.
- 커밋 제외로 보존: `extension/vite.config.ts`, `extension/startpress-extension.zip`, `dist/`, `.env`, `.secrets`, 토큰·키·비공개 실행 기록. 최종 커밋은 `git log -1`과 `git status`로 확인한다.

### 진행 중인 작업과 다음 순서

1. PR #9 리뷰를 진행한다. 이번 요청은 PR 생성까지이며 자동 병합하지 않는다.
2. 사용자 병합·배포 요청 후 Lightsail의 main을 갱신하고 API 이미지를 재빌드한다. 이번 기능은 DB 마이그레이션이 필요 없으며, 기존 운영 DB의 메인 사이트 관측을 새 응답에서 반환한다.
3. 새 확장을 적용해 `main_page` 응답과 메인 사이트 표시·전체 조회 후 자동 갱신을 실제로 확인한다. 실제 브라우저 작업 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 비공개 실행 기록을 남긴다.
4. 스토어 배포 요청 시 버전을 0.1.1보다 높이고 재검증·빌드·ZIP 생성을 진행한다. 기존 ZIP이 이번 브랜치의 최신 소스와 일치한다고 설명하지 않는다.

### 관련 파일

- `app/services/dashboard.py`, `app/schemas/dashboard.py`: 등록 글 집계와 메인 사이트 관측 응답.
- `extension/src/dashboard.ts`, `extension/src/types.ts`, `extension/src/styles.css`: 메인 사이트 표와 엔진별 표시 통일.
- `extension/src/inspection/client-view.ts`: 실행 목록의 메인 사이트·개별 글 구분.
- `tests/integration/test_dashboard_api.py`, `extension/tests/dashboard.test.mjs`, `extension/tests/client-inspection.test.mjs`, `extension/tests/workspace.test.mjs`: DB 분리·표시·자동 갱신 회귀 검증.
- `docs/dashboard-api.md`: 응답 계약·집계 범위·서버 선반영 안내.

## 이전 인계 요약 — 2026-11-16 운영 검증·확장 0.1.1·미커밋 정리 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-16 운영 검증·확장 미커밋`를 우선한다. 아래 11월 12일 기록의 PR 미병합·운영 미검증·버전 0.1.0 등은 당시 상태다.**

### 완료된 작업

- [x] 사이트별 인증 연결은 PR #8로 main에 병합됐다. 병합 커밋은 `f98566f`다. 에이전트가 11월 16일 GitHub의 MERGED 상태와 로컬 main 이력을 확인했다. 관련 구현·설정·문서 커밋은 `103ce1d`, `d408424`, `c21efe5`, `b4b137c`다.
- [x] 사용자가 Lightsail에서 main 갱신, API 이미지 빌드, 마이그레이션 실행, 새 Google 파일 설치, API 실행을 진행했다고 보고했다. Docker 소켓 권한 때문에 서버 명령에는 `sudo docker compose`를 사용했다. 현재 운영 Alembic 리비전과 서버 HEAD의 원문 출력은 에이전트가 직접 확인하지 않았다.
- [x] 서버 비밀폴더는 `/home/example-user/webmaster-secrets`이며 컨테이너 `/srv/startpress/.secrets`에 마운트한다. 하위 `google/<이메일>.json`은 Google OAuth JSON, `bing/<이메일>.json`은 `{"api_key":"..."}`다. Google 폴더에 실제 계정 파일명이 잘못 저장돼 있던 것을 확인한 뒤, 사용자가 재인증된 로컬 토큰을 서버에 설치했다. 비밀값은 문서·Git에 보존하지 않는다.
- [x] 사용자가 운영 계정 등록 201과 테스트 메인 사이트의 계정 PATCH 성공 응답을 제공했다. 이어 운영 Google `indexed`, Bing API `crawled` 응답을 제공해 계정별 인증·실조회·결과 저장 성공을 확인했다.
- [x] 확장 최신 소스에서 테스트 **131 passed**, TypeScript 검사·관리 화면·네이버/Bing 콘텐츠 스크립트 빌드를 통과했다. 처음 만든 0.1.0 ZIP은 이미 게시된 버전과 같아 스토어에서 거절됐다. 이후 manifest·package·lockfile 루트 버전을 **0.1.1**로 일치시켜 재빌드하고 ZIP을 교체했다.
- [x] 사용자가 0.1.1 업로드·심사 제출과 심사 통과를 보고했다. 에이전트가 스토어의 게시 상태·설치 버전을 직접 확인한 것은 아니다. 비공개 테스터 설치를 안내했고 스토어 설치본과 개발자 모드 로드본을 구분했다.

### 현재 브랜치와 미커밋 변경

- 현재 브랜치: **`feat/main-page-inspection-dashboard`**. 커밋 계획 작성 기준 HEAD **`c0e60ba` — `fix:dashboard에서 bing.crawld -> bing.indexed 세게 하기`**. 이 커밋은 사용자가 이미 만든 것으로 보존하며 이번 요청에서 amend·rebase·메시지 변경을 하지 않는다. 현재 브랜치의 원격·PR 상태는 이번 요청에서 조회하지 않았다.
- `c0e60ba`는 `extension/src/dashboard.ts`의 상단 Bing 카드 값만 `data.bing.crawled`에서 `data.bing.indexed`로 바꿨다. 카드 이름은 여전히 `Bing 크롤링 확인`이며 블로그별 표는 `site.bing.crawled`를 사용한다. 이 커밋이 완전한 표시 수정이라고 설명하지 않는다.
- 커밋 계획 보고 당시 미커밋 tracked 파일은 **4개**였다. `extension/package.json`, `extension/package-lock.json`, `extension/public/manifest.json`은 0.1.0 → 0.1.1 버전 변경이다. `extension/vite.config.ts`는 이전부터 사용자가 보존한 개발 프록시 18001 → 8000 변경과 설명 주석이다.
- 미추적 파일은 **`extension/startpress-extension.zip`**이며 보존한다. 인계 작성 때는 문서만 수정했고 이후 사용자가 계획한 커밋·push 진행을 승인했다. 버전 파일 3개는 `a92d0cf`로 커밋했으며 이 문서를 두 번째 커밋으로 정리한다. 최종 HEAD와 원격 일치는 `git log -2 --oneline`, `git status`, `git ls-remote origin refs/heads/feat/main-page-inspection-dashboard`로 확인한다.
- 최초 요청은 미커밋 확인·커밋 계획 보고·인계 문서 갱신이었다. **후속 요청으로 계획한 2개 커밋과 현재 브랜치 push를 승인했다.** 기존 `c0e60ba`도 새 원격 브랜치 이력에 포함된다. PR·추가 기능 수정·배포·새 검색엔진 검사는 이번 실행 범위가 아니다.

### 승인된 커밋 분리

1. **`[chore] 확장 프로그램 버전을 0.1.1로 갱신`**
   - 대상: `extension/package.json`, `extension/package-lock.json`, `extension/public/manifest.json`.
   - 이미 스토어에 제출한 패키지의 버전 정보를 Git 소스에도 기록한다. 의존성 내용은 바뀌지 않았다.
2. **`[docs] 운영 인증 검증과 확장 배포 현황 인계`**
   - 대상: `docs/HANDOFF.md`.
   - 운영 검증 근거, 0.1.1 패키지·심사 통과 사용자 보고, 현재 브랜치·표시 문제·다음 작업을 기록한다.

**커밋 제외:** `extension/vite.config.ts`, `extension/startpress-extension.zip`, `dist/`, `.env`, `.secrets`, 토큰·키·백업·비공개 실행 기록. 승인된 파일만 명시적으로 스테이징한다. 새 커밋은 한국어 `[타입] 제목`을 쓰고 공동 작성자 트레일러를 넣지 않는다.

### 실제 대시보드 조사 결과

- 사용자가 전체 조회 후 Google·네이버·Bing 확인 건수가 0인 화면을 제공했다. 에이전트는 SSH 터널 `127.0.0.1:18001`을 통해 운영 대시보드·등록 글·저장 검사 결과를 **GET만** 수행해 조사했다. 새 검사·GUI 자동화·DB 변경은 하지 않았다.
- 조회 시점 메인 URL `https://otteru.vercel.app/`의 저장 상태는 Google·네이버·Bing 모두 `indexed`였다. 별도로 등록된 글은 1개이고 이름은 `메인 페이지`이나 URL은 **`https://otteru.vercel.app/ko/3f0210261e95801586aadebb742f4078`**이다. 이름만 보고 루트 메인페이지라고 판단하지 않는다.
- 등록 글의 11월 16일 18:57~18:58 KST 저장 결과는 Google **`not_indexed`**, 네이버 **`unknown`**, Bing **`indexed`**이고 세 엔진의 `error_code`는 모두 NULL이었다. 이는 해당 시점 저장 관측이지 이후 외부 검색엔진 상태를 새로 검증한 결과가 아니다.
- `app/services/dashboard.py`는 `target_type='page'`만 집계하므로 루트 메인페이지의 indexed 관측은 합산하지 않는다. 성공 관측 시각은 색인 성공 시각이 아니라 조회·관측 시각이다.
- Bing API는 크롤링 관측을 반환하고 Bing GUI는 색인 여부를 판독한다. 두 경로는 `(site_id, engine)`의 같은 최신 상태 행을 사용한다. GUI의 indexed 저장 이후 crawled 건수가 0, indexed 건수가 1인 것은 데이터 구조상 정상이다. 상세 패널의 `저장된 색인 확인 1개`가 이 값이다.
- 현재 요약 표시에는 문제가 남아 있다. 상단 카드는 커밋 `c0e60ba` 이후 indexed 값을 `크롤링 확인` 이름으로 표시하고, 블로그별 표는 여전히 crawled만 표시한다. 색인과 크롤링을 분리해 정확한 이름·값으로 일치시키는 수정과 테스트가 필요하다.
- 브랜치 이름과 달리 **메인페이지 전용 집계·응답 필드·화면 구현은 현재 변경에서 확인되지 않았다.** 등록 글 집계와 분리해 보여줄 요구사항을 먼저 확정한다. 사용자 요청 없이 메인페이지를 등록 글 통계에 합산하지 않는다.

### 검증·ZIP 상태와 주의사항

- 이번 인계 요청에서 현재 HEAD의 프론트 테스트를 재실행해 **131 passed**를 확인했다. `git diff --check`도 통과했다. 이 테스트 통과는 위 카드 라벨·값 불일치를 검증한 것이 아니다. 해당 회귀 검증은 추가가 필요하다.
- 현재 ZIP은 버전 **0.1.1**, 11파일이며 무결성이 정상이다. SHA-256: `c1ecd3ce2738b815438e254560a6b813244dda89a41ae1237e391e97601b5567`.
- ZIP의 상단 카드 JS는 여전히 `Bing 크롤링 확인`과 `bing.crawled`를 사용한다. 따라서 **현재 ZIP에는 나중에 작성한 `c0e60ba` 변경이 없다.** 이번 요청에서 재빌드하지 않았다. 기존 0.1.1 스토어 업로드본과 현재 HEAD가 같다고 설명하지 않는다.
- 다음 스토어 업데이트는 이미 제출한 0.1.1보다 높은 버전으로 올린 뒤 테스트·빌드·ZIP 검증을 다시 해야 한다. 업데이트용 산출물을 만들 때는 빌드 소스와 패키지의 일치를 확인하고 `icons/source.png`는 ZIP에서 제외한다.
- 설치 확장의 API는 `127.0.0.1:18001`이며 SSH 터널을 유지해야 한다. Vite의 8000 프록시 변경은 개발 서버에만 적용된다. 브라우저 확장 새 버전 게시 여부와 로컬 소스 변경을 구분한다.
- 과거 백엔드 자동 검증은 단위 655개·검사/사이트맵 API 임시 PostgreSQL 통합 81개였다. 이번 인계에서는 백엔드를 재실행하지 않았다. 실제 사이트맵 제출은 여전히 미검증이다.

### 다음에 해야 할 작업

1. 승인된 두 커밋·push의 완료 상태와 원격 HEAD 일치를 Git에서 확인한다. PR은 아직 요청하지 않았으므로 후속 요청 시 생성한다. Vite·ZIP·비밀파일은 제외한다.
2. Bing 카드·블로그별 표의 색인/크롤링 표시를 일치시키고 이 차이를 잡는 회귀 테스트를 추가한다. 기존 `c0e60ba`는 그대로 두고 후속 커밋으로 보완한다.
3. 메인페이지 상태를 등록 글과 별도로 어디에 보여줄지 확정한 뒤 해당 집계·API·화면을 구현한다. 이번 요청은 이 기능 구현 승인이 아니다.
4. 새 화면을 배포할 때 버전 증가 → 테스트·빌드 → ZIP 재생성 → 실제 화면 검증 → 스토어 업데이트를 진행한다. 현재 0.1.1 심사 통과 사용자 보고와 후속 배포를 혼동하지 않는다.

### 관련 파일

- `extension/src/dashboard.ts`, `extension/tests/dashboard.test.mjs`: 요약 카드·상세 패널·블로그별 표와 집계 표시 검증.
- `app/services/dashboard.py`, `app/schemas/dashboard.py`: 등록 글 집계와 응답 구조. 현재 메인페이지는 제외한다.
- `extension/package.json`, `extension/package-lock.json`, `extension/public/manifest.json`: 미커밋 0.1.1 버전 정보.
- `extension/vite.config.ts`: 커밋에서 제외할 기존 로컬 프록시 변경.
- `extension/startpress-extension.zip`: 기존 0.1.1 패키지, 현재 Bing 카드 커밋 미포함, 커밋 제외.

## 이전 인계 요약 — 2026-11-12 사이트별 인증 실검증·커밋 정리 / Asia/Seoul

**이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-12 사이트별 인증 실검증·커밋 정리`를 우선한다. 같은 날짜의 계정 연결 저장까지만 완료됐다는 아래 기록은 과거 상태다.**

### 완료된 작업

- [x] `app/core/secret_loader.py` 추가: `resolve_secret_path()`로 비공개 기준 폴더 내부의 상대 경로만 허용하고 심볼릭 링크 이탈을 차단한다. `load_secret_json()`은 UTF-8 JSON 객체를 반환하며 경로·내용을 오류 메시지에 노출하지 않는다. 엔진별 형식 검증과 Google 토큰 갱신은 인증 코드가 맡는다.
- [x] 사용자가 만든 `app/services/auth_account.py`의 `get_secret_reference(session, email=..., engine=...)`와 테스트를 보존했다. 인증 행과 엔진별 참조 누락을 별도로 구분하며 파일 접근이나 트랜잭션 종료는 하지 않는다.
- [x] 검사 서비스의 `_get_context()`가 부모 메인 사이트의 엔진별 이메일로 파일 참조를 조회하고 `(main_url, page_url, reference)`를 반환하도록 연결했다. 개별 글은 부모 계정을 상속한다. `Inspector`와 실제 검사 함수는 네 번째 인자로 참조를 받는다.
- [x] 사이트맵 서비스도 메인 사이트의 엔진별 이메일로 참조를 조회하고 `SitemapSubmitter`에 네 번째 인자로 전달한다. 두 서비스 모두 조회 트랜잭션을 닫은 뒤 파일 로드·외부 요청을 실행한다.
- [x] 검사·사이트맵에서 Google은 `load_credentials(secret_reference=...)`, Bing은 공통 로더의 `api_key`를 사용한다. 계정·참조 누락은 `AUTH_ACCOUNT_NOT_LINKED`, `AUTH_ACCOUNT_NOT_FOUND`, `SECRET_REFERENCE_NOT_FOUND`의 503이며 공통 계정으로 대체하지 않는다. Google 갱신은 두 경로가 기존 동일 프로세스 잠금을 공유한다. 프로세스 간 잠금이나 계정별 잠금은 추가하지 않았다.
- [x] Google 갱신 토큰은 선택된 계정 파일에 원자적으로 저장된다. `load_credentials()`에서 명시적인 참조 없이 호출하는 기존 방식은 호환용으로 유지했지만 검사·사이트맵은 항상 참조를 전달한다.
- [x] 로컬 기존 Google 토큰과 `.env`의 Bing 키를 사용해 엔진별 계정 파일 두 개를 생성했다. 사용자가 Google·Bing에 같은 실제 이메일을 지정했다. 파일 권한은 0600이며 Git 제외를 확인했다. 원본 토큰과 기존 환경변수는 유지했다. 이메일·인증값은 이 문서에 복사하지 않는다.

### 확정된 비밀파일 배치

```text
Lightsail 호스트: /home/example-user/webmaster-secrets/
컨테이너:        /srv/startpress/.secrets/
로컬:            <프로젝트 루트>/.secrets/
각 기준 폴더 아래:
  google/<이메일>.json   # 기존 Google OAuth JSON 그대로
  bing/<이메일>.json     # {"api_key": "..."}
DB 상대 참조:
  google/<이메일>.json
  bing/<이메일>.json
```

- 처음에는 Lightsail 프로젝트 내부 `.secrets` 배치를 논의했으나 **기존 `/home/example-user/webmaster-secrets`를 유지하기로 했다.** 현재 Compose 마운트도 유지했다. 서버 폴더를 컨테이너의 `.secrets`로 연결하는 바인드 마운트이므로 두 이름이 달라도 같은 파일이다.
- 사용자가 제시한 서버 목록에서 비밀폴더는 소유자·그룹 `10001:10001`, 권한 0700이고 기존 `google-token.json`은 0600이었다. `example-user` 사용자의 `cd` 권한 없음은 이 권한 설정 때문이다. 엔진별 하위 폴더 생성·Google 파일 복사·기존 `.env.prod`의 Bing 키를 JSON에 저장하는 단계는 사용자 완료 보고다. 에이전트가 원격 파일 내용·권한을 직접 재확인한 것은 아니다.
- Google은 갱신 후 파일 교체를 하므로 컨테이너 실행 UID 10001에 파일·상위 폴더 쓰기 권한이 필요하다. 서버의 기존 Google 파일·환경변수는 운영 전환 확인 전 삭제하지 않는다. 이번 코드의 `compose.prod.yaml`은 공통 `GOOGLE_TOKEN_FILE`·`BING_API_KEY` 필수 설정과 API 전달을 제거했으며 `.env.prod.example`도 계정별 파일 배치 안내로 바꿨다. 기존 서버의 Compose 반영 여부는 별도 확인이 필요하다.

### 실제 검증 결과

- 사용자는 로컬 DB에 실제 계정의 파일 참조를 등록하고 Swagger PATCH로 테스트 메인 사이트의 Google·Bing 계정을 연결했다. 선택한 사이트 ID·URL과 DB 내용은 에이전트가 직접 조회하지 않았다. 인증 계정 API에는 기존 참조 변경용 PATCH가 없고 중복 POST는 409다.
- 첫 Google 검사는 503 `GOOGLE_AUTH_REFRESH_FAILED`였으며 에이전트가 공식 OAuth 서버에서 `invalid_grant`를 재현했다. 파일 연결은 정상이고 기존 refresh token이 거부된 상태였다. OAuth 앱의 Testing 게시 상태가 원인인지는 확인하지 않았다.
- 이후 사용자가 직접 Google 로그인·동의를 완료했다. 에이전트는 `google_probe.Settings`에 계정별 임시 저장 경로를 명시해 재인증을 진행하고, 새 토큰에 refresh token이 있는지 확인한 뒤 기존 계정 토큰을 비공개 백업하고 원자적으로 교체했다. 새 파일 권한은 0600이다. `.env`·기존 원본 토큰은 수정하지 않았다.
- 새 계정별 파일로 에이전트가 Google Search Console 사이트 목록을 조회해 **HTTP 200**, 접근 가능한 속성 1개를 확인했다. 실제 응답·사이트 주소·키·토큰은 공개 문서에 저장하지 않았다. 인증 전후 단계와 결과는 Git 제외된 `.secrets/bot_runs/` 기록으로 보존했다.
- 이후 **사용자가 로컬 Google·Bing 실제 검사 모두 성공했다고 확인했다.** 이는 사용자 확인이며 에이전트가 Swagger의 두 검사 응답을 직접 조회한 것은 아니다. 사이트 목록 조회는 색인 검사와 구분한다.
- 실제 사이트맵 제출·Lightsail 배포·운영 DB 버전·운영 인증 성공은 아직 확인하지 않았다. 새 로컬 Google 토큰은 서버에 자동 동기화되지 않는다.

### 검증·Git·보존할 변경

- 브랜치 `feat/site-auth-profiles`. 사용자는 리뷰 보고의 4개 커밋 계획 실행을 승인했다. 기준 HEAD는 `d6ed73b`이며 로더·조회 `103ce1d`, 실제 인증 전달 `d408424`, 운영 설정 `c21efe5`를 커밋했다. 이 문서는 별도 네 번째 커밋으로 정리한다. 최종 커밋은 `git log -4 --oneline`에서 확인한다. 이번 승인 범위는 로컬 커밋까지이며 push·PR 생성·main 병합·Lightsail 배포는 수행하지 않는다. 원격 최신 상태는 조회하지 않았다.
- 코드 리뷰 때 다시 실행한 백엔드 단위 테스트 **655 passed**, 임시 PostgreSQL의 검사·사이트맵 API 통합 테스트 **81 passed**. 계정 선택·변경 반영·미연결·참조 누락·파일 오류·동시 갱신·요청 자원 정리를 검증했다. 실제 외부 사이트맵 제출은 하지 않았다. 프론트 테스트·빌드는 이번 인증 연결 작업에서 재실행하지 않았다.
- 실행 환경은 `/opt/miniconda3/envs/startpress/bin/python`. 개인 사용자 패키지의 `typing_extensions`가 conda의 AnyIO와 충돌했으므로 **`PYTHONNOUSERSITE=1`**을 붙여 검증했다. 패키지를 임의로 업그레이드하거나 프로젝트 환경을 교체하지 않았다.
- 운영 설정 수정 후 공통 인증 변수를 제외한 테스트용 환경으로 `docker compose --env-file /dev/null -f compose.prod.yaml config --quiet`가 통과했다. 실제 `.env.prod`·컨테이너·서버를 변경하지 않았다. 한국어 주석 정리 후 로더·조회 단위 테스트 37개와 `git diff --check`도 통과했다.
- 단위: `PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest tests --ignore=tests/integration -q`.
- 통합: `PYTHONNOUSERSITE=1 RUN_POSTGRES_TESTS=1 /opt/miniconda3/envs/startpress/bin/python -m pytest tests/integration/test_sitemaps_api.py tests/integration/test_inspections_api.py -q`. 테스트가 UUID 이름의 임시 DB를 만들고 삭제하며 개발 DB를 마이그레이션 대상으로 삼지 않는다. 로컬 DB 연결은 sandbox 밖 실행 권한이 필요했다.
- 기존 `extension/vite.config.ts`의 프록시 8000 변경과 `extension/startpress-extension.zip`은 그대로 보존·커밋 제외한다. 사용자 작성 `auth_account.py`, `tests/test_auth_account_service.py`와 로더에 추가한 설명 주석도 보존한다. `.env`, `.secrets`와 실제 인증파일·백업·비공개 실행 기록은 출력·커밋하지 않는다.
- 코드 리뷰에서 운영 Compose의 불필요한 공통 인증 변수 의존, README·인계의 오래된 상태, 테스트의 일본어 주석을 확인해 정리했다. README는 계정별 인증 흐름·파일 형식·재인증·서버 전환 순서를 설명한다. 변경 코드의 치명적인 문제는 발견하지 못했다. 실제 계정 파일·백업·비공개 기록은 커밋 대상이 아니다.

### 다음에 해야 할 작업

1. 사용자가 요청하면 원격 브랜치와 기존 PR을 확인하고 push·PR을 진행한다. main 직접 push·자동 병합·자동 배포를 하지 않는다. main 반영은 별도 요청 범위다.
2. Lightsail의 실제 브랜치·HEAD·DB 리비전을 확인한다. 서버 확인 명령은 안내했지만 실행 결과를 받지 않아 현재 운영 상태·`0004` 적용 여부는 미확인이다.
3. main 반영 후 서버 코드를 갱신하고 API 이미지를 빌드한다. 같은 이미지로 마이그레이션을 적용하고 계정별 유효한 파일·DB 참조·메인 사이트 연결을 준비한 뒤 API를 재생성한다. 새 로컬 Google 토큰을 서버에 별도로 반영해야 하며 비밀값을 로그·문서·Git에 남기지 않는다.
4. 운영 Google·Bing 조회를 확인한다. 연결이 없는 기존 사이트는 503을 반환하므로 운영에서 사용할 사이트의 계정도 준비한다. 실제 사이트맵 제출은 조회와 구분해 필요할 때 수행한다. localhost 바인딩·SSH 터널은 유지한다.

### 관련 파일

- `app/core/secret_loader.py`, `tests/test_secret_loader.py`: 공통 비밀파일 로더.
- `app/services/auth_account.py`, `tests/test_auth_account_service.py`: 이메일·엔진별 파일 참조 조회.
- `app/services/inspection.py`, `app/engines/inspection.py`, `tests/test_inspection_context.py`, `tests/test_inspection_runner.py`, `tests/integration/test_inspections_api.py`: 사이트별 검사 인증.
- `app/services/sitemap.py`, `app/engines/sitemap.py`, `tests/test_sitemap_runner.py`, `tests/integration/test_sitemaps_api.py`: 사이트별 사이트맵 인증.
- `app/engines/google/google_auth.py`, `tests/test_google_auth.py`: 선택 파일의 OAuth 로드·갱신·저장.
- `google_probe.py`: 기존 로컬 최초 인증 도구. 이번 작업에서 수정하지 않았다.
- `compose.prod.yaml`, `.env.prod.example`: 기존 비밀폴더 마운트를 유지하고 공통 인증 환경변수 의존을 제거했다.

## 이전 인계 요약 — 2026-11-12 이메일 기반 사이트별 인증 계정 연결 / Asia/Seoul

**이 절과 맨 아래 2026-11-12 기록을 우선한다. 아래 2026-11-10까지의 요약·마지막 상태는 과거 기록이다.**

### 완료된 작업

- [x] 브랜치 `feat/site-auth-profiles`에서 이메일 기반 `auth_accounts`와 사이트 연결 모델을 구현했다(`8566309`). 사용자가 로컬 Docker PostgreSQL에 `0004 (head)` 적용과 pgAdmin의 테이블·FK 확인을 완료했다. 에이전트가 운영 DB 적용을 확인한 것은 아니다.
- [x] `auth_accounts.email`은 PK이며 `google_secret_ref`·`bing_secret_ref`는 선택적인 서버 비밀파일 상대 경로다. 실제 키·토큰을 DB에 저장하거나 브라우저에 전달하는 구조가 아니다. `sites.google_account_email`·`bing_account_email`은 이메일 FK로 연결하고 변경 시 CASCADE, 삭제 시 RESTRICT다. 네이버 이메일은 GUI 참고값으로 FK가 없다.
- [x] 메인 사이트는 인증 미연결(NULL)을 허용하고 개별 글은 세 이메일이 모두 NULL이어야 한다. 처음 메인 사이트에 세 이메일을 강제하던 CHECK는 기존 데이터와 충돌해 수정했다. 사용자 재실행 후 로컬 적용 성공을 확인했다.
- [x] 인증 계정 등록·조회 스키마·서비스·API와 테스트를 구현했다(`a128d68`). `POST /auth-accounts`는 201, 중복 이메일은 409, `GET /auth-accounts`는 페이지 목록이다. 응답은 이메일과 엔진별 참조 등록 여부만 반환하고 입력 검증 오류에서도 입력값·예외 문맥을 제거한다. 계정을 비밀파일 참조 없이 먼저 등록할 수 있다.
- [x] 사이트 등록·조회 이메일 3개와 Google·Bing 계정 존재 확인, `PATCH /sites/{site_id}/auth-accounts`를 구현했다(`c7c1de1`). 존재 확인과 저장은 같은 트랜잭션이며 계정 KEY SHARE 잠금을 사용한다. PATCH는 생략 유지·명시적인 NULL 해제·빈 객체 무변경이다. 없는 메인 사이트·개별 글은 `MAIN_SITE_NOT_FOUND`, 없는 계정은 `AUTH_ACCOUNT_NOT_FOUND`로 404를 반환한다. 반환값은 변경된 `SiteRead`다.
- [x] 별도 세션에서 작성한 프론트를 보존하고 검토·커밋했다(`a57f6ef`). 신규 사이트에서 Google·Bing 계정을 선택하고 네이버 이메일을 입력한다. 고객사 관리에서 기존 사이트의 계정을 변경·해제하며 변경 필드만 PATCH한다. 계정 목록 조회 실패·사라진 선택 계정·저장 실패를 처리하고 비밀값을 입력받지 않는다.
- [x] Vite `7.3.8`, Node 타입 정의와 잠금 파일을 반영했다(`966d07b`). 사용자가 실행한 `npm audit` 결과는 취약점 0개였다. 이는 당시 의존성 검사 결과이며 향후의 무취약성을 보장하지 않는다.
- [x] README를 현재 구현·로컬/SSH 연결·API 계약·인증 전환의 남은 범위에 맞게 정리했다. PR #7은 로컬 이력에서 `877e433` main 병합을 확인했으므로 과거의 PR #7 OPEN 기록을 현재 상태로 사용하지 않는다. 스토어 심사 승인·게시 결과는 이번에 확인하지 않았다.

### 현재 동작과 남은 범위

- **사이트별 계정 연결 저장까지 구현됐지만 실제 Google·Bing API의 계정 선택은 아직 전환되지 않았다.** 검사·사이트맵 어댑터는 계속 서버 공통 `GOOGLE_TOKEN_FILE`·`BING_API_KEY`를 읽는다. 계정 연결 성공을 실제 검색엔진 인증 성공으로 설명하지 않는다.
- 예시 참조는 `google/account-a.json`, `bing/account-a.json`이다. `.secrets/`를 포함한 절대 경로를 등록하지 않는다. 파일 생성·로드·비공개 기준 폴더 결합·실제 계정별 토큰 갱신은 미구현이며 Bing 비밀파일 내부 형식도 확정하지 않았다.
- Google·Bing API는 서버에서 사이트별 인증을 선택하도록 후속 구현한다. 네이버·Bing GUI는 사용자가 직접 로그인한 Chrome 탭을 사용하며 다른 Chrome 프로필의 GUI를 버튼 하나로 통합 실행하는 기능은 없다.
- Swagger Execute는 실제 연결 DB에 저장한다. 현재 개발 설정에서 확인한 DB 주소는 `127.0.0.1:5432`였으며 사용자가 인증 계정 등록·조회 테스트 완료를 알렸다. 실제 기존 사이트 PATCH·브라우저 전체 흐름의 사용자 성공 확인과 운영 서버 적용은 아직 별도다.

### 검증과 Git 상태

- 백엔드 마지막 검증: 단위 **580 passed**, 임시 PostgreSQL에서 사이트 서비스·API 통합 **82 passed**. 기존 개발 데이터가 아닌 UUID 이름의 임시 DB에서 실행했다. 이번 문서 작업에서는 백엔드 소스가 바뀌지 않아 재실행하지 않았다.
- 커밋 정리 시 프론트 **131 passed**, TypeScript 검사와 관리 화면·네이버·Bing 콘텐츠 스크립트 빌드를 재실행해 통과했다. 코드 리뷰 완료. DOM 테스트는 가짜 API 기반이며 실제 로그인 탭이나 Lightsail 전체 실행을 검증한 것이 아니다.
- 사용자 승인 범위는 백엔드·프론트·의존성 세 커밋과 이 문서·README를 묶은 문서 커밋 및 같은 브랜치 push다. 문서 커밋 직전 HEAD는 `966d07b`이며 최종 문서 커밋과 원격 일치는 `git log -1`, `git status`, `git ls-remote origin refs/heads/feat/site-auth-profiles`로 확인한다. main 직접 push·PR 생성·병합·배포는 수행 범위가 아니다.
- **`extension/vite.config.ts`의 로컬 프록시 `8000` 변경은 사용자 지시에 따라 커밋에서 제외하고 그대로 보존한다.** 저장소 기본 Vite 프록시와 설치된 확장 주소는 `18001`이다. 현재 작업 트리로 Vite를 실행하면 프록시는 `8000`이므로 로컬 API도 `--port 8000`으로 실행한다. README는 두 경로를 구분한다.
- `extension/startpress-extension.zip`은 미추적 로컬 산출물로 보존하고 커밋하지 않는다. 이번 빌드로 ZIP을 재생성하지 않았으므로 최신 소스와 일치한다고 설명하지 않는다. `.env`, `.secrets`, 토큰·키와 비공개 실행 기록은 커밋하지 않는다.

### 다음에 해야 할 작업

1. 로컬에서 기존 사이트의 계정 연결·변경·해제를 Swagger 또는 프론트로 확인한다. 실제 DB에 반영되므로 대상을 확인하고, 파일 참조 등록과 실제 인증 성공을 구분한다.
2. 비밀파일 로더를 구현한다. 기준 비공개 폴더 내부만 허용하고 심볼릭 링크 이탈·파일 누락·형식 오류를 민감값 없이 처리한다. Bing 파일 형식과 계정별 Google 토큰 갱신·저장 규칙을 정한다.
3. 개별 글은 부모 메인 사이트를 통해 엔진별 이메일→인증 행→비밀파일을 해석하도록 검사와 사이트맵 제출에 주입한다. 연결 누락 시 공통 계정으로 조용히 대체하지 않는다. 계정별 동시 갱신과 계정 혼용 방지를 테스트한다.
4. 로컬 실제 계정 조회 검증 후 Lightsail 코드·마이그레이션·비밀파일·권한을 준비하고 계정 연결 및 실조회로 운영 전환한다. 팀원 인증 전에는 localhost 바인딩과 SSH 터널을 유지한다. 실제 브라우저 실행 전 기록 규칙을 읽는다.

### 관련 파일과 작업 방식

- `migrations/versions/0004_add_auth_accounts.py`, `app/models/auth_account.py`, `app/models/site.py`: DB·ORM 구조.
- `app/schemas/auth_account.py`, `app/services/auth_account.py`, `app/api/auth_accounts.py`: 인증 계정 등록·조회.
- `app/schemas/site.py`, `app/services/site.py`, `app/api/sites.py`: 사이트 계정 등록·PATCH.
- `extension/src/api.ts`, `extension/src/main.ts`, `extension/src/types.ts`, `extension/src/styles.css`: 화면 연결과 API 타입.
- `app/engines/inspection.py`, `app/engines/sitemap.py`, `app/engines/google/google_auth.py`: 후속 실제 인증 주입 지점.
- 사용자는 한국어로 간결하게 설명하고 단계별로 직접 배우며 진행하길 원한다. 다음 단계를 설명하는 요청을 전체 기능 구현 승인으로 확대하지 않는다. 프론트는 별도 세션이 작업한 파일이므로 변경 전 현재 diff를 확인한다.

## 이전 인계 요약 — 2026-11-10 Chrome 웹 스토어 심사 제출 / Asia/Seoul

**현재 상태는 이 절과 맨 아래 2026-11-10 최신 상태를 우선한다. 과거의 스토어 미업로드·미제출 설명은 당시 기록이다.**

### 완료된 작업

- [x] **사용자가 2026-11-10 스토어 심사 제출 완료를 확인했다.** 에이전트가 직접 제출하거나 승인·게시 상태를 조회한 것은 아니다. 심사 승인·스토어 게시·팀원 설치 완료로 설명하지 않는다.
- [x] SP 로고의 16·32·48·128px 아이콘과 manifest 설정 추가(`0e7d2e8`), API 모드 상시 안내 및 네트워크 오류의 SSH 터널 안내 추가(`2820ceb`). SSH 연결과 서버의 기존 Google OAuth 토큰·Bing API 키를 유지한다.
- [x] 단일 목적 설명·호스트 권한 사유·사용자 데이터 사용 공개·게시자 연락처 이메일 입력 및 인증 경로를 안내했다. 비공개 설치 대상은 스토어의 Private 설정이며 Unlisted와 구분한다. 최종 설정값·허용 계정 목록·인증 상태는 에이전트가 직접 확인하지 않았다.
- [x] 지정 Notion 페이지에 개인정보처리방침을 작성했다: https://app.notion.com/p/414210261e95807a8a7ae5a66b79a20b . 팀원 SEO·GEO 업무에 필요한 개인정보와 사이트·URL·검사 운영 데이터를 구분하고 저장·전송·삭제 범위를 설명했다.
- [x] 사용자가 확정한 운영자·문의 이메일·시행일(2026-11-10)과 별도 만료 기간 없이 업무 목적으로 보관하되 삭제 요청 접수 후 7일 이내 처리하는 기준을 반영했다. 이는 운영자가 이행할 기준이며 자동 삭제 기능을 구현한 것이 아니다. 방침은 법적 적합성이나 스토어 승인을 검증한 결과가 아니다.
- [x] **사용자 요청에 따라 개인정보처리방침에서 초안 안내·확인 체크리스트·미확정 표시를 제거했다. 공개·제출용 페이지에는 확정된 내용만 적고, 질문·검토 메모·미정 사항은 채팅에서만 다룬다.** Notion 웹 게시 설정·익명 접근 가능한 공개 URL은 에이전트가 변경하거나 확인하지 않았다.
- [x] 최신 ZIP은 `extension/startpress-extension.zip`, 버전 `0.1.0`, 11파일·66,421바이트다. 이번에는 압축 무결성·원본 로고 제외·SSH 문자열 포함·SHA-256을 재확인했다. 실제 업로드된 파일과의 일치는 별도 확인이 필요하다.

### Git·산출물과 검증 범위

- 후속 Git 작업 완료: 문서·스토어 이미지 커밋 `4b19604`까지 push했고 [PR #7](https://github.com/StartPress26/webmaster-automation/pull/7)을 main 대상으로 생성했다. 생성 직후 로컬·원격·PR HEAD 일치를 확인했다. PR은 OPEN이며 병합하지 않았다. 이 완료 기록도 같은 브랜치에 커밋·push하며 최종 HEAD는 `git log -1`로 확인한다.
- 현재 브랜치는 `chore/private-extension-release`. 문서·스크린샷 커밋 직전 HEAD는 `2820ceb`이다. 이번 fetch 기준 origin/main의 누락 커밋은 없고 기존 같은 브랜치 PR도 없다. 사용자가 남은 변경 정리·커밋·push·main 대상 PR 생성을 요청했다. 최종 HEAD·원격 일치·PR URL은 완료 후 Git/GitHub에서 확인한다. 병합은 요청하지 않았다.
- 커밋 대상은 기존 변경을 포함한 `docs/HANDOFF.md`와 `outputs/store/startpress-dashboard-1280x800.jpg`다. 스크린샷을 직접 열어 확인했으며 비밀키·쿠키·OTP는 보이지 않았다. ZIP·dist·비밀파일은 커밋하지 않는다.
- ZIP SHA-256: `c221efdc4c36876075e95673a4c018720755d8475f3bb583525f96ad0081cac4`.
- 직전 ZIP 생성 시 TypeScript·Vite 빌드·필수 파일·아이콘 크기·dist 바이트 일치 검증이 통과했다. 이번 커밋 전 프론트 테스트 121 passed와 문서 diff 검사가 통과했다. 백엔드 테스트·실제 GUI 순회·운영 API 인증은 다시 실행하지 않았다.
- CUA가 스토어 편집 탭 접근을 `The extensions gallery cannot be scripted`로 차단했다. 이를 다른 UI 경로로 우회하지 않았고 양식 수정·제출은 하지 않았다. 실행 기록은 Git 제외된 `.secrets/bot_runs/store-privacy-20261110T012725Z.jsonl`에 민감값 없이 남겼다.

### 다음에 해야 할 작업

1. 스토어의 심사 결과와 보완 요청을 확인한다. 승인 시 Private 대상 설정·게시 상태를 확인하고 팀원 설치→SSH 연결→검색엔진 로그인→조회·저장 흐름을 검증한다. 반복 제출·중복 상품 생성은 하지 않는다.
2. 개인정보처리방침의 로그인 없는 공개 URL이 실제로 열리고 스토어에 올바르게 등록됐는지 확인한다. 추가 운영 정보가 필요하면 채팅에서 먼저 확정하고 페이지에 반영한다.
3. PR을 검토하고 요청 시 병합한다. 서버 반영 여부는 별도로 확인한다. Lightsail 최신 코드·Google/Bing 운영 인증·GUI 병렬 순회·저장 GET·네이버 대시보드 반영 실검증은 여전히 완료 근거가 없다.
4. 팀원 설치 문서는 별도 스토어 필수 제출물로 취급하지 않는다. 필요 시 작성하며 README의 과거 API 8000 안내는 현재 18001 연결과 구분한다.
5. 후속 기능은 네이버/Bing 수집 요청 자동화, HTTPS·팀원 인증을 통한 SSH 제거, 필요 시 API 계정별 연결이다. 이번 배포에서 구현한 것으로 설명하지 않는다.

### 관련 파일·페이지

- `extension/public/manifest.json`, `extension/public/icons/`: 확장 권한·아이콘 설정과 이미지.
- `extension/src/main.ts`, `extension/src/errors.ts`: SSH 안내.
- `extension/startpress-extension.zip`: Git에 넣지 않는 제출용 산출물. 소스를 바꾸면 재빌드·재생성한다.
- `outputs/store/startpress-dashboard-1280x800.jpg`: 스토어 등록용 화면 이미지.
- 개인정보처리방침: https://app.notion.com/p/414210261e95807a8a7ae5a66b79a20b
- 스토어 개발자 대시보드: https://chrome.google.com/webstore/devconsole

## 이전 인계 요약 — 2026-11-09 비공개 Chrome 스토어 배포 준비 / Asia/Seoul

**새 세션은 이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-09 비공개 스토어 제출용 ZIP 재생성`을 먼저 읽는다. 아래 main 기준 요약은 배포 준비 브랜치 이전 기록이다. 이번 요청은 ZIP 재생성과 인계 갱신까지다.**

### 확정한 방향과 현재 Git

- Chrome Web Store 비공개 배포를 먼저 진행하고 **SSH 터널은 유지**한다. HTTPS API·팀원 로그인·SSH 제거·검색엔진별 계정 연결은 후속 과제다. 네이버/Bing GUI는 팀원 Chrome의 로그인된 작업 탭을 사용하고 Google API 토큰·Bing API 키는 현재 서버 설정을 사용한다.
- 브랜치 **`chore/private-extension-release`**, HEAD **`2820ceb` — `[docs] API 연결 화면과 오류 메시지에 SSH 터널 안내 추가`**.
- 아이콘 커밋 `0e7d2e8`은 이 세션에서 push·원격 HEAD 일치를 확인했다. SSH 안내 `2820ceb`은 로컬 커밋만 완료했다. 현재 로컬 원격 추적 참조보다 1커밋 앞서며 이번 재생성에서는 원격을 새로 조회하지 않았다. PR은 생성하지 않았다.
- 기존 `docs/HANDOFF.md` 미커밋 변경을 보존해 이번 내용을 추가했다. ZIP은 미추적 로컬 배포 산출물이다. 이번 요청에서는 커밋·push·스토어 업로드·제출·서버 배포를 수행하지 않는다.

### 완료된 작업

- [x] 사용자가 `extension/public/icons/source.png`에 저장한 SP 로고를 16·32·48·128px로 변환하고 manifest의 `icons`·`action.default_icon`에 연결했다. 원본을 보존하고 여백을 줄여 로고가 더 크게 보이도록 조정했다. 16px 확대 표시에는 해상도 한계가 있다.
- [x] 현재 `host_permissions`와 API·작업 탭 코드를 대조했다. 로컬 API·네이버·Google·Bing 호스트를 선언했으며 광범위한 `tabs` 권한은 추가하지 않았다. 사용자는 수정했다고 했으나 당시 저장 파일은 커밋과 동일했으므로 별도 권한 축소가 반영됐다고 기록하지 않는다.
- [x] API 모드 상시 안내에 `사용 전 SSH 터널을 연결해 주세요.`를 추가했다. 네트워크 오류에는 SSH 터널·서버·네트워크 확인과 연결 복구 후 재조회 안내를 추가했다. SSH 미연결로 단정하지 않는다.
- [x] **SSH 안내가 포함된 최신 HEAD로 빌드하고 `extension/startpress-extension.zip`을 교체했다.** ZIP 루트에 `manifest.json`이 있으며 dist 내용만 포함한다. `icons/source.png`는 제외했다. 총 11파일·66,421바이트다.
- [x] TypeScript·Vite 관리 화면/네이버/Bing 콘텐츠 스크립트 빌드, ZIP 무결성·manifest 참조 파일·아이콘 크기·최신 dist와 바이트 일치를 확인했다. ZIP 내 관리 화면 JS의 SSH 안내 포함도 확인했다. 전체 테스트·실제 Chrome·서버 조회는 이번에 실행하지 않았다.

### 제출용 산출물과 관련 파일

- `extension/startpress-extension.zip`: 현재 제출 후보. SHA-256 `c221efdc4c36876075e95673a4c018720755d8475f3bb583525f96ad0081cac4`.
- `extension/public/manifest.json`, `extension/public/icons/`: 확장 설정·아이콘·원본 로고.
- `extension/src/main.ts`, `extension/src/errors.ts`: API 모드 상시 SSH 안내·서버 연결 오류 안내.
- `extension/src/runtime.ts`: 설치된 확장의 API 주소 `http://127.0.0.1:18001`.
- `extension/README.md`: 과거 API `8000` 설명이 남아 있다. 현재 연결 기준은 runtime과 최신 인계다. 별도 팀원 설치 문서는 아직 새로 작성하지 않았다.

### 다음 작업과 주의사항

1. **스토어 등록 자료:** 설명·이미지·개인정보처리방침/데이터 사용 공개·권한 이유·심사용 테스트 방법을 준비한다. SSH와 검색엔진 로그인 권한이 필요한 환경이므로 심사자가 기능을 확인할 방법을 구체화한다. ZIP 생성 성공이 심사 통과를 뜻하지 않는다.
2. **비공개 설정·제출:** 지정 Google 계정 또는 관리하는 Google Group 구성원 대상으로 `Private`를 설정한다. `Unlisted` 및 npm 공개 방지인 `package.json`의 `private: true`와 구분한다. 비공개도 심사를 거친다. 스토어 업로드·제출은 아직 수행하지 않았다.
3. **요청 시 Git 후속 처리:** SSH 안내 push·문서 커밋·PR 생성은 별도 요청 범위다. 문서와 ZIP을 임의로 커밋하지 않는다. 소스 수정 시 다시 빌드하고 ZIP을 교체한다. ZIP 생성용 npm 스크립트는 아직 추가하지 않았다.
4. **팀원 설치 문서:** 별도 문서를 스토어 필수 제출물로 취급하지 않기로 했다. 필요하면 스토어 설치 → SSH 연결 → 검색엔진 로그인 → 사용 순서로 작성한다. 저장소 문서는 스토어에 자동 노출되지 않는다. 상시 안내만 추가했으며 SSH 연결 절차를 프론트에 구현한 것은 아니다.
5. **실사용 검증:** Lightsail 최신 배포·Google/Bing 운영 인증·여러 사이트 GUI 병렬 순회·저장 GET·대시보드 반영은 여전히 미검증이다. 팀원 인증 전에는 API localhost 바인딩과 SSH 터널을 유지한다. 실제 브라우저 검증 전 `.cursor/rules/bot-execution-records.mdc`를 읽는다. 키·토큰·SSH 개인키를 ZIP·코드·로그에 포함하지 않는다.

공식 참고: [스토어 설명·이미지·지원 링크](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [비공개 배포 설정](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution), [제출 절차·심사 테스트 안내](https://developer.chrome.com/docs/webstore/publish).

## 이전 인계 요약 — 2026-11-09 main 병합·네이버 집계

**새 세션은 이 절과 맨 아래 `마지막 상태 — 최신 / 2026-11-09`을 먼저 읽는다. GUI 결과 저장·네이버 대시보드 집계·운영 인증 준비는 아래 최신 코드 상태가 기준이다. 과거 절의 main·8000 포트·GUI 미구현·DB 미저장 설명은 당시 기록이며, 기존 API 계약과 Lightsail 배포 자료만 필요한 범위에서 참고한다.**

### 현재 목표와 확정 범위

- 한국어로 간결하게 설명하며 사용자가 코드를 이해하고 따라갈 수 있게 지도한다. GUI 저장·운영 인증 준비는 PR #5, 네이버 대시보드 집계는 PR #6으로 main에 병합된 이력이 로컬 Git에서 확인된다. **이번 요청은 `docs/HANDOFF.md` 갱신만이며 커밋·push·서버 배포·실제 검색엔진 호출은 수행하지 않는다.**
- **로그인된 기존 네이버·Bing 탭에서 사이트별 URL을 검사하는 Chrome 확장 기능을 구현했다. API 조회 후 네이버와 Bing GUI를 병렬 실행하며, 각 엔진 안에서는 사이트·URL을 순차 처리한다.**
- Google은 기존 공식 API, Bing은 기존 크롤링 API와 GUI 색인 관측을 함께 사용한다. 과거의 Google·Bing API 전용 방향 중 Bing GUI 제한은 이번 사용자 요청으로 변경됐다.
- 신규 도메인 등록·소유권 확인 UI/API, 자동 로그인·인증정보 수집, 주기 실행은 이번 범위에 포함하지 않는다. 사이트맵 제출은 별도 버튼으로 유지하고 `/pages` 등록에 자동 연결하지 않는다.
- **네이버·Bing GUI 결과는 `POST /sites/{id}/gui-inspections`로 기존 `site_engine_statuses`에 요약 상태를 저장한다. 같은 대상·엔진의 최신 관측 하나만 유지하며 Bing API·GUI도 같은 행을 갱신한다. 신규 테이블·마이그레이션은 없다.**
- 저장한 상태·시각은 기존 `GET /sites/{id}/inspections`에서 읽는다. 실행 목록과 GUI 판정 원문·대표 URL·제외 사유 등의 상세 관측은 관리 탭 메모리에만 남는다. 네이버 대시보드 집계도 구현됐다. `GET /clients/{id}/dashboard`는 DB에 저장된 등록 글 상태를 집계하며 새 외부 검사를 실행하지 않는다.
- 사용자의 별도 블로그 canonical 문제는 `nextjs-notion-starter-kit`에서 별도로 처리하기로 했다. 이 프로젝트는 Bing에 표시된 대표 URL·제외 사유를 읽으며 사이트 코드 수정·대표 URL 자동 재검사·색인 요청은 수행하지 않는다.

### 완료된 작업

- [x] 설치된 확장과 Vite 개발 화면의 API 연결을 Mac SSH 터널 `127.0.0.1:18001`로 통일했다.
- [x] 검색엔진 작업 탭 조회·엔진별 선택·재검증·현재 실행 범위 고정 기능을 구현했다.
- [x] 고객사의 활성 메인 사이트와 등록 글 전체 목록을 확정한 뒤 API·GUI 작업을 생성하고 실행한다.
- [x] 네이버의 기존 결과 읽기 미리보기와 사이트·URL별 새 GUI 검사 기능을 구분해 구현했다.
- [x] Bing의 사이트 선택·URL 검사·색인 결과 및 상세 필드 판독과 단계별 오류 안내를 구현했다.
- [x] Bing API 크롤링 저장과 Bing GUI 관측을 작업 표의 별도 행으로 분리했다.
- [x] 네이버와 Bing의 병렬 시작·실패 분리·전체 취소·양쪽 완료 대기를 구현했다.
- [x] GUI 관측의 대상·부모·고객사·URL·시각 검증과 최신 상태 저장 API를 구현했다.
- [x] 확장이 URL별 GUI 저장 응답을 기다린 뒤 다음 URL을 조회하도록 연결했다. 저장 실패는 관측을 보존하고 해당 엔진의 후속 조회를 중단한다.
- [x] 운영 Compose에 Google 토큰 경로·Bing API 키 전달과 토큰 폴더 연결을 추가했다. `.env.prod.example`은 두 인증 변수의 빈 입력란을 제공하고 준비 방법·권한은 이 문서에 정리했다. 서버 적용은 아직 확인하지 않았다.
- [x] README의 GUI 결과 DB 미저장 설명을 현재 구현에 맞게 수정했다.
- [x] 네이버 대시보드의 전체 색인 확인 카드·엔진별 상태·블로그별 건수·최근 성공 관측 시각을 구현했다(`6adcbcc`, PR #6). 메인페이지는 글 통계에서 제외하고 비활성 블로그·글은 포함한다. 미관측·성공 관측 시각이 없는 글은 `unknown`이다.
- [x] GUI 저장·운영 인증 준비 PR #5와 네이버 집계 PR #6의 main 병합 이력을 로컬 Git에서 확인했다. 원격 GitHub 상태를 이번에 새로 조회한 것은 아니다.

### 현재 Git과 보존할 변경

- 현재 브랜치: **`main`**, HEAD: **`b37251a` — Merge pull request #6 from StartPress26/feat/naver-dashboard**. 로컬 `origin/main` 참조와 일치한다. 이번에는 fetch·원격 PR 조회를 실행하지 않았으므로 원격의 실시간 상태는 필요한 Git 작업 직전에 재확인한다.
- 로컬 이력에서 PR #5 병합 `dd694d6`, 네이버 집계 구현 `6adcbcc`, PR #6 병합 `b37251a`를 확인했다. 과거의 인계 문서 커밋·push·PR 생성 대기는 완료된 작업이므로 반복하지 않는다.

| 커밋 | 완료 내용 |
|---|---|
| `58805ce` | 확장·Vite의 Lightsail SSH 터널 `18001` 연결 |
| `f72d54a` | 검색엔진 작업 탭 조회와 선택 |
| `ba43bf9` | 고객사 전체 색인 조회와 네이버 GUI 자동화 연결 |
| `6242f86` | 기능 단위 소스·테스트 줄 간격 정리 |
| `b0706f0` | Bing GUI 조회·메뉴 보임 판정 수정·단계별 오류 표시 |
| `499f553` | 네이버·Bing GUI 병렬 실행 |
| `b7dffc3` | 소스 줄바꿈·들여쓰기 정리 |
| `ee93834` | GUI 검사 결과 저장 API |
| `f8f049f` | 확장의 GUI 결과 저장 연결 |
| `cf71d18` | GUI 조회·저장 안내와 README 정리 |
| `c305c58` | 운영 Google·Bing 인증 전달과 토큰 폴더 연결 |

- 인계 문서 커밋은 `c2c0169`로 완료됐고 위 변경은 PR #5에 병합됐다. 네이버 집계는 `6adcbcc`로 추가돼 PR #6에 병합됐다.
- 이번 문서 수정 전 작업 트리는 깨끗했다(`git status --short --untracked-files=all`). 과거에 미추적으로 기록한 `.gitkeep`는 현재 미추적 목록에 없으며 임의로 복원하지 않는다. 이번 수정은 `docs/HANDOFF.md`만 미커밋으로 남긴다.
- main/master 직접 push 금지, 새 브랜치는 `feat/`·`fix/` 등 사용, 한국어 `[타입] 제목`, Git 작성자 유지, 공동 작성자 트레일러 없음. 비밀파일·빌드 산출물은 커밋하지 않는다.

### 전체 조회와 탭 준비

1. 대시보드 또는 색인 상태 화면의 **고객사 전체 색인 조회**를 누르면 시작 고객사와 실행 ID를 고정한다. 화면의 블로그·엔진 필터는 저장 결과 필터이며 전체 실행 대상을 제한하지 않는다.
2. 활성 메인 사이트와 활성 등록 글의 목록을 모두 읽고 고객사·부모 관계를 검증한다. 수집 실패 시 일부 대상만 실행하지 않고 시작을 중단한다. 메인 URL도 검사 대상에 포함된다.
3. 네이버·Bing 작업 탭을 먼저 준비한다. 엔진별 후보가 하나면 자동 선택·재검증하고, 여러 개면 사용자 선택을 기다린다. 닫힘·주소 변경·로딩·메모리 해제·시크릿 탭 등을 구분한다. 탭 준비 성공은 로그인·선택 사이트·조회 성공을 뜻하지 않는다.
4. 탭 준비를 건너뛰는 **탭 없이 API 조회만 계속**은 GUI 작업을 미실행으로 남긴다. 일반 웹 개발 화면에는 Chrome 탭 API가 없어 설치된 확장에서 GUI 기능을 사용한다.
5. Google·Bing API 요청은 기존 순차 실행을 유지한다. 그 후 `Promise.all([runNaverGui(...), runBingGui(...)])`로 두 GUI를 동시에 시작한다. 각 GUI 내부의 사이트·URL 순서는 유지한다.
6. 한 GUI의 인증·탭·조회·저장 실패는 해당 엔진의 남은 작업을 중단하고 다른 GUI는 계속한다. 저장 실패·응답 미확인은 조회 실패와 구분하고 이미 얻은 관측을 보존한다. 전체 취소는 두 `AbortController`에 전달하며 이미 보낸 API·GUI 저장 요청의 응답은 확인한다. 아직 보내지 않은 저장 요청과 다음 조회는 실행하지 않는다. 자동 재전송하지 않는다.
7. 양쪽 GUI가 모두 종료돼야 전체 완료한다. 전체 진행 문구는 병렬 실행을 표시하고 세부 단계는 각 엔진의 결과 행에 표시한다. 관리 탭을 닫거나 새로고침하면 실행 목록·GUI 상세 관측을 잃지만 DB에 저장한 요약 상태는 남으며 자동 재개하지 않는다.

### 네이버 구현과 판정

- 흐름: `/console/board` → 목표 메인 사이트 링크 선택 → 사이트 요약 확인 → `/console/site/check/inspection` → URL별 입력·확인·새 결과 판독 → 목록 복귀 → 다음 사이트.
- `engines/naver/content.ts`는 같은 확장의 관리 페이지가 보낸 고정 명령만 수신한다. `requestId`·문서 토큰·작업 중복·취소를 확인하고 프레임 0에서 작업한다. 쿠키·비밀번호·토큰·페이지 원문은 수집하지 않는다.
- 자동 검사 관측은 `kind='verified_gui'`, `targetVerified=true`이며 사이트·URL·새 결과와 시각을 다시 검증한다. 이전 결과의 제거·교체·문구 변화가 없으면 새 응답으로 인정하지 않는다.
- **`문서가 성공적으로 색인됐습니다. 해당 문서를 검색할 수 있습니다.` → `indexed`**. **`URL 검사 결과가 없습니다.` → `unknown`**, 화면에서는 **수집 확인 안 됨**으로 안내한다. 실제 미수집·미색인으로 확정하지 않는다.
- **현재 네이버 결과 읽기**는 기존 화면을 읽는 미리보기다. `kind='visible_preview'`, `targetVerified=false`로 자동 검사와 구분한다. 입력 URL과 기존 결과의 연결·새 조회 여부를 입증하지 못하므로 상태·전체 완료 건수·DB를 변경하지 않는다.
- 실제 문제와 수정: 로딩 중 Chrome 탭의 URL 정보가 잠시 비는 것을 즉시 `page_changed`로 판정하던 대기를 수정했다. 탭 소실·다른 출처 등은 계속 중단한다. `error_outline` 등 아이콘 텍스트가 결과 제목에 섞여 정확 일치가 실패하던 판독도 수정했다. 아이콘·숨김 장식을 제거하고 실제 판정 문구를 비교한다.
- 네이버 대기 기준: 화면·명령 약 18초, 새 DOM 결과 기본 15초, 기존 결과 읽기 기본 8초. 자동 재조회·수집 요청 버튼 클릭은 하지 않는다.

### Bing 구현과 판정

- 흐름: 처음 `/webmasters/urlinspection` 준비 → 왼쪽 위 사이트 메뉴 → 일치하는 실제 사이트 링크 확인 → 선택한 탭을 그 링크로 이동 → 사이트·검사 화면 준비 확인 → 메인·글 URL별 검사 → 다음 사이트 선택.
- 메뉴의 표시 이름 대신 링크의 `siteUrl`로 비교한다. 같은 Bing 출처·URL 검사 경로·정확한 사이트인지 콘텐츠 스크립트와 실행 모듈에서 재검증한 뒤 `chrome.tabs.update`로 이동한다. 합성 링크 클릭 호출만으로 사이트 선택 성공을 가정하지 않는다.
- 핵심 선택자: `userSeletedSite`, `userSitesList`, `data-tag="urlInspectionInput"`, `inspectBtn`, `BingdexTab`, `urlInspectionIndexCard`, `urlInspectionIndexDetails`. React가 만드는 번호형 ID에는 의존하지 않는다. 로딩 표시는 실제 ID `inpsectionProgressTitle`을 사용한다.
- **실제 중단 원인:** Fluent UI의 `ms-Layer` 부모는 `visibility:hidden`, `ms-Layer-content` 자식은 `visibility:visible`이다. 부모만 보고 메뉴 전체를 숨김으로 판정해 사이트 선택 메뉴에서 대기 초과가 발생했다. 현재는 대상의 최종 계산된 visibility를 확인하고 부모 체인은 `display:none`만 검사한다. 보이는 메뉴와 실제 숨김 메뉴의 회귀 테스트를 추가했다.
- 메뉴가 먼저 생기고 항목이 나중에 로딩될 수 있어 최대 15초 기다린다. 화면 전환·명령 대기는 25초, 새 검사 결과 기본 대기는 20초다. **네이버가 먼저 대기한 시간은 Bing 제한 시간에 포함되지 않는다.**
- 진행·시간 초과 단계: URL 검사 화면 준비 / 사이트 목록에서 항목 확인 / 사이트 선택 후 화면 전환 / 검사할 URL 입력 준비 / URL 검사 결과 확인 / 검사 후 사이트 확인. 공통 timeout 문구만으로 원인을 단정하지 말고 단계와 실제 화면을 대조한다.
- 검사 중 표시·카드 교체·제목 변경 등 새 결과 증거와 사이트·입력 URL·결과 주소의 `urlToInspect` 일치를 확인한다. 이중 인코딩된 검사 주소를 처리하며 **Bing 색인** 탭의 결과만 읽는다. **라이브 URL·색인화 요청·정식 URL 검사 버튼은 누르지 않는다.**
- 관측은 `kind='verified_bing_gui'`, `targetVerified=true`. 명시적 성공은 `indexed`, 명시적 미색인은 `not_indexed`, 낯선 문구는 `unknown`이다. 원문 판정·제외 사유·대표 URL·페이지 가져오기 성공·표시된 마지막 크롤링 시각·조회/판독 시각을 함께 읽는다.
- URL 하나당 작업은 **Google API / 네이버 GUI / Bing API / Bing GUI**로 나눈다. Bing API는 `crawled|unknown`, Bing GUI는 `indexed|not_indexed|unknown`을 저장한다. DB에는 같은 대상·Bing 조합의 최신 상태 한 행만 남고 더 최신 API 관측이 GUI 판정을 갱신할 수도 있다. 작업 표는 두 작업과 GUI 관측·저장 건수를 구분한다.

### 검증 결과와 남은 한계

- 아래 테스트 수치와 브라우저 성공 사례는 이전 세션의 검증 기록이다. **2026-11-09 이번 문서 갱신에서는 Git 이력·대시보드 코드·API 문서를 읽고 문서 diff만 검사했다. 테스트·빌드·DB·원격 서버·브라우저 실행은 수행하지 않았다.**

- 직전 전체 검수에서 **백엔드 691 passed(단위 531 + PostgreSQL 통합 160), 프론트 121 passed**, TypeScript 검사·Vite 빌드·운영 Compose 설정 검사·`git diff --check`가 통과했다. 통합 테스트는 UUID 이름의 임시 DB만 생성·삭제하고 개발 DB를 보존했다. 과거 검증 수치와 합산하지 않는다.
- 이전 안내 문구 변경 후에도 **프론트 121 passed**, TypeScript·Vite 빌드·운영 Compose 설정·diff 검사가 통과했다. 백엔드 소스는 바꾸지 않았으므로 위 백엔드 수치는 직전 전체 검수 결과다.
- 빌드는 관리 화면·백그라운드와 import 없는 IIFE `dist/naver-content.js`, `dist/bing-content.js`를 생성한다. 빌드 산출물은 커밋하지 않는다.
- 네이버: 이전 비공개 실행 기록에 **설치된 확장에서 기존 결과 읽기 성공**이 있다(`2026-11-08-naver-reader-debug-d71f16c0.json`). 이후 자동 순회의 탭 URL 누락·결과 제목 판독 문제를 실제 화면에서 진단하고 코드·모의 테스트로 보완했다. 수정 후 여러 실제 사이트 전체 자동 순회 완료를 확인한 것으로 설명하지 않는다.
- Bing: 사용자가 확장을 다시 로드해 조회를 시작했고, 에이전트가 실제 Bing 탭에서 **사이트 선택을 통과해 등록 글 URL의 색인 결과 카드에 도달한 것**을 확인했다. 여러 실제 사이트 간 전환·관리 화면의 최종 관측 건수와 DB 저장은 검증한 범위가 아니다.
- **현재 HEAD의 네이버·Bing 실제 병렬 실행·여러 사이트 전체 순회·GUI 결과의 Lightsail DB 저장은 아직 미검증**이다. 탭·DOM·두 사이트 순회·취소·응답 불일치·URL별 저장 대기와 전체 화면 연결은 모의 테스트 및 임시 DB 통합 테스트로 검증했다.
- 이 대화의 브라우저 도구는 `chrome-extension://` 접근을 보안 정책으로 차단했다. 확장 내부 버튼은 우회 조작하지 않고 사용자가 실행하도록 요청한 뒤 HTTPS 네이버/Bing 탭을 관찰했다. 도구 접근 제한과 제품의 조회 실패를 구분한다.
- 실행 기록은 Git 제외된 `.secrets/bot_runs/`에 보존했다. Bing 기록: `bing-content-20261108.jsonl`, `bing-debug-20261108T055608373051.jsonl`, `bing-site-transition-20261108T060218513229.jsonl`. 실제 실행 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 0700 디렉터리·0600 파일, 민감값·실제 입력·쿼리/프래그먼트 제외 규칙을 따른다.
- 2026-11-04의 백엔드 650 passed와 Lightsail·DB 연결은 과거 검증이다. 이번 검수·인계에서는 원격 서버·운영 DB 상태를 다시 검증하거나 스키마를 바꾸지 않았다.

### 실행 환경과 다음에 해야 할 작업

- 설치된 확장의 API 기본값(`extension/src/runtime.ts`)과 Vite 프록시(`extension/vite.config.ts`)는 모두 `http://127.0.0.1:18001`이다. SSH 터널 이후 경로는 Lightsail `127.0.0.1:18000` → API 컨테이너 `8000`이다. 설치된 확장의 API가 여전히 Mac `8000`이라는 과거 설명은 현재 코드와 다르다.
- Lightsail 운영·팀 배포 결정은 2026-11-05 기록을 유지한다. Google/Bing 운영 인증용 로컬 배포 설정은 아래와 같이 준비했다. 공개 HTTPS API·팀원 인증·고정 IP·외부 DB 백업은 별도 후속 작업이며 실제 운영 상태는 필요할 때 재조회한다.
- Python은 기존 Miniconda `startpress`, `PYTHONNOUSERSITE=1` 원칙을 유지한다. `.venv` 재생성·`uv sync`·`uv run`을 사용하지 않는다. 확장 검증은 프로젝트 루트에서 다음 npm 스크립트를 사용한다.

```bash
npm --prefix extension test
npm --prefix extension run check
npm --prefix extension run build
```

1. **Lightsail 현재 배포 확인·최신 코드 반영:** 서버의 Git/컨테이너 상태를 먼저 확인하고 GUI 저장 API·네이버 대시보드 반영 여부를 확인한다. 필요하면 서버 main을 갱신하고 `.env.prod`·토큰 전용 폴더·컨테이너 쓰기 권한을 준비한 뒤 서버에서 API 컨테이너를 재생성한다. 네이버 필드가 추가된 서버를 먼저 배포한 뒤 새 확장을 적용한다. 로컬 main 병합은 서버 배포 완료를 뜻하지 않는다.
2. **운영 API 인증 확인:** Lightsail에서 Google·Bing 실제 조회 성공을 확인한다. 로컬 Google 인증 성공·사용자의 토큰 전송 확인·`/health` 응답만으로 운영 인증 성공을 단정하지 않는다.
3. **확장 전체 조회 실검증:** 확장 새로고침 → 로그인된 네이버·Bing 탭 새로고침 → 관리 탭 다시 열기 → 고객사 전체 색인 조회. 여러 사이트·URL 대응, 두 GUI 동시 진행·오류 분리·전체 취소를 확인한다. 실제 실행 기록을 남기고 검증 목적으로 색인 요청·사이트맵·IndexNow 제출을 반복하지 않는다.
4. **저장·대시보드 연결 검증:** GUI 저장 응답 이후 `GET /sites/{id}/inspections`로 상태·시각을 확인한다. 관리 화면을 다시 열어 저장 결과 유지와 `GET /clients/{id}/dashboard`의 네이버 집계 반영을 확인한다. 메인페이지 제외·비활성 포함이라는 집계 기준과 활성 대상만 실행하는 전체 조회 범위를 구분한다.
5. **검증 후 인계 갱신:** 실제 서버 버전·인증·순회·저장·집계 확인 결과와 미검증 범위를 이 문서에 기록한다.
6. **별도 후속 과제:** 필요 시 GUI 상세 관측·출처·이력 저장 계약, 공개 HTTPS·팀원 인증·고정 IP·외부 백업/복구·인계 절차를 다룬다. 네이버 집계는 구현 완료이며 후속 구현 목록에 다시 넣지 않는다. 이전 AI 로그인봇 실험을 자동 재개하지 않는다.

### Google·Bing 인증과 Lightsail 배포 준비

- Google은 API 키 대신 `.secrets/google-token.json`의 사용자 OAuth 인증을 사용한다. 기존 데스크톱 OAuth 클라이언트 JSON과 토큰의 클라이언트 정보가 일치하고 필요한 scope·refresh token이 있는 것을 확인했다. 운영 API는 토큰 JSON만 읽으며 최초 발급용 클라이언트 JSON을 별도로 서버에 올릴 필요는 없다.
- 이번 대화의 실제 로컬 검증에서 Google 토큰 갱신과 파일 저장이 성공했고 Search Console 사이트 목록 GET이 HTTP 200, 접근 가능한 속성 1개였다. 인증정보·속성 URL은 출력하지 않았다. Google OAuth 앱의 Testing/Production 설정과 장기 유효성은 별도 확인이 필요하다.
- 로컬 토큰은 `600`, 비공개 폴더는 `700`이었다. 클라이언트 JSON은 `644`에서 `600`으로 제한했다. 두 파일은 Git에서 제외되고 현재 추적되지 않는다. 인증파일·키·원본 오류를 커밋·로그·확장 빌드·Docker 이미지에 포함하지 않는다.
- Bing은 서버 `.env.prod`의 `BING_API_KEY`를 사용한다. Bing Webmaster Tools 계정의 API 키이며 웹 로그인 쿠키·OAuth 토큰·IndexNow 공개 키와 별개다. 이번 대화에서 Bing 키의 실제 유효성은 확인하지 않았다.
- **사용자는 Google 토큰의 Lightsail 전송을 완료했다고 확인했다.** 안내한 전용 위치는 `/home/example-user/webmaster-secrets/google-token.json`이다. 에이전트가 원격 파일·소유권·Bing 설정·컨테이너 상태를 직접 검증한 것은 아니다.
- 로컬 `compose.prod.yaml`은 API에 기존 `DATABASE_URL`과 `GOOGLE_TOKEN_FILE`, `BING_API_KEY`를 전달한다. 두 인증 설정이 비어 있으면 기동 전에 실패하도록 했다. `.env.prod.example`의 두 입력란은 비어 있으며 실제 값과 토큰 경로는 서버 `.env.prod`에 채운다. 작업 중 예시 파일이 간결한 형태로 바뀐 것을 확인해 그 형식을 보존했다.
- API의 bind mount는 서버 `/home/example-user/webmaster-secrets` → 컨테이너 `/srv/startpress/.secrets`다. `create_host_path: false`이므로 서버 폴더가 없으면 실패한다. Google 토큰의 원자적 교체를 위해 폴더 전체에 쓰기 권한이 필요하며 폴더·파일 소유자는 `10001:10001`, 권한은 각각 `700`·`600`이어야 한다. 다른 비밀파일·브라우저 실행 기록은 이 전용 폴더에 함께 넣지 않는다.
- 서버 `.env.prod`에는 `GOOGLE_TOKEN_FILE=.secrets/google-token.json`과 실제 `BING_API_KEY`를 별도로 설정하고 기존 DB 설정을 유지한다. `.env.prod`는 배포 사용자 소유·권한 `600`으로 관리한다. 실제 값은 Git으로 배포하지 않는다.
- 현재 API에는 팀원 인증이 없으므로 `127.0.0.1:18000` 바인딩과 SSH 터널 접근을 유지한다. `/health`는 앱 응답만 확인하며 DB·검색엔진 인증 성공을 보장하지 않는다.

배포 작업을 진행할 때 **Lightsail SSH 터미널의 서버 프로젝트 폴더**에서 아래 순서로 실행한다. 서버 작업 트리에 변경이 있으면 먼저 보존·확인하고 `git pull`을 강행하지 않는다. 비공개 설정과 토큰 권한을 준비한 뒤 `up`을 실행한다.

```bash
cd ~/webmaster-automation
git status --short
git switch main
git pull --ff-only origin main
docker compose --env-file .env.prod -f compose.prod.yaml up -d --build api
docker compose --env-file .env.prod -f compose.prod.yaml ps
```

### 과거 커밋 구성 — PR #5 병합 완료

| 순서 | 커밋 메시지 | 포함 파일 |
|---|---|---|
| 1 | `[fix] GUI 조회와 저장 안내를 현재 동작에 맞게 수정` | `extension/src/dashboard.ts`, `extension/README.md` |
| 2 | `[chore] 운영 Google·Bing 인증 환경변수와 토큰 폴더 연결` | `compose.prod.yaml`, `.env.prod.example` |
| 3 | `[docs] GUI 저장과 운영 인증 배포 인계 갱신` | `docs/HANDOFF.md` |

`ee93834`·`f8f049f`의 GUI 저장 기능과 위 세 묶음(`cf71d18`·`c305c58`·`c2c0169`)은 PR #5로 main에 병합됐다. 재커밋·중복 PR을 만들지 않는다. 이번 인계 문서 수정은 별도 미커밋이며 커밋·push 요청은 없다. 실제 `.env.prod`·토큰·빌드 산출물은 제외한다.

### 관련 파일

| 위치 | 역할 |
|---|---|
| `extension/src/inspection/client-plan.ts` | 전체 대상 수집·API/GUI 작업 생성 |
| `extension/src/inspection/client-controller.ts` | 실행 범위·API 순차/GUI 병렬 실행·취소·엔진별 실패 분리 |
| `extension/src/inspection/client-view.ts`, `format.ts` | 진행·결과 표·API 저장과 GUI 관측 표시 |
| `extension/src/tabs/{client,controller,view}.ts` | 공통 작업 탭 조회·선택·재검증·UI |
| `extension/src/engines/naver/{content,observation,automation}.ts` | 메시지 수신·화면 판독·사이트별 순회 |
| `extension/src/engines/naver/{preview,view}.ts` | 기존 결과 읽기·미리보기 표시 |
| `extension/src/engines/bing/{content,observation,automation}.ts` | Bing 메시지·DOM·실제 사이트 링크·단계별 순회 |
| `extension/src/main.ts` | 대시보드/검사 화면의 전체 조회·탭 선택·미리보기 이벤트 연결 |
| `extension/public/manifest.json`, `extension/vite.content.config.ts`, `extension/package.json` | 콘텐츠 스크립트 권한·엔진별 IIFE 빌드 |
| `extension/src/runtime.ts`, `extension/vite.config.ts` | SSH 터널 `18001` API 연결 |
| `extension/tests/{client-inspection,workspace,naver-automation,naver-reader,bing-automation,work-tab}.test.mjs` | 실행·판독·병렬·취소·화면 연결 테스트 |
| `extension/README.md` | 설치·조회·엔진별 동작·검증 한계 |
| `app/api/inspections.py`, `app/schemas/inspection.py`, `app/services/gui_inspection.py` | GUI 저장 요청·대상·URL·시각 검증과 최신 관측 저장 |
| `extension/src/api.ts`, `types.ts` | GUI 저장 요청·응답 계약 |
| `extension/src/dashboard.ts` | Google·네이버·Bing 저장 상태 집계 화면 |
| `app/services/dashboard.py`, `app/schemas/dashboard.py`, `docs/dashboard-api.md` | 네이버 포함 대시보드 집계·응답·집계 기준 |
| `compose.prod.yaml`, `.env.prod.example`, `Dockerfile` | 운영 인증 전달·토큰 폴더 연결·컨테이너 사용자 |

## 과거 기록 안내

아래 절의 현재·최신·다음 작업 표현과 새 세션 시작 문구는 각 작성 시점의 기록이다. 2026-11-08 병렬 실행까지만 다루던 기록도 GUI 저장 구현 이전 상태다. 현재 구현·배포 준비는 최상단 요약과 맨 아래 최신 상태를 우선한다.

## 이전 인계 요약 — 2026-11-05 / Asia/Seoul

**아래는 2026-11-05 당시 배포 기록이다. 최신 브랜치·포트·네이버/Bing GUI·다음 작업은 최상단 2026-11-08 요약을 따른다. 기존 배포 설정·SSH 터널 설명은 필요한 범위에서 참고한다.**

### 사용자의 작업 방식과 현재 목표

- 한국어로 간결하게 설명하고 사용자가 직접 명령을 실행하며 이해하도록 한 단계씩 지도한다. Docker·Compose·SSH·배포 개념은 기초부터 설명했다. 요청에 맞춰 파일 작성과 커밋·푸시·PR 생성은 에이전트가 수행했다.
- StartPress는 개발자 1명을 포함한 소규모 외주 팀이다. 사용자는 퇴사 후에도 팀이 운영할 수 있도록 콘솔 중심의 Lightsail 설정과 팀 저장소를 선택했다.
- **AWS에는 FastAPI와 PostgreSQL을 배포하고, 최신 대시보드는 Chrome 확장에 포함한다.** `extension/`을 웹 화면으로 AWS 이미지에 추가하는 작업은 현재 결정 범위에 포함되지 않는다.
- **다음 개발은 이미 로그인한 네이버 서치어드바이저 탭 선택 → 화면의 사이트·검사 URL·결과 읽기 → 결과 저장 순서다.** 탭 조회 권한과 결과 저장 API의 구체적 계약은 구현 전에 확인한다.
- 신규 사이트 소유권 확인 UI/API, `/pages`의 사이트맵 자동 제출 제외 등 기존 확정 범위는 아래 기능 요약을 따른다.

### 현재 Git과 완료된 배포 구성

- 현재 로컬 브랜치와 `origin/main`은 **`main`, HEAD `4444868`**이다. 사용자가 PR #3과 [PR #4](https://github.com/StartPress26/webmaster-automation/pull/4)를 병합했다.
- 배포 작업 브랜치 `chore/production-compose`의 마지막 커밋은 `b484c30`이다. 주요 커밋은 `2b6e9a8` Docker 이미지, `c533d29` 운영용 Compose, `b484c30` Vite 프록시 18000 연결이다.
- **현재 미커밋 변경은 `extension/vite.config.ts`의 프록시 주소 `18000 → 18001`이다.** 사용자 Mac의 SSH 터널을 통해 Lightsail API에 연결하는 설정이므로 보존한다. 이번 인계 업데이트도 미커밋으로 남긴다.
- `feat/webmaster-tab-automation` 브랜치는 존재하지만 기준이 `c8d469c`로 PR #4 병합 이전이다. 다음 구현 전에 최신 main 반영 방법을 정하고 현재 Vite 변경을 보존한다. main에 직접 push하지 않는다.
- `Dockerfile`은 Python 3.13, 고정된 uv 도구로 `uv.lock`을 pip 설치 목록으로 변환, 해시 검증 설치, `app/`과 Alembic 파일 복사, UID/GID 10001 실행으로 구성했다. FastAPI는 컨테이너 내부 `0.0.0.0:8000`에서 실행한다.
- `compose.yaml`은 개발용 PostgreSQL·pgAdmin이다. `compose.prod.yaml`은 별도 프로젝트 `webmaster-automation-prod`에서 `db → migrate → api` 순서로 실행한다. `migrate`와 `api`는 `startpress-api:prod` 이미지를 공유한다.
- DB healthcheck 성공 후 Alembic `upgrade head`를 실행하고, 성공 종료 후 API를 시작한다. `db`와 `api`는 `restart: unless-stopped`, DB는 영속 볼륨을 사용한다. API 포트는 호스트의 `127.0.0.1:18000`에 연결한다.
- `.env.prod.example`은 Git에 포함한다. 실제 `.env.prod`, `.secrets/`, 루트 `*.dump`는 Git에서 제외하고 Docker 빌드에서도 비공개 파일·백업을 제외한다.

### Lightsail의 실제 진행 상태

- **사용자가 Lightsail에서 Docker·Compose 설치, main 클론, 서버용 환경변수 구성과 컨테이너 기동을 완료하고 API·DB 연결을 확인했다.** 이후 SSH 터널을 통한 대시보드 고객사 추가·새로고침 후 조회도 사용자 확인을 받았다. 에이전트가 원격 서버 상태를 직접 재조회한 결과와 구분한다.
- 인스턴스 이름은 `startpress-webmaster-prod`, Ubuntu 24.04.4 LTS, 2GB RAM·2 vCPU·60GB SSD이며 **시드니 `ap-southeast-2`**에 생성됐다. 공인 IPv4 예시는 `203.0.113.10`이며, 접속 시에는 Lightsail 콘솔에서 확인한 주소를 사용한다. 고정 IP 설정은 확인되지 않았으므로 재시작 후 주소를 확인한다.
- 계정은 새 AWS 프로젝트 가입 방식이며 프로젝트 리전이 시드니에 자동 배정된 것을 사용자가 확인했다. 이 가입 방식에서는 리전 선택에 제약이 있다. 서울로 이전하려면 가입 방식·플랜·고급 기능 활성화 조건부터 확인한다. 현재는 시드니에서 개발 검증을 진행한다.
- 화면에서 신규 가입 Free Plan 크레딧 $100와 약 6개월 기간을 확인했다. 현재 잔액·만료일은 재확인해야 한다. 인스턴스 사용료가 누적되며 일반 Lightsail 인스턴스는 정지 상태에서도 요금이 발생한다.
- 팀 GitHub 조직에서 Deploy keys가 처음에는 비활성화돼 있었다. 실제 정책 위치는 조직 Settings → Security and quality → Deploy keys다. 사용자가 허용 설정 후 저장소에 **읽기 전용 Deploy Key**를 등록하고 인증·클론을 완료했다.
- 서버의 GitHub 키 경로는 `~/.ssh/startpress_github`이고 공개키는 `.pub` 파일이다. 개인키·암호를 문서에 복사하지 않는다. GitHub 호스트 확인 실패는 공식 공개 호스트 키를 `known_hosts`에 등록한 뒤 해결했고 `You've successfully authenticated`를 확인했다.
- 서버 저장소 경로는 `~/webmaster-automation`, 브랜치는 main이다. 클론 시 `core.sshCommand`에 해당 키와 `IdentitiesOnly=yes`를 설정했다.
- 서버 `.env.prod`는 로컬 비밀번호와 분리해 생성하도록 안내했다. PostgreSQL 사용자·DB 이름은 `webmaster`, `DATABASE_URL`의 DB 호스트·포트는 `db:5432`다.
- 현재 Compose에서 API에 전달하는 설정은 **`DATABASE_URL`만**이다. Google 토큰·Bing 키의 운영 환경 연결은 후속 작업이다. Google 토큰을 연결할 때는 코드의 `.secrets/` 경로 제약과 토큰 파일 원자적 교체를 위한 디렉터리 쓰기 권한을 반영한다.

### Mac에서 Lightsail을 사용하는 현재 경로

- **Mac 대시보드 5173 → Vite `/api` 프록시 → Mac 18001 → SSH 터널 → Lightsail 127.0.0.1:18000 → 컨테이너 API 8000 → PostgreSQL** 흐름으로 고객사 쓰기·읽기를 검증했다.
- Mac에서 Lightsail 기본 키를 다운로드하고 권한을 제한한 뒤 터널을 열었다. 키 파일은 프로젝트나 Git에 넣지 않는다. 기본 키는 리전별이며 GitHub Deploy Key와 역할이 다르다.

```bash
# 접속 예시입니다. 서버 IP, SSH 사용자명, 키 파일 경로를 실제 값으로 바꿉니다.
chmod 600 ./example-key.pem
ssh -i ./example-key.pem \
  -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:18001:127.0.0.1:18000 \
  example-user@203.0.113.10
```

- 터널 터미널을 열어둔 상태에서 Mac의 `curl -fsS http://127.0.0.1:18001/health`를 확인했다. 로컬 Vite를 재시작하고 `http://127.0.0.1:5173/`에서 고객사를 추가했다. `?mode=demo`는 실제 저장 검증에 사용하지 않는다.
- **설치된 Chrome 확장의 `extension/src/runtime.ts`는 여전히 `127.0.0.1:8000`을 사용한다.** Vite의 18001 변경은 웹 개발 화면에만 적용된다. 확장으로 AWS 저장·조회까지 검증하려면 이 API 연결 설정을 별도로 준비해야 한다.
- 현재 Manifest V3는 관리 탭 열기와 로컬 API 호스트 권한까지 구현돼 있다. 네이버 탭 선택·Content Script·GUI 결과 읽기는 미구현이다.
- AWS 컨테이너는 `up -d`로 계속 실행한다. 브라우저 SSH나 Mac의 터널 종료와 서비스 수명을 구분한다. 지금 팀원에게 배포할 공개 HTTPS 주소·팀원 인증·스토어 제출은 남아 있다. 사용자는 현재 소유한 도메인이 없다고 명확히 답했다.

### 검증 근거와 보존할 자료

- 로컬에서 FastAPI 이미지 빌드, UID 10001의 `/`·`/health`, Alembic `0003 (head)` 파일 확인을 수행했다.
- 기존 개발 DB와 분리한 임시 Compose 프로젝트에서 빈 DB 마이그레이션, 고객사 POST·GET, 컨테이너 재생성 후 데이터 유지를 검증하고 임시 프로젝트를 정리했다.
- 사용자 로컬 운영용 Compose의 첫 마이그레이션 실패는 `.env.prod`의 DB 호스트·포트를 `db:5432`로 맞춰 해결했다. 이후 `0003 (head)`와 빈 고객사 목록을 직접 확인했다.
- 프로젝트 루트 `startpress-postgres.dump`에 로컬 운영용 DB 백업을 만들고 `pg_restore`로 파일을 읽을 수 있는지 확인했다. 사용자가 `startpress_restore_check` 별도 DB에 복구한 뒤 고객사가 조회됨을 확인했다. 이 백업은 로컬 검증 시점의 자료이며 AWS DB 백업 자동화는 후속 작업이다.
- PR #4 생성 전 프론트 **42 passed**, TypeScript 검사, Compose 구성과 diff 검사 통과를 재확인했다. 이후 사용자가 변경한 18001 프록시 설정은 실사용 확인을 받았다. 이번 인계 요청에서는 테스트를 재실행하지 않았다.
- 기존 백엔드 **650 passed**는 2026-11-04 검증 기록이다. 배포 작업에서 전체 백엔드 테스트를 새로 실행한 수치로 설명하지 않는다.
- 브라우저 조회 기록은 `.secrets/bot_runs/`에 비공개로 남겼다. 다음 실제 브라우저·확장 검증 전 `.cursor/rules/bot-execution-records.mdc`를 따른다.

### 다음에 해야 할 작업

1. 최신 main을 기준으로 확장 개발 브랜치를 준비하고 Vite의 미커밋 18001 설정을 보존한다. 우선 사용자에게 다음 기능의 구현 단위를 설명한다.
2. 이미 로그인한 네이버 탭을 찾아 사용자가 선택하고, 기존 결과의 사이트·검사 URL·판정을 읽는 기능부터 구현한다. 자동 로그인·인증정보 수집·서버로의 쿠키 전송을 추가하지 않는다.
3. 확장 설치 상태에서 API 주소를 SSH 터널에 연결할 방법을 정하고, 결과 저장 API 계약·기존 상태 저장 흐름을 확인한다. Google·Bing은 기존 공식 API 사용 원칙을 따른다.
4. 팀 배포 전에 고정된 HTTPS API 주소와 팀원 인증을 구성하고, 확장의 운영 API 주소·호스트 권한을 연결한다. 도메인 구매나 계정 플랜 변경은 결정된 사항이 아니다.
5. 서버 DB 백업의 외부 보관·복구 절차, 팀원별 콘솔 접근과 인계 자료를 정리한다. 필요할 때 Google·Bing 운영용 인증을 구성한다.

### 관련 파일

- 배포 구성은 `Dockerfile`, `.dockerignore`, `compose.prod.yaml`, `.env.prod.example`, `.gitignore`다.
- 웹 개발 연결은 `extension/vite.config.ts`, 설치된 확장 연결은 `extension/src/runtime.ts`, 확장 실행·권한은 `extension/public/manifest.json`, `extension/src/background.ts`다.
- 기존 API 목록·상태 판정·사이트맵 계약은 아래 기능 요약 및 각 API 문서를 참고한다. 로컬 Conda `startpress` 실행과 `.venv`·`uv sync`·`uv run` 금지 원칙을 유지한다.

## 이전 기능 인계 요약 — 2026-11-04 / Asia/Seoul

**새 세션은 이 절을 먼저 읽는다. 이 절과 맨 아래 최신 마지막 상태가 과거 스냅샷보다 우선한다. 아래 과거의 DB 0002·extension 미추적·사이트맵 API 미연결 설명은 현재 상태가 아니다.**

### 사용자의 작업 방식·확정 범위

- 한국어로 간결하게 설명하고, 사용자가 Python·FastAPI 코드를 한 함수씩 이해하며 진행하도록 지도한다. 사용자가 요청한 범위를 구현하며 부가 기능을 앞서 만들지 않는다.
- **현재 익스텐션은 이미 검색엔진에 등록되어 있고 서버 계정에 접근 권한이 있는 사이트를 대상으로 한다. 신규 도메인의 Google·Bing 사이트 등록·인증 파일 발급·소유권 확인 UI/API는 현재 범위에서 제외한다.** 기존 Python 어댑터는 보존한다.
- 새 글은 `POST /sites/{main_site_id}/pages` 한 번으로 DB 저장과 기본 IndexNow 알림을 처리한다. 별도 `/submissions` API·제출 이력 테이블은 복구하지 않는다.
- **사이트맵 제출은 `/pages`에 자동 연결하지 않는다.** 색인 상태 확인 화면에서 사용자가 별도 버튼으로 실행한다.
- 사이트맵 제출은 이미 공개된 글 목록 URL을 검색엔진에 알리는 기능이다. 새 글을 사이트맵에 반영하는 작업은 실제 블로그·CMS가 담당한다. 우리 DB 글 저장으로 블로그의 sitemap.xml이 바뀌지는 않는다. 글마다 사이트맵 재제출이 필수는 아니다.
- 접수 성공과 수집·색인 완료를 구분한다. `unknown`을 수집 대기·미색인으로 바꾸지 않는다. Bing 검사 결과는 현재 `crawled`·`unknown`만 판정한다.
- 한국어 `[타입] 제목`, Git 작성자 유지, 공동 작성자 트레일러 없음. main/master 직접 push 금지. 새 브랜치는 `feat/`·`fix/` 등 사용하며 `codex/` 접두사를 사용하지 않는다.

### 현재 Git 상태와 완료 기능

현재 브랜치는 **feat/chrome-extension**이다. 마지막 기능 커밋은 **037a394**, pgAdmin 구성 커밋은 **988fb0d**이며 이후 문서·main 동기화 커밋은 `git log -1`로 확인한다. 사용자는 남은 변경을 세 커밋으로 정리하고 이 브랜치를 push해 **main 대상 PR을 생성**하도록 요청했다. PR 병합은 요청하지 않았다.

| 커밋 | 기능 |
|---|---|
| 1cda961 | IndexNow 설정 조회·변경 PUT·GET |
| e4e2a54 | 개별 글 저장과 기본 IndexNow 알림 연결 |
| 0b4cf4b | Google·Bing 상태 검사 POST·GET과 DB 저장 |
| 730f7d0 | 부모 사이트별 글 목록 GET |
| f4283ba | 검색엔진 관리 프론트와 Chrome 확장 실행 구성 |
| 27a6b3a | 고객사별 대시보드와 블로그 선택 |
| afa2ef8 | Google·Bing 사이트맵 제출 API와 화면 연결 |
| 037a394 | 검사 오류 코드 저장·Google 인증 원인 세분화·0003 마이그레이션 |
| 988fb0d | pgAdmin Compose·환경변수 예시·실행 안내 |

- `POST·GET /clients`, `POST·GET /sites`: 고객사·메인 사이트의 DB 저장·목록. 사이트 정보 저장은 외부 검색엔진 등록·소유 확인을 수행하지 않는다.
- `GET /clients/{client_id}/dashboard`: 선택 고객사의 사이트·글 수, Google·Bing 저장 상태·오류·블로그별 통계. 외부 엔진을 호출하지 않는다. 첫 화면은 고객사 대시보드이며 소속 블로그 선택·초안 분리·이전 고객사의 늦은 응답 무시 기능이 있다.
- `PUT·GET /sites/{main_site_id}/indexnow-settings`: Naver·Bing 공통 설정 저장·조회. 키 원문 응답 제외, 불완전·불일치 조회는 409.
- `POST /sites/{main_site_id}/pages`: 글 저장 후 선택적 IndexNow 공통 알림. `notify_search_engines` 기본 true. 알림 실패에도 글은 보존하고 201의 `page`·`submission`으로 결과를 구분한다. 중복 409는 재전송하지 않는다.
- `GET /sites/{main_site_id}/pages`: 부모별 저장 글 목록, limit 1~100·offset 0 이상, 생성 시각·ID 정렬. 비활성 글도 조회한다.
- `POST /sites/{site_id}/inspections`: `engine=google|bing` 실제 상태 조회·요약 저장. 글은 부모 속성 사용. 외부 호출 전 DB 트랜잭션 종료, Google 동기 작업은 스레드 실행.
- `GET /sites/{site_id}/inspections`: 외부 호출 없이 저장된 최신 상태만 조회. 실패 시 이전 판정·성공 관측 시각 보존, 첫 실패는 unknown·last_checked_at=null.

### 이번 작업 — 사이트맵 API·프론트 완료

- **`POST /sites/{main_site_id}/sitemaps`**: 요청 `{"engine":"google","sitemap_url":"https://example.com/sitemap.xml"}`. Google 또는 Bing 하나에 기존 어댑터로 한 번 제출한다.
- 성공 HTTP 200: `main_site_id`, `engine`, `sitemap_url`, `status="accepted"`. 접수 성공이며 다운로드·파싱·글 수집·색인 완료가 아니다.
- 존재하는 활성 메인 사이트만 지원한다. 개별 글 ID·없는 ID는 404, 비활성은 409. 사이트맵은 같은 스킴·호스트·유효 포트와 하위 경로여야 한다. 입력·범위 오류 422, 한도 429, 엔진 오류 502, 인증 설정 503, 시간 초과 504.
- Google은 쿼리 없이 `/`로 끝나는 URL-prefix 속성, 이 API의 Bing 지원 범위는 쿼리·하위 경로 없는 루트 사이트다.
- 외부 제출 전 조회 트랜잭션 종료. Google 토큰 갱신 잠금은 기존 검사와 공유하며 동기 요청은 스레드풀 실행. Google·Bing 자원은 성공·실패 모두 정리한다. 자동 재시도 없음.
- 사이트맵 파일 생성·갱신·제출 이력·설정·색인 상태 DB 저장은 없다. 이 기능에 신규 마이그레이션은 필요 없다.
- 프론트 **색인 상태 확인 → 사이트·Google/Bing 선택 → ‘사이트맵 제출’ → URL 확인·수정 → 엔진에 제출** 흐름을 연결했다. 기존 ‘인덱스 업데이트’ 버튼은 오해를 줄이기 위해 **‘색인 상태 조회’**로 변경했다.
- 사이트맵 폼은 버튼 클릭으로 열리며 선택 엔진·메인 사이트를 표시한다. 개별 글을 선택해도 부모 메인 사이트 ID로 제출한다. 네이버·미선택·비활성 사이트에서는 제출 버튼을 막는다.
- 제출 중 중복 클릭 방지, 응답의 사이트·엔진·URL·accepted 검증, 실패 시 입력 유지, 다른 사이트·엔진에 이전 피드백을 섞지 않도록 처리했다. 예시 모드는 외부 요청하지 않는다.
- 성공 문구: **‘Google 사이트맵 제출 접수 완료. 수집·색인 반영에는 시간이 걸릴 수 있습니다.’** 사용자가 눈에 띄게 요청해 ‘색인됨’ 배지와 같은 초록색 **#27775f**로 변경했다. 실패 문구는 `inspection-error` 빨간색을 유지한다.
- 실패 메시지는 `extension/src/main.ts`의 `submitSitemap()` catch에서 조합한다. 인계 시 **868~872줄**, 872줄 `sitemapFeedback` 대입. 렌더는 `sitemapForm()`(약 242줄), 색상은 `styles.css`의 `.sitemap-feedback` 규칙(약 228~229줄). 줄 번호는 후속 수정으로 달라질 수 있다.
- 백엔드 원인별 고정 메시지는 `app/services/sitemap.py`의 `messages`(약 66줄). 프론트는 인증·권한·한도·URL 오류를 안내하고, 통신·시간 초과 등은 **‘접수 여부를 확인하지 못했습니다. 자동 재전송하지 않습니다.’**라고 표시한다.

### 남은 변경 정리와 PR 범위

- `037a394`: Google 인증 오류 세부 코드 전달, 검사 `error_code` 저장·조회·성공 시 초기화, 관련 테스트, **0003 마이그레이션 파일**, 검사 API 문서를 함께 커밋했다. 신규 환경에서는 API 실행 전에 `alembic upgrade head`가 필요하다.
- `988fb0d`: pgAdmin 서비스·전용 볼륨·로컬 5050 포트와 `.env.example`의 빈 로그인 설정, 실행 안내를 함께 커밋했다. Compose 전체 설정을 검증하므로 db만 시작해도 `PGADMIN_DEFAULT_EMAIL`, `PGADMIN_DEFAULT_PASSWORD`가 필요하다. 실제 값은 `.env`에만 둔다.
- 세 번째 커밋은 `app/main.py`의 기존 라우터 설명과 이 인계 문서 정리다. 최신 main의 확장 전환 문서·README·실행 기록 규칙도 함께 반영하며 인계 문서 충돌을 해결한다.
- `main`과 비교한 PR에는 기존 IndexNow 설정·글 저장/목록·검사 API와 기본 프론트·대시보드·사이트맵 커밋도 포함된다. PR 제목·본문은 전체 변경 범위를 설명해야 한다.
- 최종 문서 커밋 이후 원격 상태·PR URL·충돌·검사 상태는 `gh pr view`와 `git status`로 확인한다. main 직접 push·자동 병합은 하지 않는다.
- 기존 AI 로그인봇 실험은 `feat/ai-login-bot`에 보존하며 이 브랜치에 가져오지 않는다. 실제 브라우저·확장 검증 전 `.cursor/rules/bot-execution-records.mdc`를 읽고 민감값 없는 실행 기록을 비공개로 남긴다.

### 실제 개발 DB — 2026-11-04 재확인

- 인계 시 로컬 DB를 읽기 전용 SQL로 조회했다: **alembic_version=0003**, **site_engine_statuses.error_code 존재=true**.
- 따라서 과거의 ‘0002·error_code 없음’ 불일치는 현재 확인 결과와 다르다. 이 인계 요청에서 마이그레이션을 적용하거나 데이터를 변경하지 않았다.
- 0003 파일과 관련 코드도 이제 `037a394`에 커밋됐다. 개발 DB는 이미 0003이므로 임의 롤백·초기화하지 않는다. 이번 커밋·PR 검증에서는 개발 DB 마이그레이션을 재적용하지 않았다.

### 실행 환경·현재 프론트 구성

- Python은 Miniconda `startpress`, 직접 실행 시 `PYTHONNOUSERSITE=1`. `.venv` 생성·`uv sync`·`uv run` 금지.
- DB는 Docker `db` 서비스(PostgreSQL 18.6), 호스트 접근 `127.0.0.1:5432`. pgAdmin은 `http://127.0.0.1:5050/browser/`, 컨테이너에서 DB 호스트는 `db`다. 비밀값은 출력하지 않는다.
- 프론트 로컬 실행: 프로젝트의 `extension/`에서 `npm run dev` → `http://127.0.0.1:5173/`. 예시는 `/?mode=demo`. Vite의 `/api` 프록시가 FastAPI `127.0.0.1:8000`으로 전달한다.
- FastAPI 실행: `PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`. 중복 시작 전에 기존 포트 확인.
- **Manifest V3 실행 구성이 추가되어 있다.** `extension/public/manifest.json`, `src/background.ts`, `src/runtime.ts` 참조. `npm run build` 후 Chrome 개발자 모드에서 `extension/dist`를 압축해제 로드하면 아이콘 클릭으로 관리 탭을 연다. 확장에서는 로컬 API 8000으로 직접 요청한다.
- 빌드 후 확장 새로고침과 관리 탭 재열기가 필요하다. 네이버 탭 연결·Content Script·GUI 조회·팀원 로그인은 아직 구현하지 않았다. 자세한 실행법은 `extension/README.md`.

### 검증 근거·한계

- 이번 커밋·PR 정리 단계에서 **전체 백엔드 650 passed**를 다시 확인했다. 인증 오류 코드·저장·성공 시 초기화와 임시 PostgreSQL의 마이그레이션 upgrade/downgrade 검증을 포함한다.
- 프론트 **42 passed**, TypeScript·Vite 빌드 통과. 실제 화면 코드를 jsdom에서 실행한 고객사 전환·초안 분리·늦은 응답·사이트맵 이벤트와 접수 문구 검증을 포함한다. 현재 초록색 CSS 변경도 포함한 작업 트리에서 실행했다.
- `docker compose config --quiet`, 비밀값 없는 `.env.example`에 테스트용 환경변수를 주입한 Compose 설정 검증, `git diff --check`를 통과했다.
- 개발 DB 대신 UUID 이름의 임시 DB만 생성·삭제하고 외부 엔진은 모의 응답으로 검증했다. 실제 검색엔진 제출·상태 검사를 반복하지 않았다.
- 실제 브라우저 도구는 연결 불가였으므로 화면 배치·반응형 시각 검증은 하지 못했다. 팀원 인증·운영 배포·네이버 탭 연결은 구현 범위 밖이다.
- 이전 단계의 647개·609개 백엔드 및 28개·35개 프론트 수치는 각 커밋 사본 기준의 과거 기록이다. 최신 650개·42개와 합산하지 않는다.

### 다음 작업

1. main 대상 PR의 변경 범위·충돌·검사 상태를 확인하고 리뷰를 받는다. 사용자 요청은 PR 생성까지이며 병합은 하지 않는다.
2. 다음 핵심 기능이나 화면 개선은 사용자 요청에 따라 진행한다. 사이트맵은 이미 완료이며 `/pages` 자동 연결·신규 도메인 등록/소유 확인을 추가하지 않는다.
3. 네이버 GUI 조회·주기 검사·팀원 인증·운영 배포는 후속 범위다. 브라우저 작업을 재개할 때 main에서 합류한 실행 기록 규칙을 먼저 읽는다.

### 관련 파일

- 사이트맵: `app/api/sitemaps.py` → `app/services/sitemap.py` → `app/engines/sitemap.py` → 기존 `GoogleEngine.submit_sitemap()` / `BingEngine.submit_sitemap()`. 스키마 `app/schemas/sitemap.py`.
- 명세: [sitemaps-api.md](sitemaps-api.md), [dashboard-api.md](dashboard-api.md), [pages-api.md](pages-api.md), [inspections-api.md](inspections-api.md), [indexnow-settings-api.md](indexnow-settings-api.md).
- 프론트: `extension/src/main.ts`, `api.ts`, `types.ts`, `styles.css`, `errors.ts`, `forms.ts`, `dashboard.ts`.
- 테스트: `tests/test_sitemap_runner.py`, `tests/integration/test_sitemaps_api.py`, `extension/tests/sitemap.test.mjs`, `extension/tests/workspace.test.mjs`.
- DB 변경: `migrations/versions/0003_add_inspection_error_code.py`.
- `.env`·`.secrets/`·OAuth 토큰·API 키·기존 공개 검증 파일·개발 데이터를 보존한다. 비밀값을 문서에 옮기지 않는다.

## 과거 전환 결정 — 2026-11-03

이 절의 미구현 상태는 당시 기록이며 2026-11-04 최신 구현 요약이 우선한다.

아래 과거 인계보다 [Chrome 확장 프로그램 전환 결정](extension-transition.md)을 우선한다. 확장 프로그램은 아직 미구현이다. AI 로그인봇 실험은 `feat/ai-login-bot`에 보존하며 이 문서 PR에 코드·의존성을 포함하지 않는다. 설치형 앱 배포는 진행하지 않는다.

main에는 고객사/사이트 API·DB·Google/Bing API·IndexNow 서비스가 이미 있다. 다음 작업은 로그인된 기존 네이버 결과 탭 읽기부터 시작한다. 추가 실로그인은 자동 실행하지 않는다. 상세 실험 성공 범위와 인증 유지 실패의 원인 미확정 사항은 전환 문서를 확인한다.


---

## 최신 추가 진행 — 저장된 글 목록 GET / 2026-11-03

이 절은 아래 과거 기록의 ‘글 목록 GET 미구현’ 설명보다 우선한다.

- `GET /sites/{main_site_id}/pages` 추가. 기존 POST와 같은 경로에서 저장된 글 목록·ID를 items 배열로 반환한다.
- 부모가 메인 사이트인지 확인하고 parent_site_id·target_type=page·부모 client_id로 필터링한다. 생성 시각·ID 오름차순, limit 1~100(기본 100)·offset 0 이상(기본 0)을 지원한다.
- 비활성 부모·글도 조회 가능하다. 빈 목록은 200·items=[], 미존재 부모·글 ID를 부모로 지정한 경우 404, UUID·페이지 조건 오류는 422다.
- 외부 엔진·인증·IndexNow 클라이언트를 호출하지 않으며 마이그레이션은 없다.
- 관련 사이트 API 통합 테스트 **55 passed**, git diff --check 통과. 임시 DB에서만 검증했으며 실제 외부 호출·개발 데이터 추가는 하지 않았다.
- [pages-api.md](pages-api.md)에 GET 계약을 추가했다. 커밋·push는 아직 하지 않았으며 기존 extension/은 보존했다.

## 최신 추가 진행 — 수집·색인 상태 검사 POST·GET / 2026-11-03

이 절은 아래 과거의 ‘Google·Bing 상태 검사 FastAPI·DB 연결 미구현’ 설명보다 우선한다.

- 같은 `/sites/{site_id}/inspections`에 POST·GET을 구현했다. POST 본문은 `{"engine":"google"}` 또는 bing이며 기존 GoogleEngine.inspect_url·BingEngine.inspect_url을 호출하고 site_engine_statuses에 최신 요약 상태를 저장한다.
- GET은 엔진별 저장 상태만 읽으며 인증 준비·외부 호출을 하지 않는다. 대상이 존재하고 상태 행이 없으면 items=[]이다.
- 메인페이지·글 모두 지원하며 글은 부모 속성 URL을 사용한다. 부모 관계·고객사·소유 구분·활성 상태·출처·경로와 엔진별 지원 URL을 검증한다.
- Google 동기 인증·요청은 스레드풀에서 실행하고 Google 세션·Bing 클라이언트는 종료 시 정리한다. 토큰 갱신 파일 쓰기는 프로세스 내 잠금으로 직렬화한다.
- DB 트랜잭션은 외부 조회 중 열어두지 않는다. 성공 결과는 최신 checked_at 기준으로 upsert하고 실패는 기존 판정·확인 시각을 보존하며 안전한 오류만 저장한다. 첫 실패는 unknown·last_checked_at=null이다. 성공 재조회 시 오류를 지운다.
- 기존 0002 테이블만 사용해 마이그레이션은 없다. 상세 canonical·크롤링 시각 저장·검사 이력·예약·자동 재시도·프론트 연결은 이번 범위에 포함하지 않았다. Bing은 crawled·unknown만 판정한다.
- 전체 PostgreSQL 통합 포함 **599 passed**. 엔진 연결·스레드·자원 정리·GET 읽기 전용·오류 상태 보존·오래된 관측 차단·기존 기능 회귀를 확인했다. 실제 외부 조회·개발 DB 테스트 행 생성은 하지 않았다.
- 사용 명세: [inspections-api.md](inspections-api.md). 커밋·push는 아직 하지 않았고 기존 extension/은 보존했다.

## 최신 추가 진행 — 글 등록과 기본 발행 알림 / 2026-11-03

이 절은 아래 과거의 ‘개별 글 등록 미구현’·‘다음 작업은 별도 제출 API’ 설명보다 우선한다.

- 사용자 요청에 따라 별도 `/submissions` API·제출 이력 테이블 구현은 롤백했다. 개발 DB는 기존 0002이며 기존 데이터는 유지했다. 커밋된 IndexNow 설정 PUT·GET은 유지한다.
- `POST /sites/{main_site_id}/pages` 구현. 본문은 name·url·선택 notify_search_engines(기본 true). 한 요청으로 글을 저장한 뒤 기존 notify_published_urls()를 호출한다.
- 부모는 활성 메인 사이트여야 하며 글 URL의 출처·경로 범위를 확인한다. 고객사·소유 구분은 부모에서 가져오고 target_type=page·parent_site_id를 서버가 지정한다.
- 부모 IndexNow 설정은 같은 저장 트랜잭션에서 읽는다. 글을 커밋하고 트랜잭션·잠금을 해제한 뒤 공통 엔드포인트로 한 번 전송한다.
- 저장 성공은 HTTP 201. 응답은 page와 submission으로 나누며 알림은 accepted·key_pending·failed·unknown·skipped를 반환한다. 키 누락·불일치·외부 실패에도 글을 보존한다. notify_search_engines=false이면 저장만 한다.
- 중복 URL은 409이며 자동 재전송하지 않는다. 외부 알림 결과는 응답으로만 제공하고 별도 제출 테이블·기존 색인 관측값에 저장하지 않는다. 신규 마이그레이션은 없다.
- 전체 PostgreSQL 통합 포함 **567 passed**. 전송 전 글 커밋, 외부 실패 후 글 유지, DB 저장 실패 시 롤백·전송 차단, 동시 중복의 단일 저장·단일 전송, 부모 검증·URL 범위·입력 검증을 확인했다. 실제 외부 제출·개발 데이터 추가는 하지 않았다.
- 상세 사용법: [pages-api.md](pages-api.md). 글 목록 GET·화면 연결·재알림 API·예약·제출 이력은 이번 범위에 포함하지 않았다.
- 커밋·push는 하지 않았으며 기존 미추적 extension/은 보존했다.

## 최신 추가 진행 — IndexNow 설정 조회·교체 / 2026-11-03

이 절은 아래 과거 기록의 ‘기존 사이트의 IndexNow 설정 변경 미구현’ 설명보다 우선한다.

- `PUT /sites/{main_site_id}/indexnow-settings`, `GET /sites/{main_site_id}/indexnow-settings` 구현.
- PUT은 기존 스키마로 입력·사이트 범위를 검증하고 Naver·Bing 설정을 같은 트랜잭션에서 upsert한다. 사이트 행 잠금으로 같은 사이트의 변경을 직렬화한다. 기존 등록 상태·확인 시각·오류는 유지한다.
- GET은 미설정 시 `configured=false`, 완전한 두 엔진 설정이 일치하면 `configured=true`와 파일 주소를 반환한다. 불완전·불일치 설정은 409이며 PUT으로 복구한다.
- 없는 사이트·개별 글은 404. 키 원문은 성공 응답과 새 라우터의 검증 오류에서 제외한다. 공개 파일 주소 자체에는 키 문자열이 포함될 수 있다.
- 기존 컬럼을 사용하므로 새 마이그레이션은 없다. 외부 제출·파일 배포·화면 연결은 이번 범위에 포함하지 않았다.
- 검증: DB 없는 테스트 469 passed, 관련 사이트 API·서비스 PostgreSQL 통합 테스트 42 passed. 통합 테스트는 별도 임시 DB를 생성·삭제했으며 개발 DB 데이터는 변경하지 않았다.
- Docker Desktop과 기존 PostgreSQL 컨테이너를 시작했다. 실제 외부 검색엔진 호출·원격 push·커밋은 실행하지 않았다. 기존 미추적 `extension/`은 보존했다.
- 상세 계약: [indexnow-settings-api.md](indexnow-settings-api.md). 다음 작업은 DB 기반 URL 제출 서비스·API다.

## 현재 세션 인계 요약 — IndexNow / 2026-10-27

이 절과 마지막 상태가 아래의 과거 스냅샷보다 우선한다. Google 세션의 구현·보류 기록은 그대로 보존한다.

### 완료된 작업

- [x] `app/engines/indexnow/schemas.py`: Pydantic 불변 요청·응답, 공통 `IndexNowKey`·`IndexNowUrl`, 키 형식·호스트·적용 경로·URL 개수 검사, 중복 제거. 별도 types.py·validation.py는 schemas.py로 통합했다.
- [x] `client.py`: 외부에서 주입받은 httpx.AsyncClient로 공통 엔드포인트에 POST. urls→urlList, key_location→keyLocation 변환. 연결 10초, 읽기·쓰기·풀 대기 각각 30초. 리다이렉트·자체 재시도 없음. 200 접수 성공, 202 키 확인 중, 다른 HTTP 응답 실패. 타임아웃·통신 오류는 별도 예외이며 접수 여부를 단정하지 않는다.
- [x] Alembic `0002`로 engine_registrations에 nullable TEXT `indexnow_key`, `indexnow_key_location` 추가. 로컬 개발 DB 적용, 기존 데이터 보존·모델 일치 확인.
- [x] 사이트 폼·SiteCreate에 선택 키 설정 추가. 둘 다 생략 가능, 입력 시 두 값 필수. sites 저장값에서 두 필드를 제외하고 `services/engine_registration.py`에서 Naver·Bing 행을 생성한다. 같은 세션·트랜잭션을 사용하고 엔진 설정 실패 시 사이트도 롤백한다. 등록 상태는 unknown이며 실제 소유 확인을 의미하지 않는다.
- [x] PostgreSQL 통합 포함 전체 테스트 **284 passed**, JavaScript 구문 검사·git diff --check 통과. DB 없는 테스트는 **230 passed, 54 deselected**. 서로 다른 테스트 범위의 수치를 합산하지 않는다.
- [x] Notion의 DB 컬럼 표·설정 운영 규칙·사용자 입력 항목을 갱신했다. ‘개인용’ 연결을 사용하며 문서 주소는 아래 요구사항 원문을 따른다.

### 실제 Vercel 블로그 검증 및 남아 있는 데이터

- 대상: `https://otteru.vercel.app/`. 별도 블로그 저장소는 `/Users/kim-yudam/Desktop/study/sideProject/nextjs-notion-starter-kit`이다.
- 기존 `public/<indexnow-key>.txt`를 재사용했다. 운영 파일 HTTP 200, UTF-8 텍스트·키 일치·로컬 파일과 일치를 확인했다. 새 파일 배포나 새 키 생성은 하지 않았다.
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

최종 갱신일: 2026-10-27 (Asia/Seoul)
프로젝트: StartPress 검색엔진 등록·발행 알림·색인 모니터링 자동화
작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`

## 가장 먼저 확인할 사항

1. **개발 환경은 Miniconda `startpress`다. `.venv`를 만들거나 `uv sync`·`uv run`을 실행하지 않는다.** 직접 Python을 실행할 때도 `PYTHONNOUSERSITE=1`을 지정한다.
2. **현재 브랜치는 codex/indexnow-integration**이다. Google 구현 `1765f5b`를 기준으로 승인한 IndexNow 변경을 네 커밋으로 나눴다. main/master 직접 push 금지는 유지하며 이번에도 원격 push는 하지 않았다.
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

## 과거 마지막 상태 — 2026-10-27

- 갱신일: **2026-10-27 / Asia/Seoul**.
- 작업 디렉터리: `/Users/kim-yudam/Desktop/study/sideProject/webmaster_automation`.
- 브랜치: **codex/indexnow-integration**, 기준 커밋 **1765f5b** — Google 구현. 마지막 기능 커밋은 **383965f**이고, 이후 이 파일을 담은 문서 커밋을 git log로 확인한다.
- 사용자가 네 커밋 구성을 승인했다. 기능 세 커밋과 검증 보고서·인계 문서 커밋으로 정리했으며 원격 push는 하지 않았다.
- 실행 환경: **Miniconda startpress**, 직접 실행 시 **PYTHONNOUSERSITE=1**, .venv 사용 금지.
- DB: **PostgreSQL 18.6 / Alembic 0002(head)**. 테스트 고객사·블로그와 Naver·Bing 키 설정이 저장돼 있다.
- 마지막 전체 검증: PostgreSQL 통합 포함 **284 passed**. 이후 실사용 테스트는 별도이며 반복 제출하지 않는다.
- 실제 IndexNow: **2026-10-27 19:09 KST, 메인 URL 1개·1회 제출·HTTP 200 accepted**. 개별 엔진의 수집·색인 완료를 뜻하지 않는다.
- 다음 작업: 기능 구현은 기존 사이트의 키 설정 변경 → DB 기반 제출 서비스·API·화면 버튼 → 결과 저장 흐름 순서다.
- 보존: Google 세션 기록·기존 공개 검증 파일·로컬 ERD 자료. .env·토큰은 커밋·출력하지 않는다.

새 세션에서: **‘docs/HANDOFF.md의 현재 세션 인계 요약을 읽고 이어서 진행해줘. Google은 1765f5b에 커밋됐고 IndexNow 클라이언트·설정 저장은 codex/indexnow-integration 브랜치에 커밋했어. 실제 Vercel 블로그 제출은 HTTP 200이었으며 기록된 URL을 테스트 목적으로 반복 제출하지 마. 추가 변경과 원격 push는 별도 요청 범위에 맞춰 진행해.’**


## 과거 마지막 상태 — 2026-11-03

- 브랜치: **feat/chrome-extension**. HEAD: **730f7d0 — [feat] 부모 사이트별 글 목록 조회 API 구현**.
- 네 API 기능 커밋은 위 최신 요약을 따른다. 원격 push는 하지 않았다.
- 미커밋: 인증 오류 세분화·error_code 저장·관련 테스트, pgAdmin compose 변경, 새 0003 오류 코드 마이그레이션, 미추적 extension/.
- 실제 개발 DB는 **0002**, error_code 컬럼 없음. **새 0003은 미적용**이며 코드·DB 불일치를 다음 작업에서 먼저 확인한다.
- 검증 기록: 전체 599개는 검사 API 구현 시점, 관련 55개는 글 목록 추가 시점. 현재 미커밋 전체는 미검증이다.
- 다음 작업: 미커밋 변경·DB 정합성 검증 → 프론트 글 목록·검사 API 연결 마무리·전체 흐름 확인.
- .env·OAuth 토큰·API 키·기존 운영 검증 파일·개발 데이터를 보존한다. 별도 /submissions 구현은 복구하지 않는다.
- 이 요청에서는 docs/HANDOFF.md만 업데이트했다. 인계 문서는 아직 커밋하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약을 읽고 이어서 진행해줘. HEAD는 730f7d0이고 extension/과 인증 오류 코드 변경은 미커밋이야. 새 0003 오류 코드 마이그레이션은 실제 DB에 아직 적용되지 않았으니 먼저 코드·DB 상태부터 확인해줘. 핵심 기능을 우선하고 별도 submissions API는 만들지 마.”**


## 추가 인계 기록 — 2026-11-04

- 브랜치 **feat/chrome-extension**, HEAD **afa2ef8**. 이번 세 커밋은 **f4283ba → 27a6b3a → afa2ef8** 순서이며 원격 push는 하지 않았다.
- `extension/`은 커밋 완료. 고객사 선택·대시보드와 Google·Bing 사이트맵 제출 API·화면까지 구현돼 있다.
- 마지막 커밋 사본 검증: 백엔드 **647 passed**, 프론트 **42 passed**, TypeScript·Vite 빌드 통과. 다른 시점 테스트와 합산하지 않는다.
- 개발 DB는 이번 인계 확인 기준 **0003**, **error_code 컬럼 존재**. 해당 마이그레이션 소스는 여전히 미추적이며 이번 요청에서 적용한 것은 아니다.
- 남은 미커밋은 인증 오류 코드 관련 소스·테스트·0003·문서, pgAdmin compose, 기존 라우터 설명 주석이다. 임의로 되돌리거나 커밋하지 않는다.
- 대시보드의 Google 색인 0개는 **메인페이지 제외·등록 글 0개** 때문임을 확인했다. 메인페이지는 Google indexed다. 메인페이지 상태 분리 표시는 개선 후보이며 아직 구현 요청은 없다.
- 이번 인계 요청은 **docs/HANDOFF.md만 갱신**했다. 문서 커밋·push·DB 변경·외부 검색엔진 호출은 하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약과 맨 아래 최신 상태를 읽고 이어서 진행해줘. feat/chrome-extension의 HEAD는 afa2ef8이고 프론트·대시보드·사이트맵을 세 커밋으로 나눴어. 개발 DB는 0003·error_code 있음이 확인됐지만 인증 오류 코드와 마이그레이션 소스는 아직 미커밋이야. 대시보드는 등록 글만 집계해 메인페이지 색인과 숫자가 다를 수 있으니 구분해줘. 실제 외부 제출을 테스트 목적으로 반복하지 마.”**


## 과거 마지막 상태 — 2026-11-04

- 브랜치 **feat/chrome-extension**, HEAD **afa2ef8 — [feat] Google·Bing 사이트맵 제출 API와 화면 연결**.
- 사이트맵은 `POST /sites/{main_site_id}/sitemaps`와 프론트 버튼 연결까지 완료했다. `/pages`에 자동 제출을 추가하지 않는다.
- 성공은 초록색 `#27775f`, 실패는 빨간색. 실패 메시지 조합은 `extension/src/main.ts`의 `submitSitemap()` catch, 현재 약 868~872줄이다.
- 개발 DB를 읽기 전용으로 재확인: **0003**, **error_code 컬럼 존재**. 다만 0003 파일과 인증 오류 코드 변경은 미커밋이다.
- 대시보드·Chrome Manifest V3 실행 구성·extension/은 커밋되어 있다. app/main.py의 미커밋 라우터·주석 변경도 보존한다.
- 검증 기록: 사이트맵 신규 백엔드 38 passed, 당시 전체 백엔드 650 passed, 버튼 연결 후 프론트 42 passed·빌드 통과. 색상 변경 후에는 diff 검사만 수행했다.
- 현재 요청에서는 docs/HANDOFF.md만 갱신했다. 커밋·push·실제 검색엔진 요청·DB 변경은 하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 맨 위 현재 인계 요약을 읽고 이어서 진행해줘. HEAD는 afa2ef8이고 사이트맵 API·프론트 버튼은 완료됐어. DB는 0003과 error_code 컬럼이 확인됐지만 관련 마이그레이션·인증 오류 코드 변경은 아직 미커밋이야. 기존 변경을 보존하고, 신규 도메인 등록·소유권 확인은 현재 범위에서 제외해.”**


## 과거 마지막 상태 — 2026-11-04 커밋·PR 정리

- 작업 브랜치는 **feat/chrome-extension**, PR 대상은 **main**이다. 기존 프론트·대시보드·사이트맵 커밋 위에 오류 코드 **037a394**, pgAdmin **988fb0d**, 문서·main 동기화 커밋을 순서대로 추가한다. 최신 HEAD는 `git log -1`로 확인한다.
- 오류 코드와 **0003 소스도 커밋 완료**다. 개발 DB는 0003·error_code 있음이 확인됐으며 기존 데이터는 보존했다.
- 마지막 검증은 **백엔드 650개**, **프론트 42개**, TypeScript·Vite 빌드·Compose 설정·diff 공백 검사 통과다. 실제 엔진 호출은 하지 않았다.
- main의 문서 변경과 HANDOFF 충돌을 해결해 PR에 반영한다. 기존 AI 로그인봇 실험과 네이버 실로그인은 범위 밖이며, 브라우저 작업 전 실행 기록 규칙을 확인한다.
- 사용자 승인 범위는 이 브랜치 push와 main 대상 PR 생성까지다. 원격 PR URL·상태는 `gh pr view`로 확인하며 main 직접 push·PR 병합을 하지 않는다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최신 인계 요약을 읽고 이어서 진행해줘. feat/chrome-extension에서 오류 코드·0003·pgAdmin까지 커밋했고 main 대상 PR 생성 작업을 진행했어. gh pr view와 git status로 최종 원격 상태를 먼저 확인해줘. DB·실제 검색엔진 상태를 테스트 목적으로 바꾸지 말고 신규 도메인 등록·소유 확인은 현재 범위에서 제외해.”**

## 과거 마지막 상태 — 2026-11-05 Lightsail 배포와 확장 개발 인계

- 로컬은 `main`, HEAD `4444868`이며 PR #4까지 병합됐다. 기존 미커밋 Vite 변경은 프록시를 SSH 터널 포트 `18001`에 연결한다. 이 요청에서 `docs/HANDOFF.md`를 추가로 갱신했다.
- 사용자가 시드니 Lightsail에 FastAPI·PostgreSQL을 배포하고 Mac의 SSH 터널과 대시보드에서 고객사 저장·새로고침 후 조회까지 확인했다. AWS 컨테이너는 계속 실행해두기로 했다.
- 최신 대시보드는 Chrome 확장에 포함한다. AWS 프론트 웹 호스팅을 위한 Docker 변경은 진행하지 않는다. 다음 작업은 로그인된 네이버 탭 선택과 결과 읽기 기능이다.
- 설치된 확장 API 주소는 아직 로컬 `8000`이다. Vite `18001`은 웹 개발 경로만 바꾸므로 설치된 확장의 서버 연결을 별도로 준비한다.
- 팀 배포용 HTTPS·팀원 인증·고정 IP·AWS DB 외부 백업은 후속 작업이다. 도메인은 현재 보유하지 않는다. Google·Bing 운영용 인증 연결도 남아 있다.
- 현재 요청에서는 인계 문서를 업데이트하고 diff만 검증했다. 서버 기동·고객사 저장·복구의 사용자 확인과 이전 도구 검증 결과를 구분해 기록했다.

새 세션에서는 **“docs/HANDOFF.md의 2026-11-05 최신 요약을 읽고 이어서 진행해줘. main 4444868에 배포 PR까지 병합했고 Lightsail API·DB와 SSH 터널 18001을 통한 저장·조회를 확인했어. 로컬 Vite의 미커밋 변경을 보존하고 최신 main 기준 확장 개발 브랜치에서 로그인된 네이버 탭 선택·결과 읽기부터 한 단계씩 진행해줘.”**라고 전달한다.


## 과거 마지막 상태 — 2026-11-08 GUI 저장 구현 전 병렬 실행 인계

- 브랜치 `feat/webmaster-tab-automation`, HEAD `499f553`이며 같은 원격 브랜치에 push 완료했다. 현재 원격 추적 HEAD도 일치한다. 실제 원격 상태는 다음 Git 작업 직전에 재확인한다.
- 네이버 탭 선택·기존 결과 읽기·사이트별 URL 검사, Bing 사이트 선택·색인 결과/상세 판독과 메뉴 visibility 수정, API 처리 이후 두 GUI 병렬 실행까지 구현했다.
- **Google/Bing API 관측은 기존 DB 저장, 네이버/Bing GUI 관측은 이번 실행 화면에만 보관한다.** GUI 관측을 DB 저장·대시보드 통계 갱신으로 설명하지 않는다.
- 최신 검증은 프론트 102 passed·타입 검사·빌드 통과다. 실제 네이버 기존 결과 읽기와 Bing 단일 사이트의 등록 글 검사 결과 도달을 확인했다. 수정 후 네이버 전체 자동 순회·여러 실제 사이트 전환·두 GUI 실제 병렬 실행·관리 화면 최종 건수는 아직 미검증이다.
- 두 API 연결 경로는 Mac `18001` SSH 터널로 통일했다. 원격 서버·DB의 현재 상태는 이번 인계에서 다시 조회하지 않았다.
- 보존할 미커밋: Python 두 파일의 빈 줄 변경과 Bing 디렉터리의 `.gitkeep`. 이번 `docs/HANDOFF.md` 업데이트도 미커밋으로 남긴다. 소스·DB 변경·실제 외부 재조회 없이 문서와 Git 차이만 확인했다.
- 다음 작업은 실제 병렬 실행 검증, 이후 요청 시 GUI 결과 저장 계약·API/DB 연결이다. 로그는 `.secrets/bot_runs/`에만 남기고 인증정보·실제 입력·쿼리를 기록하지 않는다.

새 세션 시작 문구: **“docs/HANDOFF.md의 2026-11-08 최신 요약을 읽고 이어서 진행해줘. feat/webmaster-tab-automation의 499f553까지 push했고 네이버·Bing GUI를 병렬 실행해. GUI 관측은 DB 미저장이며 실제 두 엔진 병렬·여러 사이트 순회는 아직 미검증이야. 기존 미커밋 변경을 보존하고, 먼저 확장·작업 탭·관리 탭 빌드 상태와 로그인 상태를 확인해줘.”**

## 과거 마지막 상태 — 2026-11-08 GUI 저장·운영 인증 준비와 최종 검수

- 브랜치 `feat/webmaster-tab-automation`, GUI 저장 기능 기준은 `f8f049fa822af4952f1e233264dfed3fd834b7f5`다. 후속 요청으로 원격과 기존 PR을 확인하고 안내 정리 `cf71d18`·운영 인증 `c305c58`을 커밋했다. 이 문서 커밋 후 push·PR 생성까지 진행하며, 최종 HEAD·PR 상태는 Git/GitHub에서 조회한다.
- 네이버·Bing의 GUI 요약 관측을 기존 `site_engine_statuses`에 저장하며 Bing API·GUI는 같은 대상의 최신 상태 한 행을 공유한다. 별도 테이블·새 마이그레이션은 없다. 실행 목록과 판정 원문·대표 URL·제외 사유 등 상세 관측은 화면 메모리에만 남는다.
- 대시보드의 네이버 연결 준비 중 문구를 조회·저장 지원/집계 미지원으로 수정했고 README의 GUI DB 미저장 설명과 저장 API 목록을 정리했다.
- 로컬 운영 Compose에 Google·Bing 환경변수 전달과 서버 토큰 전용 폴더 연결을 준비했다. 사용자는 Google 토큰 전송 완료를 확인했다. Google 로컬 토큰 갱신·Search Console GET HTTP 200은 실제 검증했지만 Lightsail 파일·권한·Bing 키·컨테이너 반영은 아직 미확인이다.
- 직전 전체 검수는 백엔드 691 passed(단위 531 + 임시 PostgreSQL 통합 160), 프론트 121 passed·TypeScript·Vite 빌드·Compose 설정·diff 검사 통과였다. 이번 안내 문구 변경 후 프론트 검사 결과는 최상단 검증 절을 따른다. 실제 Chrome 전체 순회·병렬 GUI 저장·Lightsail 배포 검증은 수행하지 않았다.
- 다섯 파일을 대시보드/README 안내 수정, 운영 인증 Compose/예시 설정, 인계 문서의 세 커밋으로 정리한다. 미추적 `extension/src/engines/bing/.gitkeep`와 모든 비밀파일은 제외한다. 사용자는 후속 요청에서 커밋·push·PR 생성을 승인했다. 병합·배포는 수행하지 않는다.
- 다음 순서: 인계 문서 커밋 → push·PR 생성 후 최종 상태 검증 → main 병합 후 서버 main 갱신 → 서버 비공개 설정·토큰 권한 준비 → **서버 SSH 터미널에서** `docker compose --env-file .env.prod -f compose.prod.yaml up -d --build api` → API 인증·GUI 저장 후 GET 확인이다. 팀원 인증 전에는 localhost 바인딩과 SSH 터널을 유지한다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 최신 상태를 읽고 이어서 진행해줘. feat/webmaster-tab-automation에서 GUI 저장 기능과 안내·운영 인증 배포 설정을 커밋했고, 사용자가 push·PR 생성까지 요청했어. 실제 완료 상태는 git status·HEAD와 기존 PR을 조회해 확인해줘. Google 토큰은 로컬 인증 성공·서버 전송 사용자 확인까지이며 Lightsail 반영과 실제 전체 GUI 저장은 미검증이야. 키·토큰·.gitkeep는 제외하고 병합·서버 배포는 별도 요청 범위로 유지해줘.”**


## 과거 마지막 상태 — 2026-11-09 main 병합·네이버 집계 반영과 다음 작업

- 현재 로컬 브랜치는 `main`, HEAD는 `b37251a`이며 로컬 `origin/main` 참조와 일치한다. PR #5 병합(`dd694d6`)과 네이버 대시보드 PR #6 병합(`b37251a`)은 로컬 이력에서 확인했다. 이번에는 fetch·원격 GitHub 조회를 하지 않았다.
- GUI 저장 API·확장 저장 연결·운영 Google/Bing 인증 전달 설정이 main에 포함돼 있다. 네이버 대시보드 집계도 `6adcbcc`로 구현돼 있으므로 신규 구현 대상으로 잡지 않는다.
- 대시보드는 외부 요청 없이 DB의 등록 글 상태를 집계한다. 메인페이지 제외·비활성 포함, 미관측 또는 성공 관측 시각 없음은 `unknown`이다. 전체 조회는 활성 사이트·글을 대상으로 하므로 두 범위를 구분한다.
- Lightsail 최신 배포·Google/Bing 운영 인증·실제 두 GUI 병렬 실행·여러 사이트 전체 순회·GUI 저장 후 GET·네이버 집계 반영은 이번 세션에서 검증하지 않았다. Google 로컬 인증 성공과 서버 토큰 전송 사용자 확인은 이전 기록이며 서버 인증 성공 증거가 아니다.
- 다음 순서: 서버 배포 상태 확인 → 필요 시 서버 main 갱신·비공개 설정·토큰 권한 준비·API 재빌드 → Google/Bing 운영 조회 → 새 확장 적용·전체 GUI 순회 → 저장 GET·대시보드 재조회 확인. 서버를 먼저 배포하고 팀원 인증 전에는 localhost 바인딩과 SSH 터널을 유지한다.
- 이번 요청은 `docs/HANDOFF.md`만 갱신했다. 수정 전 작업 트리는 깨끗했으며 수정 후 이 문서만 미커밋으로 남긴다. 기존 테스트 수치는 과거 기록이며 이번에는 문서 diff만 검증했다. 커밋·push·배포·DB 변경·실제 외부 호출은 수행하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 2026-11-09 최신 상태를 읽고 이어서 진행해줘. 로컬 main b37251a에 GUI 저장 PR #5와 네이버 대시보드 PR #6이 병합돼 있어. 인계 문서 수정은 미커밋이므로 보존해줘. 다음은 Lightsail 배포 상태·운영 인증 확인과 실제 전체 조회·GUI 저장·대시보드 반영 검증이야. 로컬 병합과 서버 배포, 과거 테스트와 실검증을 구분하고 실제 작업 범위는 새 요청에 맞춰 진행해줘.”**


## 과거 마지막 상태 — 2026-11-09 비공개 스토어 제출용 ZIP 재생성

- 브랜치 `chore/private-extension-release`, HEAD `2820ceb`. 아이콘 `0e7d2e8` push 완료, SSH 안내 `2820ceb` 로컬 커밋 완료·미push. 로컬 원격 추적 참조보다 1커밋 앞선 상태다.
- 최신 빌드로 `extension/startpress-extension.zip`을 교체했다. ZIP 루트 manifest·필수 파일·아이콘 크기·무결성·최신 dist 바이트 일치·SSH 안내 포함을 확인했다. 11파일·66,421바이트이며 원본 로고는 제외했다.
- 이번 검증: TypeScript·Vite 빌드·ZIP 검사·`git diff --check`. 전체 테스트·실제 브라우저·원격 서버 인증·스토어 업로드·심사 완료는 검증하지 않았다.
- `docs/HANDOFF.md`는 기존 변경을 포함한 미커밋, ZIP은 미추적으로 보존한다. 이번 요청에서는 추가 커밋·push·PR 생성·서버 배포·외부 제출을 수행하지 않았다.
- 다음은 스토어 설명/이미지·개인정보 공개·권한 이유·심사 테스트 방법·비공개 사용자 설정 준비 후 제출이다. 별도 팀원 설치 문서는 추후 작성할 수 있으며 SSH는 현재 계속 필요하다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 최신 상태를 읽고 이어서 진행해줘. chore/private-extension-release HEAD 2820ceb에 아이콘과 SSH 안내를 커밋했고, 아이콘만 push했어. 최신 ZIP은 extension/startpress-extension.zip이며 SSH 안내가 포함됐고 빌드·ZIP 검증을 통과했어. 문서는 미커밋·ZIP은 미추적이므로 보존해줘. 스토어 업로드는 아직 안 했고 설명·개인정보 공개·심사 테스트 방법·비공개 사용자 설정을 준비해야 해. SSH는 유지하며 원격 배포와 실검증을 완료된 것으로 설명하지 마.”**


## 과거 마지막 상태 — 2026-11-10 스토어 심사 제출 사용자 확인

- 사용자가 스토어 심사 제출 완료를 알렸다. 승인·게시 완료 여부, 최종 Private 설정과 허용 사용자 목록은 직접 확인하지 않았다.
- `chore/private-extension-release`에서 아이콘 `0e7d2e8`·SSH 안내 `2820ceb`를 완료했다. 인계 문서·스토어 스크린샷을 `4b19604`로 커밋·push하고 main 대상 [PR #7](https://github.com/StartPress26/webmaster-automation/pull/7)을 생성했다. PR은 OPEN이며 병합하지 않았다. 최종 HEAD·PR 상태는 `git log -1`, `git status`, `gh pr view`로 확인한다. main 직접 push·PR 병합은 하지 않는다.
- 최신 ZIP은 0.1.0·11파일·66,421바이트이며 원본 로고 제외·압축 무결성·SSH 안내 포함을 재확인했다. ZIP은 로컬 미추적 배포 산출물로 남기며 커밋하지 않는다.
- Notion 개인정보처리방침 작성과 사용자 확정 사항 반영을 완료했다. 공개 설정·익명 접근은 미확인이다. 공개 페이지에는 확인용 메모나 미정 표시를 넣지 않는다. 질문은 채팅에서만 한다.
- 다음은 심사 결과 확인→필요한 보완→비공개 게시·팀원 설치 및 SSH 사용 검증이다. 운영 서버·GUI 전체 흐름의 실제 검증은 과거 기록과 구분한다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 2026-11-10 최신 상태를 읽고 이어서 진행해줘. 사용자가 Chrome 웹 스토어 심사 제출을 완료했다고 확인했어. chore/private-extension-release에서 아이콘·SSH 안내와 인계 문서·스토어 스크린샷을 정리했고 커밋·push·PR 생성도 요청했으니 최종 Git/PR 상태부터 확인해줘. ZIP은 로컬 산출물로 보존하고 개인정보처리방침은 지정 Notion 페이지에 작성돼 있어. 공개 페이지에는 검토 메모·미정 표시를 넣지 말고 채팅에서 먼저 확인해줘. 심사 승인·게시·운영 서버 실검증은 완료된 것으로 단정하지 마.”**


## 과거 마지막 상태 — 2026-11-12 사이트별 인증 계정 연결

- 브랜치 `feat/site-auth-profiles`. 모델·마이그레이션 `8566309`, 계정 등록·조회 `a128d68`, 사이트 등록·PATCH `c7c1de1`, 프론트 연결 `a57f6ef`, 의존성 보안 업데이트 `966d07b`를 완료했다. 이 인계와 README는 별도 문서 커밋으로 정리하며 같은 브랜치 push 범위에 포함한다. 최종 HEAD·원격 일치는 Git에서 확인한다.
- 사용자 로컬 `0004` 적용·테이블/FK 확인·계정 API 테스트 완료. 자동 검증은 단위 580개·관련 PostgreSQL 통합 82개, 프론트 131개·TypeScript·빌드 통과다. 실제 사이트별 검색엔진 인증은 아직 공통 서버 인증에서 전환되지 않았다.
- 남길 로컬 변경: `extension/vite.config.ts`의 프록시 `8000`. 미추적 ZIP은 보존·커밋 제외하며 재생성하지 않았다. 실제 브라우저·운영 서버 배포·스토어 심사 결과는 이번에 검증하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 2026-11-12 요약부터 읽고 이어서 진행해줘. 이메일 기반 인증 계정과 사이트 등록·PATCH, 프론트 연결까지 구현됐고 실제 엔진 호출은 여전히 공통 서버 인증이야. 프록시 8000 로컬 변경과 ZIP은 커밋 제외로 보존해줘. 현재 Git/원격 상태를 먼저 확인하고, 다음은 비밀파일 로더와 사이트별 API 인증 주입을 단계적으로 진행하자.”**


## 과거 마지막 상태 — 2026-11-12 사이트별 API 인증·재인증 인계

- `feat/site-auth-profiles`, HEAD `d6ed73b`. 공통 로더와 검사·사이트맵의 계정별 인증 전달은 구현했고 소스·테스트는 미커밋이다. 단위 655개·관련 PostgreSQL 통합 81개 통과. 개인 패키지 충돌을 피하려면 `PYTHONNOUSERSITE=1`로 실행한다.
- 로컬 계정별 Google·Bing 파일은 생성했고 사용자 DB 참조 등록·사이트 계정 PATCH 완료 보고가 있다. Google 실제 검사는 503이며 직접 갱신 재현에서도 `invalid_grant`가 확인됐다. 새 토큰 발급과 실제 API 조회 성공은 미완료다.
- 사용자가 요청한 Google 재인증은 클라이언트 파일·토큰 파일 존재 확인까지만 했다. `.env` 수정·토큰 백업·OAuth 실행·로그인·새 토큰 저장은 아직 하지 않았다. 이 작업 중단 후 사용자가 인계 문서 갱신을 요청했다.
- 기존 Vite 프록시 변경·ZIP·사용자 작성 코드·비밀파일을 보존한다. 서버 비밀폴더는 `/home/example-user/webmaster-secrets`를 유지한다. 원격 Git·운영 DB 버전·실제 배포는 미확인이다. 이번 요청에서 문서만 갱신하고 커밋·push·배포는 하지 않는다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 사이트별 API 인증·재인증 인계를 읽고 이어서 진행해줘. 검사·사이트맵의 계정별 인증은 미커밋 상태로 구현됐고 단위 655개·통합 81개 통과했어. 로컬 Google refresh token이 invalid_grant로 거부돼 재인증이 필요해. 재인증은 아직 실행하지 않았으니 대상 계정 파일과 OAuth 클라이언트를 확인하고 사용자 로그인·동의를 받아 새 토큰 저장부터 진행해줘. 키·토큰은 출력하지 말고 Vite 프록시·ZIP·사용자 변경을 보존해줘. 서버 배포와 실제 API 성공은 아직 확인하지 않았어.”**


## 과거 마지막 상태 — 2026-11-12 사이트별 인증 실검증·커밋 정리

- `feat/site-auth-profiles`에서 로더·참조 조회 `103ce1d`, 검사·사이트맵 인증 전달 `d408424`, 운영 환경변수 정리 `c21efe5`를 커밋했고 이 문서를 네 번째 커밋으로 정리한다. 사용자는 리뷰 후 해당 계획 실행을 승인했다. 최종 HEAD·커밋 목록은 `git log -4 --oneline`으로 확인한다. push·PR·main 병합·배포는 하지 않는다.
- Google 사용자 동의로 새 계정 토큰을 발급·저장했고 기존 파일은 비공개 백업했다. 에이전트가 계정별 파일로 Search Console 사이트 목록 HTTP 200을 확인했고 사용자가 Google·Bing 실제 검사 모두 성공했다고 보고했다. 실제 사이트맵 제출·운영 반영은 미검증이다.
- 단위 655개·임시 PostgreSQL의 관련 통합 81개 통과. 운영 Compose의 공통 `GOOGLE_TOKEN_FILE`·`BING_API_KEY` 필수 설정을 제거하고 비밀폴더 마운트를 유지한다. 공통 인증 변수를 제외한 Compose 설정 검증과 로더·조회 단위 테스트 37개도 통과했다.
- Vite 프록시 8000 변경·미추적 ZIP·`.env`·`.secrets`·실제 토큰과 키·백업·비공개 기록은 커밋 제외다. 서버 비밀폴더는 `/home/example-user/webmaster-secrets`를 유지한다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 최신 요약을 읽고 이어서 진행해줘. 사이트별 인증 연결과 로컬 Google 재인증이 완료됐고 사용자가 Google·Bing 실제 검사를 확인했어. 승인된 4개 커밋의 완료 상태는 git log와 status로 확인해줘. push·PR·main 병합·Lightsail 배포는 아직 수행하지 않았어. 운영에서는 새 Google 파일과 DB 계정·참조·사이트 연결을 별도로 준비해야 해. Vite 프록시·ZIP·비밀파일은 커밋에서 제외해줘.”**


## 과거 마지막 상태 — 2026-11-16 운영 검증·확장 미커밋

- 브랜치 `feat/main-page-inspection-dashboard`. 기존 `c0e60ba`는 상단 Bing 카드 값만 indexed로 바꿨고 라벨·블로그별 표는 정리되지 않았다. 메인페이지 별도 집계 구현은 없다.
- 후속 사용자 승인으로 버전 3파일을 `a92d0cf`로 커밋하고 이 인계를 별도 docs 커밋으로 정리해 브랜치에 push한다. 최종 문서 커밋과 원격 HEAD는 Git으로 확인한다. Vite 프록시·ZIP은 남겨두며 PR·병합·배포는 하지 않는다.
- PR #8은 main 병합됐고 운영 Google·Bing 인증/조회는 사용자 응답으로 확인했다. 에이전트의 운영 GET 조사에서 루트 메인페이지는 세 엔진 indexed, 등록 글 1개는 Google not_indexed·네이버 unknown·Bing indexed였다.
- 현재 프론트 테스트 131 passed. 기존 0.1.1 ZIP에는 `c0e60ba`가 포함되지 않았고 사용자가 0.1.1 스토어 심사 통과를 보고했다. 다음 화면 변경 배포는 새 버전·빌드·ZIP이 필요하다.
- 다음 작업은 승인된 커밋·push 완료 확인, 사용자 요청 시 PR, Bing 라벨/표 정리, 메인페이지 별도 표시 요구 확정이다. Vite·ZIP·비밀파일은 커밋 제외로 보존한다.

새 세션 시작 문구: **“docs/HANDOFF.md 최상단과 맨 아래 2026-11-16 요약부터 읽어줘. feat/main-page-inspection-dashboard에서 기존 c0e60ba의 Bing 카드 변경에 이어 버전 0.1.1 커밋 a92d0cf와 HANDOFF 커밋·push를 승인받아 진행했어. 최종 HEAD·원격 일치는 Git에서 확인해줘. Bing 라벨과 표는 아직이고 PR·배포는 하지 않았어. Vite 프록시·ZIP·비밀파일은 제외해줘. 운영 인증은 확인됐고 메인페이지와 등록 글 통계는 구분해야 해. 현재 ZIP은 c0e60ba 미포함이야.”**

## 과거 마지막 상태 — 2026-11-16 메인 사이트 대시보드 PR #9

- 메인 사이트 저장 관측의 대시보드 API·별도 표, 실행 목록의 메인/글 구분과 완료 후 자동 반영 회귀 검증, Bing 카드·표·상태 순서 통일을 완료했다. 글 통계와 메인 관측은 분리한다.
- 백엔드 단위 655개·대시보드 PostgreSQL 통합 5개·프론트 136개·타입 검사·빌드·diff 검사 통과. 실제 외부 검색엔진 검사나 운영 배포를 새로 실행한 것은 아니다.
- 기능 커밋 `1616e68`을 원격 브랜치에 push하고 main 대상 [PR #9](https://github.com/StartPress26/webmaster-automation/pull/9)를 생성했다. 후속 HANDOFF docs 커밋과 최종 원격 일치는 Git에서 확인한다. Vite 프록시와 기존 ZIP은 커밋하지 않는다. 병합·배포·버전 증가·ZIP 재생성은 수행하지 않는다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 최신 상태부터 읽어줘. feat/main-page-inspection-dashboard에서 메인 사이트 별도 표시와 Bing 표시 통일을 1616e68로 커밋·push하고 main 대상 PR #9를 생성했어. HANDOFF 갱신도 별도 docs 커밋·push 범위야. 백엔드 단위 655개·임시 PostgreSQL 통합 5개·프론트 136개와 빌드가 통과했어. 최종 커밋·원격 일치·PR 상태를 확인하고, 기존 Vite·ZIP 변경은 보존해줘. 병합·운영 배포·새 스토어 업데이트는 아직 수행하지 않았어.”**


## 과거 마지막 상태 — 2026-11-16 발행 알림 GUI 수집

- 문서 최상단의 사용자 정정 후 흐름을 우선한다. 새 글 발행 알림에서 네이버 GUI 체크 → 탭 준비 → 글 저장/선택적 IndexNow → 네이버 수집 요청이다. 전체 색인 조회를 먼저 실행할 필요가 없다.
- 접수와 색인 관측을 분리하며 실제 외부 제출은 이번 검증에 포함하지 않는다. 검증·사용법·기록 위치는 `docs/naver-collection.md`와 최상단을 따른다.
- 작업은 `feat/naver-url-collection`의 미커밋 변경이다. 기존 Vite·ZIP을 보존했고 스토어 배포·운영 변경을 하지 않았다.


## 과거 마지막 상태 — 2026-11-17 네이버 GUI 실검증 중단

- 브랜치 `feat/naver-url-collection`, HEAD `da7155f`, 전부 미커밋. 기존 Vite·ZIP·비밀파일 보존. 커밋·push·운영 배포는 하지 않았다.
- 발행 알림 체크박스, 기존 글 확인 모달과 선택한 IndexNow/네이버 GUI 실행, 새 재알림 API, 디자인 여백 통일을 구현했다. 모달/API 단계 백엔드 단위 694개·임시 DB 통합 7개, 최신 프론트 208개·타입·빌드·diff 검사 통과.
- 사용자 명시 요구에 따라 네이티브 computer use로 Chrome을 직접 조작해 실패를 재현하고 실제 unpacked 확장을 새 빌드로 Reload했다. IndexNow는 모든 재현에서 껐고, 실제 네이버 요청 접수는 확인하지 못했다.
- 로딩 대기·클릭 직전 재검증·제출 전 연결 오류 표시를 보완했지만 **실탭은 여전히 site_missing으로 중단**한다. top DOM 링크·DB의 메인 URL은 일치했고 백그라운드 rect도 정상이다. 실제 수신 스크립트의 문맥·문서·대상 비교는 미완료다. 이 문제를 해결 완료로 보고하지 않는다.
- 기록 `.secrets/bot_runs/naver-gui-trace-20261116T124226828285Z.jsonl`. 현재 Chrome 네이버 board/DevTools와 관리 탭이 남아 있을 수 있으며 새 실행 전에 화면 상태와 AX ID를 다시 확인한다.

새 세션 시작 문구: **“docs/HANDOFF.md 최상단과 맨 아래 2026-11-17 최신 상태를 읽고 이어서 진행해줘. feat/naver-url-collection의 변경은 미커밋이며 발행 체크박스·기존 글 모달·IndexNow 재알림 API는 구현했어. 프론트 208개와 빌드는 통과했지만 네이버 실탭은 아직 site_missing으로 중단돼. computer use로 직접 조작해 재현했고 로딩 대기를 보완·개발 확장 Reload까지 했으나 해결되지 않았어. 실제 DOM·DB URL은 정상이라 수신 콘텐츠 스크립트의 문맥/문서/대상부터 진단해줘. IndexNow는 반복하지 말고 네이버 접수·수집·색인을 구분해. 기존 Vite·ZIP·비밀파일은 보존하고 커밋·push·배포는 별도 요청 전 하지 마.”**


## 과거 마지막 상태 — 2026-11-17 커밋 정리·후속 검증

- 현재 브랜치 `feat/naver-url-collection`에 API `2f8f94b`, 네이버 GUI 엔진 `93b0f0a`, 발행 UI `cdf9c53`을 로컬 커밋했다. 이 문서와 수집 사용법을 네 번째 문서 커밋으로 정리한다. 최종 HEAD는 `git log -4 --oneline`으로 확인한다. push·PR·배포는 하지 않는다.
- 프론트 208개·백엔드 단위 694개·UUID 임시 PostgreSQL 통합 7개, 타입·빌드·diff 검사 통과. 코드·보안 리뷰 완료. 사용자 학습용 주석과 함수 분해를 보존했다.
- 새 문서가 비활성 네이버 탭에서 준비되지 않는 현상을 동일 문서 활성화 비교로 확인했다. DevTools 포커스 에뮬레이션은 끔→켬→켬→끔 비교에서 켠 두 번만 백그라운드 사이트 선택·수집 화면 준비를 통과했고 사용자 탭 선택은 유지됐다. 실제 URL 제출·접수·수집·색인 완료는 미검증이다.
- 본 확장의 debugger 권한·CDP 연결·해제 코드는 아직 없다. 별도 `/tmp/startpress-focus-probe-20261117`의 실험 코드는 커밋하지 않으며, 새 권한 부여와 실제 확장 연동 검증은 아직 승인·실행하지 않았다.
- 다음 단계는 사용자 승인 후 실험 확장의 CDP 연결·취소·해제 검증이다. 화면을 뺏지 않는 백그라운드 처리 요구를 유지한다. 기존 Vite 프록시·ZIP·비밀파일·비공개 실행 기록은 커밋 제외로 보존한다.

새 세션 시작 문구: **“HANDOFF 최상단과 맨 아래 최신 상태부터 읽어줘. feat/naver-url-collection에서 기존 발행·네이버 GUI 구현을 네 개 로컬 커밋으로 정리했으니 Git 상태부터 확인해줘. DevTools 포커스 에뮬레이션으로 화면을 전환하지 않고 수집 화면까지 진입하는 것은 검증했지만, 본 확장에 debugger 권한과 연결·해제 코드는 아직 없고 실제 URL 접수도 미확인이야. 임시 실험 확장은 준비만 했으며 권한 승인은 아직 없어. Vite·ZIP·비밀파일은 제외하고 push·PR·배포는 별도 요청 전 하지 마.”**


## 마지막 상태 — 최신 / 2026-11-17 가독성 리팩터 병합·포커스 작업 진행 중

- 브랜치 `feat/naver-url-collection`, HEAD `025dceb`(PR #10 merge), 원격과 일치. `extension/src` 전체 가독성 리팩터(커밋 50개)가 병합됐고 `main.ts`는 `src/app/*`로 분할됐다. 기능·화면은 바뀌지 않았다(스냅샷 134건 동일, 테스트 208개 통과 시점 기준).
- 작업 트리에는 **다른 세션의 포커스 에뮬레이션 구현이 미커밋으로 진행 중**이다(`src/focus/*`, `tests/naver-focus.test.mjs`, `manifest.json`·`background.ts`·`app/controllers.ts`·`publication/controller.ts` 수정). 확인 시점에 tsc와 테스트 2개가 실패했으나 파일이 계속 바뀌고 있어 원인은 미확정이다. 이 세션은 그 파일을 수정하지 않았다.
- 통일하지 않은 동작 차이 2건(로그인 경로 검사 대소문자, naver/bing `inSite` 슬래시 처리)과 미룬 통합(automation 프리미티브, MutationObserver)은 최상단 절에 기록했다. 수동 Chrome 스모크는 아직이다.
- Vite 프록시·ZIP·비밀파일·비공개 기록은 커밋 제외로 보존한다. 이 문서 갱신은 커밋하지 않았다.

새 세션 시작 문구: **“docs/HANDOFF.md 최상단과 맨 아래 최신 상태부터 읽어줘. 확장 프론트 가독성 리팩터는 PR #10으로 feat/naver-url-collection에 병합됐고 main.ts는 src/app/*로 나뉘었어. 지금 작업 트리에는 다른 세션의 포커스 에뮬레이션 작업이 미커밋으로 있으니 먼저 git status와 npm run check·npm test로 현재 상태를 확인하고, 그 파일들은 진행 중이면 건드리지 마. 리팩터 뒤 Chrome 수동 스모크와 docs의 main.ts 경로 갱신이 남아 있어. Vite 프록시·ZIP·비밀파일은 제외하고 커밋·push·배포는 별도 요청 전 하지 마.”**


## 마지막 상태 — 최신 / 2026-11-17 포커스 모듈 실연동 확인

- `feat/naver-url-collection`의 리팩토링 구조를 유지하고 포커스 모듈·권한·runner 연결·오류 안내를 추가했다. 함수와 조건을 풀어 쓰고 한국어 주석을 붙였다. 미커밋이며 Vite 프록시와 기존 ZIP은 보존했다.
- 실제 개발 확장에서 사용자 화면을 전환하지 않고 목록→사이트→수집 화면 준비까지 두 번 성공했다. 완료·취소·관리 문서 종료 시 해제와 임시 작업 탭 종료 시 중단을 확인했다. 검증용 ESM·콘솔 변수·임시 탭은 정리했다.
- 실제 URL 입력·제출·접수·수집·색인 완료는 미검증이다. 프론트232개·타입·빌드·diff 검사와 코드·보안 리뷰 통과. 백엔드는 수정하지 않았다.
- 최신 기록: `.secrets/bot_runs/focus-integration-20261117T104325Z.jsonl`. 권한 미추가·CDP 미구현 및 다른 세션이 적은 중간 실패 상태보다 이 절을 우선한다. 커밋·push·PR·배포는 별도 요청 전 하지 않는다.
- 커밋 전 검토에서 해제 안내 중복·연결 종료의 취소 오표시·주소 없는 탭 이동 미감지를 보완했다(최상단 절 참조). 프론트 236개 통과. 주소 없는 이동의 실제 Chrome 동작은 미검증이다. 이 보완을 포함해 `feat/naver-url-collection`에 커밋·push했으며 Vite 프록시·ZIP은 제외했다. PR·배포·버전 증가는 하지 않았다.


## 과거 마지막 상태 — 2026-11-17 포커스 커밋·push 완료

- 브랜치 `feat/naver-url-collection`, HEAD **`e0d0ed7`**, 원격과 일치. 포커스 모듈·발행 연결·검토 보완 3건·색인 조회 적용·네이버 `not_indexed` 서버 허용까지 커밋·push했다. PR 없음.
- 프론트 237 passed, 백엔드 단위 696 passed, GUI 저장 통합 6 passed, 타입·빌드 통과. 실제 Chrome의 백그라운드 조회·주소 없는 이동 감지·실제 URL 접수는 미검증이다.
- 작업 트리에는 커밋 제외 `extension/vite.config.ts`·ZIP과 이 인계 문서 갱신만 남는다.

새 세션 시작 문구: **"docs/HANDOFF.md 최상단과 맨 아래 최신 상태부터 읽어줘. 포커스 에뮬레이션은 발행 GUI와 전체 색인 조회 모두에 적용돼 feat/naver-url-collection에 push됐어(e0d0ed7). 다음은 실제 Chrome에서 백그라운드 조회·수집 화면 준비와 주소 없는 탭 이동 감지를 확인하는 거야. 네이버 not_indexed는 서버만 허용했고 확장 판독은 아직이야. Vite 프록시·ZIP·비밀파일은 커밋하지 말고, 커밋·push·PR·배포는 요청 전 하지 마."**

## 마지막 상태 — 최신 / 2026-11-24 네이버 탭 새로고침 재현·최종 검증

- 최상단 요약과 [PR #11](https://github.com/StartPress26/webmaster-automation/pull/11)을 기준으로 이어간다. 확장 Reload 후 기존 네이버 탭을 새로고침하면 콘텐츠 스크립트가 연결되고, 비활성 상태에서도 수집 화면에 진입한다. 실제 URL 제출·접수는 아직 확인하지 않았다.
