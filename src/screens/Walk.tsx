// screens/Walk.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Vibration, StyleSheet } from 'react-native';
import { CameraView } from 'expo-camera';
import { Icon, IconName } from '../Icon';
import { useTheme, useAmbient } from '../theme-context';
import { withAlpha, Level } from '../theme';
import { ModeHeader, StatusPill, CaptionBar, Card, ctrlStyle, GuidanceBanner } from '../ui';
import { SceneView, HapticFlash, SceneObj } from '../Scene';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { useLiveDetection, DetectionMessage } from '../hooks/useLiveDetection';
import { completeWalk } from '../api';
import { GuidanceMessage } from '../hooks/useGuidanceSocket';

interface Scene { level: Level; text: string; sub: string; objects: SceneObj[]; haptic?: boolean; traffic?: 'red' | 'green'; }

const DEFAULT_SCENE: Scene = { level: 'safe', text: '전방을 인식하고 있습니다', sub: '카메라로 실시간 분석 중', objects: [] };
const SCENE_HOLD_MS = 4000; // 새 감지가 없으면 이 시간 뒤 기본 상태로 복귀 (오래된 경고가 화면에 남지 않도록)

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

// AI 서버는 실측 거리가 아니라 0~1 근접도만 주므로, SceneView의 반경(최대 3.6m) 기준으로
// 근접도가 높을수록 가깝게 보이도록 대략적으로 환산 (정확한 거리값이 아닌 시각화용 근사치)
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

// 카메라 미리보기 썸네일 + AI 서버 연결 상태 표시
function CameraStatusRow({ cameraRef, onCameraReady, pictureSize, status, playing }: {
  cameraRef: React.RefObject<CameraView | null>;
  onCameraReady: () => void;
  pictureSize?: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  playing: boolean;
}) {
  const t = useTheme();
  // 일시정지 중에는 disconnected 상태가 정상 동작이므로, "연결 끊김" 경고색이 아니라
  // 중립적인 "일시정지" 표시로 보여준다 (그래야 사용자가 오류로 오해하지 않음)
  const cfg = !playing
    ? { c: t.textDim, label: '일시정지됨' }
    : {
        connecting: { c: t.textDim, label: 'AI 서버 연결 중…' },
        connected: { c: t.status.safe.fg, label: '실시간 인식 중' },
        disconnected: { c: t.status.caution.fg, label: 'AI 서버 연결 끊김 · 재연결 시도 중' },
        error: { c: t.status.danger.fg, label: 'AI 서버에 연결할 수 없습니다' },
      }[status];

  return (
    <View style={styles.cameraRow}>
      <View style={[styles.cameraThumb, { borderColor: t.border, borderWidth: t.borderW }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          pictureSize={pictureSize}
          onCameraReady={onCameraReady}
        />
      </View>
      <View style={styles.cameraStatusInfo}>
        <View style={styles.cameraStatusLabelRow}>
          <View style={[styles.statusDot, { backgroundColor: cfg.c }]} />
          <Text style={[styles.cameraStatusText, { color: cfg.c }]}>{cfg.label}</Text>
        </View>
        {playing && status !== 'connected' ? (
          <Text style={[styles.cameraStatusHint, { color: t.textFaint }]}>
            같은 Wi-Fi에 연결돼 있는지, AI 서버가 켜져 있는지 확인해주세요
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function WalkScreen({ playing, setPlaying, big, guidance }: { playing: boolean; setPlaying: (f: (p: boolean) => boolean | boolean) => void; big?: boolean; guidance?: GuidanceMessage | null }) {
  const t = useTheme();
  const setAmbient = useAmbient();
  const [scene, setScene] = useState<Scene>(DEFAULT_SCENE);
  const [haptic, setHaptic] = useState(false);
  const [walkStartTime, setWalkStartTime] = useState<number | null>(null); // 보행 시작 시각
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const obstacleCountRef = useRef(0); // 보행 중 danger로 감지된 횟수 (보행 기록 저장용)

  const { location, errorMsg, getRoute, getTotalDistance, resetRoute } = useLocationTracking(playing);
  // 보행 "종료" 처리(저장+리셋) 중인지 여부 — 일시정지와 달리 완전한 종결 상태이므로,
  // 저장이 끝나 누적값이 리셋되기 전까지는 "다시 시작"으로 재개할 수 없게 잠근다
  // (레이스: completeWalk() 네트워크 요청이 끝나기 전에 버튼을 눌러 이전 구간 값 위에 새 보행이 겹쳐 쌓이는 것 방지)
  const [ending, setEnding] = useState(false);
  const { cameraRef, onCameraReady, pictureSize, status: aiStatus, detection } = useLiveDetection(playing);

  // 보행이 처음 시작되는 시점의 시각을 기록
  useEffect(() => {
    if (playing && walkStartTime === null) {
      setWalkStartTime(Date.now());
    }
  }, [playing, walkStartTime]);

  // AI 서버가 새 감지 결과를 보내올 때마다 화면 상태 갱신 + 일정 시간 뒤 기본 상태로 복귀
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

  // 보행 종료: 이동 기록을 서버에 저장하고, 다음 보행을 위해 누적값을 리셋
  const handleEndWalk = async () => {
    if (ending) return; // 저장 처리 중 중복 탭 방지(연타 시 completeWalk가 두 번 나가는 것 방지)
    setPlaying(() => false);
    setEnding(true); // 저장이 끝나기 전까지 "다시 시작" 버튼 잠금

    const routeData = getRoute();
    const totalDistance = getTotalDistance();
    const totalTime = walkStartTime ? Math.floor((Date.now() - walkStartTime) / 1000) : 0; // 초 단위
    const obstacleCount = obstacleCountRef.current; // AI가 danger로 감지한 횟수

    try {
      await completeWalk(routeData, totalDistance, totalTime, obstacleCount);
    } catch (e) {
      console.error('보행 기록 저장 실패:', e);
    } finally {
      // "다시 시작"으로 다음 보행이 시작될 때 이전 구간 값이 섞여 WalkLog가
      // 중복/누적 저장되지 않도록, 성공·실패 여부와 무관하게 항상 초기화한다
      obstacleCountRef.current = 0;
      setWalkStartTime(null);
      resetRoute();
      setEnding(false); // 잠금 해제 — 이제부터는 완전히 새로운 보행으로 취급됨
    }
  };

  return (
    <View style={styles.container}>
      <ModeHeader title="일반보행" icon="walk" right={<StatusPill level={scene.level} large />} />

      <CameraStatusRow cameraRef={cameraRef} onCameraReady={onCameraReady} pictureSize={pictureSize} status={aiStatus} playing={playing} />

      <View>
        <SceneView objects={scene.objects} height={300} scanning={playing && aiStatus === 'connected'} />
        <HapticFlash show={haptic} />
      </View>

      {scene.traffic ? <TrafficCard state={scene.traffic} /> : null}

      <GuidanceBanner guidance={guidance ?? null} />

      <CaptionBar level={scene.level} text={scene.text} sub={scene.sub} speaking={playing} big={big} />

      <View style={styles.controlsRow}>
        {/* 종료 처리(저장+리셋) 중에는 비활성화 — 리셋 전에 재개돼 이전 구간이 새 보행에 섞이는 것 방지 */}
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
