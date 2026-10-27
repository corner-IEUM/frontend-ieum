// screens/PlaceSearch.tsx — 길찾기 진입점: 목적지를 검색해서 선택하면 좌표(lng/lat)를 넘긴다
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card, Waveform } from '../ui';
import { searchPlaces, Place, AuthExpiredError, API_BASE_URL } from '../api';
import { Coords } from '../hooks/useLocationTracking';
import { useVoiceCommand, type VoiceCommandApi } from '../hooks/useVoiceCommand';
import { VoiceControls } from '../VoiceUi';
import { announceText } from '../transit/feedback';
import { parseSearchQuery } from '../transit/voiceCommand';
import { VOICE } from '../transit/voiceMessages';

export function PlaceSearchScreen({ title = '목적지 검색', placeholder = '목적지를 입력하세요', currentLocation, onSelect, onCancel, onAuthExpired }: { title?: string; placeholder?: string; currentLocation?: Coords | null; onSelect: (place: Place) => void; onCancel: () => void; onAuthExpired: () => void }) {
  const t = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // ───────── 음성 검색: 마이크 → 검색어 → 기존 디바운스 검색 → 결과 낭독 → "첫 번째" 등으로 선택 ─────────
  const noun = title.includes('출발') ? '출발지' : '목적지';
  const resultsRef = useRef<Place[]>([]);
  const pendingVoiceQueryRef = useRef<string | null>(null); // 음성으로 넣은 검색어: 이 검색의 결과가 오면 낭독한다
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const voiceRef = useRef<VoiceCommandApi | null>(null);
  const voice = useVoiceCommand('placeSearch', {
    SELECT: (cmd) => {
      const place = resultsRef.current[cmd.index];
      if (!place) return;
      announceText(VOICE.selected(place.placeName), false);
      onSelectRef.current(place);
    },
  });
  voiceRef.current = voice;

  const announceResults = (places: Place[]) => {
    if (places.length === 0) { announceText(VOICE.noResults, false); return; }
    // 결과 개수를 넘는 번호("세 번째"인데 결과가 2개)는 인식 실패로 취급해 재시도시킨다
    voiceRef.current?.start(VOICE.resultsPrompt(places.length, places[0].placeName), (cmd) => cmd.type !== 'SELECT' || cmd.index < places.length);
  };

  // 화면 상태: 대기(마이크 버튼) / 듣는 중(voice.listening, 파형) / 인식 완료(recognized: 인식된 문장 + [맞아요]/[다시 말하기])
  const [recognized, setRecognized] = useState<string | null>(null);

  // 인식된 검색어를 확정: 기존 디바운스 검색에 넣고, 결과가 오면 announceResults가 낭독한다
  const applyRecognized = (spoken: string) => {
    setRecognized(null);
    announceText(VOICE.searching(spoken), false);
    if (spoken === query.trim()) { announceResults(resultsRef.current); return; } // 같은 검색어면 effect가 다시 돌지 않으므로 기존 결과를 바로 낭독
    pendingVoiceQueryRef.current = spoken;
    setQuery(spoken);
  };

  const startVoiceSearch = async () => {
    setRecognized(null);
    const result = await voice.ask<string>({
      prompt: VOICE.searchPrompt(noun),
      parse: parseSearchQuery,           // 비었거나 1글자면 null → 재시도, 검색하지 않음
      retryPrompt: VOICE.retry,
      failPrompt: VOICE.searchFailed,
    });
    if (result.status !== 'ok') return;
    const spoken = result.value.trim();
    setRecognized(spoken);
    // 음성으로도 맞는지 확인 (버튼과 같은 동작). 대답을 못 들으면 화면의 버튼으로 계속한다
    const answer = await voice.confirm(VOICE.recognizedConfirm(spoken));
    if (answer === 'YES') applyRecognized(spoken);
    else if (answer === 'NO') startVoiceSearch();
  };

  const handleVoiceToggle = () => {
    if (voice.listening) { voice.stop(); return; }
    startVoiceSearch();
  };

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
        if (reqId !== requestIdRef.current) return;
        setResults(places);
        resultsRef.current = places;
        if (pendingVoiceQueryRef.current === q) { pendingVoiceQueryRef.current = null; announceResults(places); }
      } catch (e) {
        if (reqId !== requestIdRef.current) return;
        console.error('[장소검색] 실패 — url:', API_BASE_URL, 'query:', q, 'error:', e);
        if (e instanceof AuthExpiredError) onAuthExpired();
        setError('검색 중 오류가 발생했습니다');
        setResults([]);
        resultsRef.current = [];
        if (pendingVoiceQueryRef.current === q) { pendingVoiceQueryRef.current = null; announceText(VOICE.searchError, false); }
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

      <VoiceControls
        available={voice.available}
        listening={voice.listening}
        permissionDenied={voice.permissionDenied}
        label={`음성으로 ${noun} 검색`}
        onToggle={handleVoiceToggle}
        onOpenSettings={voice.openSettings}
      />

      {voice.listening && !recognized ? (
        <Card pad={18} tone={t.primary} style={styles.voiceCard}>
          <Waveform active color={t.primary} />
          <Text accessibilityLiveRegion="polite" style={[styles.voiceHeadline, { color: t.text }]}>{VOICE.searchPrompt(noun)}</Text>
        </Card>
      ) : null}

      {recognized ? (
        <Card pad={18} tone={t.primary} style={styles.voiceCard}>
          <Icon name="check" size={32} color={t.primary} sw={2.6} />
          <Text accessible accessibilityLiveRegion="polite" style={[styles.voiceHeadline, { color: t.text }]}>{VOICE.recognizedConfirm(recognized)}</Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="맞아요"
            accessibilityHint="인식된 말로 검색합니다"
            onPress={() => { voice.cancel(); applyRecognized(recognized); }}
            style={[styles.voiceButton, { backgroundColor: t.primary }]}
          >
            <Text style={[styles.voiceButtonText, { color: t.onPrimary }]}>맞아요</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="다시 말하기"
            accessibilityHint="다시 음성으로 말합니다"
            onPress={() => { voice.stop(); startVoiceSearch(); }}
            style={[styles.voiceButton, { backgroundColor: t.surface, borderColor: t.primary, borderWidth: Math.max(t.borderW, 2.5) }]}
          >
            <Text style={[styles.voiceButtonText, { color: t.primary }]}>다시 말하기</Text>
          </TouchableOpacity>
        </Card>
      ) : null}

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
  voiceCard: { alignItems: 'center', gap: 14 },
  voiceHeadline: { fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: -0.5 },
  voiceButton: { width: '100%', minHeight: 72, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  voiceButtonText: { fontSize: 26, fontWeight: '900' },
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
