// transit/navigationController.ts — leg 상태 전환 코어 (RN/네트워크는 주입, 훅은 이것을 감싼 얇은 래퍼)
// Core leg-state machine with injected deps so it can be tested in Node; the hook is a thin wrapper.
// 클라이언트가 세션을 소유: 전이는 로컬에서 즉시 계산하고(localSession), 서버에는 PATCH를 직렬 큐로 흘려보낸다 (실패해도 로컬 진행은 막지 않음)
// Client-owned session: transitions are computed locally; the server gets PATCHes through a serial queue (failures never block local progress)
import type { ErrorKind } from '../apiErrors.ts';
import { advanceLegState } from './localSession.ts';
import type { LegState, TransitSession, TransitSessionLeg } from './types.ts';
import {
  INITIAL_FLAGS, deriveUiState, getCurrentLeg, getNextLeg, reconcileFlags,
  type UiFlags, type UiState,
} from './uiState.ts';

// 서버 PATCH /leg-state가 받는 값 (UiState 중 ARRIVED/CANCELED 제외)
export type SyncLegState = 'WALK_TO_STOP' | 'WAITING_AT_STOP' | 'BOARDING_CONFIRM' | 'ON_BUS' | 'ALIGHTING_CONFIRM' | 'WALK_TO_DEST';
export interface LegStatePatch { currentLegIndex: number; currentLegState: SyncLegState; }
const SYNC_STATES: ReadonlySet<UiState> = new Set<UiState>(['WALK_TO_STOP', 'WAITING_AT_STOP', 'BOARDING_CONFIRM', 'ON_BUS', 'ALIGHTING_CONFIRM', 'WALK_TO_DEST']);

// POST /transit/route 직후 서버가 알고 있는 상태 (계약: 항상 첫 leg, WALK_TO_STOP)
export const INITIAL_SERVER_STATE: LegStatePatch = { currentLegIndex: 0, currentLegState: 'WALK_TO_STOP' };

export interface ControllerDeps {
  patchLegState: (id: number | string, body: LegStatePatch) => Promise<void>;   // 204, 본문 없음 / no body
  classifyError: (e: unknown) => ErrorKind;
  announce: (uiState: UiState, session: TransitSession) => void;   // 상태 전환 TTS + 햅틱 / TTS + haptic on state change
  saveSessionId: (id: number | string) => void;
  clearSessionId: () => void;
  // 마지막 상태를 기기에 저장/조회 (앱 재시작·복귀 복구용) / Persist last state on device for restore
  saveSnapshot?: (session: TransitSession) => void;
  loadSnapshot?: () => Promise<TransitSession | null>;
  // 도착(ARRIVED) 시 서버에 완료 알림 (PATCH /complete {obstacleCnt:0, completed:true}). 세션당 1회, 실패해도 로컬 도착 처리는 유지
  completeRoute?: (id: number | string) => Promise<void>;
  onAuthExpired?: () => void;
  log?: (message: string, error?: unknown) => void;                // 동기화 실패는 로그만 / sync failures are only logged
}

// 복구 결과: local=메모리 또는 기기에 저장된 마지막 상태, none=복구할 것이 없어 현재 화면 유지
export type RecoverSource = 'local' | 'none';

export interface TransitNavState {
  session: TransitSession | null;
  flags: UiFlags;
  uiState: UiState | null;
  currentLeg: TransitSessionLeg | null;
  nextLeg: TransitSessionLeg | null;
}

export type TransitController = ReturnType<typeof createTransitController>;

const syncKey = (index: number, state: string) => `${index}:${state}`;

