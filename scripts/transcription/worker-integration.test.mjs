import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
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

async function setup(transcripts, action = 'WAIT', remote = false) {
  const directory = await mkdtemp(join(tmpdir(), 'meeting-worker-test-'));
  await mkdir(join(directory, '.recall/bots'), { recursive: true });
  await writeFile(join(directory, `.recall/bots/${botId}.json`), JSON.stringify({ id: botId, agenda: 'Synthetic integration agenda' }));
  await writeFile(join(directory, '.recall/bots/meeting-b.json'), JSON.stringify({ id: 'meeting-b', agenda: 'Meeting B agenda' }));
  await writeFile(join(directory, '.recall/current.json'), JSON.stringify({ id: botId, agenda: 'Synthetic integration agenda', audioEnabled: true, createdAt: new Date().toISOString() }));
  if (remote) await rm(join(directory, '.recall'), { recursive: true, force: true });
  const requests = [];
  const requestTimes = [];
  const recommendationIds = [];
  let agendaSnapshot;
  const control = createServer((request, response) => {
    if (request.url !== '/api/recall/video' || request.headers.authorization !== `Bearer ${controlToken}`) { response.writeHead(401); response.end(); return; }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      const input = JSON.parse(body);
      requests.push(input);
      requestTimes.push(Date.now());
      const recommendationId = input.mode === 'evaluate' ? randomUUID() : undefined;
      if (recommendationId) recommendationIds.push(recommendationId);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(input.mode === 'agenda' ? agendaSnapshot ?? { agenda: input.agenda, agendaVersion: 'test-v1' } : input.mode === 'idle' ? { video: 'idle' }
        : { action, reason: 'Discussion appears off agenda', message: null, ...(recommendationId ? { recommendationId } : {}), ...(input.mode === 'display' ? { video: 'off_agenda' } : {}) }));
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
      RECALL_AUDIO_BRIDGE_MODE: remote ? 'true' : 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  worker.stdout.on('data', chunk => { output += chunk; });
  worker.stderr.on('data', chunk => { output += chunk; });
  let socket;
  const extraSockets = [];
  const cleanup = async () => {
    socket?.terminate();
    for (const extra of extraSockets) extra.terminate();
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
    if (remote) {
      const response = await fetch(`http://127.0.0.1:${audioPort}/sessions`, { method: 'POST', headers: { Authorization: `Bearer ${audioToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: botId, agenda: 'Remote staging agenda' }) });
      assert.equal(response.status, 200);
    }
    socket = new WebSocket(`ws://127.0.0.1:${audioPort}/recall/audio/?token=${audioToken}`);
    socket.on('error', () => {});
    await once(socket, 'open');
    const push = pcm => socket.send(JSON.stringify({ event: 'audio_mixed_raw.data', data: { bot: { id: botId }, data: { buffer: pcm.toString('base64') } } }));
    return { async connectBot(id) {
      const ws = new WebSocket(`ws://127.0.0.1:${audioPort}/recall/audio/?token=${audioToken}`);
      ws.on('error', () => {}); extraSockets.push(ws); await once(ws, 'open');
      return { socket: ws, utterance() { for (const pcm of [voiced, silent, silent, silent, silent, silent, silent]) ws.send(JSON.stringify({ event: 'audio_mixed_raw.data', data: { bot: { id }, data: { buffer: pcm.toString('base64') } } })); } };
    }, requests, requestTimes, recommendationIds, socket, setAgenda(value) { agendaSnapshot = value; }, output: () => output, utterance() { push(voiced); for (let i = 0; i < 6; i++) push(silent); }, cleanup };
  } catch (error) { await cleanup(); throw error; }
}

test('staging-registered bot reaches evaluation through real worker without any local session file', { timeout: 15000 }, async () => {
  const trial = await setup(['remote transcript'], 'WAIT', true);
  try {
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'evaluate'), 'Remote session did not reach evaluation');
    assert.equal(trial.requests[0].agenda, 'Remote staging agenda');
    assert.deepEqual(trial.requests[1].transcript, ['remote transcript']);
  } finally { await trial.cleanup(); }
});

test('real worker routes Recall PCM through SDK final and quiet gate to local WAIT API', { timeout: 15000 }, async () => {
  const trial = await setup(['synthetic first utterance']);
  try {
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'evaluate') || trial.socket.readyState !== WebSocket.OPEN, 'No WAIT evaluation after final');
    assert.deepEqual(trial.requests.map(request => request.mode), ['agenda', 'evaluate'], trial.output());
    assert.deepEqual(trial.requests[1].transcript, ['synthetic first utterance']);
    assert.equal(trial.requests[1].agendaVersion, 'test-v1');
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
    await waitFor(() => trial.requests.some(request => request.mode === 'evaluate') || trial.socket.readyState !== WebSocket.OPEN, 'No WAIT evaluation after the second utterance');
    assert.equal(trial.requests.length, 2, trial.output());
    assert.deepEqual(trial.requests[1].transcript, ['synthetic after empty']);
    assert.equal(trial.output().includes('Audio processing stopped'), false);
  } finally { await trial.cleanup(); }
});

test('real worker confirms off-agenda on new finals then automatically restores idle without another evaluation', { timeout: 35000 }, async () => {
  const trial = await setup(['synthetic first detour', 'synthetic continuing detour'], 'INTERVENE');
  try {
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'evaluate') || trial.socket.readyState !== WebSocket.OPEN, 'No first off-agenda recommendation');
    assert.deepEqual(trial.requests.map(request => request.mode), ['agenda', 'evaluate']);
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'idle') || trial.socket.readyState !== WebSocket.OPEN,
      'No automatic idle after the intervention', 23000);
    assert.deepEqual(trial.requests.map(request => request.mode), ['agenda', 'evaluate', 'agenda', 'evaluate', 'display', 'idle'], trial.output());
    const [firstEvaluation, secondEvaluation] = trial.requests.flatMap((request, index) => request.mode === 'evaluate' ? [trial.requestTimes[index]] : []);
    // Server-observed timestamps allow 100ms for loopback transport/scheduling;
    // the production gate's ten-second interval is not overridden in this test.
    assert.ok(secondEvaluation - firstEvaluation >= 9900, 'new finals must respect the ten-second evaluation cadence');
    assert.ok(secondEvaluation - firstEvaluation < 20000, 'confirmation must arrive within the twenty-second vote lifetime');
    const displayIndex = trial.requests.findIndex(request => request.mode === 'display');
    assert.equal(trial.requests[displayIndex].recommendationId, trial.recommendationIds[1], 'display forwards the latest server recommendation token');
    assert.match(trial.requests[displayIndex].recommendationId, /^[0-9a-f-]{36}$/);
    assert.ok(trial.requestTimes.at(-1) - trial.requestTimes[displayIndex] >= 7900, 'idle restoration waits eight seconds after display');
    assert.equal(trial.requests.at(-1).botId, botId);
    assert.equal(trial.socket.readyState, WebSocket.OPEN, trial.output());
    assert.equal(trial.output().includes('Audio processing stopped'), false);
  } finally { await trial.cleanup(); }
});

