# Discord 인증봇 — 연결·입력창 확인

현재 단계는 Discord Gateway 연결 → 지정 채널에 테스트 메시지 한 건 전송 → 연결 종료다.
실행이 끝나면 봇이 오프라인으로 보일 수 있다.
2단계에서는 버튼·입력창으로 가짜 코드 수신을 확인한다.
3단계에서는 요청별 Future를 통해 대기 중인 가짜 로그인 작업에 코드를 전달한다.
공통 Playwright 로그인 루프에도 문자 인증 분기를 연결했다. 로컬 화면 검증은 수행하며,
실제 Google 로그인 화면·문자 발송·실제 코드 제출의 전체 흐름은 아직 검증하지 않았다.

## 설정

프로젝트 루트 `.env`에 아래 값을 저장한다. 프로세스 환경변수가 파일보다 우선한다.

```dotenv
DISCORD_BOT_TOKEN=
DISCORD_CHANNEL_ID=
DISCORD_ALLOWED_USER_ID=
```

- 토큰: Developer Portal의 Bot 메뉴에서 발급한다. 채팅·로그·Git에 올리지 않는다.
- 채널 ID: 봇에게 채널 보기·메시지 보내기 권한이 있는 서버 텍스트 채널이다.
- 사용자 ID: 버튼 클릭과 입력창 제출 모두 이 사용자만 허용한다.
- Message Content Intent·멤버 조회 권한·공개 HTTP 서버·Public Key는 필요 없다.

## 실행

의존성은 `pyproject.toml`과 `uv.lock`에 기록하며 설치 방법은 [환경 문서](environment.md)를 따른다.
현재 제품의 `authenticated_page()`는 `channel="chrome"`으로 설치된 Google Chrome을 실행한다.
개인 기본 프로필을 재사용하지 않으며, 새 실행 환경에는 Google Chrome이 필요하다.
일부 로컬 테스트는 번들 Chromium을 직접 실행하므로 테스트 환경에는 Chromium도 설치해야 한다.

```bash
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth
```

이 명령은 실제 Discord에 연결하고 설정한 채널에 메시지 한 건을 보낸다.
성공하면 `Discord Gateway 연결·테스트 메시지 전송 완료. 연결을 종료했습니다.`가 출력된다.
실패하면 토큰·채널 ID·권한·네트워크를 확인한다. 자동 재전송은 하지 않는다.

## 버튼·입력창 테스트

```bash
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth --interactive
```

실제 Discord 채널에 테스트 메시지와 `[인증 코드 입력]` 버튼을 보낸다.
설정된 사용자가 버튼을 누르면 입력창이 열린다. 가짜 6자리 숫자 `123456`으로 확인한다.
실제 문자 발송이나 로그인은 실행하지 않으며, 전화번호를 임의로 표시하지 않는다.

- `AuthCodeView`: 버튼 표시와 사용자·채널·만료·중복 검사.
- `AuthCodeModal`: 입력창 표시와 6자리 숫자 검증. 코드 원문을 출력·파일 저장·AI 전송하지 않는다.
- 제출 성공은 본인에게만 보이는 응답으로 안내한다. 코드는 해당 요청의 Future로 전달하며 공개 응답에는 넣지 않는다.
- 최초 유효 제출 또는 3분 만료 시 테스트를 종료하고 메시지의 버튼을 제거한다.
- 입력창을 열어둔 상태에서도 만료된 요청과 중복 제출은 거부한다.
- 프로그램이 종료되면 새 입력을 받을 수 없다. 다시 테스트하려면 명령을 다시 실행한다.

`check_discord_input()`은 제출 여부를 `bool`로 반환한다. 내부의 `request_discord_code()`는
`AuthCode` 객체를 반환하며 만료 시 `None`을 반환한다. 코드는 Discord를 통해 전달되므로
이 실행기에는 가짜 코드만 입력한다.

## 가짜 로그인 대기·재개 테스트

```bash
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m app.login_bot.discord_auth --handoff
```

