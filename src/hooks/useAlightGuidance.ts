// hooks/useAlightGuidance.ts — ON_BUS에서만 GPS로 하차 정류장 접근을 판정해 3단계 음성 안내 + 하차 임박 시 ALIGHTING_CONFIRM 자동 전이
// 판정 로직은 transit/alightGuidance.ts(순수 함수)에 있고, 여기서는 위치/타이머/음성 연결만 한다
import { useEffect, useRef, useState } from 'react';
import { useLocationTracking } from './useLocationTracking';
import { useAppActive } from './useAppActive';
import { announceText } from '../transit/feedback';
import { ALIGHT_STAGE_GUIDANCE } from '../transit/guidanceMessages';
import { createAlightTracker, type GpsFix, type TrackerUpdate } from '../transit/alightGuidance';
import { haversineMeters } from '../utils/geo';
import { getAlightStops } from '../transit/legStops';
import type { TransitStop } from '../transit/types';
import type { TransitNavigation } from './useTransitNavigation';

// ───────── __DEV__ 전용: stops가 없을 때 쓰는 가짜 정류장 5개 + 위치 시뮬레이터 (운영 빌드에서는 사용 안 함) ─────────
const SIM_BASE = { lat: 37.5445, lng: 127.056 };
const SIM_STEP = 0.0027; // 정류장 간격 ≈ 300m
const DEV_FAKE_STOPS: TransitStop[] = [0, 1, 2, 3, 4].map((i) => ({
  id: `DEV_STOP_${i}`, name: `가짜 정류장 ${i + 1}`, lat: SIM_BASE.lat + i * SIM_STEP, lng: SIM_BASE.lng,
}));
const SIM_TICK_MS = 1000;
const SIM_SPEED = 0.08; // 1초에 정류장 간격의 8% (정류장 하나 지나는 데 약 12초)
const SIM_END = 4.2;

