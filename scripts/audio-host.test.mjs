import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hostEnvProblems, parseQuickTunnelUrl, vercelValues } from './audio-host.mjs';

const hostEnv = {
  ENABLE_REALTIME_TRANSCRIPTION: 'true', RECALL_AUDIO_BRIDGE_MODE: 'true', AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true',
  AI_GATEWAY_API_KEY: 'key', RECALL_API_KEY: 'recall', RECALL_REGION: 'ap-northeast-1',
  RECALL_CONTROL_TOKEN: 'c'.repeat(40), RECALL_AUDIO_TOKEN: 'a'.repeat(40),
};

test('reads the quick tunnel URL from cloudflared output', () => {
  const log = '2026-10-18T05:00:00Z INF |  https://calm-river-demo.trycloudflare.com  |';
  assert.equal(parseQuickTunnelUrl(log), 'https://calm-river-demo.trycloudflare.com');
  assert.equal(parseQuickTunnelUrl('INF Requesting new quick Tunnel on trycloudflare.com...'), null);
});

test('a complete host configuration has no problems', () => {
  assert.deepEqual(hostEnvProblems(hostEnv), []);
});

test('rejects a relay loop, browser control and short tokens on the host', () => {
  const problems = hostEnvProblems({ ...hostEnv, RECALL_AUDIO_WORKER_URL: 'https://x.test', BROWSER_CONTROL_ENABLED: 'true', RECALL_AUDIO_TOKEN: 'short' });
  assert.equal(problems.length, 3);
});

test('a named tunnel needs its public hostname', () => {
  assert.equal(hostEnvProblems({ ...hostEnv, CLOUDFLARE_TUNNEL_TOKEN: 't' }).length, 1);
  assert.deepEqual(hostEnvProblems({ ...hostEnv, CLOUDFLARE_TUNNEL_TOKEN: 't', RECALL_AUDIO_TUNNEL_HOSTNAME: 'audio.example.com' }), []);
});

test('derives the Vercel worker URLs that deploy-vercel accepts', () => {
  assert.deepEqual(vercelValues('https://calm-river-demo.trycloudflare.com'), {
    RECALL_AUDIO_WORKER_URL: 'https://calm-river-demo.trycloudflare.com',
    RECALL_AUDIO_PUBLIC_URL: 'wss://calm-river-demo.trycloudflare.com',
  });
});