실행하면 가짜 로그인 작업이 대기하고 Discord에 요청 ID가 붙은 버튼이 표시된다.
`123456` 같은 가짜 코드를 제출하면 다음 안내가 출력된다. 코드 원문은 출력하지 않는다.

```text
가짜 로그인 작업: 인증 코드 도착을 기다립니다.
가짜 로그인 작업: 코드를 전달받아 다음 단계로 재개했습니다.
```

`app/login_bot/human_auth.py`의 역할:

1. `create_auth_code_request()`: 고유 요청 ID, 절대 만료 시각, `Future` 생성.
2. `AuthCodeRequest.wait()`: 하나의 로그인 작업이 코드가 도착할 때까지 대기.
3. `AuthCodeRequest.submit(request_id, code)`: 해당 요청의 최초 유효 코드만 `Future.set_result()`로 전달.
4. `AuthCodeRequest.cancel()`: 대기를 취소하고 이후 제출 거부.

Discord 입력창은 생성될 때 연결된 요청 객체에만 제출한다. 버튼 식별자에도 요청 ID를 넣으며,
사용자·채널 검증은 Discord 쪽에서 수행한다. 연결부 자체는 Discord에 의존하지 않는다.
만료·취소·전송 실패 때 요청과 UI를 정리하고, UI 응답을 마친 뒤 연결을 닫는다.
전역 요청 저장소는 없으며 한 프로세스의 같은 이벤트 루프에서 사용한다. 재시작 후 복원은 지원하지 않는다.

`AuthCode`는 출력에서 값을 숨기는 불변 객체다. 실제 전달은 메모리 안에서만 이루어지며,
호출자가 사용할 때만 `.value`로 원문을 읽는다. 관련 객체 참조가 남아 있는 동안 메모리에는 값이
있을 수 있으며 암호화나 즉시 메모리 삭제를 보장하는 구조는 아니다. 파일·로그·AI에는 보내지 않는다.

가짜 로그인은 전달된 코드 형식만 확인한다. 실제 OTP 정답 확인·문자 발송·브라우저 입력은 하지 않는다.

## Google 문자 인증 화면 감지

`GoogleLoginSite.detect_sms_challenge(page)`는 읽기 전용으로 현재 화면을 확인한다.
Google 로그인 호스트의 인증 경로에서 다음 조건이 모두 맞으면 `GoogleSmsChallenge`를 반환하고,
판정이 불가능하면 `None`을 반환한다.

- 화면에 한국어·영어 문자 발송 완료 안내가 표시됨.
- 표시되고 편집 가능한 OTP 입력칸이 하나 있음.
- 같은 주 영역에 사용 가능한 `다음`·`확인`·`Next`·`Verify`·`Confirm` 버튼이 하나 있음.
- 자동화 차단 안내가 없고 관찰 중 주소가 바뀌지 않음.

반환값에는 `masked_phone`, `code_input`, `submit_button`이 있다.
번호는 발송 안내에 표시된 마스킹 번호 하나만 반환한다. 번호가 없거나 모호하거나 전체 번호만
표시되어 있으면 `None`이다. 화면 안내 확인은 실제 휴대전화 수신을 보장하지 않는다.
입력값을 읽거나 입력·버튼 클릭·문자 재발송을 하지 않는다.

이 기능은 실제 Google DOM을 채집한 결과가 아니라 로컬 예제 화면으로 구현·검증한 상태다.
Google 실제 화면의 선택자·문구는 후속 실로그인에서 확인해야 한다. 화면이 변할 수 있으므로
코드 입력 직전에 다시 감지한다. 대기 중 번호·URL·입력칸·버튼이 바뀌면 이전 코드를 사용하지 않는다.

## 로그인 루프에서 사용

`authenticated_page()`에 `sms_provider`를 주입하면 문자 인증 화면을 감지했을 때 사용한다.
기존 모델·사이트·세션 저장소를 구성하는 호출부에 다음처럼 추가한다.

