import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { WebSocketServer } from 'ws';
import { createResampler, readRecallAudio, recordingConfig } from './transcription/audio.mjs';
import { createMeetingPipeline, transcribeTurn } from './transcription/pipeline.mjs';

// Never evaluate downloaded settings as shell code. Existing env wins.
for (const file of ['.env.local', '.env', '.env.download', 'env.download']) {
  if (existsSync(file)) loadEnvFile(file);
}
const env = process.env;
const agenda = env.MEETING_AGENDA?.trim();
let botId = env.RECALL_BOT_ID?.trim();
const joinUrl = process.argv[2] === '--join' ? process.argv[3] : undefined;
let ownedBot = false;
const token = env.RECALL_AUDIO_TOKEN;
const port = Number(env.RECALL_AUDIO_PORT ?? 8787);
const provider = env.AI_PROVIDER ?? 'mock';
if (process.argv.includes('--recording-config')) {
  // Contains the receiver secret; redirect this output to an ignored local file.
  console.log(JSON.stringify(recordingConfig(env.RECALL_AUDIO_PUBLIC_URL, token), null, 2));
  process.exit(0);
}
if (!agenda || agenda.length > 500 || (!botId && !joinUrl && !env.TRANSCRIPTION_INGEST_URL) || !token || token.length < 32 || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Set MEETING_AGENDA (1–500 characters), RECALL_BOT_ID, RECALL_AUDIO_TOKEN (32+ characters), and a valid RECALL_AUDIO_PORT');
}
if (!['mock', 'jev'].includes(provider)) throw new Error('AI_PROVIDER must be mock or jev');
if (env.ALLOW_PAID_AI !== 'true' || env.ENABLE_REALTIME_TRANSCRIPTION !== 'true' || !env.AI_GATEWAY_API_KEY) {
  throw new Error('Transcription requires ENABLE_REALTIME_TRANSCRIPTION=true, ALLOW_PAID_AI=true and AI_GATEWAY_API_KEY');
}

