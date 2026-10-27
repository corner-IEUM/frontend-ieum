// transit/localSession.ts — 클라이언트가 소유하는 대중교통 세션: 서버는 navigationId와 현재 위치만 저장하므로 전이는 여기서 계산한다 (순수 함수)
// Client-owned session: legs come from the itinerary, transitions are computed locally; legs keep the ORIGINAL indexes (the server stores the same indexes)
import type { LegState, TransitLeg, TransitSession } from './types.ts';

const activeState = (l: TransitLeg): LegState => (l.mode === 'WALK' ? 'WALKING' : 'WAITING');

// 거리 0·시간 0인 도보 구간(예: 환승 지점의 0m 도보)은 걸을 필요가 없어 자동 통과한다. 둘 다 0으로 명시된 경우만
export const isZeroWalk = (l: TransitLeg) => l.mode === 'WALK' && l.distanceM === 0 && l.durationSec === 0;

// 현재 leg를 완료하고 다음 leg로 (마지막이면 ARRIVED)
function completeCurrent(s: TransitSession): TransitSession {
  const i = s.currentLegIndex;
  const legs = s.legs.map((l, k) => (k === i ? { ...l, state: 'COMPLETED' as const } : l));
  const next = i + 1;
  if (next >= legs.length) return { ...s, status: 'ARRIVED', legs };
  legs[next] = { ...legs[next], state: activeState(legs[next]) };
  return { ...s, currentLegIndex: next, legs };
}

function skipZeroWalks(s: TransitSession): TransitSession {
  let cur = s;
  while (cur.status === 'IN_PROGRESS' && cur.legs[cur.currentLegIndex] && isZeroWalk(cur.legs[cur.currentLegIndex])) cur = completeCurrent(cur);
  return cur;
}

// itinerary legs + navigationId → 세션. currentLegIndex 앞의 leg는 완료 처리. 범위를 벗어난 인덱스는 0으로
export function createLocalSession(id: number | string, legs: TransitLeg[], currentLegIndex = 0): TransitSession {
  const cur = Number.isInteger(currentLegIndex) && currentLegIndex >= 0 && currentLegIndex < legs.length ? currentLegIndex : 0;
  return skipZeroWalks({
    id, status: 'IN_PROGRESS', currentLegIndex: cur,
    legs: legs.map((l, seq) => ({ ...l, seq, state: seq < cur ? 'COMPLETED' : seq === cur ? activeState(l) : 'PENDING' })),
  });
}

// 서버가 하던 전이를 로컬에서: RIDING(탑승 확인, 탑승 구간 WAITING에서만), COMPLETED(도보 종료 / 하차 확인). 그 외·오래된 요청은 그대로(멱등)
export function advanceLegState(session: TransitSession, legIndex: number, target: LegState): TransitSession {
  if (session.status !== 'IN_PROGRESS' || legIndex !== session.currentLegIndex) return session;
  const leg = session.legs[legIndex];
  if (!leg) return session;
  if (target === 'RIDING') {
    if (leg.mode === 'WALK' || leg.state !== 'WAITING') return session;
    return { ...session, legs: session.legs.map((l, k) => (k === legIndex ? { ...l, state: 'RIDING' as const } : l)) };
  }
  if (target === 'COMPLETED') {
    const ok = leg.mode === 'WALK' ? leg.state === 'WALKING' : leg.state === 'RIDING';
    return ok ? skipZeroWalks(completeCurrent(session)) : session;
  }
  return session;
}
