// transit/alightGuidance.ts — GPS 하차 안내 판정 로직 (순수 함수, RN 의존성 없음)
// 진행 방향 판정 + 가장 가까운 정류장 추정 + 3단계(2정류장 전 / 1정류장 전 / 하차 임박) 안정화
import type { TransitStop } from './types.ts';
import { haversineMeters, bearingDegrees, angleDiffDegrees } from '../utils/geo.ts';

export interface GpsFix { lat: number; lng: number; accuracy: number | null; timestamp: number; }

// ───────── 상수 ─────────
export const MAX_ACCURACY_M = 50;       // 이보다 부정확한 위치는 판정에서 제외 (accuracy를 모르면 포함)
export const MIN_STEP_M = 3;            // 직전에 쓴 위치에서 이만큼도 안 움직인 위치는 제외
export const MIN_MOVE_M = 8;            // 최근 위치들의 총 이동이 이보다 작으면 방향 판정 불가
export const HEADING_WINDOW = 5;        // 방향 판정에 쓰는 최근 위치 수
export const TOWARD_MAX_DEG = 60;       // 목표 방위와 진행 방위 차이가 이 이하면 "향하는 중"
export const AWAY_MIN_DEG = 120;        // 이 이상이면 "멀어지는 중"
export const MAX_MATCH_M = 500;         // 가장 가까운 정류장이 이보다 멀면 위치 추정을 갱신하지 않음
export const IMMINENT_RADIUS_M = 100;   // 하차 임박 반경
export const STAGE_CONFIRM_COUNT = 2;   // 같은 단계 판정이 연속 이 횟수 나와야 단계를 올림

// ───────── 진행 방향 ─────────
export type Heading = 'toward' | 'away' | 'unknown';

// 정확도 낮은 위치·거의 안 움직인 위치를 제외하고, 최근 N개의 이동 방향이 target 쪽인지 판정. 판단 근거가 부족하면 'unknown'
export function judgeHeading(fixes: GpsFix[], target: { lat: number; lng: number }): Heading {
  const kept: GpsFix[] = [];
  for (const f of fixes) {
    if (f.accuracy != null && f.accuracy > MAX_ACCURACY_M) continue;
    const prev = kept[kept.length - 1];
    if (prev && haversineMeters(prev.lat, prev.lng, f.lat, f.lng) < MIN_STEP_M) continue;
    kept.push(f);
  }
  const recent = kept.slice(-HEADING_WINDOW);
  if (recent.length < 2) return 'unknown';
  const first = recent[0];
  const last = recent[recent.length - 1];
  if (haversineMeters(first.lat, first.lng, last.lat, last.lng) < MIN_MOVE_M) return 'unknown';

  const travel = bearingDegrees(first.lat, first.lng, last.lat, last.lng);
  const toTarget = bearingDegrees(last.lat, last.lng, target.lat, target.lng);
  const diff = angleDiffDegrees(travel, toTarget);
  if (diff <= TOWARD_MAX_DEG) return 'toward';
  if (diff >= AWAY_MIN_DEG) return 'away';
  return 'unknown'; // 옆으로 비껴가는 각도는 판단하지 않음
}

// ───────── 현재 정류장 추정 ─────────
// fromIndex 이상의 정류장 중 가장 가까운 것을 현재 위치로 추정 (인덱스는 감소하지 않음). 너무 멀면 fromIndex 유지
export function estimateStopIndex(pos: { lat: number; lng: number }, stops: TransitStop[], fromIndex: number): { index: number; distanceM: number } {
  let best = -1;
  let bestDist = Infinity;
  for (let i = Math.max(0, fromIndex); i < stops.length; i++) {
    const d = haversineMeters(pos.lat, pos.lng, stops[i].lat, stops[i].lng);
    if (d < bestDist) { best = i; bestDist = d; }
  }
  if (best < 0 || bestDist > MAX_MATCH_M) {
    const i = Math.min(Math.max(0, fromIndex), stops.length - 1);
    return { index: i, distanceM: haversineMeters(pos.lat, pos.lng, stops[i].lat, stops[i].lng) };
  }
  return { index: best, distanceM: bestDist };
}

