// screens/Home.tsx
import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeButton, SectionTitle, shadow } from '../ui';

export function Wordmark({ size = 26 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Svg width={size * 1.5} height={size} viewBox="0 0 36 24">
        <Line x1={8} y1={12} x2={28} y2={12} stroke={t.primary} strokeWidth={2.4} strokeLinecap="round" />
        <Circle cx={8} cy={12} r={5} fill="none" stroke={t.text} strokeWidth={2.4} />
        <Circle cx={28} cy={12} r={5} fill={t.primary} />
      </Svg>
      <Text style={{ fontSize: size * 0.92, fontWeight: '900', letterSpacing: -1, color: t.text }}>이음</Text>
    </View>
  );
}

function RecommendBanner({ onAccept, onDismiss }: { onAccept: () => void; onDismiss: () => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: t.radius, backgroundColor: isC ? t.surface : withAlpha(t.primary, 0.14), borderWidth: t.borderW, borderColor: t.primary }}>
      <View style={{ width: 44, height: 44, borderRadius: isC ? 8 : 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isC ? 'transparent' : withAlpha(t.primary, 0.22), borderWidth: isC ? 2 : 0, borderColor: t.primary }}>
        <Icon name="pin" size={26} color={t.primary} sw={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: t.text }}>버스 정류장이 가까워요</Text>
        <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.textDim, marginTop: 1 }}>길찾기로 안내를 시작할까요?</Text>
      </View>
      <TouchableOpacity onPress={onDismiss} style={{ width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: t.border }}>
        <Icon name="x" size={18} color={t.textDim} sw={2.4} />
      </TouchableOpacity>
      <TouchableOpacity onPress={onAccept} style={{ height: 40, paddingHorizontal: 18, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}>
        <Text style={{ fontWeight: '800', fontSize: 15, color: t.onPrimary }}>전환</Text>
      </TouchableOpacity>
    </View>
  );
}

export function HomeScreen({ go, showRec, setShowRec }: { go: (s: string) => void; showRec: boolean; setShowRec: (b: boolean) => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <View style={{ padding: 18, paddingTop: 8, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <Wordmark size={26} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity onPress={() => go('account')} style={{ width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
            <Icon name="person" size={22} color={t.textDim} sw={2.1} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => go('settings')} style={{ width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
            <Icon name="tune" size={24} color={t.textDim} sw={2.1} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 2 }}>
        <Icon name="pin" size={18} color={t.primary} sw={2.1} />
        <Text style={{ color: t.text, fontWeight: '700', fontSize: 14.5 }}>성수동 2가</Text>
        <View style={{ width: 4, height: 4, borderRadius: 999, backgroundColor: t.textFaint }} />
        <Text style={{ color: t.textDim, fontWeight: '600', fontSize: 14.5 }}>GPS 연결됨</Text>
      </View>

      {showRec ? <RecommendBanner onAccept={() => { setShowRec(false); go('navigate'); }} onDismiss={() => setShowRec(false)} /> : null}

      {/* primary CTA */}
      <TouchableOpacity activeOpacity={0.9} onPress={() => go('walk')} style={{ borderRadius: t.radius, marginTop: 2, overflow: 'hidden', ...(!isC ? shadow(withAlpha(t.primary, 0.4), 28, 0.32, 6) : {}), borderWidth: isC ? 3 : 0, borderColor: t.primary }}>
        <LinearGradient colors={isC ? [t.primary, t.primary] : ['#7ea3ff', t.primary, t.primaryDim]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flexDirection: 'row', alignItems: 'center', gap: 16, padding: 22 }}>
          <View style={{ width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.16)' }}>
            <Icon name="walk" size={36} color={t.onPrimary} sw={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 1, color: t.onPrimary, opacity: 0.7 }}>바로 시작</Text>
            <Text style={{ fontSize: 26, fontWeight: '900', letterSpacing: -0.6, color: t.onPrimary, marginTop: 2 }}>보행 안내 시작</Text>
          </View>
          <Icon name="arrowR" size={26} color={t.onPrimary} sw={2.4} />
        </LinearGradient>
      </TouchableOpacity>

      <SectionTitle>모드</SectionTitle>
      <View style={{ gap: 10 }}>
        <ModeButton icon="walk" title="일반보행" desc="동적 장애물 · 신호등 · 거리 경고" onPress={() => go('walk')} />
        <ModeButton icon="pin" title="길찾기" desc="경로 안내 · 주변 설명 · 대중교통 탑승까지" onPress={() => go('navigate')} />
      </View>
    </View>
  );
}
