import assert from "node:assert/strict";
import { test } from "node:test";
import { monitorRuntime } from "./runtime.ts";
import { createJevProbe } from "./probe.ts";
import { JevError } from "../judge/jev.ts";
import { monitorStore } from "./store.ts";
import { acceptMonitorResponse } from "./schema.ts";

const configured = { AI_PROVIDER: "jev", ALLOW_PAID_AI: "true", AI_GATEWAY_API_KEY: "fixture-private-key" };

test("configuration readiness is explicit and never includes secret values", () => {
  assert.equal(monitorRuntime({}).jev, "mock");
  assert.equal(monitorRuntime({ AI_PROVIDER: "other" }).jev, "unknown_provider");
  assert.equal(monitorRuntime({ AI_PROVIDER: "jev" }).jev, "blocked");
  assert.equal(monitorRuntime({ ...configured, AI_GATEWAY_API_KEY: " " }).jev, "missing_key");
  const state = monitorRuntime({ ...configured, ENABLE_REALTIME_TRANSCRIPTION: "true", BROWSER_CONTROL_ENABLED: "true", RECALL_CONTROL_TOKEN: "fixture-control-token-".repeat(3) });
  assert.deepEqual(state, { jev: "ready", audio: "enabled", canProbe: true });
  assert.doesNotMatch(JSON.stringify(state), /fixture-private|fixture-control/);
  assert.equal(monitorRuntime(configured).audio, "disabled");
});

test("unconfigured probes never call the provider", async () => {
  let calls = 0;
  const check = createJevProbe({ env: () => ({}), score: async () => { calls++; throw new Error("should not run"); } });
  assert.equal((await check()).status, 503);
  assert.equal(calls, 0);
});

test("explicit Jev probe checks real request shape, deduplicates clicks and never creates graph data", async () => {
  let now = 100000;
  let calls = 0;
  const before = monitorStore.activeSession();
  const check = createJevProbe({ env: () => configured, now: () => now, score: async (input, options) => {
    calls++;
    assert.equal(input.transcript.length, 3);
    assert.equal(input.secondsSinceLastIntervention, 60);
    assert.equal(options.apiKey, configured.AI_GATEWAY_API_KEY);
    return { scores: { drifted: 0.2, stalled: 0.1, tangentIsRelevant: 0.9 }, model: "typesafe-ai/jev", latencyMs: 12 };
  } });
  const [first, concurrent] = await Promise.all([check(), check()]);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.model, "typesafe-ai/jev");
  assert.deepEqual(first, concurrent);
  assert.equal(calls, 1);
  assert.equal(monitorStore.activeSession(), before);
  assert.equal("scores" in first.body, false);
  assert.equal("transcript" in first.body, false);
  await check();
  assert.equal(calls, 1);
  now += 30000;
  await check();
  assert.equal(calls, 2);
});

test("probe errors return safe auth, timeout and rate-limit states", async () => {
  for (const [kind, status] of [["auth", 502], ["timeout", 504], ["rate_limit", 429], ["invalid_response", 502]]) {
    const check = createJevProbe({ env: () => configured, score: async () => { throw new JevError(kind, "fixture-private-key"); } });
    const result = await check();
    assert.equal(result.status, status);
    assert.equal(result.body.kind, kind);
    assert.equal(result.body.ok, false);
    assert.doesNotMatch(JSON.stringify(result.body), /fixture-private-key/);
  }
});

test("runtime updates remain visible even when a score sample has not changed", () => {
  const initial = { sessionId: "meeting", snapshot: null, history: [], expectedIntervalMs: null, runtime: monitorRuntime({}) };
  const updated = { ...initial, runtime: monitorRuntime(configured) };
  assert.equal(acceptMonitorResponse(initial, updated).runtime.jev, "ready");
});
