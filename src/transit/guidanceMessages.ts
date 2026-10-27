// transit/guidanceMessages.ts — 상태별 안내 문구 상수 (TTS, 접근성 라벨 공용) / Guidance text constants shared by TTS and a11y labels
import type { TransitSession } from './types.ts';
import { getCurrentLeg } from './uiState.ts';
import type { UiState } from './uiState.ts';

// 탑승 구간 이름 (버스: "402번 버스", 지하철: "수도권5호선 지하철") + 조사가 붙은 형태 / Ride-leg label and its particle forms
const rideLabel = (routeName?: string, mode?: string) =>
  mode === 'SUBWAY' ? (routeName ? `${routeName} 지하철` : '지하철') : (routeName ? `${routeName}번 버스` : '버스');
const rideObject = (routeName?: string, mode?: string) => `${rideLabel(routeName, mode)}${mode === 'SUBWAY' ? '을' : '를'}`;
const rideSubject = (routeName?: string, mode?: string) => `${rideLabel(routeName, mode)}${mode === 'SUBWAY' ? '이' : '가'}`;
// 서버가 정류장 이름을 비워 주면 일반 문구로 / Fallback when the server sends an empty stop name
export const stopName = (name?: string) => name || '정류장';

// 확인 버튼 문구 (접근성 라벨 동일) / Confirm button labels (also used as a11y labels)
export const CONFIRM_BUTTON = { boarding: '탑승했어요', alighting: '내렸어요' } as const;
export const CONFIRM_HINT = { boarding: '버스에 탑승했다고 확인합니다', alighting: '버스에서 내렸다고 확인합니다' } as const;

// ON_BUS에서 눌러 하차 확인 단계로 넘기는 버튼 — GPS 자동 전이(useAlightGuidance)가 실패할 때를 위한 대체 수단
export const NEAR_ALIGHT_BUTTON = { label: '곧 내려요', hint: '곧 내릴 정류장이라고 알립니다' } as const;

// 대기 화면의 "버스 왔어요" 수동 버튼 (접근성 라벨 동일)
export const BUS_ARRIVED_BUTTON = { label: '버스 왔어요', hint: '버스가 도착했다고 알립니다' } as const;

// 목적지 도보 구간의 "도착했어요" 수동 버튼 (접근성 라벨 동일)
export const ARRIVED_BUTTON = { label: '도착했어요', hint: '목적지에 도착했다고 알립니다' } as const;

// 상태 이름 (배지 문구, 복귀 안내에서 공용)
export const STATE_LABEL: Record<UiState, string> = {
  WALK_TO_STOP: '정류장으로 이동',
  WAITING_AT_STOP: '버스 대기',
  BOARDING_CONFIRM: '탑승 확인',
  ON_BUS: '버스 이동 중',
  ALIGHTING_CONFIRM: '하차 확인',
  WALK_TO_DEST: '목적지로 이동',
  ARRIVED: '도착',
  CANCELED: '안내 취소',
};

// GPS 하차 안내 3단계 음성 (문장마다 정보 하나)
export const ALIGHT_STAGE_GUIDANCE = {
  TWO_BEFORE: '두 정류장 뒤에 내려요.',
  ONE_BEFORE: '다음 정류장에서 내려요.',
  IMMINENT: '곧 내려요. 하차 준비하세요.',
} as const;

export const GUIDANCE = {
  walkToStop: (stop?: string) => `${stopName(stop)}까지 걸어가세요.`,
  waitingAtStop: (route?: string, mode?: string) => `${rideObject(route, mode)} 기다리는 중이에요.`,
  boardingConfirm: (route?: string, mode?: string) => `${rideSubject(route, mode)} 도착했어요. 탑승하셨나요?`,
  onBus: (stop?: string) => `탑승했어요. 내릴 곳은 ${stopName(stop)}이에요.`,
  // 문장마다 정보 하나. 버튼 이름은 실제 버튼 문구와 같아야 한다
  alightingConfirm: `이번 정류장에서 내리시나요? 내리셨으면 ${CONFIRM_BUTTON.alighting} 버튼을 눌러 주세요.`,
  // 하차 확인이 오래 없을 때 재안내 (문장 하나, 버튼 이름은 실제 버튼 문구와 같게)
  alightingReconfirm: `내리셨나요? ${CONFIRM_BUTTON.alighting} 버튼을 눌러 주세요.`,
  // 앱 백그라운드에서 돌아왔을 때 현재 단계 안내
  resumed: (stateLabel: string) => `다시 돌아왔어요. 지금은 ${stateLabel} 단계예요.`,
  walkToDest: '목적지까지 걸어가세요.',
  arrived: '목적지에 도착했어요. 수고하셨어요.', // ARRIVED 전환 안내로 한 번만 읽힘 (햅틱도 같이)
  canceled: '경로 안내가 취소됐어요.',
  // 네트워크 안내 / Network messages
  retrying: '연결이 불안정해요. 다시 시도할게요.',
  requestFailed: '연결에 실패했어요. 잠시 후 다시 눌러주세요.',
  // 음성 확인 / Voice confirm
  voiceDenied: '알겠어요. 확인되면 말씀해 주세요.',
  voiceFallback: '버튼을 눌러 확인해 주세요.',
} as const;

// 현재 화면 상태의 안내 문장 / Guidance sentence for the current UI state
export function buildGuidance(uiState: UiState, session: TransitSession): string {
  const leg = getCurrentLeg(session);
  switch (uiState) {
    case 'WALK_TO_STOP': return GUIDANCE.walkToStop(leg?.end.name);
    case 'WAITING_AT_STOP': return GUIDANCE.waitingAtStop(leg?.routeName, leg?.mode);
    case 'BOARDING_CONFIRM': return GUIDANCE.boardingConfirm(leg?.routeName, leg?.mode);
    case 'ON_BUS': return GUIDANCE.onBus(leg?.end.name);
    case 'ALIGHTING_CONFIRM': return GUIDANCE.alightingConfirm;
    case 'WALK_TO_DEST': return GUIDANCE.walkToDest;
    case 'ARRIVED': return GUIDANCE.arrived;
    case 'CANCELED': return GUIDANCE.canceled;
  }
}
