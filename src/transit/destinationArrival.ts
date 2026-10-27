// transit/destinationArrival.ts — 목적지 도착 판정 (순수 함수, RN 의존성 없음)
// 목적지와의 Haversine 거리가 반경 안으로 연속 N회 판정되면 도착. 도착은 한 번만 알린다
import type { GpsFix } from './alightGuidance.ts';
import { MAX_ACCURACY_M } from './alightGuidance.ts';
import { haversineMeters } from '../utils/geo.ts';

export const ARRIVE_RADIUS_M = 30;     // 목적지 도착 반경
export const ARRIVE_CONFIRM_COUNT = 2; // 반경 안 판정이 연속 이 횟수 나와야 도착

export interface LatLng { lat: number; lng: number; }

// 목적지 좌표가 쓸 수 있는 값인지 확인. 없거나 (0,0)이거나 범위를 벗어나면 null → 자동 판정을 하지 않는다
export function validDestination(p: { lat?: unknown; lng?: unknown } | null | undefined): LatLng | null {
  if (!p) return null;
  const { lat, lng } = p;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

export interface ArrivalUpdate {
  accepted: boolean;  // false면 정확도 낮은 위치라 무시됨 (연속 횟수에 영향 없음)
  distanceM: number;  // 목적지까지 거리 (무시된 위치는 Infinity)
  arrived: boolean;   // 이번 위치로 도착이 확정되면 true — 단 한 번만
}

export function createArrivalDetector(dest: LatLng, { radiusM = ARRIVE_RADIUS_M, confirmCount = ARRIVE_CONFIRM_COUNT } = {}) {
  let count = 0;
  let fired = false;
  return {
    push(fix: GpsFix): ArrivalUpdate {
      if (fired) return { accepted: true, distanceM: haversineMeters(fix.lat, fix.lng, dest.lat, dest.lng), arrived: false };
      if (fix.accuracy != null && fix.accuracy > MAX_ACCURACY_M) return { accepted: false, distanceM: Infinity, arrived: false };
      const distanceM = haversineMeters(fix.lat, fix.lng, dest.lat, dest.lng);
      count = distanceM <= radiusM ? count + 1 : 0; // 반경 밖이면 연속 횟수 초기화
      if (count >= confirmCount) {
        fired = true;
        return { accepted: true, distanceM, arrived: true };
      }
      return { accepted: true, distanceM, arrived: false };
    },
  };
}
