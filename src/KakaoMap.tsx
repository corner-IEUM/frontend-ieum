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

// 지도 위에 그릴 경로선(폴리라인) 좌표 한 점
export interface RoutePathPoint { lat: number; lng: number; }

interface KakaoMapProps {
  latitude: number;   // 현재 위치 위도 — useLocationTracking의 Coords.latitude를 그대로 전달
  longitude: number;  // 현재 위치 경도 — useLocationTracking의 Coords.longitude를 그대로 전달
  height?: number;
  routePath?: RoutePathPoint[]; // 길찾기 경로선으로 그릴 좌표 목록 — 없거나 비어있으면 선을 그리지 않음
}

// WebView에 최초 1회만 주입되는 HTML 문자열.
// 초기 좌표는 마운트 시점 값을 그대로 박아 넣어 첫 렌더부터 정확한 위치에서 지도가 뜨게 하고,
// 이후 좌표 변화는 이 HTML을 다시 만드는 대신 injectJavaScript로 이미 떠 있는 지도만 갱신한다
// (매번 HTML을 새로 주면 WebView가 통째로 리로드되어 깜빡이고 느려짐). 경로선(폴리라인)도 같은
// 방식 — 초기 경로는 HTML에 바로 박아 넣고, 이후 경로 변경(재탐색 등)은 updateRoute()로 갱신한다.
function buildHtml(appkey: string, initialLat: number, initialLng: number, routeColor: string, initialPath: RoutePathPoint[]): string {
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
  <script>
    // TEMP DEBUG: WebView 안의 console.log/warn/error, window.alert, 잡히지 않은 JS 에러를
    // RN 쪽 postMessage로 그대로 전달 — Kakao SDK가 콘솔/alert로만 에러를 내고 예외를 던지지
    // 않는 경우(도메인 미등록 등)까지 Metro 로그에서 보기 위한 임시 계측. 디버깅 끝나면 제거할 것.
    function post(type, payload) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload }));
      }
    }
    ['log', 'warn', 'error'].forEach(function (level) {
      var orig = console[level];
      console[level] = function () {
        post('console.' + level, Array.prototype.slice.call(arguments).map(String));
        orig.apply(console, arguments);
      };
    });
    var origAlert = window.alert;
    window.alert = function (msg) {
      post('alert', String(msg));
      origAlert(msg);
    };
    window.onerror = function (msg, url, line, col, error) {
      post('window.onerror', { msg: msg, url: url, line: line, col: col, stack: error && error.stack });
    };
  </script>
  <script
    src="https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appkey}&autoload=false"
    onerror="post('script.onerror', 'Kakao SDK 스크립트 로드 실패 (네트워크/차단 등)')"
  ></script>
  <script>
    var map, marker, polyline;

    // RN 쪽에서 injectJavaScript로 호출 — 지도가 아직 준비 안 됐으면 조용히 무시
    // (RN이 map 준비 완료를 기다리는 별도 핸드셰이크 없이 바로 호출해도 안전하도록)
    function updatePosition(lat, lng) {
      if (!map || !marker) return;
      var pos = new kakao.maps.LatLng(lat, lng);
      map.setCenter(pos);
      marker.setPosition(pos);
    }

    // 길찾기 경로선(폴리라인) 갱신 — path는 [{lat, lng}, ...] 형태의 배열.
    // 재탐색 등으로 경로가 바뀌면 기존 선을 먼저 지우고(setMap(null)) 새로 그려야 두 경로가
    // 겹쳐 보이지 않는다. path가 비어있거나 없으면(아직 경로 없음) 기존 선만 지우고 끝낸다.
    function updateRoute(path) {
      if (!map) return;
      if (polyline) {
        polyline.setMap(null);
        polyline = null;
      }
      if (!path || path.length === 0) return;
      var linePath = path.map(function (p) { return new kakao.maps.LatLng(p.lat, p.lng); });
      polyline = new kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 5,
        strokeColor: '${routeColor}',
        strokeOpacity: 0.8,
        strokeStyle: 'solid',
      });
      polyline.setMap(map);
    }

    // TEMP DEBUG: kakao 전역 객체 자체가 있는지(SDK 스크립트는 로드됐는지) 먼저 확인
    if (typeof kakao === 'undefined') {
      post('debug', 'kakao 전역 객체 없음 — SDK 스크립트 자체가 실행되지 않음');
    } else {
      try {
        kakao.maps.load(function () {
          post('debug', 'kakao.maps.load 콜백 진입 — SDK 인증/로드 성공');
          try {
            var container = document.getElementById('map');
            var initialPos = new kakao.maps.LatLng(${initialLat}, ${initialLng});
            map = new kakao.maps.Map(container, { center: initialPos, level: 3 });
            marker = new kakao.maps.Marker({ position: initialPos, map: map });
            updateRoute(${JSON.stringify(initialPath)});
            post('debug', 'kakao.maps.Map/Marker 생성 완료');
          } catch (e) {
            post('debug', 'Map/Marker 생성 중 예외: ' + (e && e.message));
          }
        });
      } catch (e) {
        // 등록되지 않은 앱키/도메인일 때 kakao.maps.load 자체가 동기 예외를 던지는 경우 대비
        post('debug', 'kakao.maps.load 호출 중 예외(앱키/도메인 미등록 가능성): ' + (e && e.message));
      }
    }
  </script>
