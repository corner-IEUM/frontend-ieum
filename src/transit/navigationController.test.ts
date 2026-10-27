// transit/navigationController.test.ts — 컨트롤러 핵심 로직 테스트 (로컬 전이 + PATCH 직렬 큐, API 모킹) / Controller tests: local transitions + serial PATCH queue
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTransitController, type LegStatePatch } from './navigationController.ts';
import { AuthExpiredError, ApiStatusError, classifyApiError } from '../apiErrors.ts';
import { withBus } from './testFixtures.ts';
import { createLocalSession } from './localSession.ts';
import { parseItinerary } from './itineraryParser.ts';
import { LIVE_ITINERARY } from './liveFixture.ts';
import { deriveUiState, INITIAL_FLAGS } from './uiState.ts';
import type { TransitSession } from './types.ts';

type Patch = (id: number | string, body: LegStatePatch) => Promise<void>;

function setup(patch: Patch = async () => {}, snapshot: TransitSession | null = null, complete: (id: number | string) => Promise<void> = async () => {}) {
  const log = {
    patched: [] as Array<[number | string, number, string]>, announced: [] as string[], saved: [] as TransitSession[],
    logs: [] as string[], authExpired: 0, cleared: 0,
    completed: [] as Array<number | string>, order: [] as string[],
  };
  const ctrl = createTransitController({
    patchLegState: async (id, body) => { log.patched.push([id, body.currentLegIndex, body.currentLegState]); log.order.push(`patch:${body.currentLegIndex}:${body.currentLegState}`); return patch(id, body); },
    completeRoute: async (id) => { log.completed.push(id); log.order.push('complete'); return complete(id); },
    classifyError: classifyApiError,
    announce: (ui) => { log.announced.push(ui); },
    saveSessionId: () => {}, clearSessionId: () => { log.cleared++; },
    saveSnapshot: (s) => { log.saved.push(s); },
    loadSnapshot: async () => snapshot,
    onAuthExpired: () => { log.authExpired++; },
    log: (m) => { log.logs.push(m); },
  });
  return { ctrl, log };
}
// 서버가 이미 아는 상태로 시작해 시작 PATCH 없이 시나리오만 본다 / Start with the server already in sync so only the scenario's PATCHes show up
type Ctrl = ReturnType<typeof setup>['ctrl'];
function begin(ctrl: Ctrl, s: TransitSession) {
  const ui = deriveUiState(s, INITIAL_FLAGS)!;
  ctrl.startSession(s, { currentLegIndex: s.currentLegIndex, currentLegState: ui as LegStatePatch['currentLegState'] });
}
const deferred = <T>() => { let resolve!: (v: T) => void; let reject!: (e: unknown) => void; const promise = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const liveSession = () => createLocalSession(42, parseItinerary(LIVE_ITINERARY)!.legs);

test('WAITING_AT_STOP에서 confirmBoarding → 로컬로 즉시 ON_BUS, PATCH(legIndex, ON_BUS) 1회', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  assert.equal(ctrl.getState().uiState, 'WAITING_AT_STOP');
  ctrl.confirmBoarding();
  assert.equal(ctrl.getState().uiState, 'ON_BUS', 'PATCH를 기다리지 않고 바로 전이');
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'ON_BUS']]);
});

test('BOARDING_CONFIRM 진입(수동 "버스 왔어요" 경로)도 서버에 알리고, 탑승 확인으로 ON_BUS', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();
  assert.equal(ctrl.getState().uiState, 'BOARDING_CONFIRM');
  ctrl.confirmBoarding();
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
  assert.deepEqual(ctrl.getState().flags, { boardingPrompt: false, alightingPrompt: false }); // 상태 변경 → 플래그 초기화
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'BOARDING_CONFIRM'], [7, 1, 'ON_BUS']]);
});

test('"곧 내려요"(notifyNearAlightStop) → ALIGHTING_CONFIRM PATCH, 하차 확인 → 다음 leg(WALK_TO_DEST) PATCH', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('RIDING'));
  ctrl.notifyNearAlightStop();
  assert.equal(ctrl.getState().uiState, 'ALIGHTING_CONFIRM');
  ctrl.confirmAlighting();
  assert.equal(ctrl.getState().uiState, 'WALK_TO_DEST');
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'ALIGHTING_CONFIRM'], [7, 2, 'WALK_TO_DEST']]);
});

