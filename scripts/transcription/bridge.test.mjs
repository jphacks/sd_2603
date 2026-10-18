import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import { createWorkerBridge, workerRequest, workerUrl } from './bridge.mjs';

const token = 'a'.repeat(40);
const id = '5d9bb165-4bba-4c07-99ce-91c99aeb95ab';
function fixture() {
  const sessions = new Map(); const calls = [];
  const handler = createWorkerBridge({ token, controlToken: 'c'.repeat(40), controlUrl: new URL('http://127.0.0.1:3000/api/recall/video'), sessions,
    stopSession: () => {}, getStatus: () => ({ connected: false, failed: false }),
    fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return Response.json({ ready: true }); },
  });
  async function request(path, body, secret = token) {
    const req = Readable.from([JSON.stringify(body)]); req.url = path; req.method = 'POST'; req.headers = { authorization: `Bearer ${secret}` };
    let status, data;
    await handler(req, { writeHead: value => { status = value; }, end: value => { data = JSON.parse(value); } });
    return { status, data };
  }
  return { sessions, calls, request };
}
test('audio bridge requires a dedicated token before reading or forwarding', async () => {
  const f = fixture();
  assert.equal((await f.request('/ready', {}, 'wrong')).status, 401);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request('/ready', {})).status, 200);
});
test('remote session registration replaces the shared local current.json requirement', async () => {
  const f = fixture();
  assert.equal((await f.request('/sessions', { id, agenda: '仕様と担当を決める' })).status, 200);
  assert.equal(f.sessions.get(id).agenda, '仕様と担当を決める');
  assert.equal((await f.request('/sessions', { id, agenda: '別の議題' })).status, 409);
  assert.equal((await f.request('/status', { botId: 'unknown' })).status, 404);
  assert.equal((await f.request('/sessions/stop', { botId: id })).status, 200);
  assert.equal(f.sessions.size, 0);
});
test('relay accepts only fixed paths for the registered bot and never arbitrary destinations', async () => {
  const f = fixture(); await f.request('/sessions', { id, agenda: '仕様' });
  for (const path of ['https://evil.test', '/api/recall/join', '/api/test-ai', '/api/monitor/other']) {
    assert.equal((await f.request('/bridge', { botId: id, path })).status, 400);
  }
  assert.equal((await f.request('/bridge', { botId: id, path: '/api/recall/video', body: { botId: 'other' } })).status, 400);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request('/bridge', { botId: id, path: `/api/monitor/${id}` })).status, 200);
  assert.equal(f.calls[0].url, `http://127.0.0.1:3000/api/monitor/${id}`);
});
test('remote configuration rejects non-HTTPS and URL credentials; requests never follow redirects', async () => {
  for (const url of ['http://example.test', 'https://user:pass@example.test', 'https://example.test/path', 'https://example.test/?secret=x']) {
    assert.throws(() => workerUrl({ RECALL_AUDIO_WORKER_URL: url, RECALL_AUDIO_TOKEN: token }, '/ready'));
  }
  await workerRequest({ RECALL_AUDIO_WORKER_URL: 'https://worker.example.test', RECALL_AUDIO_TOKEN: token }, '/ready', {}, async (url, options) => {
    assert.equal(String(url), 'https://worker.example.test/ready'); assert.equal(options.redirect, 'error'); return Response.json({ ready: true });
  });
});
