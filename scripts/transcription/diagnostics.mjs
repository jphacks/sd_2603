const LOCAL_REASONS = new Map([
  ['STT final timeout', 'final_timeout'],
  ['STT ended without a completed utterance', 'incomplete_utterance'],
  ['STT audio buffer limit', 'buffer_limit'],
  ['Invalid PCM frame', 'invalid_pcm'],
  ['Transcription upstream failed', 'upstream_error_part'],
]);

const safeLabel = value => typeof value === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(value) ? value : undefined;

/** Keep diagnostics structural: never include error messages, audio, transcript or URLs. */
export function classifyAudioFailure(error, stage, state = {}) {
  const status = Number(error?.statusCode ?? error?.status);
  return {
    stage,
    errorName: safeLabel(error?.name) ?? 'UnknownError',
    ...(safeLabel(error?.code) ? { code: safeLabel(error.code) } : {}),
    ...(Number.isInteger(status) && status >= 100 && status <= 599 ? { status } : {}),
    ...(LOCAL_REASONS.has(error?.message) ? { reason: LOCAL_REASONS.get(error.message) } : {}),
    ...state,
  };
}
