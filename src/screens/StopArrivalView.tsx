// screens/StopArrivalView.tsx — 정류장 도착 화면 (정류장명, 내 노선 배지, 실시간 도착 카드, 접근 중/곧 도착/도착함)
// 표시만 한다. 도착 정보 조회·안내·자동 전이 로직은 WaitingAtStop.tsx(useArrivalPolling/arrivalAnnouncer)에 있고, 값은 모두 props로 받는다
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { Card } from '../ui';
import type { BusArrival } from '../transit/types';
import { BUS_ARRIVED_BUTTON, GUIDANCE } from '../transit/guidanceMessages';
import { arrivalSentence, arrivalTimeText, arrivalA11yLabel, isSoon, nextArrivalText } from '../transit/arrivalAnnouncer';
import { PHASE_LABEL, PHASE_ORDER, type ArrivalPhase } from '../transit/stageView';
import { HapticPatternIcon, ReplayButton, RouteBadge } from '../transit/TransitUi';

const PHASE_ICON = { APPROACHING: 'bus', SOON: 'alert', ARRIVED: 'check' } as const;

// 접근 중 → 곧 도착 → 도착함: 색만이 아니라 아이콘 + 글자로 현재 상태를 구분 / Icon + text, never color alone
export function PhaseChips({ phase }: { phase: ArrivalPhase }) {
  const t = useTheme();
  return (
    <View accessible accessibilityLabel={`버스 상태, ${PHASE_LABEL[phase]}`} style={styles.chipRow}>
      {PHASE_ORDER.map((p) => {
        const on = p === phase;
        const accent = p === 'SOON' ? t.status.caution.fg : p === 'ARRIVED' ? t.status.safe.fg : t.primary;
        return (
          <View key={p} style={[styles.chip, { borderColor: on ? accent : t.border, backgroundColor: on ? withAlpha(accent, 0.16) : t.surface, borderWidth: Math.max(t.borderW, on ? 2.5 : 1.5) }]}>
            <Icon name={PHASE_ICON[p]} size={22} color={on ? accent : t.textFaint} sw={2.3} />
            <Text style={[styles.chipText, { color: on ? t.text : t.textDim, fontWeight: on ? '900' : '700' }]} numberOfLines={1}>{PHASE_LABEL[p]}</Text>
          </View>
        );
      })}
    </View>
  );
}

