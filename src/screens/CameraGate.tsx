// screens/CameraGate.tsx — camera launch gate for 일반보행/길찾기: opens camera, "인식", then hands off to the target mode
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon, IconName } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader } from '../ui';

export type CameraTarget = 'walk' | 'navigate';

const COPY: Record<CameraTarget, { title: string; icon: IconName; hint: string; scanning: string }> = {
  walk: { title: '일반보행 카메라', icon: 'walk', hint: '전방을 비추면 장애물과 신호등을 인식합니다', scanning: '전방 인식 중…' },
  navigate: { title: '길찾기 카메라', icon: 'pin', hint: '전방을 비추면 주변 사물과 정류장을 인식합니다', scanning: '주변 인식 중…' },
};

function ScanPulse({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={{
      position: 'absolute', width: 96, height: 96, borderRadius: 999, borderWidth: 3, borderColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
    }} />
  );
}

export function CameraGateScreen({ target, onScanned, onCancel }: { target: CameraTarget; onScanned: () => void; onCancel: () => void }) {
  const t = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const copy = COPY[target];

  const startScan = () => {
    setScanning(true);
    const id = setTimeout(onScanned, 1800);
    return () => clearTimeout(id);
  };

  if (!permission || !permission.granted) {
    return (
      <View style={{ flex: 1, padding: 18, paddingTop: 4, gap: 18 }}>
        <ModeHeader title={copy.title} icon={copy.icon} onBack={onCancel} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <View style={{ width: 72, height: 72, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.primary, 0.16), borderWidth: t.borderW, borderColor: t.primary }}>
            <Icon name="camera" size={34} color={t.primary} sw={2} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '800', color: t.text, textAlign: 'center' }}>카메라 권한이 필요합니다</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.textDim, textAlign: 'center', lineHeight: 20 }}>{copy.hint}</Text>
          <TouchableOpacity onPress={requestPermission} style={{ height: 54, paddingHorizontal: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary, marginTop: 6 }}>
            <Text style={{ fontWeight: '800', fontSize: 16, color: t.onPrimary }}>권한 허용하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: 4 }}>
      <View style={{ paddingHorizontal: 18 }}>
        <ModeHeader title={copy.title} icon={copy.icon} onBack={onCancel} />
      </View>

      <View style={{ flex: 1, margin: 18, borderRadius: t.radius, overflow: 'hidden', borderWidth: t.borderW, borderColor: t.border, backgroundColor: '#000' }}>
        <CameraView style={{ flex: 1 }} facing="back" />

        {scanning ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' }}>
            <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
              <ScanPulse color={t.primary} />
              <View style={{ width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.primary, 0.28), borderWidth: 2, borderColor: t.primary }}>
                <Icon name="eye" size={30} color="#fff" sw={2.2} />
              </View>
            </View>
            <Text style={{ marginTop: 16, fontSize: 16, fontWeight: '800', color: '#fff' }}>{copy.scanning}</Text>
          </View>
        ) : (
          <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, alignItems: 'center' }}>
            <TouchableOpacity onPress={startScan} activeOpacity={0.9} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, height: 58, paddingHorizontal: 28, borderRadius: 999, backgroundColor: t.primary }}>
              <Icon name="camera" size={22} color={t.onPrimary} sw={2.2} />
              <Text style={{ fontWeight: '800', fontSize: 17, color: t.onPrimary }}>인식 시작</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={{ textAlign: 'center', fontSize: 13, fontWeight: '600', color: t.textDim, marginBottom: 18, paddingHorizontal: 24 }}>{copy.hint}</Text>
    </View>
  );
}
