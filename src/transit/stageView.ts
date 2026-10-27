// transit/stageView.ts — 대중교통 안내 화면(정류장 도착/탑승 알림/정류장 타임라인/하차 임박/도보 전환)용 표시 값 계산 (순수 함수, RN 의존성 없음)
// 입력은 모두 기존 로직이 내보내는 실제 값(세션 leg, TAGO 도착 결과, GPS 위치, remainingStops)이다. 여기서 만들어 내는 값은 없다 / Derives view values only from real logic outputs; no mock data
import type { BusArrival, TransitSessionLeg } from './types.ts';
import type { UiState } from './uiState.ts';
import { isSoon } from './arrivalAnnouncer.ts';
import { getAlightIndex } from './legStops.ts';
import { stopName } from './guidanceMessages.ts';
import { haversineMeters, bearingDegrees } from '../utils/geo.ts';

// ───────── 3단계 스텝 (경로 탐색 → 탑승 지원 → 이동 안내) ─────────
export const STAGE_LABELS = ['경로 탐색', '탑승 지원', '이동 안내'] as const;
export type StageNo = 1 | 2 | 3;

// 안내 중 상태가 속한 단계. 1단계(경로 탐색)는 후보 화면이 직접 쓴다 / Stage 1 is used by the candidates screen itself
export function stageForUiState(uiState: UiState | null): StageNo | null {
  switch (uiState) {
    case 'WALK_TO_STOP': case 'WAITING_AT_STOP': case 'BOARDING_CONFIRM': return 2;
    case 'ON_BUS': case 'ALIGHTING_CONFIRM': case 'WALK_TO_DEST': case 'ARRIVED': return 3;
    default: return null;
  }
}

// 대중교통(버스/지하철 탑승)이 포함된 경로인지 — 도보 전용은 3단계 스텝을 보이지 않는다 / Stepper only for routes with a ride leg
export const hasTransitLeg = (legs: readonly { mode: string }[] | null | undefined) => !!legs && legs.some((l) => l.mode !== 'WALK');

// ───────── 정류장 도착 (접근 중 / 곧 도착 / 도착함) ─────────
export type ArrivalPhase = 'APPROACHING' | 'SOON' | 'ARRIVED';
export const PHASE_ORDER: readonly ArrivalPhase[] = ['APPROACHING', 'SOON', 'ARRIVED'];
export const PHASE_LABEL: Record<ArrivalPhase, string> = { APPROACHING: '접근 중', SOON: '곧 도착', ARRIVED: '도착함' };

const normalizeRoute = (r: string) => r.trim().replace(/번$/, '').trim();

// 내가 탈 노선의 도착 정보 (없으면 null) / Arrival entry of the route I will ride
export function findMyArrival(arrivals: BusArrival[], routeName?: string): BusArrival | null {
  if (!routeName) return null;
  const target = normalizeRoute(routeName);
  return arrivals.find((a) => normalizeRoute(a.routeNo) === target) ?? null;
}

// BOARDING_CONFIRM이면 도착함, 아니면 TAGO 결과로 곧 도착(1분 이내)/접근 중 / ARRIVED once boarding is confirmed, else SOON/APPROACHING from TAGO
export function arrivalPhase(uiState: UiState | null, mine: BusArrival | null): ArrivalPhase {
  if (uiState === 'BOARDING_CONFIRM') return 'ARRIVED';
  return mine && isSoon(mine) ? 'SOON' : 'APPROACHING';
}

// ───────── 정류장 타임라인 (이전 → 현재 → 다음) ─────────
export interface RideTimeline {
  prev: string | null;
  current: string;
  next: string | null;
  alight: string;
  remainingStops: number | null;   // 하차 정류장까지 남은 정류장 수 (GPS 판정 전이면 null)
  currentKnown: boolean;           // false면 아직 GPS로 현재 정류장을 모름 → current는 승차 정류장
}

// 정류장 리스트(서버 stops)가 없거나 2개 미만이면 null → 호출 쪽에서 타임라인 없이 문구만 표시
export function rideTimeline(leg: Pick<TransitSessionLeg, 'stops' | 'alightStopId'> | null | undefined, remainingStops: number | undefined): RideTimeline | null {
  const stops = leg?.stops;
  if (!leg || !stops || stops.length < 2) return null;
  const alightIndex = getAlightIndex(leg);
  const known = remainingStops != null;
  const cur = known ? Math.min(alightIndex, Math.max(0, alightIndex - remainingStops)) : 0;
  const name = (i: number) => (i >= 0 && i < stops.length ? stopName(stops[i].name) : null);
  return {
    prev: name(cur - 1),
    current: stopName(stops[cur].name),
    next: cur < alightIndex ? name(cur + 1) : null,
    alight: stopName(stops[alightIndex].name),
    remainingStops: known ? remainingStops : null,
    currentKnown: known,
  };
}

// ───────── 진동 패턴 표시 (실제로 울리는 패턴과 같은 배열을 받는다) ─────────
export interface HapticSegment { kind: 'buzz' | 'gap'; ms: number; }

// [대기, 진동, 대기, 진동…] → 막대 구간. 맨 앞 대기(0)는 생략 / Vibration pattern array → bars, leading wait dropped
export function hapticSegments(pattern: readonly number[]): HapticSegment[] {
  return pattern
    .map((ms, i): HapticSegment => ({ kind: i % 2 === 1 ? 'buzz' : 'gap', ms }))
    .filter((s, i) => s.ms > 0 && !(i === 0 && s.kind === 'gap'));
}
export const hapticLabel = (pattern: readonly number[]) => `진동 ${hapticSegments(pattern).filter((s) => s.kind === 'buzz').length}회`;

// ───────── 하차 임박: 하차 정류장까지 남은 거리 ─────────
// 10m 단위 반올림, 1km 이상이면 km(소수 1자리, 정수면 생략). 값이 없거나 계산 불가(NaN/음수/무한대)면 null → 호출 쪽이 줄을 숨긴다
export function formatAlightDistance(m: number | null | undefined): string | null {
  if (m == null || !Number.isFinite(m) || m < 0) return null;
  const rounded = Math.round(m / 10) * 10;
  if (rounded < 1000) return `${rounded}m`;
  const km = Math.round(rounded / 100) / 10;
  return `${Number.isInteger(km) ? km : km.toFixed(1)}km`;
}
export const alightDistanceText = (m: number | null | undefined): string | null => {
  const d = formatAlightDistance(m);
  return d ? `정류장 남음 · 약 ${d}` : null;
};

// ───────── 하차 후 도보 전환: 목적지까지 남은 거리/방향 ─────────
const COMPASS = ['북쪽', '북동쪽', '동쪽', '남동쪽', '남쪽', '남서쪽', '서쪽', '북서쪽'] as const;
export const compassText = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export interface WalkRemain { distanceM: number; direction: string; }
export function walkRemain(from: { latitude: number; longitude: number } | null | undefined, to: { lat: number; lng: number } | null | undefined): WalkRemain | null {
  if (!from || !to || !Number.isFinite(to.lat) || !Number.isFinite(to.lng)) return null;
  return {
    distanceM: haversineMeters(from.latitude, from.longitude, to.lat, to.lng),
    direction: compassText(bearingDegrees(from.latitude, from.longitude, to.lat, to.lng)),
  };
}
