// transit/stageView.test.ts — 화면 표시 값 계산 단위 테스트 (입력은 테스트용 값, 앱에는 목업 없음) / Unit tests for view-value derivation
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stageForUiState, hasTransitLeg, findMyArrival, arrivalPhase, rideTimeline, hapticSegments, hapticLabel, compassText, walkRemain, formatAlightDistance, alightDistanceText,
} from './stageView.ts';
import type { BusArrival } from './types.ts';

const arr = (routeNo: string, arrivalSec: number): BusArrival => ({ routeId: routeNo, routeNo, arrivalSec });
const stops = ['a', 'b', 'c', 'd', 'e'].map((id, i) => ({ id, name: `${id}정류장`, lat: 37 + i * 0.001, lng: 127 }));

test('상태 → 3단계 스텝', () => {
  assert.equal(stageForUiState('WALK_TO_STOP'), 2);
  assert.equal(stageForUiState('WAITING_AT_STOP'), 2);
  assert.equal(stageForUiState('BOARDING_CONFIRM'), 2);
  assert.equal(stageForUiState('ON_BUS'), 3);
  assert.equal(stageForUiState('ALIGHTING_CONFIRM'), 3);
  assert.equal(stageForUiState('WALK_TO_DEST'), 3);
  assert.equal(stageForUiState('CANCELED'), null);
  assert.equal(stageForUiState(null), null);
});

test('도보 전용 경로에는 스텝을 보이지 않는다', () => {
  assert.equal(hasTransitLeg([{ mode: 'WALK' }]), false);
  assert.equal(hasTransitLeg([{ mode: 'WALK' }, { mode: 'BUS' }, { mode: 'WALK' }]), true);
  assert.equal(hasTransitLeg([{ mode: 'SUBWAY' }]), true);
  assert.equal(hasTransitLeg(null), false);
});

test('내 노선 도착 찾기: "번" 접미/공백 무시, 없으면 null', () => {
  const list = [arr('402', 300), arr('501', 40)];
  assert.equal(findMyArrival(list, '501번')?.routeNo, '501');
  assert.equal(findMyArrival(list, ' 402 ')?.routeNo, '402');
  assert.equal(findMyArrival(list, '999'), null);
  assert.equal(findMyArrival(list, undefined), null);
});

test('도착 상태: 접근 중 / 곧 도착(1분 이내) / 도착함(탑승 확인)', () => {
  assert.equal(arrivalPhase('WAITING_AT_STOP', null), 'APPROACHING');
  assert.equal(arrivalPhase('WAITING_AT_STOP', arr('1', 300)), 'APPROACHING');
  assert.equal(arrivalPhase('WAITING_AT_STOP', arr('1', 60)), 'SOON');
  assert.equal(arrivalPhase('BOARDING_CONFIRM', arr('1', 300)), 'ARRIVED');
  assert.equal(arrivalPhase('BOARDING_CONFIRM', null), 'ARRIVED');
});

test('타임라인: 남은 정류장 수로 현재 위치를 계산', () => {
  const leg = { stops, alightStopId: 'e' };
  assert.deepEqual(rideTimeline(leg, 3), { prev: 'a정류장', current: 'b정류장', next: 'c정류장', alight: 'e정류장', remainingStops: 3, currentKnown: true });
  const last = rideTimeline(leg, 1)!;
  assert.equal(last.current, 'd정류장');
  assert.equal(last.next, 'e정류장');
  const atAlight = rideTimeline(leg, 0)!;
  assert.equal(atAlight.current, 'e정류장');
  assert.equal(atAlight.next, null);
});

test('타임라인: GPS 판정 전에는 승차 정류장을 현재로 두고 currentKnown=false, 하차 정류장은 alightStopId 기준', () => {
  const t = rideTimeline({ stops, alightStopId: 'd' }, undefined)!;
  assert.equal(t.current, 'a정류장');
  assert.equal(t.prev, null);
  assert.equal(t.currentKnown, false);
  assert.equal(t.remainingStops, null);
  assert.equal(t.alight, 'd정류장');
});

test('타임라인: 정류장 정보가 없거나 2개 미만이면 null (목업으로 채우지 않는다)', () => {
  assert.equal(rideTimeline({ stops: undefined, alightStopId: undefined }, 2), null);
  assert.equal(rideTimeline({ stops: [stops[0]], alightStopId: undefined }, 0), null);
  assert.equal(rideTimeline(null, 1), null);
});

test('타임라인: 범위를 벗어난 남은 정류장 수는 보정', () => {
  assert.equal(rideTimeline({ stops, alightStopId: 'e' }, 99)!.current, 'a정류장');
  assert.equal(rideTimeline({ stops, alightStopId: 'e' }, -3)!.current, 'e정류장');
});

test('진동 패턴 표시: 실제 패턴 배열 그대로 변환', () => {
  assert.deepEqual(hapticSegments([0, 300, 100, 300]), [{ kind: 'buzz', ms: 300 }, { kind: 'gap', ms: 100 }, { kind: 'buzz', ms: 300 }]);
  assert.equal(hapticLabel([0, 300, 100, 300]), '진동 2회');
  assert.equal(hapticLabel([0, 200]), '진동 1회');
  assert.equal(hapticLabel([0, 500]), '진동 1회');
});

test('하차 거리: 10m 단위 반올림', () => {
  assert.equal(formatAlightDistance(0), '0m');
  assert.equal(formatAlightDistance(4), '0m');
  assert.equal(formatAlightDistance(5), '10m');
  assert.equal(formatAlightDistance(237), '240m');
  assert.equal(formatAlightDistance(234.9), '230m');
  assert.equal(formatAlightDistance(265), '270m');
  assert.equal(formatAlightDistance(994), '990m');
});

test('하차 거리: 1km 이상은 km 표기', () => {
  assert.equal(formatAlightDistance(995), '1km');
  assert.equal(formatAlightDistance(1000), '1km');
  assert.equal(formatAlightDistance(1240), '1.2km');
  assert.equal(formatAlightDistance(1260), '1.3km');
  assert.equal(formatAlightDistance(12000), '12km');
});

test('하차 거리: 값이 없거나 계산 불가면 null (줄 숨김)', () => {
  [undefined, null, NaN, Infinity, -1].forEach((v) => assert.equal(formatAlightDistance(v as number | null | undefined), null, String(v)));
  assert.equal(alightDistanceText(undefined), null);
  assert.equal(alightDistanceText(NaN), null);
  assert.equal(alightDistanceText(180), '정류장 남음 · 약 180m');
  assert.equal(alightDistanceText(1500), '정류장 남음 · 약 1.5km');
});

test('방향 문구', () => {
  assert.equal(compassText(0), '북쪽');
  assert.equal(compassText(44), '북동쪽');
  assert.equal(compassText(180), '남쪽');
  assert.equal(compassText(359), '북쪽');
  assert.equal(compassText(-90), '서쪽');
});

test('도보 전환: 위치/목적지가 있을 때만 거리·방향 (없으면 null)', () => {
  const r = walkRemain({ latitude: 37, longitude: 127 }, { lat: 37.001, lng: 127 })!;
  assert.equal(Math.round(r.distanceM / 10), 11); // ≈ 111m
  assert.equal(r.direction, '북쪽');
  assert.equal(walkRemain(null, { lat: 37, lng: 127 }), null);
  assert.equal(walkRemain({ latitude: 37, longitude: 127 }, undefined), null);
});
