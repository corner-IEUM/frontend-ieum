// utils/geo.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, bearingDegrees, angleDiffDegrees } from './geo.ts';

test('haversineMeters: 위도 1도 ≈ 111.19km, 같은 점은 0', () => {
  assert.ok(Math.abs(haversineMeters(0, 0, 1, 0) - 111194.9) < 1);
  assert.equal(haversineMeters(37.5, 127, 37.5, 127), 0);
});

test('haversineMeters: 인자 순서가 바뀌어도 같은 거리', () => {
  const a = haversineMeters(37.5445, 127.056, 37.5665, 126.978);
  const b = haversineMeters(37.5665, 126.978, 37.5445, 127.056);
  assert.ok(Math.abs(a - b) < 1e-6);
});

test('bearingDegrees: 북 0, 동 90, 남 180, 서 270', () => {
  assert.ok(Math.abs(bearingDegrees(0, 0, 1, 0) - 0) < 1e-6);
  assert.ok(Math.abs(bearingDegrees(0, 0, 0, 1) - 90) < 1e-6);
  assert.ok(Math.abs(bearingDegrees(0, 0, -1, 0) - 180) < 1e-6);
  assert.ok(Math.abs(bearingDegrees(0, 0, 0, -1) - 270) < 1e-6);
});

test('angleDiffDegrees: 0/360 경계와 최대 180', () => {
  assert.equal(angleDiffDegrees(350, 10), 20);
  assert.equal(angleDiffDegrees(0, 180), 180);
  assert.equal(angleDiffDegrees(90, 90), 0);
});
