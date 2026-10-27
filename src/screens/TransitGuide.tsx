// screens/TransitGuide.tsx — 대중교통 안내 화면: 상태 배지 + 스텝 인디케이터 (확인 버튼은 ConfirmBar가 하단에 고정) / Transit guidance screen; confirm buttons live in ConfirmBar
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../theme-context';
import { ModeHeader, Card } from '../ui';
import { stopSpeaking } from '../tts';
import { TransitNavigation } from '../hooks/useTransitNavigation';
import { useVoiceConfirm } from '../hooks/useVoiceConfirm';
import { useAlightGuidance } from '../hooks/useAlightGuidance';
import { useDestinationArrival } from '../hooks/useDestinationArrival';
import type { SttAdapter } from '../transit/voiceConfirm';
import { TransitSessionLeg } from '../transit/types';
import { StateBadge, LegStepIndicator } from '../transit/StateBadge';
import { buildGuidance, stopName, NEAR_ALIGHT_BUTTON, ARRIVED_BUTTON } from '../transit/guidanceMessages';
import { Icon } from '../Icon';
import { WaitingAtStopScreen } from './WaitingAtStop';
import { useAppActive } from '../hooks/useAppActive';
import { useLocationTracking } from '../hooks/useLocationTracking';
import { announceText, HAPTIC } from '../transit/feedback';
import { hasTransitLeg, stageForUiState, rideTimeline, walkRemain, alightDistanceText } from '../transit/stageView';
import { StageStepper } from '../transit/TransitUi';
import { BusArrivedView, RideTimelineView, AlightSoonView, WalkToDestView } from './TransitStageViews';