// remainingStops: 하차 정류장까지 남은 정류장 수 / alightDistanceM: 마지막으로 받아들인 GPS 위치에서 하차 정류장까지의 직선거리(m). GPS 판정 전이면 둘 다 undefined
export function useAlightGuidance(nav: TransitNavigation): { remainingStops: number | undefined; alightDistanceM: number | undefined } {
  const { session, uiState, currentLeg } = nav;
  const navRef = useRef(nav);
  navRef.current = nav;

  // 정류장 정보: 서버가 준 stops가 우선, 없으면 __DEV__에서만 가짜 정류장 (운영에서 stops가 없으면 아무것도 안 함 → 수동 "곧 내려요" 버튼만)
  const real = getAlightStops(currentLeg); // BUS/SUBWAY 탑승 구간의 stations→stops
  const realStops = real?.stops;
  const simulating = __DEV__ && !realStops;
  const stops = realStops ?? (simulating ? DEV_FAKE_STOPS : undefined);
  const alightIndex = real ? real.alightIndex : DEV_FAKE_STOPS.length - 1;
  const legKey = session ? `${session.id}:${session.currentLegIndex}` : '';

  // 켜는 조건: ON_BUS + 정류장 정보 있음. 이 값이 false가 되면 위치 추적/타이머/판정기가 모두 정리된다
  const active = uiState === 'ON_BUS' && !!stops;
  // 백그라운드에서는 위치 구독과 시뮬레이터만 끈다. 판정기(이미 안내한 단계 기록)는 유지해서 복귀 후 같은 안내를 반복하지 않는다
  const appActive = useAppActive();
  const listening = active && appActive;

  const stopsRef = useRef(stops);
  stopsRef.current = stops;
  const alightIndexRef = useRef(alightIndex);
  alightIndexRef.current = alightIndex;
  const legKeyRef = useRef(legKey);
  legKeyRef.current = legKey;

  const { location, accuracy } = useLocationTracking(listening && !simulating); // 실제 위치는 ON_BUS에서만 구독
  const trackerRef = useRef<ReturnType<typeof createAlightTracker> | null>(null);
  const startedAtRef = useRef(0);
  const simPRef = useRef(0); // 시뮬레이터 진행 위치 (백그라운드를 다녀와도 이어서 진행)
  const epochRef = useRef(0); // 판정기가 새로 만들어지거나 정리될 때 올라가며, 늦게 끝난 음성의 후속 동작(자동 전이)을 막는다
  const [remaining, setRemaining] = useState<{ key: string; value: number } | null>(null);
  const [distance, setDistance] = useState<{ key: string; value: number } | null>(null); // 하차 정류장까지 거리(m) — 새 위치 구독 없이 같은 위치 입력(fix)으로 계산

  const apply = (u: TrackerUpdate, fix: GpsFix) => {
    if (!u.accepted) return;
    const alightStop = stopsRef.current?.[alightIndexRef.current];
    if (alightStop) setDistance({ key: legKeyRef.current, value: haversineMeters(fix.lat, fix.lng, alightStop.lat, alightStop.lng) });
    setRemaining({ key: legKeyRef.current, value: u.remainingStops });
    if (!u.changedTo) return;
    const stage = u.changedTo;
    const epoch = epochRef.current;
    const done = announceText(ALIGHT_STAGE_GUIDANCE[stage as keyof typeof ALIGHT_STAGE_GUIDANCE], stage === 'IMMINENT'); // 단계마다 한 번만 (판정기가 보장)
    if (stage === 'IMMINENT') {
      // 안내가 끝난 뒤 ALIGHTING_CONFIRM으로 자동 전이 (그 사이 상태가 바뀌었거나 화면을 벗어났으면 하지 않음)
      done.then(() => { if (epochRef.current === epoch) navRef.current.notifyNearAlightStop(); });
    }
  };

  // 판정기 생성/정리
  useEffect(() => {
    if (!active || !stopsRef.current) return;
    trackerRef.current = createAlightTracker(stopsRef.current, alightIndexRef.current);
    startedAtRef.current = Date.now();
    simPRef.current = 0;
    const epoch = ++epochRef.current;
    return () => {
      trackerRef.current = null;
      if (epochRef.current === epoch) epochRef.current++;
    };
  }, [active, legKey]);

  // 실제 위치 입력
  useEffect(() => {
    const tracker = trackerRef.current;
    if (!tracker || simulating || !location) return;
    if (location.timestamp < startedAtRef.current) return; // 활성화 전에 받은 오래된 위치는 무시
    const fix: GpsFix = { lat: location.latitude, lng: location.longitude, accuracy, timestamp: location.timestamp };
    apply(tracker.push(fix), fix);
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // __DEV__ 시뮬레이터: 가짜 정류장을 따라 위치를 1초마다 이동
  useEffect(() => {
    if (!listening || !simulating) return;
    const timer = setInterval(() => {
      const tracker = trackerRef.current;
      if (!tracker) return;
      simPRef.current += SIM_SPEED;
      const p = simPRef.current;
      const fix: GpsFix = { lat: SIM_BASE.lat + p * SIM_STEP, lng: SIM_BASE.lng, accuracy: 10, timestamp: Date.now() };
      apply(tracker.push(fix), fix);
      if (p >= SIM_END) clearInterval(timer);
    }, SIM_TICK_MS);
    return () => clearInterval(timer);
  }, [listening, simulating, legKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // 배지 표시: 이번 leg의 값만, ON_BUS/ALIGHTING_CONFIRM에서만. 0이면 "남은 0정거장"이 어색해서 표시하지 않음
  const show = remaining && remaining.key === legKey && (uiState === 'ON_BUS' || uiState === 'ALIGHTING_CONFIRM') && remaining.value > 0;
  const showDistance = distance && distance.key === legKey && (uiState === 'ON_BUS' || uiState === 'ALIGHTING_CONFIRM');
  return { remainingStops: show ? remaining.value : undefined, alightDistanceM: showDistance ? distance.value : undefined };
}
