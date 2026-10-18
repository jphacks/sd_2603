// Starts the always-on side of the staging audio bridge on one PC:
// Next (127.0.0.1 only) + audio worker + a Cloudflare Tunnel that exposes only the worker port.
// Prints the worker URLs that the Vercel Secret needs. Secrets are never printed.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { pathToFileURL } from 'node:url';

const QUICK_TUNNEL = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;

export function parseQuickTunnelUrl(text) {
  return text.match(QUICK_TUNNEL)?.[0] ?? null;
}

export function hostEnvProblems(env) {
  const problems = [];
  const expect = { ENABLE_REALTIME_TRANSCRIPTION: 'true', RECALL_AUDIO_BRIDGE_MODE: 'true', AI_PROVIDER: 'jev', ALLOW_PAID_AI: 'true' };
  for (const [key, value] of Object.entries(expect)) if (env[key] !== value) problems.push(`${key}=${value} が必要です`);
  for (const key of ['AI_GATEWAY_API_KEY', 'RECALL_API_KEY', 'RECALL_REGION']) if (!env[key]) problems.push(`${key} が未設定です`);
  for (const key of ['RECALL_CONTROL_TOKEN', 'RECALL_AUDIO_TOKEN']) if (!env[key] || env[key].length < 32) problems.push(`${key} は32文字以上にしてください`);
  // The host is the bridge target itself; a worker URL here would make Next relay to itself.
  if (env.RECALL_AUDIO_WORKER_URL) problems.push('このPCでは RECALL_AUDIO_WORKER_URL を空にしてください（中継ループ防止）');
  if (env.BROWSER_CONTROL_ENABLED === 'true') problems.push('このPCでは BROWSER_CONTROL_ENABLED を true にしないでください');
  if (env.CLOUDFLARE_TUNNEL_TOKEN && !env.RECALL_AUDIO_TUNNEL_HOSTNAME) problems.push('名前付きトンネルでは RECALL_AUDIO_TUNNEL_HOSTNAME（例: audio.example.com）も必要です');
  return problems;
}

export function vercelValues(origin) {
  const host = new URL(origin).host;
  return { RECALL_AUDIO_WORKER_URL: `https://${host}`, RECALL_AUDIO_PUBLIC_URL: `wss://${host}` };
}

async function waitFor(label, check, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await check()) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`${label} が ${Math.round(timeoutMs / 1000)} 秒以内に応答しませんでした`);
}

const children = [];
let stopping = false;
function stopAll(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}

async function main() {
  for (const file of ['.env.local', '.env']) if (existsSync(file)) loadEnvFile(file);
  const env = process.env;
  const problems = hostEnvProblems(env);
  if (problems.length) {
    console.error(`設定を確認してください（.env.local）:\n- ${problems.join('\n- ')}`);
    process.exit(1);
  }
  const dev = process.argv.includes('--dev');
  if (!dev && !existsSync('.next/BUILD_ID')) {
    console.error('ビルドがありません。先に `npm run build` を実行するか、`--dev` を付けて起動してください。');
    process.exit(1);
  }
  const workerPort = Number(env.RECALL_AUDIO_PORT ?? 8787);
  const nextBin = resolve('node_modules/next/dist/bin/next');
  const start = (name, command, args, options = {}) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    children.push(child);
    const prefix = line => `[${name}] ${line}`;
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8');
      stream.on('data', chunk => { for (const line of chunk.split(/\r?\n/)) if (line.trim()) console.log(prefix(line)); });
    }
    child.on('exit', code => {
      if (!stopping) { console.error(prefix(`終了しました（code ${code}）。すべて停止します。`)); stopAll(1); }
    });
    child.on('error', error => {
      if (!stopping) { console.error(prefix(`起動できません: ${error.message}`)); stopAll(1); }
    });
    return child;
  };
  process.on('SIGINT', () => stopAll(0));
  process.on('SIGTERM', () => stopAll(0));

  start('next', process.execPath, [nextBin, dev ? 'dev' : 'start', '-H', '127.0.0.1', '-p', '3000']);
  await waitFor('Next（127.0.0.1:3000）', async () => {
    const r = await fetch('http://127.0.0.1:3000/api/recall/audio-ready', { headers: { Authorization: `Bearer ${env.RECALL_CONTROL_TOKEN}` } });
    return r.ok;
  }, 120_000);
  console.log('[host] Next の音声判定の準備ができました');

  start('worker', process.execPath, ['scripts/recall-transcription.mjs']);
  await waitFor(`音声ワーカー（127.0.0.1:${workerPort}）`, async () => (await fetch(`http://127.0.0.1:${workerPort}/health`)).ok, 60_000);
  console.log('[host] 音声ワーカーの準備ができました');

  const cloudflared = env.CLOUDFLARED_PATH || 'cloudflared';
  let origin;
  if (env.CLOUDFLARE_TUNNEL_TOKEN) {
    // Named tunnel: fixed hostname, routed to http://127.0.0.1:<port> in the Cloudflare dashboard.
    // The token goes through the environment, not argv, so it does not appear in process lists.
    start('tunnel', cloudflared, ['tunnel', '--no-autoupdate', 'run'], { env: { ...env, TUNNEL_TOKEN: env.CLOUDFLARE_TUNNEL_TOKEN } });
    origin = `https://${env.RECALL_AUDIO_TUNNEL_HOSTNAME}`;
  } else {
    const tunnel = start('tunnel', cloudflared, ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${workerPort}`]);
    origin = await new Promise((resolveUrl, reject) => {
      const timer = setTimeout(() => reject(new Error('クイックトンネルのURLを取得できませんでした（外向き 443 / 7844 番の通信を確認）')), 60_000);
      const watch = chunk => {
        const url = parseQuickTunnelUrl(String(chunk));
        if (url) { clearTimeout(timer); resolveUrl(url); }
      };
      tunnel.stdout.on('data', watch);
      tunnel.stderr.on('data', watch);
    });
  }
  await waitFor(`公開URL（${origin}/health）`, async () => (await fetch(`${origin}/health`)).ok, 90_000);

  const values = vercelValues(origin);
  console.log(`
[host] トンネル経由で音声ワーカーに届きました。Vercel 側の Secret に次の2つを入れてください。
  RECALL_AUDIO_WORKER_URL=${values.RECALL_AUDIO_WORKER_URL}
  RECALL_AUDIO_PUBLIC_URL=${values.RECALL_AUDIO_PUBLIC_URL}
${env.CLOUDFLARE_TUNNEL_TOKEN ? '' : '  ※クイックトンネルは起動のたびにURLが変わります。変わったら Secret を更新して再デプロイしてください。\n'}
停止は Ctrl+C です。PCを止めるかトンネルを閉じると自動判定も止まります。`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => {
    console.error(`[host] ${error.message}`);
    stopAll(1);
  });
}
