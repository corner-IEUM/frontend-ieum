// transit/itineraryParser.test.ts — 실행: npm test / Run with npm test (node:test)
// 샘플은 백엔드 TransitRouteParserTest의 실제 티맵 응답(광나루 → 아차산)을 서버 DTO 모양(lng, stationId)으로 옮긴 것
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCandidatesResponse, parseItinerary, buildRouteRequestBody, parseRouteResponse } from './itineraryParser.ts';
import { ApiStatusError } from '../apiErrors.ts';
import { LIVE_ITINERARY } from './liveFixture.ts';

const origin = { name: '출발지', lat: 37.5453, lng: 127.1035 };
const dest = { name: '도착지', lat: 37.5522, lng: 127.0896 };

const subwayItinerary = () => ({
  totalTime: 206, totalDistance: 1550, totalWalkTime: 84, totalWalkDistance: 94, transferCount: 0, fare: 1550,
  legs: [
    {
      mode: 'WALK', distance: 30, sectionTime: 24,
      start: { name: '출발지', lng: 127.103521464507, lat: 37.5452991715677 },
      end: { name: '광나루', lng: 127.1038638888889, lat: 37.54526944444444 },
      steps: [{ streetName: '보행자도로', distance: 30, description: '보행자도로를 따라 30m 이동', linestring: '127.103516,37.545296 127.10383,37.545197' }],
    },
    {
      mode: 'SUBWAY', distance: 1484, sectionTime: 122, route: '수도권5호선', routeId: '110053003', routeColor: '996CAC', routeTypeCode: 5, inService: false,
      start: { name: '광나루', lng: 127.1038638888889, lat: 37.54526944444444 },
      end: { name: '아차산', lng: 127.08969166666667, lat: 37.55195277777778 },
      stations: [
        { index: 0, stationName: '광나루', stationId: '110537', lng: 127.103864, lat: 37.545269 },
        { index: 1, stationName: '아차산', stationId: '110536', lng: 127.089692, lat: 37.551953 },
      ],
    },
    {
      mode: 'WALK', distance: 64, sectionTime: 60,
      start: { name: '아차산', lng: 127.08969166666667, lat: 37.55195277777778 },
      end: { name: '도착지', lng: 127.08956495447913, lat: 37.55224917071854 },
      steps: [{ streetName: '', distance: 4, description: '4m 이동', linestring: '127.08967,37.55195 127.08968,37.551914' }],
    },
  ],
});

const busItinerary = () => ({
  totalTime: 1900, totalDistance: 5000, totalWalkTime: 300, totalWalkDistance: 400, transferCount: 0, fare: 1500,
  legs: [
    {
      mode: 'BUS', distance: 4600, sectionTime: 1500, route: '간선:402', routeId: '11000402', routeColor: '3366CC', routeTypeCode: 11, inService: true,
      start: { name: '가까운역앞', lng: 127.1, lat: 37.5 },
      end: { name: '내릴역앞', lng: 127.2, lat: 37.6 },
      stations: [
        { index: 2, stationName: 'C', stationId: 103, lng: 127.15, lat: 37.55 },
        { index: 0, stationName: 'A', stationId: '101', lng: 127.1, lat: 37.5 },
        { index: 1, stationName: 'B', stationId: '102', lng: 127.12, lat: 37.52 },
        { index: 3, stationName: 'D', stationId: '104', lng: 127.2, lat: 37.6 },
      ],
    },
  ],
});

const walkOption = { searchOption: 0, label: '도보 전용', distance: 3800, duration: 3060, crosswalks: [], stairs: [], accessibilitySummary: { noCurbCutCount: 1, noBrailleBlockCount: 0, noSoundSignalCount: 0, noPedestrianSignalCount: 0 } };

