// transit/voiceMessages.ts — 음성 입력 UI 안내 문구 (TTS, 접근성 라벨 공용) / Voice-input UI messages shared by TTS and a11y labels
export const VOICE = {
  // 공통 / Common
  denied: '마이크와 음성 인식 권한이 필요해요. 설정 열기 버튼을 눌러 허용해 주세요.',
  retry: '잘 듣지 못했어요. 다시 말씀해 주세요.',
  commandFailed: '명령을 알아듣지 못했어요. 화면의 버튼을 눌러 주세요.',
  confirmRetry: '네 또는 아니요로 말씀해 주세요.',
  confirmFailed: '확인하지 못해 취소했어요. 화면의 버튼을 눌러 주세요.',
  confirmNo: '알겠어요. 시작하지 않을게요.',
  // 목적지 검색 / Place search
  searchPrompt: (noun: string) => `${noun}를 말씀해 주세요.`,
  searchFailed: '인식하지 못했어요. 직접 입력해 주세요.',
  searching: (query: string) => `${query}, 검색할게요.`,
  recognizedConfirm: (query: string) => `${query}, 맞으세요?`,
  searchError: '검색 중 오류가 발생했어요. 다시 시도해 주세요.',
  noResults: '검색 결과가 없어요. 다시 말씀하시려면 마이크 버튼을 눌러 주세요.',
  resultsPrompt: (count: number, first: string) => `검색 결과 ${count}개, 첫 번째는 ${first}. 선택하시려면 몇 번째인지 말씀해 주세요.`,
  selected: (name: string) => `${name}, 선택했어요.`,
  // 후보 / Candidates
  routePrompt: '번호를 말씀하시거나, 대중교통, 걸어서, 다시 읽어줘 중에서 말씀해 주세요.',
  confirmStart: (n: number, label: string) => `${n}번 경로, ${label}. 안내를 시작할까요?`,
  noSuchCandidate: '그 번호의 경로가 없어요.',
  noSuchMode: (mode: 'TRANSIT' | 'WALK') => (mode === 'TRANSIT' ? '대중교통 경로가 없어요.' : '도보 경로가 없어요.'),
  alreadyWalk: '지금 보시는 경로가 도보 경로예요.',
  routeCandidatesIntro: (count: number) => `경로 후보 ${count}개예요.`,
  routeCandidateItem: (n: number, label: string, duration: string, distance: string, crosswalks: number, stairs: number) =>
    `${n}번, ${label}, ${duration}, ${distance}, 횡단보도 ${crosswalks}개, 계단 ${stairs}개.`,
  // 홈 / Home
  homePrompt: '길찾기를 시작하려면 길찾기 시작이라고 말씀해 주세요.',
  startingNavigate: '길찾기를 시작할게요.',
  // 보행 / Walk
  walkPrompt: '보행을 끝내려면 보행 종료라고 말씀해 주세요.',
  confirmEndWalk: '보행을 종료하고 기록을 저장할까요?',
  walkContinue: '알겠어요. 계속 보행해요.',
  walkEnded: '보행을 종료했어요.',
  // 경로 저장 / Route save
  navigatePrompt: '경로를 저장하려면 경로 저장이라고 말씀해 주세요.',
  routeSaved: '이 경로는 내 경로에 저장되어 있어요.',
  routeNotSaved: '저장된 경로가 없어요. 경로를 다시 찾을게요.',
  needDestination: '먼저 목적지를 정해 주세요.',
} as const;
