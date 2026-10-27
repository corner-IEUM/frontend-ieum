// transit/reconfirm.test.ts — 실행: npm test
import { test, mock, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { startReconfirm, RECONFIRM_INTERVAL_MS, RECONFIRM_MAX } from './reconfirm.ts';

afterEach(() => mock.timers.reset());

test('60초 전에는 안내하지 않고, 60초 간격으로 최대 3회만 안내한다', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const calls: number[] = [];
  startReconfirm((n) => calls.push(n));
  mock.timers.tick(RECONFIRM_INTERVAL_MS - 1);
  assert.deepEqual(calls, []);
  mock.timers.tick(1);
  assert.deepEqual(calls, [1]);
  mock.timers.tick(RECONFIRM_INTERVAL_MS * 10);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(RECONFIRM_MAX, 3);
});

test('cancel하면 이후 안내가 나오지 않는다', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const calls: number[] = [];
  const cancel = startReconfirm((n) => calls.push(n));
  mock.timers.tick(RECONFIRM_INTERVAL_MS);
  cancel();
  mock.timers.tick(RECONFIRM_INTERVAL_MS * 5);
  assert.deepEqual(calls, [1]);
});

test('시작 즉시 cancel하면 한 번도 안내하지 않는다', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const calls: number[] = [];
  startReconfirm((n) => calls.push(n))();
  mock.timers.tick(RECONFIRM_INTERVAL_MS * 5);
  assert.deepEqual(calls, []);
});
