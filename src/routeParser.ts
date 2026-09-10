// routeParser.ts — 티맵 보행자 경로(GeoJSON) 원본(RouteResponse.routeData)을 턴바이턴 안내 스텝으로 변환
// 백엔드 RouteParser.extractWaypoints/categorize와 동일한 규칙(SP/EP 제외, description 있는 Point만,
// 계단 > 횡단보도 > 그 외(TURN) 순서로 분류)을 프론트에서도 그대로 따름 — WaypointCategory.java 참고
import { Level } from './theme';

// 백엔드 WaypointCategory.java와 동일: STAIR(계단·지하보도·육교), CROSSWALK(횡단보도), TURN(그 외 회전/직진 등 일반 안내)
export type WaypointCategory = 'STAIR' | 'CROSSWALK' | 'TURN';

export interface RouteStep {
  lng: number;
  lat: number;
  text: string;
  sub: string;
  level: Level;
  category: WaypointCategory;
  distToNext: number | null; // 다음 지점까지 거리(m), 마지막 지점이면 null
}

const STAIR_KEYWORDS = ['계단', '지하보도', '육교'];
const CROSSWALK_KEYWORD = '횡단보도';

// 백엔드 RouteParser.categorize()와 동일한 우선순위: 계단이 가장 먼저, 그다음 횡단보도,
// 나머지(좌회전/우회전/직진 등)는 전부 TURN으로 묶임 — 티맵 문구에 별도 "회전" 키워드가
// 있는 게 아니라 STAIR/CROSSWALK가 아닌 모든 안내가 TURN이 되는 폴백 구조
function categorize(description: string): WaypointCategory {
  if (STAIR_KEYWORDS.some((k) => description.includes(k))) return 'STAIR';
  if (description.includes(CROSSWALK_KEYWORD)) return 'CROSSWALK';
  return 'TURN';
}

function levelForCategory(category: WaypointCategory): Level {
  if (category === 'STAIR') return 'danger';
  if (category === 'CROSSWALK') return 'caution';
  return 'safe';
}

export function distanceMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// 경로 전체 좌표를 순서대로 [lng, lat] 목록으로 추출 (백엔드 RouteParser.extractPath와 동일한 규칙:
// GeoJSON의 LineString 피처들에서 좌표를 그대로 이어붙임) — 경로 이탈 판단에 사용
export function extractPath(routeData: string): [number, number][] {
  let root: any;
  try {
    root = JSON.parse(routeData);
  } catch {
    return [];
  }
  const path: [number, number][] = [];
  const features: any[] = root?.features ?? [];
  for (const f of features) {
    if (f?.geometry?.type !== 'LineString') continue;
    for (const c of f.geometry.coordinates ?? []) {
      path.push([c[0], c[1]]);
    }
  }
  return path;
}

// 한 점(point)에서 선분(a-b)까지의 최단거리(m). point를 원점으로 하는 로컬 평면(위경도 -> 미터)에
// 투영해서 계산 — 도보 경로 스케일(수십~수백m)에서는 이 정도 근사로 충분히 정확함
function pointToSegmentMeters(point: [number, number], a: [number, number], b: [number, number]): number {
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((point[1] * Math.PI) / 180);
  const toXY = (p: [number, number]): [number, number] => [(p[0] - point[0]) * mPerDegLng, (p[1] - point[1]) * mPerDegLat];
  const [ax, ay] = toXY(a);
  const [bx, by] = toXY(b);
  const abx = bx - ax, aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, (-ax * abx + -ay * aby) / abLenSq));
  const cx = ax + abx * t, cy = ay + aby * t;
  return Math.hypot(cx, cy); // point(원점)에서 투영점(c)까지 거리
}

// 현재 위치와 경로(폴리라인) 사이의 최단거리(m) — 각 구간(세그먼트)까지의 수직거리 중 최솟값
export function distanceToRouteMeters(point: [number, number], path: [number, number][]): number {
  if (path.length === 0) return Infinity;
  if (path.length === 1) return distanceMeters(point, path[0]);
  let min = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    min = Math.min(min, pointToSegmentMeters(point, path[i], path[i + 1]));
  }
  return min;
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
    const distToNext = next ? Math.round(distanceMeters(p.coord, next.coord)) : null;
    const sub = distToNext != null ? `다음 지점까지 약 ${distToNext}m` : '목적지 근처입니다';
    const category = categorize(p.description);
    return { lng: p.coord[0], lat: p.coord[1], text: p.description, sub, level: levelForCategory(category), category, distToNext };
  });
}
