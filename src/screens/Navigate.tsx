// screens/Navigate.tsx — 길찾기 (통합 모드): 도보 → 버스 → 도보, 주변 설명 + 대중교통 탑승/하차 안내가 자동으로 끼어든다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Vibration, StyleSheet, ActivityIndicator } from 'react-native';
import { Icon, IconName } from '../Icon';
import { useTheme, useAmbient } from '../theme-context';
import { withAlpha, Level, Theme } from '../theme';
import { ModeHeader, CaptionBar, Card, ctrlStyle, GuidanceBanner } from '../ui';
import { SceneView, HapticFlash, SceneObj } from '../Scene';
import { KakaoMap } from '../KakaoMap';
import { Place, RouteResponse } from '../api';
import { formatDistance, formatDuration } from './RouteCandidates';
import { parseRouteSteps, extractPath, distanceToRouteMeters, RouteStep, WaypointCategory } from '../routeParser';
import { GuidanceMessage } from '../hooks/useGuidanceSocket';
import { Coords } from '../hooks/useLocationTracking';
import { speakWithPriority } from '../tts';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { VoiceControls } from '../VoiceUi';
import { announceText } from '../transit/feedback';
import { VOICE } from '../transit/voiceMessages';

// 경로 이탈 판단 기준(m) — GPS 오차보다 크게 설정
const DEVIATION_THRESHOLD_M = 25;
// 이탈 확정에 필요한 연속 초과 횟수 (GPS 튐 오탐 방지)
const DEVIATION_CONFIRM_COUNT = 3;

// ───────── 구간(leg) 목록 ─────────
const LEGS = [
  { id: 'walk1', icon: 'walk' as IconName, label: '도보 2분' },
  { id: 'bus', icon: 'bus' as IconName, label: '273번 · 4정거장' },
  { id: 'walk2', icon: 'walk' as IconName, label: '도보 1분' },
];

interface AroundItem { icon: IconName; name: string; bearing: string; dist: string; cat: string; }
interface TransitStep { kind: 'busNumber' | 'signal' | 'ride' | 'bell' | 'stairs' | 'gap'; num?: string; stops?: number; }
interface JourneyStep {
  leg: string;
  mode: 'walk' | 'transit' | 'arrive';
  level: Level;
  turn?: string;
  text: string;
  sub: string;
  around?: AroundItem[];
  transit?: TransitStep;
  category?: WaypointCategory;
}

const JOURNEY: JourneyStep[] = [
  { leg: 'walk1', mode: 'walk', level: 'safe', turn: '직진 50m', text: '50m 직진하세요', sub: '점자블록을 따라 이동 중',
    around: [{ icon: 'person', name: '가로수', bearing: '오른쪽', dist: '2m', cat: '시설' }, { icon: 'home', name: 'GS25 편의점', bearing: '왼쪽', dist: '6m', cat: '상점' }] },
  { leg: 'walk1', mode: 'walk', level: 'caution', turn: '우회전', text: '카페 어니언 앞에서 우회전', sub: '전방 2m 자전거 주의 · 모서리에서 오른쪽',
    around: [{ icon: 'bike', name: '자전거', bearing: '정면', dist: '2m', cat: '주의' }, { icon: 'cross', name: '횡단보도', bearing: '12시', dist: '4m', cat: '안전' }] },
  { leg: 'walk1', mode: 'walk', level: 'safe', turn: '정류장 도착', text: '버스정류장에 도착했습니다', sub: '잠시 후 273번 버스가 옵니다',
    around: [{ icon: 'bus', name: '성수역 정류장', bearing: '정면', dist: '1m', cat: '교통' }] },
  { leg: 'bus', mode: 'transit', level: 'safe', text: '273번 버스가 곧 도착합니다', sub: '승강장 앞에서 대기하세요', transit: { kind: 'busNumber', num: '273' } },
  { leg: 'bus', mode: 'transit', level: 'safe', text: '기사님께 탑승 신호를 보냈습니다', sub: '앞문이 열리면 탑승하세요', transit: { kind: 'signal' } },
  { leg: 'bus', mode: 'transit', level: 'safe', text: '승차 완료 · 4정거장 남음', sub: '하차역까지 약 8분', transit: { kind: 'ride', stops: 4 } },
  { leg: 'bus', mode: 'transit', level: 'caution', text: '다음 정류장에서 하차하세요', sub: '하차벨은 오른쪽 손잡이 아래에 있습니다', transit: { kind: 'bell' } },
  { leg: 'bus', mode: 'transit', level: 'danger', text: '하차합니다. 계단 2칸 주의', sub: '앞에 계단이 있습니다. 조심해서 내리세요', transit: { kind: 'stairs' } },
  { leg: 'walk2', mode: 'walk', level: 'safe', turn: '직진 80m', text: '80m 직진하세요', sub: '목적지가 가까워집니다',
    around: [{ icon: 'subway', name: '성수역 2번 출구', bearing: '1시', dist: '15m', cat: '교통' }] },
  { leg: 'walk2', mode: 'arrive', level: 'safe', turn: '도착', text: '목적지에 도착했습니다', sub: '성수역 2번 출구입니다', around: [] },
];

