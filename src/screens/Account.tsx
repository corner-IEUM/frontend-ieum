// screens/Account.tsx — 계정 (로그인 / 회원가입 / 프로필)
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader, Card, Segmented, Field } from '../ui';
import { login, signup, clearToken, getToken, getMyInfo } from '../api'; // 로그인/회원가입/토큰삭제/토큰조회/내정보조회 함수 가져오기

export function AccountScreen({ onBack }: { onBack?: () => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  const [authed, setAuthed] = useState(false); // 로그인 상태 여부
  const [mode, setMode] = useState('login'); // 'login' 또는 'signup'
  // 저장된 토큰 확인 중 여부 — 확인이 끝나기 전에는 로그인 화면이 보이면 안 됨
  const [checkingAuth, setCheckingAuth] = useState(true);

  // 앱(화면) 시작 시 저장된 토큰이 있는지 확인해서 로그인 상태를 복원
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          // 토큰이 있으면 내 정보를 조회해서 nickname/email까지 채운 뒤 로그인 상태로 진입
          const me = await getMyInfo();
          setNickname(me.nickname);
          setEmail(me.email);
          setAuthed(true);
        } catch (e) {
          // 토큰 만료 등으로 조회 실패 시 로그인 안 된 상태로 되돌림
          setAuthed(false);
        }
      }
      setCheckingAuth(false); // 확인 완료
    })();
  }, []);

  // 입력 필드 값 저장용 state
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // API 요청 중인지 여부 (버튼 스피너 표시용)
  const [loading, setLoading] = useState(false);
  // 로그인/회원가입 실패 시 보여줄 에러 메시지
  const [error, setError] = useState('');

  // 로그인/회원가입 버튼 눌렀을 때 실행되는 함수
  const handleSubmit = async () => {
    setError('');      // 이전 에러 메시지 초기화
    setLoading(true);  // 요청 시작 → 스피너 표시
    try {
      if (mode === 'signup') {
        // 회원가입 모드면: 회원가입 먼저 하고, 곧바로 로그인까지 진행
        await signup(nickname, email, password);
        await login(email, password);
      } else {
        // 로그인 모드면: 로그인만 진행
        await login(email, password);
      }
      setAuthed(true); // 성공하면 로그인 완료 화면으로 전환
    } catch (e: any) {
      // 실패하면 에러 메시지 화면에 표시
      setError(e.message || '오류가 발생했습니다');
    } finally {
      setLoading(false); // 성공/실패 상관없이 로딩 종료
    }
  };

  // 로그아웃 버튼 눌렀을 때 실행되는 함수
  const handleLogout = async () => {
    await clearToken(); // 저장된 토큰 삭제
    setAuthed(false);   // 로그인 전 화면으로 전환
    // 입력했던 값들도 초기화
    setEmail('');
    setPassword('');
    setNickname('');
  };

  // ── 토큰 확인 중일 때는 로그인 화면이 깜빡 보이지 않도록 아무것도 렌더링하지 않음 ──
  if (checkingAuth) {
    return null;
  }

  // ── 로그인된 상태일 때 보여주는 화면 (프로필 화면) ──
  if (authed) {
    return (
      <View style={styles.container}>
        <ModeHeader title="계정" icon="person" onBack={onBack} />
        <Card style={styles.profileCard}>
          <View style={[styles.avatar, { backgroundColor: isC ? t.surface : withAlpha(t.primary, 0.16), borderColor: t.primary }]}>
            <Icon name="person" size={40} color={t.primary} sw={2} />
          </View>
          <View style={styles.nameBlock}>
            {/* 하드코딩된 이름/이메일 대신, 실제로 로그인한 값 표시 */}
            <Text style={[styles.nameText, { color: t.text }]}>{nickname || email}</Text>
            <Text style={[styles.emailText, { color: t.textDim }]}>{email}</Text>
          </View>
        </Card>
        <Card style={styles.menuCard}>
          {[{ ic: 'person' as const, l: '프로필 수정' }, { ic: 'tune' as const, l: '알림 설정' }].map((row, k) => (
            <View key={row.l} style={[styles.menuRow, { borderBottomWidth: k === 0 ? 1 : 0, borderBottomColor: t.border }]}>
              <Icon name={row.ic} size={20} color={t.textDim} sw={2} />
              <Text style={[styles.menuLabel, { color: t.text }]}>{row.l}</Text>
              <Icon name="chevron" size={18} color={t.textFaint} sw={2.4} />
            </View>
          ))}
        </Card>
        {/* 로그아웃 버튼: 이제 handleLogout 함수로 실제 토큰 삭제까지 실행 */}
        <TouchableOpacity onPress={handleLogout} style={[styles.logoutButton, { borderRadius: t.radius, backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }]}>
          <Icon name="logout" size={20} color={t.status.danger.fg} sw={2.1} />
          <Text style={[styles.logoutText, { color: t.status.danger.fg }]}>로그아웃</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── 로그인 안 된 상태일 때 보여주는 화면 (로그인/회원가입 폼) ──
  return (
    <View style={styles.container}>
      <ModeHeader title="계정" icon="person" onBack={onBack} />
      <Segmented value={mode} onChange={setMode} options={[{ v: 'login', l: '로그인' }, { v: 'signup', l: '회원가입' }]} />

      <Card style={styles.formCard}>
        {/* 회원가입 모드일 때만 이름 입력창 표시 */}
        {mode === 'signup' ? (
          <Field
            label="이름"
            icon="person"
            placeholder="이름을 입력하세요"
            value={nickname}
            onChangeText={setNickname} // 입력할 때마다 nickname state 업데이트
          />
        ) : null}

        <Field
          label="이메일"
          icon="mail"
          keyboardType="email-address"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail} // 입력할 때마다 email state 업데이트
          autoCapitalize="none" // 이메일 자동 대문자 변환 방지
        />

        <Field
          label="비밀번호"
          icon="lock"
          secure
          placeholder="비밀번호를 입력하세요"
          value={password}
          onChangeText={setPassword} // 입력할 때마다 password state 업데이트
        />

        {/* 에러가 있을 때만 에러 메시지 표시 */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* 제출 버튼: handleSubmit 실행, 로딩 중엔 비활성화 + 스피너 표시 */}
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={loading}
          style={[styles.submitButton, { borderRadius: t.radiusSm, backgroundColor: t.primary, opacity: loading ? 0.6 : 1 }]}
        >
          {loading ? (
            <ActivityIndicator color={t.onPrimary} />
          ) : (
            <Text style={[styles.submitText, { color: t.onPrimary }]}>{mode === 'signup' ? '회원가입' : '로그인'}</Text>
          )}
        </TouchableOpacity>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 18 },
  profileCard: { alignItems: 'center', gap: 14, padding: 28 },
  avatar: { width: 76, height: 76, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  nameBlock: { alignItems: 'center' },
  nameText: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4 },
  emailText: { fontSize: 14.5, fontWeight: '600', marginTop: 2 },
  menuCard: { gap: 0 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  menuLabel: { flex: 1, fontSize: 16, fontWeight: '700' },
  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 54 },
  logoutText: { fontWeight: '800', fontSize: 16 },
  formCard: { gap: 16 },
  submitButton: { height: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  submitText: { fontWeight: '800', fontSize: 17 },
  errorText: { color: '#e5484d', fontSize: 13.5, fontWeight: '600' }, // 에러 메시지 스타일
});