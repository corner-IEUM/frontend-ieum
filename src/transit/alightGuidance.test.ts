// transit/alightGuidance.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  judgeHeading, estimateStopIndex, rawStageFor, createAlightTracker, type GpsFix, type AlightStage,
} from './alightGuidance.ts';
import type { TransitStop } from './types.ts';

const LAT0 = 37.5;
const LNG0 = 127;
const STEP = 0.0027; // 정류장 간격 ≈ 300m
const stops: TransitStop[] = [0, 1, 2, 3, 4].map((i) => ({ id: `S${i}`, name: `정류장${i}`, lat: LAT0 + i * STEP, lng: LNG0 }));
const fix = (lat: number, accuracy: number | null = 10, t = 0): GpsFix => ({ lat, lng: LNG0, accuracy, timestamp: t });
// 정류장 단위(p=1이면 1정류장 거리)로 북쪽 이동 위치 만들기
const at = (p: number, accuracy: number | null = 10) => fix(LAT0 + p * STEP, accuracy);

// ───────── 진행 방향 ─────────
test('judgeHeading: 목표 쪽으로 이동 → toward, 반대 → away', () => {
  const north = [0, 0.1, 0.2, 0.3, 0.4].map((p) => at(p));
  assert.equal(judgeHeading(north, { lat: LAT0 + 3 * STEP, lng: LNG0 }), 'toward');
  assert.equal(judgeHeading(north, { lat: LAT0 - 3 * STEP, lng: LNG0 }), 'away');
});

test('judgeHeading: 옆 방향(약 90도)은 unknown', () => {
  const north = [0, 0.1, 0.2, 0.3].map((p) => at(p));
  assert.equal(judgeHeading(north, { lat: LAT0 + 0.3 * STEP, lng: LNG0 + 0.01 }), 'unknown');
});

test('judgeHeading: 거의 안 움직였거나 위치가 1개면 unknown', () => {
  const still = [0, 0.00001, 0.00002, 0.00001].map((p) => at(p)); // 1~2m 흔들림
  assert.equal(judgeHeading(still, { lat: LAT0 + STEP, lng: LNG0 }), 'unknown');
  assert.equal(judgeHeading([at(0)], { lat: LAT0 + STEP, lng: LNG0 }), 'unknown');
  assert.equal(judgeHeading([], { lat: LAT0, lng: LNG0 }), 'unknown');
});

test('judgeHeading: 정확도 낮은 위치는 제외 (튄 위치가 방향을 뒤집지 못함)', () => {
  const noisy = [at(0), at(0.1), fix(LAT0 - 5 * STEP, 300), at(0.2), at(0.3)];
  assert.equal(judgeHeading(noisy, { lat: LAT0 + 3 * STEP, lng: LNG0 }), 'toward');
  // 좋은 위치가 1개뿐이면 판정 불가
  assert.equal(judgeHeading([at(0), fix(LAT0 + STEP, 300)], { lat: LAT0 + 3 * STEP, lng: LNG0 }), 'unknown');
});

test('judgeHeading: accuracy를 모르면(null) 포함', () => {
  const unknownAcc = [0, 0.1, 0.2, 0.3].map((p) => at(p, null));
  assert.equal(judgeHeading(unknownAcc, { lat: LAT0 + 3 * STEP, lng: LNG0 }), 'toward');
});

// ───────── 거리 비교 / 인덱스 ─────────
test('estimateStopIndex: 가장 가까운 정류장, 이전 인덱스 아래로는 안 내려감', () => {
  assert.equal(estimateStopIndex(at(2.1), stops, 0).index, 2);
  assert.equal(estimateStopIndex(at(0.1), stops, 2).index, 2, '지나간 정류장으로 되돌아가지 않음');
});

test('estimateStopIndex: 정류장에서 너무 멀면 이전 인덱스 유지', () => {
  const far = { lat: LAT0 + 3 * STEP, lng: LNG0 + 0.05 }; // 약 4km 옆
  assert.equal(estimateStopIndex(far, stops, 1).index, 1);
});

