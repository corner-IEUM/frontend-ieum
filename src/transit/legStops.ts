// transit/legStops.ts — 세션 응답의 BUS leg 정류장 리스트(stops) 정규화 + 하차 정류장 인덱스 계산 (순수 함수)
import type { TransitSession, TransitStop, TransitLeg } from './types.ts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const validCoord = (lat: number, lng: number) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

// 형식이 어긋난 정류장은 버리고, 2개 미만이면 GPS 안내를 못 하므로 stops 필드 자체를 제거한다
function normalizeStops(raw: unknown): TransitStop[] | null {
  if (!Array.isArray(raw)) return null;
  const stops: TransitStop[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const id = typeof r.id === 'string' || isNum(r.id) ? String(r.id) : '';
    if (!id || !isNum(r.lat) || !isNum(r.lng) || !validCoord(r.lat, r.lng)) continue;
    stops.push({ id, name: typeof r.name === 'string' ? r.name : '', lat: r.lat, lng: r.lng });
  }
  return stops.length >= 2 ? stops : null;
}

// 세션 응답의 모든 leg에 대해 stops/alightStopId를 정리. legs가 이상해도 그대로 반환
export function normalizeSessionLegStops<T extends TransitSession>(session: T): T {
  if (!session || !Array.isArray(session.legs)) return session;
  return {
    ...session,
    legs: session.legs.map((leg) => {
      const { stops, alightStopId, ...rest } = leg as TransitLeg & { stops?: unknown; alightStopId?: unknown };
      const clean = normalizeStops(stops);
      if (!clean) return rest;
      const alightId = typeof alightStopId === 'string' || isNum(alightStopId) ? String(alightStopId) : '';
      return { ...rest, stops: clean, ...(alightId ? { alightStopId: alightId } : {}) };
    }),
  };
}

// GPS 하차 안내에 쓸 정류장 리스트: 탑승 구간(BUS/SUBWAY)의 stops(= 서버 stations)와 하차 정류장 인덱스. 도보 구간이거나 정류장이 2개 미만이면 null
export function getAlightStops(leg: Pick<TransitLeg, 'mode' | 'stops' | 'alightStopId'> | null | undefined): { stops: TransitStop[]; alightIndex: number } | null {
  if (!leg || leg.mode === 'WALK' || !leg.stops || leg.stops.length < 2) return null;
  return { stops: leg.stops, alightIndex: getAlightIndex(leg) };
}

// 하차 정류장 인덱스: alightStopId가 stops에 있으면 그 위치, 아니면 마지막 항목
export function getAlightIndex(leg: Pick<TransitLeg, 'stops' | 'alightStopId'>): number {
  const stops = leg.stops ?? [];
  if (leg.alightStopId) {
    const i = stops.findIndex((s) => s.id === leg.alightStopId);
    if (i >= 0) return i;
  }
  return stops.length - 1;
}