```python
from app.login_bot.discord_auth import DiscordSmsCodeProvider, load_discord_settings
from app.login_bot.login_agent import authenticated_page

async with authenticated_page(
    site, session_key, model=model, store=store,
    sms_provider=DiscordSmsCodeProvider(load_discord_settings()),
) as page:
    # 최종 사이트에서 로그인 성공이 확인된 같은 탭입니다.
    ...
```

위 예시는 기존 호출부에 주입하는 방식이며 단독 실행 명령이 아니다.
제공자를 주입하지 않으면 문자 인증에서 `requires_user`로 종료하고 브라우저가 정리된다.
Discord 인증 제공자는 실제 요청에서 서비스명과 화면의 마스킹 번호를 표시한다.
번호가 없으면 번호를 추측하지 않는다. 코드가 접수됐다는 응답은 로그인 성공 안내가 아니다.

진행 흐름:

1. AI가 로그인 및 제공되는 문자 인증 선택·발송 요청을 진행한다.
2. `_run_login()`이 AI 관찰 전에 문자 인증 입력 화면을 감지한다.
3. `_complete_sms_login()`이 `SmsCodeProvider.request_code()`로 사용자 입력을 기다린다.
4. 같은 화면·같은 요소인지 다시 확인하고 POST 방식·허용된 전송 목적지를 검사한다.
5. Playwright가 코드 입력·확인을 한 번 수행한다.
6. AI를 재호출하지 않고 최종 인증 또는 코드 오류를 확인한다. 성공일 때만 기존 경로로 세션을 저장한다.

`LoginPolicy.timeout_seconds`는 자동 조작 예산이고, `human_timeout_seconds`는 사용자 대기 예산이다.
사용자 대기 중에는 남은 자동 조작 시간을 보존한다. 기본값은 각각 180초이며, 요청은 한 번만 한다.
코드 제출 후 결과 대기는 최대 30초이며 남아 있는 자동 조작 예산의 제한도 받는다.
취소·오답·만료·추가 인증·판정 불가 시 재발송·자동 재시도하지 않고 종료한다.
네트워크·브라우저 연결 정리에는 별도의 제한된 시간이 추가로 필요할 수 있다.

문자 인증 분기에 들어간 뒤에는 오류가 나더라도 AI 관찰 루프로 복귀하지 않으므로 입력된 코드가
후속 AI 요청·스크린샷에 포함되지 않는다. 새 탭·세션으로 옮겨 입력하지 않는다.
캡차·패스키·휴대폰 승인·자동화 차단을 문자 코드 요청으로 취급하지 않는다.

실제 실행 전 봇 실행 기록 규칙을 적용해야 한다. 이번 연결 검증은 외부 요청을 모두 가로챈
로컬 HTML과 가짜 코드 제공자를 사용하며, Google/Discord/AI로 실인증 요청을 보내지 않는다.

```bash
PYTHONNOUSERSITE=1 /opt/miniconda3/envs/startpress/bin/python -m pytest tests/test_human_auth.py tests/test_discord_auth.py -q
```

## 코드 읽는 순서

1. `load_discord_settings()`: `.env`에서 불변 설정 객체를 만든다. 토큰은 객체 출력에서 숨긴다.
2. `client.login()`: 토큰으로 Discord API 인증을 한다.
3. `client.connect()`: Gateway 연결을 유지한다. `TaskGroup`으로 준비 대기와 함께 실행한다.
4. `client.wait_until_ready()`: 연결이 준비될 때까지 기다린다.
5. `channel.send()`: 지정 채널에 테스트 메시지를 한 번 보낸다.
6. `client.close()`: 연결을 닫는다. 오류·대기 만료·취소 때도 정리한다.

준비·전송에는 각각 30초 제한을 적용한다. 입력창 모드는 준비 후 최대 3분 연결을 유지한다.
실제 로그인 요청은 사이트의 사용자 대기 제한을 따르며 테스트 모드와 문구를 구분한다.

공식 참고: [discord.py Client API](https://discordpy.readthedocs.io/en/stable/api.html#discord.Client).
