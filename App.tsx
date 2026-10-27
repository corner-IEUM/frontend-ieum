// App.tsx — host: theme provider, screen switch, bottom tabs, in-app Tweaks
import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, StatusBar, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Icon, IconName } from './src/Icon';
import { ThemeCtx, AmbientCtx } from './src/theme-context';
import { THEMES, DirId, Level, ambientGrad, Theme } from './src/theme';
import { HomeScreen } from './src/screens/Home';
import { WalkScreen } from './src/screens/Walk';
import { NavigateScreen } from './src/screens/Navigate';
import { SettingsScreen } from './src/screens/Settings';
import { AccountScreen } from './src/screens/Account';
import { CameraGateScreen } from './src/screens/CameraGate';
import { PlaceSearchScreen } from './src/screens/PlaceSearch';
import { RouteCandidatesScreen } from './src/screens/RouteCandidates';
import { TransitCandidatesScreen } from './src/screens/TransitCandidates';
import { TransitGuideScreen } from './src/screens/TransitGuide';
import { toTransitPlace } from './src/transit/types';
import { useTransitNavigation } from './src/hooks/useTransitNavigation';
import { TransitConfirmBar } from './src/transit/ConfirmBar';
import { expoSttAdapter } from './src/transit/expoSttAdapter';
import { WalkLogHistoryScreen } from './src/screens/WalkLogHistory';
import { NavigationHistoryScreen } from './src/screens/NavigationHistory';
import { Place, RouteCandidate, RouteResponse, searchRouteCandidates, createRoute, checkNearbyHazards, completeNavigation, AuthExpiredError, getToken, getMyInfo, DEFAULT_DEMO_MODE } from './src/api';
import { useLocationTracking } from './src/hooks/useLocationTracking';
import { useGuidanceSocket } from './src/hooks/useGuidanceSocket';

