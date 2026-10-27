// transit/arrivalParser.test.ts — 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeArrivals, normalizeSessionStopIds, buildMockArrivals } from './arrivalParser.ts';
import { ApiStatusError } from '../apiErrors.ts';
import { classifyArrivalError, AuthExpiredError } from '../apiErrors.ts';
import type { TransitSession } from './types.ts';

test('normalizeArrivals: 정상 응답 변환 + 다음 버스 선택값', () => {
  const r = normalizeArrivals([{ routeName: '402', arrivalSec: 180, nextArrivalSec: 720 }, { routeName: '150', arrivalSec: 60 }]);
  assert.deepEqual(r, [
    { routeId: '402', routeNo: '402', arrivalSec: 180, nextArrivalSec: 720 },
    { routeId: '150', routeNo: '150', arrivalSec: 60 },
  ]);
});

test('normalizeArrivals: 형식이 어긋난 항목은 버리고, 같은 노선명은 키가 겹치지 않는다', () => {
  const r = normalizeArrivals([{ routeName: '402', arrivalSec: 'x' }, null, { routeName: '', arrivalSec: 1 }, { routeName: '7', arrivalSec: 10 }, { routeName: '7', arrivalSec: 20 }]);
  assert.deepEqual(r.map((x) => x.routeId), ['7', '7#2']);
});

test('normalizeArrivals: 배열이 아니면 서버 오류로 취급', () => {
  assert.throws(() => normalizeArrivals({ message: 'x' }), ApiStatusError);
  assert.equal(classifyArrivalError(new ApiStatusError(500, 'x')), 'server');
  assert.equal(classifyArrivalError(new AuthExpiredError()), 'server');
  assert.equal(classifyArrivalError(new TypeError('Network request failed')), 'network');
});

const place = { name: 'p', lat: 0, lng: 0 };
const session = (legs: unknown[]) => ({ id: 1, status: 'IN_PROGRESS', currentLegIndex: 0, legs }) as unknown as TransitSession;

test('normalizeSessionStopIds: 숫자는 문자열로, 없거나 비어 있으면 필드 제거', () => {
  const s = normalizeSessionStopIds(session([
    { seq: 0, mode: 'WALK', state: 'WALKING', start: place, end: place },
    { seq: 1, mode: 'BUS', state: 'PENDING', stopId: 12345, start: place, end: place },
    { seq: 2, mode: 'BUS', state: 'PENDING', stopId: '', start: place, end: place },
  ]));
  assert.equal(s.legs[1].stopId, '12345');
  assert.equal('stopId' in s.legs[0], false);
  assert.equal('stopId' in s.legs[2], false);
});

test('normalizeSessionStopIds: legs가 이상해도 죽지 않는다', () => {
  const weird = { id: 1 } as unknown as TransitSession;
  assert.equal(normalizeSessionStopIds(weird), weird);
});

test('buildMockArrivals: 시간이 지나면 줄어들고 항상 양수', () => {
  const a = buildMockArrivals(0)[0].arrivalSec;
  const b = buildMockArrivals(60000)[0].arrivalSec;
  assert.equal(a - b, 60);
  for (const ms of [0, 299000, 300000, 1234567]) assert.ok(buildMockArrivals(ms).every((x) => x.arrivalSec >= 20));
});
