// screens/PlaceSearch.tsx — 길찾기 진입점: 목적지를 검색해서 선택하면 좌표(lng/lat)를 넘긴다
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card } from '../ui';
import { searchPlaces, Place, AuthExpiredError } from '../api';
import { Coords } from '../hooks/useLocationTracking';

export function PlaceSearchScreen({ title = '목적지 검색', placeholder = '목적지를 입력하세요', currentLocation, onSelect, onCancel, onAuthExpired }: { title?: string; placeholder?: string; currentLocation?: Coords | null; onSelect: (place: Place) => void; onCancel: () => void; onAuthExpired: () => void }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q) { setResults([]); setError(null); setLoading(false); return; }

    setLoading(true);
    setError(null);
    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      try {
        const places = await searchPlaces(q, currentLocation?.longitude, currentLocation?.latitude);
        if (reqId !== requestIdRef.current) return; // 더 최신 검색이 진행 중이면 이 결과는 버림
        setResults(places);
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        if (e instanceof AuthExpiredError) { onAuthExpired(); return; }
        setError('검색 중 오류가 발생했습니다');
        setResults([]);
      } finally {
        if (reqId === requestIdRef.current) setLoading(false);
      }
    }, 350);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, currentLocation?.longitude, currentLocation?.latitude]);

  return (
    <View style={styles.container}>
      <ModeHeader title={title} icon="pin" onBack={onCancel} />

      <View style={[styles.searchBar, { borderRadius: t.radiusSm, backgroundColor: t.surface2, borderWidth: t.borderW, borderColor: t.border }]}>
        <Icon name="compass" size={19} color={t.textFaint} sw={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={t.textFaint}
          autoFocus
          style={[styles.searchInput, { color: t.text }]}
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Icon name="x" size={18} color={t.textFaint} sw={2.2} />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator color={t.primary} />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.status.danger.fg }]}>{error}</Text>
        </View>
      ) : query.trim() && results.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.textDim }]}>검색 결과가 없습니다</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {results.map((p, k) => (
            <TouchableOpacity key={`${p.placeName}-${k}`} activeOpacity={0.85} onPress={() => onSelect(p)}>
              <Card pad={16} style={styles.resultCard}>
                <View style={[styles.resultIconCircle, { backgroundColor: withAlpha(t.primary, 0.16) }]}>
                  <Icon name="pin" size={20} color={t.primary} sw={2} />
                </View>
                <View style={styles.resultInfo}>
                  <Text style={[styles.resultName, { color: t.text }]}>{p.placeName}</Text>
                  <Text style={[styles.resultAddr, { color: t.textDim }]} numberOfLines={1}>{p.roadAddress}</Text>
                </View>
                {p.distance != null ? (
                  <Text style={[styles.resultDist, { color: t.textFaint }]}>
                    {p.distance >= 1000 ? `${(p.distance / 1000).toFixed(1)}km` : `${p.distance}m`}
                  </Text>
                ) : null}
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 14, flex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, fontWeight: '600', padding: 0 },
  centerBox: { paddingTop: 40, alignItems: 'center' },
  msgText: { fontSize: 15, fontWeight: '700' },
  list: { gap: 10 },
  resultCard: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  resultIconCircle: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resultInfo: { flex: 1 },
  resultName: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  resultAddr: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  resultDist: { fontSize: 13, fontWeight: '700' },
});
