// tts.ts — 우선순위 기반 음성 안내 (높은 우선순위는 즉시 재생, 일반은 재생 중이면 건너뜀)
import * as Speech from 'expo-speech';

// 긴급 안내 재생 추적 — 음성 입력은 긴급 안내 중에는 청취를 시작하지 않고, 진행 중이던 청취도 끊는다
// Tracks urgent speech: voice input must not start listening during it, and an active listen is cancelled
let urgentToken = 0;
let urgentActive = false;
let urgentTimer: ReturnType<typeof setTimeout> | null = null;
const urgentListeners = new Set<() => void>();

export function isUrgentSpeaking() { return urgentActive; }

export function onUrgentSpeech(listener: () => void) {
  urgentListeners.add(listener);
  return () => { urgentListeners.delete(listener); };
}

function markUrgent() {
  const id = ++urgentToken;
  urgentActive = true;
  if (urgentTimer) clearTimeout(urgentTimer);
  urgentTimer = setTimeout(() => clearUrgent(id), 15000); // 안전장치: 콜백이 안 와도 15초 후 해제 / safety release
  urgentListeners.forEach((l) => l());
  return id;
}

function clearUrgent(id: number) {
  if (id !== urgentToken) return; // 더 새로운 긴급 안내가 이미 시작됨 / a newer urgent speech took over
  urgentActive = false;
  if (urgentTimer) { clearTimeout(urgentTimer); urgentTimer = null; }
}

export async function speakWithPriority(text: string, urgent: boolean) {
  try {
    if (urgent) {
      const id = markUrgent();
      await Speech.stop();
      Speech.speak(text, { language: 'ko-KR', onDone: () => clearUrgent(id), onStopped: () => clearUrgent(id), onError: () => clearUrgent(id) });
      return;
    }
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) return;
    Speech.speak(text, { language: 'ko-KR' });
  } catch {
  }
}

// 재생/대기 중인 음성을 모두 즉시 중단 / Stop current and queued speech immediately
export async function stopSpeaking() {
  try {
    await Speech.stop();
  } catch {
  }
}

// 문장들을 순서대로 재생, onDone은 끝까지 읽었을 때만 호출 / Speak in order; onDone fires only on natural completion (not when stopped)
// onEach: i번째 문장 재생이 시작될 때 호출 (읽는 중인 후보 카드를 강조하는 화면용) / Called when the i-th sentence starts (to highlight what is being read)
export async function speakSequence(texts: string[], onDone?: () => void, onEach?: (index: number) => void) {
  try {
    await Speech.stop();
    texts.forEach((text, i) => {
      const last = i === texts.length - 1;
      Speech.speak(text, { language: 'ko-KR', onDone: last ? onDone : undefined, onStart: onEach ? () => onEach(i) : undefined });
    });
  } catch {
  }
}

// 재생이 끝날 때(완료/중단/오류)까지 기다리는 TTS — 음성 인식 시작 타이밍 제어용. 안전장치로 최대 15초 후 해제
// TTS that resolves when speech ends/stops/errors (to time STT start); safety timeout of 15s
export function speakAndWait(text: string, urgent = true): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(finish, 15000);
    (async () => {
      try {
        if (urgent) await Speech.stop();
        Speech.speak(text, { language: 'ko-KR', onDone: finish, onStopped: finish, onError: finish });
      } catch {
        finish();
      }
    })();
  });
}
