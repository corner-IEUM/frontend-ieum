// transit/localSession.test.ts — 로컬 세션 생성/전이 (거리 0 도보 자동 통과 포함) / Local session transitions incl. zero-length walk auto-pass
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSession, advanceLegState } from './localSession.ts';
import { parseItinerary } from './itineraryParser.ts';
import { deriveUiState, INITIAL_FLAGS } from './uiState.ts';
import { LIVE_ITINERARY } from './liveFixture.ts';

const liveLegs = () => parseItinerary(LIVE_ITINERARY)!.legs; // [도보, 버스1, 거리0 환승 도보, 버스2, 도보]
const ui = (s: ReturnType<typeof createLocalSession>) => deriveUiState(s, INITIAL_FLAGS);

test('createLocalSession: 첫 leg 활성, 나머지 PENDING, id는 navigationId', () => {
  const s = createLocalSession(42, liveLegs());
  assert.equal(s.id, 42);
  assert.equal(s.status, 'IN_PROGRESS');
  assert.equal(s.currentLegIndex, 0);
  assert.deepEqual(s.legs.map((l) => l.state), ['WALKING', 'PENDING', 'PENDING', 'PENDING', 'PENDING']);
  assert.deepEqual(s.legs.map((l) => l.seq), [0, 1, 2, 3, 4]);
  assert.equal(ui(s), 'WALK_TO_STOP');
});

test('실서버 fixture: 버스1 하차 → 거리 0 환승 도보를 건너뛰고 버스2 WAITING_AT_STOP (인덱스는 원본 legs 기준)', () => {
  let s = createLocalSession(42, liveLegs());
  s = advanceLegState(s, 0, 'COMPLETED');                 // 정류장 도착
  assert.equal(s.currentLegIndex, 1);
  assert.equal(ui(s), 'WAITING_AT_STOP');
  s = advanceLegState(s, 1, 'RIDING');                    // 버스1 탑승
  assert.equal(ui(s), 'ON_BUS');
  s = advanceLegState(s, 1, 'COMPLETED');                 // 버스1 하차
  assert.equal(s.currentLegIndex, 3, '0m 도보(2번)를 건너뛰고 원본 인덱스 3');
  assert.deepEqual(s.legs.map((l) => l.state), ['COMPLETED', 'COMPLETED', 'COMPLETED', 'WAITING', 'PENDING']);
  assert.equal(s.legs[3].routeName, '지선:1144');
  assert.equal(ui(s), 'WAITING_AT_STOP');
  s = advanceLegState(s, 3, 'RIDING');
  s = advanceLegState(s, 3, 'COMPLETED');
  assert.equal(s.currentLegIndex, 4);
  assert.equal(ui(s), 'WALK_TO_DEST');
  s = advanceLegState(s, 4, 'COMPLETED');
  assert.equal(s.status, 'ARRIVED');
  assert.equal(ui(s), 'ARRIVED');
});

test('시작 leg가 거리 0 도보면 처음부터 건너뛴다', () => {
  const legs = liveLegs();
  legs[0] = { ...legs[0], distanceM: 0, durationSec: 0 };
  const s = createLocalSession(1, legs);
  assert.equal(s.currentLegIndex, 1);
  assert.equal(ui(s), 'WAITING_AT_STOP');
});

test('거리만 0이고 시간이 있으면(또는 값이 없으면) 건너뛰지 않는다', () => {
  const legs = liveLegs();
  legs[2] = { ...legs[2], durationSec: 5 };
  let s = createLocalSession(1, legs, 1);
  s = advanceLegState(advanceLegState(s, 1, 'RIDING'), 1, 'COMPLETED');
  assert.equal(s.currentLegIndex, 2);
  const noValues = liveLegs();
  delete noValues[2].distanceM; delete noValues[2].durationSec;
  s = advanceLegState(advanceLegState(createLocalSession(1, noValues, 1), 1, 'RIDING'), 1, 'COMPLETED');
  assert.equal(s.currentLegIndex, 2);
});

test('잘못된/오래된 전이는 무시 (멱등): 다른 legIndex, 승차 전 하차, 이미 탑승', () => {
  const s0 = createLocalSession(1, liveLegs(), 1);   // 버스1 WAITING
  assert.equal(advanceLegState(s0, 0, 'COMPLETED'), s0);
  assert.equal(advanceLegState(s0, 1, 'COMPLETED'), s0);
  const riding = advanceLegState(s0, 1, 'RIDING');
  assert.notEqual(riding, s0);
  assert.equal(advanceLegState(riding, 1, 'RIDING'), riding);
  assert.equal(advanceLegState(riding, 1, 'WAITING'), riding);
});

test('서버가 알려준 currentLegIndex부터 시작 (앞 leg는 완료), 범위 밖이면 0', () => {
  const s = createLocalSession(1, liveLegs(), 3);
  assert.deepEqual(s.legs.map((l) => l.state), ['COMPLETED', 'COMPLETED', 'COMPLETED', 'WAITING', 'PENDING']);
  assert.equal(createLocalSession(1, liveLegs(), 99).currentLegIndex, 0);
});
