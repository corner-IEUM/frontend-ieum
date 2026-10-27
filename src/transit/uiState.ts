// transit/uiState.ts — 서버 세션 + 클라이언트 전용 플래그 → 화면 상태 (순수 함수) / Derive UI state from server session + client-only flags (pure)
import type { TransitSession, TransitSessionLeg } from './types.ts';

export type UiState =
  | 'WALK_TO_STOP' | 'WAITING_AT_STOP' | 'BOARDING_CONFIRM'
  | 'ON_BUS' | 'ALIGHTING_CONFIRM' | 'WALK_TO_DEST'
  | 'ARRIVED' | 'CANCELED';

// 서버 상태는 그대로인 클라이언트 전용 프롬프트 플래그 / Client-only prompt flags (server state stays WAITING / RIDING)
export interface UiFlags { boardingPrompt: boolean; alightingPrompt: boolean; }
export const INITIAL_FLAGS: UiFlags = { boardingPrompt: false, alightingPrompt: false };

export function getCurrentLeg(session: TransitSession | null): TransitSessionLeg | null {
  return session?.legs[session.currentLegIndex] ?? null;
}
export function getNextLeg(session: TransitSession | null): TransitSessionLeg | null {
  return session?.legs[session.currentLegIndex + 1] ?? null;
}

// 서버 상태 식별 키 — 이 값이 바뀌면 플래그를 초기화 / Key of server state; flags reset when it changes
export function serverStateKey(session: TransitSession | null): string {
  if (!session) return 'none';
  return `${session.id}:${session.status}:${session.currentLegIndex}:${getCurrentLeg(session)?.state ?? '-'}`;
}

// 서버 응답이 항상 진실: 서버 상태가 바뀌었으면 플래그 초기화, 같으면(멱등 재응답) 유지 / Server is truth: reset flags on change, keep on identical response
export function reconcileFlags(prev: TransitSession | null, next: TransitSession, flags: UiFlags): UiFlags {
  return serverStateKey(prev) === serverStateKey(next) ? flags : INITIAL_FLAGS;
}

export function deriveUiState(session: TransitSession | null, flags: UiFlags): UiState | null {
  if (!session) return null;
  if (session.status === 'ARRIVED') return 'ARRIVED';
  if (session.status === 'CANCELED') return 'CANCELED';
  const leg = getCurrentLeg(session);
  if (!leg) return null;

  if (leg.mode === 'WALK') {
    const rideAhead = session.legs.slice(session.currentLegIndex + 1).some((l) => l.mode !== 'WALK');
    return rideAhead ? 'WALK_TO_STOP' : 'WALK_TO_DEST';
  }
  // BUS/SUBWAY(탑승 구간) — 플래그는 해당 서버 상태에서만 의미가 있다 / flags only apply in their matching server state
  if (leg.state === 'RIDING') return flags.alightingPrompt ? 'ALIGHTING_CONFIRM' : 'ON_BUS';
  return flags.boardingPrompt && leg.state === 'WAITING' ? 'BOARDING_CONFIRM' : 'WAITING_AT_STOP';
}

// 화면 하단 확인 버튼 노출 규칙. 탑승 버튼은 도착 안내 전(WAITING_AT_STOP)과 후(BOARDING_CONFIRM)에 같은 버튼을 유지
// Which confirm button is visible; the BOARD button stays the same across WAITING_AT_STOP and BOARDING_CONFIRM
export type ConfirmKind = 'BOARD' | 'ALIGHT';
export function getVisibleConfirmButton(uiState: UiState | null): ConfirmKind | null {
  if (uiState === 'WAITING_AT_STOP' || uiState === 'BOARDING_CONFIRM') return 'BOARD';
  if (uiState === 'ALIGHTING_CONFIRM') return 'ALIGHT';
  return null;
}

// 음성 확인 청취 대상 상태 (대기 중에는 조용해야 하므로 WAITING_AT_STOP은 제외) / States that auto-listen; WAITING_AT_STOP stays quiet
export function getVoiceConfirmKind(uiState: UiState | null): ConfirmKind | null {
  if (uiState === 'BOARDING_CONFIRM') return 'BOARD';
  if (uiState === 'ALIGHTING_CONFIRM') return 'ALIGHT';
  return null;
}
