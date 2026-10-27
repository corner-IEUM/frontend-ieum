// transit/StateBadge.tsx — 현재 상태 배지 + leg 스텝 인디케이터 / Current-state badge and leg step indicator
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Icon, IconName } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import type { TransitSession, TransitSessionLeg } from './types';
import { UiState } from './uiState';
import { buildGuidance, STATE_LABEL } from './guidanceMessages';

// 색상만으로 구분하지 않도록 상태마다 아이콘 + 글자 / Each state has its own icon + text, never color alone
const BADGE: Record<UiState, { icon: IconName; label: string; tone: 'primary' | 'caution' | 'safe' | 'danger' }> = {
  WALK_TO_STOP: { icon: 'walk', label: STATE_LABEL.WALK_TO_STOP, tone: 'primary' },
  WAITING_AT_STOP: { icon: 'clock', label: STATE_LABEL.WAITING_AT_STOP, tone: 'primary' },
  BOARDING_CONFIRM: { icon: 'alert', label: STATE_LABEL.BOARDING_CONFIRM, tone: 'caution' },
  ON_BUS: { icon: 'bus', label: STATE_LABEL.ON_BUS, tone: 'primary' },
  ALIGHTING_CONFIRM: { icon: 'bell', label: STATE_LABEL.ALIGHTING_CONFIRM, tone: 'caution' },
  WALK_TO_DEST: { icon: 'pin', label: STATE_LABEL.WALK_TO_DEST, tone: 'primary' },
  ARRIVED: { icon: 'check', label: STATE_LABEL.ARRIVED, tone: 'safe' },
  CANCELED: { icon: 'x', label: STATE_LABEL.CANCELED, tone: 'danger' },
};

// 보조 정보 한 줄 / One-line sub info
function subInfo(uiState: UiState, leg: TransitSessionLeg | null, remainingStops?: number): string {
  if (!leg) return '';
  switch (uiState) {
    case 'WALK_TO_STOP':
    case 'WALK_TO_DEST':
      return leg.end.name;
    case 'WAITING_AT_STOP':
    case 'BOARDING_CONFIRM':
      return [leg.routeName ? `${leg.routeName}번` : null, leg.start.name].filter(Boolean).join(' · ');
    case 'ON_BUS':
    case 'ALIGHTING_CONFIRM': {
      // 남은 정류장 수는 아직 추적하지 않으므로 없으면 총 정거장 수로 대체 / remaining stops unknown yet; fall back to total
      const stops = remainingStops != null ? `남은 ${remainingStops}정거장` : leg.passStopCount != null ? `총 ${leg.passStopCount}정거장` : '';
      return [leg.end.name, stops].filter(Boolean).join(' · ');
    }
    default:
      return '';
  }
}

export function StateBadge({ uiState, session, leg, remainingStops }: {
  uiState: UiState;
  session: TransitSession;
  leg: TransitSessionLeg | null;
  remainingStops?: number;
}) {
  const t = useTheme();
  const b = BADGE[uiState];
  const accent = b.tone === 'primary' ? t.primary : t.status[b.tone].fg;
  const sub = subInfo(uiState, uiState === 'ARRIVED' ? session.legs[session.legs.length - 1] : leg, remainingStops);
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLiveRegion="polite"
      accessibilityLabel={buildGuidance(uiState, session)}  // TTS 문구와 동일 / same sentence as TTS
      style={[styles.badge, { borderColor: accent, borderWidth: Math.max(t.borderW, 2), backgroundColor: withAlpha(accent, 0.12), borderRadius: t.radiusSm }]}
    >
      <View style={styles.row}>
        <Icon name={b.icon} size={36} color={accent} sw={2.4} />
        <Text style={[styles.label, { color: t.text }]}>{b.label}</Text>
      </View>
      {sub ? <Text style={[styles.sub, { color: t.textDim }]}>{sub}</Text> : null}
    </View>
  );
}

// leg 순서대로 도보/버스 아이콘, 현재 leg 강조 / Icons per leg in order, current leg emphasized
export function LegStepIndicator({ legs, currentIndex, done }: { legs: TransitSessionLeg[]; currentIndex: number; done: boolean }) {
  const t = useTheme();
  const modeText = (m: string) => (m === 'BUS' ? '버스' : '도보');
  const cur = Math.min(currentIndex, legs.length - 1);
  return (
    <View
      accessible
      accessibilityLabel={done ? `전체 ${legs.length}구간 완료` : `전체 ${legs.length}구간 중 ${cur + 1}번째, ${modeText(legs[cur]?.mode)}`}
      style={styles.stepRow}
    >
      {legs.map((l, i) => {
        const isCur = !done && i === cur;
        const isDone = done || i < cur;
        return (
          <React.Fragment key={l.seq}>
            {i > 0 ? <View style={[styles.stepLine, { backgroundColor: isDone || isCur ? t.primary : t.border }]} /> : null}
            <View style={[
              styles.stepDot,
              isCur
                ? { backgroundColor: t.primary, borderColor: t.primary, transform: [{ scale: 1.15 }] }
                : { backgroundColor: isDone ? withAlpha(t.primary, 0.16) : t.surface, borderColor: isDone ? t.primary : t.border },
            ]}>
              {/* 현재 leg는 채움+확대, 완료는 체크로 구분 / current: filled+larger, done: check */}
              <Icon name={isDone ? 'check' : l.mode === 'BUS' ? 'bus' : 'walk'} size={22} color={isCur ? t.onPrimary : isDone ? t.primary : t.textDim} sw={2.3} />
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { padding: 16, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 20, fontWeight: '700' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepDot: { width: 44, height: 44, borderRadius: 999, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  stepLine: { flex: 1, height: 3, borderRadius: 2, maxWidth: 40 },
});
