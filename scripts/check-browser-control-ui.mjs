import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const base = "http://127.0.0.1:39403";
const secret = "test-only-browser-control-".repeat(3);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "39403"], {
  env: { ...process.env, BROWSER_CONTROL_ENABLED: "true", RECALL_CONTROL_TOKEN: secret,
    RECALL_API_KEY: "", ENABLE_REALTIME_TRANSCRIPTION: "false", AI_PROVIDER: "mock", ALLOW_PAID_AI: "false" },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", b => { logs = (logs + b).slice(-4000); });
server.stderr.on("data", b => { logs = (logs + b).slice(-4000); });
const exited = new Promise(resolve => server.once("exit", resolve));
let browser;
try {
  let ready = false;
  for (let i=0; i<50; i++) {
    try { ready = (await fetch(base)).ok; } catch { /* starting */ }
    if (ready) break;
    if (server.exitCode !== null) throw new Error(logs);
    await delay(200);
  }
  assert.ok(ready, logs);
  browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE, headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const actions = [];
  const actionResponses = [];
  page.on("request", req => { if (req.headers()["next-action"]) actions.push(req); });
  await page.route(base + "/", async route => {
    if (!route.request().headers()["next-action"]) return route.continue();
    const response = await route.fetch();
    const body = await response.text();
    actionResponses.push(body);
    return route.fulfill({ response, body });
  });
  await page.goto(base);
  await page.getByRole("button", { name: "参加", exact: true }).waitFor();
  assert.equal(await page.getByLabel("操作トークン", { exact: true }).count(), 0);
  assert.equal(await page.locator('input[type="password"]').count(), 0);
  await page.getByLabel("会議 URL", { exact: true }).fill("https://meet.google.com/abc-defg-hij");
  await page.getByRole("button", { name: "参加", exact: true }).click();
  // The dummy server intentionally has no Recall key. Reaching that error proves
  // that the UI passed control authentication without creating a bot or calling Recall.
  await page.getByText(/RECALL_API_KEY/).waitFor();
  assert.ok(actions.length > 0);
  for (const request of actions) {
    assert.equal(request.headers().authorization, undefined);
    assert.equal((request.postData() ?? "").includes(secret), false);
  }
  assert.ok(actionResponses.length > 0);
  for (const body of actionResponses) assert.equal(body.includes(secret), false);
  assert.equal((await page.content()).includes(secret), false);
  const denied = await page.request.post(base + "/api/recall/join", { data: {} });
  assert.equal(denied.status(), 401);
  assert.equal((await denied.json()).code, "CONTROL_TOKEN_REQUIRED");
  const action = actions[0];
  const crossOrigin = await page.request.post(base + "/", { headers: {
    "Next-Action": action.headers()["next-action"], "Content-Type": action.headers()["content-type"], Origin: "https://other.example",
  }, data: action.postData() });
  assert.ok(crossOrigin.status() >= 400);
  console.log("PASS: token-free UI, server-side authentication, secret absent from browser traffic/HTML, external REST authentication retained, cross-origin action rejected; no Recall or paid AI call.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await Promise.race([exited, delay(5000)]);
  if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
}
