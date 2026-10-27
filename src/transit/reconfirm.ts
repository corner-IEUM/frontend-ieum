// transit/reconfirm.ts — 하차 확인이 오래 없을 때 재안내 타이머 (RN 의존성 없음)
// 시작 후 60초마다 최대 3회 onRemind를 호출하고 멈춘다. 반환된 cancel을 호출하면 즉시 정리

export const RECONFIRM_INTERVAL_MS = 60000;
export const RECONFIRM_MAX = 3;

export function startReconfirm(
  onRemind: (count: number) => void,
  { intervalMs = RECONFIRM_INTERVAL_MS, max = RECONFIRM_MAX }: { intervalMs?: number; max?: number } = {},
): () => void {
  let count = 0;
  const timer = setInterval(() => {
    count++;
    onRemind(count);
    if (count >= max) clearInterval(timer);
  }, intervalMs);
  return () => clearInterval(timer);
}
