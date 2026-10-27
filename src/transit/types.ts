// transit/types.ts — 대중교통 경로 후보 공용 타입 / Shared transit route types (Transit prefix avoids clashing with walking Place/RouteCandidate)
import type { Place as SearchPlace, RouteCandidate as SearchRouteCandidate } from '../api';

export interface TransitPlace { name: string; lat: number; lng: number; }

// BUS leg의 정류장 (승차 정류장부터 하차 정류장까지 순서대로)
export interface TransitStop { id: string; name: string; lat: number; lng: number; }

// 도보 leg의 세부 이동 단계 (서버 steps) / Step inside a walk leg
export interface WalkStep { streetName: string; distanceM: number; description: string; linestring: string; }

// BUS와 SUBWAY는 같은 "탑승 구간" / BUS and SUBWAY are both ride legs
export interface TransitLeg {
  mode: 'WALK' | 'BUS' | 'SUBWAY';
  routeName?: string;
  passStopCount?: number;
  durationSec?: number;
  distanceM?: number;
  // 승차 정류장 ID (BUS leg, 도착 정보 조회용). 서버가 안 내려주면 없음(undefined) — 사용처에서 없어도 동작해야 함
  stopId?: string;
  // GPS 하차 안내용 정류장 리스트. 서버가 안 내려주거나 형식이 이상하면 없음(undefined) → 수동 "곧 내려요" 버튼만 사용
  stops?: TransitStop[];
  // 하차 정류장 id (선택). 없으면 stops의 마지막 항목을 하차 정류장으로 본다
  alightStopId?: string;
  // 탑승 구간(BUS/SUBWAY) 부가 정보 / ride-leg extras from the server
  routeId?: string;
  routeColor?: string;
  routeTypeCode?: number;
  inService?: boolean;
  // 도보 구간 세부 단계 / walk-leg steps
  steps?: WalkStep[];
  start: TransitPlace;
  end: TransitPlace;
}

// 정류장 도착 정보 (노선 1개) — services/arrivalApi.ts 참고. 서버 응답은 transit/arrivalParser.ts에서 이 형태로 변환
export interface BusArrival {
  routeId: string;          // 재조회 시 이전 결과와 비교하는 키 (노선명 기반, 중복이면 번호를 붙임)
  routeNo: string;          // 노선명 (화면/음성 표시용, 예: "402")
  arrivalSec: number;       // 도착 예정까지 남은 시간(초)
  nextArrivalSec?: number;  // 다음 버스 도착 예정(초), 서버가 안 주면 없음
  remainingStops?: number;  // 남은 정류장 수, 서버가 안 주면 없음
}

export interface TransitRouteCandidate {
  totalDurationSec: number;
  legs: TransitLeg[];
  totalDistanceM?: number;
  totalWalkSec?: number;
  totalWalkDistanceM?: number;
  transferCount?: number;
  fare?: number;
  // 서버가 내려준 itinerary 원본 (변환 전). 경로 확정 POST에 가공 없이 그대로 보낸다 / Untouched server itinerary, sent as-is on confirm
  rawItinerary?: unknown;
  // 도보 전용 후보(walkOption)일 때만 있음. 선택하면 대중교통 세션이 아니라 기존 보행 흐름(createRoute)으로 간다
  walkRoute?: SearchRouteCandidate;
}

// 서버가 내려주는 leg/세션 상태 / Server-side leg and session states
export type LegState = 'PENDING' | 'WALKING' | 'WAITING' | 'RIDING' | 'COMPLETED';
export type SessionStatus = 'IN_PROGRESS' | 'ARRIVED' | 'CANCELED';

export interface TransitSessionLeg extends TransitLeg { seq: number; state: LegState; }

// POST /api/navigation/transit/route, GET /api/navigation/{id}, PATCH leg-state 공통 응답 / Shared session response
export interface TransitSession {
  id: number | string;
  status: SessionStatus;
  currentLegIndex: number;
  legs: TransitSessionLeg[];
}

// 장소 검색 결과 → 대중교통용 Place 변환 / Convert search Place to TransitPlace
export function toTransitPlace(p: Pick<SearchPlace, 'placeName' | 'lat' | 'lng'>): TransitPlace {
  return { name: p.placeName, lat: p.lat, lng: p.lng };
}
