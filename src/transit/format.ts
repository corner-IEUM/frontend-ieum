// transit/format.ts — 시간/거리 한글 포맷 순수 함수 / Pure Korean duration & distance formatters (no RN deps)

// 3720 → "1시간 2분", 3600 → "1시간". 최소 1분 / Seconds to Korean text, minimum 1 minute
export function formatDurationKo(sec: number): string {
  const totalMin = Math.max(1, Math.round(sec / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m}분`;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// 400 → "400미터", 1200 → "1.2킬로미터" / Meters to Korean text, km with 1 decimal
export function formatDistanceKo(m: number): string {
  const rounded = Math.round(m);
  if (rounded < 1000) return `${rounded}미터`;
  const km = Math.round(rounded / 100) / 10;
  return `${Number.isInteger(km) ? km : km.toFixed(1)}킬로미터`;
}
