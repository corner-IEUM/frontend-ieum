// transit/arrivalParser.ts — 도착 정보 응답/세션 응답 정규화 + 개발용 목 데이터 (순수 함수, RN 의존성 없음)
import type { BusArrival, TransitSession } from './types.ts';
import { ApiStatusError } from '../apiErrors.ts';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// 서버 응답 [{ routeName, arrivalSec, nextArrivalSec? }] → BusArrival[]
// 배열이 아니면 서버 오류로 취급하고, 형식이 어긋난 항목은 버려서 앱이 죽지 않게 한다
export function normalizeArrivals(raw: unknown): BusArrival[] {
  if (!Array.isArray(raw)) throw new ApiStatusError(502, '도착 정보 응답 형식이 올바르지 않습니다');
  const seen = new Map<string, number>();
  const result: BusArrival[] = [];
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    if (typeof r.routeName !== 'string' || r.routeName === '' || !isNum(r.arrivalSec)) continue;
    // 같은 노선명이 여러 개면 키가 겹치지 않게 번호를 붙임
    const n = (seen.get(r.routeName) ?? 0) + 1;
    seen.set(r.routeName, n);
    result.push({
      routeId: n === 1 ? r.routeName : `${r.routeName}#${n}`,
      routeNo: r.routeName,
      arrivalSec: Math.max(0, Math.round(r.arrivalSec)),
      ...(isNum(r.nextArrivalSec) ? { nextArrivalSec: Math.max(0, Math.round(r.nextArrivalSec)) } : {}),
    });
  }
  return result;
}

// 세션 응답의 leg.stopId를 문자열로 맞춘다. 없거나 비어 있으면 필드를 제거(undefined)하고, legs가 이상해도 그대로 반환
export function normalizeSessionStopIds<T extends TransitSession>(session: T): T {
  if (!session || !Array.isArray(session.legs)) return session;
  return {
    ...session,
    legs: session.legs.map((leg) => {
      const { stopId, ...rest } = leg as typeof leg & { stopId?: unknown };
      return stopId === null || stopId === undefined || stopId === '' ? rest : { ...rest, stopId: String(stopId) };
    }),
  };
}

// __DEV__ 전용 목 데이터: 시간이 지나며 줄어들어 "시간 변경/곧 도착" 안내를 폰에서 확인할 수 있다 (5분 주기 반복)
export function buildMockArrivals(elapsedMs: number): BusArrival[] {
  const cycle = (offset: number) => 20 + (((299 - Math.floor(elapsedMs / 1000) + offset) % 300) + 300) % 300;
  return [
    { routeId: '402', routeNo: '402', arrivalSec: cycle(0), nextArrivalSec: cycle(0) + 480 },
    { routeId: '150', routeNo: '150', arrivalSec: cycle(120), nextArrivalSec: cycle(120) + 600 },
  ];
}