test('허용되지 않은 상태에서의 확인은 전이도 PATCH도 없다', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('RIDING'));          // ON_BUS: 탑승 확인 불가
  ctrl.confirmBoarding();
  ctrl.confirmAlighting();                 // ON_BUS: 아직 하차 프롬프트 전
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmAlighting();
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, []);
  assert.equal(ctrl.getState().uiState, 'WAITING_AT_STOP');
});

test('같은 확인을 연속 호출해도 전이·PATCH는 1번 (멱등)', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmBoarding();
  ctrl.confirmBoarding();
  ctrl.confirmAlighting();
  await ctrl.whenSynced();
  assert.equal(log.patched.length, 1);
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
});

test('상태 전환 안내는 같은 (leg, 상태)에서 한 번만', () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();
  ctrl.notifyBusArriving();                      // 이미 BOARDING_CONFIRM → 무시 / ignored
  ctrl.confirmBoarding();
  assert.deepEqual(log.announced, ['WAITING_AT_STOP', 'BOARDING_CONFIRM', 'ON_BUS']);
});

// ───────── PATCH 실패/지연/순서 ─────────
test('PATCH가 실패해도 로컬 전이는 계속되고 로그만 남는다 (이후 전이의 PATCH도 계속 나간다)', async () => {
  const { ctrl, log } = setup(async () => { throw new TypeError('Network request failed'); });
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();
  ctrl.confirmBoarding();
  ctrl.notifyNearAlightStop();
  ctrl.confirmAlighting();
  await ctrl.whenSynced();
  assert.equal(ctrl.getState().uiState, 'WALK_TO_DEST', '서버가 계속 실패해도 화면 진행은 막히지 않음');
  assert.equal(log.patched.length, 4, '실패한 요청 뒤에도 다음 PATCH를 계속 시도');
  assert.equal(log.logs.length, 4);
  assert.equal(log.authExpired, 0);
});

test('PATCH가 느려도(응답 지연) 로컬 전이는 먼저 끝나고, 다음 PATCH는 앞 요청이 끝난 뒤에야 나간다', async () => {
  const first = deferred<void>();
  let n = 0;
  const { ctrl, log } = setup(() => (n++ === 0 ? first.promise : Promise.resolve()));
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();                       // PATCH #1 (BOARDING_CONFIRM) — 응답 대기 중
  ctrl.confirmBoarding();                         // 로컬은 즉시 ON_BUS, PATCH #2는 큐에서 대기
  await Promise.resolve();
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
  assert.deepEqual(log.patched, [[7, 1, 'BOARDING_CONFIRM']], '앞 요청이 끝나기 전에는 다음 요청을 보내지 않음');
  first.resolve();
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'BOARDING_CONFIRM'], [7, 1, 'ON_BUS']]);
});

test('앞 요청이 실패해도 뒤 요청은 순서대로 나가 마지막 상태가 서버에 남는다', async () => {
  let n = 0;
  const { ctrl, log } = setup(async () => { if (n++ === 0) throw new ApiStatusError(503, 'x'); });
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();
  ctrl.confirmBoarding();
  await ctrl.whenSynced();
  assert.deepEqual(log.patched.map((p) => p[2]), ['BOARDING_CONFIRM', 'ON_BUS']);
  assert.equal(log.logs.length, 1);
});

test('인증 만료는 onAuthExpired를 부르되 로컬 전이는 막지 않는다', async () => {
  const { ctrl, log } = setup(async () => { throw new AuthExpiredError(); });
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmBoarding();
  await ctrl.whenSynced();
  assert.equal(log.authExpired, 1);
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
});

