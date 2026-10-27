// screens/TransitCandidates.tsx — 후보 목록 + 음성 순차 안내 + 터치 선택 / Candidate list, sequential TTS, tap to select (usable without looking)
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Vibration, StyleSheet, ScrollView } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card } from '../ui';
import { AuthExpiredError, fetchRouteCandidates, saveTransitRoute, type RouteCandidate } from '../api';
import { speakSequence, speakWithPriority, stopSpeaking } from '../tts';
import { useVoiceCommand, type VoiceCommandApi } from '../hooks/useVoiceCommand';
import { VoiceBottomBar } from '../VoiceUi';
import { StageStepper, RouteBadge } from '../transit/TransitUi';
import { hasTransitLeg } from '../transit/stageView';
import { announceText } from '../transit/feedback';
import { VOICE } from '../transit/voiceMessages';
import { TransitPlace, TransitRouteCandidate, TransitSession } from '../transit/types';
import { CandidateSummary, summarizeCandidates, buildAnnouncement, buildSelectionSpeech, OUT_OF_SERVICE_TEXT } from '../transit/candidateSummary';

type Status = 'loading' | 'error' | 'empty' | 'ready';

const SPEECH = {
  loading: '경로를 찾는 중입니다.',
  error: '경로를 불러오지 못했어요. 다시 시도하거나 도보 경로 보기 버튼을 눌러주세요.',
  walkOnly: '이용할 수 있는 대중교통이 없어요. 도보 경로만 안내해요.',
  empty: '이용할 수 있는 경로가 없어요. 뒤로 가서 다른 목적지를 선택해주세요.',
  saveFail: '경로를 저장하지 못했어요. 원하는 경로를 다시 눌러 선택하세요.',
};

function CandidateCard({ summary, onPress, disabled, selected, reading }: { summary: CandidateSummary; onPress: () => void; disabled: boolean; selected: boolean; reading: boolean }) {
  const t = useTheme();
  const accent = selected || reading || summary.isFastest ? t.primary : t.border;
  const emphasized = selected || reading;
  const rideMode = summary.typeLabel === '지하철 이용' ? 'SUBWAY' : 'BUS';
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessible
      accessibilityRole="button"
      accessibilityLabel={summary.speech}
      accessibilityHint="누르면 이 경로를 음성으로 안내해요"
      accessibilityState={{ disabled, selected }}
      style={styles.cardTouch}
    >
      <Card pad={16} tone={accent} style={emphasized ? { ...styles.card, borderWidth: 4, backgroundColor: withAlpha(t.primary, 0.06) } : styles.card}>
        <View style={styles.cardRow}>
          {/* 좌측 큰 번호: 음성으로 "N번"이라고 말하는 그 번호 */}
          <View style={[styles.numberBox, { backgroundColor: emphasized ? t.primary : t.surface2, borderColor: t.primary, borderRadius: t.radiusSm }]}>
            <Text style={[styles.numberBoxText, { color: emphasized ? t.onPrimary : t.text }]}>{summary.index}</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.headerRow}>
              {summary.isWalkOnly ? (
                <>
                  <Icon name="walk" size={28} color={t.text} sw={2.2} />
                  <Text style={[styles.typeLabel, { color: t.text }]}>{summary.typeLabel}</Text>
                </>
              ) : (
                summary.busRoutes.slice(0, 2).map((r, i) => <RouteBadge key={`${r}-${i}`} routeName={r} mode={rideMode} />)
              )}
              <Text style={[styles.durationInline, { color: t.text }]}>{summary.totalDurationText}</Text>
            </View>
            {!summary.isWalkOnly ? (
              <Text style={[styles.sub, { color: t.textDim }]}>
                {summary.transferCount > 0 ? `환승 ${summary.transferCount}회` : '환승 없음'} · 도보 {summary.walkDistanceText}
              </Text>
            ) : null}
            {/* 색상만으로 구분 안 함: 아이콘 + 글자 / Not color-only: icon + text */}
            <View style={styles.headerRow}>
              {reading ? (
                <View style={[styles.badge, { borderColor: t.primary, backgroundColor: withAlpha(t.primary, 0.14) }]}>
                  <Icon name="speaker" size={18} color={t.primary} sw={2.4} />
                  <Text style={[styles.badgeText, { color: t.primary }]}>읽는 중</Text>
                </View>
              ) : null}
              {summary.isFastest ? (
                <View style={[styles.badge, { borderColor: t.primary, backgroundColor: withAlpha(t.primary, 0.14) }]}>
                  <Icon name="check" size={18} color={t.primary} sw={2.6} />
                  <Text style={[styles.badgeText, { color: t.primary }]}>가장 빠름</Text>
                </View>
              ) : null}
              {selected ? <Text style={[styles.selectedText, { color: t.primary }]}>선택됨</Text> : null}
            </View>
            {summary.fasterThanWalkText ? <Text style={[styles.sub, { color: t.status.safe.fg }]}>{summary.fasterThanWalkText}</Text> : null}
            {summary.outOfServiceWarning ? (
              <View style={styles.warnRow}>
                <Icon name="alert" size={22} color={t.status.caution.fg} sw={2.4} />
                <Text style={[styles.sub, { color: t.status.caution.fg }]}>{OUT_OF_SERVICE_TEXT}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </TouchableOpacity>
  );
}