if (joinUrl && (!env.RECALL_API_KEY || !env.RECALL_AUDIO_PUBLIC_URL || !/^https:\/\//.test(joinUrl))) throw new Error('Joining requires an https meeting URL, RECALL_API_KEY and RECALL_AUDIO_PUBLIC_URL');
const recallBase = `https://${env.RECALL_REGION ?? 'ap-northeast-1'}.recall.ai/api/v1`;
if (!['ap-northeast-1', 'us-west-2', 'us-east-1', 'eu-central-1'].includes(env.RECALL_REGION ?? 'ap-northeast-1')) throw new Error('Invalid RECALL_REGION');
async function recallRequest(path, body) {
  const response = await fetch(recallBase + path, {
    method: 'POST',
    headers: { Authorization: `Token ${env.RECALL_API_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Recall HTTP ${response.status}`);
  return response.status === 204 ? null : response.json();
}
if (env.TRANSCRIPTION_INGEST_URL) {
  const target = new URL(env.TRANSCRIPTION_INGEST_URL);
  if (target.username || target.password || (target.protocol !== 'https:' && !(target.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(target.hostname)))) throw new Error('Ingest URL must use HTTPS or localhost HTTP');
}
const pipeline = createMeetingPipeline({ agenda, provider, onResult: (result) => console.log(JSON.stringify(result)) });
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ status: request.url === '/health' ? 'ok' : 'not_found' }));
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 128000 });
let active;
let cancelActive = () => {};
let shuttingDown = false;
let halted = false;
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url, 'http://localhost');
  const actual = Buffer.from(url.searchParams.get('token') ?? '');
  const expected = Buffer.from(token);
  if (shuttingDown || halted || active || url.pathname !== '/recall/audio/' || actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => { active = ws; wss.emit('connection', ws); });
});
wss.on('connection', (socket) => {
  const resample = createResampler();
  let sessionBotId = botId;
  let pendingStart = null;
  let packets = [];
  let bytes = 0;
  let queued = 0;
  let sequence = Promise.resolve();
  let failed = false;
  const abort = new AbortController();
  cancelActive = () => { failed = true; abort.abort(); };
  const reportFailure = () => {
    if (failed) return;
    failed = true;
    halted = true;
    abort.abort();
    console.error('Audio pipeline stopped. Check Gateway access, limits and Recall payload. No automatic paid retry was attempted.');
    socket.close(1011, 'Audio processing failed');
  };
  const flush = () => {
    if (!bytes || failed || shuttingDown) return;
    const pcm = Buffer.concat(packets);
    const start = pendingStart ?? Date.now() / 1000;
    pendingStart = null;
    packets = []; bytes = 0;
    // Silence-only turns often produce invented text; skip near-silent audio.
    let energy = 0;
    for (let i = 0; i < pcm.length; i += 2) energy += pcm.readInt16LE(i) ** 2;
    if (Math.sqrt(energy / (pcm.length / 2)) < 30) return;
    if (++queued > 3) { reportFailure(); return; }
    sequence = sequence.then(async () => {
      if (failed) return;
      const text = await transcribeTurn(resample(pcm), {
        apiKey: env.AI_GATEWAY_API_KEY,
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(30000)]),
      });
      if (!failed && text) {
        if (env.TRANSCRIPTION_INGEST_URL) {
          const response = await fetch(env.TRANSCRIPTION_INGEST_URL, {
            method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ botId: sessionBotId, text, start }),
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('Could not deliver confirmed transcript');
        } else await pipeline(text);
      }
    }).catch(reportFailure).finally(() => { queued--; });
  };
  socket.on('message', (message, binary) => {
    try {
      if (binary) throw new Error('Expected Recall JSON');
      const raw = message.toString();
      // A connection possessing the receiver secret may select one bot, then stays pinned.
      if (!sessionBotId) {
        const payload = JSON.parse(raw);
        if (payload.event !== 'audio_mixed_raw.data') return;
        sessionBotId = payload.data?.bot?.id;
        if (typeof sessionBotId !== 'string' || !sessionBotId) throw new Error('Missing bot id');
      }
      const pcm = readRecallAudio(raw, sessionBotId);
      if (!pcm?.length || failed) return;
      if (!bytes) pendingStart = JSON.parse(raw).data?.data?.timestamp?.relative ?? Date.now() / 1000;
      packets.push(pcm); bytes += pcm.length;
      // Five seconds of 16 kHz PCM. Serialized turns preserve transcript order.
      if (bytes >= 160000) flush();
    } catch { reportFailure(); }
  });
  socket.on('error', reportFailure);
  socket.on('close', () => {
    flush();
    void sequence.finally(() => { if (active === socket) active = undefined; });
  });
  const ping = setInterval(() => { if (socket.readyState === socket.OPEN) socket.ping(); }, 25000);
  socket.once('close', () => clearInterval(ping));
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
console.log(`Recall audio receiver listening on 127.0.0.1:${port}; provider=${provider}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  cancelActive();
  if (ownedBot && botId) void recallRequest(`/bot/${botId}/leave_call/`).then(() => rm('.recall/transcription.json', { force: true })).catch(() => console.error('Recall leave failed; leave the bot manually using its saved id.'));
  active?.close(1000, 'Receiver stopping');
  server.close();
  setTimeout(() => { wss.clients.forEach((socket) => socket.terminate()); process.exit(0); }, 16000).unref();
});

if (joinUrl) {
  try {
    if (existsSync('.recall/transcription.json')) throw new Error('Previous transcription bot state exists; leave that bot and remove the state before joining again');
    const config = recordingConfig(env.RECALL_AUDIO_PUBLIC_URL, token);
    const bot = await recallRequest('/bot/', { meeting_url: joinUrl, bot_name: 'MTG Lab', recording_config: config, automatic_leave: { waiting_room_timeout: 540, noone_joined_timeout: 300 } });
    botId = bot.id;
    if (!botId) throw new Error('Recall did not return a bot id');
    ownedBot = true;
    if (shuttingDown) { await recallRequest(`/bot/${botId}/leave_call/`); process.exit(0); }
    await mkdir('.recall', { recursive: true });
    await writeFile('.recall/transcription.json', JSON.stringify({ id: botId, region: env.RECALL_REGION ?? 'ap-northeast-1' }), { mode: 0o600 });
    console.log(`Bot created: ${botId}. Admit MTG Lab in the meeting. Ctrl+C requests leave.`);
  } catch {
    if (ownedBot && botId) await recallRequest(`/bot/${botId}/leave_call/`).catch(() => console.error(`Manual Recall leave required for bot ${botId}`));
    console.error('Could not create or save Recall bot. Check Recall configuration and .recall/transcription.json.');
    server.close();
    process.exitCode = 1;
  }
}