test('SUBWAY itinerary: 필드 변환 (sectionTime→durationSec, distance→distanceM, route→routeName, stations→stops)', () => {
  const c = parseItinerary(subwayItinerary());
  assert.ok(c);
  assert.equal(c.totalDurationSec, 206);
  assert.equal(c.fare, 1550);
  assert.equal(c.totalWalkDistanceM, 94);
  assert.deepEqual(c.legs.map((l) => l.mode), ['WALK', 'SUBWAY', 'WALK']);
  const [w1, sub, w2] = c.legs;
  assert.equal(w1.durationSec, 24);
  assert.equal(w1.distanceM, 30);
  assert.equal(w1.end.name, '광나루');
  assert.equal(w1.steps?.[0].distanceM, 30);
  assert.equal(sub.routeName, '수도권5호선');
  assert.equal(sub.routeColor, '996CAC');
  assert.equal(sub.inService, false);
  assert.equal(sub.passStopCount, 1);
  assert.deepEqual(sub.stops?.map((s) => [s.id, s.name]), [['110537', '광나루'], ['110536', '아차산']]);
  assert.equal(sub.stopId, undefined, '지하철은 도착정보 조회용 stopId를 두지 않는다');
  assert.equal(w2.end.name, '도착지');
});

test('BUS leg: stopId=첫 정류장, passStopCount=stations 수-1, 숫자 stationId는 문자열, index 순으로 정렬', () => {
  const c = parseItinerary(busItinerary());
  assert.ok(c);
  const bus = c.legs[0];
  assert.equal(bus.stopId, '101');
  assert.equal(bus.passStopCount, 3);
  assert.deepEqual(bus.stops?.map((s) => s.id), ['101', '102', '103', '104']);
  assert.equal(bus.alightStopId, undefined);
  assert.equal(bus.routeName, '간선:402');
  assert.equal(bus.routeTypeCode, 11);
});

test('rawItinerary는 변환 전 서버 객체 그대로 (같은 참조, 내용 불변)', () => {
  const raw = subwayItinerary();
  const snapshot = structuredClone(raw);
  const c = parseItinerary(raw);
  assert.ok(c);
  assert.equal(c.rawItinerary, raw);
  assert.deepEqual(raw, snapshot);
});

test('parseCandidatesResponse: 대중교통 후보 뒤에 walkOption이 도보 후보로 붙는다', () => {
  const list = parseCandidatesResponse({ transitOptions: [busItinerary(), subwayItinerary()], walkOption }, origin, dest);
  assert.equal(list.length, 3);
  const walk = list[2];
  assert.equal(walk.totalDurationSec, 3060);
  assert.deepEqual(walk.legs.map((l) => [l.mode, l.distanceM, l.durationSec]), [['WALK', 3800, 3060]]);
  assert.equal(walk.legs[0].start, origin);
  assert.equal(walk.legs[0].end, dest);
  assert.equal(walk.walkRoute?.searchOption, 0);
  assert.equal(list[0].walkRoute, undefined);
});

test('transitOptions가 비어 있으면 도보 후보만 남는다', () => {
  const list = parseCandidatesResponse({ transitOptions: [], walkOption }, origin, dest);
  assert.equal(list.length, 1);
  assert.ok(list[0].walkRoute);
});

test('transitOptions 누락/비배열 + walkOption 없음 → 빈 배열', () => {
  assert.deepEqual(parseCandidatesResponse({}, origin, dest), []);
  assert.deepEqual(parseCandidatesResponse({ transitOptions: 'x', walkOption: null }, origin, dest), []);
});

test('해석할 수 없는 itinerary는 통째로 버린다 (알 수 없는 mode, 좌표 없음, legs 비어 있음, totalTime 없음)', () => {
  const unknownMode = subwayItinerary();
  (unknownMode.legs[1] as { mode: string }).mode = 'TRAIN';
  const noCoord = busItinerary();
  (noCoord.legs[0].start as { lat?: number }).lat = undefined;
  const noLegs = { ...busItinerary(), legs: [] };
  const noTime = { ...busItinerary(), totalTime: undefined };
  const list = parseCandidatesResponse({ transitOptions: [unknownMode, noCoord, noLegs, noTime, busItinerary()] }, origin, dest);
  assert.equal(list.length, 1);
  assert.equal(list[0].legs[0].routeName, '간선:402');
});

test('stations가 2개 미만이면 stops를 만들지 않는다 (GPS 하차 안내 없이 수동 버튼만)', () => {
  const it = busItinerary();
  it.legs[0].stations = [it.legs[0].stations[1]];
  const bus = parseItinerary(it)?.legs[0];
  assert.equal(bus?.stops, undefined);
  assert.equal(bus?.passStopCount, undefined);
  assert.equal(bus?.stopId, '101');
});

