// DemoVideoFeed.tsx — 데모 모드에서 라이브 카메라 자리에 대신 보여줄, 실제로 재생되는 데모 영상.
// AI 서버가 정적으로 내려주는 demo.mp4(ai/server.py의 /media 마운트, DEMO_VIDEO_URL)를 그대로
// 스트리밍 재생한다 — 감지에 쓰는 소스와 동일 파일이라 "지금 이 화면이 분석되고 있다"는 감이 살아있음.
import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { DEMO_VIDEO_URL } from './api';

export function DemoVideoFeed({ style }: { style?: ViewStyle }) {
  const player = useVideoPlayer(DEMO_VIDEO_URL, (p) => {
    p.loop = true;
    p.muted = true; // 안내 음성(TTS)과 겹치지 않도록 영상 자체 소리는 끔
    p.play();
  });

  // 로딩/재생 실패(잘못된 URL, 서버 응답 없음 등) 원인을 화면에서 바로 알 수 있도록 로그로 남긴다
  useEffect(() => {
    console.log('[데모모드] 영상 소스:', DEMO_VIDEO_URL);
    const sub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'error') {
        console.error('[데모모드] 영상 재생 실패:', DEMO_VIDEO_URL, error?.message ?? error);
      } else {
        console.log('[데모모드] 영상 상태:', status);
      }
    });
    return () => sub.remove();
  }, [player]);

  return (
    <VideoView
      style={[StyleSheet.absoluteFill, style]}
      player={player}
      nativeControls={false}
      contentFit="cover"
      pointerEvents="none"
    />
  );
}
