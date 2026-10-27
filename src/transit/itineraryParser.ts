// transit/itineraryParser.ts — 서버 candidates 응답(TransitItinerary, lng 키) → 앱 내부 TransitRouteCandidate (순수 함수, RN 의존성 없음)
// 서버 ↔ 앱 필드 변환은 이 파일에서만 한다: sectionTime→durationSec, distance→distanceM, route→routeName, stations→stops
import type { RouteCandidate } from '../api';
import { ApiStatusError } from '../apiErrors.ts';
import type { TransitLeg, TransitPlace, TransitRouteCandidate, TransitStop, WalkStep } from './types.ts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validCoord = (lat: number, lng: number) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

function parsePlace(raw: unknown): TransitPlace | null {
  if (!isObj(raw) || !isNum(raw.lat) || !isNum(raw.lng) || !validCoord(raw.lat, raw.lng)) return null;
  return { name: typeof raw.name === 'string' ? raw.name : '', lat: raw.lat, lng: raw.lng };
}

function parseSteps(raw: unknown): WalkStep[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const steps: WalkStep[] = [];
  for (const item of raw) {
    if (!isObj(item) || !isNum(item.distance) || typeof item.description !== 'string') continue;
    steps.push({
      streetName: typeof item.streetName === 'string' ? item.streetName : '',
      distanceM: item.distance,
      description: item.description,
      linestring: typeof item.linestring === 'string' ? item.linestring : '',
    });
  }
  return steps.length > 0 ? steps : undefined;
}

// stations: 승차 정류장(첫 번째) ~ 하차 정류장(마지막) 순서. 형식이 어긋난 항목은 버린다
function parseStations(raw: unknown): TransitStop[] {
  if (!Array.isArray(raw)) return [];
  const items: { index: number | null; stop: TransitStop }[] = [];
  for (const item of raw) {
    if (!isObj(item) || !isNum(item.lat) || !isNum(item.lng) || !validCoord(item.lat, item.lng)) continue;
    const id = typeof item.stationId === 'string' || isNum(item.stationId) ? String(item.stationId) : '';
    if (!id) continue;
    items.push({
      index: isNum(item.index) ? item.index : null,
      stop: { id, name: typeof item.stationName === 'string' ? item.stationName : '', lat: item.lat, lng: item.lng },
    });
  }
  if (items.every((i) => i.index != null)) items.sort((a, b) => (a.index as number) - (b.index as number));
  return items.map((i) => i.stop);
}

function parseLeg(raw: unknown): TransitLeg | null {
  if (!isObj(raw)) return null;
  const { mode } = raw;
  if (mode !== 'WALK' && mode !== 'BUS' && mode !== 'SUBWAY') return null;
  const start = parsePlace(raw.start);
  const end = parsePlace(raw.end);
  if (!start || !end) return null;
  const leg: TransitLeg = {
    mode, start, end,
    ...(isNum(raw.sectionTime) ? { durationSec: raw.sectionTime } : {}),
    ...(isNum(raw.distance) ? { distanceM: raw.distance } : {}),
  };
  if (mode === 'WALK') {
    const steps = parseSteps(raw.steps);
    if (steps) leg.steps = steps;
    return leg;
  }
  if (typeof raw.route === 'string' && raw.route !== '') leg.routeName = raw.route;
  if (typeof raw.routeId === 'string' || isNum(raw.routeId)) leg.routeId = String(raw.routeId);
  if (typeof raw.routeColor === 'string' && raw.routeColor !== '') leg.routeColor = raw.routeColor;
  if (isNum(raw.routeTypeCode)) leg.routeTypeCode = raw.routeTypeCode;
  if (typeof raw.inService === 'boolean') leg.inService = raw.inService;
  const stops = parseStations(raw.stations);
  // 승차 정류장 ID는 버스 도착정보 조회용이라 BUS만. 지하철은 도착정보가 없다
  if (mode === 'BUS' && stops.length > 0) leg.stopId = stops[0].id;
  // 하차 정류장은 stops의 마지막 항목 (alightStopId를 비워 두면 getAlightIndex가 마지막을 쓴다)
  if (stops.length >= 2) {
    leg.stops = stops;
    leg.passStopCount = stops.length - 1;
  }
  return leg;
}

