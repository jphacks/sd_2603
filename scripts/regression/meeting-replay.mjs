import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { parsePcmWav, pcm16Chunks } from '../transcription/wav.mjs';

const workerPath = fileURLToPath(new URL('../recall-transcription.mjs', import.meta.url));
const preloadUrl = new URL('../transcription/fixtures/gateway-websocket.mjs', import.meta.url).href;
const botId = '72544a94-d3f3-46de-9fc8-528fd48a252b';
const audioToken = 'offline-replay-audio-'.repeat(3);
const controlToken = 'offline-replay-control-'.repeat(3);
const offAgenda = 'Discussion appears off agenda';
const stalled = 'Discussion appears stalled';
const context = ['リリース日と担当体制を決めます。', '品質確認は来週までに担当者が進めます。'];

// Labels describe the expected application policy under fixed model responses,
// not the correctness of a live speech recognizer or judgment model.
export const replayCases = [
  { id: 'on-agenda', texts: [...context, 'リリース日は金曜日で確定しましょう。'], actions: ['WAIT', 'WAIT', 'WAIT'], expectedDisplays: 0 },
  { id: 'useful-tangent', texts: [...context, '障害時の連絡体制もリリース判断に必要です。'], actions: ['WAIT', 'WAIT', 'SILENCE'], expectedDisplays: 0 },
  { id: 'brief-detour', texts: [...context, '週末はゴルフに行きました。', 'さて、リリース日の確認に戻ります。'], actions: ['WAIT', 'WAIT', 'INTERVENE', 'WAIT'], expectedDisplays: 0 },
  { id: 'sustained-detour', texts: [...context, 'ゴルフ場の予約を相談しましょう。', '次はゴルフ道具の話をしましょう。'], actions: ['WAIT', 'WAIT', 'INTERVENE', 'INTERVENE'], expectedDisplays: 1 },
  { id: 'stalled', texts: [...context, '同じ二案を繰り返していて、決め方が決まりません。'], actions: ['WAIT', 'WAIT', 'INTERVENE'], reason: stalled, expectedDisplays: 1 },
  { id: 'speech-resumes-during-judgment', texts: [...context, '決め方が分からず止まっています。', '追加で条件を説明します。'], actions: ['WAIT', 'WAIT', 'INTERVENE', 'INTERVENE'], reason: stalled, resumeDuringJudgment: true, expectedDisplays: 1 },
];

function syntheticWav() {
  const pcm = Buffer.alloc(6400);
  for (let i = 0; i < pcm.length; i += 2) pcm.writeInt16LE(i % 64 < 32 ? 1000 : -1000, i);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}
const voicedFrames = [...pcm16Chunks(parsePcmWav(syntheticWav()))];
const silence = Buffer.alloc(6400);

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(predicate, message, timeoutMs = 12000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(message);
    await pause(20);
  }
}
async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}

