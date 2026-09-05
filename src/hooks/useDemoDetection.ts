// hooks/useDemoDetection.ts — 데모 모드(사전 녹화 영상 기반 /ws/detect)용 훅.
//
// AI 서버의 /ws/detect는 서버가 자체적으로 config.VIDEO_SOURCE(기본 data/demo.mp4)를
// 읽어 감지 결과를 계속 push해준다 (server.py의 detect_stream 참고). 따라서 useLiveDetection과
// 달리 카메라 프레임을 캡처해서 보낼 필요가 없고, 연결만 유지한 채 메시지를 받기만 하면 된다.
//
// 응답 JSON은 /ws/detect/live와 동일하게 notifier.build_message()를 재사용하므로
// DetectionMessage 스키마가 동일하다 — Walk.tsx의 sceneFromDetection/obstacleCount 로직을
// 그대로 재사용할 수 있도록 이 훅도 같은 타입과 announce(TTS) 동작을 따른다.
import { useEffect, useRef, useState } from 'react';
import { AI_SERVER_DEMO_WS_URL } from '../api';
import { speakWithPriority } from '../tts';
import { DetectionMessage, LiveConnectionStatus } from './useLiveDetection';

const RECONNECT_DELAY_MS = 2000;

function announce(msg: DetectionMessage) {
  return speakWithPriority(msg.message, msg.priority <= 1);
}

export function useDemoDetection(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);

  const [status, setStatus] = useState<LiveConnectionStatus>('disconnected');
  const [detection, setDetection] = useState<DetectionMessage | null>(null);

  useEffect(() => {
    if (!enabled) {
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
      console.log('[데모모드] WS 연결 시도:', AI_SERVER_DEMO_WS_URL);
      const ws = new WebSocket(AI_SERVER_DEMO_WS_URL);
      wsRef.current = ws;

      ws.onopen = () => { if (!cancelled) { console.log('[데모모드] WS 연결됨:', AI_SERVER_DEMO_WS_URL); setStatus('connected'); } };
      ws.onmessage = (e) => {
        if (cancelled) return;
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'error') return; // 개별 프레임 에러는 무시하고 다음 메시지 계속
          setDetection(msg);
          announce(msg);
        } catch {
          // 파싱 실패한 메시지는 무시
        }
      };
      // RN WebSocket의 error 이벤트는 브라우저와 달리 종종 메시지를 담고 있음(예: 연결 거부/호스트 도달 불가) —
      // 콘솔에 남겨야 "IP가 틀렸다" 같은 원인을 실기기에서도 바로 알 수 있다
      ws.onerror = (e) => {
        if (cancelled) return;
        console.error('[데모모드] WS 연결 실패:', AI_SERVER_DEMO_WS_URL, (e as any)?.message ?? e);
        setStatus('error');
      };
      ws.onclose = (e) => {
        if (cancelled) return;
        console.log('[데모모드] WS 종료(재연결 예정):', AI_SERVER_DEMO_WS_URL, 'code=', e.code, 'reason=', e.reason);
        setStatus('disconnected');
        // 데모 영상이 끝(EOF)나도 서버가 소켓을 닫으므로, 반복 시청을 위해 자동 재연결한다
        reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [enabled]);

  return { status, detection };
}
