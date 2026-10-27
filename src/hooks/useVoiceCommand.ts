// hooks/useVoiceCommand.ts — 화면별 허용 명령만 듣는 음성 명령 훅: useVoiceCommand(screen, handlers)
// Voice commands limited to the screen's allow-list; commands without a handler on this screen are ignored
import { useCallback, useRef } from 'react';
import { useVoiceInput } from './useVoiceInput';
import { parseYesNoIntent } from '../transit/confirmIntent';
import { parseVoiceCommand, type VoiceCommand, type VoiceCommandType, type VoiceScreen } from '../transit/voiceCommand';
import { VOICE } from '../transit/voiceMessages';

export type VoiceHandlers = {
  [K in VoiceCommandType]?: (cmd: Extract<VoiceCommand, { type: K }>) => void | Promise<void>;
};

export function useVoiceCommand(screen: VoiceScreen, handlers: VoiceHandlers) {
  const input = useVoiceInput();
  const { ask } = input;
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // 비동기 청취 중에도 최신 상태를 보는 핸들러를 부른다 / always call the latest handlers

  // prompt를 읽고 명령 한 번 듣기. accept로 추가 조건(예: 결과 개수 범위)을 걸 수 있다 / speak prompt, listen for one command; accept adds extra checks
  const start = useCallback(async (prompt: string, accept?: (cmd: VoiceCommand) => boolean) => {
    const result = await ask<VoiceCommand>({
      prompt,
      parse: (text) => {
        const cmd = parseVoiceCommand(screen, text);
        if (!cmd || !handlersRef.current[cmd.type]) return null;
        return accept && !accept(cmd) ? null : cmd;
      },
      retryPrompt: VOICE.retry,
      failPrompt: VOICE.commandFailed,
    });
    if (result.status !== 'ok') return result.status;
    const handler = handlersRef.current[result.value.type] as ((cmd: VoiceCommand) => void | Promise<void>) | undefined;
    await handler?.(result.value);
    return 'ok' as const;
  }, [ask, screen]);

  // 예/아니오 재확인. 대답을 못 들었거나 중단되면 null (= 실행하지 않음) / yes-no; null when unanswered or cancelled (= do not proceed)
  const confirm = useCallback(async (prompt: string): Promise<'YES' | 'NO' | null> => {
    const result = await ask<'YES' | 'NO'>({
      prompt,
      parse: (text) => { const i = parseYesNoIntent(text); return i === 'UNKNOWN' ? null : i; },
      retryPrompt: VOICE.confirmRetry,
      failPrompt: VOICE.confirmFailed,
    });
    return result.status === 'ok' ? result.value : null;
  }, [ask]);

  return { ...input, start, confirm };
}

export type VoiceCommandApi = ReturnType<typeof useVoiceCommand>;
