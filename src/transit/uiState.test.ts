// transit/uiState.test.ts — deriveUiState / reconcileFlags 단위 테스트 / Unit tests (npm test)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveUiState, reconcileFlags, getVisibleConfirmButton, getVoiceConfirmKind, INITIAL_FLAGS, type UiFlags, type UiState } from './uiState.ts';
import { buildGuidance } from './guidanceMessages.ts';
import type { LegState, SessionStatus, TransitSession } from './types.ts';

const place = (name: string) => ({ name, lat: 0, lng: 0 });
type Spec = [mode: 'WALK' | 'BUS', state: LegState];
const make = (specs: Spec[], currentLegIndex: number, status: SessionStatus = 'IN_PROGRESS'): TransitSession => ({
  id: 1, status, currentLegIndex,
  legs: specs.map(([mode, state], seq) => ({
    seq, mode, state, routeName: mode === 'BUS' ? '402' : undefined,
    start: place(`S${seq}`), end: place(`E${seq}`),
  })),
});
const off: UiFlags = INITIAL_FLAGS;
const board: UiFlags = { boardingPrompt: true, alightingPrompt: false };
const alight: UiFlags = { boardingPrompt: false, alightingPrompt: true };
const both: UiFlags = { boardingPrompt: true, alightingPrompt: true };

// 도보 → 버스 → 도보 / walk-bus-walk
const W_B_W: Spec[] = [['WALK', 'WALKING'], ['BUS', 'PENDING'], ['WALK', 'PENDING']];

