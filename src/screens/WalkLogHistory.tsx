// screens/WalkLogHistory.tsx — GET /api/walk/logs 결과를 카드 목록으로 보여주는 "이동경로 저장" 화면
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { ModeHeader, Card } from '../ui';
import { WalkLog, getWalkLogs, AuthExpiredError } from '../api';
import { formatDistance, formatDuration } from './RouteCandidates';

// createdAt(ISO 문자열)을 "YYYY.MM.DD HH:mm" 형태로 표시
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function WalkLogCard({ log }: { log: WalkLog }) {
  const t = useTheme();
  return (
    <Card pad={16} style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Icon name="clock" size={18} color={t.primary} sw={2.1} />
        <Text style={[styles.dateText, { color: t.text }]}>{formatDate(log.createdAt)}</Text>
      </View>
      <View style={styles.countRow}>
        <View style={styles.countItem}>
          <Icon name="pin" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>{formatDistance(log.totalDistance)}</Text>
        </View>
        <View style={styles.countItem}>
          <Icon name="compass" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>{formatDuration(log.totalTime)}</Text>
        </View>
        <View style={styles.countItem}>
          <Icon name="alert" size={16} color={t.primary} sw={2.1} />
          <Text style={[styles.countText, { color: t.textDim }]}>장애물 {log.obstacleCount}건</Text>
        </View>
      </View>
    </Card>
  );
}

export function WalkLogHistoryScreen({ onBack, onAuthExpired }: { onBack: () => void; onAuthExpired: () => void }) {
  const t = useTheme();
  const [logs, setLogs] = useState<WalkLog[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getWalkLogs()
      .then(setLogs)
      .catch((e) => {
        if (e instanceof AuthExpiredError) { onAuthExpired(); return; }
        setError('보행 기록을 불러오지 못했습니다');
      })
      .finally(() => setLoading(false));
  };

  // 화면 진입 시 1회 목록 조회
  useEffect(() => { load(); }, []);

  return (
    <View style={styles.container}>
      <ModeHeader title="이동경로 저장" icon="clock" onBack={onBack} />

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
      ) : !logs || logs.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.textDim }]}>저장된 보행 기록이 없습니다</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {logs.map((log) => (
            <WalkLogCard key={log.id} log={log} />
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
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  countItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countText: { fontSize: 13, fontWeight: '700' },
});
