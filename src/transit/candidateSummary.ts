// transit/candidateSummary.ts — 후보 → 카드/TTS/접근성 라벨 요약 (순수 함수) / Pure summary for card, TTS and a11y label
import type { TransitLeg, TransitRouteCandidate } from './types.ts';
import { formatDurationKo, formatDistanceKo } from './format.ts';
import { stopName } from './guidanceMessages.ts';

export interface CandidateSummary {
  index: number;            // 1부터 시작하는 표시 번호 / 1-based display number
  typeLabel: '버스 이용' | '지하철 이용' | '버스·지하철 이용' | '도보만';
  isWalkOnly: boolean;
  totalDurationText: string;
  walkDistanceM: number;
  walkDistanceText: string;
  busRoutes: string[];      // 이용 순서대로 노선명 (탑승 구간 전체, 지하철 포함) / ride routes in order
  routeText: string;        // 화면 표시용 "버스 402번 → 지하철 수도권5호선"
  transferCount: number;
  outOfServiceWarning: boolean;  // 탑승 구간 중 inService:false가 있음 (후보에서 제외하지 않고 경고만) / some ride leg may have ended service
  isFastest: boolean;
  fasterThanWalkText: string | null;  // "도보보다 18분 빠름", 없으면 null / null if no walk-only baseline or not faster
  speech: string;           // TTS 문장 = accessibilityLabel / TTS sentence, same as a11y label
}

// 탑승 구간(BUS/SUBWAY) 표시 이름. 버스: "402번 버스" 형태가 아니라 기존 문구("버스 402번")를 유지
const isRide = (l: TransitLeg) => l.mode !== 'WALK';
const rideName = (l: TransitLeg) => (l.mode === 'SUBWAY' ? '지하철' : '버스');
const rideLabel = (l: TransitLeg) =>
  l.mode === 'SUBWAY' ? `지하철 ${l.routeName ?? ''}`.trim() : `버스 ${l.routeName ?? '버스'}번`;

export function summarizeCandidates(candidates: TransitRouteCandidate[]): CandidateSummary[] {
  const fastestSec = Math.min(...candidates.map((c) => c.totalDurationSec));
  const walkOnlySec = candidates
    .filter((c) => !c.legs.some(isRide))
    .reduce<number | null>((min, c) => (min == null ? c.totalDurationSec : Math.min(min, c.totalDurationSec)), null);

  return candidates.map((c, i) => {
    const busLegs = c.legs.filter(isRide); // BUS + SUBWAY 탑승 구간
    const isWalkOnly = busLegs.length === 0;
    const walkDistanceM = c.legs.filter((l) => l.mode === 'WALK').reduce((sum, l) => sum + (l.distanceM ?? 0), 0);
    const busRoutes = busLegs.map((l) => l.routeName ?? rideName(l));
    const rideLabels = busLegs.map(rideLabel);
    const hasBus = busLegs.some((l) => l.mode === 'BUS');
    const hasSubway = busLegs.some((l) => l.mode === 'SUBWAY');
    const transferCount = Math.max(0, busLegs.length - 1);
    const isFastest = c.totalDurationSec === fastestSec;
    const outOfServiceWarning = busLegs.some((l) => l.inService === false);

    // 분 단위 반올림 값끼리 비교 (표시 분과 일치) / Compare rounded minutes so the diff matches displayed times
    const diffMin = walkOnlySec == null || isWalkOnly
      ? 0
      : Math.round(walkOnlySec / 60) - Math.round(c.totalDurationSec / 60);
    const fasterThanWalkText = diffMin > 0 ? `도보보다 ${diffMin}분 빠름` : null;

    const totalDurationText = formatDurationKo(c.totalDurationSec);
    const walkDistanceText = formatDistanceKo(walkDistanceM);

    // 예: "1번, 버스 402번 이용, 총 32분, 도보 400미터." / "2번, 도보만 이용, 총 51분."
    const parts = [`${i + 1}번`];
    if (isWalkOnly) {
      parts.push('도보만 이용');
    } else {
      const routes = rideLabels.join(', ');
      parts.push(transferCount > 0 ? `${routes} 환승 ${transferCount}회 이용` : `${routes} 이용`);
    }
    parts.push(`총 ${totalDurationText}`);
    if (!isWalkOnly) parts.push(`도보 ${walkDistanceText}`);
    if (isFastest && candidates.length > 1) parts.push('가장 빠름');
    if (fasterThanWalkText) parts.push(fasterThanWalkText);
    if (outOfServiceWarning) parts.push(OUT_OF_SERVICE_TEXT);

    return {
      index: i + 1,
      typeLabel: isWalkOnly ? '도보만' : hasBus && hasSubway ? '버스·지하철 이용' : hasSubway ? '지하철 이용' : '버스 이용',
      isWalkOnly,
      totalDurationText,
      walkDistanceM,
      walkDistanceText,
      busRoutes,
      routeText: rideLabels.join(' → '),
      transferCount,
      outOfServiceWarning,
      isFastest: isFastest && candidates.length > 1,
      fasterThanWalkText,
      speech: `${parts.join(', ')}.`,
    };
  });
}

// 서버 inService:false → 운행이 끝났을 수 있음. 후보 요약(카드/낭독)에는 짧게, 선택 시에는 한 번 자세히
export const OUT_OF_SERVICE_TEXT = '운행 종료 가능성';
export const OUT_OF_SERVICE_SELECT_SPEECH = '운행이 종료됐을 수 있어요. 운행 시간을 확인해 주세요.';
export const LIST_OUTRO_SPEECH = '원하는 경로를 눌러 선택하세요.';
export const SELECT_OUTRO_SPEECH = '이 경로로 안내할까요? 아래 버튼을 눌러 확정하세요.';

// 선택한 후보 1개의 순차 안내 문장: ① 요약 → ② 단계별(도보 → 승차 → 노선 → 하차 → 도보) → ③ 마무리. 한 문장에 정보 하나씩
export function buildSelectionSpeech(candidate: TransitRouteCandidate, summary: CandidateSummary): string[] {
  const sentences = [
    summary.isWalkOnly ? `도보만 이용하는 경로예요.` : summary.typeLabel === '버스 이용' ? `버스를 이용하는 경로예요.` : `${summary.typeLabel}하는 경로예요.`,
    `총 ${summary.totalDurationText} 걸려요.`,
    ...(summary.outOfServiceWarning ? [OUT_OF_SERVICE_SELECT_SPEECH] : []), // 후보에 탑승 구간이 여러 개여도 한 번만
  ];
  for (const leg of candidate.legs) {
    if (leg.mode === 'WALK') {
      sentences.push(leg.distanceM != null ? `${formatDistanceKo(leg.distanceM)} 걸어가요.` : '걸어서 이동해요.');
    } else {
      sentences.push(`승차 정류장은 ${stopName(leg.start.name)}이에요.`);
      if (leg.mode === 'SUBWAY') sentences.push(`${leg.routeName ?? ''} 지하철을 타요.`.trim());
      else sentences.push(`${leg.routeName ?? '버스'}${leg.routeName ? '번 ' : ' '}버스를 타요.`);
      sentences.push(`하차 정류장은 ${stopName(leg.end.name)}이에요.`);
    }
  }
  sentences.push(SELECT_OUTRO_SPEECH);
  return sentences;
}

// 전체 낭독 문장들 (후보별 1문장 + 마지막 안내) / Sentences to read: one per candidate + outro
export function buildAnnouncement(summaries: CandidateSummary[]): string[] {
  return [...summaries.map((s) => s.speech), LIST_OUTRO_SPEECH];
}
