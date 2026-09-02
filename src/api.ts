// api.ts -API 공통 설정 및 토큰 관리
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = "http://192.168.45.163:8080";

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