/** Real worker + Recall WebSocket + SDK stream; external providers are mocked. */
export async function runReplayCase(scenario) {
  const directory = await mkdtemp(join(tmpdir(), 'meeting-replay-'));
  const requests = [];
  const voiceTimes = [];
  let worker;
  let socket;
  let output = '';
  let evaluation = 0;
  let heldResponse;
  let failure;
  const reply = (response, value) => {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(value));
  };
  const control = createServer((request, response) => {
    if (request.url !== '/api/recall/video' || request.headers.authorization !== `Bearer ${controlToken}`) {
      response.writeHead(401); response.end(); return;
    }
    let raw = '';
    request.on('data', chunk => { raw += chunk; });
    request.on('end', () => {
      try {
        const body = JSON.parse(raw);
        requests.push({ ...body, at: Date.now() });
        assert.equal(body.botId, botId);
        if (body.mode === 'agenda') {
          reply(response, { agenda: 'リリース日程と担当体制を決める', agendaVersion: 'replay-v1' });
        } else if (body.mode === 'evaluate') {
          const index = evaluation++;
          assert.ok(index < scenario.actions.length, 'Unexpected extra evaluation');
          assert.deepEqual(body.transcript, scenario.texts.slice(0, index + 1));
          const result = { action: scenario.actions[index], reason: scenario.reason ?? offAgenda, message: null };
          if (scenario.resumeDuringJudgment && index === 2) heldResponse = () => reply(response, result);
          else reply(response, result);
        } else if (body.mode === 'display') {
          assert.equal(body.result.action, 'INTERVENE');
          reply(response, { video: scenario.reason === stalled ? 'stalled' : 'off_agenda' });
        } else {
          assert.equal(body.mode, 'idle');
          reply(response, { video: 'idle' });
        }
      } catch (error) {
        failure = error;
        response.writeHead(500); response.end();
      }
    });
  });
  try {
    await mkdir(join(directory, '.recall'));
    await writeFile(join(directory, '.recall/current.json'), JSON.stringify({ id: botId, agenda: 'リリース日程と担当体制を決める', audioEnabled: true, createdAt: new Date().toISOString() }));
    const controlPort = await listen(control);
    const reservation = createServer();
    const audioPort = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    worker = spawn(process.execPath, ['--import', preloadUrl, workerPath], {
      cwd: directory,
      env: {
        PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: tmpdir(), TMP: tmpdir(),
        AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true', ENABLE_REALTIME_TRANSCRIPTION: 'true',
        AI_GATEWAY_API_KEY: 'offline-key', RECALL_AUDIO_TOKEN: audioToken, RECALL_CONTROL_TOKEN: controlToken,
        RECALL_AUDIO_PORT: String(audioPort), VIDEO_CONTROL_URL: `http://127.0.0.1:${controlPort}/api/recall/video`,
        TEST_GATEWAY_TRANSCRIPTS: JSON.stringify(scenario.texts),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    worker.stdout.on('data', chunk => { output += chunk; });
    worker.stderr.on('data', chunk => { output += chunk; });
    worker.on('error', error => { failure = error; });
    await waitFor(() => output.includes('Recall audio worker ready') || failure || worker.exitCode !== null, 'Worker did not become ready');
    if (failure) throw failure;
    assert.equal(worker.exitCode, null, output);
    socket = new WebSocket(`ws://127.0.0.1:${audioPort}/recall/audio/?token=${audioToken}`);
    socket.on('error', () => {});
    await once(socket, 'open');
    const push = pcm => socket.send(JSON.stringify({ event: 'audio_mixed_raw.data', data: { bot: { id: botId }, data: { buffer: pcm.toString('base64') } } }));
    const startSpeech = () => { voiceTimes.push(Date.now()); for (const frame of voicedFrames) push(frame); };
    const finishSpeech = () => { for (let i = 0; i < 6; i++) push(silence); };
    const checkWorker = () => {
      if (failure) throw failure;
      assert.equal(socket.readyState, WebSocket.OPEN, output);
      assert.equal(output.includes('Audio processing stopped'), false, output);
    };
    for (let index = 0; index < scenario.texts.length; index++) {
      startSpeech();
      if (scenario.resumeDuringJudgment && index === 3) {
        assert.ok(heldResponse, 'Expected a judgment waiting for speech to resume');
        // Allow the real worker to accept the voiced frame before returning a stale result.
        await pause(150);
        heldResponse(); heldResponse = undefined;
        await pause(150);
        assert.equal(requests.filter(request => request.mode === 'display').length, 0, 'Stale judgment interrupted speech');
      }
      finishSpeech();
      await waitFor(() => evaluation > index || failure || socket.readyState !== WebSocket.OPEN, 'No evaluation for finalized speech');
      checkWorker();
      // The server sees a request just before the worker sees its response.
      if (!(scenario.resumeDuringJudgment && index === 2)) await pause(100);
    }
    if (scenario.expectedDisplays) {
      await waitFor(() => requests.some(request => request.mode === 'idle') || failure || socket.readyState !== WebSocket.OPEN, 'No automatic idle restoration', 13000);
    } else {
      // Also observe the entire idle timer window: delayed erroneous displays count.
      await pause(8300);
    }
    checkWorker();
    const displays = requests.filter(request => request.mode === 'display');
    const idles = requests.filter(request => request.mode === 'idle');
    const metrics = {
      id: scenario.id, passed: true, pcmFrames: voiceTimes.length * 7,
      finalizedTurns: evaluation, evaluations: evaluation,
      falseInterventions: scenario.expectedDisplays === 0 ? displays.length : 0,
      missedInterventions: Math.max(0, scenario.expectedDisplays - displays.length),
      duplicateInterventions: Math.max(0, displays.length - scenario.expectedDisplays),
      speakingViolations: displays.filter(display => display.at - voiceTimes.at(-1) < 1400).length,
      displays: displays.length, idleRestorations: idles.length,
      quietToDisplayMs: displays.length ? displays[0].at - voiceTimes.at(-1) : null,
      displayToIdleMs: idles.length ? idles[0].at - displays[0].at : null,
    };
    assert.equal(displays.length, scenario.expectedDisplays, JSON.stringify(metrics));
    assert.equal(idles.length, scenario.expectedDisplays, JSON.stringify(metrics));
    assert.equal(metrics.speakingViolations, 0, JSON.stringify(metrics));
    if (idles.length) assert.ok(metrics.displayToIdleMs >= 7900 && metrics.displayToIdleMs < 12000, JSON.stringify(metrics));
    return metrics;
  } finally {
    socket?.terminate();
    if (worker && worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit'); worker.kill('SIGTERM'); await exited;
    }
    control.closeAllConnections();
    if (control.listening) await new Promise(resolve => control.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runReplaySuite() {
  const cases = await Promise.all(replayCases.map(async scenario => {
    try { return await runReplayCase(scenario); }
    catch (error) { return { id: scenario.id, passed: false, error: error.message }; }
  }));
  return { mode: 'offline-fixed-stt-and-judge', measuresModelAccuracy: false, passed: cases.every(result => result.passed), cases };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 2) throw new Error('Usage: node scripts/regression/meeting-replay.mjs');
  const report = await runReplaySuite();
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
}
