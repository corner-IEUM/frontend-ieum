// transit/confirmIntent.ts — 음성 확인 텍스트 → 의도 (순수 함수) / Parse spoken text into a confirm intent (pure)
import type { ConfirmKind } from './uiState.ts';

export type ConfirmIntent = 'CONFIRM' | 'DENY' | 'UNKNOWN';

// 공백·문장부호 제거 후 비교해서 띄어쓰기/조사/부호 차이에 강하게 / Strip spaces & punctuation so variants match
const normalize = (text: string) => text.replace(/[\s.,!?~…'"’“”·\-]/g, '').toLowerCase();
export const normalizeSpeech = normalize; // 다른 음성 해석기(voiceCommand)와 같은 정규화를 쓴다 / shared by other parsers

// 부정 표현 (확정 키워드와 함께 나오면 이쪽이 우선) / Negations win over confirm keywords
const DENY = ['아직', '아니', '아냐', '못탔', '안탔', '못탑승', '안탑승', '못내렸', '안내렸', '못내려', '안내려', '못했', '안했', '않았', '아닌'];
// 질문/모호한 말은 확정으로 보지 않는다 / Questions are not confirmations
const AMBIGUOUS = ['어디', '언제', '몇', '뭐', '왜'];
const CONFIRM: Record<ConfirmKind, string[]> = {
  BOARD: ['탑승', '탔', '승차'],
  ALIGHT: ['내렸', '하차'],
};

export function parseConfirmIntent(text: string, kind: ConfirmKind): ConfirmIntent {
  const t = normalize(text ?? '');
  if (!t) return 'UNKNOWN';
  if (DENY.some((w) => t.includes(w))) return 'DENY';
  if (AMBIGUOUS.some((w) => t.includes(w))) return 'UNKNOWN';
  return CONFIRM[kind].some((w) => t.includes(w)) ? 'CONFIRM' : 'UNKNOWN';
}

// 예/아니오 재확인 (보행 종료·안내 시작 직전) — 부정 판정은 위의 DENY를 그대로 재사용 / Yes-no re-confirmation; negation reuses DENY above
export type YesNoIntent = 'YES' | 'NO' | 'UNKNOWN';
const NO_EXTRA = ['취소', '계속', '하지마', '싫어', '말고'];
const YES_EXACT = ['네', '예', '응', '어', '네네', '응응', '맞아', '맞아요', '맞습니다', '좋아', '좋아요', '그래', '그래요', '해줘', '해주세요', '할게', '할게요', '시작', '시작해', '시작해줘', '시작해주세요', '저장해', '저장해줘', '종료', '종료해', '종료해줘', '확인'];
const YES_PREFIX = /^(네|예|응|그래|좋아|맞)/;
const MAX_YES_NO_CHARS = 12; // 긴 문장은 대답으로 보지 않는다 / long speech is not an answer

export function parseYesNoIntent(text: string): YesNoIntent {
  const t = normalize(text ?? '');
  if (!t || t.length > MAX_YES_NO_CHARS) return 'UNKNOWN';
  if (DENY.some((w) => t.includes(w)) || NO_EXTRA.some((w) => t.includes(w))) return 'NO';
  if (AMBIGUOUS.some((w) => t.includes(w))) return 'UNKNOWN';
  return YES_EXACT.includes(t) || YES_PREFIX.test(t) ? 'YES' : 'UNKNOWN';
}
