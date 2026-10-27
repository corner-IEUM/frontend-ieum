// transit/TransitUi.tsx — 대중교통 안내 화면들이 같이 쓰는 표시 컴포넌트 (3단계 스텝, 진동 패턴 아이콘, 다시 듣기 버튼, 노선 배지)
// 모든 값은 props로 받는다. 이 파일에는 정류장명/노선/시간 같은 고정 값이 없다 / All values come from props; no fixed stop/route/time values here
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { STAGE_LABELS, hapticSegments, hapticLabel, type StageNo } from './stageView';

// 상단 3단계 스텝: 경로 탐색 → 탑승 지원 → 이동 안내. 색만으로 구분하지 않도록 완료=체크, 현재=채움+굵은 글자
export function StageStepper({ stage }: { stage: StageNo }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`전체 3단계 중 ${stage}단계, ${STAGE_LABELS[stage - 1]}`} style={styles.stepperRow}>
      {STAGE_LABELS.map((label, i) => {
        const no = (i + 1) as StageNo;
        const done = no < stage;
        const cur = no === stage;
        return (
          <React.Fragment key={label}>
            {i > 0 ? <View style={[styles.stepLine, { backgroundColor: no <= stage ? t.primary : t.border }]} /> : null}
            <View style={styles.stepItem}>
              <View style={[styles.stepDot, cur
                ? { backgroundColor: t.primary, borderColor: t.primary }
                : { backgroundColor: done ? withAlpha(t.primary, 0.16) : t.surface, borderColor: done ? t.primary : t.border }]}>
                {done ? <Icon name="check" size={24} color={t.primary} sw={2.6} />
                  : <Text style={[styles.stepNo, { color: cur ? t.onPrimary : t.textDim }]}>{no}</Text>}
              </View>
              <Text style={[styles.stepLabel, { color: cur ? t.text : t.textDim, fontWeight: cur ? '900' : '700' }]} numberOfLines={1}>{label}</Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// 진동 패턴 아이콘: 실제로 울리는 패턴 배열(feedback.ts의 HAPTIC 등)을 그대로 받아 길이 비례 막대로 그린다 + "진동 N회" 글자
export function HapticPatternIcon({ pattern, color }: { pattern: readonly number[]; color?: string }) {
  const t = useTheme();
  const c = color ?? t.primary;
  const segs = hapticSegments(pattern);
  const total = segs.reduce((s, x) => s + x.ms, 0) || 1;
  return (
    <View accessible accessibilityLabel={hapticLabel(pattern)} style={styles.hapticRow}>
      <Icon name="vibrate" size={26} color={c} sw={2.2} />
      <View style={styles.hapticBars}>
        {segs.map((s, i) => (
          <View key={i} style={{ width: Math.max(8, Math.round((s.ms / total) * 96)), height: s.kind === 'buzz' ? 18 : 4, borderRadius: 3, backgroundColor: s.kind === 'buzz' ? c : 'transparent' }} />
        ))}
      </View>
      <Text style={[styles.hapticText, { color: t.textDim }]}>{hapticLabel(pattern)}</Text>
    </View>
  );
}

// 다시 듣기: 화면 문구와 같은 문장을 다시 읽는다. 하단 전체 폭, 높이 72
export function ReplayButton({ onPress, label = '다시 듣기', hint = '현재 안내를 다시 읽어줍니다' }: { onPress: () => void; label?: string; hint?: string }) {
  const t = useTheme();
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={[styles.bigButton, { backgroundColor: t.surface, borderColor: t.primary, borderWidth: Math.max(t.borderW, 2.5) }]}
    >
      <Icon name="speaker" size={28} color={t.primary} sw={2.2} />
      <Text style={[styles.bigButtonText, { color: t.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// 노선 번호 배지 (버스/지하철 아이콘 + 노선명). 노선명이 없으면 그리지 않는다 / Renders nothing without a route name
export function RouteBadge({ routeName, mode = 'BUS', size = 'md' }: { routeName?: string | null; mode?: 'BUS' | 'SUBWAY'; size?: 'md' | 'lg' }) {
  const t = useTheme();
  if (!routeName) return null;
  return (
    <View accessible accessibilityLabel={mode === 'SUBWAY' ? `${routeName} 지하철` : `${routeName}번 버스`}
      style={[styles.badge, { borderColor: t.primary, backgroundColor: withAlpha(t.primary, 0.12), borderRadius: t.radiusSm, paddingVertical: size === 'lg' ? 10 : 6 }]}>
      <Icon name={mode === 'SUBWAY' ? 'subway' : 'bus'} size={size === 'lg' ? 30 : 24} color={t.primary} sw={2.3} />
      <Text style={[styles.badgeText, { color: t.primary, fontSize: size === 'lg' ? 34 : 24 }]} numberOfLines={1}>{routeName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stepperRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  stepItem: { alignItems: 'center', gap: 4, minWidth: 84 },
  stepDot: { width: 44, height: 44, borderRadius: 999, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  stepNo: { fontSize: 22, fontWeight: '900' },
  stepLabel: { fontSize: 20 },
  stepLine: { flex: 1, height: 3, borderRadius: 2, marginTop: 21, maxWidth: 36 },
  hapticRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hapticBars: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 20 },
  hapticText: { fontSize: 20, fontWeight: '800' },
  bigButton: { minHeight: 72, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  bigButtonText: { fontSize: 26, fontWeight: '900' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 14, borderWidth: 2 },
  badgeText: { fontWeight: '900', letterSpacing: -0.5 },
});
