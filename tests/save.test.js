// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer } from '../core/career/career.js';
import { runCareerHeadless, makeCareerPolicy } from '../core/career/driver.js';
import { POLICY_GREEDY } from '../core/sim/driver.js';
import { makeSave, verifySave, exportSaveString, importSaveString, replaySave } from '../core/save/save.js';

/** @returns {import('../core/save/save.js').SaveFile} */
function aSave(seed = 4321) {
  const st0 = newCareer(seed, '測試教頭');
  const run = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  return makeSave({ seedCode: st0.seedCode, coachName: '測試教頭', decisions: run.decisions });
}

test('checksum 認得自己、也認得被改過的內容', () => {
  const save = aSave();
  assert.equal(verifySave(save), true);
  assert.equal(verifySave({ ...save, coachName: '別人' }), false);
  assert.equal(verifySave({ ...save, checksum: 'zzz' }), false);
});

test('匯出／匯入往返', async () => {
  const save = aSave();
  const str = await exportSaveString(save);
  assert.match(str, /^[GR]/, '首字元要標示編碼方式');
  assert.deepEqual(await importSaveString(str), save);
});

test('存檔字串短到可以貼進聊天室', async () => {
  const str = await exportSaveString(aSave());
  assert.ok(str.length < 2500, `字串 ${str.length} 字元，太長了`);
});

test('沒有 CompressionStream 時降級成未壓縮，而不是靜默失敗', async () => {
  const orig = globalThis.CompressionStream;
  // @ts-ignore 刻意移除
  delete globalThis.CompressionStream;
  try {
    const save = aSave();
    const str = await exportSaveString(save);
    assert.match(str, /^R/, '應該降級成未壓縮格式');
    assert.deepEqual(await importSaveString(str), save);
  } finally {
    globalThis.CompressionStream = orig;
  }
});

test('無法辨識的存檔字串會明確報錯', async () => {
  await assert.rejects(() => importSaveString('X???'), /無法辨識/);
});

test('重播出的生涯與原始完全一致', () => {
  const st0 = newCareer(4321, '測試教頭');
  const run = runCareerHeadless(st0, makeCareerPolicy(POLICY_GREEDY));
  const replayed = replaySave(aSave(4321));
  assert.equal(replayed.state.ending?.id, run.state.ending?.id);
  assert.deepEqual(replayed.state.coach.meters, run.state.coach.meters);
});
