// transit/voiceConfirm.ts — 음성 확인 청취 흐름 (STT/TTS는 주입, RN 의존성 없음) / Voice-confirm listening flow (STT/TTS injected, no RN deps)
// 흐름: 안내 TTS 종료 대기 → (권한) → 청취 8초 → 실패 시 재청취(총 3회까지) → 그래도 안 되면 버튼 안내 후 종료
import { GUIDANCE } from './guidanceMessages.ts';
import { parseConfirmIntent } from './confirmIntent.ts';
import type { ConfirmKind } from './uiState.ts';

export const LISTEN_TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 3; // 최초 1회 + 재청취 2회 / first try + two retries

// STT 라이브러리를 이 인터페이스로 감싸서 주입한다 / Wrap whatever STT library is chosen behind this interface
export interface SttAdapter {
  ensurePermission(): Promise<boolean>;   // 마이크 권한 확인 + 요청 / check and request mic permission
  listen(): Promise<string | null>;       // 인식된 문장, 무응답/실패면 null / transcript, or null on no speech/failure
  stop(): void;                           // 청취 즉시 중단 / abort listening now
  isAvailable?(): boolean;                // 이 기기/빌드에서 음성 인식을 쓸 수 있는지 (Expo Go면 false) — 음성 UI 노출 판단용 / whether STT can run here (false in Expo Go); decides if voice UI is shown
}

export interface VoiceConfirmDeps {
  stt: SttAdapter;
  waitForAnnouncement: () => Promise<void>;     // 확인 안내 TTS가 끝날 때까지 대기 / resolves when the prompt TTS finished
  speak: (text: string) => Promise<void> | void;
  onConfirm: (kind: ConfirmKind) => void;       // 버튼과 같은 confirmBoarding/confirmAlighting 호출 / same path as the buttons
}

export function createVoiceConfirm(deps: VoiceConfirmDeps) {
  let token = 0;                                 // 시작/취소마다 증가: 오래된 흐름 무효화 / bump to invalidate stale runs
  let permission: boolean | null = null;         // 한 번 거부되면 이후엔 다시 묻지 않고 음성만 끈다 / denied once → voice stays off
  let abortPending: (() => void) | null = null;

  function listenOnce(): Promise<string | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        abortPending = null;
        resolve(v);
      };
      const timer = setTimeout(() => { deps.stt.stop(); finish(null); }, LISTEN_TIMEOUT_MS);
      abortPending = () => { deps.stt.stop(); finish(null); };
      deps.stt.listen().then(finish, () => finish(null));
    });
  }

  function cancel() {
    token++;
    abortPending?.();
  }

  async function start(kind: ConfirmKind) {
    cancel();
    const t = token;
    const alive = () => t === token;

    await deps.waitForAnnouncement();
    if (!alive()) return;
    if (permission === null) {
      permission = await deps.stt.ensurePermission().catch(() => false);
      if (!alive()) return;
    }
    if (!permission) return; // 음성만 끄고 버튼은 그대로 / silently disable voice; buttons keep working

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const text = await listenOnce();
      if (!alive()) return;
      const intent = text ? parseConfirmIntent(text, kind) : 'UNKNOWN';
      if (intent === 'CONFIRM') { deps.onConfirm(kind); return; }
      if (intent === 'DENY') { await deps.speak(GUIDANCE.voiceDenied); return; } // 재청취 없이 대기 / wait without re-listening
    }
    if (alive()) await deps.speak(GUIDANCE.voiceFallback);
  }

  return { start, cancel };
}