const CAT_COLOR = (t: Theme, cat: string): string => (({ 안전: t.status.safe.fg, 교통: t.primary, 상점: t.status.caution.fg, 주의: t.status.caution.fg, 시설: t.textDim, 위험: t.status.danger.fg } as Record<string, string>)[cat] || t.textDim);
// AroundPanel 배지에 쓰는 cat 라벨(위험/주의/안전/시설)로 SceneView 마커 레벨도 함께 판단
const CAT_LEVEL: Record<string, Level> = { 위험: 'danger', 주의: 'caution' };

// ───────── 실제 경로 waypoint(STAIR/CROSSWALK/TURN) -> around 마커 변환 ─────────
const CATEGORY_ICON: Record<WaypointCategory, IconName> = { STAIR: 'stairs', CROSSWALK: 'cross', TURN: 'arrowUp' };
const CATEGORY_CAT_LABEL: Record<WaypointCategory, string> = { STAIR: '위험', CROSSWALK: '안전', TURN: '시설' };

function turnIcon(text: string): IconName {
  if (text.includes('좌회전')) return 'chevronL';
  if (text.includes('우회전')) return 'chevron';
  return 'arrowUp';
}
function turnBearingLabel(text: string): string {
  if (text.includes('좌회전')) return '왼쪽';
  if (text.includes('우회전')) return '오른쪽';
  return '정면';
}

function aroundItemForStep(s: RouteStep): AroundItem {
  const icon = s.category === 'TURN' ? turnIcon(s.text) : CATEGORY_ICON[s.category];
  const bearing = s.category === 'TURN' ? turnBearingLabel(s.text) : '정면';
  return { icon, name: s.text, bearing, dist: `${s.distToNext ?? 0}m`, cat: CATEGORY_CAT_LABEL[s.category] };
}

