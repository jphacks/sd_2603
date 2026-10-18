import assert from "node:assert/strict";
import { test } from "node:test";
import { monitorRuntime } from "./runtime.ts";
import { acceptMonitorResponse } from "./schema.ts";

test("audio status reports the explicit setting without publishing credentials", () => {
  assert.deepEqual(monitorRuntime({}), { audio: "disabled" });
  assert.deepEqual(monitorRuntime({ ENABLE_REALTIME_TRANSCRIPTION: "false" }), { audio: "disabled" });
  assert.deepEqual(monitorRuntime({ ENABLE_REALTIME_TRANSCRIPTION: "true", AI_GATEWAY_API_KEY: "fixture-private-key" }), { audio: "enabled" });
});

test("audio setting updates remain visible without a new score sample", () => {
  const initial = { sessionId: "meeting", snapshot: null, history: [], expectedIntervalMs: null, runtime: monitorRuntime({}) };
  const updated = { ...initial, runtime: monitorRuntime({ ENABLE_REALTIME_TRANSCRIPTION: "true" }) };
  assert.equal(acceptMonitorResponse(initial, updated).runtime.audio, "enabled");
});
