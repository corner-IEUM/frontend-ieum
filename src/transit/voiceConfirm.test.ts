// transit/voiceConfirm.test.ts — 음성 청취 흐름 테스트 (STT/TTS 모킹, 타이머는 mock timers) / Voice flow tests with mocked STT/TTS
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createVoiceConfirm, LISTEN_TIMEOUT_MS, type SttAdapter } from './voiceConfirm.ts';
import { GUIDANCE } from './guidanceMessages.ts';

const flush = () => new Promise<void>((r) => setImmediate(r)); // 마이크로태스크 비우기 (setImmediate는 mock 대상 아님) / drain microtasks

function setup(opts: { permission?: boolean } = {}) {
  mock.timers.enable({ apis: ['setTimeout'] });
  const listenResolvers: Array<(v: string | null) => void> = [];
  const calls = { listen: 0, stop: 0, permission: 0, confirm: [] as string[], spoken: [] as string[] };
  let releaseAnnouncement!: () => void;
  const announcement = new Promise<void>((r) => { releaseAnnouncement = r; });
  const stt: SttAdapter = {
    ensurePermission: async () => { calls.permission++; return opts.permission ?? true; },
    listen: () => { calls.listen++; return new Promise((r) => listenResolvers.push(r)); },
    stop: () => { calls.stop++; },
  };
  const flow = createVoiceConfirm({
    stt,
    waitForAnnouncement: () => announcement,
    speak: async (t) => { calls.spoken.push(t); },
    onConfirm: (k) => { calls.confirm.push(k); },
  });
  return { flow, calls, listenResolvers, releaseAnnouncement };
}
afterEach(() => mock.timers.reset());

test('안내 TTS가 끝난 뒤에 청취를 시작한다', async () => {
  const { flow, calls, releaseAnnouncement } = setup();
  flow.start('BOARD');
  await flush();
  assert.equal(calls.listen, 0, 'TTS 종료 전에는 청취하지 않음');
  releaseAnnouncement();
  await flush();
  assert.equal(calls.listen, 1);
});

test('CONFIRM이면 onConfirm 1회 호출하고 종료', async () => {
  const { flow, calls, listenResolvers, releaseAnnouncement } = setup();
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  listenResolvers[0]('탑승했어요'); await flush();
  assert.deepEqual(calls.confirm, ['BOARD']);
  assert.equal(calls.listen, 1);
  assert.deepEqual(calls.spoken, []);
});

test('8초 무응답이면 청취를 멈추고 총 3회까지 재청취, 그래도 없으면 버튼 안내 후 종료', async () => {
  const { flow, calls, releaseAnnouncement } = setup();
  flow.start('ALIGHT'); releaseAnnouncement(); await flush();
  assert.equal(calls.listen, 1);
  mock.timers.tick(LISTEN_TIMEOUT_MS - 1); await flush();
  assert.equal(calls.listen, 1, '8초 전에는 재청취 없음');
  mock.timers.tick(1); await flush();
  assert.equal(calls.stop, 1, '타임아웃 시 청취 중단');
  assert.equal(calls.listen, 2, '1회 재청취');
  mock.timers.tick(LISTEN_TIMEOUT_MS); await flush();
  assert.equal(calls.listen, 3, '2회 재청취');
  mock.timers.tick(LISTEN_TIMEOUT_MS); await flush();
  assert.equal(calls.listen, 3, '더 이상 재청취하지 않음');
  assert.deepEqual(calls.spoken, [GUIDANCE.voiceFallback]);
  assert.deepEqual(calls.confirm, []);
});

test('인식 불명(UNKNOWN)이면 총 3회까지 재청취 후 버튼 안내', async () => {
  const { flow, calls, listenResolvers, releaseAnnouncement } = setup();
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  listenResolvers[0]('음...'); await flush();
  assert.equal(calls.listen, 2);
  listenResolvers[1](null); await flush();   // 인식 실패 / recognition failure
  assert.equal(calls.listen, 3);
  assert.deepEqual(calls.spoken, []);
  listenResolvers[2]('글쎄'); await flush();
  assert.deepEqual(calls.spoken, [GUIDANCE.voiceFallback]);
  assert.equal(calls.listen, 3);
});

test('DENY면 안내 TTS 후 재청취 없이 대기', async () => {
  const { flow, calls, listenResolvers, releaseAnnouncement } = setup();
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  listenResolvers[0]('아직이요'); await flush();
  assert.deepEqual(calls.spoken, [GUIDANCE.voiceDenied]);
  assert.equal(calls.listen, 1);
  assert.deepEqual(calls.confirm, []);
});

test('상태 이탈/화면 이탈/버튼 선행(= cancel) 시 청취 즉시 중단, 이후 결과는 무시', async () => {
  const { flow, calls, listenResolvers, releaseAnnouncement } = setup();
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  flow.cancel();
  assert.equal(calls.stop, 1);
  listenResolvers[0]('탑승했어요'); await flush();
  assert.deepEqual(calls.confirm, [], '취소 뒤 늦게 온 인식 결과는 무시');
  mock.timers.tick(LISTEN_TIMEOUT_MS * 2); await flush();
  assert.equal(calls.listen, 1, '재청취 없음');
  assert.deepEqual(calls.spoken, []);
});

test('안내 TTS 대기 중에 취소되면 청취를 시작하지 않는다', async () => {
  const { flow, calls, releaseAnnouncement } = setup();
  flow.start('ALIGHT'); await flush();
  flow.cancel();
  releaseAnnouncement(); await flush();
  assert.equal(calls.listen, 0);
  assert.equal(calls.permission, 0);
});

test('새 상태로 start하면 이전 청취는 중단된다', async () => {
  const { flow, calls, listenResolvers, releaseAnnouncement } = setup();
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  flow.start('ALIGHT'); await flush();
  assert.equal(calls.stop, 1);
  listenResolvers[0]('탑승했어요'); await flush();
  assert.deepEqual(calls.confirm, [], '이전 청취 결과 무시');
});

test('마이크 권한 거부: 음성만 끄고(조용히) 이후에도 다시 묻지 않는다', async () => {
  const { flow, calls, releaseAnnouncement } = setup({ permission: false });
  flow.start('BOARD'); releaseAnnouncement(); await flush();
  assert.equal(calls.permission, 1);
  assert.equal(calls.listen, 0);
  flow.start('ALIGHT'); await flush();
  assert.equal(calls.permission, 1, '재요청 없음');
  assert.deepEqual(calls.spoken, []);
});
