// transit/alightLive.test.ts — 서버 stations → stops → GPS 하차 안내(2정류장 전/1정류장 전/임박) 연결 확인 (실서버 fixture)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAlightTracker, type AlightStage } from './alightGuidance.ts';
import { getAlightStops } from './legStops.ts';
import { haversineMeters } from '../utils/geo.ts';
import { parseItinerary } from './itineraryParser.ts';
import { LIVE_ITINERARY } from './liveFixture.ts';
import type { TransitLeg, TransitStop } from './types.ts';

// 정류장 순서대로 지나가며 각 정류장에서 위치를 두 번 보낸다(같은 단계 판정이 연속 2회 나와야 올라감). 단계가 올라간 (정류장 인덱스, 단계)를 모은다
function drive(stops: TransitStop[], alightIndex: number): Array<[number, AlightStage]> {
  const tracker = createAlightTracker(stops, alightIndex);
  const events: Array<[number, AlightStage]> = [];
  let t = 0;
  stops.forEach((s, i) => {
    // 마지막(하차) 정류장은 정류장 위가 아니라 직전 정류장에서 오다가 30m 앞에서 판정 (실제 GPS처럼 진행 방향이 유지되도록)
    let { lat, lng } = s;
    if (i === stops.length - 1 && i > 0) {
      const prev = stops[i - 1];
      const f = 1 - 30 / haversineMeters(prev.lat, prev.lng, s.lat, s.lng);
      lat = prev.lat + (s.lat - prev.lat) * f;
      lng = prev.lng + (s.lng - prev.lng) * f;
    }
    for (let k = 0; k < 2; k++) {
      const u = tracker.push({ lat, lng, accuracy: 10, timestamp: ++t * 1000 });
      if (u.changedTo) events.push([i, u.changedTo]);
    }
  });
  return events;
}

const legs = () => parseItinerary(LIVE_ITINERARY)!.legs; // [도보, 버스1(stations 3), 0m 도보, 버스2(stations 6), 도보]

test('getAlightStops: 탑승 구간의 stations→stops와 하차 인덱스(마지막), 도보/정류장 부족은 null', () => {
  const [walk, bus1, , bus2] = legs();
  assert.equal(getAlightStops(walk), null);
  assert.equal(getAlightStops(null), null);
  const a = getAlightStops(bus1)!;
  assert.deepEqual(a.stops.map((s) => s.id), ['818537', '779106', '778984']);
  assert.equal(a.alightIndex, 2);
  const b = getAlightStops(bus2)!;
  assert.equal(b.stops.length, 6);
  assert.equal(b.alightIndex, 5);
  assert.equal(b.stops[5].name, '노원구청');
  assert.equal(getAlightStops({ ...bus1, stops: [bus1.stops![0]] }), null);
});

test('실서버 fixture 버스2(stations 6): 2정류장 전 → 1정류장 전 → 임박이 각 한 번씩, 순서대로', () => {
  const { stops, alightIndex } = getAlightStops(legs()[3])!;
  assert.deepEqual(drive(stops, alightIndex), [[3, 'TWO_BEFORE'], [4, 'ONE_BEFORE'], [5, 'IMMINENT']]);
});

test('실서버 fixture 버스1(stations 3): 첫 정류장부터 2정류장 전', () => {
  const { stops, alightIndex } = getAlightStops(legs()[1])!;
  assert.deepEqual(drive(stops, alightIndex), [[0, 'TWO_BEFORE'], [1, 'ONE_BEFORE'], [2, 'IMMINENT']]);
});

test('SUBWAY 구간도 같은 경로로 연결: stations 2개면 출발역에서 1정류장 전 → 도착역에서 임박', () => {
  const raw = {
    totalTime: 206,
    legs: [{
      mode: 'SUBWAY', distance: 1484, sectionTime: 122, route: '수도권5호선', routeId: '110053003', routeColor: '996CAC', routeTypeCode: 5, inService: true,
      start: { name: '광나루', lng: 127.1038638888889, lat: 37.54526944444444 },
      end: { name: '아차산', lng: 127.08969166666667, lat: 37.55195277777778 },
      stations: [
        { index: 0, stationName: '광나루', stationId: '110537', lng: 127.103864, lat: 37.545269 },
        { index: 1, stationName: '아차산', stationId: '110536', lng: 127.089692, lat: 37.551953 },
      ],
    }],
  };
  const leg: TransitLeg = parseItinerary(raw)!.legs[0];
  assert.equal(leg.mode, 'SUBWAY');
  const a = getAlightStops(leg)!;
  assert.equal(a.alightIndex, 1);
  assert.deepEqual(drive(a.stops, a.alightIndex), [[0, 'ONE_BEFORE'], [1, 'IMMINENT']]);
});
