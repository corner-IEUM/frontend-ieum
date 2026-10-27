// transit/arrivalAnnouncer.ts — 도착 정보 조회 결과 → 음성 안내/햅틱 결정 (순수 함수, RN 의존성 없음)
import type { BusArrival } from './types.ts';
import { formatDurationKo } from './format.ts';

// 실패 종류별 안내 문구 (화면/음성 공용). 문장마다 정보 하나
export type ArrivalErrorKind = 'noStop' | 'server' | 'network';
export const ARRIVAL_MSG: Record<ArrivalErrorKind | 'recovered', string> = {
  noStop: '정류장 정보가 없어요. 도착 정보를 확인할 수 없어요.',
  server: '도착 정보를 불러오지 못했어요. 잠시 후 다시 확인할게요.',
  network: '네트워크 연결을 확인해 주세요. 잠시 후 다시 확인할게요.',
  recovered: '도착 정보를 다시 불러왔어요.',
};

// "곧 도착" 기준: 1분 이내
export const SOON_THRESHOLD_SEC = 60;
// 음성 안내 대상: 도착 임박 순 최대 2건
const MAX_ANNOUNCE = 2;

export const isSoon = (a: BusArrival) => a.arrivalSec <= SOON_THRESHOLD_SEC;

// 남은 시간 표시 문구 ("곧 도착" 또는 "3분"). 분 단위로 반올림되므로 이 값이 바뀔 때만 '시간 변경'으로 본다
export const arrivalTimeText = (a: BusArrival) => (isSoon(a) ? '곧 도착' : formatDurationKo(a.arrivalSec));

export function arrivalSentence(a: BusArrival): string {
  return isSoon(a)
    ? `${a.routeNo}번 버스가 곧 도착합니다`
    : `${a.routeNo}번 버스가 ${formatDurationKo(a.arrivalSec)} 후 도착합니다`;
}

// 다음 버스 표시 문구: "다음 버스 12분 후" (정보가 없으면 null)
export const nextArrivalText = (a: BusArrival) => (a.nextArrivalSec != null ? `다음 버스 ${formatDurationKo(a.nextArrivalSec)} 후` : null);

// 스크린리더용 항목 라벨: "402번, 3분 후 도착, 2정거장 전, 다음 버스 12분 후" (없는 정보는 생략)
export function arrivalA11yLabel(a: BusArrival): string {
  const parts = [`${a.routeNo}번`, isSoon(a) ? '곧 도착' : `${formatDurationKo(a.arrivalSec)} 후 도착`];
  if (a.remainingStops != null) parts.push(`${a.remainingStops}정거장 전`);
  const next = nextArrivalText(a);
  if (next) parts.push(next);
  return parts.join(', ');
}

// 노선명 비교용: "402번", " 402 " → "402"
const normalizeRoute = (r: string) => r.trim().replace(/번$/, '').trim();

// 내가 탈 노선(routeNo)이 "곧 도착(1분 이내)"인지. 노선명을 모르면 false → 수동 "버스 왔어요" 버튼만 사용
export function hasSoonArrival(arrivals: BusArrival[], routeNo?: string): boolean {
  if (!routeNo) return false;
  const target = normalizeRoute(routeNo);
  return arrivals.some((a) => normalizeRoute(a.routeNo) === target && isSoon(a));
}

export const sortByArrival = (list: BusArrival[]) => [...list].sort((x, y) => x.arrivalSec - y.arrivalSec);

export interface AnnouncerMemo {
  prev: BusArrival[] | null;          // 직전 성공 결과 (null이면 아직 첫 성공 전)
  errorKind: ArrivalErrorKind | null; // 현재 연속 실패 종류 (같은 종류의 에러 음성은 1회만)
}
export const INITIAL_ANNOUNCER_MEMO: AnnouncerMemo = { prev: null, errorKind: null };

export type ArrivalEvent = { type: 'success'; arrivals: BusArrival[] } | { type: 'error'; kind: ArrivalErrorKind };

export interface AnnouncementPlan {
  memo: AnnouncerMemo;
  texts: string[];  // 순서대로 읽을 문장 (빈 배열이면 안내 없음)
  haptic: boolean;  // "곧 도착"으로 바뀐 버스가 있으면 true
}

// 조회 결과 1건마다 호출. 같은 내용을 30초마다 반복하지 않도록 직전 결과와 비교해 바뀐 것만 안내한다
export function planAnnouncement(memo: AnnouncerMemo, event: ArrivalEvent): AnnouncementPlan {
  if (event.type === 'error') {
    // 연속 실패 중에는 첫 실패 1회만 안내(실패 종류가 바뀌면 다시 안내), 직전 성공 데이터는 유지
    return { memo: { ...memo, errorKind: event.kind }, texts: memo.errorKind === event.kind ? [] : [ARRIVAL_MSG[event.kind]], haptic: false };
  }

  const texts: string[] = memo.errorKind ? [ARRIVAL_MSG.recovered] : [];
  const top = sortByArrival(event.arrivals).slice(0, MAX_ANNOUNCE);
  const prevById = new Map((memo.prev ?? []).map((a) => [a.routeId, a]));
  let haptic = false;

  for (const a of top) {
    if (!memo.prev) { texts.push(arrivalSentence(a)); continue; } // 첫 성공: 임박 2건 안내
    const before = prevById.get(a.routeId);
    const becameSoon = isSoon(a) && (!before || !isSoon(before));
    if (becameSoon) haptic = true;
    // 새로 나타난 버스, 분 단위 도착 시간 변경, 곧 도착 진입 시에만 안내
    if (!before || becameSoon || arrivalTimeText(before) !== arrivalTimeText(a)) texts.push(arrivalSentence(a));
  }

  return { memo: { prev: event.arrivals, errorKind: null }, texts, haptic };
}
