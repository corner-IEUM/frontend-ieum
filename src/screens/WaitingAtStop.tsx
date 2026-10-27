// screens/WaitingAtStop.tsx — 정류장 대기 화면: 버스 도착 정보 목록 + 30초 재조회 + 음성/햅틱 안내
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import { speakSequence } from '../tts';
import { classifyArrivalError } from '../apiErrors';
import { DEV_MOCK_STOP_ID } from '../services/arrivalApi';
import { whenAnnouncementDone, HAPTIC } from '../transit/feedback';
import { GUIDANCE } from '../transit/guidanceMessages';
import { useArrivalPolling, ArrivalResult } from '../hooks/useArrivalPolling';
import {
  ARRIVAL_MSG, INITIAL_ANNOUNCER_MEMO, planAnnouncement, sortByArrival, isSoon, arrivalSentence,
  ArrivalErrorKind, ArrivalEvent, hasSoonArrival,
} from '../transit/arrivalAnnouncer';
import { arrivalPhase, findMyArrival } from '../transit/stageView';
import { StopArrivalView } from './StopArrivalView';

// "곧 도착" 진입 햅틱 (feedback.ts의 기본 패턴과 동일한 1회 진동)
export const SOON_HAPTIC = [0, 200];

const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function WaitingAtStopScreen({ stopName, stopId, enabled, routeName, onBusArriving }: {
  stopName: string;
  stopId: string | null;
  enabled: boolean; // WAITING_AT_STOP 상태와 연동
  routeName?: string;          // 내가 탈 노선 — 이 노선이 "곧 도착"일 때만 탑승 확인으로 자동 전이
  onBusArriving?: () => void;  // 탑승 확인(BOARDING_CONFIRM)으로 넘기는 notifyBusArriving
}) {
  const onBusArrivingRef = useRef(onBusArriving);
  onBusArrivingRef.current = onBusArriving;
  const notifiedRef = useRef(false); // 자동 전이는 한 번만
  const memoRef = useRef(INITIAL_ANNOUNCER_MEMO);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // 현재 실패 종류 (null이면 정상). 화면 문구 표시용이며 음성 중복 방지는 announcer memo가 담당
  const [errorKind, setErrorKind] = useState<ArrivalErrorKind | null>(null);

  // 조회 결과/실패 1건마다 직전 결과와 비교해 바뀐 내용만 안내
  const handleEvent = useCallback((event: ArrivalEvent) => {
    const plan = planAnnouncement(memoRef.current, event);
    memoRef.current = plan.memo;
    setErrorKind(plan.memo.errorKind);
    // 내 노선이 "곧 도착"이면 탑승 확인 상태로 자동 전이 (한 번만). 이후 안내와 햅틱은 상태 전환 안내가 대신하므로 여기서는 읽지 않는다
    if (event.type === 'success' && !notifiedRef.current && onBusArrivingRef.current && hasSoonArrival(event.arrivals, routeName)) {
      notifiedRef.current = true;
      onBusArrivingRef.current();
      return;
    }
    if (plan.haptic) Vibration.vibrate(SOON_HAPTIC);
    if (plan.texts.length === 0) return;
    (async () => {
      // 상태 전환 안내("402번 버스를 기다리는 중이에요")를 끊지 않도록 끝난 뒤 재생
      await whenAnnouncementDone();
      if (!mountedRef.current) return;
      speakSequence(plan.texts); // 내부에서 진행 중인 음성을 Speech.stop()으로 중단 후 재생
    })();
  }, [routeName]);

  const handleResult = useCallback((result: ArrivalResult) => {
    handleEvent(result.type === 'success'
      ? result
      : { type: 'error', kind: classifyArrivalError(result.error) }); // 서버 오류 / 네트워크 오류 구분
  }, [handleEvent]);

  // 개발 빌드에서만 stopId가 없어도 목 데이터로 동작 (운영에서는 null 그대로 → 정류장 정보 없음 안내)
  const effectiveStopId = stopId ?? (__DEV__ ? DEV_MOCK_STOP_ID : null);

  // 정류장 ID가 없으면 호출하지 않고 안내만 (같은 안내는 1회만 음성)
  useEffect(() => {
    if (enabled && !effectiveStopId) handleEvent({ type: 'error', kind: 'noStop' });
  }, [enabled, effectiveStopId, handleEvent]);

  const { arrivals, status, lastUpdatedAt, refetch } = useArrivalPolling({ stopId: effectiveStopId, enabled, onResult: handleResult });
  const sorted = sortByArrival(arrivals);

  // 상태 안내 문구 (에러 / 로딩) + 마지막 업데이트
  const statusText = errorKind ? ARRIVAL_MSG[errorKind] : status === 'loading' ? '도착 정보를 불러오는 중이에요' : null;
  const updatedText = lastUpdatedAt ? `마지막 업데이트 ${hhmm(lastUpdatedAt)}` : null;
  const mine = findMyArrival(sorted, routeName);
  const others = mine ? sorted.filter((a) => a.routeId !== mine.routeId) : sorted;
  // 다시 듣기: 화면 문구와 같은 문장(상태 안내 + 도착 문장)을 다시 읽는다
  const replay = () => speakSequence([GUIDANCE.waitingAtStop(routeName, 'BUS'), ...sorted.slice(0, 2).map(arrivalSentence)]);

  return (
    <StopArrivalView
      stopName={stopName}
      routeName={routeName}
      mine={mine}
      others={others}
      phase={arrivalPhase('WAITING_AT_STOP', mine)}
      statusText={statusText}
      isError={!!errorKind}
      loading={status === 'loading'}
      updatedText={updatedText}
      canRefetch={!!effectiveStopId}
      hapticPattern={mine && isSoon(mine) ? SOON_HAPTIC : HAPTIC.WAITING_AT_STOP}
      onReplay={replay}
      onBusArrived={onBusArriving}
      onRefetch={refetch}
    />
  );
}
