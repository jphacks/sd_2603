import assert from "node:assert/strict";
import { test } from "node:test";
import { applyVideoDecision, authorizedControl, restoreIdleVideo } from "./controller.ts";

const input = {
  botId: "00000000-0000-4000-8000-000000000000",
  agenda: "次のリリース方針を決める",
  transcript: ["脱線しています"],
  secondsSinceLastIntervention: 90,
};

function dependencies(action, reason) {
  const calls = [];
  return {
    calls,
    judge: async () => ({ action, reason, message: null }),
    render: async (view) => { calls.push(["render", view]); return Buffer.from("jpeg"); },
    output: async (botId, jpeg) => { calls.push(["output", botId, jpeg.toString()]); },
  };
}

test("off-agenda intervention renders the actual agenda", async () => {
  const deps = dependencies("INTERVENE", "Discussion appears off agenda");
  const result = await applyVideoDecision(input, deps);
  assert.equal(result.video, "off_agenda");
  assert.deepEqual(deps.calls[0], ["render", { kind: "off_agenda", agenda: input.agenda }]);
  assert.deepEqual(deps.calls[1], ["output", input.botId, "jpeg"]);
});

test("stalled intervention uses the stalled visual", async () => {
  const deps = dependencies("INTERVENE", "Discussion appears stalled");
  assert.equal((await applyVideoDecision(input, deps)).video, "stalled");
  assert.deepEqual(deps.calls[0], ["render", { kind: "stalled" }]);
});

test("mock intervention shows the agenda instead of a stalled card", async () => {
  const deps = dependencies("INTERVENE", "Mock intervention");
  assert.equal((await applyVideoDecision(input, deps)).video, "off_agenda");
  assert.deepEqual(deps.calls[0], ["render", { kind: "off_agenda", agenda: input.agenda }]);
});

for (const action of ["WAIT", "SILENCE"]) {
  test(`${action} does not send redundant video`, async () => {
    const deps = dependencies(action, "No intervention");
    assert.equal((await applyVideoDecision(input, deps)).video, "unchanged");
    assert.deepEqual(deps.calls, []);
  });
}

test("explicit idle request restores the quiet visual", async () => {
  const deps = dependencies("WAIT", "No intervention");
  assert.deepEqual(await restoreIdleVideo(input.botId, deps), { video: "idle" });
  assert.deepEqual(deps.calls[0], ["render", { kind: "idle" }]);
});

test("missing or incorrect control token is rejected", () => {
  const secret = "a".repeat(32);
  const request = (token) => new Request("https://example.test/api/recall/video", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  assert.equal(authorizedControl(request(secret), secret), true);
  assert.equal(authorizedControl(request("b".repeat(32)), secret), false);
  assert.equal(authorizedControl(request(), secret), false);
  assert.equal(authorizedControl(request(secret), undefined), false);
  assert.equal(authorizedControl(request("short"), "short"), false);
});