test('응답이 객체가 아니면 ApiStatusError', () => {
  assert.throws(() => parseCandidatesResponse(null, origin, dest), ApiStatusError);
  assert.throws(() => parseCandidatesResponse([], origin, dest), ApiStatusError);
});


test('실제 서버 응답 transitOptions[0] 파싱 (BUS 환승 2구간 + 거리 0 환승 도보)', () => {
  const raw = structuredClone(LIVE_ITINERARY);
  const c = parseItinerary(LIVE_ITINERARY);
  assert.ok(c);
  assert.equal(c.rawItinerary, LIVE_ITINERARY);
  assert.deepEqual(LIVE_ITINERARY, raw, '원본 불변');
  assert.equal(c.totalDurationSec, 853);
  assert.equal(c.transferCount, 1);
  assert.equal(c.fare, 1500);
  assert.deepEqual(c.legs.map((l) => l.mode), ['WALK', 'BUS', 'WALK', 'BUS', 'WALK']);

  const [w0, bus1, wMid, bus2, w4] = c.legs;
  assert.equal(w0.end.name, '도봉구청');
  assert.equal(w0.steps?.length, 4);
  assert.equal(bus1.routeName, '간선:8146');
  assert.equal(bus1.inService, false);
  assert.equal(bus1.start.name, '도봉구청');
  assert.equal(bus1.end.name, '서울문화고등학교');
  assert.equal(bus1.stopId, '818537');
  assert.equal(bus1.passStopCount, 2);
  assert.deepEqual(bus1.stops?.map((s) => s.name), ['도봉구청', '방학1동대상타운현대삼성아파트', '서울문화고등학교']);
  assert.equal(wMid.distanceM, 0);
  assert.equal(wMid.steps, undefined, '빈 steps는 버린다');
  assert.equal(wMid.start.name, wMid.end.name);
  assert.equal(bus2.routeName, '지선:1144');
  assert.equal(bus2.inService, true);
  assert.equal(bus2.stopId, '778984');
  assert.equal(bus2.passStopCount, 5);
  assert.equal(bus2.stops?.[5].name, '노원구청');
  assert.equal(w4.end.name, '도착지');
});

test('POST /transit/route 본문: itinerary는 서버 원본을 가공 없이 그대로 (같은 참조, 직렬화해도 동일, 앱 필드명 없음)', () => {
  const raw = structuredClone(LIVE_ITINERARY);
  const [cand] = parseCandidatesResponse({ transitOptions: [LIVE_ITINERARY], walkOption }, origin, dest);
  const body = buildRouteRequestBody(cand, origin, dest);
  assert.equal(body.itinerary, LIVE_ITINERARY);
  assert.deepEqual(Object.keys(body).sort(), ['destLat', 'destLng', 'itinerary', 'startLat', 'startLng']);
  assert.deepEqual([body.startLat, body.startLng, body.destLat, body.destLng], [origin.lat, origin.lng, dest.lat, dest.lng]);
  const sent = JSON.parse(JSON.stringify(body));
  assert.deepEqual(sent.itinerary, raw);
  const text = JSON.stringify(sent.itinerary);
  assert.ok(text.includes('"sectionTime"') && text.includes('"stationId"') && text.includes('"passShape"'));
  assert.ok(!text.includes('durationSec') && !text.includes('"stops"') && !text.includes('routeName'));
});

test('POST 본문: 원본이 없는 후보(도보 후보 등)는 보내지 않는다', () => {
  const list = parseCandidatesResponse({ transitOptions: [], walkOption }, origin, dest);
  assert.throws(() => buildRouteRequestBody(list[0], origin, dest));
});

test('POST 응답 파싱: navigationId/currentLegIndex, 형식이 이상하면 ApiStatusError', () => {
  assert.deepEqual(parseRouteResponse({ navigationId: 12, routeType: 'TRANSIT', currentLegIndex: 0, currentLegState: 'WALK_TO_STOP' }), { navigationId: 12, currentLegIndex: 0 });
  assert.deepEqual(parseRouteResponse({ navigationId: '12' }), { navigationId: '12', currentLegIndex: 0 });
  assert.throws(() => parseRouteResponse({ routeType: 'TRANSIT' }), ApiStatusError);
  assert.throws(() => parseRouteResponse(null), ApiStatusError);
});