// itinerary 1건 변환. legs 중 하나라도 해석할 수 없으면 경로 전체를 버린다 (일부 구간만 있는 경로로 안내하면 위험)
export function parseItinerary(raw: unknown): TransitRouteCandidate | null {
  if (!isObj(raw) || !isNum(raw.totalTime) || !Array.isArray(raw.legs) || raw.legs.length === 0) return null;
  const legs: TransitLeg[] = [];
  for (const l of raw.legs) {
    const leg = parseLeg(l);
    if (!leg) return null;
    legs.push(leg);
  }
  return {
    totalDurationSec: raw.totalTime,
    legs,
    ...(isNum(raw.totalDistance) ? { totalDistanceM: raw.totalDistance } : {}),
    ...(isNum(raw.totalWalkTime) ? { totalWalkSec: raw.totalWalkTime } : {}),
    ...(isNum(raw.totalWalkDistance) ? { totalWalkDistanceM: raw.totalWalkDistance } : {}),
    ...(isNum(raw.transferCount) ? { transferCount: raw.transferCount } : {}),
    ...(isNum(raw.fare) ? { fare: raw.fare } : {}),
    rawItinerary: raw, // 변환 전 원본 그대로 보관 (POST /transit/route의 itinerary)
  };
}

// walkOption(보행 후보) → 도보 구간 1개짜리 후보. 선택하면 walkRoute로 기존 보행 흐름을 탄다
export function parseWalkOption(raw: unknown, origin: TransitPlace, destination: TransitPlace): TransitRouteCandidate | null {
  if (!isObj(raw) || !isNum(raw.distance) || !isNum(raw.duration)) return null;
  const walkRoute: RouteCandidate = {
    searchOption: isNum(raw.searchOption) ? raw.searchOption : 0,
    label: typeof raw.label === 'string' ? raw.label : '도보 전용',
    distance: raw.distance,
    duration: raw.duration,
    crosswalks: Array.isArray(raw.crosswalks) ? (raw.crosswalks as RouteCandidate['crosswalks']) : [],
    stairs: Array.isArray(raw.stairs) ? (raw.stairs as RouteCandidate['stairs']) : [],
    accessibilitySummary: isObj(raw.accessibilitySummary)
      ? (raw.accessibilitySummary as unknown as RouteCandidate['accessibilitySummary'])
      : { noCurbCutCount: 0, noBrailleBlockCount: 0, noSoundSignalCount: 0, noPedestrianSignalCount: 0 },
  };
  return {
    totalDurationSec: raw.duration,
    legs: [{ mode: 'WALK', durationSec: raw.duration, distanceM: raw.distance, start: origin, end: destination }],
    walkRoute,
  };
}

// GET /api/navigation/transit/candidates 응답 → 후보 목록 (대중교통 후보들 + 마지막에 도보 후보). 둘 다 없으면 빈 배열
export function parseCandidatesResponse(raw: unknown, origin: TransitPlace, destination: TransitPlace): TransitRouteCandidate[] {
  if (!isObj(raw)) throw new ApiStatusError(502, '대중교통 후보 응답 형식이 올바르지 않습니다');
  const result: TransitRouteCandidate[] = [];
  if (Array.isArray(raw.transitOptions)) {
    for (const item of raw.transitOptions) {
      const c = parseItinerary(item);
      if (c) result.push(c);
    }
  }
  const walk = parseWalkOption(raw.walkOption, origin, destination);
  if (walk) result.push(walk);
  return result;
}

// POST /api/navigation/transit/route 요청 본문. itinerary는 서버가 내려준 원본(rawItinerary)을 가공 없이 그대로 보낸다 (서버가 transit_legs로 저장)
export function buildRouteRequestBody(candidate: TransitRouteCandidate, origin: TransitPlace, destination: TransitPlace) {
  if (candidate.rawItinerary === undefined) throw new Error('서버 itinerary 원본이 없는 후보는 경로로 확정할 수 없습니다');
  return {
    startLat: origin.lat, startLng: origin.lng,
    destLat: destination.lat, destLng: destination.lng,
    itinerary: candidate.rawItinerary,
  };
}

// POST 응답 { navigationId, routeType, currentLegIndex, currentLegState } → 앱에서 쓰는 값만 추출
export function parseRouteResponse(raw: unknown): { navigationId: number | string; currentLegIndex: number } {
  if (!isObj(raw) || !(isNum(raw.navigationId) || (typeof raw.navigationId === 'string' && raw.navigationId !== ''))) {
    throw new ApiStatusError(502, '경로 확정 응답 형식이 올바르지 않습니다');
  }
  return {
    navigationId: raw.navigationId as number | string,
    currentLegIndex: isNum(raw.currentLegIndex) ? raw.currentLegIndex : 0,
  };
}
