// transit/testFixtures.ts — 테스트 공용 세션 생성기 / Session builder shared by tests
import type { LegState, SessionStatus, TransitSession } from './types.ts';

export type Spec = [mode: 'WALK' | 'BUS', state: LegState];

export function makeSession(specs: Spec[], currentLegIndex: number, status: SessionStatus = 'IN_PROGRESS'): TransitSession {
  return {
    id: 7, status, currentLegIndex,
    legs: specs.map(([mode, state], seq) => ({
      seq, mode, state, routeName: mode === 'BUS' ? '402' : undefined,
      start: { name: `S${seq}`, lat: 0, lng: 0 }, end: { name: `E${seq}`, lat: 0, lng: 0 },
    })),
  };
}
// 도보(완료) → 버스(상태) → 도보 / walk(done) → bus(state) → walk
export const withBus = (s: LegState, currentLegIndex = 1) =>
  makeSession([['WALK', 'COMPLETED'], ['BUS', s], ['WALK', 'PENDING']], currentLegIndex);
