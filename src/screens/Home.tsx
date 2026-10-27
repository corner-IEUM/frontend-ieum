// screens/Home.tsx
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeButton, SectionTitle, shadow } from '../ui';
import { useVoiceCommand } from '../hooks/useVoiceCommand';
import { VoiceControls } from '../VoiceUi';
import { announceText } from '../transit/feedback';
import { VOICE } from '../transit/voiceMessages';

export function Wordmark({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={styles.wordmarkRow}>
      <Svg width={size * 1.5} height={size} viewBox="0 0 36 24">
        <Line x1={8} y1={12} x2={28} y2={12} stroke={t.primary} strokeWidth={2.4} strokeLinecap="round" />
        <Circle cx={8} cy={12} r={5} fill="none" stroke={t.text} strokeWidth={2.4} />
        <Circle cx={28} cy={12} r={5} fill={t.primary} />
      </Svg>
      <Text style={[styles.wordmarkText, { fontSize: size * 0.92, color: t.text }]}>이음</Text>
    </View>
  );
}

function RecommendBanner({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <View style={[styles.bannerContainer, { borderRadius: t.radius, backgroundColor: isC ? t.surface : withAlpha(t.primary, 0.14), borderWidth: t.borderW, borderColor: t.primary }]}>
      <View style={[styles.bannerIconCircle, { borderRadius: isC ? 8 : 12, backgroundColor: isC ? 'transparent' : withAlpha(t.primary, 0.22), borderWidth: isC ? 2 : 0, borderColor: t.primary }]}>
        <Icon name="pin" size={26} color={t.primary} sw={2.1} />
      </View>
      <View style={styles.bannerTextWrap}>
        <Text style={[styles.bannerTitle, { color: t.text }]}>버스 정류장이 가까워요</Text>
        <Text style={[styles.bannerDesc, { color: t.textDim }]}>길찾기로 안내를 시작할까요?</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={[styles.dismissBtn, { borderColor: t.border }]}>
        <Icon name="x" size={18} color={t.textDim} sw={2.4} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onAccept} style={[styles.acceptBtn, { backgroundColor: t.primary }]}>
        <Text style={[styles.acceptText, { color: t.onPrimary }]}>전환</Text>
      </TouchableOpacity>
    </View>
  );
}

export function HomeScreen({ go, showRec, setShowRec }: { go: (s: string) => void; showRec: boolean; setShowRec: (b: boolean) => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  // 음성: "길찾기 시작/안내 시작/출발" → 길찾기 화면 (홈 허용 명령은 이것뿐)
  const voice = useVoiceCommand('home', {
    START: () => { announceText(VOICE.startingNavigate, false); go('navigate'); },
  });
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Wordmark size={26} />
        <View style={styles.headerIcons}>
          <TouchableOpacity onPress={() => go('account')} style={[styles.iconButton, { backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }]}>
            <Icon name="person" size={22} color={t.textDim} sw={2.1} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => go('settings')} style={[styles.iconButton, { backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }]}>
            <Icon name="tune" size={24} color={t.textDim} sw={2.1} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.locationRow}>
        <Icon name="pin" size={18} color={t.primary} sw={2.1} />
        <Text style={[styles.locationText, { color: t.text }]}>성수동 2가</Text>
        <View style={[styles.dot, { backgroundColor: t.textFaint }]} />
        <Text style={[styles.gpsText, { color: t.textDim }]}>GPS 연결됨</Text>
      </View>

      <VoiceControls
        available={voice.available}
        listening={voice.listening}
        permissionDenied={voice.permissionDenied}
        label="음성으로 길찾기 시작"
        onToggle={() => { if (voice.listening) voice.stop(); else voice.start(VOICE.homePrompt); }}
        onOpenSettings={voice.openSettings}
      />

      {showRec ? <RecommendBanner onAccept={() => { setShowRec(false); go('navigate'); }} onDismiss={() => setShowRec(false)} /> : null}

      <TouchableOpacity activeOpacity={0.9} onPress={() => go('walk')} style={[styles.ctaButton, { borderRadius: t.radius, ...(!isC ? shadow(withAlpha(t.primary, 0.4), 28, 0.32, 6) : {}), borderWidth: isC ? 3 : 0, borderColor: t.primary }]}>
        <LinearGradient colors={isC ? [t.primary, t.primary] : ['#7ea3ff', t.primary, t.primaryDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaGradient}>
          <View style={styles.ctaIconCircle}>
            <Icon name="walk" size={36} color={t.onPrimary} sw={2.2} />
          </View>
          <View style={styles.ctaTextWrap}>
            <Text style={[styles.ctaLabel, { color: t.onPrimary }]}>바로 시작</Text>
            <Text style={[styles.ctaTitle, { color: t.onPrimary }]}>보행 안내 시작</Text>
          </View>
          <Icon name="arrowR" size={26} color={t.onPrimary} sw={2.4} />
        </LinearGradient>
      </TouchableOpacity>

      <SectionTitle>모드</SectionTitle>
      <View style={styles.modesWrap}>
        <ModeButton icon="walk" title="일반보행" desc="동적 장애물 · 신호등 · 거리 경고" onPress={() => go('walk')} />
        <ModeButton icon="pin" title="길찾기" desc="경로 안내 · 주변 설명 · 대중교통 탑승까지" onPress={() => go('navigate')} />
        <ModeButton icon="clock" title="이동경로 저장" desc="지난 보행 기록 · 이동거리 · 소요시간 확인" onPress={() => go('walkLogHistory')} />
        <ModeButton icon="clock" title="길찾기 기록" desc="지난 길찾기 경로 · 이동거리 · 소요시간 확인" onPress={() => go('navigationHistory')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmarkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wordmarkText: { fontWeight: '900', letterSpacing: -1 },
  bannerContainer: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  bannerIconCircle: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bannerTextWrap: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '800' },
  bannerDesc: { fontSize: 13.5, fontWeight: '600', marginTop: 1 },
  dismissBtn: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  acceptBtn: { height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  acceptText: { fontWeight: '800', fontSize: 15 },
  container: { padding: 18, paddingTop: 8, gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  headerIcons: { flexDirection: 'row', gap: 8 },
  iconButton: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2 },
  locationText: { fontWeight: '700', fontSize: 14.5 },
  dot: { width: 4, height: 4, borderRadius: 999 },
  gpsText: { fontWeight: '600', fontSize: 14.5 },
  ctaButton: { marginTop: 2, overflow: 'hidden' },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 22 },
  ctaIconCircle: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' },
  ctaTextWrap: { flex: 1 },
  ctaLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 1, opacity: 0.7 },
  ctaTitle: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6, marginTop: 2 },
  modesWrap: { gap: 10 },
});
