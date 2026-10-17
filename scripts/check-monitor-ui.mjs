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
  assert.equal(await page.getByRole('button').count(), 0);
  await page.clock.runFor(14000);
  await page.getByText("● 更新停止").waitFor();
  const remaining = Number((await page.locator(".jm-footer").innerText()).match(/クールダウン (\d+)秒/)[1]);
  const expected = Math.max(0, Math.ceil((snapshot.cooldownUntil - await page.evaluate(() => Date.now())) / 1000));
  assert.ok(Math.abs(remaining - expected) <= 1);
  invalid = true;
  await page.clock.runFor(2500);
  await page.getByText("● 入力エラー").waitFor();
  await page.goto(baseUrl + "/monitor?session=another-session");
  await page.getByText("● 実スコア未取得").waitFor();
  assert.equal(await page.locator(".jm-fill").count(), 0);
} finally {
  await browser.close();
}
console.log(
  "PASS: vertical meters, split-screen layout, stale status, cooldown clock, invalid data, session reset",
);
