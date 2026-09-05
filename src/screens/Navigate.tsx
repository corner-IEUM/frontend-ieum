// screens/Navigate.tsx — 길찾기 (통합 모드): 도보 → 버스 → 도보, 주변 설명 + 대중교통 탑승/하차 안내가 자동으로 끼어든다.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, Vibration, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
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

// 경로 이탈 판단 기준(m). 스마트폰 GPS는 개활지에서도 오차가 5~15m 정도 나서, 그보다 낮게
// 잡으면 정상 보행 중에도 오탐이 잦다 — 보행 내비게이션에서 통상 쓰는 20~30m대 중간값으로 설정
const DEVIATION_THRESHOLD_M = 25;
// 위치가 threshold를 몇 번 연속으로 넘어야 "진짜 이탈"로 확정할지.
// useLocationTracking이 대략 2~3초/3m 간격으로 갱신되므로 3회 연속(약 6~9초)이면 GPS 튐 한두 번으로는
// 오탐하지 않으면서도 실제 이탈은 충분히 빨리 잡아낼 수 있음
const DEVIATION_CONFIRM_COUNT = 3;

// ───────── legs ─────────
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
  category?: WaypointCategory; // 실제 경로(waypoint) 스텝에만 존재 — 목업 데모에는 없음(TTS 트리거 구분용)
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
// 백엔드 WaypointCategory와 동일한 3분류를 그대로 마커 아이콘/색으로 매핑.
// TURN은 티맵 문구에 좌회전/우회전 키워드가 있으면 그 방향 아이콘을, 없으면(직진 등) 직진 화살표를 씀
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

// ───────── leg progress bar ─────────
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

