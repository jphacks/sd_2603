const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const baseUrl = process.env.MONITOR_TEST_URL ?? "http://localhost:3000";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE,
  headless: true,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const now = Date.now();
  const scores = { drifted: 0.725, stalled: 0.2, tangentIsRelevant: 0.85 };
  const snapshot = {
    schemaVersion: 1,
    sessionId: "ui-test",
    sequence: 3,
    evaluatedAt: now,
    scores,
    scoresAt: now,
    scoreSequence: 3,
    decision: "WAIT",
    reason: "Conversation needs more observation",
    reasonCode: "OBSERVE",
    transcriptCount: 3,
    lastIntervenedAt: now - 10000,
    cooldownUntil: now + 50000,
  };
  const data = {
    sessionId: "ui-test",
    snapshot,
    history: [0, 1, 2].map((i) => ({
      sequence: i + 1,
      at: now - (2 - i) * 4000,
      scores,
    })),
    expectedIntervalMs: 4000,
  };
  let invalid = false;
  await page.clock.install({ time: new Date(now) });
  await page.route("**/api/monitor/ui-test", (route) =>
    route.fulfill({
      json: invalid
        ? {
            ...data,
            snapshot: { ...snapshot, scores: { ...scores, drifted: 72 } },
          }
        : data,
    }),
  );
  await page.goto(baseUrl + "/monitor?session=ui-test");
  await page.getByText("72.5%", { exact: false }).waitFor();
  assert.equal(await page.locator(".jm-fill").count(), 3);
  assert.equal(
    await page
      .locator(".jm-fill")
      .first()
      .evaluate((element) => element.style.height),
    "72.5%",
  );
  await page.screenshot({ path: "/tmp/jev-monitor-meter.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  assert.ok(await page.locator('.jev-monitor').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
  assert.equal(await page.locator('.jev-monitor').getByRole('button').count(), 0);
  await page.clock.runFor(14000);
  await page.getByText("● 更新停止").waitFor();
  const remaining = Number((await page.locator(".jm-footer").innerText()).match(/クールダウン (\d+)秒/)[1]);
  const expected = Math.max(0, Math.ceil((snapshot.cooldownUntil - await page.evaluate(() => Date.now())) / 1000));
  assert.ok(Math.abs(remaining - expected) <= 1);
  invalid = true;
  await page.clock.runFor(2500);
  await page.getByText("● 入力エラー").waitFor();
  await page.route("**/api/monitor/another-session", route => route.fulfill({ json: {
    sessionId: "another-session", snapshot: null, history: [], expectedIntervalMs: null,
  } }));
  await page.goto(baseUrl + "/monitor?session=another-session");
  await page.getByText("● モニター接続済み · 判定待ち").waitFor();
  assert.equal(await page.locator(".jm-fill").count(), 0);

  let current = { sessionId: null, snapshot: null, history: [], expectedIntervalMs: null,
    runtime: { audio: "disabled" } };
  await page.route("**/api/monitor", route => route.fulfill({ json: current }));
  await page.goto(baseUrl + "/monitor");
  await page.getByText("● モニター接続済み · 判定待ち").waitFor();
  await page.getByText("音声自動判定（設定）: 無効", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "JevのAPI疎通を確認" }).count(), 0);
  current = { ...current, runtime: { audio: "enabled" } };
  await page.clock.runFor(2500);
  await page.getByText("音声自動判定（設定）: 有効", { exact: true }).waitFor();
  current = data;
  await page.clock.runFor(2500);
  await page.getByText("72.5%", { exact: true }).waitFor();
  current = { sessionId: "meeting-b", snapshot: null, history: [], expectedIntervalMs: null };
  await page.clock.runFor(2500);
  await page.getByText("● モニター接続済み · 判定待ち").waitFor();
  assert.equal(await page.locator(".jm-fill").count(), 0);
  current = { ...data, sessionId: "meeting-b", snapshot: { ...snapshot, sessionId: "meeting-b", scores: { ...scores, drifted: 0.2 } } };
  await page.clock.runFor(2500);
  await page.getByText("20.0%", { exact: true }).first().waitFor();
  assert.equal(await page.getByText("72.5%", { exact: true }).count(), 0);
  current = { sessionId: null, snapshot: null, history: [], expectedIntervalMs: null };
  await page.clock.runFor(2500);
  await page.getByText("● モニター接続済み · 判定待ち").waitFor();
  assert.equal(await page.locator(".jm-fill").count(), 0);

  let forbidden = true;
  await page.route("**/api/monitor/permission-test", route => route.fulfill(forbidden
    ? { status: 403, json: { error: "Forbidden" } }
    : { json: { sessionId: "permission-test", snapshot: null, history: [], expectedIntervalMs: null } }));
  await page.goto(baseUrl + "/monitor?session=permission-test");
  await page.getByText("● この会議の表示権限がありません", { exact: true }).waitFor();
  await page.getByText("この会議を表示できません。会議に参加した同じブラウザで開いてください。", { exact: true }).waitFor();
  forbidden = false;
  await page.clock.runFor(2500);
  await page.getByText("● モニター接続済み · 判定待ち").waitFor();

  // The same pasted Meet URL and its short code must resolve to the Bot ID API response.
  await page.route("**/api/monitor?meeting=*", route => {
    assert.equal(new URL(route.request().url()).searchParams.get("meeting"), "https://meet.google.com/abc-defg-hij");
    return route.fulfill({ json: data });
  });
  await page.goto(baseUrl + "/monitor");
  await page.getByLabel("会議URL・Meetコード・Bot ID").fill("https://meet.google.com/abc-defg-hij");
  await page.getByRole("button", { name: "表示する", exact: true }).click();
  await page.getByText("72.5%", { exact: true }).waitFor();
  assert.equal(await page.getByText("MTG IDが正しくありません。", { exact: true }).count(), 0);
  await page.getByLabel("会議URL・Meetコード・Bot ID").fill("abc-defg-hij");
  await page.getByRole("button", { name: "表示する", exact: true }).click();
  await page.getByText("72.5%", { exact: true }).waitFor();
  await page.goto(baseUrl + "/monitor?session=" + encodeURIComponent("https://example.com/abc-defg-hij"));
  await page.getByRole("alert").filter({ hasText: "Google Meet" }).waitFor();
  assert.equal(await page.getByLabel("会議URL・Meetコード・Bot ID").count(), 1);

  // Joining sends the meeting URL once and immediately connects its returned Bot ID.
  invalid = false;
  let joins = 0;
  await page.route("**/api/recall/join", route => {
    joins++;
    assert.equal(route.request().postDataJSON().meetingUrl, "https://meet.google.com/abc-defg-hij");
    return route.fulfill({ json: { id: "ui-test" } });
  });
  await page.goto(baseUrl + "/");
  await page.getByLabel("会議 URL", { exact: true }).fill("https://meet.google.com/abc-defg-hij");
  await page.getByLabel("操作トークン", { exact: true }).fill("fixture-control-".repeat(3));
  await page.getByRole("button", { name: "参加", exact: true }).click();
  await page.getByText("72.5%", { exact: true }).waitFor();
  assert.equal(joins, 1);
  assert.equal(await page.getByRole("link", { name: "この会議の判定グラフを別画面で開く" }).getAttribute("href"), "/monitor?session=ui-test");
  await page.setViewportSize({ width: 360, height: 800 });
  assert.ok(await page.locator('.jev-monitor').evaluate(element => element.getBoundingClientRect().right <= innerWidth));
  await page.screenshot({ path: "/tmp/jev-meeting-join-monitor.png", fullPage: true });
} finally {
  await browser.close();
}
console.log(
  "PASS: vertical meters, split-screen layout, stale status, cooldown clock, invalid data, session reset, auto meeting selection/switch/leave, Meet URL and code selection, recoverable invalid input, join UI connection",
);
