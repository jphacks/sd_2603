import assert from "node:assert/strict";
import { test } from "node:test";
import { createMonitorStore } from "./store.ts";
import {
  acceptEnvelope,
  remainingCooldown,
  expectedInterval,
  ScoreSchema,
  MonitorResponseSchema,
  acceptMonitorResponse,
} from "./schema.ts";
import { decideFromScores, jevJudge } from "../judge/jev.ts";
const input = {
  agenda: "test",
  transcript: ["a", "b", "c"],
  secondsSinceLastIntervention: 60,
};
const diagnostic = {
  drifted: 0.2,
  stalled: 0.2,
  tangentIsRelevant: 0.9,
  interveneNow: 0.9,
  model: "test",
  latencyMs: 1,
  questionVersion: "v2",
};
for (const [drifted, stalled, tangentIsRelevant, action] of [
  [0.2, 0.2, 0.9, "SILENCE"],
  [0.4, 0.2, 0.9, "WAIT"],
  [0.2, 0.4, 0.9, "WAIT"],
  [0.6, 0.2, 0.59, "INTERVENE"],
  [0.6, 0.2, 0.6, "WAIT"],
  [0.2, 0.6, 1, "INTERVENE"],
  [0.9, 0.8, 0.1, "INTERVENE"],
])
  test(`boundary scores ${drifted}/${stalled}/${tangentIsRelevant}`, () =>
    assert.equal(
      decideFromScores({ drifted, stalled, tangentIsRelevant, interveneNow: 0.9 }).action,
      action,
    ));
test("stall takes priority over drift", () =>
  assert.equal(
    decideFromScores({ drifted: 0.9, stalled: 0.8, tangentIsRelevant: 0.1, interveneNow: 0.9 })
      .reason,
    "Discussion appears stalled",
  ));

test("59.9s cooldown precedes insufficient context; 60s and 3 turns allow actual evaluation", async () => {
  const fetchOriginal = globalThis.fetch;
  const keyOriginal = process.env.AI_GATEWAY_API_KEY;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({
      model: "test",
      answers: {
        drifted: { type: "noul", noul: 0.9 },
        stalled: { type: "noul", noul: 0.8 },
        tangentIsRelevant: { type: "noul", noul: 0.1 },
        interveneNow: { type: "noul", noul: 0.9 },
      },
    });
  };
  process.env.AI_GATEWAY_API_KEY = "fake-test-key";
  try {
    assert.equal(
      (
        await jevJudge({
          ...input,
          transcript: ["a", "b"],
          secondsSinceLastIntervention: 59.9,
        })
      ).reason,
      "Cooldown active",
    );
    assert.equal(
      (await jevJudge({ ...input, secondsSinceLastIntervention: 59.9 })).action,
      "SILENCE",
    );
    assert.equal(
      (await jevJudge({ ...input, transcript: ["a", "b"] })).action,
      "WAIT",
    );
    assert.equal(calls, 0);
    assert.equal((await jevJudge(input)).action, "INTERVENE");
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (keyOriginal == null) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = keyOriginal;
  }
});

test("real output events alone start cooldown and do not create fake score points", () => {
  let now = 100000;
  const store = createMonitorStore(() => now);
  store.record("a", input, {
    action: "INTERVENE",
    reason: "Discussion appears stalled",
    message: null,
    diagnostic,
  });
  assert.equal(store.read("a").snapshot.cooldownUntil, null);
  store.intervened("a");
  assert.equal(remainingCooldown(store.read("a").snapshot, now), 60);
  assert.equal(remainingCooldown(store.read("a").snapshot, now + 59900), 1);
  assert.equal(remainingCooldown(store.read("a").snapshot, now + 60000), 0);
  now += 1000;
  store.record("a", input, {
    action: "SILENCE",
    reason: "Cooldown active",
    message: null,
  });
  assert.equal(store.read("a").history.length, 1);
  assert.equal(store.read("a").snapshot.reasonCode, "COOLDOWN");
  assert.equal(store.read("b").snapshot, null);
  now += 60001;
  assert.equal(store.read("a").history.length, 0);
});

