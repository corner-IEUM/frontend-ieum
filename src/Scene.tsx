// Scene.tsx — forward radar view: rings, rotating sweep, object markers, LIVE badge
import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing } from 'react-native';
import Svg, { Path, Circle, Text as SvgText, Defs, LinearGradient as SvgGrad, Stop, Polygon } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { Icon, IconName } from './Icon';
import { useTheme } from './theme-context';
import { Level, withAlpha } from './theme';
import { Blink } from './ui';

export interface SceneObj { id: string; icon: IconName; label: string; dist: number; bearing: number; level: Level; }

const W = 360;

function RippleRing({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', width: 54, height: 54, borderRadius: 999, borderWidth: 2, borderColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.9] }) }],
    }} />
  );
}

export function SceneView({ objects, height = 300, scanning }: { objects: SceneObj[]; height?: number; scanning?: boolean }) {
  const t = useTheme();
  const H = height;
  const cx = W / 2, cy = H - 6;
  const isC = t.id === 'contrast';
  const rPix = (d: number) => Math.min(d / 3.6, 1) * (H - 36);
  const place = (d: number, b: number) => {
    const r = rPix(d), ang = b * 0.92;
    return { x: cx + Math.sin(ang) * r * 0.92, y: cy - Math.cos(ang) * r };
  };
  const ringColor = isC ? 'rgba(0,0,0,0.35)' : withAlpha(t.primary, 0.4);

  // sweep rotation
  const rot = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!scanning) { rot.stopAnimation(); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(rot, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(rot, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [scanning]);
  const spin = rot.interpolate({ inputRange: [0, 1], outputRange: ['-56deg', '56deg'] });

  return (
    <View style={{ width: '100%', height: H, borderRadius: t.radius, overflow: 'hidden', borderWidth: t.borderW, borderColor: t.border }}>
      <LinearGradient colors={isC ? ['#ffffff', '#ffffff'] : ['#e7eefa', '#f4f7fc']} start={{ x: 0.5, y: 1 }} end={{ x: 0.5, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />

      {/* rings + markers */}
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: 'absolute', alignSelf: 'center' }}>
        {[1, 2, 3].map((d) => {
          const r = rPix(d);
          return (
            <React.Fragment key={d}>
              <Path d={`M ${cx - r * 0.92} ${cy} A ${r * 0.92} ${r} 0 0 1 ${cx + r * 0.92} ${cy}`} fill="none" stroke={ringColor} strokeWidth={isC ? 1.5 : 1} strokeDasharray={d === 3 ? '2 6' : undefined} />
              <SvgText x={cx + r * 0.92 - 2} y={cy - 6} textAnchor="end" fontSize={11} fill={isC ? 'rgba(0,0,0,0.55)' : t.textFaint}>{d}m</SvgText>
            </React.Fragment>
          );
        })}
        <Polygon points={`${cx - 7},${cy + 2} ${cx},${cy - 9} ${cx + 7},${cy + 2}`} fill={t.primary} stroke={t.bg} strokeWidth={1.5} />
        <Circle cx={cx} cy={cy} r={isC ? 7 : 6} fill={t.primary} />
      </Svg>

      {/* rotating sweep beam */}
      {scanning ? (
        <Animated.View pointerEvents="none" style={{
          position: 'absolute', left: W / 2 - 24, top: cy - (H - 30), width: 48, height: H - 30,
          transform: [{ translateY: (H - 30) / 2 }, { rotate: spin }, { translateY: -(H - 30) / 2 }],
        }}>
          <LinearGradient colors={[withAlpha(t.primary, 0), withAlpha(t.primary, 0.42)]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, borderTopLeftRadius: 8, borderTopRightRadius: 8 }} />
        </Animated.View>
      ) : null}

      {/* object markers */}
      {objects.map((o) => {
        const { x, y } = place(o.dist, o.bearing);
        const sc = t.status[o.level];
        const scale = 0.78 + (1 - Math.min(o.dist / 3.6, 1)) * 0.5;
        return (
          <View key={o.id} style={{ position: 'absolute', left: (x / W) * 100 + '%' as any, top: (y / H) * 100 + '%' as any, alignItems: 'center' }}>
            <View style={{ alignItems: 'center', transform: [{ translateX: -28 }, { translateY: -34 }, { scale }], gap: 5 }}>
              {o.level === 'danger' ? <RippleRing color={sc.fg} /> : null}
              <View style={{
                width: 40, height: 40, borderRadius: isC ? 7 : 12, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isC ? t.surface : withAlpha(sc.fg, 0.22), borderWidth: isC ? 2 : 1.5, borderColor: sc.fg,
              }}>
                <Icon name={o.icon} size={24} color={sc.fg} sw={2} />
              </View>
              <View style={{ backgroundColor: isC ? sc.fg : withAlpha(sc.fg, 0.16), borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, borderWidth: isC ? 0 : 1, borderColor: withAlpha(sc.fg, 0.4) }}>
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: isC ? '#000' : sc.fg }}>{o.label} · {o.dist.toFixed(1)}m</Text>
              </View>
            </View>
          </View>
        );
      })}

      {/* LIVE + count badges */}
      <View style={{ position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Blink><View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: '#ff3b30' }} /></Blink>
        <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff', letterSpacing: 1 }}>LIVE</Text>
      </View>
      <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 11, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Icon name="eye" size={15} color="rgba(255,255,255,0.85)" sw={2} />
        <Text style={{ fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' }}>인식 {objects.length}</Text>
      </View>
    </View>
  );
}

// ───────── haptic danger flash overlay ─────────
export function HapticFlash({ show }: { show: boolean }) {
  const t = useTheme();
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!show) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 80, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 80, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [show]);
  if (!show) return null;
  const c = t.status.danger.fg;
  const tx = shake.interpolate({ inputRange: [-1, 1], outputRange: [-5, 5] });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderWidth: 8, borderColor: c, borderRadius: 30 }} />
      <Animated.View style={{ alignItems: 'center', gap: 12, paddingVertical: 22, paddingHorizontal: 30, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.7)', transform: [{ translateX: tx }] }}>
        <Icon name="vibrate" size={52} color={c} sw={2.2} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.4 }}>강한 진동</Text>
      </Animated.View>
    </View>
  );
}
