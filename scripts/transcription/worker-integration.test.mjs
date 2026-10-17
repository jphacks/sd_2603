import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const workerPath = fileURLToPath(new URL('../recall-transcription.mjs', import.meta.url));
const preloadUrl = new URL('./fixtures/gateway-websocket.mjs', import.meta.url).href;
const botId = '3c33cba4-3a88-4f20-aa53-57f15a6a678b';
const audioToken = 'worker-test-audio-'.repeat(3);
const controlToken = 'worker-test-control-'.repeat(3);
const voiced = Buffer.alloc(6400);
for (let i = 0; i < voiced.length; i += 2) voiced.writeInt16LE(1000, i);
const silent = Buffer.alloc(6400);

async function waitFor(predicate, message, ms = 8000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > ms) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

async function setup(transcripts, action = 'WAIT') {
  const directory = await mkdtemp(join(tmpdir(), 'meeting-worker-test-'));
  await mkdir(join(directory, '.recall'));
  await writeFile(join(directory, '.recall/current.json'), JSON.stringify({ id: botId, agenda: 'Synthetic integration agenda', audioEnabled: true, createdAt: new Date().toISOString() }));
  const requests = [];
  const control = createServer((request, response) => {
    if (request.url !== '/api/recall/video' || request.headers.authorization !== `Bearer ${controlToken}`) { response.writeHead(401); response.end(); return; }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body);
      requests.push(input);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(input.mode === 'idle' ? { video: 'idle' }
        : { action, reason: 'Discussion appears off agenda', message: null, ...(input.mode === 'display' ? { video: 'off_agenda' } : {}) }));
    });
  });
  await new Promise(resolve => control.listen(0, '127.0.0.1', resolve));
  const controlPort = control.address().port;
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const audioPort = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const worker = spawn(process.execPath, ['--import', preloadUrl, workerPath], {
    cwd: directory,
    env: {
      PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir(),
      AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true', ENABLE_REALTIME_TRANSCRIPTION: 'true',
      AI_GATEWAY_API_KEY: 'dummy-worker-test-key', RECALL_AUDIO_TOKEN: audioToken,
      RECALL_CONTROL_TOKEN: controlToken, RECALL_AUDIO_PORT: String(audioPort),
      VIDEO_CONTROL_URL: `http://127.0.0.1:${controlPort}/api/recall/video`,
      TEST_GATEWAY_TRANSCRIPTS: JSON.stringify(transcripts),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  let socket;
  const cleanup = async () => {
    socket?.terminate();
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill('SIGTERM');
      await exited;
    }
    control.closeAllConnections();
    await new Promise(resolve => control.close(resolve));
    await rm(directory, { recursive: true, force: true });
  };
  try {
    await waitFor(() => output.includes('Recall audio worker ready') || worker.exitCode !== null, 'Worker startup timed out');
    assert.equal(worker.exitCode, null, output);
    assert.equal((await fetch(`http://127.0.0.1:${audioPort}/health`)).status, 200);
    socket = new WebSocket(`ws://127.0.0.1:${audioPort}/recall/audio/?token=${audioToken}`);
    socket.on('error', () => {});
    await once(socket, 'open');
    const push = pcm => socket.send(JSON.stringify({ event: 'audio_mixed_raw.data', data: { bot: { id: botId }, data: { buffer: pcm.toString('base64') } } }));
    return { requests, socket, output: () => output, utterance() { push(voiced); for (let i = 0; i < 6; i++) push(silent); }, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

test('real worker routes Recall PCM through SDK final and quiet gate to local WAIT API', { timeout: 15000 }, async () => {
  const trial = await setup(['synthetic first utterance']);
  try {
    trial.utterance();
    await waitFor(() => trial.requests.length === 1 || trial.socket.readyState !== WebSocket.OPEN, 'No WAIT evaluation after final');
    assert.equal(trial.requests.length, 1, trial.output());
    assert.equal(trial.requests[0].mode, 'evaluate');
    assert.deepEqual(trial.requests[0].transcript, ['synthetic first utterance']);
    assert.equal(trial.socket.readyState, WebSocket.OPEN, trial.output());
    assert.equal(trial.output().includes('Audio processing stopped'), false);
  } finally { await trial.cleanup(); }
});

test('empty finish is isolated and next utterance still reaches the local WAIT API', { timeout: 15000 }, async () => {
  const trial = await setup(['', 'synthetic after empty']);
  try {
    trial.utterance();
    await new Promise(resolve => setTimeout(resolve, 1800));
    assert.equal(trial.requests.length, 0);
    assert.equal(trial.socket.readyState, WebSocket.OPEN, trial.output());
    trial.utterance();
    await waitFor(() => trial.requests.length === 1 || trial.socket.readyState !== WebSocket.OPEN, 'No WAIT evaluation after the second utterance');
    assert.equal(trial.requests.length, 1, trial.output());
    assert.deepEqual(trial.requests[0].transcript, ['synthetic after empty']);
    assert.equal(trial.output().includes('Audio processing stopped'), false);
  } finally { await trial.cleanup(); }
});

test('real worker confirms off-agenda on new finals then automatically restores idle without another evaluation', { timeout: 20000 }, async () => {
  const trial = await setup(['synthetic first detour', 'synthetic continuing detour'], 'INTERVENE');
  try {
    trial.utterance();
    await waitFor(() => trial.requests.length === 1 || trial.socket.readyState !== WebSocket.OPEN, 'No first off-agenda recommendation');
    assert.deepEqual(trial.requests.map(request => request.mode), ['evaluate']);
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'idle') || trial.socket.readyState !== WebSocket.OPEN,
      'No automatic idle after the intervention', 14000);
    assert.deepEqual(trial.requests.map(request => request.mode), ['evaluate', 'evaluate', 'display', 'idle'], trial.output());
    assert.equal(trial.requests.at(-1).botId, botId);
    assert.equal(trial.socket.readyState, WebSocket.OPEN, trial.output());
    assert.equal(trial.output().includes('Audio processing stopped'), false);
  } finally { await trial.cleanup(); }
});
