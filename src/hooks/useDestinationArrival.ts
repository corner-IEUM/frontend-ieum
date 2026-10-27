// hooks/useDestinationArrival.ts — WALK_TO_DEST에서만 위치를 추적해 목적지 30m 이내 연속 2회면 completeWalk를 한 번 호출
// 판정은 transit/destinationArrival.ts(순수 함수), 도착 음성·햅틱은 ARRIVED 상태 전환 안내(feedback.ts)가 한 번 처리한다
import { useEffect, useRef } from 'react';
import { useLocationTracking } from './useLocationTracking';
import { useAppActive } from './useAppActive';
import { createArrivalDetector, validDestination, type ArrivalUpdate, type LatLng } from '../transit/destinationArrival';
import type { GpsFix } from '../transit/alightGuidance';
import type { TransitNavigation } from './useTransitNavigation';

// ───────── __DEV__ 전용: 목적지 좌표가 없을 때 쓰는 가짜 목적지 + 위치 시뮬레이터 (운영 빌드에서는 사용 안 함) ─────────
const DEV_FAKE_DEST: LatLng = { lat: 37.5445, lng: 127.056 };
const SIM_START_M = 200; // 목적지에서 200m 떨어진 곳에서 시작
const SIM_SPEED_M = 20;  // 1초에 20m 접근 (약 10초 뒤 도착)
const SIM_TICK_MS = 1000;
const M_PER_DEG_LAT = 111195;

export function useDestinationArrival(nav: TransitNavigation): void {
  const { session, uiState, currentLeg } = nav;
  const navRef = useRef(nav);
  navRef.current = nav;

  // 목적지 좌표: 마지막 도보 leg의 end. 없으면 자동 판정 없음 (__DEV__에서만 가짜 목적지 + 시뮬레이터)
  const inWalkToDest = uiState === 'WALK_TO_DEST';
  const realDest = inWalkToDest ? validDestination(currentLeg?.end) : null;
  const simulating = __DEV__ && inWalkToDest && !realDest;
  const target = realDest ?? (simulating ? DEV_FAKE_DEST : null);
  const active = inWalkToDest && !!target;
  const legKey = session ? `${session.id}:${session.currentLegIndex}` : '';

  const targetRef = useRef(target);
  targetRef.current = target;

  // 백그라운드에서는 위치 구독과 시뮬레이터만 끄고, 복귀하면 다시 켠다
  const appActive = useAppActive();
  const listening = active && appActive;
  const { location, accuracy } = useLocationTracking(listening && !simulating);

  const detectorRef = useRef<ReturnType<typeof createArrivalDetector> | null>(null);
  const startedAtRef = useRef(0);
  const simMetersRef = useRef(SIM_START_M);

  const apply = (u: ArrivalUpdate) => {
    if (u.arrived) navRef.current.completeWalk(); // 도착 확정은 판정기가 한 번만 알려준다
  };

  // 판정기 생성/정리: WALK_TO_DEST를 벗어나거나 화면을 떠나면 사라진다
  useEffect(() => {
    if (!active || !targetRef.current) return;
    detectorRef.current = createArrivalDetector(targetRef.current);
    startedAtRef.current = Date.now();
    simMetersRef.current = SIM_START_M;
    return () => { detectorRef.current = null; };
  }, [active, legKey]);

  // 실제 위치 입력
  useEffect(() => {
    const detector = detectorRef.current;
    if (!detector || simulating || !location) return;
    if (location.timestamp < startedAtRef.current) return; // 활성화 전에 받은 오래된 위치는 무시
    const fix: GpsFix = { lat: location.latitude, lng: location.longitude, accuracy, timestamp: location.timestamp };
    apply(detector.push(fix));
  }, [location]); // eslint-disable-line react-hooks/exhaustive-deps

  // __DEV__ 시뮬레이터: 가짜 목적지를 향해 1초마다 접근
  useEffect(() => {
    if (!listening || !simulating) return;
    const timer = setInterval(() => {
      const detector = detectorRef.current;
      if (!detector) return;
      simMetersRef.current = Math.max(0, simMetersRef.current - SIM_SPEED_M);
      const lat = DEV_FAKE_DEST.lat - simMetersRef.current / M_PER_DEG_LAT;
      apply(detector.push({ lat, lng: DEV_FAKE_DEST.lng, accuracy: 10, timestamp: Date.now() }));
    }, SIM_TICK_MS);
    return () => clearInterval(timer);
  }, [listening, simulating, legKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
