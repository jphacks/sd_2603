import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { WebSocket } from 'ws';

test('worker rejects invalid token and unknown bot without a paid request', { timeout: 15000 }, async () => {
  const reservation = createServer();
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const token = 'test-receiver-token-'.repeat(3);
  const worker = spawn(process.execPath, ['scripts/recall-transcription.mjs'], {
    env: { ...process.env, AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true', ENABLE_REALTIME_TRANSCRIPTION: 'true', AI_GATEWAY_API_KEY: 'fake-test-key', RECALL_CONTROL_TOKEN: 'x'.repeat(40), RECALL_AUDIO_TOKEN: token, RECALL_AUDIO_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    await Promise.race([once(worker.stdout, 'data'), once(worker, 'exit').then(() => { throw new Error('Worker exited before startup'); })]);
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
    const denied = new WebSocket(`ws://127.0.0.1:${port}/recall/audio/?token=wrong`);
    const [error] = await once(denied, 'error');
    assert.match(error.message, /403/);
    const accepted = new WebSocket(`ws://127.0.0.1:${port}/recall/audio/?token=${token}`);
    await once(accepted, 'open');
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 503);
    accepted.send(JSON.stringify({ event: 'audio_mixed_raw.data', data: { bot: { id: 'wrong' }, data: { buffer: 'AAAA' } } }));
    const [code] = await once(accepted, 'close');
    assert.equal(code, 1011);
    // The refused connection is not retried, and the worker is free for the next join.
    assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status, 200);
  } finally {
    worker.kill('SIGTERM');
    if (worker.exitCode === null) await once(worker, 'exit');
  }
});
