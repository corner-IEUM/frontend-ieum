// tts.ts — 우선순위 기반 음성 안내 재생 (일반보행 실시간 감지, 길찾기 웨이포인트 안내 공용)
// expo-speech는 자체 우선순위 큐가 없어서, 위험도가 높은 메시지는 기존 발화를 끊고 즉시
// 재생하고, 일반 메시지는 이미 말하는 중이면 밀어두지 않고 건너뛴다 — 그대로 큐잉하면
// 실시간성이 떨어져 몇 초 전 상황을 뒤늦게 안내하게 되기 때문
import * as Speech from 'expo-speech';

export async function speakWithPriority(text: string, urgent: boolean) {
  try {
    if (urgent) {
      await Speech.stop();
      Speech.speak(text, { language: 'ko-KR' });
      return;
    }
    const speaking = await Speech.isSpeakingAsync();
    if (speaking) return;
    Speech.speak(text, { language: 'ko-KR' });
  } catch {
    // TTS 실패는 무시 (화면 안내는 별도로 계속 동작)
  }
}
