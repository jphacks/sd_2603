import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const bots = new Map();
const left = [];
const api = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(request.url, 'http://localhost');
  let result;
  if (request.method === 'POST' && url.pathname === '/api/v1/bot/') {
    const id = randomUUID();
    result = { id, ...body, status_changes: [{ code: 'joining_call' }] }; bots.set(id, result);
  } else if (url.pathname === '/api/v1/bot/') result = { next: null, results: [...bots.values()].filter(bot => bot.status_changes[0].code !== 'done') };
  else {
    const id = url.pathname.split('/')[4];
    result = bots.get(id);
    if (url.pathname.endsWith('/leave_call/')) {
      left.push(id); result.status_changes = [{ code: 'done' }]; result = {};
    }
  }
  response.writeHead(result ? 200 : 404, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(result ?? {}));
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const port = Number(process.env.MULTI_UI_PORT ?? 3188);
const base = `http://127.0.0.1:${port}`;
const secret = 'offline-multi-control-secret-'.repeat(2);
const server = spawn(process.execPath, ['--import', './scripts/ci/recall-fixture-fetch.mjs', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
  env: { ...process.env, TEST_RECALL_ORIGIN: `http://127.0.0.1:${api.address().port}`, AI_PROVIDER: 'mock', ALLOW_PAID_AI: 'false', BROWSER_CONTROL_ENABLED: 'true', RECALL_API_KEY: 'offline-fixture', RECALL_CONTROL_TOKEN: secret, ENABLE_REALTIME_TRANSCRIPTION: 'false', RECALL_CHAT_WEBHOOK_URL: '', VERCEL: '1', VERCEL_ENV: 'preview' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', chunk => { output += chunk; });
server.stderr.on('data', chunk => { output += chunk; });
const exited = once(server, 'exit');
let browser;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(output);
    try { if ((await fetch(base)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE, headless: true, args: ['--no-sandbox'] });
  const pageA = await browser.newPage();
  const pageB = await browser.newPage();
  const urlA = 'https://meet.google.com/aaa-bbbb-ccc';
  const urlB = 'https://meet.google.com/ddd-eeee-fff';
  async function join(page, url) {
    await page.goto(base);
    await page.getByLabel('会議 URL', { exact: true }).fill(url);
    await page.getByRole('button', { name: '参加', exact: true }).click();
    await page.getByText(/ボットを送信しました/).waitFor();
  }
  await join(pageA, urlA);
  const a = [...bots.keys()][0];
  await join(pageB, urlB);
  const b = [...bots.keys()][1];
  assert.equal(bots.size, 2);
  assert.notEqual(bots.get(a).metadata.owner, bots.get(b).metadata.owner);
  assert.equal(await pageA.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).getAttribute('href'), `/monitor?session=${a}`);
  assert.equal(await pageB.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).getAttribute('href'), `/monitor?session=${b}`);
  assert.equal((await pageA.content()).includes(urlB), false);
  assert.equal((await pageB.content()).includes(urlA), false);
  assert.equal(await pageA.evaluate(async url => (await fetch(url)).status, `/api/monitor/${b}`), 403);
  const foreignLeave = await pageA.evaluate(async ({ id, token }) => {
    const response = await fetch('/api/recall/leave', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ botId: id }) });
    return { status: response.status, body: await response.json() };
  }, { id: b, token: secret });
  assert.equal(foreignLeave.status, 403);
  assert.match(foreignLeave.body.error, /この利用者/);
  const foreignMaterials = await pageA.evaluate(async id => {
    const form = new FormData(); form.set('botId', id);
    return (await fetch('/api/recall/materials', { method: 'POST', body: form })).status;
  }, b);
  assert.equal(foreignMaterials, 403);
  assert.deepEqual(left, []);
  await pageA.reload();
  await pageA.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).waitFor();
  assert.equal(await pageA.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).getAttribute('href'), `/monitor?session=${a}`);
  await pageA.getByRole('button', { name: '退出', exact: true }).click();
  try { await pageA.getByText('退出しました', { exact: true }).waitFor({ timeout: 5000 }); }
  catch (error) { console.error(await pageA.locator('main').innerText()); console.error(output); throw error; }
  assert.deepEqual(left, [a]);
  await pageB.reload();
  await pageB.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).waitFor();
  assert.equal(await pageB.getByRole('link', { name: 'この会議の判定グラフを別画面で開く' }).getAttribute('href'), `/monitor?session=${b}`);
  assert.equal(await pageB.evaluate(async url => (await fetch(url)).status, `/api/monitor/${b}`), 200);
  assert.equal((await pageB.content()).includes(secret), false);
  for (const endpoint of ['join', 'leave', 'meetings']) assert.equal((await pageB.request.post(`${base}/api/recall/${endpoint}`, { data: {} })).status(), 401);
  console.log('PASS: two independent users using one key, separate sessions/monitors, foreign meeting read/leave denied, leave only A, restore B after reload, token absent, REST auth retained. All Recall calls used a loopback fixture; no paid requests.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
  api.closeAllConnections();
  await new Promise(resolve => api.close(resolve));
}