// ───────── mini map (하드코딩 SVG placeholder) ─────────
// 실제 렌더링에는 더 이상 쓰이지 않음(KakaoMap.tsx로 교체됨) — 삭제하지 말라는 요청에 따라
// 원본 그대로 남겨둠. 카카오맵 로딩 실패 등 롤백이 필요하면 아래 <KakaoMap .../> 자리에
// <MiniMap progress={...} />로 다시 바꿔 끼우면 됨.
function MiniMap({ progress }: { progress: number }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  const pts: [number, number][] = [[40, 110], [40, 60], [200, 60], [200, 30], [320, 30]];
  const segLen = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  const total = segLen.reduce((a, b) => a + b, 0);
  let target = progress * total, mx = pts[0][0], my = pts[0][1];
  for (let i = 0; i < segLen.length; i++) {
    if (target <= segLen[i]) { const f = segLen[i] ? target / segLen[i] : 0; mx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f; my = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f; break; }
    target -= segLen[i];
  }
  return (
    <View style={[styles.miniMap, { borderRadius: t.radius, borderWidth: t.borderW, borderColor: t.border, backgroundColor: isC ? '#ffffff' : '#e9eef8' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 140" preserveAspectRatio="none">
        {[40, 90].map((y) => <Line key={y} x1={0} y1={y} x2={360} y2={y} stroke={t.border} strokeWidth={1} opacity={0.6} />)}
        {[120, 240].map((x) => <Line key={x} x1={x} y1={0} x2={x} y2={140} stroke={t.border} strokeWidth={1} opacity={0.6} />)}
        <Path d="M40 110 L40 60 L200 60 L200 30 L320 30" fill="none" stroke={withAlpha(t.primary, 0.3)} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M40 110 L40 60 L200 60 L200 30 L320 30" fill="none" stroke={t.primary} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 7" />
        <Circle cx={40} cy={110} r={6} fill={t.surface} stroke={t.primary} strokeWidth={3} />
        <Circle cx={320} cy={30} r={7} fill={t.status.safe.fg} />
        <Circle cx={mx} cy={my} r={9} fill={t.primary} stroke={t.surface} strokeWidth={3} />
      </Svg>
      <Text style={[styles.miniMapLabel, { color: t.textFaint }]}>실시간 경로</Text>
    </View>
  );
}

// ───────── transit visuals (bus number / signal / ride / bell / stairs) ─────────
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
  // bell / stairs / gap
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

// ───────── around panel (walking legs) ─────────
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

// ───────── main screen ─────────
export function NavigateScreen({
  playing, big, onBack, origin, destination, route, guidance, onSearchOrigin, onSearchDestination,
  onComplete, completing, completed, completeError, currentLocation, onDeviated,
}: {
  playing?: boolean; big?: boolean; onBack?: () => void; origin?: Place | null; destination?: Place | null;
  route?: RouteResponse | null; guidance?: GuidanceMessage | null; onSearchOrigin?: () => void; onSearchDestination?: () => void;
  onComplete?: () => void; completing?: boolean; completed?: boolean; completeError?: string | null;
  currentLocation?: Coords | null; onDeviated?: () => void; // 경로 이탈 확정 시 호출 — 부모가 재탐색(후보 화면 전환)을 담당
}) {
  const t = useTheme();
  const setAmbient = useAmbient();
  const [i, setI] = useState(0);
  const [off, setOff] = useState(false);
  const [haptic, setHaptic] = useState(false);
  const [sending, setSending] = useState(false);

  // route가 있으면 실제 티맵 턴바이턴 안내로, 없으면 목업(버스 탑승 포함) 시연 데이터로 진행
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

  // 실제 경로 웨이포인트 안내 TTS — 계단/횡단보도(STAIR/CROSSWALK)는 기존 발화를 끊고 즉시,
  // 일반 회전/직진 안내(TURN)는 낮은 우선순위로 재생 (목업 데모 스텝엔 category가 없어 대상에서 제외)
  useEffect(() => {
    if (!step.category) return;
    const urgent = step.category === 'STAIR' || step.category === 'CROSSWALK';
    speakWithPriority(step.text, urgent);
  }, [i, journey]);

  // 경로 좌표(폴리라인) — route가 바뀔 때만 다시 파싱
  const routePath = useMemo(() => (route ? extractPath(route.routeData) : []), [route]);
  const offTrackStreakRef = useRef(0); // 연속으로 threshold를 넘은 횟수 (디바운스용)
  const deviationConfirmedRef = useRef(false); // 이탈을 이미 보고했는지 (재탐색 화면 전환 대기 중 중복 트리거 방지)

  // 새 경로가 적용되면 이탈 판단 상태 초기화
  useEffect(() => {
    offTrackStreakRef.current = 0;
    deviationConfirmedRef.current = false;
  }, [route]);

  // 이탈 확정 처리 — 기존 UI(진동/경고 표시) 재사용 + TTS 안내 + 부모에게 재탐색 요청
  const confirmDeviation = () => {
    if (deviationConfirmedRef.current) return;
    deviationConfirmedRef.current = true;
    setOff(true);
    Vibration.vibrate([0, 250, 80, 250]);
    speakWithPriority('경로를 이탈했습니다. 새 경로를 찾습니다', true);
    onDeviated?.();
  };

  // 현재 위치가 갱신될 때마다 경로와의 최단거리를 확인 — threshold를 DEVIATION_CONFIRM_COUNT회
  // 연속으로 넘어야 이탈로 확정 (GPS가 한두 번 튀는 것만으로 오탐하지 않도록)
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

      {!route ? (
        <View style={styles.emptyStateBox}>
          <Icon name="pin" size={40} color={t.textFaint} sw={1.8} />
          <Text style={[styles.emptyStateText, { color: t.textDim }]}>목적지를 검색하면 경로 안내가 시작됩니다</Text>
        </View>
      ) : (
      <>
      {/* MiniMap(하드코딩 SVG placeholder) 대신 실제 카카오맵으로 표시.
          currentLocation이 아직 없으면(GPS 최초 fix 전) 지도를 그릴 좌표가 없으므로 로딩 표시 */}
      {currentLocation ? (
        <KakaoMap latitude={currentLocation.latitude} longitude={currentLocation.longitude} height={132} />
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
          const canComplete = atEnd && !!route; // 실제 경로일 때만 완료 처리 가능 (목업 데이터엔 navigationId가 없음)
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

      {/* 실내 등 GPS가 잘 안 잡히는 환경에서 이탈 감지~재탐색 파이프라인 전체를 수동으로 확인할 수 있는 테스트 버튼.
          confirmDeviation()을 실제 GPS 판정과 동일하게 호출하므로 연출이 아니라 진짜 이탈 처리가 실행됨 */}
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
  miniMapLabel: { position: 'absolute', bottom: 8, right: 10, fontSize: 11 },
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
