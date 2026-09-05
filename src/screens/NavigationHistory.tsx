// screens/NavigationHistory.tsx — GET /api/navigation/history 결과를 카드 목록으로 보여주는 "길찾기 기록" 화면
// WalkLogHistory.tsx(보행 기록 화면)와 거의 같은 구조를 따르되, 응답 데이터가 달라 별도 파일로 분리했다
// (Navigation 기록에는 place명이 저장되지 않고 좌표만 있어 카드 내용이 다르고, searchOption도
// DB에 저장되지 않아 "추천 경로/계단 없는 경로" 배지는 표시할 수 없음 — 완료 여부 배지로 대체).
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card } from '../ui';
import { NavigationHistoryItem, getNavigationHistory, AuthExpiredError } from '../api';
import { formatDistance, formatDuration } from './RouteCandidates';

// createdAt(ISO 문자열)을 "YYYY.MM.DD HH:mm" 형태로 표시 — WalkLogHistory.tsx의 formatDate와 동일한 규칙
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 위경도를 소수점 5자리(약 1m 단위 정밀도)로 짧게 표시 — place명이 없어 좌표로 대체 표시
function formatCoord(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

// 완료 여부 배지 — RouteCandidates.tsx의 AccessibilityBadges와 같은 pill 스타일을 재사용
function CompletedBadge({ completed }: { completed: boolean }) {
  const t = useTheme();
  const c = completed ? t.status.safe.fg : t.status.caution.fg;
  return (
    <View style={[styles.badge, { backgroundColor: withAlpha(c, 0.14), borderColor: withAlpha(c, 0.4) }]}>
      <Icon name={completed ? 'check' : 'refresh'} size={13} color={c} sw={2.2} />
      <Text style={[styles.badgeText, { color: c }]}>{completed ? '완료' : '진행 중'}</Text>
    </View>
  );
}

function NavigationHistoryCard({ item }: { item: NavigationHistoryItem }) {
  const t = useTheme();
  return (
    <Card pad={16} style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Icon name="clock" size={18} color={t.primary} sw={2.1} />
        <Text style={[styles.dateText, { color: t.text }]}>{formatDate(item.startTime)}</Text>
        <View style={{ flex: 1 }} />
        <CompletedBadge completed={item.completed} />
      </View>
      <View style={styles.routeRow}>
        <Text style={[styles.routeText, { color: t.textDim }]} numberOfLines={1}>{formatCoord(item.startLat, item.startLng)}</Text>
        <Icon name="arrowR" size={14} color={t.textFaint} sw={2.2} />
        <Text style={[styles.routeText, { color: t.textDim }]} numberOfLines={1}>{formatCoord(item.endLat, item.endLng)}</Text>
      </View>
      <View style={styles.countRow}>
        <View style={styles.countItem}>
          <Icon name="pin" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>{formatDistance(item.distance)}</Text>
        </View>
        <View style={styles.countItem}>
          <Icon name="compass" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>{formatDuration(item.duration)}</Text>
        </View>
        <View style={styles.countItem}>
          <Icon name="alert" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>장애물 {item.obstacleCnt}건</Text>
        </View>
      </View>
    </Card>
  );
}

export function NavigationHistoryScreen({ onBack, onAuthExpired }: { onBack: () => void; onAuthExpired: () => void }) {
  const t = useTheme();
  const [items, setItems] = useState<NavigationHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getNavigationHistory()
      .then(setItems)
      .catch((e) => {
        if (e instanceof AuthExpiredError) onAuthExpired();
        setError('길찾기 기록을 불러오지 못했습니다');
      })
      .finally(() => setLoading(false));
  };

  // 화면 진입 시 1회 목록 조회
  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <ModeHeader title="길찾기 기록" icon="clock" onBack={onBack} />

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.status.danger.fg }]}>{error}</Text>
          <TouchableOpacity onPress={load} style={[styles.retryButton, { backgroundColor: t.primary }]}>
            <Text style={[styles.retryText, { color: t.onPrimary }]}>다시 시도</Text>
          </TouchableOpacity>
        </View>
      ) : !items || items.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.textDim }]}>저장된 길찾기 기록이 없습니다</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <NavigationHistoryCard key={item.id} item={item} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 14, flex: 1 },
  centerBox: { paddingTop: 40, alignItems: 'center', gap: 16 },
  msgText: { fontSize: 15, fontWeight: '700' },
  retryButton: { height: 46, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  retryText: { fontWeight: '800', fontSize: 15 },
  list: { gap: 12 },
  card: { gap: 10 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateText: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  routeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  routeText: { flex: 1, fontSize: 13, fontWeight: '700' },
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontSize: 13, fontWeight: '700' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeText: { fontSize: 11.5, fontWeight: '800' },
});