test('도보 → 버스 → 도보: 전체 흐름', () => {
  const at = (i: number, specs: Spec[], f = off) => deriveUiState(make(specs, i), f);
  assert.equal(at(0, [['WALK', 'WALKING'], ['BUS', 'PENDING'], ['WALK', 'PENDING']]), 'WALK_TO_STOP');
  assert.equal(at(1, [['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']]), 'WAITING_AT_STOP');
  assert.equal(at(1, [['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']], board), 'BOARDING_CONFIRM');
  assert.equal(at(1, [['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']]), 'ON_BUS');
  assert.equal(at(1, [['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']], alight), 'ALIGHTING_CONFIRM');
  assert.equal(at(2, [['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'WALKING']]), 'WALK_TO_DEST');
});

test('환승: 버스 간 도보는 WALK_TO_STOP, 마지막 도보만 WALK_TO_DEST', () => {
  const specs = (cur: number): Spec[] => [
    ['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'WALKING'], ['BUS', 'PENDING'], ['WALK', 'PENDING'],
  ].map((s, i) => (i < cur ? [s[0], 'COMPLETED'] : s)) as Spec[];
  assert.equal(deriveUiState(make(specs(0), 0), off), 'WALK_TO_STOP');
  assert.equal(deriveUiState(make(specs(2), 2), off), 'WALK_TO_STOP'); // 환승 도보 / transfer walk
  const lastBus: Spec[] = [['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']];
  assert.equal(deriveUiState(make(lastBus, 3), off), 'ON_BUS');
  const finalWalk: Spec[] = [['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'WALKING']];
  assert.equal(deriveUiState(make(finalWalk, 4), off), 'WALK_TO_DEST');
});

test('도보만 경로는 WALK_TO_DEST', () => {
  assert.equal(deriveUiState(make([['WALK', 'WALKING']], 0), off), 'WALK_TO_DEST');
});

test('플래그 on/off: 해당 서버 상태에서만 반영된다', () => {
  const waiting = make([['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']], 1);
  const riding = make([['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']], 1);
  const walking = make(W_B_W, 0);
  assert.equal(deriveUiState(waiting, alight), 'WAITING_AT_STOP'); // 하차 플래그는 대기 중 무시 / ignored
  assert.equal(deriveUiState(riding, board), 'ON_BUS');            // 탑승 플래그는 탑승 중 무시 / ignored
  assert.equal(deriveUiState(waiting, both), 'BOARDING_CONFIRM');
  assert.equal(deriveUiState(riding, both), 'ALIGHTING_CONFIRM');
  assert.equal(deriveUiState(walking, both), 'WALK_TO_STOP');      // 도보 중에는 플래그 무시 / ignored while walking
});

test('ARRIVED / CANCELED / 세션 없음', () => {
  const done: Spec[] = [['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'COMPLETED']];
  assert.equal(deriveUiState(make(done, 2, 'ARRIVED'), both), 'ARRIVED');
  assert.equal(deriveUiState(make(W_B_W, 0, 'CANCELED'), both), 'CANCELED');
  assert.equal(deriveUiState(null, off), null);
});

test('reconcileFlags: 서버 상태가 바뀌면 초기화, 같으면 유지', () => {
  const waiting = make([['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']], 1);
  const waitingAgain = make([['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']], 1); // 멱등 재응답 / idempotent re-response
  const riding = make([['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']], 1);
  assert.deepEqual(reconcileFlags(waiting, waitingAgain, board), board);
  assert.deepEqual(reconcileFlags(waiting, riding, board), INITIAL_FLAGS);
  // leg가 넘어간 경우(버스 하차 → 다음 도보) / leg index advanced
  const nextWalk = make([['WALK', 'COMPLETED'], ['BUS', 'COMPLETED'], ['WALK', 'WALKING']], 2);
  assert.deepEqual(reconcileFlags(riding, nextWalk, alight), INITIAL_FLAGS);
  // 최초 세션 / first session
  assert.deepEqual(reconcileFlags(null, waiting, board), INITIAL_FLAGS);
});

test('buildGuidance 문구', () => {
  const walkStop = make(W_B_W, 0);
  const waiting = make([['WALK', 'COMPLETED'], ['BUS', 'WAITING'], ['WALK', 'PENDING']], 1);
  const riding = make([['WALK', 'COMPLETED'], ['BUS', 'RIDING'], ['WALK', 'PENDING']], 1);
  assert.equal(buildGuidance('WALK_TO_STOP', walkStop), 'E0까지 걸어가세요.');
  assert.equal(buildGuidance('WAITING_AT_STOP', waiting), '402번 버스를 기다리는 중이에요.');
  assert.equal(buildGuidance('BOARDING_CONFIRM', waiting), '402번 버스가 도착했어요. 탑승하셨나요?');
  assert.equal(buildGuidance('ON_BUS', riding), '탑승했어요. 내릴 곳은 E1이에요.');
  assert.equal(buildGuidance('ALIGHTING_CONFIRM', riding), '이번 정류장에서 내리시나요? 내리셨으면 내렸어요 버튼을 눌러 주세요.');
  assert.equal(buildGuidance('WALK_TO_DEST', walkStop), '목적지까지 걸어가세요.');
  assert.equal(buildGuidance('ARRIVED', walkStop), '목적지에 도착했어요. 수고하셨어요.');
});

const ALL_STATES: UiState[] = ['WALK_TO_STOP', 'WAITING_AT_STOP', 'BOARDING_CONFIRM', 'ON_BUS', 'ALIGHTING_CONFIRM', 'WALK_TO_DEST', 'ARRIVED', 'CANCELED'];

test('getVisibleConfirmButton: 모든 UiState', () => {
  const expected: Record<UiState, 'BOARD' | 'ALIGHT' | null> = {
    WALK_TO_STOP: null, WAITING_AT_STOP: 'BOARD', BOARDING_CONFIRM: 'BOARD',
    ON_BUS: null, ALIGHTING_CONFIRM: 'ALIGHT', WALK_TO_DEST: null, ARRIVED: null, CANCELED: null,
  };
  ALL_STATES.forEach((st) => assert.equal(getVisibleConfirmButton(st), expected[st], st));
  assert.equal(getVisibleConfirmButton(null), null);
});

test('getVoiceConfirmKind: 대기 중(WAITING_AT_STOP)에는 청취하지 않는다', () => {
  const listening = ALL_STATES.filter((st) => getVoiceConfirmKind(st) !== null);
  assert.deepEqual(listening, ['BOARDING_CONFIRM', 'ALIGHTING_CONFIRM']);
  assert.equal(getVoiceConfirmKind('BOARDING_CONFIRM'), 'BOARD');
  assert.equal(getVoiceConfirmKind('ALIGHTING_CONFIRM'), 'ALIGHT');
});

test('SUBWAY 구간도 BUS와 같은 탑승 구간: 앞 도보는 WALK_TO_STOP, 탑승 후 ON_BUS', () => {
  const s = make(W_B_W, 0);
  s.legs[1] = { ...s.legs[1], mode: 'SUBWAY' };
  assert.equal(deriveUiState(s, off), 'WALK_TO_STOP');
  s.currentLegIndex = 1;
  s.legs[1] = { ...s.legs[1], state: 'WAITING' };
  assert.equal(deriveUiState(s, off), 'WAITING_AT_STOP');
  s.legs[1] = { ...s.legs[1], state: 'RIDING' };
  assert.equal(deriveUiState(s, off), 'ON_BUS');
});
