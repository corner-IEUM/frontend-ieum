import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export interface Coords {
  latitude: number;
  longitude: number;
  timestamp: number;
}

// 실시간 위치 추적 훅
export function useLocationTracking(enabled: boolean = true) {
  const [location, setLocation] = useState<Coords | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const routeRef = useRef<Coords[]>([]); // 보행 중 누적되는 좌표 이력

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    (async () => {
      // 위치 권한 요청
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('위치 권한이 거부되었습니다');
        return;
      }

      // 실시간 위치 추적 시작
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 2000, // 2초마다 업데이트
          distanceInterval: 3, // 3m 이상 이동 시 업데이트
        },
        (pos) => {
          if (cancelled) return;
          const newCoords: Coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            timestamp: pos.timestamp,
          };
          setLocation(newCoords);
          routeRef.current.push(newCoords); // 좌표 이력 누적
        }
      );

      if (cancelled) {
        sub.remove();
      } else {
        subscriptionRef.current = sub;
      }
    })();

    return () => {
      cancelled = true;
      subscriptionRef.current?.remove();
      subscriptionRef.current = null;
    };
  }, [enabled]);

  return {
    location,
    errorMsg,
    getRoute: () => routeRef.current, // 누적된 전체 좌표 배열 반환
    resetRoute: () => { routeRef.current = []; }, // 새 보행 시작 시 초기화용
    getTotalDistance: () => calculateTotalDistance(routeRef.current), // 누적된 좌표 기준 총 이동거리(m) 반환
  };
}

// 두 좌표 사이의 거리를 Haversine 공식으로 계산 (단위: m)
function getDistanceMeters(a: Coords, b: Coords) {
  const R = 6371000; // 지구 반지름(m)
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  return R * c;
}

// 좌표 배열 전체를 순회하며 총 이동거리(m)를 합산
function calculateTotalDistance(route: Coords[]) {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += getDistanceMeters(route[i - 1], route[i]);
  }
  return total;
}