// App.tsx — host: theme provider, screen switch, bottom tabs, in-app Tweaks
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StatusBar } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconName } from './src/Icon';
import { ThemeCtx, AmbientCtx } from './src/theme-context';
import { THEMES, DirId, Level, ambientGrad, ACCENTS, Theme } from './src/theme';
import { HomeScreen } from './src/screens/Home';
import { WalkScreen } from './src/screens/Walk';
import { NavigateScreen } from './src/screens/Navigate';
import { SettingsScreen } from './src/screens/Settings';
import { AccountScreen } from './src/screens/Account';
import { CameraGateScreen, CameraTarget } from './src/screens/CameraGate';

type ScreenId = 'home' | 'walk' | 'navigate' | 'settings' | 'account' | 'camera';
const TABS: { id: ScreenId; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: '홈' },
  { id: 'walk', icon: 'walk', label: '일반보행' },
  { id: 'navigate', icon: 'pin', label: '길찾기' },
];

function TabBar({ active, go, t }: { active: ScreenId; go: (s: ScreenId) => void; t: Theme }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 2, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 8, backgroundColor: t.surface, borderTopWidth: t.borderW, borderTopColor: t.border }}>
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <TouchableOpacity key={tab.id} onPress={() => go(tab.id)} style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: t.radiusSm }}>
            <Icon name={tab.icon} size={26} sw={on ? 2.4 : 2} color={on ? t.primary : t.textFaint} />
            <Text style={{ fontSize: 11.5, fontWeight: on ? '800' : '600', color: on ? t.primary : t.textFaint }}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TweaksModal({ visible, onClose, tw, set, t }: { visible: boolean; onClose: () => void; tw: any; set: (k: string, v: any) => void; t: Theme }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,25,50,0.4)' }}>
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: 40, borderWidth: t.borderW, borderColor: t.border, gap: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ flex: 1, fontSize: 20, fontWeight: '900', color: t.text }}>Tweaks</Text>
            <TouchableOpacity onPress={onClose} style={{ width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: t.border }}>
              <Icon name="x" size={18} color={t.textDim} sw={2.4} />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: t.textDim }}>디자인 방향</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['light', 'signal', 'contrast'] as DirId[]).map((d) => {
                const on = tw.direction === d;
                return (
                  <TouchableOpacity key={d} onPress={() => set('direction', d)} style={{ flex: 1, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2, borderWidth: t.borderW, borderColor: on ? t.primary : t.border }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: on ? t.onPrimary : t.textDim }}>{THEMES[d].label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 11.5, color: t.textFaint, lineHeight: 17 }}>기본=화이트 미니멀 · 신호=상태색이 화면을 물들임 · 고대비=흰 바탕+검정(WCAG AAA)</Text>
          </View>

          {tw.direction !== 'contrast' ? (
            <View style={{ gap: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: t.textDim }}>강조색</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {ACCENTS.map((c) => {
                  const on = tw.accent === c;
                  return <TouchableOpacity key={c} onPress={() => set('accent', c)} style={{ width: 44, height: 44, borderRadius: 999, backgroundColor: c, borderWidth: on ? 3 : 0, borderColor: t.surface }} />;
                })}
              </View>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: t.textDim }}>안내</Text>
            {[['autoGuide', '자동 안내 재생'], ['captionBig', '자막 크게']].map(([k, label]) => {
              const on = tw[k];
              return (
                <TouchableOpacity key={k} onPress={() => set(k, !on)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}>
                  <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.text }}>{label}</Text>
                  <View style={{ width: 52, height: 30, borderRadius: 999, backgroundColor: on ? t.primary : t.surface2, borderWidth: t.borderW, borderColor: on ? t.primary : t.border, justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', left: on ? 25 : 3, width: 22, height: 22, borderRadius: 999, backgroundColor: on ? t.onPrimary : t.textDim }} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function IeumApp() {
  const [tw, setTw] = useState({ direction: 'light' as DirId, accent: '#2f6bff', autoGuide: true, captionBig: false });
  const set = (k: string, v: any) => setTw((p) => ({ ...p, [k]: v }));
  const [screen, setScreen] = useState<ScreenId>('home');
  const [showRec, setShowRec] = useState(true);
  const [playing, setPlaying] = useState(true);
  const [ambient, setAmbient] = useState<Level | 'idle'>('idle');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<CameraTarget>('walk');

  React.useEffect(() => { setPlaying(tw.autoGuide); }, [tw.autoGuide]);

  const base = THEMES[tw.direction];
  const theme: Theme = useMemo(() => (base.id === 'contrast' ? base : { ...base, primary: tw.accent }), [base, tw.accent]);
  const grad = base.id === 'signal' ? ambientGrad(base, ambient) : base.bgGrad;

  const go = (s: string) => {
    setAmbient('idle');
    if (s === 'walk' || s === 'navigate') { setCameraTarget(s); setScreen('camera'); return; }
    setScreen(s as ScreenId);
  };
  const goHome = () => go('home');

  const screens: Record<ScreenId, React.ReactNode> = {
    home: <HomeScreen go={go} showRec={showRec} setShowRec={setShowRec} />,
    walk: <WalkScreen playing={playing} setPlaying={setPlaying as any} big={tw.captionBig} />,
    navigate: <NavigateScreen playing={playing} big={tw.captionBig} />,
    settings: <SettingsScreen onBack={goHome} />,
    account: <AccountScreen onBack={goHome} />,
    camera: <CameraGateScreen target={cameraTarget} onScanned={() => setScreen(cameraTarget)} onCancel={goHome} />,
  };

  return (
    <ThemeCtx.Provider value={theme}>
      <AmbientCtx.Provider value={setAmbient}>
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <StatusBar barStyle="dark-content" />
          <LinearGradient colors={(grad.length > 1 ? grad : [grad[0], grad[0]]) as [string, string, ...string[]]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            {screen === 'camera' ? (
              <View style={{ flex: 1 }}>{screens[screen]}</View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                {screens[screen]}
              </ScrollView>
            )}
            {screen === 'home' || screen === 'walk' || screen === 'navigate' ? <TabBar active={screen} go={go} t={theme} /> : null}
          </SafeAreaView>

          {/* floating Tweaks button */}
          <TouchableOpacity onPress={() => setTweaksOpen(true)} style={{ position: 'absolute', right: 16, bottom: 96, width: 56, height: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary, shadowColor: '#16213c', shadowOpacity: 0.28, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 8 }}>
            <Icon name="tune" size={26} color={theme.onPrimary} sw={2.2} />
          </TouchableOpacity>

          <TweaksModal visible={tweaksOpen} onClose={() => setTweaksOpen(false)} tw={tw} set={set} t={theme} />
        </View>
      </AmbientCtx.Provider>
    </ThemeCtx.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <IeumApp />
    </SafeAreaProvider>
  );
}
