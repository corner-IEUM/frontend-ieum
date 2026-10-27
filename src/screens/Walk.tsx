// screens/Walk.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Vibration, StyleSheet, Alert } from 'react-native';
import { CameraView } from 'expo-camera';
import { Icon, IconName } from '../Icon';
import { useTheme, useAmbient } from '../theme-context';
import { withAlpha, Level } from '../theme';
import { ModeHeader, StatusPill, CaptionBar, Card, ctrlStyle, GuidanceBanner } from '../ui';
import { SceneView, HapticFlash, SceneObj } from '../Scene';
import { DemoVideoFeed } from '../DemoVideoFeed';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useLiveDetection, DetectionMessage } from '../hooks/useLiveDetection';
import { useDemoDetection } from '../hooks/useDemoDetection';
import { completeWalk, AuthExpiredError } from '../api';
import { GuidanceMessage } from '../hooks/useGuidanceSocket';
import { useVoiceCommand, type VoiceCommandApi } from '../hooks/useVoiceCommand';
import { VoiceControls } from '../VoiceUi';
import { announceText } from '../transit/feedback';
import { VOICE } from '../transit/voiceMessages';

interface Scene { level: Level; text: string; sub: string; objects: SceneObj[]; haptic?: boolean; traffic?: 'red' | 'green'; }

const DEFAULT_SCENE: Scene = { level: 'safe', text: '전방을 인식하고 있습니다', sub: '카메라로 실시간 분석 중', objects: [] };
const SCENE_HOLD_MS = 4000;

// YOLO 클래스명 -> 아이콘 (매핑에 없는 클래스는 일반 경고 아이콘으로 대체)
const CLASS_ICON: Record<string, IconName> = {
  person: 'person',
  bicycle: 'bike',
  motorcycle: 'bike',
  bus: 'bus',
  'traffic light': 'traffic',
};
const iconForClass = (cls?: string): IconName => (cls && CLASS_ICON[cls]) || 'alert';

// 방향 문자열 -> SceneView가 쓰는 bearing 값 (기존 데모 데이터의 좌/중/우 값 범위를 그대로 따름)
const DIRECTION_BEARING: Record<string, number> = { '왼쪽': -0.5, '정면': 0, '오른쪽': 0.5 };

// 0~1 근접도를 SceneView 반경 기준 거리로 근사 환산
const proximityToMeters = (p: number) => Math.max(0.3, 3.6 * (1 - p));

function levelFromPriority(priority: number): Level {
  if (priority <= 1) return 'danger';
  if (priority === 2) return 'caution';
  return 'safe';
}

function sceneFromDetection(d: DetectionMessage): Scene {
  const meta = d.meta ?? {};
  const level = levelFromPriority(d.priority);
  const proximity = typeof meta.proximity === 'number' ? meta.proximity : 0;
  const bearing = meta.direction ? (DIRECTION_BEARING[meta.direction] ?? 0) : 0;

  const object: SceneObj = {
    id: `t${meta.track_id ?? 0}`,
    icon: iconForClass(meta.class),
    label: meta.class ?? '객체',
    dist: proximityToMeters(proximity),
    bearing,
    level,
  };

  const traffic: 'red' | 'green' | undefined =
    meta.light_color === 'red' ? 'red' : meta.light_color === 'green' ? 'green' : undefined;

  return {
    level,
    text: d.message,
    sub: traffic
      ? (traffic === 'red' ? '잠시 기다려 주세요' : '길을 건너세요')
      : `${meta.direction ?? '전방'} · 근접도 ${Math.round(proximity * 100)}%`,
    objects: [object],
    haptic: level === 'danger',
    traffic,
  };
}

function TrafficCard({ state }: { state: 'red' | 'green' }) {
  const t = useTheme();
  const cfg = state === 'red'
    ? { c: t.status.danger.fg, label: '빨간불 · 대기', text: '잠시 기다려 주세요' }
    : { c: t.status.safe.fg, label: '초록불 · 보행', text: '음향신호기 작동 중 · 길을 건너세요' };
  return (
    <Card pad={16} tone={withAlpha(cfg.c, 0.6)} style={styles.trafficCard}>
      <View style={[styles.signalBox, { borderColor: t.border }]}>
        {(['red', 'green'] as const).map((sgn) => {
          const col = sgn === 'red' ? t.status.danger.fg : t.status.safe.fg;
          const on = sgn === state;
          return <View key={sgn} style={[styles.signalDot, { backgroundColor: on ? col : 'transparent', borderColor: on ? col : t.textFaint, opacity: on ? 1 : 0.4 }]} />;
        })}
      </View>
      <View style={styles.trafficInfo}>
        <View style={styles.trafficLabelRow}>
          <Icon name="traffic" size={18} color={cfg.c} sw={2.1} />
          <Text style={[styles.trafficLabel, { color: cfg.c }]}>{cfg.label}</Text>
        </View>
        <Text style={[styles.trafficText, { color: t.textDim }]}>{cfg.text}</Text>
      </View>
    </Card>
  );
}

