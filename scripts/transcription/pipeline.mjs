import { createGateway, experimental_streamTranscribe as streamTranscribe } from 'ai';

export const MODEL = 'openai/gpt-realtime-whisper';

export async function streamMeetingAudio(audio, { apiKey, signal, onPart, transcribe = streamTranscribe, upstream = createGateway({ apiKey }).transcription(MODEL) }) {
  let finishedEmpty = false;
  let nonemptyFinal = false;
  // Observe the provider's finish before the SDK converts an empty transcript
  // into the same error used for an unexpectedly truncated stream.
  const model = Object.create(upstream, {
    doStream: { value: async options => {
      const result = await upstream.doStream(options);
      return {
        ...result,
        stream: result.stream.pipeThrough(new TransformStream({
          transform(part, controller) {
            if (part.type === 'finish') finishedEmpty = part.text === '';
            controller.enqueue(part);
          },
        })),
      };
    } },
  });
  const result = transcribe({
    model,
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: { openai: { language: 'ja', streaming: { delay: 'low' } } },
    abortSignal: signal,
    maxRetries: 0,
  });
  try {
    for await (const part of result.fullStream) {
      if (part.type === 'error') throw new Error('Transcription upstream failed');
      if (part.type === 'transcript-final') {
        if (!part.text?.trim()) continue;
        nonemptyFinal = true;
      }
      if (part.type === 'transcript-delta' || part.type === 'transcript-partial' || part.type === 'transcript-final') onPart(part);
    }
    return await result.text;
  } catch (error) {
    if (error?.name === 'AI_NoTranscriptGeneratedError' && finishedEmpty && !nonemptyFinal) {
      onPart({ type: 'transcript-empty' });
      return { skippedEmpty: true };
    }
    throw error;
  }
}

export function isVoicedPcm(pcm, threshold = 300) {
  if (!pcm.length || pcm.length % 2) return false;
  let energy = 0;
  for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
  return Math.sqrt(energy / (pcm.length / 2)) >= threshold;
}

/** Final-only transcripts are considered for intervention after a quiet window. */
export function createInterventionGate({ agenda, botId, decide, display, onError = () => {}, now = Date.now, schedule = setTimeout, unschedule = clearTimeout, quietMs = 1500 }) {
  const transcript = [];
  let finalQueue = [];
  let speaking = false;
  let lastVoice = -Infinity;
  let lastIntervention = -Infinity;
  let decisionTimer;
  let speakingTimer;
  let generation = 0;
  let processing = false;
  let stopped = false;
  let hasSpeech = false;
  let partial = '';
  let pendingAudio = false;

  const run = async () => {
    decisionTimer = undefined;
    if (stopped || pendingAudio || speaking || now() - lastVoice < quietMs || !finalQueue.length || !hasSpeech || processing) return;
    processing = true;
    const batch = finalQueue.splice(0);
    const next = [...transcript, ...batch].slice(-30);
    while (next.length > 1 && Buffer.byteLength(JSON.stringify(next)) > 8_000) next.shift();
    const currentGeneration = generation;
    try {
      const result = await decide({ botId, agenda, transcript: next, secondsSinceLastIntervention: Number.isFinite(lastIntervention) ? Math.max(0, (now() - lastIntervention) / 1000) : 60 });
      transcript.splice(0, transcript.length, ...next);
      if (generation === currentGeneration && !finalQueue.length) hasSpeech = false;
      if (result.action === 'INTERVENE' && !pendingAudio && !speaking && generation === currentGeneration && now() - lastVoice >= quietMs) {
        const displayed = await display({ botId, agenda, result, generation: currentGeneration });
        if (!displayed?.cancelled) lastIntervention = now();
      }
    } catch (error) {
      // Never retry an ambiguous display result: duplicate camera changes are worse than one missed intervention.
      stopped = true;
      onError(error);
      throw error;
    } finally {
      processing = false;
      if (finalQueue.length && !stopped) arm();
    }
  };
  const arm = () => {
    if (stopped || pendingAudio || !finalQueue.length || speaking) return;
    if (decisionTimer !== undefined) unschedule(decisionTimer);
    decisionTimer = schedule(() => { void run().catch(() => {}); }, Math.max(0, quietMs - (now() - lastVoice)));
  };
  return {
    setPendingAudio(value) {
      if (stopped) return;
      pendingAudio = Boolean(value);
      if (pendingAudio && decisionTimer !== undefined) { unschedule(decisionTimer); decisionTimer = undefined; }
      if (!pendingAudio) arm();
    },
    onAudio(pcm) {
      if (stopped) return;
      if (isVoicedPcm(pcm)) {
        if (!speaking) generation++;
        speaking = true;
        hasSpeech = true;
        lastVoice = now();
        if (speakingTimer !== undefined) unschedule(speakingTimer);
        if (decisionTimer !== undefined) { unschedule(decisionTimer); decisionTimer = undefined; }
        speakingTimer = schedule(() => { speakingTimer = undefined; speaking = false; arm(); }, quietMs);
      }
    },
    onPart(part) {
      if (stopped) return;
      if (part.type === 'transcript-delta') { partial += part.delta ?? ''; partial = partial.slice(-1000); return; }
      if (part.type === 'transcript-partial') { partial = (part.text ?? '').slice(-1000); return; }
      if (part.type !== 'transcript-final') return;
      partial = '';
      const text = part.text?.trim();
      if (!text || !hasSpeech) return;
      finalQueue.push(text.slice(0, 1000));
      if (finalQueue.length > 30) finalQueue = finalQueue.slice(-30);
      arm();
    },
    get stopped() { return stopped; },
    get transcript() { return [...transcript]; },
    get partial() { return partial; },
    isQuiet(value) { return !stopped && !pendingAudio && !speaking && generation === value && now() - lastVoice >= quietMs; },
    stop() {
      stopped = true;
      if (decisionTimer !== undefined) unschedule(decisionTimer);
      if (speakingTimer !== undefined) unschedule(speakingTimer);
    },
  };
}
