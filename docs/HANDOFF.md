# 작업 인계 문서

## 현재 인계 요약 — 2026-11-10 Chrome 웹 스토어 심사 제출 / Asia/Seoul

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
- **사용자는 Google 토큰의 Lightsail 전송을 완료했다고 확인했다.** 안내한 전용 위치는 `/home/ubuntu/webmaster-secrets/google-token.json`이다. 에이전트가 원격 파일·소유권·Bing 설정·컨테이너 상태를 직접 검증한 것은 아니다.
- 로컬 `compose.prod.yaml`은 API에 기존 `DATABASE_URL`과 `GOOGLE_TOKEN_FILE`, `BING_API_KEY`를 전달한다. 두 인증 설정이 비어 있으면 기동 전에 실패하도록 했다. `.env.prod.example`의 두 입력란은 비어 있으며 실제 값과 토큰 경로는 서버 `.env.prod`에 채운다. 작업 중 예시 파일이 간결한 형태로 바뀐 것을 확인해 그 형식을 보존했다.
- API의 bind mount는 서버 `/home/ubuntu/webmaster-secrets` → 컨테이너 `/srv/startpress/.secrets`다. `create_host_path: false`이므로 서버 폴더가 없으면 실패한다. Google 토큰의 원자적 교체를 위해 폴더 전체에 쓰기 권한이 필요하며 폴더·파일 소유자는 `10001:10001`, 권한은 각각 `700`·`600`이어야 한다. 다른 비밀파일·브라우저 실행 기록은 이 전용 폴더에 함께 넣지 않는다.
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
- 인스턴스 이름은 `startpress-webmaster-prod`, Ubuntu 24.04.4 LTS, 2GB RAM·2 vCPU·60GB SSD이며 **시드니 `ap-southeast-2`**에 생성됐다. 사용자가 마지막으로 전달한 공인 IPv4는 `13.239.37.152`다. 고정 IP 설정은 확인되지 않았으므로 재시작 후 주소를 확인한다.
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
# Mac 터미널에서 실행하고 서버의 현재 공인 IP를 확인합니다.
chmod 600 ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem
ssh -i ~/Downloads/LightsailDefaultKey-ap-southeast-2.pem \
  -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:18001:127.0.0.1:18000 \
  ubuntu@13.239.37.152
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


## 마지막 상태 — 최신 / 2026-11-10 스토어 심사 제출 사용자 확인

- 사용자가 스토어 심사 제출 완료를 알렸다. 승인·게시 완료 여부, 최종 Private 설정과 허용 사용자 목록은 직접 확인하지 않았다.
- `chore/private-extension-release`에서 아이콘 `0e7d2e8`·SSH 안내 `2820ceb`를 완료했다. 사용자의 후속 요청으로 인계 문서·스토어 스크린샷을 정리해 커밋·push·main 대상 PR 생성까지 진행한다. 최종 HEAD·PR 상태는 `git log -1`, `git status`, `gh pr view`로 확인한다. main 직접 push·PR 병합은 하지 않는다.
- 최신 ZIP은 0.1.0·11파일·66,421바이트이며 원본 로고 제외·압축 무결성·SSH 안내 포함을 재확인했다. ZIP은 로컬 미추적 배포 산출물로 남기며 커밋하지 않는다.
- Notion 개인정보처리방침 작성과 사용자 확정 사항 반영을 완료했다. 공개 설정·익명 접근은 미확인이다. 공개 페이지에는 확인용 메모나 미정 표시를 넣지 않는다. 질문은 채팅에서만 한다.
- 다음은 심사 결과 확인→필요한 보완→비공개 게시·팀원 설치 및 SSH 사용 검증이다. 운영 서버·GUI 전체 흐름의 실제 검증은 과거 기록과 구분한다.

새 세션 시작 문구: **“docs/HANDOFF.md의 최상단과 맨 아래 2026-11-10 최신 상태를 읽고 이어서 진행해줘. 사용자가 Chrome 웹 스토어 심사 제출을 완료했다고 확인했어. chore/private-extension-release에서 아이콘·SSH 안내와 인계 문서·스토어 스크린샷을 정리했고 커밋·push·PR 생성도 요청했으니 최종 Git/PR 상태부터 확인해줘. ZIP은 로컬 산출물로 보존하고 개인정보처리방침은 지정 Notion 페이지에 작성돼 있어. 공개 페이지에는 검토 메모·미정 표시를 넣지 말고 채팅에서 먼저 확인해줘. 심사 승인·게시·운영 서버 실검증은 완료된 것으로 단정하지 마.”**