test('rawStageFor: 반경 100m 이내면 남은 수와 관계없이 임박', () => {
  assert.equal(rawStageFor(3, 400), 'NONE');
  assert.equal(rawStageFor(2, 400), 'TWO_BEFORE');
  assert.equal(rawStageFor(1, 400), 'ONE_BEFORE');
  assert.equal(rawStageFor(0, 150), 'ONE_BEFORE');
  assert.equal(rawStageFor(2, 100), 'IMMINENT');
});

// ───────── 추적기 (3단계 + 안정화) ─────────
const walkPath = () => { const r: number[] = []; for (let p = 0; p <= 4.0001; p += 0.1) r.push(Number(p.toFixed(2))); return r; };
function drive(positions: number[]) {
  const tracker = createAlightTracker(stops, 4);
  return positions.map((p) => tracker.push(at(p)));
}

test('추적기: 정류장을 따라가면 3단계가 순서대로 각각 한 번만 올라간다', () => {
  const updates = drive(walkPath());
  const changes = updates.map((u) => u.changedTo).filter((c): c is AlightStage => c !== null);
  assert.deepEqual(changes, ['TWO_BEFORE', 'ONE_BEFORE', 'IMMINENT']);
});

test('추적기: 남은 정류장 수·인덱스·단계는 줄거나 되돌아가지 않는다', () => {
  const updates = drive(walkPath());
  const order = ['NONE', 'TWO_BEFORE', 'ONE_BEFORE', 'IMMINENT'];
  for (let i = 1; i < updates.length; i++) {
    assert.ok(updates[i].remainingStops <= updates[i - 1].remainingStops);
    assert.ok(updates[i].stopIndex >= updates[i - 1].stopIndex);
    assert.ok(order.indexOf(updates[i].stage) >= order.indexOf(updates[i - 1].stage));
  }
  assert.equal(updates[updates.length - 1].stage, 'IMMINENT');
});

test('추적기: 임박은 하차 정류장 반경 약 100m 안에서만', () => {
  const path = walkPath();
  const updates = drive(path);
  const first = updates.findIndex((u) => u.stage === 'IMMINENT');
  const remainingM = (4 - path[first]) * 300;
  assert.ok(remainingM <= 130, `임박 진입 위치가 너무 멀다: ${remainingM}m`); // 2회 연속 확인 지연 감안
});

test('추적기: 한 번 튄 위치는 단계를 올리지 못한다', () => {
  const tracker = createAlightTracker(stops, 4);
  tracker.push(at(0)); tracker.push(at(0.1));
  const spike = tracker.push(at(3.95)); // 갑자기 하차 정류장 근처로 튐
  assert.equal(spike.changedTo, null);
  const after = tracker.push(at(0.2));  // 다시 원래 위치
  assert.equal(after.stage, 'NONE');
  assert.equal(after.changedTo, null);
  assert.equal(after.remainingStops, 4, '튄 위치로 인덱스가 건너뛰지 않음');
});

test('추적기: 정확도 낮은 위치는 무시', () => {
  const tracker = createAlightTracker(stops, 4);
  const u = tracker.push(at(3.95, 300));
  assert.equal(u.accepted, false);
  assert.equal(u.stage, 'NONE');
});

test('추적기: 다음 정류장에서 멀어지는 중이면 단계를 올리지 않는다', () => {
  const tracker = createAlightTracker(stops, 4);
  // 앞쪽(정류장 2 부근)에서 남쪽으로 되돌아가는 이동
  [2.4, 2.35, 2.3, 2.25, 2.2].forEach((p) => tracker.push(at(p)));
  const u = tracker.push(at(2.15));
  assert.equal(u.heading, 'away');
  assert.equal(u.changedTo, null);
});

test('추적기: 정류장이 2개 미만이면 아무것도 하지 않는다', () => {
  const tracker = createAlightTracker([stops[0]], 0);
  assert.equal(tracker.push(at(0)).accepted, false);
});