export function TransitGuideScreen({ nav, onBack, walkGuidance, stt }: {
  nav: TransitNavigation;
  onBack: () => void;
  // 음성 확인용 STT 어댑터(선택). 없으면 음성 확인은 꺼지고 버튼만 동작 / Optional STT adapter; without it voice confirm is off and buttons still work
  stt?: SttAdapter | null;
  // 기존 도보 안내(NavigateScreen 등)를 끼워 넣는 연결점. 도보 leg 종료 시 onLegEnd(=completeWalk)만 호출하면 됨
  // Hook point for existing walk guidance; it only needs to call onLegEnd (= completeWalk) when the walk leg ends
  walkGuidance?: (args: { leg: TransitSessionLeg; onLegEnd: () => void; busy: boolean }) => React.ReactNode;
}) {
  const t = useTheme();
  const { session, uiState, currentLeg, busy } = nav;
  const { remainingStops, alightDistanceM } = useAlightGuidance(nav); // ON_BUS에서만 GPS로 하차 안내 (정류장 정보가 없으면 동작 안 함)
  useDestinationArrival(nav); // WALK_TO_DEST에서만 위치 추적, 목적지 30m 이내 연속 2회면 도착 처리
  useVoiceConfirm(nav, stt ?? null); // 화면 이탈 시 청취 중단 포함 / also stops listening on unmount
  // 하차 후 도보 전환 화면의 남은 거리/방향 표시용 위치(표시 전용, 도착 판정은 useDestinationArrival이 따로 한다). WALK_TO_DEST + 포그라운드에서만 구독
  const appActive = useAppActive();
  const { location } = useLocationTracking(uiState === 'WALK_TO_DEST' && appActive);

  // 화면 이탈 시 안내 음성 중지 / stop TTS when leaving
  useEffect(() => () => { stopSpeaking(); }, []);

  const handleBack = () => { stopSpeaking(); onBack(); };

  if (!session || !uiState) {
    return (
      <View style={styles.container}>
        <ModeHeader title="경로 안내" icon="bus" onBack={handleBack} />
        <Card pad={18}><Text style={[styles.text, { color: t.text }]}>진행 중인 경로가 없어요.</Text></Card>
      </View>
    );
  }

  const isWalk = uiState === 'WALK_TO_STOP' || uiState === 'WALK_TO_DEST';
  const finished = uiState === 'ARRIVED';

  // 단계별 화면의 값은 모두 기존 로직이 내보낸 값: uiState/currentLeg(세션), remainingStops(GPS 하차 판정), TTS 문장(buildGuidance), 진동 패턴(feedback.HAPTIC)
  const stage = hasTransitLeg(session.legs) ? stageForUiState(uiState) : null; // 도보 전용 경로에는 3단계 스텝을 보이지 않는다
  const headline = buildGuidance(uiState, session);
  const replay = () => { announceText(headline, false); }; // 화면 문구와 같은 문장을 다시 읽는다
  const pattern = HAPTIC[uiState];
  const rideMode = currentLeg?.mode === 'SUBWAY' ? 'SUBWAY' : 'BUS';
  const stageViewShown = uiState === 'BOARDING_CONFIRM' || uiState === 'ON_BUS' || uiState === 'ALIGHTING_CONFIRM' || uiState === 'WALK_TO_DEST'
    || (uiState === 'WAITING_AT_STOP' && currentLeg?.mode === 'BUS'); // 이 상태들은 아래 단계별 화면이 상태 문구를 대신 보여준다

  return (
    <View style={styles.container}>
      <ModeHeader title="경로 안내" icon="bus" onBack={handleBack} />
      {stage ? <StageStepper stage={stage} /> : null}
      {stageViewShown ? null : <StateBadge uiState={uiState} session={session} leg={currentLeg} remainingStops={remainingStops} />}
      {stage ? null : <LegStepIndicator legs={session.legs} currentIndex={session.currentLegIndex} done={finished} />}

      {uiState === 'BOARDING_CONFIRM' ? (
        <BusArrivedView headline={headline} routeName={currentLeg?.routeName} mode={rideMode} pattern={pattern} onReplay={replay} />
      ) : null}

      {uiState === 'ON_BUS' ? (
        <RideTimelineView
          headline={headline}
          timeline={rideTimeline(currentLeg, remainingStops)}
          totalStops={currentLeg?.passStopCount ?? null}
          routeName={currentLeg?.routeName}
          mode={rideMode}
          pattern={pattern}
          onReplay={replay}
        />
      ) : null}

      {uiState === 'ALIGHTING_CONFIRM' ? (
        <AlightSoonView headline={headline} remainingStops={remainingStops} distanceText={alightDistanceText(alightDistanceM)} alightName={currentLeg ? stopName(currentLeg.end.name) : undefined} pattern={pattern} onReplay={replay} />
      ) : null}

      {uiState === 'WALK_TO_STOP' && currentLeg ? (
        walkGuidance ? walkGuidance({ leg: currentLeg, onLegEnd: nav.completeWalk, busy }) : (
          <Card pad={18}><Text style={[styles.text, { color: t.text }]}>{headline}</Text></Card>
        )
      ) : null}

      {uiState === 'WALK_TO_DEST' && currentLeg ? (
        <WalkToDestView headline={headline} destName={currentLeg.end.name} remain={walkRemain(location, currentLeg.end)} pattern={pattern} onReplay={replay}>
          {walkGuidance ? walkGuidance({ leg: currentLeg, onLegEnd: nav.completeWalk, busy }) : null}
        </WalkToDestView>
      ) : null}

      {/* TODO(임시 대체 수단): 목적지 좌표가 없거나 GPS 자동 도착 판정(useDestinationArrival)이 안 될 때를 위한 수동 버튼.
          누르면 자동 판정과 같은 completeWalk를 호출한다 */}
      {uiState === 'WALK_TO_DEST' ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={ARRIVED_BUTTON.label}
          accessibilityHint={ARRIVED_BUTTON.hint}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={nav.completeWalk}
          style={[styles.nearAlightBtn, { backgroundColor: t.primary, opacity: busy ? 0.6 : 1 }]}
        >
          <Icon name="check" size={28} color={t.onPrimary} sw={2.6} />
          <Text style={[styles.nearAlightText, { color: t.onPrimary }]}>{ARRIVED_BUTTON.label}</Text>
        </TouchableOpacity>
      ) : null}

      {/* "곧 내려요": 버스 이동 중 누르면 하차 확인(ALIGHTING_CONFIRM)으로 전이.
          GPS 자동 전이(useAlightGuidance)가 실패할 때를 위한 대체 수단이라 항상 유지한다 */}
      {uiState === 'ON_BUS' ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={NEAR_ALIGHT_BUTTON.label}
          accessibilityHint={NEAR_ALIGHT_BUTTON.hint}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={nav.notifyNearAlightStop}
          style={[styles.nearAlightBtn, { borderColor: t.primary, backgroundColor: t.surface, borderWidth: Math.max(t.borderW, 2.5), opacity: busy ? 0.6 : 1 }]}
        >
          <Icon name="bell" size={28} color={t.primary} sw={2.6} />
          <Text style={[styles.nearAlightText, { color: t.primary }]}>{NEAR_ALIGHT_BUTTON.label}</Text>
        </TouchableOpacity>
      ) : null}

      {/* 정류장 대기: 도착 정보 조회/안내 (상태를 벗어나면 언마운트되어 폴링 중단) */}
      {uiState === 'WAITING_AT_STOP' && currentLeg?.mode === 'BUS' ? (
        <WaitingAtStopScreen stopName={stopName(currentLeg.start.name)} stopId={currentLeg.stopId ?? null} enabled routeName={currentLeg.routeName} onBusArriving={nav.notifyBusArriving} />
      ) : null}

      {/* 지하철: 도착정보가 없어 조회/폴링하지 않는다. 하단 확인 바의 "탑승했어요" 버튼이 정식 진입 경로 */}
      {uiState === 'WAITING_AT_STOP' && currentLeg?.mode === 'SUBWAY' ? (
        <Card pad={18}>
          <Text accessible accessibilityRole="header" style={[styles.text, { color: t.text }]}>{stopName(currentLeg.start.name)}</Text>
          <Text style={[styles.text, { color: t.text }]}>{buildGuidance(uiState, session)}</Text>
        </Card>
      ) : null}

      {/* 개발 확인용: 추후 TAGO/GPS가 호출할 이벤트와 도보 종료를 수동으로 트리거 / DEV only: manually trigger future TAGO/GPS events and walk end */}
      {__DEV__ ? (
        <Card pad={12} style={styles.devCard}>
          <Text style={[styles.devTitle, { color: t.textDim }]}>DEV 디버그</Text>
          <View style={styles.devRow}>
            {[
              { label: '버스 도착 알림', onPress: nav.notifyBusArriving },
              { label: '하차 접근 알림', onPress: nav.notifyNearAlightStop },
              { label: '도보 완료', onPress: nav.completeWalk },
            ].map((b) => (
              <TouchableOpacity key={b.label} onPress={b.onPress} disabled={busy} style={[styles.devBtn, { borderColor: t.border }]}>
                <Text style={[styles.devBtnText, { color: t.text }]}>{b.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingTop: 4, gap: 16 },
  text: { fontSize: 22, fontWeight: '800' },
  nearAlightBtn: { minHeight: 72, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 },
  nearAlightText: { fontSize: 26, fontWeight: '900' },
  devCard: { gap: 8 },
  devTitle: { fontSize: 13, fontWeight: '800' },
  devRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  devBtn: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  devBtnText: { fontSize: 14, fontWeight: '700' },
});
