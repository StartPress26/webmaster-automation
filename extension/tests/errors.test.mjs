import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/api.ts';
import { ApiError, httpError, presentError, uncertainWrite } from '../src/errors.ts';

test('서버 코드와 입력 위치는 유지하고 원문 입력·예외 문맥은 버린다', () => {
  const error = httpError(422, [{ loc: ['body','key'], msg: '키 형식 오류', input: 'secret-key', ctx: { token: 'secret-token' } }], 'save');
  assert.deepEqual(error.fields, [{ field: 'key', message: '키 형식 오류' }]);
  assert.equal(error.operation, 'save');
  assert.equal(error.kind, 'validation');
  assert.ok(!JSON.stringify(error).includes('secret'));
});

test('Google 갱신 실패는 만료 확정이나 재연결 완료로 표현하지 않는다', () => {
  const error = httpError(503, { code: 'GOOGLE_AUTH_REFRESH_FAILED', message: 'Google API 인증 갱신에 실패했습니다.' }, 'inspect');
  assert.equal(error.code, 'GOOGLE_AUTH_REFRESH_FAILED');
  const view = presentError(error, 'Google 상태를 조회하지 못했습니다');
  assert.equal(view.authHelp, true);
  assert.match(view.advice, /서버/);
  assert.ok(!view.message.includes('만료되었습니다'));
});

test('같은 409도 URL 중복과 설정 불일치의 안내를 구분한다', () => {
  const duplicate = presentError(httpError(409, { code:'DUPLICATE_PAGE', message:'이미 등록됨' }, 'submit'), '실패');
  const settings = presentError(httpError(409, { code:'INDEXNOW_SETTINGS_INCONSISTENT', message:'불일치' }, 'read'), '실패');
  assert.match(duplicate.advice, /다시 전송하지/);
  assert.match(settings.advice, /함께 저장/);
});

test('조회 연결 실패는 저장 결과 불명으로 안내하지 않는다', async () => {
  const api = createApi(async () => { throw new TypeError('원본 예외'); });
  try { await api.listClients(); assert.fail('오류가 필요함'); } catch (error) {
    assert.equal(error.code, 'NETWORK_ERROR');
    assert.equal(uncertainWrite(error), false);
    assert.ok(!presentError(error,'목록 조회 실패').advice.includes('이미 저장'));
  }
});

test('전송 연결 실패는 결과 불명이며 자동 재전송을 안내하지 않는다', async () => {
  let count=0;
  const api = createApi(async () => { count+=1; throw new TypeError('원본 예외'); });
  try { await api.addPage('id',{name:'글',url:'https://example.com/post'},true); assert.fail('오류가 필요함'); } catch (error) {
    assert.equal(error.operation,'submit');
    assert.equal(uncertainWrite(error),true);
    assert.match(presentError(error,'글 저장 결과 미확인').advice,/자동 재전송하지/);
    assert.equal(count,1);
  }
});

test('시간 초과와 일반 연결 실패를 구분한다', async () => {
  const api = createApi(async (_url,options) => new Promise((_resolve,reject) => { options.signal.addEventListener('abort',()=>reject(new Error('abort'))); }), '/api', 2);
  await assert.rejects(api.listClients(), (error)=> error.code==='REQUEST_TIMEOUT' && error.kind==='timeout');
});

test('한도 초과의 대기 시간은 서버가 알려준 경우에만 표시한다', () => {
  const known = presentError(httpError(429, {message:'한도'}, 'inspect', '30'),'조회 실패');
  const missing = presentError(httpError(429, {message:'한도'}, 'inspect'),'조회 실패');
  assert.match(known.advice,/30초/);
  assert.ok(!missing.advice.includes('초 뒤'));
  assert.equal(presentError(new ApiError(500,'서버 오류',{operation:'save'}),'실패').tone,'warning');
});