test('전이 N번 → PATCH가 순서대로 N번: 실서버 fixture 전체 흐름 (0m 환승 도보는 건너뛴 이후 실제 인덱스를 보냄)', async () => {
  const { ctrl, log } = setup();
  ctrl.startSession(liveSession());               // 서버는 (0, WALK_TO_STOP)을 이미 앎 → 시작 PATCH 없음
  ctrl.completeWalk();                            // 정류장 도착
  ctrl.notifyBusArriving();
  ctrl.confirmBoarding();
  ctrl.notifyNearAlightStop();
  ctrl.confirmAlighting();                        // 버스1 하차 → 0m 도보(2) 건너뜀 → 버스2 대기(3)
  ctrl.confirmBoarding();                         // 지하철/버스2 수동 탑승 확인 (BOARDING_CONFIRM 없이)
  ctrl.notifyNearAlightStop();
  ctrl.confirmAlighting();                        // → 마지막 도보(4)
  ctrl.completeWalk();                            // 도착 (ARRIVED는 서버 상태값이 아니라 PATCH 없음)
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [
    [42, 1, 'WAITING_AT_STOP'],
    [42, 1, 'BOARDING_CONFIRM'],
    [42, 1, 'ON_BUS'],
    [42, 1, 'ALIGHTING_CONFIRM'],
    [42, 3, 'WAITING_AT_STOP'],
    [42, 3, 'ON_BUS'],
    [42, 3, 'ALIGHTING_CONFIRM'],
    [42, 4, 'WALK_TO_DEST'],
  ]);
  assert.equal(ctrl.getState().uiState, 'ARRIVED');
  assert.equal(log.cleared, 1, '도착하면 저장된 세션 id를 지운다');
});

test('시작 leg가 0m 도보라 건너뛴 경우: 세션 시작 직후 PATCH 1회로 서버 인덱스를 맞춘다', async () => {
  const legs = parseItinerary(LIVE_ITINERARY)!.legs;
  legs[0] = { ...legs[0], distanceM: 0, durationSec: 0 };
  const { ctrl, log } = setup();
  ctrl.startSession(createLocalSession(42, legs));
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[42, 1, 'WAITING_AT_STOP']]);
});

test('정상 시작(첫 leg 도보)은 시작 PATCH가 없다', async () => {
  const { ctrl, log } = setup();
  ctrl.startSession(liveSession());
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, []);
  assert.equal(ctrl.getState().uiState, 'WALK_TO_STOP');
});

// ───────── 복구 (서버 GET 없음: 기기 저장본만) ─────────
test('restore: 같은 id의 저장본으로 복구하고 PATCH 1회로 서버를 맞춘다', async () => {
  const snap = withBus('RIDING'); // id 7
  const { ctrl, log } = setup(async () => {}, snap);
  const restored = await ctrl.restore(7);
  assert.equal(restored?.id, 7);
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'ON_BUS']]);
});

test('restore: 다른 id/저장본 없음/종료된 세션이면 복구하지 않고 저장된 id를 지운다', async () => {
  const a = setup(async () => {}, withBus('RIDING'));
  assert.equal(await a.ctrl.restore(99), null);
  assert.equal(a.ctrl.getState().session, null);
  assert.equal(a.log.cleared, 1);
  const b = setup();
  assert.equal(await b.ctrl.restore(9), null);
  assert.equal(b.log.cleared, 1);
  const c = setup(async () => {}, { ...withBus('COMPLETED'), status: 'ARRIVED' });
  assert.equal(await c.ctrl.restore(7), null);
  assert.equal(c.log.patched.length, 0);
});

test('recover: 메모리 세션이 있고 서버와 같으면 PATCH 없이 local, 상태·플래그 유지', async () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  ctrl.notifyBusArriving();
  await ctrl.whenSynced();
  const before = log.patched.length;
  assert.deepEqual(await ctrl.recover(), { source: 'local', changed: false });
  await ctrl.whenSynced();
  assert.equal(log.patched.length, before, '이미 서버와 같으므로 재전송 없음');
  assert.equal(ctrl.getState().uiState, 'BOARDING_CONFIRM');
});

test('recover: 마지막 PATCH가 실패했었다면 복귀 시 PATCH 1회로 재동기화, 성공하면 더는 보내지 않는다', async () => {
  let fail = true;
  const { ctrl, log } = setup(async () => { if (fail) throw new TypeError('x'); });
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmBoarding();                         // PATCH 실패
  await ctrl.whenSynced();
  fail = false;
  assert.equal((await ctrl.recover()).source, 'local');
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'ON_BUS'], [7, 1, 'ON_BUS']]);
  await ctrl.recover();
  await ctrl.whenSynced();
  assert.equal(log.patched.length, 2, '재동기화는 한 번만');
});

test('recover: PATCH가 아직 진행 중이면(실패 아님) 복귀해도 중복 전송하지 않는다', async () => {
  const d = deferred<void>();
  const { ctrl, log } = setup(() => d.promise);
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmBoarding();
  await ctrl.recover();
  d.resolve();
  await ctrl.whenSynced();
  assert.equal(log.patched.length, 1);
});

