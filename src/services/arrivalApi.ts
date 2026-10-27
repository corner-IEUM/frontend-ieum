// services/arrivalApi.ts — 정류장 버스 도착 정보 조회 API
import { authFetch, ApiStatusError } from '../api';
import type { BusArrival } from '../transit/types';
import { normalizeArrivals, buildMockArrivals } from '../transit/arrivalParser';

// stopId가 없을 때 __DEV__에서 대신 쓰는 값 (네트워크를 호출하지 않고 목 데이터 사용)
export const DEV_MOCK_STOP_ID = '__DEV_MOCK__';
const MOCK_STARTED_AT = Date.now();

// 에러 응답 본문의 message를 읽는다 (없거나 JSON이 아니면 기본 문구)
async function readErrorMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.message === 'string' && body.message) return body.message;
  } catch { /* 본문이 JSON이 아님 */ }
  return '버스 도착 정보 조회에 실패했습니다';
}

// 정류장의 버스 도착 정보 조회 (JWT 인증 필요, authFetch가 Bearer 헤더 적용)
// 백엔드 연동 지점: GET /api/transit/arrivals?stopId={stopId}
//   응답: [{ routeName: string, arrivalSec: number, nextArrivalSec?: number }]
//   실패: HTTP 에러 코드 + { message }
export async function getArrivals(stopId: string): Promise<BusArrival[]> {
  if (__DEV__ && stopId === DEV_MOCK_STOP_ID) return buildMockArrivals(Date.now() - MOCK_STARTED_AT);
  try {
    const res = await authFetch(`/api/transit/arrivals?stopId=${encodeURIComponent(stopId)}`);
    if (!res.ok) throw new ApiStatusError(res.status, await readErrorMessage(res));
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ApiStatusError(res.status, '도착 정보 응답을 읽지 못했습니다');
    }
    return normalizeArrivals(body);
  } catch (e) {
    // 개발 빌드에서만: 백엔드가 없어도 폰에서 화면을 확인할 수 있게 목 데이터로 대체. 운영 빌드(__DEV__=false)에서는 그대로 에러
    if (__DEV__) {
      console.warn('[도착정보] 호출 실패, 목 데이터 사용:', e);
      return buildMockArrivals(Date.now() - MOCK_STARTED_AT);
    }
    throw e;
  }
}
