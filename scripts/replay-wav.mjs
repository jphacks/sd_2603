import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { readPcmWav, pcm24Chunks } from './transcription/wav.mjs';
import { createInterventionGate, isVoicedPcm, streamMeetingAudio } from './transcription/pipeline.mjs';

const args = process.argv.slice(2);
const live = args.includes('--live');
const path = args.find(arg => !arg.startsWith('--'));
if (!path || args.some(arg => arg.startsWith('--') && arg !== '--live')) {
  throw new Error('Usage: node scripts/replay-wav.mjs <mono-pcm16.wav> [--live]');
}
const wav = await readPcmWav(path);
const counters = { sourceFrames: 0, sourceBytes: 0, voicedFrames: 0, gatewayBytes: 0, sttDelta: 0, sttPartial: 0, sttFinal: 0, evaluations: 0 };
let firstFinalExcerpt;
if (!live) {
  for (const { source, pcm24 } of pcm24Chunks(wav)) {
    counters.sourceFrames++;
    counters.sourceBytes += source.length;
    counters.gatewayBytes += pcm24.length;
    if (isVoicedPcm(source)) counters.voicedFrames++;
  }
  console.log(JSON.stringify({ mode: 'offline', seconds: wav.pcm.length / (wav.rate * 2), rate: wav.rate, ...counters }));
} else {
  for (const file of ['.env.local', '.env']) if (existsSync(file)) loadEnvFile(file);
  if (process.env.ALLOW_PAID_AI !== 'true' || !process.env.AI_GATEWAY_API_KEY) {
    throw new Error('Live replay requires ALLOW_PAID_AI=true and AI_GATEWAY_API_KEY');
  }
  const gate = createInterventionGate({
    botId: 'wav-replay',
    agenda: 'WAV replay connectivity check',
    decide: async () => { counters.evaluations++; return { action: 'WAIT' }; },
    display: async () => { throw new Error('WAV replay must not display a camera card'); },
  });
  const audio = new ReadableStream({
    async start(controller) {
      try {
        for (const { source, pcm24 } of pcm24Chunks(wav)) {
          counters.sourceFrames++;
          counters.sourceBytes += source.length;
          counters.gatewayBytes += pcm24.length;
          if (isVoicedPcm(source)) counters.voicedFrames++;
          gate.onAudio(source);
          controller.enqueue(new Uint8Array(pcm24));
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        controller.close();
      } catch (error) { controller.error(error); }
    },
  });
  try {
    await streamMeetingAudio(audio, { apiKey: process.env.AI_GATEWAY_API_KEY, onPart: part => {
      if (part.type === 'transcript-delta') counters.sttDelta++;
      if (part.type === 'transcript-partial') counters.sttPartial++;
      if (part.type === 'transcript-final') {
        counters.sttFinal++;
        firstFinalExcerpt ??= part.text?.trim().slice(0, 80);
      }
      gate.onPart(part);
    } });
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(JSON.stringify({ mode: 'live', seconds: wav.pcm.length / (wav.rate * 2), rate: wav.rate, ...counters, firstFinalExcerpt }));
  } finally { gate.stop(); }
}
