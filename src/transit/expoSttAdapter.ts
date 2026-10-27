// transit/expoSttAdapter.ts — SttAdapter를 expo-speech-recognition(기기 내장 음성 인식, 한국어 ko-KR)으로 구현
// 네이티브 모듈이 없는 환경(Expo Go 등)에서도 앱이 죽지 않도록 모듈은 처음 쓸 때 로드한다. 없으면 음성 확인만 꺼지고 버튼은 그대로 동작
import type { SttAdapter } from './voiceConfirm';

type SpeechModule = typeof import('expo-speech-recognition').ExpoSpeechRecognitionModule;
type Subscription = { remove: () => void };

const LANG = 'ko-KR';
const RESTART_GAP_MS = 400; // abort 직후 바로 start하면 busy 오류가 날 수 있어 간격을 둔다

let cachedModule: SpeechModule | null | undefined;
function getModule(): SpeechModule | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule as SpeechModule;
  } catch (e) {
    if (__DEV__) console.warn('[음성인식] 모듈을 불러오지 못해 음성 확인을 끕니다 (개발 빌드가 필요):', e);
    cachedModule = null;
  }
  return cachedModule;
}

let abortActive: (() => void) | null = null; // 진행 중인 listen을 즉시 끝내는 함수
let lastAbortAt = 0;

export const expoSttAdapter: SttAdapter = {
  isAvailable() {
    const mod = getModule();
    if (!mod) return false;
    try { return mod.isRecognitionAvailable(); } catch { return false; }
  },

  async ensurePermission() {
    const mod = getModule();
    if (!mod) return false;
    try {
      if (!mod.isRecognitionAvailable()) {
        if (__DEV__) console.warn('[음성인식] 이 기기에서 음성 인식을 쓸 수 없어요');
        return false;
      }
      const res = await mod.requestPermissionsAsync(); // 마이크 + 음성 인식 권한
      if (__DEV__) {
        const locales = await mod.getSupportedLocales({}).catch(() => null);
        console.log('[음성인식] 권한:', res.granted, '/ ko-KR 지원:', locales ? locales.locales.some((l) => l.startsWith('ko')) : '확인 불가');
      }
      return res.granted;
    } catch {
      return false;
    }
  },

  // 한 번 듣고 인식된 문장을 돌려준다. 무음/오류/중단이면 null
  async listen() {
    const mod = getModule();
    if (!mod) return null;
    abortActive?.(); // 이전 청취가 남아 있으면 먼저 정리
    const wait = RESTART_GAP_MS - (Date.now() - lastAbortAt);
    if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));

    return new Promise<string | null>((resolve) => {
      let done = false;
      let last: string | null = null;
      const subs: Subscription[] = [];
      const finish = (value: string | null) => {
        if (done) return;
        done = true;
        subs.forEach((s) => s.remove());
        if (abortActive === abort) abortActive = null;
        if (__DEV__) console.log('[음성인식] 원문:', value); // 한국어 인식 확인용 (개발 빌드에서만 출력)
        resolve(value);
      };
      const abort = () => {
        lastAbortAt = Date.now();
        try { mod.abort(); } catch { /* 이미 끝남 */ }
        finish(null);
      };
      abortActive = abort;

      subs.push(mod.addListener('result', (e) => {
        const text = e.results?.[0]?.transcript?.trim();
        if (text) last = text;
        if (e.isFinal) finish(last);
      }));
      subs.push(mod.addListener('error', () => finish(null)));   // no-speech, network, aborted 등
      subs.push(mod.addListener('end', () => finish(last)));     // 결과 없이 끝나면 last(없으면 null)

      try {
        mod.start({ lang: LANG, interimResults: false, maxAlternatives: 1, continuous: false });
      } catch {
        finish(null);
      }
    });
  },

  // 청취 즉시 중단 (상태 변경/화면 이탈/타임아웃/버튼 확인)
  stop() {
    abortActive?.();
  },
};
