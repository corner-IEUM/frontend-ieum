// hooks/useGuidanceSocket.ts — /topic/guidance STOMP 구독. 일반보행/길찾기 공통으로 쓰는 실시간 위험요소 안내 수신
import { useEffect, useState } from 'react';
import { Client } from '@stomp/stompjs';
import { API_BASE_URL } from '../api';

export interface GuidanceMessage {
  kind: string;              // "obstacle" | "crosswalk"
  priority: number;          // 1=즉각위험, 2=결정적순간, 3=일반정보
  message: string;
  meta?: Record<string, unknown>;
}

const GUIDANCE_TTL_MS = 6000; // 화면에 노출을 유지하는 시간

export function useGuidanceSocket(enabled: boolean): GuidanceMessage | null {
  const [guidance, setGuidance] = useState<GuidanceMessage | null>(null);

  useEffect(() => {
    if (!enabled) { setGuidance(null); return; }

    const wsUrl = API_BASE_URL.replace(/^http/, 'ws') + '/ws';
    const client = new Client({
      brokerURL: wsUrl,
      reconnectDelay: 3000,
      onConnect: () => {
        client.subscribe('/topic/guidance', (frame) => {
          try {
            const msg: GuidanceMessage = JSON.parse(frame.body);
            setGuidance(msg);
            setTimeout(() => setGuidance((cur) => (cur === msg ? null : cur)), GUIDANCE_TTL_MS);
          } catch {
            // 파싱 실패한 메시지는 무시
          }
        });
      },
    });
    client.activate();

    return () => { client.deactivate(); setGuidance(null); };
  }, [enabled]);

  return guidance;
}
