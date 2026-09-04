// api.ts -API 공통 설정 및 토큰 관리
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = "http://192.168.200.115:8080";
// AI 서버(FastAPI, YOLO 추론)는 백엔드와 별도 프로세스/포트 — 로컬 IP는 백엔드와 동일 머신 기준
export const AI_SERVER_WS_URL = "ws://192.168.200.115:8000/ws/detect/live";

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
// 토큰 만료/누락으로 인증이 거부됐을 때(401/403) 던지는 에러 — 호출부에서 로그인 화면 전환 등에 사용
export class AuthExpiredError extends Error {
  constructor(message = '로그인이 만료되었습니다. 다시 로그인해주세요.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
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
  // 401/403은 토큰이 만료됐거나 아예 없는 경우이므로, 무효 토큰을 지우고 호출부가 알아챌 수 있게 던져준다
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
  distance: number; // m
  duration: number; // s
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
  distance: number; // m
  duration: number; // s
  crosswalks: Crosswalk[];
  stairs: Stair[];
  accessibilitySummary: CrosswalkAccessibilitySummary;
  routeData: string; // 티맵 원본 경로 JSON (단계별 안내 파싱용, 4단계에서 사용 예정)
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
  return res.json(); // { id, email, nickname }
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
  totalDistance: number; // m
  totalTime: number; // s
  obstacleCount: number;
  createdAt: string;
}
// 이동경로(보행 기록) 목록 조회 API 요청 함수 (JWT 인증 필요)
export async function getWalkLogs(): Promise<WalkLog[]> {
  const res = await authFetch('/api/walk/logs');
  if (!res.ok) throw new Error('보행 기록 조회에 실패했습니다');
  return res.json();
}