// ───────── 3단계 ─────────
export type AlightStage = 'NONE' | 'TWO_BEFORE' | 'ONE_BEFORE' | 'IMMINENT';
const RANK: Record<AlightStage, number> = { NONE: 0, TWO_BEFORE: 1, ONE_BEFORE: 2, IMMINENT: 3 };

// 남은 정류장 수와 하차 정류장까지 거리로 이번 위치의 단계를 정함
export function rawStageFor(remainingStops: number, distToAlightM: number): AlightStage {
  if (distToAlightM <= IMMINENT_RADIUS_M) return 'IMMINENT';
  if (remainingStops <= 1) return 'ONE_BEFORE';
  if (remainingStops === 2) return 'TWO_BEFORE';
  return 'NONE';
}

export interface TrackerUpdate {
  accepted: boolean;            // false면 정확도 낮은 위치라 무시됨
  stopIndex: number;            // 추정한 현재 정류장 인덱스 (감소하지 않음)
  remainingStops: number;       // 하차 정류장까지 남은 정류장 수
  stage: AlightStage;           // 확정된 단계 (감소하지 않음)
  changedTo: AlightStage | null;// 이번 위치로 단계가 올라갔으면 그 단계 (단계별로 최대 1번)
  heading: Heading;
}

// 위치를 하나씩 넣어 단계를 갱신하는 판정기. stops는 승차→하차 순서, alightIndex는 하차 정류장 인덱스
export function createAlightTracker(stops: TransitStop[], alightIndex: number) {
  let idx = 0;
  let lastEstimate: number | null = null;
  let stage: AlightStage = 'NONE';
  let pending: AlightStage | null = null;
  let pendingCount = 0;
  let remaining = Math.max(0, alightIndex);
  const history: GpsFix[] = [];

  function snapshot(accepted: boolean, changedTo: AlightStage | null, heading: Heading): TrackerUpdate {
    return { accepted, stopIndex: idx, remainingStops: remaining, stage, changedTo, heading };
  }

  return {
    push(fix: GpsFix): TrackerUpdate {
      if (stops.length < 2 || alightIndex < 1) return snapshot(false, null, 'unknown');
      if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return snapshot(false, null, 'unknown'); // 튀는 위치 무시

      history.push(fix);
      if (history.length > 20) history.shift();

      // 현재 정류장 추정: 한 번에 2정류장 이상 건너뛰는 추정은 다음 위치도 같은 결과일 때만 인정 (GPS 튐 방지)
      const est = estimateStopIndex(fix, stops, idx);
      if (est.index - idx <= 1) idx = est.index;
      else if (lastEstimate != null && lastEstimate - idx > 1 && Math.abs(lastEstimate - est.index) <= 1) idx = est.index;
      lastEstimate = est.index;

      remaining = Math.max(0, alightIndex - idx);
      const alight = stops[alightIndex];
      const distToAlight = haversineMeters(fix.lat, fix.lng, alight.lat, alight.lng);
      const next = stops[Math.min(idx + 1, alightIndex)];
      const heading = judgeHeading(history, next);

      let raw = rawStageFor(remaining, distToAlight);
      if (heading === 'away' && RANK[raw] > RANK[stage]) raw = stage; // 다음 정류장에서 멀어지는 중이면 단계를 올리지 않음

      // 같은 단계 판정이 연속 STAGE_CONFIRM_COUNT회일 때만 올림, 내려가지 않음
      let changedTo: AlightStage | null = null;
      if (RANK[raw] <= RANK[stage]) {
        pending = null;
        pendingCount = 0;
      } else if (raw === pending) {
        pendingCount++;
        if (pendingCount >= STAGE_CONFIRM_COUNT) {
          stage = raw;
          changedTo = raw;
          pending = null;
          pendingCount = 0;
        }
      } else {
        pending = raw;
        pendingCount = 1;
      }
      return snapshot(true, changedTo, heading);
    },
    getStage: () => stage,
  };
}
