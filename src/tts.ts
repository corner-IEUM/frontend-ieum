// tts.ts — 우선순위 기반 음성 안내 재생 (일반보행 실시간 감지, 길찾기 웨이포인트 안내 공용)
// expo-speech는 자체 우선순위 큐가 없어서, 위험도가 높은 메시지는 기존 발화를 끊고 즉시
// 재생하고, 일반 메시지는 이미 말하는 중이면 밀어두지 않고 건너뛴다 — 그대로 큐잉하면
// 실시간성이 떨어져 몇 초 전 상황을 뒤늦게 안내하게 되기 때문
import * as Speech from 'expo-speech';

export async function speakWithPriority(text: string, urgent: boolean) {
  try {
    const speaking = await Speech.isSpeakingAsync();
    if (urgent) {
      // 말하는 중이 아닐 때도 습관적으로 stop()을 호출하면, 일부 기기에서 stop 직후 바로
      // speak을 호출할 때 오디오 세션이 안정되기 전에 재생이 시작돼 초반부가 지지직거리는
      // 문제가 있었다 — 실제로 끊어야 할 때(말하는 중일 때)만 stop 한다.
      if (speaking) await Speech.stop();
      Speech.speak(text, { language: 'ko-KR' });
      return;
    }
    if (speaking) return;
    Speech.speak(text, { language: 'ko-KR' });
  } catch {
    // TTS 실패는 무시 (화면 안내는 별도로 계속 동작)
  }
}
