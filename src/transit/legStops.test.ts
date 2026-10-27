// transit/legStops.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSessionLegStops, getAlightIndex } from './legStops.ts';
import type { TransitSession } from './types.ts';

const place = { name: 'p', lat: 0, lng: 0 };
const session = (legs: unknown[]) => ({ id: 1, status: 'IN_PROGRESS', currentLegIndex: 0, legs }) as unknown as TransitSession;
const stop = (id: unknown, lat: unknown = 37.5, lng: unknown = 127) => ({ id, name: `n${id}`, lat, lng });

test('정상 stops는 id를 문자열로 맞추고 순서를 유지', () => {
  const s = normalizeSessionLegStops(session([{ mode: 'BUS', start: place, end: place, stops: [stop(1), stop('2'), stop(3)] }]));
  assert.deepEqual(s.legs[0].stops?.map((x) => x.id), ['1', '2', '3']);
});

test('형식이 이상한 정류장은 버리고, 2개 미만이면 stops 필드를 제거', () => {
  const s = normalizeSessionLegStops(session([
    { mode: 'BUS', start: place, end: place, stops: [stop(1), stop('', 1, 1), stop(2, 'x'), stop(3, 999, 0), null, stop(4)] },
    { mode: 'BUS', start: place, end: place, stops: [stop(1)] },
    { mode: 'BUS', start: place, end: place, stops: 'nope' },
    { mode: 'WALK', start: place, end: place },
  ]));
  assert.deepEqual(s.legs[0].stops?.map((x) => x.id), ['1', '4']);
  for (const i of [1, 2, 3]) assert.equal('stops' in s.legs[i], false);
});

test('legs가 이상해도 죽지 않는다', () => {
  const weird = { id: 1 } as unknown as TransitSession;
  assert.equal(normalizeSessionLegStops(weird), weird);
});

test('getAlightIndex: alightStopId가 있으면 그 위치, 없거나 못 찾으면 마지막', () => {
  const stops = [stop(1), stop(2), stop(3)].map((x) => ({ id: String(x.id), name: x.name, lat: 37.5, lng: 127 }));
  assert.equal(getAlightIndex({ stops }), 2);
  assert.equal(getAlightIndex({ stops, alightStopId: '2' }), 1);
  assert.equal(getAlightIndex({ stops, alightStopId: '99' }), 2);
});