type ScreenId = 'home' | 'walk' | 'navigate' | 'settings' | 'account' | 'camera' | 'placeSearch' | 'routeCandidates' | 'transitCandidates' | 'transitGuide' | 'walkLogHistory' | 'navigationHistory';
type UserInfo = { nickname: string; email: string };
const TABS: { id: ScreenId; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: '홈' },
  { id: 'walk', icon: 'walk', label: '일반보행' },
  { id: 'navigate', icon: 'pin', label: '길찾기' },
  { id: 'walkLogHistory', icon: 'clock', label: '기록' },
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
  const [authed, setAuthed] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  React.useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          const me = await getMyInfo();
          setUserInfo({ nickname: me.nickname, email: me.email });
          setAuthed(true);
        } catch (e) {
          setAuthed(false);
        }
      }
      setCheckingAuth(false);
    })();
  }, []);

  const handleAuthChange = (isAuthed: boolean, info?: UserInfo | null) => {
    setAuthed(isAuthed);
    setUserInfo(info ?? null);
  };

  // 토큰 만료(401/403) 시 사용자에게 안내하고 계정 화면으로 전환
  const handleAuthExpired = () => {
    setAuthed(false);
    setUserInfo(null);
    Alert.alert('로그인이 만료되었습니다', '다시 로그인해주세요');
    setScreen('account');
  };
  // 게스트의 401/403은 무시하고, 로그인돼 있던 세션이 끊긴 경우에만 로그인 화면으로 전환
  const handleMaybeAuthExpired = () => {
    if (authed) handleAuthExpired();
  };
  const [showRec, setShowRec] = useState(true);
  // 일반보행 인식 모드(실시간 카메라 / 데모 영상)
  const [demoMode, setDemoMode] = useState(DEFAULT_DEMO_MODE);
  const [playing, setPlaying] = useState(true);
  const [ambient, setAmbient] = useState<Level | 'idle'>('idle');
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const { location: currentLocation } = useLocationTracking(true);
  const [origin, setOrigin] = useState<Place | null>(null);
  const [destination, setDestination] = useState<Place | null>(null);
  const [searchTarget, setSearchTarget] = useState<'origin' | 'destination'>('destination');
  const effectiveOrigin: Place | null = origin ?? (currentLocation
    ? { placeName: '현재 위치', roadAddress: '', lng: currentLocation.longitude, lat: currentLocation.latitude, distance: null }
    : null);

  const [candidateQuery, setCandidateQuery] = useState<{ origin: Place; destination: Place } | null>(null);
  const [candidates, setCandidates] = useState<RouteCandidate[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);

  const fetchCandidates = async (o: Place, d: Place) => {
    setCandidateQuery({ origin: o, destination: d });
    setScreen('routeCandidates');
    setCandidatesLoading(true);
    setCandidatesError(null);
    setCandidates(null);
    try {
      const result = await searchRouteCandidates(o.lng, o.lat, d.lng, d.lat);
      setCandidates(result);
    } catch (e) {
      if (e instanceof AuthExpiredError) { handleMaybeAuthExpired(); }
      setCandidatesError('경로 후보를 불러오지 못했습니다');
    } finally {
      setCandidatesLoading(false);
    }
  };

  // 대중교통 출발/도착 (새 객체면 재조회되므로 메모이즈) / Memoized so new objects don't retrigger fetch
  const transitQuery = useMemo(() => candidateQuery
    ? { origin: toTransitPlace(candidateQuery.origin), destination: toTransitPlace(candidateQuery.destination) }
    : null, [candidateQuery]);
  // 대중교통 leg 상태 관리 — 앱 재시작 시 저장된 세션 id로 복구 / Transit leg state; restores session after restart
  const transitNav = useTransitNavigation({
    enabled: authed,
    onAuthExpired: handleMaybeAuthExpired,
    onRestored: () => setScreen('transitGuide'),
  });

  const [activeRoute, setActiveRoute] = useState<RouteResponse | null>(null);
  const [routeCreating, setRouteCreating] = useState(false);
  const [routeCreateError, setRouteCreateError] = useState<string | null>(null);

  const selectCandidate = async (c: RouteCandidate): Promise<boolean> => {
    if (!candidateQuery) return false;
    setRouteCreating(true);
    setRouteCreateError(null);
    try {
      const route = await createRoute(candidateQuery.origin.lng, candidateQuery.origin.lat, candidateQuery.destination.lng, candidateQuery.destination.lat, c.searchOption);
      setActiveRoute(route);
      setNavCompleted(false);
      setNavCompleteError(null);
      setScreen('navigate');
      return true;
    } catch (e) {
      if (e instanceof AuthExpiredError) { handleMaybeAuthExpired(); }
      setRouteCreateError('경로 생성에 실패했습니다.');
      return false;
    } finally {
      setRouteCreating(false);
    }
  };

  // 경로 이탈 시 현재 GPS 위치를 출발지로 재탐색
  const handleDeviated = () => {
    if (!currentLocation || !destination) return;
    const liveOrigin: Place = { placeName: '현재 위치', roadAddress: '', lng: currentLocation.longitude, lat: currentLocation.latitude, distance: null };
    fetchCandidates(liveOrigin, destination);
  };

  const [navCompleting, setNavCompleting] = useState(false);
  const [navCompleteError, setNavCompleteError] = useState<string | null>(null);
  const [navCompleted, setNavCompleted] = useState(false);

  const completeNav = async () => {
    if (!activeRoute) return;
    setNavCompleting(true);
    setNavCompleteError(null);
    try {
      await completeNavigation(activeRoute.navigationId, 0, true);
      setNavCompleted(true);
    } catch (e) {
      if (e instanceof AuthExpiredError) { handleMaybeAuthExpired(); }
      setNavCompleteError('완료 처리에 실패했습니다.');
    } finally {
      setNavCompleting(false);
    }
  };

  React.useEffect(() => { setPlaying(tw.autoGuide); }, [tw.autoGuide]);

  const hazardActive = screen === 'walk' || screen === 'navigate';
  const guidance = useGuidanceSocket(hazardActive);
  React.useEffect(() => {
    if (!hazardActive || !currentLocation) return;
    checkNearbyHazards(currentLocation.longitude, currentLocation.latitude).catch((e) => {
      if (e instanceof AuthExpiredError) handleMaybeAuthExpired();
    });
  }, [hazardActive, currentLocation]);

  const base = THEMES[tw.direction];
  const theme: Theme = useMemo(() => (base.id === 'contrast' ? base : { ...base, primary: tw.accent }), [base, tw.accent]);
  const grad = base.id === 'signal' ? ambientGrad(base, ambient) : base.bgGrad;

  const go = (s: string) => {
    const target = s as ScreenId;
    setAmbient('idle');
    if (target === 'walk') { setScreen('camera'); return; }
    setScreen(target);
  };
  const goHome = () => go('home');

  const screens: Record<ScreenId, React.ReactNode> = {
    home: <HomeScreen go={go} showRec={showRec} setShowRec={setShowRec} />,
    walk: <WalkScreen playing={playing} setPlaying={setPlaying as any} big={tw.captionBig} guidance={guidance} demoMode={demoMode} />,
    navigate: (
      <NavigateScreen
        playing={playing}
        big={tw.captionBig}
        origin={effectiveOrigin}
        destination={destination}
        route={activeRoute}
        guidance={guidance}
        currentLocation={currentLocation}
        onDeviated={handleDeviated}
        onRetryRoute={() => { if (destination && effectiveOrigin) fetchCandidates(effectiveOrigin, destination); }}
        onSearchOrigin={() => { setSearchTarget('origin'); setScreen('placeSearch'); }}
        onSearchDestination={() => { setSearchTarget('destination'); setScreen('placeSearch'); }}
        onComplete={completeNav}
        completing={navCompleting}
        completed={navCompleted}
        completeError={navCompleteError}
      />
    ),
    settings: <SettingsScreen onBack={goHome} />,
    account: <AccountScreen onBack={goHome} authed={authed} checkingAuth={checkingAuth} userInfo={userInfo} onAuthChange={handleAuthChange} />,
    camera: <CameraGateScreen target="walk" onScanned={() => setScreen('walk')} onCancel={goHome} demoMode={demoMode} onDemoModeChange={setDemoMode} />,
    placeSearch: (
      <PlaceSearchScreen
        title={searchTarget === 'origin' ? '출발지 검색' : '목적지 검색'}
        placeholder={searchTarget === 'origin' ? '출발지를 입력하세요' : '목적지를 입력하세요'}
        currentLocation={currentLocation}
        onSelect={(p) => {
          if (searchTarget === 'origin') {
            setOrigin(p);
            if (destination) fetchCandidates(p, destination); else setScreen('navigate');
          } else {
            setDestination(p);
            if (effectiveOrigin) fetchCandidates(effectiveOrigin, p); else setScreen('navigate');
          }
        }}
        onCancel={() => setScreen('navigate')}
        onAuthExpired={handleMaybeAuthExpired}
      />
    ),
    routeCandidates: (
      <RouteCandidatesScreen
        origin={candidateQuery?.origin}
        destination={candidateQuery?.destination}
        candidates={candidates}
        loading={candidatesLoading}
        error={candidatesError}
        onRetry={() => candidateQuery && fetchCandidates(candidateQuery.origin, candidateQuery.destination)}
        onSelect={selectCandidate}
        onTransit={() => setScreen('transitCandidates')}
        onBack={() => setScreen('navigate')}
        creating={routeCreating}
        createError={routeCreateError}
      />
    ),
    transitCandidates: transitQuery ? (
      <TransitCandidatesScreen
        origin={transitQuery.origin}
        destination={transitQuery.destination}
        onSelected={(session) => { transitNav.startSession(session); setScreen('transitGuide'); }}
        onWalkSelected={async (route) => { if (!(await selectCandidate(route))) setScreen('routeCandidates'); }} // 실패하면 도보 후보 화면에서 오류 문구 표시
        onBack={() => setScreen('routeCandidates')}
        onAuthExpired={handleMaybeAuthExpired}
      />
    ) : null,
    transitGuide: <TransitGuideScreen nav={transitNav} stt={expoSttAdapter} onBack={() => setScreen('routeCandidates')} />,
    walkLogHistory: <WalkLogHistoryScreen onBack={goHome} onAuthExpired={handleMaybeAuthExpired} />,
    navigationHistory: <NavigationHistoryScreen onBack={goHome} onAuthExpired={handleMaybeAuthExpired} />,
  };

  return (
    <ThemeCtx.Provider value={theme}>
      <AmbientCtx.Provider value={setAmbient}>
        <View style={{ flex: 1, backgroundColor: theme.bg }}>
          <StatusBar barStyle="dark-content" />
          <LinearGradient colors={(grad.length > 1 ? grad : [grad[0], grad[0]]) as [string, string, ...string[]]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
          <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
            {screen === 'camera' || screen === 'transitCandidates' ? ( // 후보 화면은 자체 ScrollView + 하단 고정 음성 바를 가진다
              <View style={{ flex: 1 }}>{screens[screen]}</View>
            ) : (
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
                {screens[screen]}
              </ScrollView>
            )}
            {/* 탑승/하차 확인 버튼: ScrollView 바깥 하단 고정 (SafeAreaView 하단 안전영역 안) / confirm buttons pinned below the ScrollView */}
            {screen === 'transitGuide' ? (
              <TransitConfirmBar uiState={transitNav.uiState} busy={transitNav.busy} onBoard={transitNav.confirmBoarding} onAlight={transitNav.confirmAlighting} />
            ) : null}
            {screen === 'home' || screen === 'walk' || screen === 'navigate' || screen === 'walkLogHistory' ? <TabBar active={screen} go={go} t={theme} /> : null}
          </SafeAreaView>

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