export function createTransitController(deps: ControllerDeps) {
  let session: TransitSession | null = null;
  let flags: UiFlags = INITIAL_FLAGS;
  let announcedKey: string | null = null;
  const listeners = new Set<() => void>();

  // ── 서버 동기화 상태 ──
  let tail: Promise<void> = Promise.resolve();   // PATCH 직렬 큐: 이전 요청이 끝나야 다음 요청을 보낸다 (순서 보장)
  let lastQueuedKey: string | null = null;       // 마지막으로 큐에 넣은 (legIndex:state). null이면 서버 상태를 모름
  let needsResync = false;                       // 마지막으로 큐에 넣은 PATCH가 실패했음
  const completedIds = new Set<string>();        // 도착 알림을 이미 큐에 넣은 세션 id (중복 호출 방지)

  const snapshot = (): TransitNavState => ({
    session, flags,
    uiState: deriveUiState(session, flags),
    currentLeg: getCurrentLeg(session),
    nextLeg: getNextLeg(session),
  });
  let state = snapshot();

  function handleAuth(e: unknown): boolean {
    if (deps.classifyError(e) !== 'auth') return false;
    deps.onAuthExpired?.();
    return true;
  }

  // 현재 화면 상태를 서버에 PATCH로 알린다. 로컬 전이는 기다리지 않는다 / Fire-and-forget; local progress never waits for this
  function enqueueSync(id: number | string, body: LegStatePatch) {
    const key = syncKey(body.currentLegIndex, body.currentLegState);
    lastQueuedKey = key;
    needsResync = false;
    tail = tail.then(async () => {
      try {
        await deps.patchLegState(id, body);
      } catch (e) {
        if (lastQueuedKey === key) needsResync = true;   // 이게 마지막 상태였다면 복귀/재개 때 한 번 더 맞춘다
        handleAuth(e);
        deps.log?.(`leg-state 동기화 실패 (${body.currentLegIndex}, ${body.currentLegState})`, e);
      }
    });
  }

  // 도착 알림도 같은 큐를 타서 앞선 leg-state PATCH가 모두 끝난 뒤에 나간다. 세션당 한 번만, 실패는 로그만
  function enqueueComplete(id: number | string) {
    const key = String(id);
    if (!deps.completeRoute || completedIds.has(key)) return;
    completedIds.add(key);
    const complete = deps.completeRoute;
    tail = tail.then(async () => {
      try {
        await complete(id);
      } catch (e) {
        handleAuth(e);
        deps.log?.(`도착 처리 동기화 실패 (${key})`, e);
      }
    });
  }

  function currentPatch(): LegStatePatch | null {
    if (!session || session.status !== 'IN_PROGRESS' || !state.uiState || !SYNC_STATES.has(state.uiState)) return null;
    return { currentLegIndex: session.currentLegIndex, currentLegState: state.uiState as SyncLegState };
  }

  // 서버가 아는 상태와 다를 때만 PATCH / PATCH only when the (leg, state) differs from what the server knows
  function syncIfChanged() {
    const patch = currentPatch();
    if (!session || !patch) return;
    if (syncKey(patch.currentLegIndex, patch.currentLegState) === lastQueuedKey) return;
    enqueueSync(session.id, patch);
  }

  // 복귀/재개 시: 서버 상태를 모르거나(복원 직후) 마지막 PATCH가 실패했으면 현재 상태를 한 번 더 보낸다
  function resyncIfNeeded() {
    const patch = currentPatch();
    if (!session || !patch) return;
    const differs = syncKey(patch.currentLegIndex, patch.currentLegState) !== lastQueuedKey;
    if (differs || needsResync) enqueueSync(session.id, patch);
  }

  // 상태 확정: 스냅샷 교체 → 같은 (leg, 상태)는 한 번만 안내 → 서버 동기화 → 구독자 알림 / Commit: snapshot, announce once, sync, notify
  function commit() {
    state = snapshot();
    if (session && state.uiState) {
      const key = `${session.id}:${session.currentLegIndex}:${state.uiState}`;
      if (announcedKey !== key) {
        announcedKey = key;
        deps.announce(state.uiState, session);
      }
      syncIfChanged();
    }
    listeners.forEach((l) => l());
  }

  function applyLocalSession(next: TransitSession, resetFlags = false) {
    flags = resetFlags ? INITIAL_FLAGS : reconcileFlags(session, next, flags);
    session = next;
    if (next.status === 'IN_PROGRESS') { deps.saveSessionId(next.id); deps.saveSnapshot?.(next); }
    else deps.clearSessionId();
    commit();
    if (next.status === 'ARRIVED') enqueueComplete(next.id);
  }

  // 단일 전이 경로: 허용된 화면 상태에서만, 로컬에서 즉시 계산 (같은 요청이 반복돼도 멱등)
  function transition(allowed: UiState[], target: LegState) {
    const cur = session;
    if (!cur || !state.uiState || !allowed.includes(state.uiState)) return;
    const next = advanceLegState(cur, cur.currentLegIndex, target);
    if (next !== cur) applyLocalSession(next);
  }

  // 기기에 저장된 마지막 상태로 복구. 서버 상태를 알 수 없으므로 복구 직후 PATCH 1회로 맞춘다
  function adoptSnapshot(snap: TransitSession) {
    lastQueuedKey = null;
    needsResync = false;
    applyLocalSession(snap, true);
  }

  return {
    getState: () => state,
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
    // 테스트·종료 처리용: 큐에 쌓인 PATCH가 모두 끝날 때까지 / Resolves when queued PATCHes have settled
    whenSynced: () => tail,

    // known: 서버가 이미 아는 상태 (POST 직후는 첫 leg WALK_TO_STOP). 다르면(0m 도보를 건너뛴 경우 등) 바로 PATCH 1회
    startSession: (next: TransitSession, known: LegStatePatch = INITIAL_SERVER_STATE) => {
      session = null;
      lastQueuedKey = syncKey(known.currentLegIndex, known.currentLegState);
      needsResync = false;
      applyLocalSession(next, true);
    },

    // 앱 재시작 복구: 서버 GET이 없으므로 기기에 저장된 같은 id의 진행 중 세션만 쓴다. 없으면 저장된 id를 지운다
    async restore(id: number | string): Promise<TransitSession | null> {
      if (session) return null;
      const snap = await deps.loadSnapshot?.().catch(() => null);
      if (session) return null;
      if (snap && snap.status === 'IN_PROGRESS' && String(snap.id) === String(id)) {
        adoptSnapshot(snap);
        return snap;
      }
      deps.clearSessionId();
      return null;
    },

    // 앱 복귀 시: 메모리의 마지막 상태 → 없으면 기기 저장본 → 없으면 현재 화면 유지. 서버와 달라졌을 수 있으면 PATCH 1회로 재동기화
    async recover(): Promise<{ source: RecoverSource; changed: boolean }> {
      const before = state.uiState;
      const done = (source: RecoverSource) => ({ source, changed: state.uiState !== before });
      if (session) {
        resyncIfNeeded();
        return done('local');
      }
      const snap = await deps.loadSnapshot?.().catch(() => null);
      if (!snap || snap.status !== 'IN_PROGRESS' || session) return done('none');
      adoptSnapshot(snap);
      return done('local');
    },

    // 도보 leg 종료 시 호출 (기존 도보 안내의 도착 콜백 연결점) / Call when a walk leg ends (hook point for walk guidance)
    completeWalk: () => transition(['WALK_TO_STOP', 'WALK_TO_DEST'], 'COMPLETED'),
    // 탑승 확인은 도착 안내 전(WAITING_AT_STOP)에도 가능. 지하철은 도착정보가 없어 이 경로(수동 "탑승했어요")가 정식 진입
    // Boarding is allowed before the arrival prompt too; subway has no arrival info so this manual path is the normal one
    confirmBoarding: () => transition(['WAITING_AT_STOP', 'BOARDING_CONFIRM'], 'RIDING'),
    confirmAlighting: () => transition(['ALIGHTING_CONFIRM'], 'COMPLETED'),

    // 이벤트 입력: 도착 정보 폴링 / "버스 왔어요" 버튼 / GPS 하차 안내 / "곧 내려요" 버튼이 호출. 화면 상태가 바뀌면 서버에도 PATCH된다
    notifyBusArriving: () => {
      if (state.uiState === 'WAITING_AT_STOP') { flags = { ...flags, boardingPrompt: true }; commit(); }
    },
    notifyNearAlightStop: () => {
      if (state.uiState === 'ON_BUS') { flags = { ...flags, alightingPrompt: true }; commit(); }
    },
  };
}