test('real worker refreshes agenda and cannot confirm the old agenda recommendation', { timeout: 40000 }, async () => {
  const trial = await setup(['old agenda detour', 'new agenda first detour', 'new agenda continuing detour'], 'INTERVENE');
  try {
    trial.utterance();
    await waitFor(() => trial.requests.filter(request => request.mode === 'evaluate').length === 1, 'No old agenda evaluation');
    trial.setAgenda({ agenda: 'Updated integration agenda', agendaVersion: 'test-v2' });
    trial.utterance();
    await waitFor(() => trial.requests.filter(request => request.mode === 'evaluate').length === 2, 'No new agenda evaluation', 13000);
    assert.equal(trial.requests.some(request => request.mode === 'display'), false);
    trial.utterance();
    await waitFor(() => trial.requests.some(request => request.mode === 'display'), 'No new agenda confirmation', 13000);
    const display = trial.requests.find(request => request.mode === 'display');
    assert.equal(display.agenda, 'Updated integration agenda');
    assert.equal(display.agendaVersion, 'test-v2');
    assert.equal(display.recommendationId, trial.recommendationIds[2], 'old-agenda tokens cannot supply the confirmed display');
    const evaluationTimes = trial.requests.flatMap((request, index) => request.mode === 'evaluate' ? [trial.requestTimes[index]] : []);
    for (let i = 1; i < evaluationTimes.length; i++) assert.ok(evaluationTimes[i] - evaluationTimes[i - 1] >= 9900, 'agenda changes do not bypass the evaluation cadence');
    assert.equal(trial.socket.readyState, WebSocket.OPEN, trial.output());
  } finally { await trial.cleanup(); }
});


test('two simultaneous audio meetings keep separate agendas and transcripts; one failure leaves the other running', { timeout: 15000 }, async () => {
  const trial = await setup(['only meeting A', 'only meeting B']);
  try {
    const b = await trial.connectBot('meeting-b');
    trial.utterance();
    await waitFor(() => trial.requests.some(input => input.mode === 'evaluate' && input.botId === botId), 'Missing meeting A evaluation');
    trial.socket.send('invalid JSON');
    await once(trial.socket, 'close');
    b.utterance();
    await waitFor(() => trial.requests.some(input => input.mode === 'evaluate' && input.botId === 'meeting-b'), 'Meeting B stopped after meeting A failure');
    const evaluations = trial.requests.filter(input => input.mode === 'evaluate');
    assert.equal(evaluations.length, 2);
    assert.deepEqual(evaluations[0].transcript, ['only meeting A']);
    assert.deepEqual(evaluations[1].transcript, ['only meeting B']);
    assert.equal(evaluations[0].agenda, 'Synthetic integration agenda');
    assert.equal(evaluations[1].agenda, 'Meeting B agenda');
    assert.equal(b.socket.readyState, WebSocket.OPEN);
  } finally { await trial.cleanup(); }
});
