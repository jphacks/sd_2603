import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AUDIO_TEST_BRANCH, deploymentRuntime } from './deploy-vercel.mjs';
const config = { RECALL_AUDIO_WORKER_URL: 'https://worker.example.test', RECALL_AUDIO_PUBLIC_URL: 'wss://worker.example.test', RECALL_AUDIO_TOKEN: 'a'.repeat(40), RECALL_CONTROL_TOKEN: 'c'.repeat(40), AI_GATEWAY_API_KEY: 'test-key', RECALL_API_KEY: 'recall-test-key', RECALL_REGION: 'ap-northeast-1' };
const env = { GITHUB_REF_NAME: AUDIO_TEST_BRANCH, GITHUB_EVENT_NAME: 'push', DEPLOY_TARGET: 'preview', AUDIO_TEST_RUNTIME: JSON.stringify(config) };
test('approved audio Preview deploy always enables real Jev, audio and server-managed control together', () => {
  const runtime = deploymentRuntime(env);
  assert.equal(runtime.AI_PROVIDER, 'jev'); assert.equal(runtime.ALLOW_PAID_AI, 'true');
  assert.equal(runtime.ENABLE_REALTIME_TRANSCRIPTION, 'true'); assert.equal(runtime.BROWSER_CONTROL_ENABLED, 'true');
  assert.equal(runtime.RECALL_AUDIO_WORKER_URL, config.RECALL_AUDIO_WORKER_URL);
});
test('missing worker settings or wrong event fails instead of silently deploying Mock', () => {
  for (const change of [{ AUDIO_TEST_RUNTIME: '' }, { GITHUB_EVENT_NAME: 'pull_request' }, { DEPLOY_TARGET: 'production' }, { AUDIO_TEST_RUNTIME: JSON.stringify({ ...config, RECALL_AUDIO_PUBLIC_URL: 'wss://another.test' }) }]) {
    assert.throws(() => deploymentRuntime({ ...env, ...change }));
  }
});
test('other branches never consume the audio test credentials or change their AI policy', () => {
  for (const branch of ['main', 'staging', 'feature/other']) {
    const runtime = deploymentRuntime({ ...env, GITHUB_REF_NAME: branch, DEPLOY_AI_PROVIDER: 'mock', DEPLOY_ALLOW_PAID_AI: 'false', DEPLOY_BROWSER_CONTROL_ENABLED: 'false' });
    assert.equal(runtime.AI_PROVIDER, 'mock'); assert.equal(runtime.RECALL_AUDIO_TOKEN, undefined); assert.equal(runtime.ENABLE_REALTIME_TRANSCRIPTION, undefined);
  }
});
