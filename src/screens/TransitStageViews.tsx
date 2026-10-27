// screens/TransitStageViews.tsx — 대중교통 안내 단계별 화면: 버스 도착 알림 / 정류장 타임라인 / 하차 임박 / 하차 후 도보 전환
// 표시만 한다. 상태(uiState)·남은 정류장 수·GPS 위치는 기존 훅(useTransitNavigation, useAlightGuidance, useLocationTracking)이 내보낸 값을 props로 받는다.
// 핵심 문구(headline)는 호출 쪽이 buildGuidance()/GUIDANCE로 만든 TTS 문장 그대로 넘긴다
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { Card } from '../ui';
import { formatDistanceKo } from '../transit/format';
import { STATE_LABEL } from '../transit/guidanceMessages';
import type { RideTimeline, WalkRemain } from '../transit/stageView';
import { HapticPatternIcon, ReplayButton, RouteBadge } from '../transit/TransitUi';
import { PhaseChips } from './StopArrivalView';

type Mode = 'BUS' | 'SUBWAY';

// ───────── 버스 도착 알림 (BOARDING_CONFIRM) ─────────
export function BusArrivedView({ headline, routeName, mode, pattern, onReplay }: {
  headline: string; routeName?: string; mode?: Mode; pattern: readonly number[]; onReplay: () => void;
}) {
  const t = useTheme();
  const accent = t.status.safe.fg;
  return (
    <View style={styles.container}>
      <PhaseChips phase="ARRIVED" />
      <Card pad={22} tone={accent} style={{ ...styles.centerCard, borderWidth: Math.max(t.borderW, 3) }}>
        <View style={[styles.bigCircle, { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) }]}>
          <Icon name="bell" size={48} color={accent} sw={2.3} />
        </View>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.headline, { color: t.text, textAlign: 'center' }]}>{headline}</Text>
        <RouteBadge routeName={routeName} mode={mode} size="lg" />
        <HapticPatternIcon pattern={pattern} color={accent} />
      </Card>
      <ReplayButton onPress={onReplay} />
    </View>
  );
}

// ───────── 정류장 타임라인 (ON_BUS): 이전 → 현재 → 다음 ─────────
function TimelineNode({ caption, name, active }: { caption: string; name: string | null; active?: boolean }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={name ? `${caption}, ${name}` : `${caption} 없음`} style={styles.node}>
      <View style={[styles.dot, active
        ? { width: 52, height: 52, backgroundColor: t.primary, borderColor: t.primary }
        : { backgroundColor: t.surface, borderColor: name ? t.primary : t.border }]}>
        {active ? <Icon name="bus" size={28} color={t.onPrimary} sw={2.3} /> : null}
      </View>
      <Text style={[styles.nodeCaption, { color: t.textDim }]} numberOfLines={1}>{caption}</Text>
      <Text style={[styles.nodeName, { color: name ? t.text : t.textFaint, fontWeight: active ? '900' : '700' }]} numberOfLines={2}>{name ?? '-'}</Text>
    </View>
  );
}

export function RideTimelineView({ headline, timeline, totalStops, routeName, mode, pattern, onReplay }: {
  headline: string;
  timeline: RideTimeline | null;      // 서버 stops가 없으면 null → 타임라인 없이 문구/정거장 수만
  totalStops?: number | null;         // timeline이 없거나 남은 수를 모를 때 쓰는 총 정거장 수 (leg.passStopCount)
  routeName?: string; mode?: Mode; pattern: readonly number[]; onReplay: () => void;
}) {
  const t = useTheme();
  const remaining = timeline?.remainingStops ?? null;
  return (
    <View style={styles.container}>
      <Card pad={20} style={{ gap: 14 }}>
        <RouteBadge routeName={routeName} mode={mode} />
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.headline, { color: t.text }]}>{headline}</Text>
        {timeline ? (
          <View style={styles.timelineRow}>
            <TimelineNode caption="이전 정류장" name={timeline.prev} />
            <View style={[styles.link, { backgroundColor: t.border }]} />
            <TimelineNode caption={timeline.currentKnown ? '현재 정류장' : '승차 정류장'} name={timeline.current} active />
            <View style={[styles.link, { backgroundColor: t.border }]} />
            <TimelineNode caption="다음 정류장" name={timeline.next} />
          </View>
        ) : null}
        {remaining != null ? (
          <View accessible accessibilityLabel={`남은 ${remaining}정거장`} style={styles.countRow}>
            <Text style={[styles.countBig, { color: t.primary }]}>{remaining}</Text>
            <Text style={[styles.countUnit, { color: t.text }]}>남은 정거장</Text>
          </View>
        ) : totalStops != null ? (
          <Text style={[styles.countUnit, { color: t.text }]}>{`총 ${totalStops}정거장`}</Text>
        ) : null}
        <HapticPatternIcon pattern={pattern} />
      </Card>
      <ReplayButton onPress={onReplay} />
    </View>
  );
}

