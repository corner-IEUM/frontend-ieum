// transit/voiceInput.ts — 범용 음성 한 번 묻기 흐름 (STT/TTS 주입, RN 의존성 없음) / Generic "ask once by voice" flow (STT/TTS injected, no RN deps)
// 흐름: 가드 확인 → 권한 → 안내 문구 낭독 → 안내 종료 대기 → 청취 8초 → 인식 실패 시 재시도 안내(총 3회) → 그래도 안 되면 실패 안내 후 종료
import { LISTEN_TIMEOUT_MS } from './voiceConfirm.ts';
import type { SttAdapter } from './voiceConfirm.ts';
import { VOICE } from './voiceMessages.ts';

const DEFAULT_MAX_ATTEMPTS = 3; // 최초 1회 + 재시도 2회 / first try + two retries

export type VoiceInputStatus = 'ok' | 'denied' | 'unavailable' | 'failed' | 'blocked' | 'cancelled';
export type VoiceInputResult<T> = { status: 'ok'; value: T } | { status: Exclude<VoiceInputStatus, 'ok'> };

export interface VoiceInputDeps {
  stt: SttAdapter;
  announce: (text: string) => Promise<void>;          // 문장을 읽고 끝나면 resolve (feedback.announceText) / speak and resolve when done
  waitForAnnouncement: () => Promise<void>;           // 마이크는 이 뒤에 켠다 (스피커 소리 인식 방지) / mic opens after this
  canListen?: () => boolean;                          // false면 청취하지 않음 (긴급 안내 중) / false → do not listen (urgent speech playing)
}

export interface AskOptions<T> {
  prompt: string;                                     // 청취 전에 읽는 안내 / spoken before listening
  parse: (text: string) => T | null;                  // 인식 문장 → 값, 못 알아들으면 null / null when not understood
  retryPrompt?: string;
  failPrompt?: string;
  maxAttempts?: number;
}

export function createVoiceInput(deps: VoiceInputDeps) {
  let token = 0;
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

  async function ask<T>(opts: AskOptions<T>): Promise<VoiceInputResult<T>> {
    cancel();
    const t = token;
    const alive = () => t === token;
    const cancelled = { status: 'cancelled' } as const;
    const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;

    if (deps.stt.isAvailable && !deps.stt.isAvailable()) return { status: 'unavailable' };
    if (deps.canListen && !deps.canListen()) return { status: 'blocked' }; // 긴급 안내를 끊지 않도록 아무것도 읽지 않는다 / stay silent so urgent speech is not cut

    const granted = await deps.stt.ensurePermission().catch(() => false);
    if (!alive()) return cancelled;
    if (!granted) {
      await deps.announce(VOICE.denied);
      return alive() ? { status: 'denied' } : cancelled;
    }

    await deps.announce(opts.prompt);
    if (!alive()) return cancelled;
    await deps.waitForAnnouncement();
    if (!alive()) return cancelled;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (deps.canListen && !deps.canListen()) return { status: 'blocked' };
      const text = await listenOnce();
      if (!alive()) return cancelled;
      const value = text ? opts.parse(text) : null;
      if (value !== null) return { status: 'ok', value };
      if (attempt < maxAttempts - 1) {
        await deps.announce(opts.retryPrompt ?? VOICE.retry);
        if (!alive()) return cancelled;
        await deps.waitForAnnouncement();
        if (!alive()) return cancelled;
      }
    }
    await deps.announce(opts.failPrompt ?? VOICE.commandFailed);
    return alive() ? { status: 'failed' } : cancelled;
  }

  return { ask, cancel };
}