test("input validation, deduplication, old-message rejection, session isolation and learned cadence", () => {
  let now = 100000;
  const store = createMonitorStore(() => now);
  for (let i = 0; i < 4; i++) {
    store.record("a", input, {
      action: "SILENCE",
      reason: "Conversation is progressing",
      message: null,
      diagnostic,
    });
    now += 4000;
  }
  const data = store.read("a");
  assert.equal(data.expectedIntervalMs, 4000);
  assert.equal(expectedInterval(data.history), 4000);
  assert.equal(acceptEnvelope(null, data, "a").snapshot.scores.drifted, 0.2);
  assert.equal(acceptEnvelope(data, data, "a"), data);
  assert.equal(
    acceptEnvelope(
      data,
      { ...data, snapshot: { ...data.snapshot, sequence: 1 } },
      "a",
    ),
    data,
  );
  assert.equal(acceptEnvelope(null, data, "b"), null);
  for (const value of [-0.1, 1.1, NaN, Infinity])
    assert.equal(
      ScoreSchema.safeParse({ ...diagnostic, drifted: value }).success,
      false,
    );
  assert.equal(
    acceptEnvelope(
      data,
      {
        snapshot: { ...data.snapshot, scores: { ...diagnostic, drifted: 72 } },
        history: [],
        expectedIntervalMs: null,
      },
      "a",
    ),
    data,
  );
});

test("new stream after server restart recovers the same session without accepting older streams", () => {
  let now = 100000;
  const first = createMonitorStore(() => now);
  first.record("same", input, {
    action: "WAIT",
    reason: "test",
    message: null,
    diagnostic,
  });
  first.record("same", input, {
    action: "WAIT",
    reason: "test",
    message: null,
    diagnostic,
  });
  const previous = first.read("same");
  now += 1000;
  const restarted = createMonitorStore(() => now);
  restarted.record("same", input, {
    action: "SILENCE",
    reason: "test",
    message: null,
    diagnostic,
  });
  const latest = restarted.read("same");
  assert.notEqual(latest.snapshot.streamId, previous.snapshot.streamId);
  assert.equal(
    acceptEnvelope(previous, latest, "same").snapshot.decision,
    "SILENCE",
  );
  assert.equal(acceptEnvelope(latest, previous, "same"), latest);
});


test("joining a meeting selects it before scores arrive; unrelated judges cannot replace it", () => {
  const store = createMonitorStore();
  assert.equal(store.activeSession(), null);
  store.activate("meeting-a");
  assert.equal(store.activeSession(), "meeting-a");
  assert.equal(store.read("meeting-a").snapshot, null);
  store.record("meeting-a", input, { action: "WAIT", reason: "test", message: null, diagnostic });
  store.record("judge", input, { action: "WAIT", reason: "test", message: null, diagnostic });
  store.record("meeting-b", input, { action: "WAIT", reason: "test", message: null, diagnostic });
  assert.equal(store.activeSession(), "meeting-a");
  store.activate("meeting-b");
  store.deactivate("meeting-a");
  assert.equal(store.activeSession(), "meeting-b");
  store.deactivate("meeting-b");
  store.record("meeting-b", input, { action: "WAIT", reason: "late result", message: null, diagnostic });
  assert.equal(store.activeSession(), null);
});

test("worker-only meetings automatically replace the default API test session", () => {
  const store = createMonitorStore();
  const result = { action: "SILENCE", reason: "test", message: null, diagnostic };
  store.record("judge", input, result);
  store.record("worker-meeting", input, result);
  assert.equal(store.activeSession(), "worker-meeting");
});

test("automatic monitor switches meetings without showing the previous meeting's scores", () => {
  const store = createMonitorStore();
  const result = { action: "SILENCE", reason: "test", message: null, diagnostic };
  store.record("meeting-a", input, result);
  const first = { sessionId: "meeting-a", ...store.read("meeting-a") };
  store.activate("meeting-b");
  const waiting = { sessionId: "meeting-b", ...store.read("meeting-b") };
  assert.equal(acceptMonitorResponse(first, waiting).snapshot, null);
  store.record("meeting-b", input, { ...result, diagnostic: { ...diagnostic, drifted: 0.9 } });
  const second = { sessionId: "meeting-b", ...store.read("meeting-b") };
  assert.equal(acceptMonitorResponse(waiting, second).snapshot.scores.drifted, 0.9);
  assert.equal(acceptMonitorResponse(second, waiting).snapshot.scores.drifted, 0.9);
  const ended = { sessionId: null, snapshot: null, history: [], expectedIntervalMs: null };
  assert.equal(acceptMonitorResponse(second, ended).snapshot, null);
  assert.equal(MonitorResponseSchema.safeParse({ ...first, sessionId: "meeting-b" }).success, false);
  assert.equal(MonitorResponseSchema.safeParse({ ...first, sessionId: null }).success, false);
  assert.equal(MonitorResponseSchema.safeParse(ended).success, true);
});

test("a silence nudge is recorded with its own reason code", () => {
  const store = createMonitorStore(() => 1000);
  store.record("a", input, { action: "INTERVENE", reason: "Meeting has gone silent", message: "ここまでで、気になる点はありますか？" });
  assert.equal(store.read("a").snapshot.reasonCode, "SILENT");
  assert.equal(store.read("a").snapshot.reason, "Meeting has gone silent");
});
