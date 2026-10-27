// hooks/useAppActive.ts — 앱이 포그라운드(active)인지 알려주는 훅. background/inactive면 false
// 위치 추적·마이크 청취처럼 화면이 꺼진 동안 돌면 안 되는 구독을 켜고 끌 때 사용한다
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

const isForeground = (s: AppStateStatus | null | undefined) => s !== 'background' && s !== 'inactive';

export function useAppActive(): boolean {
  const [active, setActive] = useState(isForeground(AppState.currentState));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(isForeground(s)));
    return () => sub.remove();
  }, []);
  return active;
}
