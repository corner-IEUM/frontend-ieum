// transit/arrivalAnnouncer.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planAnnouncement, INITIAL_ANNOUNCER_MEMO, ARRIVAL_MSG, arrivalA11yLabel, hasSoonArrival } from './arrivalAnnouncer.ts';
import type { AnnouncerMemo, ArrivalEvent } from './arrivalAnnouncer.ts';
import type { BusArrival } from './types.ts';

const bus = (routeNo: string, arrivalSec: number, remainingStops?: number): BusArrival =>
  ({ routeId: `R${routeNo}`, routeNo, arrivalSec, ...(remainingStops != null ? { remainingStops } : {}) });
const ok = (...arrivals: BusArrival[]): ArrivalEvent => ({ type: 'success', arrivals });
const ERR: ArrivalEvent = { type: 'error', kind: 'server' };
const NET: ArrivalEvent = { type: 'error', kind: 'network' };

// 이벤트를 차례로 적용하고 각 단계의 안내 문장/햅틱을 모은다
function run(events: ArrivalEvent[], memo: AnnouncerMemo = INITIAL_ANNOUNCER_MEMO) {
  return events.map((e) => {
    const plan = planAnnouncement(memo, e);
    memo = plan.memo;
    return { texts: plan.texts, haptic: plan.haptic };
  });
}

test('첫 성공: 도착 임박 순 최대 2건 안내', () => {
  const [r] = run([ok(bus('7016', 600), bus('402', 180), bus('150', 300))]);
  assert.deepEqual(r.texts, ['402번 버스가 3분 후 도착합니다', '150번 버스가 5분 후 도착합니다']);
  assert.equal(r.haptic, false);
});

test('재조회: 분 단위 변화가 없으면 안내하지 않음', () => {
  const [, r] = run([ok(bus('402', 180)), ok(bus('402', 170))]);
  assert.deepEqual(r.texts, []);
});

test('재조회: 도착 시간이 바뀐 버스만 안내', () => {
  const [, r] = run([ok(bus('402', 180), bus('150', 300)), ok(bus('402', 120), bus('150', 290))]);
  assert.deepEqual(r.texts, ['402번 버스가 2분 후 도착합니다']);
});

test('곧 도착 진입 시 안내 + 햅틱 1회, 이후 반복 없음', () => {
  const [, r1, r2] = run([ok(bus('402', 100)), ok(bus('402', 50)), ok(bus('402', 20))]);
  assert.deepEqual(r1.texts, ['402번 버스가 곧 도착합니다']);
  assert.equal(r1.haptic, true);
  assert.deepEqual(r2.texts, []);
  assert.equal(r2.haptic, false);
});

test('연속 실패: 에러 음성은 첫 실패 1회만', () => {
  const r = run([ok(bus('402', 180)), ERR, ERR, ERR]);
  assert.deepEqual(r.map((x) => x.texts), [['402번 버스가 3분 후 도착합니다'], [ARRIVAL_MSG.server], [], []]);
});

test('복구: 복구 안내 후 바뀐 내용 안내 재개', () => {
  const [, , r] = run([ok(bus('402', 300)), ERR, ok(bus('402', 120))]);
  assert.deepEqual(r.texts, [ARRIVAL_MSG.recovered, '402번 버스가 2분 후 도착합니다']);
});

test('첫 조회부터 실패 후 성공하면 복구 안내 + 첫 안내', () => {
  const [r1, r2] = run([ERR, ok(bus('402', 180))]);
  assert.deepEqual(r1.texts, [ARRIVAL_MSG.server]);
  assert.deepEqual(r2.texts, [ARRIVAL_MSG.recovered, '402번 버스가 3분 후 도착합니다']);
});

test('접근성 라벨 형식', () => {
  assert.equal(arrivalA11yLabel(bus('402', 180, 2)), '402번, 3분 후 도착, 2정거장 전');
  assert.equal(arrivalA11yLabel(bus('402', 30, 1)), '402번, 곧 도착, 1정거장 전');
});

test('실패 종류가 바뀌면 새 종류는 다시 1회 안내', () => {
  const r = run([ERR, ERR, NET, NET]);
  assert.deepEqual(r.map((x) => x.texts), [[ARRIVAL_MSG.server], [], [ARRIVAL_MSG.network], []]);
});

test('실패 종류별 문구가 서로 다르다', () => {
  assert.equal(new Set([ARRIVAL_MSG.noStop, ARRIVAL_MSG.server, ARRIVAL_MSG.network]).size, 3);
  const [r] = run([{ type: 'error', kind: 'noStop' }]);
  assert.deepEqual(r.texts, [ARRIVAL_MSG.noStop]);
});

test('접근성 라벨: 정거장 수/다음 버스는 있을 때만', () => {
  assert.equal(arrivalA11yLabel({ ...bus('402', 180), nextArrivalSec: 720 }), '402번, 3분 후 도착, 다음 버스 12분 후');
  assert.equal(arrivalA11yLabel(bus('402', 180)), '402번, 3분 후 도착');
});

test('hasSoonArrival: 내 노선이 1분 이내일 때만 true (다른 노선/노선명 없음은 false)', () => {
  const list = [bus('402', 50), bus('150', 30), bus('7016', 300)];
  assert.equal(hasSoonArrival(list, '402'), true);
  assert.equal(hasSoonArrival(list, '402번'), true);
  assert.equal(hasSoonArrival(list, '7016'), false, '노선은 맞지만 1분 넘게 남음');
  assert.equal(hasSoonArrival([bus('150', 30)], '402'), false, '다른 노선만 곧 도착');
  assert.equal(hasSoonArrival(list, undefined), false);
  assert.equal(hasSoonArrival([], '402'), false);
});
