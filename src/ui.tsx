// ui.tsx — shared visual components (RN) — light/white edition
import React, { useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, Animated, ViewStyle } from 'react-native';
import { Icon, IconName } from './Icon';
import { useTheme } from './theme-context';
import { Level, withAlpha, STATUS_LABEL, Theme } from './theme';

// ───────── shadow helper (soft, cool-toned — for white surfaces) ─────────
export function shadow(color = 'rgba(22,42,82,0.16)', radius = 14, opacity = 0.18, elev = 4): ViewStyle {
  return { shadowColor: color, shadowOffset: { width: 0, height: 6 }, shadowRadius: radius, shadowOpacity: opacity, elevation: elev };
}

// ───────── animated waveform bar ─────────
function WaveBar({ active, color, delay }: { active: boolean; color: string; delay: number }) {
  const v = useRef(new Animated.Value(0.25)).current;
  useEffect(() => {
    if (!active) { v.setValue(0.25); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 420, delay, useNativeDriver: false }),
      Animated.timing(v, { toValue: 0.25, duration: 420, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return <Animated.View style={{ width: 4, borderRadius: 3, backgroundColor: color, height: v.interpolate({ inputRange: [0, 1], outputRange: [6, 24] }) }} />;
}

export function Waveform({ active, color }: { active: boolean; color: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, height: 26 }}>
      {[0, 1, 2, 3, 4].map((i) => <WaveBar key={i} active={active} color={color} delay={i * 110} />)}
    </View>
  );
}

// ───────── blinking dot (LIVE) ─────────
export function Blink({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.25, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  return <Animated.View style={{ opacity: v }}>{children}</Animated.View>;
}

// ───────── status pill ─────────
export function StatusPill({ level, large }: { level: Level; large?: boolean }) {
  const t = useTheme();
  const sc = t.status[level];
  const isC = t.id === 'contrast';
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: large ? 10 : 7,
      paddingVertical: large ? 8 : 5, paddingHorizontal: large ? 16 : 12, borderRadius: 999,
      backgroundColor: isC ? t.surface : withAlpha(sc.fg, 0.16),
      borderWidth: isC ? 2 : 1, borderColor: sc.fg, alignSelf: 'flex-start',
    }}>
      <View style={{ width: large ? 11 : 8, height: large ? 11 : 8, borderRadius: 999, backgroundColor: sc.fg }} />
      <Text style={{ color: sc.fg, fontWeight: '800', fontSize: large ? 18 : 14 }}>{STATUS_LABEL[level]}</Text>
    </View>
  );
}

// ───────── live caption bar (TTS subtitle) ─────────
export function CaptionBar({ level, text, sub, speaking, big }: { level: Level | 'idle'; text: string; sub?: string; speaking?: boolean; big?: boolean }) {
  const t = useTheme();
  const sc = level === 'idle' ? null : t.status[level];
  const accent = sc ? sc.fg : t.primary;
  const isC = t.id === 'contrast';
  return (
    <View style={{
      backgroundColor: isC ? t.surface : (t.ambient ? withAlpha(accent, 0.14) : t.surface),
      borderWidth: t.borderW + (isC ? 1 : 0),
      borderColor: isC ? accent : withAlpha(accent, 0.45),
      borderRadius: t.radius, padding: 18, paddingBottom: 20,
      ...(!isC ? shadow(withAlpha(accent, 0.35), 26, 0.22, 4) : {}),
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <Icon name="speaker" size={20} color={accent} sw={2.2} />
        <Text style={{ fontSize: 13, fontWeight: '800', letterSpacing: 0.5, color: accent }}>음성 안내</Text>
        <View style={{ flex: 1 }} />
        <Waveform active={!!speaking} color={accent} />
      </View>
      <Text style={{ fontSize: big ? 36 : 29, lineHeight: big ? 44 : 36, fontWeight: '800', color: t.text, letterSpacing: -0.6 }}>{text}</Text>
      {sub ? <Text style={{ marginTop: 8, fontSize: 17, lineHeight: 24, fontWeight: '600', color: t.textDim }}>{sub}</Text> : null}
    </View>
  );
}

// ───────── card ─────────
export function Card({ children, style, pad = 18, tone }: { children: React.ReactNode; style?: ViewStyle; pad?: number; tone?: string }) {
  const t = useTheme();
  return (
    <View style={[{ backgroundColor: t.surface, borderWidth: t.borderW, borderColor: tone || t.border, borderRadius: t.radius, padding: pad }, style]}>
      {children}
    </View>
  );
}

// ───────── section title ─────────
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 10, paddingHorizontal: 2 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', letterSpacing: 1, color: t.textDim }}>{children}</Text>
      {right}
    </View>
  );
}