// AI 서버 연결 상태 표시 (인식 모드 전환은 CameraGateScreen에서)
function CameraStatusRow({ status, playing, demo }: {
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  playing: boolean;
  demo: boolean;
}) {
  const t = useTheme();
  const cfg = !playing
    ? { c: t.textDim, label: '일시정지됨' }
    : {
        connecting: { c: t.textDim, label: demo ? '데모 서버 연결 중…' : 'AI 서버 연결 중…' },
        connected: { c: t.status.safe.fg, label: demo ? '데모 영상 인식 중' : '실시간 인식 중' },
        disconnected: { c: t.status.caution.fg, label: 'AI 서버 연결 끊김 · 재연결 시도 중' },
        error: { c: t.status.danger.fg, label: 'AI 서버에 연결할 수 없습니다' },
      }[status];

  return (
    <View style={styles.cameraRow}>
      <View style={[styles.cameraThumb, { borderColor: t.border, borderWidth: t.borderW }]}>
        <View style={[StyleSheet.absoluteFill, styles.demoThumb]}>
          <Icon name={demo ? 'eye' : 'camera'} size={26} color={t.textFaint} sw={1.8} />
        </View>
      </View>
      <View style={styles.cameraStatusInfo}>
        <View style={styles.cameraStatusLabelRow}>
          <View style={[styles.statusDot, { backgroundColor: cfg.c }]} />
          <Text style={[styles.cameraStatusText, { color: cfg.c }]}>{cfg.label}</Text>
        </View>
        {demo ? (
          <Text style={[styles.cameraStatusHint, { color: t.textFaint }]}>
            데모 모드 · demo.mp4 사전 녹화 영상 기반 (카메라 미사용)
          </Text>
        ) : playing && status !== 'connected' ? (
          <Text style={[styles.cameraStatusHint, { color: t.textFaint }]}>
            같은 Wi-Fi에 연결돼 있는지, AI 서버가 켜져 있는지 확인해주세요
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function WalkScreen({ playing, setPlaying, big, guidance, demoMode }: { playing: boolean; setPlaying: (f: (p: boolean) => boolean | boolean) => void; big?: boolean; guidance?: GuidanceMessage | null; demoMode: boolean }) {
  const t = useTheme();
  const setAmbient = useAmbient();
  const [scene, setScene] = useState<Scene>(DEFAULT_SCENE);
  const [haptic, setHaptic] = useState(false);
  const [walkStartTime, setWalkStartTime] = useState<number | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const obstacleCountRef = useRef(0);

  const { location, errorMsg, getRoute, getTotalDistance, resetRoute } = useLocationTracking(playing);
  // 보행 종료(저장+리셋) 처리 중 여부 — 끝나기 전에는 재시작 잠금
  const [ending, setEnding] = useState(false);
  const { cameraRef, onCameraReady, pictureSize, status: liveStatus, detection: liveDetection } = useLiveDetection(!demoMode && playing);
  const { status: demoStatus, detection: demoDetection } = useDemoDetection(demoMode && playing);
  const aiStatus = demoMode ? demoStatus : liveStatus;
  const detection = demoMode ? demoDetection : liveDetection;

  useEffect(() => {
    if (playing && walkStartTime === null) {
      setWalkStartTime(Date.now());
    }
  }, [playing, walkStartTime]);

  useEffect(() => {
    if (!detection) return;
    if (detection.priority <= 1) obstacleCountRef.current += 1;

    setScene(sceneFromDetection(detection));

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => setScene(DEFAULT_SCENE), SCENE_HOLD_MS);

    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, [detection]);

  useEffect(() => {
    setAmbient(scene.level);
    if (scene.haptic) {
      setHaptic(true);
      Vibration.vibrate([0, 200, 90, 200]);
      const id = setTimeout(() => setHaptic(false), 1400);
      return () => clearTimeout(id);
    }
    setHaptic(false);
  }, [scene]);

  const handleEndWalk = async () => {
    if (ending) return;
    setPlaying(() => false);
    setEnding(true);

    const routeData = getRoute();
    const totalDistance = getTotalDistance();
    const totalTime = walkStartTime ? Math.floor((Date.now() - walkStartTime) / 1000) : 0;
    const obstacleCount = obstacleCountRef.current;

    try {
      await completeWalk(routeData, totalDistance, totalTime, obstacleCount);
    } catch (e) {
      if (e instanceof AuthExpiredError) {
        Alert.alert('기록이 저장되지 않았습니다', '로그인하면 보행 기록이 저장됩니다.');
      } else {
        console.error('보행 기록 저장 실패:', e);
      }
    } finally {
      obstacleCountRef.current = 0;
      setWalkStartTime(null);
      resetRoute();
      setEnding(false);
    }
  };

  // 음성: "보행 종료/끝/그만" → "기록을 저장할까요?" 재확인 → 긍정이면 기존 handleEndWalk. 청취는 마이크 버튼으로만 시작하고 긴급 안내 중에는 시작/유지하지 않는다
  const voiceRef = useRef<VoiceCommandApi | null>(null);
  const voice = useVoiceCommand('walk', {
    END_WALK: async () => {
      if (ending) return;
      const answer = await voiceRef.current?.confirm(VOICE.confirmEndWalk);
      if (answer === 'YES') { announceText(VOICE.walkEnded, false); await handleEndWalk(); }
      else if (answer === 'NO') announceText(VOICE.walkContinue, false);
    },
  });
  voiceRef.current = voice;

  return (
    <View style={styles.container}>
      <ModeHeader title="일반보행" icon="walk" right={<StatusPill level={scene.level} large />} />

      <CameraStatusRow status={aiStatus} playing={playing} demo={demoMode} />

      <View>
        <SceneView
          objects={scene.objects}
          height={300}
          scanning={playing && aiStatus === 'connected'}
          background={demoMode
            ? <DemoVideoFeed />
            : <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" pictureSize={pictureSize} onCameraReady={onCameraReady} />}
        />
        <HapticFlash show={haptic} />
      </View>

      {scene.traffic ? <TrafficCard state={scene.traffic} /> : null}

      <GuidanceBanner guidance={guidance ?? null} />

      <CaptionBar level={scene.level} text={scene.text} sub={scene.sub} speaking={playing} big={big} />

      <View style={styles.controlsRow}>
        <TouchableOpacity onPress={() => setPlaying((p) => !p)} disabled={ending} style={[ctrlStyle(t), styles.playButtonInner, ending ? styles.disabled : null]}>
          <Text style={[styles.playLabel, { color: t.text }]}>{ending ? '저장 중…' : playing ? '일시정지' : '다시 시작'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        onPress={handleEndWalk}
        disabled={ending}
        style={[ctrlStyle(t), styles.endButton, { borderColor: t.status.danger.fg }, ending ? styles.disabled : null]}
      >
        <Text style={[styles.endButtonLabel, { color: t.status.danger.fg }]}>보행 종료</Text>
      </TouchableOpacity>

      <VoiceControls
        available={voice.available}
        listening={voice.listening}
        permissionDenied={voice.permissionDenied}
        label="음성으로 보행 종료"
        onToggle={() => { if (voice.listening) voice.stop(); else voice.start(VOICE.walkPrompt); }}
        onOpenSettings={voice.openSettings}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  trafficCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  signalBox: { gap: 6, padding: 7, borderRadius: 12, backgroundColor: '#222a3a', borderWidth: 1 },
  signalDot: { width: 16, height: 16, borderRadius: 999, borderWidth: 2 },
  trafficInfo: { flex: 1 },
  trafficLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  trafficLabel: { fontSize: 16, fontWeight: '800' },
  trafficText: { fontSize: 14.5, fontWeight: '600', marginTop: 3 },
  container: { padding: 18, paddingTop: 4, gap: 14 },
  cameraRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cameraThumb: { width: 72, height: 96, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' },
  demoThumb: { alignItems: 'center', justifyContent: 'center' },
  cameraStatusInfo: { flex: 1, gap: 4 },
  cameraStatusLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  cameraStatusText: { fontSize: 14, fontWeight: '800' },
  cameraStatusHint: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  disabled: { opacity: 0.5 },
  playButtonInner: { flex: 1, gap: 8 },
  playLabel: { fontWeight: '800', fontSize: 15 },
  endButton: { width: '100%', marginTop: 2 },
  endButtonLabel: { fontWeight: '800', fontSize: 15 },
});
