// KakaoMap.tsx — 실제 카카오맵을 띄우는 컴포넌트.
// 카카오는 React Native용 네이티브 지도 SDK를 공식 제공하지 않고 "JavaScript SDK"만 제공하므로,
// WebView 안에 HTML을 올리고 그 안에서 카카오맵 JS SDK(dapi.kakao.com/v2/maps/sdk.js)를 로드하는
// 방식이 사실상 유일한 선택지 — MiniMap(SVG로 그린 가짜 지도 placeholder)을 실제 지도로
// 바꾸기 위해 새로 만든 컴포넌트.
import React, { useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useTheme } from './theme-context';

// EXPO_PUBLIC_ 접두사 변수는 Expo가 번들 시점에 process.env로 그대로 심어준다 (별도 설치 불필요).
// .env에 값이 없으면(아직 키를 안 채워넣은 상태) 빈 문자열이 되어 카카오 SDK가 로드에 실패하고
// 콘솔에 에러만 남을 뿐 앱이 죽지는 않는다.
const KAKAO_JS_KEY = process.env.EXPO_PUBLIC_KAKAO_JS_KEY ?? '';

interface KakaoMapProps {
  latitude: number;   // 현재 위치 위도 — useLocationTracking의 Coords.latitude를 그대로 전달
  longitude: number;  // 현재 위치 경도 — useLocationTracking의 Coords.longitude를 그대로 전달
  height?: number;
}

// WebView에 최초 1회만 주입되는 HTML 문자열.
// 초기 좌표는 마운트 시점 값을 그대로 박아 넣어 첫 렌더부터 정확한 위치에서 지도가 뜨게 하고,
// 이후 좌표 변화는 이 HTML을 다시 만드는 대신 injectJavaScript로 이미 떠 있는 지도만 갱신한다
// (매번 HTML을 새로 주면 WebView가 통째로 리로드되어 깜빡이고 느려짐).
function buildHtml(appkey: string, initialLat: number, initialLng: number): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; padding: 0; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false"></script>
  <script>
    var map, marker;

    // RN 쪽에서 injectJavaScript로 호출 — 지도가 아직 준비 안 됐으면 조용히 무시
    // (RN이 map 준비 완료를 기다리는 별도 핸드셰이크 없이 바로 호출해도 안전하도록)
    function updatePosition(lat, lng) {
      if (!map || !marker) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      map.setCenter(pos);
      marker.setPosition(pos);
    }

    kakao.maps.load(function () {
      var container = document.getElementById('map');
      var initialPos = new kakao.maps.LatLng(${initialLat}, ${initialLng});
      map = new kakao.maps.Map(container, { center: initialPos, level: 3 });
      marker = new kakao.maps.Marker({ position: initialPos, map: map });
    });
  </script>
</body>
</html>`;
}

export function KakaoMap({ latitude, longitude, height = 200 }: KakaoMapProps) {
  const t = useTheme();
  const webviewRef = useRef<WebView>(null);
  const isFirstRender = useRef(true);

  // HTML은 최초 좌표로 한 번만 만들고, 이후로는 재생성하지 않음(useMemo 빈 의존성 배열)
  // — 그래야 좌표가 바뀔 때마다 WebView가 새로 로드되지 않고 injectJavaScript만으로 부드럽게 갱신됨
  const html = useMemo(() => buildHtml(KAKAO_JS_KEY, latitude, longitude), []);

  useEffect(() => {
    // 최초 렌더에서는 html 자체가 이미 이 좌표로 만들어졌으므로 다시 보낼 필요 없음
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    // WebView 안의 updatePosition()을 호출해 지도 중심/마커 위치를 갱신
    // (injectJavaScript는 문자열 끝에 true를 반환해야 일부 플랫폼에서 경고가 안 남)
    webviewRef.current?.injectJavaScript(`updatePosition(${latitude}, ${longitude}); true;`);
  }, [latitude, longitude]);

  if (!KAKAO_JS_KEY) {
    // 키가 아직 .env에 채워지지 않은 상태 — 흰 화면 대신 안내 텍스트로 원인을 바로 알 수 있게
    return (
      <View style={[styles.wrap, { height, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.textFaint} />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={webviewRef}
        originWhitelist={['*']} // Android에서 source.html + 외부 <script> 조합이 기본 오리진 제약에 걸리는 걸 방지
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