test('recover: 메모리 세션이 없으면 기기 저장본으로 복구(changed=true) + PATCH 1회', async () => {
  const { ctrl, log } = setup(async () => {}, withBus('RIDING'));
  assert.deepEqual(await ctrl.recover(), { source: 'local', changed: true });
  assert.equal(ctrl.getState().uiState, 'ON_BUS');
  await ctrl.whenSynced();
  assert.deepEqual(log.patched, [[7, 1, 'ON_BUS']]);
});

test('recover: 메모리도 저장본도 없으면 none (현재 화면 유지)', async () => {
  const { ctrl } = setup();
  assert.deepEqual(await ctrl.recover(), { source: 'none', changed: false });
});

test('recover: 종료된 세션의 저장본은 쓰지 않는다', async () => {
  const done = { ...withBus('COMPLETED'), status: 'ARRIVED' as const };
  const { ctrl, log } = setup(async () => {}, done);
  assert.equal((await ctrl.recover()).source, 'none');
  assert.equal(log.patched.length, 0);
});

test('전이마다 마지막 상태를 기기에 저장한다', () => {
  const { ctrl, log } = setup();
  begin(ctrl, withBus('WAITING'));
  ctrl.confirmBoarding();
  assert.equal(log.saved.length, 2);
  assert.equal(log.saved[1].legs[1].state, 'RIDING');
});

// ───────── 도착(ARRIVED) → /complete ─────────
function arriveLive(ctrl: Ctrl) {
  ctrl.startSession(liveSession());
  walkThroughLive(ctrl);
}
function walkThroughLive(ctrl: Ctrl) {
  ctrl.completeWalk();
  ctrl.confirmBoarding(); ctrl.notifyNearAlightStop(); ctrl.confirmAlighting();   // 버스1 → 버스2 대기(3)
  ctrl.confirmBoarding(); ctrl.notifyNearAlightStop(); ctrl.confirmAlighting();   // 버스2 → 마지막 도보(4)
  ctrl.completeWalk();                                                           // ARRIVED
}

test('도착(ARRIVED) 시 /complete는 세션당 정확히 1번, 앞선 leg-state PATCH가 모두 끝난 뒤에 나간다', async () => {
  const { ctrl, log } = setup();
  arriveLive(ctrl);
  assert.equal(ctrl.getState().uiState, 'ARRIVED');
  await ctrl.whenSynced();
  assert.deepEqual(log.completed, [42]);
  assert.equal(log.order[log.order.length - 1], 'complete');
  assert.equal(log.order.filter((o) => o === 'complete').length, 1);
  assert.ok(log.order.indexOf('complete') > log.order.lastIndexOf('patch:4:WALK_TO_DEST'));
});

test('도착 후 중복 호출 방지: 같은 이벤트·복귀·재개를 반복해도 /complete는 1번', async () => {
  const { ctrl, log } = setup();
  arriveLive(ctrl);
  ctrl.completeWalk();                 // 이미 ARRIVED → 무시
  ctrl.confirmAlighting();
  await ctrl.recover();                // 종료된 세션은 재개/복구 대상 아님
  await ctrl.restore(42);
  await ctrl.whenSynced();
  assert.deepEqual(log.completed, [42]);
});

test('도착 처리 실패(네트워크/서버/인증): 로컬 도착은 유지되고 로그만, 재시도하지 않는다', async () => {
  for (const err of [new TypeError('Network request failed'), new ApiStatusError(500, 'x'), new AuthExpiredError()]) {
    const { ctrl, log } = setup(async () => {}, null, async () => { throw err; });
    arriveLive(ctrl);
    await ctrl.whenSynced();
    assert.equal(ctrl.getState().uiState, 'ARRIVED');
    assert.equal(ctrl.getState().session?.status, 'ARRIVED');
    assert.equal(log.completed.length, 1, '재시도 없음');
    assert.ok(log.logs.some((m) => m.includes('도착 처리')));
    assert.equal(log.authExpired, err instanceof AuthExpiredError ? 1 : 0);
  }
});

test('세션이 바뀌면(새 navigationId) 새 세션의 도착은 다시 1번 알린다', async () => {
  const { ctrl, log } = setup();
  arriveLive(ctrl);
  const other = createLocalSession(43, parseItinerary(LIVE_ITINERARY)!.legs);
  ctrl.startSession(other);
  walkThroughLive(ctrl);
  await ctrl.whenSynced();
  assert.deepEqual(log.completed, [42, 43]);
});
