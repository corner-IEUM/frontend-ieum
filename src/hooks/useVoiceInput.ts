// hooks/useVoiceInput.ts — 화면에서 "한 번 묻고 듣기"를 쓰는 훅. expoSttAdapter 재사용, 안내 TTS가 끝난 뒤에 청취, 긴급 안내가 나오면 청취 중단
// Hook for one-shot voice questions; reuses expoSttAdapter, listens after TTS, cancels on urgent speech
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useAppActive } from './useAppActive';
import { announceText, whenAnnouncementDone } from '../transit/feedback';
import { expoSttAdapter } from '../transit/expoSttAdapter';
import { createVoiceInput, type AskOptions, type VoiceInputResult } from '../transit/voiceInput';
import { isUrgentSpeaking, onUrgentSpeech, stopSpeaking } from '../tts';

export function useVoiceInput() {
  const flow = useMemo(() => createVoiceInput({
    stt: expoSttAdapter,
    announce: (text) => announceText(text, false),
    waitForAnnouncement: whenAnnouncementDone,
    canListen: () => !isUrgentSpeaking(),
  }), []);

  // Expo Go 등 네이티브 모듈이 없으면 false → 음성 UI를 숨긴다 / false without the native module (Expo Go) → hide voice UI
  const [available] = useState(() => expoSttAdapter.isAvailable?.() ?? false);
  const [listening, setListening] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const runIdRef = useRef(0);
  const mountedRef = useRef(true);
  const appActive = useAppActive();

  const cancel = useCallback(() => {
    runIdRef.current++;
    flow.cancel();
    if (mountedRef.current) setListening(false);
  }, [flow]);

  const ask = useCallback(async <T,>(opts: AskOptions<T>): Promise<VoiceInputResult<T>> => {
    const id = ++runIdRef.current;
    setListening(true);
    try {
      const result = await flow.ask(opts);
      if (mountedRef.current && result.status !== 'cancelled') setPermissionDenied(result.status === 'denied');
      return result;
    } finally {
      if (mountedRef.current && id === runIdRef.current) setListening(false);
    }
  }, [flow]);

  // 마이크 토글: 듣는 중이면 청취와 안내 음성을 멈춘다 / toggle: stop listening and speech when already listening
  const stop = useCallback(() => { cancel(); stopSpeaking(); }, [cancel]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; flow.cancel(); };      // 화면 이탈 시 청취 중단 / stop on unmount
  }, [flow]);
  useEffect(() => onUrgentSpeech(() => flow.cancel()), [flow]);       // 긴급 안내가 시작되면 청취 금지 / urgent speech cancels listening
  useEffect(() => { if (!appActive) cancel(); }, [appActive, cancel]); // 백그라운드에서는 마이크를 끈다 / mic off in background

  const openSettings = useCallback(() => { Linking.openSettings().catch(() => {}); }, []);

  return { available, listening, permissionDenied, ask, cancel, stop, openSettings };
}
