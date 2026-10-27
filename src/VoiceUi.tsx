// VoiceUi.tsx — 음성 입력 마이크 버튼 + 권한 거부 시 설정 이동 버튼. 음성 인식을 쓸 수 없으면(Expo Go) 아무것도 그리지 않는다
// Mic button + "open settings" button on permission denial; renders nothing when STT is unavailable (Expo Go)
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Icon } from './Icon';
import { useTheme } from './theme-context';
import { withAlpha } from './theme';
import { ctrlStyle, Waveform } from './ui';

export function VoiceControls({ available, listening, permissionDenied, label, onToggle, onOpenSettings }: {
  available: boolean;
  listening: boolean;
  permissionDenied: boolean;
  label: string;                // 접근성 라벨 (예: "음성으로 목적지 검색") / a11y label
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const t = useTheme();
  if (!available) return null;
  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={listening ? '누르면 음성 인식을 멈춥니다' : '누르면 안내 후 음성 인식을 시작합니다'}
        accessibilityState={{ busy: listening }}
        onPress={onToggle}
        style={[ctrlStyle(t), styles.micButton, { borderColor: t.primary, backgroundColor: listening ? withAlpha(t.primary, 0.16) : t.surface, borderWidth: Math.max(t.borderW, 2) }]}
      >
        <Icon name="mic" size={24} color={t.primary} sw={2.2} />
        <Text style={[styles.micText, { color: t.primary }]}>{listening ? '듣는 중… 누르면 멈춤' : '음성 입력'}</Text>
        {listening ? <Waveform active color={t.primary} /> : null}
      </TouchableOpacity>
      {permissionDenied ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="설정 열기"
          accessibilityHint="마이크와 음성 인식 권한을 허용할 수 있는 설정 앱을 엽니다"
          onPress={onOpenSettings}
          style={[ctrlStyle(t), styles.micButton, { borderColor: t.status.caution.fg, borderWidth: Math.max(t.borderW, 2) }]}
        >
          <Icon name="tune" size={22} color={t.status.caution.fg} sw={2.2} />
          <Text style={[styles.micText, { color: t.status.caution.fg }]}>설정 열기 (마이크 권한)</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// 하단 고정 바: 안내 문구(TTS와 같은 문장) + 마이크 인디케이터(듣는 중이면 파형). 누르면 청취 시작/중지. 음성 인식을 쓸 수 없으면 아무것도 그리지 않는다
export function VoiceBottomBar({ available, listening, permissionDenied, prompt, label, onToggle, onOpenSettings }: {
  available: boolean;
  listening: boolean;
  permissionDenied: boolean;
  prompt: string;
  label: string;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const t = useTheme();
  if (!available) return null;
  return (
    <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border, borderTopWidth: Math.max(t.borderW, 1) }]}>
      {permissionDenied ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="설정 열기"
          accessibilityHint="마이크와 음성 인식 권한을 허용할 수 있는 설정 앱을 엽니다"
          onPress={onOpenSettings}
          style={[ctrlStyle(t), styles.micButton, { borderColor: t.status.caution.fg, borderWidth: Math.max(t.borderW, 2) }]}
        >
          <Icon name="tune" size={22} color={t.status.caution.fg} sw={2.2} />
          <Text style={[styles.micText, { color: t.status.caution.fg }]}>설정 열기 (마이크 권한)</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={listening ? '누르면 음성 인식을 멈춥니다' : '누르면 안내 후 음성 인식을 시작합니다'}
        accessibilityState={{ busy: listening }}
        onPress={onToggle}
        style={[styles.barButton, { borderColor: t.primary, backgroundColor: listening ? withAlpha(t.primary, 0.14) : t.surface, borderWidth: Math.max(t.borderW, 2.5), borderRadius: t.radiusSm }]}
      >
        <View style={[styles.micCircle, { backgroundColor: t.primary }]}>
          <Icon name="mic" size={28} color={t.onPrimary} sw={2.3} />
        </View>
        <Text style={[styles.barText, { color: t.text }]}>{listening ? '듣는 중…' : prompt}</Text>
        <Waveform active={listening} color={t.primary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, gap: 10 },
  barButton: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  micCircle: { width: 52, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  barText: { flex: 1, fontSize: 20, fontWeight: '800' },
  wrap: { gap: 10 },
  micButton: { minHeight: 64, gap: 10 },
  micText: { fontWeight: '800', fontSize: 20 },
});
