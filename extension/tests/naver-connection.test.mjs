import { test } from 'node:test';
import assert from 'node:assert/strict';
import { command } from '../src/engines/naver/automation.ts';

test('제출 전 Chrome 메시지 연결 실패는 고정된 스크립트 안내로 표시한다', async () => {
  for (const action of ['state', 'open_board', 'select_collection_site', 'open_collection']) {
    const client = { send: async () => { throw new Error('Receiving end does not exist: private diagnostic'); } };
    await assert.rejects(command(client, 7, { action }, new AbortController().signal), (error) => {
      assert.equal(error.code, 'script_unavailable');
      assert.match(error.message, /네이버 탭도 새로고침/);
      assert.doesNotMatch(error.message, /private diagnostic/);
      return true;
    });
  }
});

test('수집 제출 명령의 연결 실패는 접수 미확인으로 보존하고 다시 보내지 않는다', async () => {
  let calls = 0;
  const client = { send: async () => { calls += 1; throw new Error('Message port closed'); } };
  await assert.rejects(command(client, 7, { action: 'request_collection' }, new AbortController().signal), (error) => error.code === 'receipt_unconfirmed');
  assert.equal(calls, 1);
});
