import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeviceStore } from "./state.ts";
import { buildDevicePayload, shortAgenda } from "./payload.ts";
import { withDeviceControls } from "./judge.ts";
import { createMonitorStore } from "../monitor/store.ts";

const input = { agenda: "a", transcript: ["a", "b", "c"], secondsSinceLastIntervention: 10 };
const judgeOf = (action, reason = "Discussion appears off agenda") =>
  async () => ({ action, reason, message: null });

test("intervention sets a view and increments the cue", () => {
  let time = 1000;
  const store = createDeviceStore(() => time);
  store.intervened("s", "off_agenda");
  store.intervened("s", "stalled");
  const state = store.read("s");
  assert.deepEqual(state.cue, { id: "summarize", seq: 2 });
  const monitor = createMonitorStore(() => time).read("s");
  assert.equal(buildDevicePayload(monitor, state, null, time + 1000).view, "stalled");
  assert.equal(buildDevicePayload(monitor, state, null, time + 1000).face, "nudge");
  assert.equal(buildDevicePayload(monitor, state, null, time + 31_000).view, "idle");
  assert.equal(buildDevicePayload(monitor, state, null, time + 31_000).face, "watching");
});

test("payload reports unknown state and null scores without data", () => {
  const store = createDeviceStore(() => 1);
  const monitor = createMonitorStore(() => 1).read("s");
  const payload = buildDevicePayload(monitor, store.read("s"), null, 1);
  assert.equal(payload.state, "unknown");
  assert.equal(payload.scores, null);
  assert.equal(payload.cue, null);
});

test("scores are converted to whole percentages", () => {
  const monitorStore = createMonitorStore(() => 5);
  monitorStore.record("s", input, {
    action: "WAIT", reason: "Conversation needs more observation", message: null,
    diagnostic: { drifted: 0.824, stalled: 0.15, tangentIsRelevant: 0.2, interveneNow: 0.3, model: "m", latencyMs: 1, questionVersion: "v" },
  });
  const payload = buildDevicePayload(monitorStore.read("s"), createDeviceStore(() => 5).read("s"), null, 5);
  assert.deepEqual(payload.scores, { drift: 82, stall: 15, tangent: 20 });
  assert.equal(payload.state, "wait");
});

test("agenda is shortened and strips the goal label", () => {
  assert.equal(shortAgenda("目的: 次のリリース方針と費用を決める\n1. 案A"),"次のリリース方針と費用…");
  assert.equal(shortAgenda("目的: 短い"), "短い");
  assert.equal(shortAgenda(null), null);
});

test("manual request forces an intervention once", async () => {
  const store = createDeviceStore();
  const judge = withDeviceControls("s", judgeOf("SILENCE", "Cooldown active"), store);
  store.requestManual("s");
  const forced = await judge(input);
  assert.equal(forced.action, "INTERVENE");
  assert.equal(forced.manual, true);
  assert.equal(forced.reason, "Manual request");
  assert.ok(forced.message);
  assert.equal((await judge(input)).action, "SILENCE");
});

test("a model cannot manufacture the trusted manual flag or bypass device mute", async () => {
  const store = createDeviceStore();
  const judge = withDeviceControls("s", async () => ({
    action: "INTERVENE", reason: "Manual request", message: "return", manual: true,
  }), store);
  assert.equal((await judge(input)).manual, false);
  store.mute("s");
  const muted = await judge(input);
  assert.equal(muted.action, "WAIT");
  assert.equal(muted.manual, false);
});

test("muted tangent downgrades an intervention until unmuted", async () => {
  const store = createDeviceStore();
  const judge = withDeviceControls("s", judgeOf("INTERVENE"), store);
  store.mute("s");
  assert.equal((await judge(input)).action, "WAIT");
  store.unmute("s");
  assert.equal((await judge(input)).action, "INTERVENE");
});

test("mute expires after the hold time", () => {
  let time = 0;
  const store = createDeviceStore(() => time);
  store.mute("s");
  assert.notEqual(store.read("s").mutedUntil, null);
  time = 121_000;
  assert.equal(store.read("s").mutedUntil, null);
});

test("an expired intervention no longer reports the intervene state", () => {
  const monitorStore = createMonitorStore(() => 1000);
  monitorStore.record("s", input, { action: "INTERVENE", reason: "Discussion appears off agenda", message: null });
  const store = createDeviceStore(() => 1000);
  store.intervened("s", "off_agenda");
  const envelope = monitorStore.read("s");
  assert.equal(buildDevicePayload(envelope, store.read("s"), null, 2000).state, "intervene");
  assert.equal(buildDevicePayload(envelope, store.read("s"), null, 40_000).state, "wait");
});
