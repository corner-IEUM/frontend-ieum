// apiErrors.ts — API 오류 클래스와 분류 (RN 의존성 없음) / API error classes and classification (no RN deps)

// 토큰 만료/누락으로 인증이 거부됐을 때(401/403) 던지는 에러 — 호출부에서 로그인 화면 전환 등에 사용
export class AuthExpiredError extends Error {
  constructor(message = '로그인이 만료되었습니다. 다시 로그인해주세요.') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}
// 잘못된 leg 상태 전이(409) / Invalid leg state transition (HTTP 409)
export class LegStateConflictError extends Error {
  constructor() { super('leg 상태 전이가 올바르지 않습니다'); this.name = 'LegStateConflictError'; }
}
// 401/403/409 외의 HTTP 오류 / Other non-OK HTTP responses
export class ApiStatusError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.name = 'ApiStatusError'; this.status = status; }
}

export type ErrorKind = 'auth' | 'conflict' | 'notFound' | 'retryable' | 'fatal';

// 네트워크 오류/5xx만 재시도 대상 (인증·409·4xx는 재시도해도 같은 결과) / Only network errors and 5xx are retryable
export function classifyApiError(e: unknown): ErrorKind {
  if (e instanceof AuthExpiredError) return 'auth';
  if (e instanceof LegStateConflictError) return 'conflict';
  if (e instanceof ApiStatusError) {
    if (e.status === 404) return 'notFound';
    return e.status >= 500 ? 'retryable' : 'fatal';
  }
  return 'retryable'; // fetch 자체 실패(TypeError 등) / fetch-level failure
}

// 도착 정보 조회 실패 종류 — 서버가 응답했는데 오류(HTTP 오류/인증/형식 오류)면 server, 응답 자체를 못 받았으면 network
export function classifyArrivalError(e: unknown): 'server' | 'network' {
  return e instanceof ApiStatusError || e instanceof AuthExpiredError ? 'server' : 'network';
}
