// transit/destinationArrival.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createArrivalDetector, validDestination, ARRIVE_RADIUS_M } from './destinationArrival.ts';
import type { GpsFix } from './alightGuidance.ts';

const DEST = { lat: 37.5, lng: 127 };
const M = 1 / 111195; // 위도 1m ≈ 이 각도
// 목적지에서 북쪽으로 m미터 떨어진 위치
const fix = (m: number, accuracy: number | null = 10): GpsFix => ({ lat: DEST.lat + m * M, lng: DEST.lng, accuracy, timestamp: 0 });

test('반경 30m 안 판정이 연속 2회 나와야 도착, 도착은 한 번만', () => {
  const d = createArrivalDetector(DEST);
  assert.equal(d.push(fix(100)).arrived, false);
  assert.equal(d.push(fix(20)).arrived, false, '1회만으로는 도착 아님');
  assert.equal(d.push(fix(10)).arrived, true);
  assert.equal(d.push(fix(5)).arrived, false, '이후 같은 도착을 다시 알리지 않음');
  assert.equal(d.push(fix(0)).arrived, false);
});

test('중간에 반경 밖 위치가 끼면 연속 횟수가 초기화된다', () => {
  const d = createArrivalDetector(DEST);
  d.push(fix(20));
  assert.equal(d.push(fix(60)).arrived, false); // 튄 위치
  assert.equal(d.push(fix(20)).arrived, false, '다시 1회부터');
  assert.equal(d.push(fix(15)).arrived, true);
});

test('반경 경계: 30m 이내는 안, 그 밖은 밖', () => {
  assert.equal(ARRIVE_RADIUS_M, 30);
  const d = createArrivalDetector(DEST);
  d.push(fix(29)); // 안
  assert.equal(d.push(fix(31)).arrived, false); // 밖 → 초기화
  d.push(fix(29));
  assert.equal(d.push(fix(29)).arrived, true);
});

test('정확도 낮은 위치는 무시하고 연속 횟수에도 영향을 주지 않는다', () => {
  const d = createArrivalDetector(DEST);
  d.push(fix(10));
  const noisy = d.push(fix(500, 300));
  assert.equal(noisy.accepted, false);
  assert.equal(noisy.arrived, false);
  assert.equal(d.push(fix(10)).arrived, true, '무시된 위치를 사이에 두고도 연속 2회로 인정');
  // 정확도가 낮아도 반경 안 위치로는 도착하지 않는다
  const d2 = createArrivalDetector(DEST);
  d2.push(fix(5, 300)); d2.push(fix(5, 300)); d2.push(fix(5, 300));
  assert.equal(d2.push(fix(5, 300)).arrived, false);
});

test('accuracy를 모르면(null) 포함', () => {
  const d = createArrivalDetector(DEST);
  d.push(fix(10, null));
  assert.equal(d.push(fix(10, null)).arrived, true);
});

test('validDestination: 없거나 이상한 좌표는 null (자동 판정 안 함)', () => {
  assert.deepEqual(validDestination({ lat: 37.5, lng: 127 }), { lat: 37.5, lng: 127 });
  assert.equal(validDestination(undefined), null);
  assert.equal(validDestination(null), null);
  assert.equal(validDestination({ lat: 0, lng: 0 }), null);
  assert.equal(validDestination({ lat: NaN, lng: 127 }), null);
  assert.equal(validDestination({ lat: '37.5', lng: 127 }), null);
  assert.equal(validDestination({ lat: 91, lng: 127 }), null);
  assert.equal(validDestination({ lat: 37.5 }), null);
});
