// hooks/useVoiceConfirm.ts — BOARDING_CONFIRM/ALIGHTING_CONFIRM 진입 시 음성 확인 청취. STT 어댑터가 없으면 아무것도 하지 않는다
// Starts voice confirm on entering the confirm states; no-op when no STT adapter is provided
import { useEffect, useMemo, useRef } from 'react';
import { useAppActive } from './useAppActive';
import { speakAndWait } from '../tts';
import { whenAnnouncementDone } from '../transit/feedback';
import { createVoiceConfirm, SttAdapter } from '../transit/voiceConfirm';
import { getVoiceConfirmKind } from '../transit/uiState';
import type { TransitNavigation } from './useTransitNavigation';

export function useVoiceConfirm(nav: TransitNavigation, stt: SttAdapter | null) {
  const navRef = useRef(nav);
  navRef.current = nav;

  const flow = useMemo(() => (stt ? createVoiceConfirm({
    stt,
    waitForAnnouncement: whenAnnouncementDone,
    speak: (text) => speakAndWait(text, true),
    // 버튼과 같은 코드 경로 / same code path as the buttons
    onConfirm: (kind) => { if (kind === 'BOARD') navRef.current.confirmBoarding(); else navRef.current.confirmAlighting(); },
  }) : null), [stt]);

  const appActive = useAppActive(); // 백그라운드에서는 마이크를 끄고, 복귀하면 다시 청취
  const kind = getVoiceConfirmKind(nav.uiState);
  const legKey = nav.session ? `${nav.session.id}:${nav.session.currentLegIndex}` : '';

  // 상태 이탈/화면 이탈(언마운트) 시 cleanup으로 청취 즉시 중단 / cleanup stops listening on state change or unmount
  useEffect(() => {
    if (!flow || !kind || !appActive) return;
    flow.start(kind);
    return () => flow.cancel();
  }, [flow, kind, legKey, appActive]);

  // 버튼으로 먼저 확인(요청 시작)되면 청취 중단 / Button pressed first → stop listening
  useEffect(() => { if (nav.busy) flow?.cancel(); }, [nav.busy, flow]);
}
