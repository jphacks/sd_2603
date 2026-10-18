import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { randomBytes, randomUUID } from 'node:crypto';

const base = 'http://127.0.0.1:3100';
const controlToken = randomBytes(32).toString('hex');
const deviceToken = randomBytes(32).toString('hex');
const server = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100',
], {
  env: { ...process.env, AI_PROVIDER: 'mock', ALLOW_PAID_AI: 'false', PORT: '3100', RECALL_CONTROL_TOKEN: controlToken, DEVICE_TOKEN: deviceToken, ENABLE_REALTIME_TRANSCRIPTION: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output = (output + chunk).slice(-4000); });
server.stderr.on('data', chunk => { output = (output + chunk).slice(-4000); });
const exited = new Promise(resolve => server.once('exit', resolve));
let spawnError;
server.on('error', error => { spawnError = error; });

async function request(path, options = {}) {
  return fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Next.js exited before startup: ${output}`);
    }
    try {
      const response = await request('/');
      assert.equal(response.status, 200);
      ready = true;
      break;
    } catch {
      await setTimeout(500);
    }
  }
  assert.ok(ready, `Next.js did not start: ${output}`);
  for (const [seconds, transcript, expected] of [
    [0, ['a', 'b', 'c'], 'SILENCE'],
    [60, [], 'WAIT'],
    [60, ['a', 'b', 'c'], 'INTERVENE'],
  ]) {
    const response = await request('/api/judge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agenda: 'CI smoke test', transcript, secondsSinceLastIntervention: seconds }),
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.action, expected);
    assert.equal(typeof result.reason, 'string');
    assert.equal(expected === 'INTERVENE' ? typeof result.message : result.message,
      expected === 'INTERVENE' ? 'string' : null);
  }
  assert.equal((await request('/api/test-ai')).status, 403);
  const botId = randomUUID();
  const agenda = 'Synthetic device integration';
  const postControl = body => request('/api/recall/video', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${controlToken}` },
    body: JSON.stringify({ botId, ...body }),
  });
  const event = type => request(`/api/device/${botId}/event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceToken}` },
    body: JSON.stringify({ type }),
  });
  const snapshotResponse = await postControl({ mode: 'agenda', agenda });
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  const evaluate = { mode: 'evaluate', ...snapshot, transcript: ['a', 'b', 'c'], secondsSinceLastIntervention: 0 };
  assert.equal((await event('back')).status, 200);
  assert.equal((await postControl({ ...evaluate, agendaVersion: 'stale-test-version' })).status, 409);
  const manualResponse = await postControl(evaluate);
  assert.equal(manualResponse.status, 200);
  const manual = await manualResponse.json();
  assert.equal(manual.action, 'INTERVENE');
  assert.equal(manual.manual, true);
  const consumed = await (await postControl(evaluate)).json();
  assert.equal(consumed.action, 'SILENCE');
  assert.equal(consumed.manual, false);
  assert.equal((await event('tangent_ok')).status, 200);
  const muted = await (await postControl({ ...evaluate, secondsSinceLastIntervention: 60 })).json();
  assert.equal(muted.action, 'WAIT');
  assert.equal(muted.manual, false);
  assert.equal((await event('unmute')).status, 200);
  const pending = await (await postControl({ ...evaluate, secondsSinceLastIntervention: 60 })).json();
  assert.equal(pending.action, 'INTERVENE');
  const display = recommendation => ({
    mode: 'display', ...snapshot, generation: 0, requestId: randomUUID(),
    recommendationId: recommendation.recommendationId,
    result: { action: 'INTERVENE', reason: 'Manual request', message: 'forged', manual: true },
  });
  assert.equal((await event('tangent_ok')).status, 200);
  // Device mute arriving while a recommendation waits must cancel before any
  // external output; a caller cannot manufacture the manual bypass.
  assert.equal((await postControl(display(pending))).status, 409);
  const waiting = await (await postControl({ ...evaluate, secondsSinceLastIntervention: 60 })).json();
  assert.equal(waiting.action, 'WAIT');
  assert.equal((await postControl(display(pending))).status, 409);
  assert.equal((await event('unmute')).status, 200);
  const noOutput = await postControl(display(waiting));
  assert.equal(noOutput.status, 200);
  assert.equal((await noOutput.json()).video, 'unchanged');
  assert.equal((await postControl({ ...display(waiting), recommendationId: randomUUID() })).status, 409);
  console.log('PASS: app startup, Mock SILENCE/WAIT/INTERVENE, device manual/mute, server-owned deferred decisions, stale agenda/recommendation cancellation, paid AI blocked.');
} finally {
  server.kill('SIGTERM');
  await Promise.race([exited, setTimeout(5000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
}
