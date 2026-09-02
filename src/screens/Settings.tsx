// screens/Settings.tsx — 맞춤설정 (보행 속도)
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme-context';
import { ModeHeader, Card } from '../ui';

export function SettingsScreen({ onBack }: { onBack?: () => void }) {
  const t = useTheme();
  const [speed, setSpeed] = useState(1);
  const speedLabel = ['느림', '보통', '빠름'][speed];

  return (
    <View style={styles.container}>
      <ModeHeader title="맞춤 설정" icon="tune" onBack={onBack} />

      <Card style={styles.card}>
        <View style={styles.row}>
          <Text style={[styles.title, { color: t.text }]}>보행 속도</Text>
          <Text style={[styles.value, { color: t.primary }]}>{speedLabel}</Text>
        </View>
        <Text style={[styles.desc, { color: t.textDim }]}>걷는 속도에 맞춰 안내 타이밍을 조절합니다</Text>
        <View style={styles.speedRow}>
          {[0, 1, 2].map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setSpeed(v)}
              style={[
                styles.speedButton,
                {
                  borderRadius: t.radiusSm,
                  backgroundColor: v === speed ? t.primary : t.surface2,
                  borderWidth: t.borderW,
                  borderColor: v === speed ? t.primary : t.border,
                },
              ]}
            >
              <Text style={[styles.speedButtonText, { color: v === speed ? t.onPrimary : t.textDim }]}>{['느림', '보통', '빠름'][v]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 18 },
  card: { gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '800' },
  value: { fontSize: 15, fontWeight: '800' },
  desc: { fontSize: 13.5, fontWeight: '600' },
  speedRow: { flexDirection: 'row', gap: 8 },
  speedButton: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  speedButtonText: { fontSize: 15, fontWeight: '800' },
});
