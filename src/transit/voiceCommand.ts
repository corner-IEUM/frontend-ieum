// transit/voiceCommand.ts — 화면별 음성 명령 해석 (순수 함수, RN 의존성 없음) / Per-screen voice command parsing (pure, no RN deps)
// 오인식 방지: 정확한 키워드 포함 + 길이 제한 + 부정어 제외, 화면별 허용 목록 밖의 명령은 무시한다. "경로" 같은 일반 명사 단독은 명령이 아니다
import { normalizeSpeech } from './confirmIntent.ts';

export type VoiceScreen = 'placeSearch' | 'routeCandidates' | 'transitCandidates' | 'home' | 'walk' | 'navigate';

export type VoiceCommand =
  | { type: 'SELECT'; index: number }                 // 0부터 시작하는 후보/결과 위치 / 0-based position
  | { type: 'MODE'; mode: 'TRANSIT' | 'WALK' }
  | { type: 'REPEAT' }
  | { type: 'START' }
  | { type: 'END_WALK' }
  | { type: 'SAVE_ROUTE' };
export type VoiceCommandType = VoiceCommand['type'];

// 화면별 허용 명령 (앞쪽이 우선) / Allowed commands per screen; earlier entries win on overlap
export const ALLOWED_COMMANDS: Record<VoiceScreen, readonly VoiceCommandType[]> = {
  placeSearch: ['SELECT'],
  routeCandidates: ['SELECT', 'MODE', 'REPEAT', 'START'],
  transitCandidates: ['SELECT', 'MODE', 'REPEAT', 'START'],
  home: ['START'],
  walk: ['END_WALK'],
  navigate: ['SAVE_ROUTE'],
};

export const MAX_COMMAND_CHARS = 16; // 공백·부호 제거 후 글자 수 상한: 긴 문장(주변 대화)은 명령으로 보지 않는다
export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 40;

// 이 말이 섞이면 명령으로 보지 않는다 ("버스 말고 걸어서" 같은 번복) / Negations cancel a command
const NEGATIVE = ['말고', '하지마', '싫어', '취소', '아니'];
const includesAny = (t: string, words: readonly string[]) => words.some((w) => t.includes(w));

const ORDINAL_PATTERNS: readonly (readonly [1 | 2 | 3, RegExp])[] = [
  [1, /첫번째|첫째|일번째|일번|(?:^|[^0-9])1번/],
  [2, /두번째|둘째|이번째|(?:^|[^0-9])2번/],
  [3, /세번째|셋째|삼번째|삼번|(?:^|[^0-9])3번/],
];

// "첫 번째/두 번째/세 번째" → 1~3, 불명확하거나 둘 이상 섞이면 null / Ordinal 1..3, null if unclear or mixed
export function parseOrdinalIntent(text: string): 1 | 2 | 3 | null {
  const t = normalizeSpeech(text ?? '');
  if (!t || t.length > MAX_COMMAND_CHARS || includesAny(t, NEGATIVE)) return null;
  const hits = ORDINAL_PATTERNS.filter(([, re]) => re.test(t));
  return hits.length === 1 ? hits[0][0] : null;
}

const REPEAT_WORDS = ['다시읽어', '다시말해', '다시들려', '다시들을', '다시듣', '한번더읽', '다시한번'];
const START_WORDS = ['길찾기시작', '안내시작', '출발'];
const END_WALK_WORDS = ['보행종료', '보행끝', '보행그만', '산책종료'];
const END_WALK_EXACT = ['종료', '끝', '그만', '그만해', '그만할래', '끝내', '끝내줘', '종료해', '종료해줘'];
const SAVE_ROUTE_WORDS = ['경로저장', '경로를저장', '길저장', '내경로에저장'];
const TRANSIT_WORDS = ['버스', '대중교통', '지하철'];
const WALK_WORDS = ['걸어서', '걸어가', '도보', '걸을래'];

const DETECTORS: Record<VoiceCommandType, (t: string) => VoiceCommand | null> = {
  SELECT: (t) => {
    const n = parseOrdinalIntent(t);
    return n ? { type: 'SELECT', index: n - 1 } : null;
  },
  MODE: (t) => {
    const transit = includesAny(t, TRANSIT_WORDS);
    const walk = includesAny(t, WALK_WORDS);
    if (transit === walk) return null; // 둘 다 없거나 둘 다 있으면 모호 / neither or both → ambiguous
    return { type: 'MODE', mode: transit ? 'TRANSIT' : 'WALK' };
  },
  REPEAT: (t) => (includesAny(t, REPEAT_WORDS) ? { type: 'REPEAT' } : null),
  START: (t) => (includesAny(t, START_WORDS) && !t.includes('출발지') ? { type: 'START' } : null),
  END_WALK: (t) => (includesAny(t, END_WALK_WORDS) || END_WALK_EXACT.includes(t) ? { type: 'END_WALK' } : null),
  SAVE_ROUTE: (t) => (includesAny(t, SAVE_ROUTE_WORDS) ? { type: 'SAVE_ROUTE' } : null),
};

// 해당 화면에서 허용된 명령만 해석한다. 허용되지 않았거나 확신이 없으면 null / Only commands allowed on this screen; null if not confident
export function parseVoiceCommand(screen: VoiceScreen, text: string): VoiceCommand | null {
  const t = normalizeSpeech(text ?? '');
  if (!t || t.length > MAX_COMMAND_CHARS || includesAny(t, NEGATIVE)) return null;
  for (const type of ALLOWED_COMMANDS[screen]) {
    const cmd = DETECTORS[type](t);
    if (cmd) return cmd;
  }
  return null;
}

// 목적지 받아쓰기 결과 → 검색어. 비었거나 1글자거나 너무 길면 null (검색하지 않음) / Dictation → search query; null if empty, 1 char or too long
const SEARCH_SUFFIX = /\s*(?:검색해|검색|찾아)\s*(?:줘|주세요|줘요|봐줘)?\s*$/;
export function parseSearchQuery(text: string): string | null {
  let q = (text ?? '').replace(/\s+/g, ' ').trim();
  const stripped = q.replace(SEARCH_SUFFIX, '').trim();
  if (stripped.replace(/\s/g, '').length >= MIN_QUERY_CHARS) q = stripped;
  if (!/[가-힣a-zA-Z0-9]/.test(q)) return null;
  const len = q.replace(/\s/g, '').length;
  return len >= MIN_QUERY_CHARS && len <= MAX_QUERY_CHARS ? q : null;
}
