import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { readPcmWav, pcm16Chunks } from './transcription/wav.mjs';
import { createInterventionGate, isVoicedPcm, streamMeetingAudio } from './transcription/pipeline.mjs';
import { createSegmentedTranscriber } from './transcription/segments.mjs';

const args = process.argv.slice(2);
const live = args.includes('--live');
const accuracy = args.includes('--accuracy');
const path = args.find(arg => !arg.startsWith('--'));
if (!path || args.some(arg => arg.startsWith('--') && arg !== '--live' && arg !== '--accuracy')) {
  throw new Error('Usage: node scripts/replay-segments.mjs <mono-pcm16.wav> [--live] [--accuracy]');
}
const wav = await readPcmWav(path);
if (live) {
  for (const file of ['.env.local', '.env']) if (existsSync(file)) loadEnvFile(file);
  if (process.env.ALLOW_PAID_AI !== 'true' || !process.env.AI_GATEWAY_API_KEY) throw new Error('Live replay requires paid-AI opt-in and Gateway key');
}
const counters = { frames: 0, voicedFrames: 0, segmentsStarted: 0, sttDelta: 0, sttPartial: 0, sttFinal: 0, sttSkippedEmpty: 0, evaluations: 0, finalsBeforeInputEnd: 0 };
const finalTexts = [];
let sourceEnded = false;
let failure;
const gate = createInterventionGate({
  botId: 'wav-replay', agenda: 'WAV replay connectivity check',
  decide: async () => { counters.evaluations++; return { action: 'WAIT' }; },
  display: async () => { throw new Error('WAV replay must not display a camera card'); },
});
const segments = createSegmentedTranscriber({
  transcribe: (audio, { signal, onPart }) => {
    counters.segmentsStarted++;
    if (counters.segmentsStarted > (accuracy ? 6 : 2)) throw new Error('Replay exceeded the STT segment limit');
    if (live) return streamMeetingAudio(audio, { apiKey: process.env.AI_GATEWAY_API_KEY, signal, onPart });
    return (async () => {
      for await (const chunk of audio) { void chunk; /* Consume the same live-input path without an API call. */ }
      onPart({ type: 'transcript-final', text: `synthetic turn ${counters.segmentsStarted}` });
    })();
  },
  onPart: part => {
    if (part.type === 'transcript-delta') counters.sttDelta++;
    if (part.type === 'transcript-partial') counters.sttPartial++;
    if (part.type === 'transcript-empty') counters.sttSkippedEmpty++;
    if (part.type === 'transcript-final') {
      counters.sttFinal++;
      if (accuracy) finalTexts.push(part.text);
      if (!sourceEnded) counters.finalsBeforeInputEnd++;
    }
    gate.onPart(part);
  },
  onPendingChange: value => gate.setPendingAudio(value),
  onError: error => { failure = error; gate.stop(); },
});
const send = async pcm => {
  if (failure) throw failure;
  counters.frames++;
  if (isVoicedPcm(pcm)) counters.voicedFrames++;
  gate.onAudio(pcm);
  segments.push(pcm);
  if (live) await new Promise(resolve => setTimeout(resolve, 200));
};
try {
  for (let turn = 0; turn < (accuracy ? 1 : 2); turn++) {
    for (const pcm of pcm16Chunks(wav)) await send(pcm);
    for (let i = 0; i < 10; i++) await send(Buffer.alloc(6400));
  }
  const deadline = Date.now() + 30_000;
  while ((segments.pending || (!accuracy && counters.sttFinal < 2)) && !failure && Date.now() < deadline) await send(Buffer.alloc(6400));
  sourceEnded = true;
  if (failure) throw failure;
  if (segments.pending) throw new Error('Replay did not finalize within one minute');
  if (accuracy ? counters.sttFinal < 1 : counters.sttFinal !== 2 || counters.finalsBeforeInputEnd !== 2) throw new Error('Replay did not produce the expected finalized utterances');
  console.log(JSON.stringify({ mode: live ? 'live' : 'offline', wavSeconds: wav.pcm.length / (wav.rate * 2), ...counters, ...(accuracy && live ? { finalTexts } : {}) }));
} finally { gate.stop(); segments.stop(); }