// ───────── 하차 임박 (ALIGHTING_CONFIRM): 경고 톤 ─────────
export function AlightSoonView({ headline, remainingStops, distanceText, alightName, pattern, onReplay }: {
  headline: string; remainingStops?: number;
  distanceText?: string | null;   // "정류장 남음 · 약 N m" (stageView.alightDistanceText). 없으면 줄을 그리지 않는다
  alightName?: string; pattern: readonly number[]; onReplay: () => void;
}) {
  const t = useTheme();
  const warn = t.status.caution.fg;
  return (
    <View style={styles.container}>
      <Card pad={22} tone={warn} style={{ ...styles.centerCard, borderWidth: Math.max(t.borderW, 4), backgroundColor: withAlpha(warn, 0.1) }}>
        <View style={[styles.bigCircle, { borderColor: warn, backgroundColor: withAlpha(warn, 0.16) }]}>
          <Icon name="alert" size={48} color={warn} sw={2.3} />
        </View>
        <Text accessibilityRole="header" accessibilityLiveRegion="assertive" style={[styles.headline, { color: t.text, textAlign: 'center' }]}>{headline}</Text>
        {remainingStops != null ? (
          <View accessible accessibilityLabel={`남은 ${remainingStops}정거장`} style={styles.countRow}>
            <Text style={[styles.countHuge, { color: warn }]}>{remainingStops}</Text>
            <Text style={[styles.countUnit, { color: t.text }]}>남은 정거장</Text>
          </View>
        ) : null}
        {distanceText ? <Text accessible accessibilityLabel={distanceText} style={[styles.remainText, { color: t.text, textAlign: 'center' }]}>{distanceText}</Text> : null}
        {alightName ? <Text style={[styles.countUnit, { color: t.textDim, textAlign: 'center' }]}>{alightName}</Text> : null}
        <HapticPatternIcon pattern={pattern} color={warn} />
      </Card>
      <ReplayButton onPress={onReplay} />
    </View>
  );
}

// ───────── 하차 후 도보 전환 (WALK_TO_DEST): 남은 거리/방향 ─────────
// children에는 기존 도보 안내 화면(TransitGuide의 walkGuidance 슬롯)이 들어오면 전환 카드 아래에 이어서 보여준다
export function WalkToDestView({ headline, destName, remain, pattern, onReplay, children }: {
  headline: string; destName?: string; remain: WalkRemain | null; pattern: readonly number[]; onReplay: () => void; children?: React.ReactNode;
}) {
  const t = useTheme();
  const accent = t.primary;
  return (
    <View style={styles.container}>
      <Card pad={22} tone={accent} style={{ ...styles.centerCard, borderWidth: Math.max(t.borderW, 3) }}>
        <View style={[styles.bigCircle, { borderColor: accent, backgroundColor: withAlpha(accent, 0.14) }]}>
          <Icon name="walk" size={48} color={accent} sw={2.3} />
        </View>
        <Text style={[styles.countUnit, { color: t.textDim }]}>{STATE_LABEL.WALK_TO_DEST}</Text>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.headline, { color: t.text, textAlign: 'center' }]}>{headline}</Text>
        {destName ? <Text style={[styles.countUnit, { color: t.text, textAlign: 'center' }]}>{destName}</Text> : null}
        {remain ? (
          <View accessible accessibilityLabel={`남은 거리 ${formatDistanceKo(remain.distanceM)}, 방향 ${remain.direction}`} style={styles.remainRow}>
            <View style={styles.remainItem}>
              <Icon name="pin" size={28} color={accent} sw={2.3} />
              <Text style={[styles.remainText, { color: t.text }]}>{formatDistanceKo(remain.distanceM)}</Text>
            </View>
            <View style={styles.remainItem}>
              <Icon name="compass" size={28} color={accent} sw={2.3} />
              <Text style={[styles.remainText, { color: t.text }]}>{remain.direction}</Text>
            </View>
          </View>
        ) : null}
        <HapticPatternIcon pattern={pattern} />
      </Card>
      {children}
      <ReplayButton onPress={onReplay} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  centerCard: { alignItems: 'center', gap: 14 },
  bigCircle: { width: 96, height: 96, borderRadius: 999, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  headline: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  timelineRow: { flexDirection: 'row', alignItems: 'flex-start' },
  node: { flex: 1, alignItems: 'center', gap: 4 },
  dot: { width: 26, height: 26, borderRadius: 999, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginTop: 13 },
  link: { width: 16, height: 3, borderRadius: 2, marginTop: 38 },
  nodeCaption: { fontSize: 20, fontWeight: '700' },
  nodeName: { fontSize: 22, textAlign: 'center' },
  countRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 10 },
  countBig: { fontSize: 56, fontWeight: '900' },
  countHuge: { fontSize: 88, fontWeight: '900', lineHeight: 96 },
  countUnit: { fontSize: 24, fontWeight: '800' },
  remainRow: { flexDirection: 'row', gap: 24, flexWrap: 'wrap', justifyContent: 'center' },
  remainItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remainText: { fontSize: 28, fontWeight: '900' },
});
