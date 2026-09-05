// hooks/useLiveDetection.ts — 카메라 프레임을 AI 서버(/ws/detect/live)로 실시간 전송하고
// 인식 결과(위험요소/신호등 등)를 받아오는 훅.
//
// [프레임 캡처 방식 조사 결과]
// expo-camera(v17)에는 react-native-vision-camera의 "frame processor" 같은,
// JS로 raw 프레임을 스트리밍해주는 API가 없다 (CameraView.d.ts 기준 노출된 캡처 수단은
// takePictureAsync 뿐). frame processor는 별도 네이티브 모듈(vision-camera) + 커스텀 dev
// client(prebuild) 도입이 필요해서 이 프로젝트의 Expo 관리형 워크플로(Expo Go 기반) 구조를
// 벗어난다. 따라서 이 프로젝트에서 가장 가벼운 방법은 takePictureAsync를 "이전 캡처가
// 끝난 뒤에만 다음 캡처를 예약"하는 자기 페이싱(self-paced) 루프로 반복 호출하는 것이다
// (고정 setInterval을 쓰면 느린 기기에서 캡처 호출이 겹쳐 쌓일 수 있음).
//
// pictureSize는 기기가 지원하는 목록 중 640x480에 가장 가까운 걸 선택해 페이로드를 줄이고,
// skipProcessing은 켜지 않는다 — 켜면 quality가 무시되고 방향 보정도 생략돼 원본 해상도
// 그대로(수 MB) 전송하게 되어 오히려 느려지고 화면이 회전되어 보일 수 있기 때문.
import { useCallback, useEffect, useRef, useState } from 'react';
import { CameraView } from 'expo-camera';
import { AI_SERVER_WS_URL } from '../api';
import { speakWithPriority } from '../tts';

export interface DetectionMeta {
  track_id?: number;
  class?: string;
  direction?: string;
  proximity?: number;
  light_color?: string | null;
}

export interface DetectionMessage {
  kind: string;
  priority: number; // 1=즉각위험, 3=일반정보
  message: string;
  meta?: DetectionMeta;
  timestamp?: number;
}

export type LiveConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

const RECONNECT_DELAY_MS = 2000;
const CAPTURE_MIN_INTERVAL_MS = 200; // 캡처+전송 완료 후 다음 캡처까지 최소 대기 (겹침 방지)
const TARGET_PICTURE_SIZE = { width: 640, height: 480 };

// 기기가 지원하는 pictureSize 목록 중 목표 해상도(640x480)에 가장 가까운 것 선택
function pickClosestSize(sizes: string[]): string | undefined {
  if (!sizes.length) return undefined;
  const targetArea = TARGET_PICTURE_SIZE.width * TARGET_PICTURE_SIZE.height;
  let best: string | undefined;
  let bestDiff = Infinity;
  for (const s of sizes) {
    const m = /^(\d+)x(\d+)$/.exec(s);
    if (!m) continue;
    const area = Number(m[1]) * Number(m[2]);
    const diff = Math.abs(area - targetArea);
    if (diff < bestDiff) { bestDiff = diff; best = s; }
  }
  return best;
}

// 우선순위가 있는 감지 결과를 음성으로 안내 (재생 로직 자체는 tts.ts의 speakWithPriority 공용)
function announce(msg: DetectionMessage) {
  return speakWithPriority(msg.message, msg.priority <= 1);
}

export function useLiveDetection(enabled: boolean) {
  const cameraRef = useRef<CameraView | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const captureLoopActive = useRef(false);
  const cameraReadyRef = useRef(false);

  const [status, setStatus] = useState<LiveConnectionStatus>('disconnected');
  const [detection, setDetection] = useState<DetectionMessage | null>(null);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const onCameraReady = useCallback(async () => {
    cameraReadyRef.current = true;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      if (sizes && sizes.length) setPictureSize(pickClosestSize(sizes));
    } catch {
      // 목록 조회 실패 시 기기 기본 해상도로 진행
    }
  }, []);

  const captureNext = useCallback(() => {
    if (!captureLoopActive.current) return;
    const ws = wsRef.current;
    const scheduleRetry = () => { if (captureLoopActive.current) setTimeout(captureNext, CAPTURE_MIN_INTERVAL_MS); };

    if (!ws || ws.readyState !== WebSocket.OPEN || !cameraRef.current || !cameraReadyRef.current) {
      scheduleRetry();
      return;
    }

    cameraRef.current
      .takePictureAsync({ base64: true, quality: 0.4, shutterSound: false })
      .then((photo) => {
        if (photo?.base64 && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(photo.base64);
        }
      })
      .catch(() => {
        // 캡처 실패(예: 화면 전환 중 언마운트)는 무시하고 다음 프레임 시도
      })
      .finally(scheduleRetry);
  }, []);

  const startCaptureLoop = useCallback(() => {
    if (captureLoopActive.current) return;
    captureLoopActive.current = true;
    captureNext();
  }, [captureNext]);

  useEffect(() => {
    if (!enabled) {
      captureLoopActive.current = false;
      wsRef.current?.close();
      wsRef.current = null;
      setStatus('disconnected');
      setDetection(null);
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      setStatus('connecting');
      const ws = new WebSocket(AI_SERVER_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (cancelled) return;
        setStatus('connected');
        startCaptureLoop();
      };
      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'error') return; // 개별 프레임 에러는 무시하고 다음 프레임 계속
          setDetection(msg);
          announce(msg);
        } catch {
          // 파싱 실패한 메시지는 무시
        }
      };
      ws.onerror = () => { if (!cancelled) setStatus('error'); };
      ws.onclose = () => {
        captureLoopActive.current = false;
        if (cancelled) return;
        setStatus('disconnected');
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS); // 자동 재연결
      };
    };

    connect();

    return () => {
      cancelled = true;
      captureLoopActive.current = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled, startCaptureLoop]);

  return { cameraRef, onCameraReady, pictureSize, status, detection };
}
