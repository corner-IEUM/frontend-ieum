// screens/Settings.tsx — 맞춤설정 (보행 속도)
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTheme } from '../theme-context';
import { ModeHeader, Card } from '../ui';

export function SettingsScreen({ onBack }: { onBack?: () => void }) {
  const t = useTheme();
  const [speed, setSpeed] = useState(1);
  const speedLabel = ['느림', '보통', '빠름'][speed];

  return (
    <View style={{ padding: 18, paddingTop: 4, gap: 18 }}>
      <ModeHeader title="맞춤 설정" icon="tune" onBack={onBack} />

      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>보행 속도</Text>
          <Text style={{ fontSize: 15, fontWeight: '800', color: t.primary }}>{speedLabel}</Text>
        </View>
        <Text style={{ fontSize: 13.5, color: t.textDim, fontWeight: '600' }}>걷는 속도에 맞춰 안내 타이밍을 조절합니다</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[0, 1, 2].map((v) => (
            <TouchableOpacity key={v} onPress={() => setSpeed(v)} style={{ flex: 1, height: 46, borderRadius: t.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: v === speed ? t.primary : t.surface2, borderWidth: t.borderW, borderColor: v === speed ? t.primary : t.border }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: v === speed ? t.onPrimary : t.textDim }}>{['느림', '보통', '빠름'][v]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>
    </View>
  );
}
