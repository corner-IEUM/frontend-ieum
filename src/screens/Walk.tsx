// screens/Walk.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Vibration } from 'react-native';
import { Icon } from '../Icon';
import { useTheme, useAmbient } from '../theme-context';
import { withAlpha, Level } from '../theme';
import { ModeHeader, StatusPill, CaptionBar, Card, ctrlStyle } from '../ui';
import { SceneView, HapticFlash, SceneObj } from '../Scene';

interface Scene { level: Level; text: string; sub: string; objects: SceneObj[]; haptic?: boolean; traffic?: 'red' | 'green'; }

const WALK_SCENES: Scene[] = [
  { level: 'safe', text: '전방 안전합니다. 직진하세요.', sub: '점자블록을 따라 이동 중', objects: [
    { id: 'p1', icon: 'person', label: '행인', dist: 4.8, bearing: -0.5, level: 'safe' },
  ] },
  { level: 'caution', text: '전방 2m, 자전거 주의', sub: '오른쪽으로 살짝 비켜 이동하세요', objects: [
    { id: 'b1', icon: 'bike', label: '자전거', dist: 2.0, bearing: 0.15, level: 'caution' },
    { id: 'p2', icon: 'person', label: '행인', dist: 3.6, bearing: -0.6, level: 'safe' },
  ] },
  { level: 'danger', haptic: true, text: '위험! 전방 1m 킥보드', sub: '멈추세요. 강한 진동으로 경고합니다', objects: [
    { id: 'k1', icon: 'bike', label: '킥보드', dist: 0.9, bearing: -0.05, level: 'danger' },
    { id: 'p3', icon: 'person', label: '행인', dist: 3.0, bearing: 0.5, level: 'safe' },
  ] },
  { level: 'caution', traffic: 'red', text: '횡단보도입니다. 빨간불.', sub: '음향신호기 12시 방향 2m', objects: [
    { id: 'c1', icon: 'person', label: '대기 행인', dist: 1.6, bearing: 0.4, level: 'safe' },
  ] },
  { level: 'safe', traffic: 'green', text: '초록불입니다. 건너세요.', sub: '보행 14초 남음 · 직진', objects: [] },
];

function TrafficCard({ state }: { state: 'red' | 'green' }) {
  const t = useTheme();
  const cfg = state === 'red'
    ? { c: t.status.danger.fg, label: '빨간불 · 대기', text: '잠시 기다려 주세요' }
    : { c: t.status.safe.fg, label: '초록불 · 보행', text: '음향신호기 작동 중 · 길을 건너세요' };
  return (
    <Card pad={16} tone={withAlpha(cfg.c, 0.6)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ gap: 6, padding: 7, borderRadius: 12, backgroundColor: '#222a3a', borderWidth: 1, borderColor: t.border }}>
        {(['red', 'green'] as const).map((sgn) => {
          const col = sgn === 'red' ? t.status.danger.fg : t.status.safe.fg;
          const on = sgn === state;
          return <View key={sgn} style={{ width: 16, height: 16, borderRadius: 999, backgroundColor: on ? col : 'transparent', borderWidth: 2, borderColor: on ? col : t.textFaint, opacity: on ? 1 : 0.4 }} />;
        })}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="traffic" size={18} color={cfg.c} sw={2.1} />
          <Text style={{ fontSize: 16, fontWeight: '800', color: cfg.c }}>{cfg.label}</Text>
        </View>
        <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.textDim, marginTop: 3 }}>{cfg.text}</Text>
      </View>
    </Card>
  );
}

export function WalkScreen({ playing, setPlaying, big }: { playing: boolean; setPlaying: (f: (p: boolean) => boolean | boolean) => void; big?: boolean }) {
  const t = useTheme();
  const setAmbient = useAmbient();
  const [i, setI] = useState(0);
  const [haptic, setHaptic] = useState(false);
  const scene = WALK_SCENES[i];

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setI((v) => (v + 1) % WALK_SCENES.length), 3400);
    return () => clearTimeout(id);
  }, [i, playing]);

  useEffect(() => {
    setAmbient(scene.level);
    if (scene.haptic) {
      setHaptic(true);
      Vibration.vibrate([0, 200, 90, 200]);
      const id = setTimeout(() => setHaptic(false), 1400);
      return () => clearTimeout(id);
    }
    setHaptic(false);
  }, [i]);

  const step = (d: number) => { setPlaying(() => false); setI((v) => (v + d + WALK_SCENES.length) % WALK_SCENES.length); };

  return (
    <View style={{ padding: 18, paddingTop: 4, gap: 14 }}>
      <ModeHeader title="일반보행" icon="walk" right={<StatusPill level={scene.level} large />} />

      <View>
        <SceneView objects={scene.objects} height={300} scanning={playing} />
        <HapticFlash show={haptic} />
      </View>

      {scene.traffic ? <TrafficCard state={scene.traffic} /> : null}

      <CaptionBar level={scene.level} text={scene.text} sub={scene.sub} speaking={playing} big={big} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
        <TouchableOpacity onPress={() => step(-1)} style={ctrlStyle(t)}><Icon name="chevronL" size={22} color={t.text} sw={2.4} /></TouchableOpacity>
        <TouchableOpacity onPress={() => setPlaying((p) => !p)} style={[ctrlStyle(t), { flex: 1, gap: 8 }]}>
          <Text style={{ fontWeight: '800', fontSize: 15, color: t.text }}>{playing ? '일시정지' : '자동 안내'}</Text>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {WALK_SCENES.map((_, k) => <View key={k} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 999, backgroundColor: k === i ? t.primary : t.border }} />)}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => step(1)} style={ctrlStyle(t)}><Icon name="chevron" size={22} color={t.text} sw={2.4} /></TouchableOpacity>
      </View>
    </View>
  );
}