</body>
</html>`;
}

export function KakaoMap({ latitude, longitude, height = 200, routePath }: KakaoMapProps) {
  const t = useTheme();
  const webviewRef = useRef<WebView>(null);
  const isFirstRender = useRef(true);

  // HTML은 최초 좌표/경로로 한 번만 만들고, 이후로는 재생성하지 않음(useMemo 빈 의존성 배열)
  // — 그래야 좌표·경로가 바뀔 때마다 WebView가 통째로 리로드되지 않고 injectJavaScript만으로 갱신됨.
  // 경로선 색상은 새로 정의하지 않고 앱 브랜드 색상(테마의 primary)을 그대로 재사용한다.
  const html = useMemo(() => buildHtml(KAKAO_JS_KEY, latitude, longitude, t.primary, routePath ?? []), []);

  // TEMP DEBUG: 키가 아예 비어있는지(.env 미설정) vs 값은 있는지를 RN 콘솔에서 바로 구분하기 위함
  useEffect(() => {
    console.log('[KakaoMap TEMP DEBUG] KAKAO_JS_KEY present:', !!KAKAO_JS_KEY, 'length:', KAKAO_JS_KEY.length);
  }, []);

  useEffect(() => {
    // 최초 렌더에서는 html 자체가 이미 이 좌표로 만들어졌으므로 다시 보낼 필요 없음
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    // WebView 안의 updatePosition()을 호출해 지도 중심/마커 위치를 갱신
    // (injectJavaScript는 문자열 끝에 true를 반환해야 일부 플랫폼에서 경고가 안 남)
    webviewRef.current?.injectJavaScript(`updatePosition(${latitude}, ${longitude}); true;`);
  }, [latitude, longitude]);

  const isFirstRoutePath = useRef(true);
  useEffect(() => {
    // 최초 렌더에서는 html 자체가 이미 이 경로로 만들어졌으므로 다시 보낼 필요 없음
    if (isFirstRoutePath.current) { isFirstRoutePath.current = false; return; }
    // 경로 이탈 재탐색 등으로 route가 바뀌면 routePath도 새 배열로 바뀌므로 여기서 다시 그려준다.
    // updateRoute() 내부에서 기존 선을 먼저 지우므로 재탐색 전 경로가 겹쳐 남지 않는다.
    webviewRef.current?.injectJavaScript(`updateRoute(${JSON.stringify(routePath ?? [])}); true;`);
  }, [routePath]);

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
        // TEMP DEBUG: WebView 내부 콘솔/에러를 Metro 로그로 노출 — 디버깅 끝나면 이 3개 prop 제거
        onMessage={(e) => {
          try {
            const { type, payload } = JSON.parse(e.nativeEvent.data);
            console.log(`[KakaoMap TEMP DEBUG] ${type}:`, payload);
          } catch {
            console.log('[KakaoMap TEMP DEBUG] onMessage (raw):', e.nativeEvent.data);
          }
        }}
        onError={(e) => console.log('[KakaoMap TEMP DEBUG] WebView onError:', e.nativeEvent)}
        onHttpError={(e) => console.log('[KakaoMap TEMP DEBUG] WebView onHttpError:', e.nativeEvent)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
