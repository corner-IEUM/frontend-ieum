// transit/feedback.ts — 상태 전환 시 TTS + 햅틱을 한 곳에서 처리 / Single place for TTS + haptic on UI state change
import { Vibration } from 'react-native';
import { speakAndWait } from '../tts';
import { buildGuidance } from './guidanceMessages';
import type { TransitSession } from './types';
import type { UiState } from './uiState';

// 확인이 필요한 상태는 더 강하게 / Stronger pattern when user action is needed
export const CONFIRM_PATTERN = [0, 300, 100, 300];
export const HAPTIC: Record<UiState, number[]> = {
  WALK_TO_STOP: [0, 200],
  WAITING_AT_STOP: [0, 200],
  BOARDING_CONFIRM: CONFIRM_PATTERN,
  ON_BUS: [0, 200],
  ALIGHTING_CONFIRM: CONFIRM_PATTERN,
  WALK_TO_DEST: [0, 200],
  ARRIVED: [0, 500],
  CANCELED: [0, 200],
};

// 마지막 상태 안내 TTS가 끝나면 resolve — 음성 확인이 이 뒤에 청취를 시작 / Resolves when the latest announcement ends; voice confirm listens after it
let pending: Promise<void> = Promise.resolve();
export const whenAnnouncementDone = () => pending;

// 앱 복귀 복구처럼 비동기 작업이 끝날 때까지 whenAnnouncementDone을 붙잡아 둔다 → 음성 청취가 그 뒤에 시작됨
export function holdAnnouncements(until: Promise<unknown>) {
  const prev = pending;
  pending = Promise.all([prev, until.catch(() => {})]).then(() => {});
}

// 문장 하나를 즉시 읽고 (필요하면 햅틱) 끝나면 resolve. GPS 하차 단계, 재확인, 복귀 안내에 공용 — 마이크는 whenAnnouncementDone 뒤에 켜진다
export function announceText(text: string, haptic: boolean): Promise<void> {
  pending = speakAndWait(text, true);
  if (haptic) Vibration.vibrate(CONFIRM_PATTERN);
  return pending;
}

export function announceUiState(uiState: UiState, session: TransitSession) {
  pending = speakAndWait(buildGuidance(uiState, session), true); // 상태 전환 안내는 항상 즉시 재생 / always interrupt
  Vibration.vibrate(HAPTIC[uiState]);
}
