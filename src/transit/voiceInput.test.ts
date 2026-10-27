// transit/voiceInput.test.ts — createVoiceInput 흐름 단위 테스트 (가짜 STT/TTS) / Flow tests with fake STT/TTS
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceInput } from './voiceInput.ts';
import type { SttAdapter } from './voiceConfirm.ts';
import { VOICE } from './voiceMessages.ts';

function setup(opts: { listens?: (string | null)[]; granted?: boolean; available?: boolean; canListen?: () => boolean } = {}) {
  const events: string[] = [];
  const listens = [...(opts.listens ?? [])];
  const stt: SttAdapter = {
    isAvailable: () => opts.available ?? true,
    ensurePermission: async () => { events.push('permission'); return opts.granted ?? true; },
    listen: async () => { events.push('listen'); return listens.shift() ?? null; },
    stop: () => { events.push('stop'); },
  };
  const flow = createVoiceInput({
    stt,
    announce: async (text) => { events.push(`say:${text}`); },
    waitForAnnouncement: async () => { events.push('wait'); },
    canListen: opts.canListen,
  });
  return { flow, events };
}
const parseUpper = (t: string) => (t === 'x' ? null : t.toUpperCase());

test('성공: 권한 → 안내 낭독 → 안내 종료 대기 → 청취 순서, 값 반환', async () => {
  const { flow, events } = setup({ listens: ['성수역'] });
  const r = await flow.ask({ prompt: '말씀하세요', parse: parseUpper });
  assert.deepEqual(r, { status: 'ok', value: '성수역'.toUpperCase() });
  assert.deepEqual(events, ['permission', 'say:말씀하세요', 'wait', 'listen']);
});

test('인식 실패 2번 후 성공: 재시도 안내를 읽고 다시 듣는다', async () => {
  const { flow, events } = setup({ listens: [null, 'x', 'ok'] });
  const r = await flow.ask({ prompt: 'p', parse: parseUpper, retryPrompt: '다시' });
  assert.equal(r.status, 'ok');
  assert.equal(events.filter((e) => e === 'listen').length, 3);
  assert.equal(events.filter((e) => e === 'say:다시').length, 2);
});

test('3회 모두 실패하면 실패 안내 후 failed (직접 입력 유도)', async () => {
  const { flow, events } = setup({ listens: [null, null, null] });
  const r = await flow.ask({ prompt: 'p', parse: parseUpper, failPrompt: '직접 입력해 주세요' });
  assert.deepEqual(r, { status: 'failed' });
  assert.equal(events.filter((e) => e === 'listen').length, 3);
  assert.equal(events[events.length - 1], 'say:직접 입력해 주세요');
});

test('권한 거부: 안내 음성 후 denied, 청취하지 않는다', async () => {
  const { flow, events } = setup({ granted: false });
  const r = await flow.ask({ prompt: 'p', parse: parseUpper });
  assert.deepEqual(r, { status: 'denied' });
  assert.deepEqual(events, ['permission', `say:${VOICE.denied}`]);
});

test('음성 인식 불가(Expo Go): unavailable, 아무것도 읽거나 듣지 않는다', async () => {
  const { flow, events } = setup({ available: false });
  assert.deepEqual(await flow.ask({ prompt: 'p', parse: parseUpper }), { status: 'unavailable' });
  assert.deepEqual(events, []);
});

test('긴급 안내 중이면 blocked: 안내도 청취도 하지 않는다', async () => {
  const { flow, events } = setup({ canListen: () => false, listens: ['a'] });
  assert.deepEqual(await flow.ask({ prompt: 'p', parse: parseUpper }), { status: 'blocked' });
  assert.deepEqual(events, []);
});

test('청취 직전에 긴급 안내가 시작되면 청취하지 않고 blocked', async () => {
  let urgent = false;
  const events: string[] = [];
  const stt: SttAdapter = { ensurePermission: async () => true, listen: async () => { events.push('listen'); return 'a'; }, stop: () => {} };
  const flow = createVoiceInput({
    stt,
    announce: async () => { urgent = true; },   // 안내 낭독 중 긴급 안내가 끼어든 상황
    waitForAnnouncement: async () => {},
    canListen: () => !urgent,
  });
  assert.deepEqual(await flow.ask({ prompt: 'p', parse: parseUpper }), { status: 'blocked' });
  assert.deepEqual(events, []);
});

test('청취 중 cancel: cancelled, 이후 결과는 무시되고 stt.stop 호출', async () => {
  const events: string[] = [];
  let resolveListen: (v: string | null) => void = () => {};
  const stt: SttAdapter = {
    ensurePermission: async () => true,
    listen: () => new Promise((r) => { resolveListen = r; }),
    stop: () => { events.push('stop'); },
  };
  const flow = createVoiceInput({ stt, announce: async () => {}, waitForAnnouncement: async () => {} });
  const p = flow.ask({ prompt: 'p', parse: parseUpper });
  await new Promise((r) => setTimeout(r, 5));
  flow.cancel();
  resolveListen('late');
  assert.deepEqual(await p, { status: 'cancelled' });
  assert.deepEqual(events, ['stop']);
});

test('새 ask가 시작되면 이전 ask는 cancelled', async () => {
  const { flow } = setup({ listens: ['a', 'b'] });
  const first = flow.ask({ prompt: '1', parse: parseUpper });
  const second = flow.ask({ prompt: '2', parse: parseUpper });
  assert.equal((await first).status, 'cancelled');
  assert.equal((await second).status, 'ok');
});
