import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const base = 'http://127.0.0.1:3100';
const server = spawn(process.execPath, [
  'node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3100',
], {
  env: { ...process.env, AI_PROVIDER: 'mock', ALLOW_PAID_AI: 'false', PORT: '3100' },
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
  console.log('PASS: app startup, Mock SILENCE/WAIT/INTERVENE, paid AI blocked.');
} finally {
  server.kill('SIGTERM');
  await Promise.race([exited, setTimeout(5000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
}