// ───────── mode button ─────────
export function ModeButton({ icon, title, desc, onPress, active }: { icon: IconName; title: string; desc?: string; onPress?: () => void; active?: boolean }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={{
      flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 88, padding: 18, borderRadius: t.radius,
      backgroundColor: isC ? (active ? t.primary : t.surface) : t.surface,
      borderWidth: t.borderW, borderColor: isC ? t.border : (active ? t.primary : t.border),
      ...(!isC ? shadow('rgba(22,42,82,0.14)', 18, 0.16, 3) : {}),
    }}>
      <View style={{
        width: 56, height: 56, borderRadius: isC ? 8 : 16, alignItems: 'center', justifyContent: 'center',
        backgroundColor: isC ? (active ? 'rgba(255,255,255,0.18)' : 'transparent') : withAlpha(t.primary, 0.16),
        borderWidth: isC ? 2 : 0, borderColor: isC ? (active ? t.onPrimary : t.primary) : 'transparent',
      }}>
        <Icon name={icon} size={32} color={isC && active ? t.onPrimary : t.primary} sw={2.1} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 23, fontWeight: '800', letterSpacing: -0.6, color: isC && active ? t.onPrimary : t.text }}>{title}</Text>
        {desc ? <Text style={{ marginTop: 3, fontSize: 15, fontWeight: '600', color: isC && active ? t.onPrimary : t.textDim }}>{desc}</Text> : null}
      </View>
      <Icon name="chevron" size={22} color={isC && active ? t.onPrimary : t.textFaint} sw={2.4} />
    </TouchableOpacity>
  );
}

// ───────── mode header (optional back chevron for non-tab screens) ─────────
export function ModeHeader({ title, icon, right, onBack }: { title: string; icon: IconName; right?: React.ReactNode; onBack?: () => void }) {
  const t = useTheme();
  const isC = t.id === 'contrast';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} aria-label="뒤로" style={{ width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
          <Icon name="chevronL" size={20} color={t.textDim} sw={2.4} />
        </TouchableOpacity>
      ) : (
        <View style={{
          width: 40, height: 40, borderRadius: isC ? 8 : 12, alignItems: 'center', justifyContent: 'center',
          backgroundColor: isC ? 'transparent' : withAlpha(t.primary, 0.16), borderWidth: isC ? 2 : 0, borderColor: t.primary,
        }}>
          <Icon name={icon} size={24} color={t.primary} sw={2.1} />
        </View>
      )}
      <Text style={{ flex: 1, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.text }}>{title}</Text>
      {right}
    </View>
  );
}

// ───────── segmented control ─────────
export function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <TouchableOpacity key={o.v} activeOpacity={0.8} onPress={() => onChange(o.v)} style={{ flex: 1, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : 'transparent' }}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: on ? t.onPrimary : t.textDim }}>{o.l}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ───────── toggle switch row ─────────
export function Toggle({ label, desc, value, onChange }: { label: string; desc?: string; value: boolean; onChange: (b: boolean) => void }) {
  const t = useTheme();
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={() => onChange(!value)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 17, fontWeight: '800', color: t.text }}>{label}</Text>
        {desc ? <Text style={{ fontSize: 13.5, fontWeight: '600', color: t.textDim, marginTop: 2 }}>{desc}</Text> : null}
      </View>
      <View style={{ width: 56, height: 32, borderRadius: 999, backgroundColor: value ? t.primary : t.surface2, borderWidth: t.borderW, borderColor: value ? t.primary : t.border, justifyContent: 'center' }}>
        <View style={{ position: 'absolute', left: value ? 27 : 3, width: 24, height: 24, borderRadius: 999, backgroundColor: value ? t.onPrimary : t.textDim }} />
      </View>
    </TouchableOpacity>
  );
}

// ───────── labeled input field (account screen) ─────────
export function Field({ label, icon, secure, keyboardType, placeholder }: { label: string; icon: IconName; secure?: boolean; keyboardType?: 'default' | 'email-address'; placeholder?: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 7 }}>
      <Text style={{ fontSize: 14, fontWeight: '800', color: t.textDim }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 54, paddingHorizontal: 14, borderRadius: t.radiusSm, backgroundColor: t.surface2, borderWidth: t.borderW, borderColor: t.border }}>
        <Icon name={icon} size={19} color={t.textFaint} sw={2} />
        <TextInput
          placeholder={placeholder}
          placeholderTextColor={t.textFaint}
          secureTextEntry={secure}
          keyboardType={keyboardType}
          style={{ flex: 1, fontSize: 16, fontWeight: '600', color: t.text, padding: 0 }}
        />
      </View>
    </View>
  );
}

// ───────── small control button ─────────
export function ctrlStyle(t: Theme): ViewStyle {
  return { minWidth: 52, height: 52, paddingHorizontal: 16, borderRadius: t.radiusSm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface, borderWidth: t.borderW, borderColor: t.border };
}