// ───────── 구간 진행 바 (leg progress bar) ─────────
function LegBar({ currentLeg }: { currentLeg: string }) {
  const t = useTheme();
  const curIdx = LEGS.findIndex((l) => l.id === currentLeg);
  return (
    <View style={styles.legBarRow}>
      {LEGS.map((leg, k) => {
        const on = leg.id === currentLeg;
        const done = k < curIdx;
        return (
          <React.Fragment key={leg.id}>
            <View style={[
              styles.legChip,
              { backgroundColor: on ? t.primary : t.surface, borderWidth: t.borderW, borderColor: on ? t.primary : t.border, opacity: done ? 0.5 : 1 },
            ]}>
              <Icon name={leg.icon} size={16} color={on ? t.onPrimary : t.textDim} sw={2.2} />
              <Text style={[styles.legChipText, { color: on ? t.onPrimary : t.textDim }]}>{leg.label}</Text>
            </View>
            {k < LEGS.length - 1 ? <Icon name="chevron" size={14} color={t.textFaint} sw={2.6} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ───────── 대중교통 안내 화면 (버스 번호 / 탑승 신호 / 승차 / 하차벨 / 계단) ─────────
function Ripple({ color, delay }: { color: string; delay: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1400, delay, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={[
    styles.ripple,
    { borderColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.5] }) }] },
  ]} />;
}

function TransitVisual({ step, sending, t }: { step: TransitStep; sending: boolean; t: Theme }) {
  const isC = t.id === 'contrast';
  const c = t.primary;

  if (step.kind === 'busNumber') {
    return (
      <Card pad={0} style={styles.busNumberCard}>
        <View style={[styles.busNumberRow, { backgroundColor: isC ? t.surface : withAlpha(c, 0.14) }]}>
          <View style={[styles.busNumberBadge, { borderRadius: t.radiusSm, borderColor: c }]}>
            <Text style={[styles.busNumberText, { fontSize: (step.num || '').length > 3 ? 24 : 36 }]}>{step.num}</Text>
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.busNumberCaption, { color: t.textDim }]}>버스 번호 인식</Text>
            <Text style={[styles.busNumberTitle, { color: t.text }]}>간선버스 · 정상 운행</Text>
          </View>
        </View>
      </Card>
    );
  }
  if (step.kind === 'signal') {
    return (
      <Card style={styles.signalCard}>
        <View style={styles.signalRippleWrap}>
          {sending ? [0, 1, 2].map((k) => <Ripple key={k} color={c} delay={k * 400} />) : null}
          <View style={[styles.signalIconCircle, { backgroundColor: isC ? t.surface : withAlpha(c, 0.18), borderColor: c }]}>
            <Icon name="bus" size={34} color={c} sw={2.1} />
          </View>
        </View>
        <Text style={[styles.signalText, { color: t.primary }]}>기사님께 탑승 신호 전송 중…</Text>
      </Card>
    );
  }
  if (step.kind === 'ride') {
    return (
      <Card style={styles.rideCard}>
        <View style={[styles.rideIconCircle, { borderRadius: t.radiusSm, backgroundColor: isC ? t.surface : withAlpha(c, 0.16), borderColor: c }]}>
          <Icon name="bus" size={32} color={c} sw={2.1} />
        </View>
        <View style={styles.flex1}>
          <Text style={[styles.rideCaption, { color: t.textDim }]}>승차 중 · 하차까지</Text>
          <Text style={[styles.rideStopsText, { color: t.text }]}>
            {step.stops}<Text style={[styles.rideStopsSuffix, { color: t.textDim }]}> 정거장 남음</Text>
          </Text>
        </View>
      </Card>
    );
  }
  const map: Record<string, { ic: IconName; cl: Level; cap: string; val: string }> = {
    stairs: { ic: 'stairs', cl: 'danger', cap: '하차 계단 감지', val: '천천히, 한 발씩' },
    gap: { ic: 'gap', cl: 'danger', cap: '승강장 간격 넓음', val: '천천히, 한 발씩' },
    bell: { ic: 'alert', cl: 'caution', cap: '하차벨 위치', val: '오른쪽 손잡이 아래' },
  };
  const m = map[step.kind];
  const sc = t.status[m.cl];
  return (
    <Card tone={withAlpha(sc.fg, 0.45)} style={styles.rideCard}>
      <View style={[styles.alertIconCircle, { borderRadius: t.radiusSm, backgroundColor: isC ? t.surface : withAlpha(sc.fg, 0.16), borderColor: sc.fg }]}>
        <Icon name={m.ic} size={36} color={sc.fg} sw={2} />
      </View>
      <View>
        <Text style={[styles.alertCaption, { color: sc.fg }]}>{m.cap}</Text>
        <Text style={[styles.alertValue, { color: t.text }]}>{m.val}</Text>
      </View>
    </Card>
  );
}

// ───────── 주변 안내 패널 (도보 구간) ─────────
function AroundPanel({ items }: { items: AroundItem[] }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <Card pad={16} style={styles.aroundCard}>
      <View style={styles.aroundHeaderRow}>
        <Icon name="compass" size={18} color={t.primary} sw={2.2} />
        <Text style={[styles.aroundHeaderTitle, { color: t.text }]}>주변 안내</Text>
        <View style={styles.flex1} />
        <Text style={[styles.aroundHeaderHint, { color: t.textFaint }]}>걷는 동안 자동 설명</Text>
      </View>
      <View style={styles.aroundList}>
        {items.map((it, k) => {
          const cc = CAT_COLOR(t, it.cat);
          return (
            <View key={k} style={styles.aroundRow}>
              <View style={[styles.aroundIconCircle, { borderRadius: isC ? 7 : 11, backgroundColor: isC ? t.surface : withAlpha(cc, 0.16), borderColor: cc }]}>
                <Icon name={it.icon} size={22} color={cc} sw={2} />
              </View>
              <View style={styles.aroundItemInfo}>
                <Text style={[styles.aroundItemName, { color: t.text }]}>{it.name}</Text>
                <Text style={[styles.aroundItemMeta, { color: t.textDim }]}>{it.bearing} · {it.dist}</Text>
              </View>
              {k === 0 ? (
                <View style={styles.aroundSpeakingRow}>
                  <Icon name="speaker" size={15} color={t.primary} sw={2.2} />
                  <Text style={[styles.aroundSpeakingText, { color: t.primary }]}>안내 중</Text>
                </View>
              ) : null}
              <View style={[styles.aroundCatBadge, { borderColor: withAlpha(cc, 0.45) }]}>
                <Text style={[styles.aroundCatText, { color: cc }]}>{it.cat}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function ArrivePanel() {
  const t = useTheme();
  const isC = t.id === 'contrast';
  const s = t.status.safe;
  return (
    <Card tone={withAlpha(s.fg, 0.45)} style={styles.arriveCard}>
      <View style={[styles.arriveIconCircle, { backgroundColor: isC ? t.surface : withAlpha(s.fg, 0.16), borderColor: s.fg }]}>
        <Icon name="check" size={40} color={s.fg} sw={2.6} />
      </View>
      <Text style={[styles.arriveTitle, { color: t.text }]}>도착했습니다</Text>
      <Text style={[styles.arriveSub, { color: t.textDim }]}>성수역 2번 출구</Text>
    </Card>
  );
}

// ───────── 메인 화면 ─────────
export function NavigateScreen({
  playing, big, onBack, origin, destination, route, guidance, onSearchOrigin, onSearchDestination,
  onComplete, completing, completed, completeError, currentLocation, onDeviated, onRetryRoute,
}: {
  playing?: boolean; big?: boolean; onBack?: () => void; origin?: Place | null; destination?: Place | null;
  route?: RouteResponse | null; guidance?: GuidanceMessage | null; onSearchOrigin?: () => void; onSearchDestination?: () => void;
  onComplete?: () => void; completing?: boolean; completed?: boolean; completeError?: string | null;
  currentLocation?: Coords | null; onDeviated?: () => void;
  onRetryRoute?: () => void;   // 저장된 경로가 없을 때(경로 id 없음) 경로 후보 화면으로 다시 보내 저장을 재시도 / no saved route → reopen candidates to retry saving
}) {
  const t = useTheme();
  const setAmbient = useAmbient();
  // 음성 "경로 저장": 서버는 경로 선택(POST /api/navigation/route) 시점에 Navigation을 저장하므로 navigationId가 있으면 저장돼 있다고 알려주고, 없으면 재시도
  const voice = useVoiceCommand('navigate', {
    SAVE_ROUTE: () => {
      if (route?.navigationId != null) { announceText(VOICE.routeSaved, false); return; }
      if (!destination) { announceText(VOICE.needDestination, false); return; }
      announceText(VOICE.routeNotSaved, false);
      onRetryRoute?.();
    },
  });
  const [i, setI] = useState(0);
  const [off, setOff] = useState(false);
  const [haptic, setHaptic] = useState(false);
  const [sending, setSending] = useState(false);

  const journey: JourneyStep[] = useMemo(() => {
    if (!route) return JOURNEY;
    const steps = parseRouteSteps(route.routeData).map((s): JourneyStep => ({
      leg: 'walk1', mode: 'walk', level: s.level, text: s.text, sub: s.sub,
      category: s.category, around: [aroundItemForStep(s)],
    }));
    steps.push({ leg: 'walk1', mode: 'arrive', level: 'safe', turn: '도착', text: '목적지에 도착했습니다', sub: destination?.placeName ?? '', around: [] });
    return steps;
  }, [route, destination]);

  useEffect(() => { setI(0); }, [route]);

  const step = journey[i] ?? journey[0];
  const danger = off || (step.level === 'danger' && haptic);
  const atEnd = i >= journey.length - 1;

  useEffect(() => {
    setAmbient(off ? 'danger' : step.level);
    setSending(false);
    if (step.transit && step.transit.kind === 'signal') { setSending(true); const id = setTimeout(() => setSending(false), 2200); return () => clearTimeout(id); }
    if (step.level === 'danger') { setHaptic(true); Vibration.vibrate([0, 200, 90, 200]); const id = setTimeout(() => setHaptic(false), 1400); return () => clearTimeout(id); }
    setHaptic(false);
  }, [i, journey]);
  useEffect(() => { setAmbient(off ? 'danger' : step.level); }, [off]);

  useEffect(() => {
    if (!step.category) return;
    const urgent = step.category === 'STAIR' || step.category === 'CROSSWALK';
    speakWithPriority(step.text, urgent);
  }, [i, journey]);

  const routePath = useMemo(() => (route ? extractPath(route.routeData) : []), [route]);
  const kakaoRoutePath = useMemo(() => routePath.map(([lng, lat]) => ({ lat, lng })), [routePath]);
  const offTrackStreakRef = useRef(0);
  const deviationConfirmedRef = useRef(false);

  useEffect(() => {
    offTrackStreakRef.current = 0;
    deviationConfirmedRef.current = false;
  }, [route]);

  const confirmDeviation = () => {
    if (deviationConfirmedRef.current) return;
    deviationConfirmedRef.current = true;
    setOff(true);
    Vibration.vibrate([0, 250, 80, 250]);
    speakWithPriority('경로를 이탈했습니다. 새 경로를 찾습니다', true);
    onDeviated?.();
  };

  useEffect(() => {
    if (!route || !currentLocation || routePath.length < 2 || deviationConfirmedRef.current) return;
    const point: [number, number] = [currentLocation.longitude, currentLocation.latitude];
    const dist = distanceToRouteMeters(point, routePath);
    if (dist > DEVIATION_THRESHOLD_M) {
      offTrackStreakRef.current += 1;
      if (offTrackStreakRef.current >= DEVIATION_CONFIRM_COUNT) confirmDeviation();
    } else {
      offTrackStreakRef.current = 0;
      setOff(false);
    }
  }, [currentLocation, route, routePath]);

  const sceneObjects: SceneObj[] = (step.around || []).map((a, k) => ({
    id: 'a' + k, icon: a.icon, label: a.name, dist: parseFloat(a.dist) || 3,
    bearing: (k - ((step.around!.length - 1) / 2)) * 0.5, level: CAT_LEVEL[a.cat] ?? 'safe',
  }));

  return (
    <View style={styles.container}>
      <ModeHeader title="길찾기" icon="pin" onBack={onBack} right={
        route ? (
          <Text style={[styles.etaText, { color: t.textDim }]}>
            {formatDuration(route.duration)} · {formatDistance(route.distance)}
          </Text>
        ) : undefined
      } />

      <Card pad={0} tone={withAlpha(t.primary, 0.4)} style={styles.odCard}>
        <TouchableOpacity activeOpacity={0.85} onPress={onSearchOrigin} style={styles.odRow}>
          <View style={[styles.odIconCircle, { borderRadius: t.id === 'contrast' ? 8 : 12, backgroundColor: t.id === 'contrast' ? t.surface : withAlpha(t.textDim, 0.14), borderWidth: t.id === 'contrast' ? 2 : 0, borderColor: t.textDim }]}>
            <Icon name="compass" size={22} color={t.textDim} sw={2.1} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.destLabel, { color: t.textDim }]}>출발지</Text>
            <Text style={[styles.destName, { color: origin ? t.text : t.textFaint }]}>{origin?.placeName ?? '출발지를 검색하세요'}</Text>
          </View>
          <Icon name="chevron" size={20} color={t.textFaint} sw={2.4} />
        </TouchableOpacity>

        <View style={[styles.odDivider, { backgroundColor: t.border }]} />

        <TouchableOpacity activeOpacity={0.85} onPress={onSearchDestination} style={styles.odRow}>
          <View style={[styles.odIconCircle, { borderRadius: t.id === 'contrast' ? 8 : 12, backgroundColor: t.id === 'contrast' ? t.surface : withAlpha(t.primary, 0.16), borderWidth: t.id === 'contrast' ? 2 : 0, borderColor: t.primary }]}>
            <Icon name="pin" size={22} color={t.primary} sw={2.1} />
          </View>
          <View style={styles.flex1}>
            <Text style={[styles.destLabel, { color: t.textDim }]}>목적지</Text>
            <Text style={[styles.destName, { color: destination ? t.text : t.textFaint }]}>{destination?.placeName ?? '목적지를 검색하세요'}</Text>
          </View>
          <Icon name="chevron" size={20} color={t.textFaint} sw={2.4} />
        </TouchableOpacity>
      </Card>

      <VoiceControls
        available={voice.available}
        listening={voice.listening}
        permissionDenied={voice.permissionDenied}
        label="음성으로 경로 저장"
        onToggle={() => { if (voice.listening) voice.stop(); else voice.start(VOICE.navigatePrompt); }}
        onOpenSettings={voice.openSettings}
      />

      {!route ? (
        <View style={styles.emptyStateBox}>
          <Icon name="pin" size={40} color={t.textFaint} sw={1.8} />
          <Text style={[styles.emptyStateText, { color: t.textDim }]}>목적지를 검색하면 경로 안내가 시작됩니다</Text>
        </View>
      ) : (
      <>
      {currentLocation ? (
        <KakaoMap latitude={currentLocation.latitude} longitude={currentLocation.longitude} height={132} routePath={kakaoRoutePath} />
      ) : (
        <View style={[styles.miniMap, { alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface2 }]}>
          <ActivityIndicator color={t.textFaint} />
        </View>
      )}

      {step.mode === 'transit'
        ? <TransitVisual step={step.transit!} sending={sending} t={t} />
        : step.mode === 'arrive'
          ? <ArrivePanel />
          : <SceneView objects={sceneObjects} height={230} scanning={!!playing} />}

      {step.mode === 'walk' && step.around && step.around.length > 0 ? <AroundPanel items={step.around} /> : null}

      <GuidanceBanner guidance={guidance ?? null} />

      <CaptionBar level={off ? 'danger' : step.level} text={off ? '경로를 벗어났습니다' : step.text} sub={off ? '오던 길로 5m 돌아가세요 · 강한 진동' : step.sub} speaking={playing} big={big} />

      <View style={styles.navControlsRow}>
        <TouchableOpacity onPress={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} style={[ctrlStyle(t), { opacity: i === 0 ? 0.4 : 1 }]}>
          <Icon name="chevronL" size={22} color={t.text} sw={2.4} />
        </TouchableOpacity>
        {(() => {
          const canComplete = atEnd && !!route;
          const nextDisabled = atEnd ? (!canComplete || completed || completing) : false;
          const onPress = () => {
            if (!atEnd) { setI((v) => Math.min(journey.length - 1, v + 1)); return; }
            if (canComplete && !completed && !completing) onComplete?.();
          };
          const label = completed ? '완료됨' : completing ? '처리 중…' : atEnd ? (canComplete ? '보행 완료' : '안내 완료') : '다음 안내';
          const active = !atEnd || (canComplete && !completed);
          return (
            <TouchableOpacity onPress={onPress} disabled={nextDisabled}
              style={[ctrlStyle(t), styles.nextButtonInner, { opacity: nextDisabled && !completed ? 0.5 : 1, backgroundColor: completed ? t.surface : active ? t.primary : t.surface, borderColor: completed ? t.status.safe.fg : active ? t.primary : t.border }]}>
              <Text style={[styles.nextButtonText, { color: completed ? t.status.safe.fg : active ? t.onPrimary : t.textDim }]}>{label}</Text>
              {completing ? <ActivityIndicator color={t.onPrimary} size="small" />
                : completed ? <Icon name="check" size={20} color={t.status.safe.fg} sw={2.4} />
                  : !atEnd ? <Icon name="chevron" size={20} color={t.onPrimary} sw={2.4} /> : null}
            </TouchableOpacity>
          );
        })()}
        <Text style={[styles.counterText, { color: t.textFaint }]}>{i + 1}/{journey.length}</Text>
      </View>

      {completeError ? <Text style={[styles.completeErrorText, { color: t.status.danger.fg }]}>{completeError}</Text> : null}

      <TouchableOpacity onPress={confirmDeviation} style={[ctrlStyle(t), styles.deviateButtonInner, { borderColor: withAlpha(t.status.danger.fg, 0.45) }]}>
        <Icon name="alert" size={18} color={t.status.danger.fg} sw={2.2} />
        <Text style={[styles.deviateText, { color: t.status.danger.fg }]}>경로 이탈 감지 테스트</Text>
      </TouchableOpacity>

      <HapticFlash show={danger} />
      </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  legBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  legChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999 },
  legChipText: { fontSize: 12.5, fontWeight: '800' },
  miniMap: { height: 132, overflow: 'hidden' },
  ripple: { position: 'absolute', width: 84, height: 84, borderRadius: 999, borderWidth: 2 },
  flex1: { flex: 1 },
  busNumberCard: { overflow: 'hidden' },
  busNumberRow: { flexDirection: 'row', alignItems: 'center', gap: 18, padding: 22 },
  busNumberBadge: { minWidth: 96, height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1a3a', borderWidth: 2, paddingHorizontal: 14 },
  busNumberText: { fontWeight: '900', color: '#ffd23f', letterSpacing: -1 },
  busNumberCaption: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  busNumberTitle: { fontSize: 20, fontWeight: '800', marginTop: 3 },
  signalCard: { alignItems: 'center', gap: 14, padding: 26 },
  signalRippleWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  signalIconCircle: { width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  signalText: { fontSize: 16, fontWeight: '800' },
  rideCard: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 22 },
  rideIconCircle: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  rideCaption: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },
  rideStopsText: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  rideStopsSuffix: { fontSize: 17, fontWeight: '800' },
  alertIconCircle: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  alertCaption: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  alertValue: { fontSize: 19, fontWeight: '800', marginTop: 3 },
  aroundCard: { gap: 12 },
  aroundHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aroundHeaderTitle: { fontSize: 14, fontWeight: '800', letterSpacing: 0.4 },
  aroundHeaderHint: { fontSize: 12, fontWeight: '600' },
  aroundList: { gap: 8 },
  aroundRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  aroundIconCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  aroundItemInfo: { flex: 1 },
  aroundItemName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  aroundItemMeta: { fontSize: 13, fontWeight: '600', marginTop: 1 },
  aroundSpeakingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  aroundSpeakingText: { fontSize: 12, fontWeight: '800' },
  aroundCatBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  aroundCatText: { fontSize: 11.5, fontWeight: '800' },
  arriveCard: { alignItems: 'center', gap: 12, padding: 28 },
  arriveIconCircle: { width: 72, height: 72, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  arriveTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.6 },
  arriveSub: { fontSize: 15, fontWeight: '600' },
  container: { padding: 18, paddingTop: 4, gap: 14 },
  etaText: { fontSize: 14, fontWeight: '800' },
  odCard: { overflow: 'hidden' },
  emptyStateBox: { alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 60 },
  emptyStateText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  odRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  odIconCircle: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  odDivider: { height: 1, marginLeft: 16 },
  destLabel: { fontSize: 12.5, fontWeight: '800', letterSpacing: 0.5 },
  destName: { fontSize: 18, fontWeight: '800', marginTop: 1 },
  navControlsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextButtonInner: { flex: 1, gap: 8 },
  nextButtonText: { fontWeight: '800', fontSize: 16 },
  counterText: { fontSize: 13, fontWeight: '700', minWidth: 42, textAlign: 'right' },
  completeErrorText: { fontSize: 13, fontWeight: '700', textAlign: 'center' },
  deviateButtonInner: { gap: 8 },
  deviateText: { fontWeight: '800', fontSize: 14 },
});
