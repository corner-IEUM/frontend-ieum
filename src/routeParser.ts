// routeParser.ts — 티맵 보행자 경로(GeoJSON) 원본(RouteResponse.routeData)을 턴바이턴 안내 스텝으로 변환
// 백엔드 RouteParser.extractWaypoints와 동일한 규칙(SP/EP 제외, description 있는 Point만, 계단/횡단보도 키워드 분류)을 프론트에서도 따름
import { Level } from './theme';

export interface RouteStep {
  lng: number;
  lat: number;
  text: string;
  sub: string;
  level: Level;
}

const STAIR_KEYWORDS = ['계단', '지하보도', '육교'];
const CROSSWALK_KEYWORD = '횡단보도';

function levelFor(description: string): Level {
  if (STAIR_KEYWORDS.some((k) => description.includes(k))) return 'danger';
  if (description.includes(CROSSWALK_KEYWORD)) return 'caution';
  return 'safe';
}

function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function parseRouteSteps(routeData: string): RouteStep[] {
  let root: any;
  try {
    root = JSON.parse(routeData);
  } catch {
    return [];
  }
  const features: any[] = root?.features ?? [];
  const points: { coord: [number, number]; description: string }[] = [];
  for (const f of features) {
    if (f?.geometry?.type !== 'Point') continue;
    const props = f.properties ?? {};
    if (props.pointType === 'SP' || props.pointType === 'EP') continue;
    const description: string = props.description;
    if (!description) continue;
    points.push({ coord: f.geometry.coordinates as [number, number], description });
  }
  return points.map((p, i) => {
    const next = points[i + 1];
    const sub = next ? `다음 지점까지 약 ${Math.round(distanceMeters(p.coord, next.coord))}m` : '목적지 근처입니다';
    return { lng: p.coord[0], lat: p.coord[1], text: p.description, sub, level: levelFor(p.description) };
  });
}