export function TransitCandidatesScreen({ origin, destination, onSelected, onWalkSelected, onBack, onAuthExpired }: {
  origin: TransitPlace;
  destination: TransitPlace;
  onSelected: (session: TransitSession) => void;
  onWalkSelected: (route: RouteCandidate) => Promise<void> | void;   // 도보 후보(walkOption) 선택 → 기존 보행 흐름 / walk option → existing walking flow
  onBack: () => void;
  onAuthExpired?: () => void;
}) {
  const t = useTheme();
  const [status, setStatus] = useState<Status>('loading');
  const [candidates, setCandidates] = useState<TransitRouteCandidate[]>([]);
  const [summaries, setSummaries] = useState<CandidateSummary[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // 탭으로 고른 후보 (확정 전)
  const [saving, setSaving] = useState(false);
  const [readingIndex, setReadingIndex] = useState<number | null>(null); // 지금 TTS로 읽는 후보 (카드 강조)
  const savingRef = useRef(false);
  const requestIdRef = useRef(0);
  const onAuthExpiredRef = useRef(onAuthExpired); // load의 의존성이 바뀌어 재조회되지 않도록 ref로 보관
  onAuthExpiredRef.current = onAuthExpired;
  const listenRef = useRef<() => void>(() => {}); // 낭독이 끝까지 재생된 뒤 음성 청취를 시작하는 함수 (아래에서 갱신)

  const load = useCallback(async () => {
    const reqId = ++requestIdRef.current;
    setStatus('loading');
    setSelectedIndex(null);
    speakWithPriority(SPEECH.loading, true);
    try {
      const result = await fetchRouteCandidates(origin, destination);
      if (reqId !== requestIdRef.current) return; // 언마운트/새 요청이면 무시 / ignore if unmounted or superseded
      if (result.length === 0) {
        setStatus('empty');
        speakWithPriority(SPEECH.empty, true);
        return;
      }
      const s = summarizeCandidates(result);
      setCandidates(result);
      setSummaries(s);
      setStatus('ready');
      // 대중교통 후보가 하나도 없으면 도보 후보(walkOption)만 남은 상태 — 안내 후 목록 낭독
      const walkOnly = result.every((c) => c.walkRoute);
      const offset = walkOnly ? 1 : 0; // walkOnly 안내 한 문장이 앞에 붙는다
      speakSequence(
        walkOnly ? [SPEECH.walkOnly, ...buildAnnouncement(s)] : buildAnnouncement(s),
        () => { setReadingIndex(null); listenRef.current(); },
        (i) => setReadingIndex(i - offset >= 0 && i - offset < s.length ? i - offset : null),
      );
    } catch (e) {
      if (reqId !== requestIdRef.current) return;
      if (e instanceof AuthExpiredError) onAuthExpiredRef.current?.();
      setStatus('error');
      speakWithPriority(SPEECH.error, true);
    }
  }, [origin, destination]);

  useEffect(() => {
    load();
    // 이탈 시 낭독 중단 + 응답 무시 / stop TTS and ignore pending response on unmount
    return () => {
      requestIdRef.current++;
      stopSpeaking();
    };
  }, [load]);

  // 카드 탭: 선택 상태만 바꾸고 해당 후보를 순차 안내 (speakSequence가 재생 중이던 음성을 먼저 중단하므로 처음부터 다시 시작)
  const selectCandidate = useCallback((index: number) => {
    const candidate = candidates[index];
    const summary = summaries[index];
    if (!candidate || !summary || savingRef.current) return;
    setSelectedIndex(index);
    setReadingIndex(null);
    speakSequence(buildSelectionSpeech(candidate, summary));
  }, [candidates, summaries]);

  // "이 경로로 안내 시작": 재생 중단 후 저장하고 다음 화면으로 이동. 추후 STT도 이 함수 호출
  const confirmSelected = useCallback(async (indexArg?: number) => {
    // 음성은 방금 고른 번호를 직접 넘긴다 (state 반영 전). 버튼은 이벤트 객체가 오므로 숫자일 때만 사용
    const index = typeof indexArg === 'number' ? indexArg : selectedIndex;
    if (index == null || savingRef.current) return;
    const candidate = candidates[index];
    if (!candidate) return;
    savingRef.current = true;
    setSaving(true);
    speakWithPriority(`${index + 1}번 경로를 선택했어요. 경로 안내를 시작합니다.`, true); // 진행 중인 음성은 이 안내가 중단시킴
    Vibration.vibrate([0, 200, 80, 200]);
    try {
      if (candidate.walkRoute) {
        await onWalkSelected(candidate.walkRoute); // 도보 후보: 대중교통 세션을 만들지 않고 기존 보행 흐름으로
      } else {
        const session = await saveTransitRoute(candidate, origin, destination);
        onSelected(session);
      }
    } catch (e) {
      if (e instanceof AuthExpiredError) onAuthExpired?.();
      speakWithPriority(SPEECH.saveFail, true);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [candidates, selectedIndex, origin, destination, onSelected, onWalkSelected, onAuthExpired]);

  const replay = () => {
    if (savingRef.current || summaries.length === 0) return;
    speakSequence(
      buildAnnouncement(summaries),
      () => { setReadingIndex(null); listenRef.current(); },
      (i) => setReadingIndex(i < summaries.length ? i : null),
    );
  };

  // ───────── 음성 명령: 번호/대중교통/도보/다시 읽기 → 선택 → "안내를 시작할까요?" 재확인 → confirmSelected ─────────
  const voiceRef = useRef<VoiceCommandApi | null>(null);
  const proposeStart = async (index: number) => {
    const candidate = candidates[index];
    const summary = summaries[index];
    if (!candidate || !summary || savingRef.current) { announceText(VOICE.noSuchCandidate, false); return; }
    setSelectedIndex(index);
    setReadingIndex(null);
    const answer = await voiceRef.current?.confirm(VOICE.confirmStart(summary.index, `${summary.typeLabel}, 총 ${summary.totalDurationText}`));
    if (answer === 'YES') confirmSelected(index);
    else if (answer === 'NO') announceText(VOICE.confirmNo, false);
  };
  const voice = useVoiceCommand('transitCandidates', {
    SELECT: (cmd) => proposeStart(cmd.index),
    START: () => proposeStart(selectedIndex ?? 0),
    MODE: (cmd) => {
      const index = candidates.findIndex((c) => (cmd.mode === 'WALK' ? !!c.walkRoute : !c.walkRoute));
      if (index < 0) announceText(VOICE.noSuchMode(cmd.mode), false);
      else proposeStart(index);
    },
    REPEAT: () => replay(),
  });
  voiceRef.current = voice;
  listenRef.current = () => { if (voice.available) voice.start(VOICE.routePrompt); };

  const handleBack = () => {
    stopSpeaking();
    onBack();
  };

  const selected = selectedIndex != null ? candidates[selectedIndex] : undefined;
  const selectedSummary = selectedIndex != null ? summaries[selectedIndex] : undefined;

  return (
    <View style={styles.screen}>
    <ScrollView style={styles.flex1} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <ModeHeader title="대중교통 경로" icon="bus" onBack={handleBack} />

      <Card pad={16} style={styles.routeSummaryCard}>
        <Text style={[styles.routeSummaryText, { color: t.textDim }]} numberOfLines={1}>{origin.name}</Text>
        <Icon name="arrowR" size={18} color={t.textFaint} sw={2.2} />
        <Text style={[styles.routeSummaryText, { color: t.text, fontWeight: '800' }]} numberOfLines={1}>{destination.name}</Text>
      </Card>

      {status === 'loading' ? (
        <View style={styles.centerBox} accessible accessibilityLiveRegion="polite" accessibilityLabel={SPEECH.loading}>
          <ActivityIndicator size="large" color={t.primary} />
          <Text style={[styles.msgText, { color: t.text }]}>{SPEECH.loading}</Text>
        </View>
      ) : null}

      {status === 'error' ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.status.danger.fg }]} accessibilityLiveRegion="polite">경로를 불러오지 못했어요</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="다시 시도" onPress={load} style={[styles.bigButton, { backgroundColor: t.primary }]}>
            <Icon name="refresh" size={26} color={t.onPrimary} sw={2.4} />
            <Text style={[styles.bigButtonText, { color: t.onPrimary }]}>다시 시도</Text>
          </TouchableOpacity>
          {/* 대중교통 후보를 못 받았을 때의 폴백: 이전 화면(도보 경로 후보)으로 */}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="도보 경로 보기"
            accessibilityHint="대중교통 대신 도보 경로 후보 화면으로 돌아갑니다"
            onPress={handleBack}
            style={[styles.bigButton, { backgroundColor: t.surface, borderColor: t.primary, borderWidth: Math.max(t.borderW, 2) }]}
          >
            <Icon name="walk" size={26} color={t.primary} sw={2.4} />
            <Text style={[styles.bigButtonText, { color: t.primary }]}>도보 경로 보기</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {status === 'empty' ? (
        <View style={styles.centerBox}>
          <Text style={[styles.msgText, { color: t.text }]} accessibilityLiveRegion="polite">이용할 수 있는 경로가 없어요</Text>
        </View>
      ) : null}

      {status === 'ready' ? (
        selected && selectedSummary ? (
          <>
            {/* 대중교통이 포함된 경로를 골랐을 때만 3단계 스텝(1단계 경로 탐색) 표시 — 도보 전용은 기존 흐름 */}
            {hasTransitLeg(selected.legs) ? <StageStepper stage={1} /> : null}
            <CandidateCard summary={selectedSummary} selected reading={false} disabled={saving} onPress={() => selectCandidate(selectedIndex as number)} />
            <Card pad={18} tone={t.primary} style={{ ...styles.confirmCard, borderWidth: Math.max(t.borderW, 3) }}>
              <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.confirmText, { color: t.text }]}>
                {VOICE.confirmStart(selectedSummary.index, `${selectedSummary.typeLabel}, 총 ${selectedSummary.totalDurationText}`)}
              </Text>
            </Card>
            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={t.primary} />
                <Text style={[styles.sub, { color: t.textDim }]}>경로를 저장하는 중…</Text>
              </View>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="이 경로로 안내 시작"
              accessibilityHint="선택한 경로를 저장하고 안내를 시작합니다"
              accessibilityState={{ disabled: saving }}
              disabled={saving}
              onPress={() => { voice.cancel(); confirmSelected(); }}
              style={[styles.bigButton, { backgroundColor: t.primary }]}
            >
              <Icon name="arrowR" size={28} color={t.onPrimary} sw={2.6} />
              <Text style={[styles.bigButtonText, { color: t.onPrimary }]}>안내 시작</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="다른 노선"
              accessibilityHint="경로 목록으로 돌아가 다른 경로를 고릅니다"
              disabled={saving}
              onPress={() => { voice.cancel(); stopSpeaking(); setSelectedIndex(null); }}
              style={[styles.bigButton, { backgroundColor: t.surface, borderColor: t.primary, borderWidth: Math.max(t.borderW, 2) }]}
            >
              <Icon name="refresh" size={28} color={t.primary} sw={2.2} />
              <Text style={[styles.bigButtonText, { color: t.primary }]}>다른 노선</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {candidates.every((c) => c.walkRoute) ? (
              <Text style={[styles.msgText, { color: t.text }]} accessibilityLiveRegion="polite">{SPEECH.walkOnly}</Text>
            ) : null}
            <View style={styles.list}>
              {summaries.map((s, i) => (
                <CandidateCard key={s.index} summary={s} selected={false} reading={i === readingIndex} disabled={saving} onPress={() => selectCandidate(i)} />
              ))}
            </View>
            {saving ? (
              <View style={styles.savingRow}>
                <ActivityIndicator color={t.primary} />
                <Text style={[styles.sub, { color: t.textDim }]}>경로를 저장하는 중…</Text>
              </View>
            ) : null}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="다시 듣기"
              accessibilityHint="경로 목록을 처음부터 다시 읽어줍니다"
              onPress={replay}
              disabled={saving}
              style={[styles.bigButton, { backgroundColor: t.surface, borderColor: t.primary, borderWidth: Math.max(t.borderW, 2) }]}
            >
              <Icon name="speaker" size={28} color={t.primary} sw={2.2} />
              <Text style={[styles.bigButtonText, { color: t.primary }]}>다시 듣기</Text>
            </TouchableOpacity>
          </>
        )
      ) : null}
    </ScrollView>
    {/* 하단 고정 바: 목록을 고르는 중일 때만 (선택 확인 상태는 안내 시작/다른 노선 버튼이 핵심 행동). 음성 인식을 쓸 수 없으면(Expo Go) 숨김 */}
    {status === 'ready' && !selected ? (
      <VoiceBottomBar
        available={voice.available}
        listening={voice.listening}
        permissionDenied={voice.permissionDenied}
        prompt={VOICE.routePrompt}
        label="음성으로 경로 선택"
        onToggle={() => { if (voice.listening) voice.stop(); else voice.start(VOICE.routePrompt); }}
        onOpenSettings={voice.openSettings}
      />
    ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex1: { flex: 1 },
  container: { padding: 18, paddingTop: 4, gap: 14, paddingBottom: 24 },
  routeSummaryCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeSummaryText: { flex: 1, fontSize: 16, fontWeight: '700' },
  centerBox: { paddingTop: 40, alignItems: 'center', gap: 20 },
  msgText: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  list: { gap: 14 },
  cardTouch: { minHeight: 96 },
  card: { gap: 6, minHeight: 96, justifyContent: 'center' },
  cardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 14 },
  numberBox: { width: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  numberBoxText: { fontSize: 40, fontWeight: '900' },
  cardBody: { flex: 1, gap: 6, justifyContent: 'center' },
  durationInline: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  confirmCard: { gap: 8 },
  confirmText: { fontSize: 28, fontWeight: '900', letterSpacing: -0.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  numberCircle: { width: 36, height: 36, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  numberText: { fontSize: 20, fontWeight: '900' },
  typeLabel: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 2 },
  selectedText: { fontSize: 18, fontWeight: '900' },
  badgeText: { fontSize: 16, fontWeight: '900' },
  duration: { fontSize: 26, fontWeight: '900', letterSpacing: -0.5 },
  sub: { fontSize: 18, fontWeight: '700' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  bigButton: { minHeight: 72, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  bigButtonText: { fontSize: 24, fontWeight: '900' },
});