export function StopArrivalView({
  stopName, routeName, mine, others, phase, statusText, isError, loading, updatedText, canRefetch, hapticPattern, onReplay, onBusArrived, onRefetch,
}: {
  stopName: string;
  routeName?: string;
  mine: BusArrival | null;          // 내가 탈 노선의 실시간 도착 (TAGO)
  others: BusArrival[];             // 같은 정류장의 다른 노선 도착 (임박 순)
  phase: ArrivalPhase;
  statusText: string | null;        // 로딩/오류 문구 (ARRIVAL_MSG 그대로)
  isError: boolean;
  loading: boolean;
  updatedText: string | null;
  canRefetch: boolean;
  hapticPattern: readonly number[]; // 실제로 울리는 진동 패턴
  onReplay: () => void;
  onBusArrived?: () => void;
  onRefetch: () => void;
}) {
  const t = useTheme();
  const danger = t.status.danger.fg;
  const accent = phase === 'SOON' ? t.status.caution.fg : t.primary;
  // 핵심 문구는 음성 안내와 같은 문장 / Headline is the same sentence the TTS reads
  const headline = mine ? arrivalSentence(mine) : GUIDANCE.waitingAtStop(routeName, 'BUS');
  return (
    <View style={styles.container}>
      <View accessible accessibilityRole="header" accessibilityLabel={`정류장, ${stopName}`} style={styles.stopRow}>
        <Icon name="pin" size={30} color={t.primary} sw={2.4} />
        <Text style={[styles.stopName, { color: t.text }]} numberOfLines={2}>{stopName}</Text>
      </View>

      <PhaseChips phase={phase} />

      <Card pad={18} tone={accent} style={{ borderWidth: Math.max(t.borderW, phase === 'SOON' ? 3 : 2), gap: 12 }}>
        <RouteBadge routeName={routeName} size="lg" />
        <Text accessibilityLiveRegion="polite" style={[styles.headline, { color: t.text }]}>{headline}</Text>
        {mine ? (
          <View accessible accessibilityLabel={arrivalA11yLabel(mine)} style={styles.metaRow}>
            <Text style={[styles.time, { color: accent }]}>{isSoon(mine) ? '곧 도착' : `${arrivalTimeText(mine)} 후`}</Text>
            {mine.remainingStops != null ? <Text style={[styles.meta, { color: t.textDim }]}>{mine.remainingStops}정거장 전</Text> : null}
            {nextArrivalText(mine) ? <Text style={[styles.meta, { color: t.textDim }]}>{nextArrivalText(mine)}</Text> : null}
          </View>
        ) : null}
        <HapticPatternIcon pattern={hapticPattern} color={accent} />
      </Card>

      {statusText || updatedText ? (
        <View accessible accessibilityLiveRegion="polite" accessibilityLabel={[statusText, updatedText].filter(Boolean).join(', ')} style={styles.statusArea}>
          {statusText ? (
            <View style={[styles.statusBox, isError && { borderColor: danger, backgroundColor: withAlpha(danger, 0.1), borderWidth: Math.max(t.borderW, 2) }]}>
              {isError ? <Icon name="alert" size={26} color={danger} sw={2.4} /> : null}
              {loading ? <ActivityIndicator color={t.primary} /> : null}
              <Text style={[styles.statusText, { color: isError ? danger : t.text }]}>{statusText}</Text>
            </View>
          ) : null}
          {updatedText ? <Text style={[styles.meta, { color: t.textDim }]}>{updatedText}</Text> : null}
        </View>
      ) : null}

      {others.length > 0 ? (
        <View style={styles.list} accessibilityLabel={`다른 버스 ${others.length}대`}>
          {others.map((a) => (
            <View key={a.routeId} accessible accessibilityLabel={arrivalA11yLabel(a)} style={[styles.otherRow, { borderColor: t.border, borderWidth: Math.max(t.borderW, 1.5), borderRadius: t.radiusSm }]}>
              <Text style={[styles.otherNo, { color: t.text }]} numberOfLines={1}>{a.routeNo}</Text>
              <Text style={[styles.otherTime, { color: t.textDim }]}>{isSoon(a) ? '곧 도착' : `${arrivalTimeText(a)} 후`}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* 도착 정보가 실패하거나 stopId가 없어 자동 전이가 안 될 때를 위한 수동 버튼 (WaitingAtStop의 기존 대체 수단) */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={BUS_ARRIVED_BUTTON.label}
        accessibilityHint={BUS_ARRIVED_BUTTON.hint}
        onPress={onBusArrived}
        style={[styles.bigButton, { backgroundColor: t.primary }]}
      >
        <Icon name="bus" size={28} color={t.onPrimary} sw={2.6} />
        <Text style={[styles.bigButtonText, { color: t.onPrimary }]}>{BUS_ARRIVED_BUTTON.label}</Text>
      </TouchableOpacity>

      <ReplayButton onPress={onReplay} />

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="다시 확인"
        accessibilityHint="버스 도착 정보를 지금 다시 불러옵니다"
        accessibilityState={{ disabled: !canRefetch }}
        disabled={!canRefetch}
        onPress={onRefetch}
        style={[styles.bigButton, { borderColor: t.border, backgroundColor: t.surface, borderWidth: Math.max(t.borderW, 2), opacity: canRefetch ? 1 : 0.5 }]}
      >
        <Icon name="refresh" size={26} color={t.textDim} sw={2.4} />
        <Text style={[styles.bigButtonText, { color: t.textDim }]}>다시 확인</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stopName: { flex: 1, fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  chipRow: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  chipText: { fontSize: 20 },
  headline: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  metaRow: { gap: 2 },
  time: { fontSize: 30, fontWeight: '900' },
  meta: { fontSize: 20, fontWeight: '700' },
  statusArea: { gap: 6 },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, borderColor: 'transparent', borderWidth: 0 },
  statusText: { flex: 1, fontSize: 20, fontWeight: '800' },
  list: { gap: 8 },
  otherRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16 },
  otherNo: { flex: 1, fontSize: 28, fontWeight: '900' },
  otherTime: { fontSize: 22, fontWeight: '800' },
  bigButton: { minHeight: 72, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  bigButtonText: { fontSize: 26, fontWeight: '900' },
});
