import { createGateway, experimental_streamTranscribe as streamTranscribe } from 'ai';
import { mockJudge } from '../../lib/judge/mock.ts';
import { jevJudge } from '../../lib/judge/jev.ts';

export const MODEL = 'openai/gpt-realtime-whisper';

/** One bounded audio turn. Closing the stream commits the turn for Whisper. */
export async function transcribeTurn(pcm, { apiKey, signal, transcribe = streamTranscribe } = {}) {
  const result = transcribe({
    model: createGateway({ apiKey }).transcription(MODEL),
    audio: new ReadableStream({ start(controller) { controller.enqueue(pcm); controller.close(); } }),
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    abortSignal: signal,
  });
  // Consume errors explicitly; do not emit partial text as a confirmed utterance.
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw new Error('Transcription upstream failed');
  }
  return (await result.text).trim();
}

export function createMeetingPipeline({ agenda, provider = 'mock', now = Date.now, decide, onResult = () => {} }) {
  const transcript = [];
  let lastIntervention = -Infinity;
  const judge = decide ?? (provider === 'jev' ? jevJudge : mockJudge);
  return async (text) => {
    if (!text.trim()) return;
    // Split long turns rather than silently truncating the conversation.
    for (let offset = 0; offset < text.length; offset += 1000) transcript.push(text.slice(offset, offset + 1000));
    transcript.splice(0, Math.max(0, transcript.length - 30));
    const result = await judge({ agenda, transcript: [...transcript], secondsSinceLastIntervention: Number.isFinite(lastIntervention) ? (now() - lastIntervention) / 1000 : 60 });
    if (result.action === 'INTERVENE') lastIntervention = now();
    onResult({ transcript: text, judge: result });
    return result;
  };
}
