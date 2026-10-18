import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const AUDIO_TEST_BRANCH = 'feature/staging-meet-transcription';
export const STAGING_BRANCH = 'staging';
const required = ['RECALL_AUDIO_WORKER_URL', 'RECALL_AUDIO_PUBLIC_URL', 'RECALL_AUDIO_TOKEN', 'RECALL_CONTROL_TOKEN', 'AI_GATEWAY_API_KEY', 'RECALL_API_KEY', 'RECALL_REGION'];

// Validates one JSON Secret that points Vercel at the always-on worker behind a tunnel.
function audioRuntime(raw, secretName) {
  let config;
  try { config = JSON.parse(raw ?? ''); } catch { throw new Error(`${secretName} is missing or invalid; refusing a Mock fallback`); }
  for (const key of required) if (typeof config[key] !== 'string' || !config[key].trim()) throw new Error(`Audio setting missing in ${secretName}: ${key}`);
  const worker = new URL(config.RECALL_AUDIO_WORKER_URL), audio = new URL(config.RECALL_AUDIO_PUBLIC_URL);
  if (worker.protocol !== 'https:' || audio.protocol !== 'wss:' || worker.host !== audio.host || worker.username || worker.password || audio.username || audio.password || worker.pathname !== '/' || audio.pathname !== '/' || worker.search || audio.search || worker.hash || audio.hash) throw new Error(`Invalid audio worker URLs in ${secretName}`);
  if (config.RECALL_AUDIO_TOKEN.length < 32 || config.RECALL_CONTROL_TOKEN.length < 32) throw new Error(`Audio tokens too short in ${secretName}`);
  const runtime = {};
  for (const key of required) runtime[key] = config[key];
  return {
    ...runtime,
    AI_PROVIDER: 'jev',
    ALLOW_PAID_AI: 'true',
    BROWSER_CONTROL_ENABLED: 'true',
    ENABLE_REALTIME_TRANSCRIPTION: 'true',
    JEV_MODEL_ID: 'typesafe-ai/jev-1.14.0',
  };
}

export function deploymentRuntime(env) {
  const runtime = { AI_PROVIDER: env.DEPLOY_AI_PROVIDER, ALLOW_PAID_AI: env.DEPLOY_ALLOW_PAID_AI, BROWSER_CONTROL_ENABLED: env.DEPLOY_BROWSER_CONTROL_ENABLED };
  const audioTest = env.GITHUB_REF_NAME === AUDIO_TEST_BRANCH;
  // staging keeps its current deploy unless the owner adds the dedicated STAGING_AUDIO_RUNTIME Secret.
  const stagingAudio = env.GITHUB_REF_NAME === STAGING_BRANCH && Boolean(env.STAGING_AUDIO_RUNTIME);
  if (!audioTest && !stagingAudio) {
    if (runtime.AI_PROVIDER === 'jev') runtime.JEV_MODEL_ID = 'typesafe-ai/jev-1.14.0';
    return runtime;
  }
  if (env.GITHUB_EVENT_NAME !== 'push' || env.DEPLOY_TARGET !== 'preview') throw new Error('Live audio deploy is restricted to approved branch push Previews');
  if (stagingAudio) return { ...runtime, ...audioRuntime(env.STAGING_AUDIO_RUNTIME, 'STAGING_AUDIO_RUNTIME') };
  return {
    ...runtime,
    ...audioRuntime(env.AUDIO_TEST_RUNTIME, 'AUDIO_TEST_RUNTIME'),
    RECALL_MEETING_SCOPE: 'audio-test-preview',
    RECALL_CAMERA_URL: 'https://meeting-facilitator-feature-staging-meet-tra-caab44864ba1.vercel.app/recall/camera',
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const runtime = deploymentRuntime(process.env);
  const args = ['deploy', '--prebuilt', '--yes', '--json', '--meta', `githubCommitRef=${process.env.GITHUB_REF_NAME}`, '--token', process.env.VERCEL_TOKEN];
  if (process.env.DEPLOY_TARGET === 'production') args.push('--prod');
  for (const [key, value] of Object.entries(runtime)) args.push('--env', `${key}=${value}`);
  const result = spawnSync('vercel', args, { encoding: 'utf8', maxBuffer: 5_000_000, env: process.env });
  if (result.status !== 0) {
    // Never emit raw CLI errors: arguments may contain runtime credentials.
    console.error(`Vercel deployment failed (exit ${result.status ?? 'unknown'}). Runtime values omitted.`);
    process.exit(1);
  }
  let deployment;
  try { const parsed = JSON.parse(result.stdout); deployment = parsed.deployment ?? parsed; } catch { throw new Error('Vercel returned invalid deployment JSON'); }
  if (!deployment.url) throw new Error('Vercel did not return a deployment URL');
  await writeFile(process.argv[2], JSON.stringify({ id: deployment.id, url: deployment.url, productionUrl: deployment.productionUrl }), { mode: 0o600 });
  console.log(`Deployment complete. Live audio enabled: ${runtime.ENABLE_REALTIME_TRANSCRIPTION === 'true'}`);
}
