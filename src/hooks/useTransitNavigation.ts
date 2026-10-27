// hooks/useTransitNavigation.ts — 대중교통 안내 leg 상태 훅. 로직은 transit/navigationController.ts에 있고 여기서는 RN 연결만 한다
// Thin React wrapper: wires the controller to API, TTS/haptic, storage, AppState
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import {
  patchLegState, completeNavigation, getTransitSessionId, saveTransitSessionId, clearTransitSessionId,
  saveTransitSnapshot, getTransitSnapshot, clearTransitSnapshot,
} from '../api';
import { classifyApiError } from '../apiErrors';
import { announceUiState, announceText, holdAnnouncements, whenAnnouncementDone } from '../transit/feedback';
import { GUIDANCE, STATE_LABEL } from '../transit/guidanceMessages';
import { startReconfirm } from '../transit/reconfirm';
import { createTransitController, TransitController } from '../transit/navigationController';
import type { TransitSession } from '../transit/types';

// 이 시간 이상 앱을 떠나 있었을 때만 "다시 돌아왔어요" 안내 (알림창 내리기 같은 짧은 전환은 조용히)
const MIN_AWAY_MS = 3000;

export function useTransitNavigation({ enabled, onAuthExpired, onRestored }: {
  enabled: boolean;                                  // 로그인 상태일 때만 복구 / restore only when authed
  onAuthExpired?: () => void;
  onRestored?: (session: TransitSession) => void;    // 복구된 진행 중 세션 알림 / called with restored in-progress session
}) {
  const cbRef = useRef({ onAuthExpired, onRestored });
  cbRef.current = { onAuthExpired, onRestored };

  const ctrlRef = useRef<TransitController | null>(null);
  if (!ctrlRef.current) {
    ctrlRef.current = createTransitController({
      patchLegState,
      completeRoute: (id) => completeNavigation(Number(id), 0, true),   // 도착 시 1회 (obstacleCnt 0, completed true)
      classifyError: classifyApiError,
      announce: announceUiState,
      log: (message, error) => { console.warn(`[대중교통] ${message}`, error); },   // 동기화 실패는 로그만 (로컬 진행은 계속)
      saveSessionId: (id) => { saveTransitSessionId(id).catch(() => {}); },
      clearSessionId: () => { clearTransitSessionId().catch(() => {}); clearTransitSnapshot().catch(() => {}); },
      saveSnapshot: (s) => { saveTransitSnapshot(s).catch(() => {}); },
      loadSnapshot: () => getTransitSnapshot().catch(() => null),
      onAuthExpired: () => cbRef.current.onAuthExpired?.(),
    });
  }
  const ctrl = ctrlRef.current;
  const state = useSyncExternalStore(ctrl.subscribe, ctrl.getState);

  // 앱 재시작 시 저장된 세션 id로 복구 / Restore from stored id after app restart
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const id = await getTransitSessionId().catch(() => null);
      if (!id || cancelled) return;
      const restored = await ctrl.restore(id);
      if (restored && !cancelled) cbRef.current.onRestored?.(restored);
    })();
    return () => { cancelled = true; };
  }, [enabled, ctrl]);

  // 앱이 background/inactive → active로 돌아오면 상태 복구: 서버 최신 상태 → 저장된 마지막 상태 → 없으면 현재 화면 유지
  // 도착 폴링/위치 추적/음성 청취의 중단·재시작은 각 훅이 AppState로 처리하고, 여기서는 복구와 복귀 안내(한 번)만 한다
  // Recover on resume; polling/GPS/mic hooks stop and restart themselves via AppState
  useEffect(() => {
    if (!enabled) return;
    let leftAt: number | null = null;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { if (leftAt == null) leftAt = Date.now(); return; }
      if (leftAt == null) return;
      const awayMs = Date.now() - leftAt;
      leftAt = null;
      const hadSession = !!ctrl.getState().session;
      const recovery = (async () => {
        const { source, changed } = await ctrl.recover();
        const s = ctrl.getState();
        if (!hadSession && s.session?.status === 'IN_PROGRESS') cbRef.current.onRestored?.(s.session);
        // 상태가 바뀌었으면 상태 전환 안내가 이미 읽으므로 복귀 안내는 생략 / a state-change announcement already covers it
        if (source === 'none' || changed || awayMs < MIN_AWAY_MS || s.session?.status !== 'IN_PROGRESS' || !s.uiState) {
          await whenAnnouncementDone();
          return;
        }
        await announceText(GUIDANCE.resumed(STATE_LABEL[s.uiState]), false);
      })().catch(() => {}); // 복구 실패해도 앱은 현재 상태로 계속 (수동 버튼은 그대로 사용 가능)
      // 복구/안내가 끝날 때까지 음성 청취 시작을 미룬다 (스피커 소리를 인식하는 오작동 방지)
      holdAnnouncements(recovery);
    });
    return () => sub.remove();
  }, [ctrl, enabled]);

  // 하차 확인(ALIGHTING_CONFIRM)이 오래 없으면 60초 간격으로 최대 3회 재안내 (음성 + 햅틱). 확인/상태 변경/화면 이탈 시 타이머 즉시 정리
  const legKey = state.session ? `${state.session.id}:${state.session.currentLegIndex}` : '';
  useEffect(() => {
    if (state.uiState !== 'ALIGHTING_CONFIRM') return;
    return startReconfirm(() => {
      announceText(GUIDANCE.alightingReconfirm, true);
    });
  }, [state.uiState, legKey, ctrl]);

  return {
    session: state.session, uiState: state.uiState, currentLeg: state.currentLeg, nextLeg: state.nextLeg, busy: false, // 전이는 로컬에서 즉시 끝나고 PATCH는 기다리지 않으므로 항상 false (기존 화면 props 호환)
    startSession: ctrl.startSession, completeWalk: ctrl.completeWalk,
    confirmBoarding: ctrl.confirmBoarding, confirmAlighting: ctrl.confirmAlighting,
    notifyBusArriving: ctrl.notifyBusArriving, notifyNearAlightStop: ctrl.notifyNearAlightStop,
  };
}

export type TransitNavigation = ReturnType<typeof useTransitNavigation>;
