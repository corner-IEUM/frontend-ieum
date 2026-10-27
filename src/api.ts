// api.ts -API 공통 설정 및 토큰 관리
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthExpiredError, LegStateConflictError, ApiStatusError } from './apiErrors';
import type { TransitPlace, TransitRouteCandidate, TransitSession } from './transit/types';
import { parseCandidatesResponse, buildRouteRequestBody, parseRouteResponse } from './transit/itineraryParser';
import { createLocalSession } from './transit/localSession';

// EXPO_PUBLIC_ 접두사 변수는 번들 시점에 process.env로 심어짐 — 값이 없으면 로컬 개발용 IP로 폴백
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://192.168.200.115:8080";
// AI 서버(FastAPI, YOLO 추론)는 백엔드와 별도 프로세스/포트 — 로컬 IP는 백엔드와 동일 머신 기준
export const AI_SERVER_WS_URL = process.env.EXPO_PUBLIC_AI_SERVER_WS_URL ?? "ws://192.168.200.115:8000/ws/detect/live";

// 데모 모드 주소는 AI_SERVER_WS_URL의 host:port를 재사용
const AI_SERVER_HOST_PORT = AI_SERVER_WS_URL.replace(/^wss?:\/\//, "").split("/")[0];
// 데모 모드용 AI 서버 감지 결과 WebSocket 경로 (연결만 하면 됨)
export const AI_SERVER_DEMO_WS_URL = process.env.EXPO_PUBLIC_AI_SERVER_DEMO_WS_URL ?? `ws://${AI_SERVER_HOST_PORT}/ws/detect`;
// AI 서버가 내려주는 데모 영상 HTTP 주소
export const DEMO_VIDEO_URL = process.env.EXPO_PUBLIC_DEMO_VIDEO_URL ?? `http://${AI_SERVER_HOST_PORT}/media/demo.mp4`;

// 일반보행 인식 모드 초기값 (EXPO_PUBLIC_DEMO_MODE로 오버라이드)
export const DEFAULT_DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE
  ? process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
  : true;

// 오류 클래스는 RN 의존성 없이 테스트할 수 있도록 apiErrors.ts에 있고 여기서 재export / Error classes live in apiErrors.ts (testable without RN); re-exported here
export { AuthExpiredError, LegStateConflictError, ApiStatusError };

const TOKEN_KEY = "accessToken";

// 토큰 저장, 가져오기, 삭제 함수
export async function saveToken(token: string){
    await AsyncStorage.setItem(TOKEN_KEY, token);
}
// 토큰 가져오기
export async function getToken(){
    return await AsyncStorage.getItem(TOKEN_KEY);
}
// 토큰 삭제
export async function clearToken() {
  await AsyncStorage.removeItem(TOKEN_KEY);
}
// 인증이 필요한 API 요청을 위한 fetch 함수
export async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (res.status === 401 || res.status === 403) {
    await clearToken();
    throw new AuthExpiredError();
  }
  return res;
}
// 로그인/회원가입 API 요청 함수
export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('로그인에 실패했습니다');
  const data = await res.json();
  await saveToken(data.accessToken);
  return data;
}
// 회원가입 API 요청 함수
export async function signup(nickname: string, email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, email, password }),
  });
  if (!res.ok) throw new Error('회원가입에 실패했습니다');
  return true;
}
// 장소 검색 결과 항목
export interface Place {
  placeName: string;
  roadAddress: string;
  lng: number;
  lat: number;
  distance: number | null;
}
// 카카오 장소 검색 API 요청 함수 (JWT 인증 필요)
export async function searchPlaces(query: string, lng?: number, lat?: number): Promise<Place[]> {
  const params = new URLSearchParams({ query });
  if (lng != null) params.set('lng', String(lng));
  if (lat != null) params.set('lat', String(lat));
  const res = await authFetch(`/api/places/search?${params.toString()}`);
  if (!res.ok) throw new Error('장소 검색에 실패했습니다');
  const data: { places: Place[] } = await res.json();
  return data.places;
}
// 경로 후보/생성 공용 타입
export interface Crosswalk { lng: number; lat: number; guidance: string; }
export interface Stair { lng: number; lat: number; guidance: string; }
export interface CrosswalkAccessibilitySummary {
  noCurbCutCount: number;
  noBrailleBlockCount: number;
  noSoundSignalCount: number;
  noPedestrianSignalCount: number;
}
export interface RouteCandidate {
  searchOption: number;
  label: string;
  distance: number;
  duration: number;
  crosswalks: Crosswalk[];
  stairs: Stair[];
  accessibilitySummary: CrosswalkAccessibilitySummary;
}
// 경로 후보 조회 API 요청 함수 (JWT 인증 필요)
export async function searchRouteCandidates(startLng: number, startLat: number, endLng: number, endLat: number): Promise<RouteCandidate[]> {
  const res = await authFetch('/api/navigation/route/candidates', {
    method: 'POST',
    body: JSON.stringify({ startLng, startLat, endLng, endLat }),
  });
  if (!res.ok) throw new Error('경로 후보 조회에 실패했습니다');
  return res.json();
}
export interface RouteResponse {
  navigationId: number;
  distance: number;
  duration: number;
  crosswalks: Crosswalk[];
  stairs: Stair[];
  accessibilitySummary: CrosswalkAccessibilitySummary;
  routeData: string;
}
// 경로 생성/저장 API 요청 함수 (JWT 인증 필요) — 후보 화면에서 하나를 선택했을 때 호출
export async function createRoute(startLng: number, startLat: number, endLng: number, endLat: number, searchOption: number): Promise<RouteResponse> {
  const res = await authFetch('/api/navigation/route', {
    method: 'POST',
    body: JSON.stringify({ startLng, startLat, endLng, endLat, searchOption }),
  });
  if (!res.ok) throw new Error('경로 생성에 실패했습니다');
  return res.json();
}
// 주변 위험요소 체크 트리거 (JWT 인증 필요) — 응답은 없고, 발견되면 서버가 WebSocket(/topic/guidance)으로 안내를 밀어줌
export async function checkNearbyHazards(lng: number, lat: number): Promise<void> {
  await authFetch('/api/navigation/nearby-hazards', {
    method: 'POST',
    body: JSON.stringify({ lng, lat }),
  });
}
// 경로 완료 처리 API 요청 함수 (JWT 인증 필요) — 목적지 도착 시 호출
export async function completeNavigation(navigationId: number, obstacleCnt: number, completed: boolean): Promise<void> {
  const res = await authFetch(`/api/navigation/${navigationId}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({ obstacleCnt, completed }),
  });
  if (!res.ok) throw new Error('경로 완료 처리에 실패했습니다');
}
// 내 정보 조회 API 요청 함수 (JWT 인증 필요)
export async function getMyInfo() {
  const res = await authFetch('/api/users/me');
  if (!res.ok) throw new Error('내 정보 조회에 실패했습니다');
  return res.json();
}
// 보행 종료 시 보행 기록 저장 API 요청 함수 (JWT 인증 필요)
export async function completeWalk(routeData: unknown, totalDistance: number, totalTime: number, obstacleCount: number) {
  const res = await authFetch('/api/walk/complete', {
    method: 'POST',
    body: JSON.stringify({ routeData, totalDistance, totalTime, obstacleCount }),
  });
  if (!res.ok) throw new Error('보행 기록 저장에 실패했습니다');
  return res.json();
}
// 저장된 보행 기록(WalkLog) 한 건 — 백엔드 WalkLogResponse와 동일한 필드 구성
export interface WalkLog {
  id: number;
  routeData: string;
  totalDistance: number;
  totalTime: number;
  obstacleCount: number;
  createdAt: string;
}
// 이동경로(보행 기록) 목록 조회 API 요청 함수 (JWT 인증 필요)
export async function getWalkLogs(): Promise<WalkLog[]> {
  const res = await authFetch('/api/walk/logs');
  if (!res.ok) throw new Error('보행 기록 조회에 실패했습니다');
  return res.json();
}
// 저장된 길찾기(Navigation) 기록 한 건 (백엔드 NavigationHistoryResponse와 동일 필드)
export interface NavigationHistoryItem {
  id: number;
  startLng: number;
  startLat: number;
  endLng: number;
  endLat: number;
  distance: number;
  duration: number;
  obstacleCnt: number;
  completed: boolean;
  startTime: string;
  endTime: string | null;
  routeData: string;
}
// 길찾기 기록 목록 조회 API 요청 함수 (JWT 인증 필요, 페이징 없음)
export async function getNavigationHistory(): Promise<NavigationHistoryItem[]> {
  const res = await authFetch('/api/navigation/history');
  if (!res.ok) throw new Error('길찾기 기록 조회에 실패했습니다');
  return res.json();
}
// 대중교통 후보 조회 (JWT 필요): transitOptions + 도보 후보(walkOption)를 하나의 후보 목록으로 변환해 반환. 변환은 itineraryParser에서만 한다
export async function fetchRouteCandidates(origin: TransitPlace, destination: TransitPlace): Promise<TransitRouteCandidate[]> {
  const params = new URLSearchParams({
    startLng: String(origin.lng), startLat: String(origin.lat),
    endLng: String(destination.lng), endLat: String(destination.lat),
  });
  const res = await authFetch(`/api/navigation/transit/candidates?${params.toString()}`);
  if (!res.ok) throw new ApiStatusError(res.status, '대중교통 경로 후보 조회에 실패했습니다');
  return parseCandidatesResponse(await res.json(), origin, destination);
}
// 선택한 경로 확정 (JWT 필요): 서버 itinerary 원본을 그대로 보내고, 응답 navigationId + 후보 legs로 로컬 세션을 만든다
export async function saveTransitRoute(candidate: TransitRouteCandidate, origin: TransitPlace, destination: TransitPlace): Promise<TransitSession> {
  const res = await authFetch('/api/navigation/transit/route', {
    method: 'POST',
    body: JSON.stringify(buildRouteRequestBody(candidate, origin, destination)),
  });
  if (!res.ok) throw new ApiStatusError(res.status, '대중교통 경로 확정에 실패했습니다');
  const { navigationId, currentLegIndex } = parseRouteResponse(await res.json());
  return createLocalSession(navigationId, candidate.legs, currentLegIndex);
}

// 진행 중인 대중교통 세션 id 저장 (앱 재시작 복구용) / Persist session id for restore after restart
const TRANSIT_SESSION_KEY = 'transitSessionId';
export async function saveTransitSessionId(id: number | string) {
  await AsyncStorage.setItem(TRANSIT_SESSION_KEY, String(id));
}
export async function getTransitSessionId(): Promise<string | null> {
  return AsyncStorage.getItem(TRANSIT_SESSION_KEY);
}
export async function clearTransitSessionId() {
  await AsyncStorage.removeItem(TRANSIT_SESSION_KEY);
}
// 마지막 서버 세션 상태를 기기에 저장 (앱 복귀/재시작 시 서버 조회가 실패하면 복구용) / Last server session saved on device for offline recovery
const TRANSIT_SNAPSHOT_KEY = 'transitSessionSnapshot';
export async function saveTransitSnapshot(session: TransitSession) {
  await AsyncStorage.setItem(TRANSIT_SNAPSHOT_KEY, JSON.stringify(session));
}
export async function getTransitSnapshot(): Promise<TransitSession | null> {
  const raw = await AsyncStorage.getItem(TRANSIT_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.legs) ? parsed : null; // 형식이 이상하면 없는 것으로 취급
  } catch {
    return null;
  }
}
export async function clearTransitSnapshot() {
  await AsyncStorage.removeItem(TRANSIT_SNAPSHOT_KEY);
}
// leg 상태 동기화 (JWT 인증 필요, 멱등): 본문은 {currentLegIndex, currentLegState}, 응답은 204(본문 없음)라 파싱하지 않는다
export async function patchLegState(id: number | string, body: { currentLegIndex: number; currentLegState: string }): Promise<void> {
  const res = await authFetch(`/api/navigation/${id}/leg-state`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new ApiStatusError(res.status, 'leg 상태 동기화에 실패했습니다');
}
