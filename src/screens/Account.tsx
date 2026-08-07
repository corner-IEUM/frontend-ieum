// screens/Account.tsx — 계정 (로그인 / 회원가입 / 프로필)
import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card, Segmented, Field } from '../ui';

export function AccountScreen({ onBack }: { onBack?: () => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  const [authed, setAuthed] = useState(false);
  const [mode, setMode] = useState('login');

  if (authed) {
    return (
      <View style={{ padding: 18, paddingTop: 4, gap: 18 }}>
        <ModeHeader title="계정" icon="person" onBack={onBack} />
        <Card style={{ alignItems: 'center', gap: 14, padding: 28 }}>
          <View style={{ width: 76, height: 76, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: isC ? t.surface : withAlpha(t.primary, 0.16), borderWidth: 2.5, borderColor: t.primary }}>
            <Icon name="person" size={40} color={t.primary} sw={2} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 21, fontWeight: '900', color: t.text, letterSpacing: -0.4 }}>지민</Text>
            <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.textDim, marginTop: 2 }}>jimin@example.com</Text>
          </View>
        </Card>
        <Card style={{ gap: 0 }}>
          {[{ ic: 'person' as const, l: '프로필 수정' }, { ic: 'tune' as const, l: '알림 설정' }].map((row, k) => (
            <View key={row.l} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: k === 0 ? 1 : 0, borderBottomColor: t.border }}>
              <Icon name={row.ic} size={20} color={t.textDim} sw={2} />
              <Text style={{ flex: 1, fontSize: 16, fontWeight: '700', color: t.text }}>{row.l}</Text>
              <Icon name="chevron" size={18} color={t.textFaint} sw={2.4} />
            </View>
          ))}
        </Card>
        <TouchableOpacity onPress={() => setAuthed(false)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 54, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
          <Icon name="logout" size={20} color={t.status.danger.fg} sw={2.1} />
          <Text style={{ fontWeight: '800', fontSize: 16, color: t.status.danger.fg }}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ padding: 18, paddingTop: 4, gap: 18 }}>
      <ModeHeader title="계정" icon="person" onBack={onBack} />
      <Segmented value={mode} onChange={setMode} options={[{ v: 'login', l: '로그인' }, { v: 'signup', l: '회원가입' }]} />

      <Card style={{ gap: 16 }}>
        {mode === 'signup' ? <Field label="이름" icon="person" placeholder="이름을 입력하세요" /> : null}
        <Field label="이메일" icon="mail" keyboardType="email-address" placeholder="you@example.com" />
        <Field label="비밀번호" icon="lock" secure placeholder="비밀번호를 입력하세요" />
        <TouchableOpacity onPress={() => setAuthed(true)} style={{ height: 54, borderRadius: t.radiusSm, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary, marginTop: 4 }}>
          <Text style={{ fontWeight: '800', fontSize: 17, color: t.onPrimary }}>{mode === 'signup' ? '회원가입' : '로그인'}</Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}
