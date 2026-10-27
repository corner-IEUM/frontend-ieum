// hooks/useArrivalPolling.ts — 정류장 버스 도착 정보 주기 조회 훅 (enabled일 때만 동작)
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getArrivals } from '../services/arrivalApi';
import type { BusArrival } from '../transit/types';

export const POLL_INTERVAL_MS = 30000;

export type ArrivalStatus = 'idle' | 'loading' | 'success' | 'error';
export type ArrivalResult = { type: 'success'; arrivals: BusArrival[] } | { type: 'error'; error: unknown };

export function useArrivalPolling({ stopId, enabled, onResult }: {
  stopId: string | null;
  enabled: boolean;                          // WAITING_AT_STOP 상태일 때 true
  onResult?: (result: ArrivalResult) => void; // 조회 1건 완료마다 호출 (음성 안내 판단용)
}) {
  // 마지막 성공 데이터는 실패해도 유지
  const [arrivals, setArrivals] = useState<BusArrival[]>([]);
  // 'loading'은 첫 결과가 나오기 전에만 사용. 이후 재조회 중에는 직전 결과 상태를 유지해 화면이 깜빡이지 않게 함
  const [status, setStatus] = useState<ArrivalStatus>('idle');
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  // 폴링 세션 번호: enabled/stopId가 바뀌거나 정리될 때 올라가며, 이전 세션의 늦은 응답을 버리는 데 사용
  const runIdRef = useRef(0);
  const stopIdRef = useRef(stopId);
  stopIdRef.current = stopId;
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  // 폴링 활성 중일 때 즉시 조회 + interval 재시작하는 함수 (수동 refetch에서 사용)
  const restartRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchOnce = useCallback(async () => {
    const id = stopIdRef.current;
    if (!id || inFlightRef.current) return; // 이전 요청 진행 중이면 중복 호출하지 않음
    const run = runIdRef.current;
    inFlightRef.current = true;
    setStatus((s) => (s === 'idle' ? 'loading' : s));
    try {
      const data = await getArrivals(id);
      // 언마운트/비활성화됐거나 그 사이 정류장이 바뀌었으면 결과 무시
      if (!mountedRef.current || runIdRef.current !== run) return;
      setArrivals(data);
      setLastUpdatedAt(new Date());
      setStatus('success');
      onResultRef.current?.({ type: 'success', arrivals: data });
    } catch (error) {
      if (!mountedRef.current || runIdRef.current !== run) return;
      setStatus('error'); // 에러 상태에서도 폴링은 계속됨
      onResultRef.current?.({ type: 'error', error });
    } finally {
      if (runIdRef.current === run) inFlightRef.current = false;
    }
  }, []);

  const active = enabled && !!stopId;

  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    // 즉시 1회 조회 후 30초 간격 재조회
    const start = () => {
      stop();
      fetchOnce();
      timer = setInterval(fetchOnce, POLL_INTERVAL_MS);
    };

    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') start();
    restartRef.current = start;

    // background/inactive 진입 시 interval 해제, active 복귀 시 즉시 재조회 후 재시작 (start가 먼저 stop하므로 중복 타이머 없음)
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') { if (!timer) start(); }
      else stop();
    });

    // 정리: 상태 변경(enabled=false)/정류장 변경/화면 이탈 시 타이머 해제 + 진행 중 요청 결과 무효화
    return () => {
      stop();
      sub.remove();
      restartRef.current = null;
      runIdRef.current++;
      inFlightRef.current = false;
    };
  }, [active, stopId, fetchOnce]);

  // 수동 재조회: 폴링 중이면 interval도 다시 시작해 다음 자동 조회를 30초 뒤로 미룸. 비활성 상태에서는 아무것도 하지 않음
  const refetch = useCallback(() => {
    if (inFlightRef.current) return;
    restartRef.current?.();
  }, []);

  return { arrivals, status, lastUpdatedAt, refetch };
}
