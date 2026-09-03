// screens/RouteCandidates.tsx — 출발지/목적지가 정해진 뒤 POST /api/navigation/route/candidates 결과를 보여주고 하나를 고르게 함
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card } from '../ui';
import { RouteCandidate, Place } from '../api';

export function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`;
}
export function formatDuration(s: number): string {
  const min = Math.round(s / 60);
  if (min < 60) return `약 ${min}분`;
  return `약 ${Math.floor(min / 60)}시간 ${min % 60}분`;
}

function AccessibilityBadges({ summary }: { summary: RouteCandidate['accessibilitySummary'] }) {
  const t = useTheme();
  const items: { label: string; count: number }[] = [
    { label: '턱 안낮춤', count: summary.noCurbCutCount },
    { label: '점자블록 없음', count: summary.noBrailleBlockCount },
    { label: '음향신호기 없음', count: summary.noSoundSignalCount },
    { label: '보행신호등 없음', count: summary.noPedestrianSignalCount },
  ].filter((it) => it.count > 0);
  if (items.length === 0) return null;
  const c = t.status.caution.fg;
  return (
    <View style={styles.badgeRow}>
      {items.map((it) => (
        <View key={it.label} style={[styles.badge, { backgroundColor: withAlpha(c, 0.14), borderColor: withAlpha(c, 0.4) }]}>
          <Icon name="alert" size={13} color={c} sw={2.2} />
          <Text style={[styles.badgeText, { color: c }]}>{it.label} {it.count}</Text>
        </View>
      ))}
    </View>
  );
}

function CandidateCard({ candidate, onPress }: { candidate: RouteCandidate; onPress: () => void }) {
  const t = useTheme();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <Card pad={16} style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardLabel, { color: t.text }]}>{candidate.label}</Text>
          <Icon name="chevron" size={20} color={t.textFaint} sw={2.4} />
        </View>
        <Text style={[styles.cardMeta, { color: t.textDim }]}>
          {formatDistance(candidate.distance)} · {formatDuration(candidate.duration)}
        </Text>
        <View style={styles.countRow}>
          <View style={styles.countItem}>
            <Icon name="cross" size={16} color={t.primary} sw={2.1} />
            <Text style={[styles.countText, { color: t.textDim }]}>횡단보도 {candidate.crosswalks.length}</Text>
          </View>
          <View style={styles.countItem}>
            <Icon name="stairs" size={16} color={t.primary} sw={2.1} />
            <Text style={[styles.countText, { color: t.textDim }]}>계단 {candidate.stairs.length}</Text>
          </View>
        </View>
        <AccessibilityBadges summary={candidate.accessibilitySummary} />
      </Card>
    </TouchableOpacity>
  );
}

export function RouteCandidatesScreen({
  origin, destination, candidates, loading, error, onRetry, onSelect, onBack, creating, createError,
}: {
  origin?: Place | null;
  destination?: Place | null;
  candidates: RouteCandidate[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (candidate: RouteCandidate) => void;
  onBack: () => void;
  creating?: boolean;
  createError?: string | null;
}) {
  const t = useTheme();
  return (
    <View style={styles.container}>
      <ModeHeader title="경로 선택" icon="pin" onBack={onBack} />

      <Card pad={16} style={styles.routeSummaryCard}>
        <Text style={[styles.routeSummaryText, { color: t.textDim }]} numberOfLines={1}>{origin?.placeName ?? '출발지'}</Text>
        <Icon name="arrowR" size={16} color={t.textFaint} sw={2.2} />
        <Text style={[styles.routeSummaryText, { color: t.text, fontWeight: '800' }]} numberOfLines={1}>{destination?.placeName ?? '목적지'}</Text>
      </Card>

      {createError ? (
        <View style={[styles.createErrorBanner, { backgroundColor: withAlpha(t.status.danger.fg, 0.12), borderColor: withAlpha(t.status.danger.fg, 0.4) }]}>
          <Icon name="alert" size={16} color={t.status.danger.fg} sw={2.2} />
          <Text style={[styles.createErrorText, { color: t.status.danger.fg }]}>{createError} 다시 눌러 선택해주세요.</Text>
        </View>
      ) : null}

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.status.danger.fg }]}>{error}</Text>
          <TouchableOpacity onPress={onRetry} style={[styles.retryButton, { backgroundColor: t.primary }]}>
            <Text style={[styles.retryText, { color: t.onPrimary }]}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : !candidates || candidates.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.textDim }]}>경로 후보가 없습니다</Text>
        </View>
      ) : (
        <View style={[styles.list, creating ? styles.listDisabled : null]} pointerEvents={creating ? 'none' : 'auto'}>
          {candidates.map((c, k) => (
            <CandidateCard key={`${c.searchOption}-${k}`} candidate={c} onPress={() => onSelect(c)} />
          ))}
        </View>
      )}

      {creating ? (
        <View style={styles.creatingRow}>
          <ActivityIndicator color={t.primary} />
          <Text style={[styles.msgText, { color: t.textDim }]}>경로를 생성하는 중…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 14, flex: 1 },
  routeSummaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeSummaryText: { flex: 1, fontSize: 14, fontWeight: '700' },
  centerBox: { paddingTop: 40, alignItems: 'center', gap: 16 },
  msgText: { fontSize: 15, fontWeight: '700' },
  retryButton: { height: 46, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontWeight: '800', fontSize: 15 },
  list: { gap: 12 },
  listDisabled: { opacity: 0.5 },
  creatingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 20 },
  createErrorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, borderWidth: 1 },
  createErrorText: { flex: 1, fontSize: 13, fontWeight: '700' },
  card: { gap: 10 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
  cardMeta: { fontSize: 14, fontWeight: '700' },
  countRow: { flexDirection: 'row', gap: 16 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontSize: 13, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
});
