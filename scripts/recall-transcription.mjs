import { createServer } from 'node:http';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { audioJoinTimedOut, readRecallAudio } from './transcription/audio.mjs';
import { createInterventionGate, isVoicedPcm, streamMeetingAudio } from './transcription/pipeline.mjs';
import { createSegmentedTranscriber } from './transcription/segments.mjs';
import { classifyAudioFailure } from './transcription/diagnostics.mjs';
import { createRecallAudioCapture } from './transcription/capture.mjs';
import { assertStreamingRuntime } from './transcription/runtime.mjs';

export async function startAudioWorker({ env = process.env, transcribeAudio = streamMeetingAudio, sessionReader, handleSignals = true } = {}) {
assertStreamingRuntime();
const token = env.RECALL_AUDIO_TOKEN;
const controlToken = env.RECALL_CONTROL_TOKEN;
const port = Number(env.RECALL_AUDIO_PORT ?? 8787);
const controlUrl = new URL(env.VIDEO_CONTROL_URL ?? 'http://127.0.0.1:3000/api/recall/video');
if (env.ENABLE_REALTIME_TRANSCRIPTION !== 'true' || env.AI_PROVIDER !== 'jev' || env.ALLOW_PAID_AI !== 'true' || !env.AI_GATEWAY_API_KEY || !token || token.length < 32 || !controlToken || controlToken.length < 32 || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Audio worker requires paid-AI opt-in, Gateway key, control token, audio token, and valid port');
}
if (controlUrl.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(controlUrl.hostname) || controlUrl.pathname !== '/api/recall/video' || controlUrl.username || controlUrl.password) {
  throw new Error('VIDEO_CONTROL_URL must be the local /api/recall/video endpoint');
}

async function readSession(id) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const state = JSON.parse(await readFile('.recall/current.json', 'utf8'));
      if (state.id === id && typeof state.agenda === 'string' && state.agenda.trim() && state.agenda.length <= 500) return state;
    } catch { /* Bot creation may not have written state yet. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Audio connection does not belong to the current bot');
}

async function videoRequest(body, signal) {
  const response = await fetch(controlUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${controlToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (body.mode === 'display' && response.status === 409) return { cancelled: true };
  if (!response.ok) throw new Error(`Video control HTTP ${response.status}`);
  return response.json();
}

let active;
let activeGate;
let activeBotId;
let halted = false;
const server = createServer((request, response) => {
  if (request.url === '/health') {
    const healthy = !halted && !active;
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ status: healthy ? 'ready' : 'unavailable' }));
    return;
  }
  if (request.url === '/quiet' && request.method === 'POST') {
    const actual = Buffer.from(request.headers.authorization?.match(/^Bearer ([^ ]+)$/)?.[1] ?? '');
    const expected = Buffer.from(token);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) { response.writeHead(401); response.end(); return; }
    let body = '';
    request.on('data', chunk => { body += chunk; if (body.length > 1000) request.destroy(); });
    request.on('end', () => {
      try {
        const { botId, generation } = JSON.parse(body);
        const quiet = !halted && activeBotId === botId && activeGate?.isQuiet(generation);
        response.writeHead(quiet ? 200 : 409, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ quiet: Boolean(quiet) }));
      } catch { response.writeHead(400); response.end(); }
    });
    return;
  }
  response.writeHead(404); response.end();
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 128000 });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const actual = Buffer.from(url.searchParams.get('token') ?? '');
  const expected = Buffer.from(token);
  if (halted || active || url.pathname !== '/recall/audio/' || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => { active = ws; wss.emit('connection', ws); });
});

wss.on('connection', socket => {
  const counts = { rawFrames: 0, pcmBytes: 0, voicedFrames: 0, sttDelta: 0, sttPartial: 0, sttFinal: 0, sttSkippedEmpty: 0, evaluations: 0, displayAttempts: 0, idleAttempts: 0 };
  const report = () => console.log(`Audio worker telemetry ${JSON.stringify(counts)}`);
  console.log('Audio worker websocket connected');
  const telemetry = setInterval(report, 10_000);
  telemetry.unref();
  const abort = new AbortController();
  let session;
  let gate;
  let segments;
  let queued = 0;
  let sequence = Promise.resolve();
  let lastNonemptyAudioAt = Date.now();
  let ended = false;
  const capture = createRecallAudioCapture({
    enabled: env.RECALL_AUDIO_DIAGNOSTIC_CAPTURE === 'true',
    onFinish: summary => console.log(`Diagnostic audio saved ${JSON.stringify(summary)}`),
    onError: error => fail(error, 'diagnostic_capture'),
  });
  const fail = (error, stage = 'worker') => {
    if (ended) return;
    const detail = classifyAudioFailure(error, stage, segments?.status);
    ended = true;
    halted = true;
    gate?.stop();
    segments?.stop();
    try { capture?.finish(); } catch (captureError) {
      console.error(`Diagnostic audio close failed ${JSON.stringify(classifyAudioFailure(captureError, 'diagnostic_capture'))}`);
    }
    abort.abort();
    socket.close(1011, 'Audio processing stopped');
    console.error(`Audio processing stopped ${JSON.stringify(detail)}; leave the bot via the app before retrying. No paid retry was attempted.`);
  };
  const silence = setInterval(() => {
    if (!ended && session && Date.now() - lastNonemptyAudioAt > 250) {
      segments?.push(Buffer.alloc(6400));
    }
  }, 200);
  const timeout = setTimeout(() => fail(new Error('Session timeout'), 'session_timeout'), 90 * 60_000);
  const processMessage = async raw => {
    const payload = JSON.parse(raw);
    if (payload.event !== 'audio_mixed_raw.data') return;
    const id = payload.data?.bot?.id;
    if (typeof id !== 'string' || !id) throw new Error('Missing bot id');
    if (!session) {
      session = await (sessionReader ?? readSession)(id);
      gate = createInterventionGate({
        botId: id,
        agenda: session.agenda,
        decide: input => { counts.evaluations++; return videoRequest({ mode: 'evaluate', ...input }); },
        display: ({ botId, agenda, result, generation, signal }) => {
          counts.displayAttempts++;
          return videoRequest({ mode: 'display', botId, agenda, result, generation, requestId: randomUUID() }, signal);
        },
        restoreIdle: ({ botId, signal }) => {
          counts.idleAttempts++;
          return videoRequest({ mode: 'idle', botId }, signal);
        },
        onError: error => fail(error, 'decision'),
      });
      activeGate = gate;
      activeBotId = id;
      segments = createSegmentedTranscriber({
        signal: abort.signal,
        transcribe: (audio, { signal, onPart }) => transcribeAudio(audio, { apiKey: env.AI_GATEWAY_API_KEY, signal, onPart }),
        onPendingChange: value => gate.setPendingAudio(value),
        onPart: part => {
          if (part.type === 'transcript-delta') counts.sttDelta++;
          if (part.type === 'transcript-partial') counts.sttPartial++;
          if (part.type === 'transcript-final') counts.sttFinal++;
          if (part.type === 'transcript-empty') counts.sttSkippedEmpty++;
          gate.onPart(part);
        },
        onError: error => fail(error, 'transcription'),
      });
    }
    if (session.id !== id) throw new Error('Bot changed on audio stream');
    const pcm = readRecallAudio(raw, id);
    if (!pcm?.length) return;
    counts.rawFrames++;
    counts.pcmBytes += pcm.length;
    const voiced = isVoicedPcm(pcm);
    if (voiced) counts.voicedFrames++;
    try { capture?.push(pcm, voiced); } catch (error) { fail(error, 'diagnostic_capture'); return; }
    lastNonemptyAudioAt = Date.now();
    gate.onAudio(pcm);
    segments.push(pcm);
  };
  socket.on('message', (message, binary) => {
    if (binary || ++queued > 50) { fail(new Error('Invalid Recall message'), 'recall_message'); return; }
    sequence = sequence.then(() => processMessage(message.toString())).catch(error => fail(error, 'recall_message')).finally(() => { queued--; });
  });
  socket.on('error', error => fail(error, 'recall_websocket'));
  socket.on('close', () => {
    clearInterval(telemetry);
    report();
    ended = true;
    clearInterval(silence);
    clearTimeout(timeout);
    gate?.stop();
    segments?.stop();
    try { capture?.finish(); } catch (error) {
      console.error(`Diagnostic audio close failed ${JSON.stringify(classifyAudioFailure(error, 'diagnostic_capture'))}`);
    }
    activeGate = undefined;
    activeBotId = undefined;
    abort.abort();
    active = undefined;
    halted = true;
  });
});

await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
console.log(`Recall audio worker ready on 127.0.0.1:${port}. Start the app, then join from the UI.`);
const joinWatchdog = setInterval(async () => {
  if (halted || active) return;
  try {
    const state = JSON.parse(await readFile('.recall/current.json', 'utf8'));
    if (audioJoinTimedOut(state)) {
      halted = true;
      console.error('No audio connection arrived after join; leave the bot via the app before retrying.');
    }
  } catch { /* No active bot state yet. */ }
}, 5_000);
joinWatchdog.unref();
if (handleSignals) for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  halted = true;
  clearInterval(joinWatchdog);
  activeGate?.stop();
  active?.close(1000, 'Worker stopping');
  server.close();
});
return { server, close: async () => {
  halted = true;
  clearInterval(joinWatchdog);
  activeGate?.stop();
  active?.close(1000, 'Worker stopping');
  await new Promise(resolve => server.close(resolve));
} };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  for (const file of ['.env.local', '.env']) if (existsSync(file)) loadEnvFile(file);
  await startAudioWorker();
}
