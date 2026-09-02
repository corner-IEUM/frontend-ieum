// screens/CameraGate.tsx — camera launch gate for 일반보행/길찾기: opens camera, "인식", then hands off to the target mode
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Icon, IconName } from '../Icon';
import { useTheme } from '../theme-context';
import { withAlpha } from '../theme';
import { ModeHeader } from '../ui';

export type CameraTarget = 'walk';

const COPY: Record<CameraTarget, { title: string; icon: IconName; hint: string; scanning: string }> = {
  walk: { title: '일반보행 카메라', icon: 'walk', hint: '전방을 비추면 장애물과 신호등을 인식합니다', scanning: '전방 인식 중…' },
};

function ScanPulse({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1300, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  return (
    <Animated.View style={[
      styles.scanPulse,
      {
        borderColor: color,
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] }),
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.6] }) }],
      },
    ]} />
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
      <View style={styles.permContainer}>
        <ModeHeader title={copy.title} icon={copy.icon} onBack={onCancel} />
        <View style={styles.permBody}>
          <View style={[styles.permIconCircle, { backgroundColor: withAlpha(t.primary, 0.16), borderWidth: t.borderW, borderColor: t.primary }]}>
            <Icon name="camera" size={34} color={t.primary} sw={2} />
          </View>
          <Text style={[styles.permTitle, { color: t.text }]}>카메라 권한이 필요합니다</Text>
          <Text style={[styles.permHint, { color: t.textDim }]}>{copy.hint}</Text>
          <TouchableOpacity onPress={requestPermission} style={[styles.permButton, { backgroundColor: t.primary }]}>
            <Text style={[styles.permButtonText, { color: t.onPrimary }]}>권한 허용하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <ModeHeader title={copy.title} icon={copy.icon} onBack={onCancel} />
      </View>

      <View style={[styles.cameraBox, { borderRadius: t.radius, borderWidth: t.borderW, borderColor: t.border }]}>
        <CameraView style={styles.cameraView} facing="back" />

        {scanning ? (
          <View pointerEvents="none" style={styles.scanOverlay}>
            <View style={styles.scanIconWrap}>
              <ScanPulse color={t.primary} />
              <View style={[styles.scanIconCircle, { backgroundColor: withAlpha(t.primary, 0.28), borderColor: t.primary }]}>
                <Icon name="eye" size={30} color="#fff" sw={2.2} />
              </View>
            </View>
            <Text style={styles.scanText}>{copy.scanning}</Text>
          </View>
        ) : (
          <View style={styles.startWrap}>
            <TouchableOpacity onPress={startScan} activeOpacity={0.9} style={[styles.startButton, { backgroundColor: t.primary }]}>
              <Icon name="camera" size={22} color={t.onPrimary} sw={2.2} />
              <Text style={[styles.startButtonText, { color: t.onPrimary }]}>인식 시작</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Text style={[styles.hintText, { color: t.textDim }]}>{copy.hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  permContainer: { flex: 1, padding: 18, paddingTop: 4, gap: 18 },
  permBody: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  permIconCircle: { width: 72, height: 72, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  permTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  permHint: { fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  permButton: { height: 54, paddingHorizontal: 30, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  permButtonText: { fontWeight: '800', fontSize: 16 },
  container: { flex: 1, paddingTop: 4 },
  headerRow: { paddingHorizontal: 18 },
  cameraBox: { flex: 1, margin: 18, overflow: 'hidden', backgroundColor: '#000' },
  cameraView: { flex: 1 },
  scanOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.28)' },
  scanIconWrap: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  scanIconCircle: { width: 64, height: 64, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  scanText: { marginTop: 16, fontSize: 16, fontWeight: '800', color: '#fff' },
  startWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 22, alignItems: 'center' },
  startButton: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 58, paddingHorizontal: 28, borderRadius: 999 },
  startButtonText: { fontWeight: '800', fontSize: 17 },
  hintText: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginBottom: 18, paddingHorizontal: 24 },
  scanPulse: { position: 'absolute', width: 96, height: 96, borderRadius: 999, borderWidth: 3 },
});
