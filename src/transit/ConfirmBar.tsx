// transit/ConfirmBar.tsx — 화면 하단 고정 확인 버튼(탑승/하차). App에서 ScrollView 바깥에 렌더한다
// Bottom-fixed confirm button (board/alight). Rendered by App outside the ScrollView
import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { CONFIRM_BUTTON, CONFIRM_HINT } from './guidanceMessages';
import { ConfirmKind, UiState, getVisibleConfirmButton } from './uiState';

const CONFIG: Record<ConfirmKind, { label: string; hint: string; icon: 'bus' | 'pin' }> = {
  BOARD: { label: CONFIRM_BUTTON.boarding, hint: CONFIRM_HINT.boarding, icon: 'bus' },
  ALIGHT: { label: CONFIRM_BUTTON.alighting, hint: CONFIRM_HINT.alighting, icon: 'pin' },
};

function ConfirmButton({ kind, busy, onPress }: { kind: ConfirmKind; busy: boolean; onPress: () => void }) {
  const t = useTheme();
  const c = CONFIG[kind];
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={c.label}
      accessibilityHint={c.hint}
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.button, { backgroundColor: t.primary, borderColor: t.text, borderWidth: t.id === 'contrast' ? 3 : 0, opacity: busy ? 0.6 : 1 }]}
    >
      {busy ? <ActivityIndicator color={t.onPrimary} /> : <Icon name={c.icon} size={32} color={t.onPrimary} sw={2.6} />}
      <Text style={[styles.text, { color: t.onPrimary }]}>{c.label}</Text>
    </TouchableOpacity>
  );
}

export function TransitConfirmBar({ uiState, busy, onBoard, onAlight }: {
  uiState: UiState | null;
  busy: boolean;
  onBoard: () => void;
  onAlight: () => void;
}) {
  const t = useTheme();
  const kind = getVisibleConfirmButton(uiState);
  if (!kind) return null; // 숨김이 아니라 언마운트 / unmounted, not hidden
  return (
    <View style={[styles.bar, { backgroundColor: t.surface, borderTopColor: t.border, borderTopWidth: Math.max(t.borderW, 1) }]}>
      {/* 탑승 버튼은 WAITING_AT_STOP → BOARDING_CONFIRM에서도 같은 key라 리마운트되지 않아 스크린리더 포커스가 유지된다 */}
      {/* Same key across WAITING_AT_STOP → BOARDING_CONFIRM: no remount, screen-reader focus is kept */}
      <ConfirmButton key={kind} kind={kind} busy={busy} onPress={kind === 'BOARD' ? onBoard : onAlight} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12 },
  button: { minHeight: 88, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 24 },
  text: { fontSize: 30, fontWeight: '900' },
});
