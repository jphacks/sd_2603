import assert from "node:assert/strict";
import { test } from "node:test";
import { createDeviceStore } from "./state.ts";
import { buildDevicePayload, shortAgenda } from "./payload.ts";
import { withDeviceControls } from "./judge.ts";
import { silenceJudge } from "../judge/silence.ts";
import { createMonitorStore } from "../monitor/store.ts";

const input = { agenda: "a", transcript: ["a", "b", "c"], secondsSinceLastIntervention: 10 };
const judgeOf = (action, reason = "Discussion appears off agenda") =>
  async () => ({ action, reason, message: null });

test("intervention sets a view and increments the cue", () => {
  let time = 1000;
  const store = createDeviceStore(() => time);
  store.intervened("s", "off_agenda");
  store.resolve("s"); // back on track in between, so no escalation
  store.intervened("s", "stalled");
  const state = store.read("s");
  assert.deepEqual(state.cue, { id: "summarize", seq: 2 });
  const monitor = createMonitorStore(() => time).read("s");
  assert.equal(buildDevicePayload(monitor, state, null, time + 1000).view, "stalled");
  assert.equal(buildDevicePayload(monitor, state, null, time + 1000).face, "nudge");
  assert.equal(buildDevicePayload(monitor, state, null, time + 31_000).view, "stalled", "the card stays until the camera is cleared");
  store.cleared("s");
  assert.equal(buildDevicePayload(monitor, store.read("s"), null, time + 31_000).view, "idle");
  assert.equal(buildDevicePayload(monitor, store.read("s"), null, time + 31_000).face, "watching");
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
  assert.equal(buildDevicePayload(envelope, store.read("s"), null, 40_000).state, "intervene", "held until the camera is cleared");
  assert.equal(buildDevicePayload(envelope, store.read("s"), null, 1000 + 180_000).state, "wait", "never held past the maximum");
  store.cleared("s");
  assert.equal(buildDevicePayload(envelope, store.read("s"), null, 40_000).state, "wait");
});

test("interventions without a return escalate to the angry face; a return or a silence nudge does not", () => {
  const store = createDeviceStore(() => 1000);
  const monitor = createMonitorStore(() => 1000).read("s");
  const payload = () => buildDevicePayload(monitor, store.read("s"), null, 2000);
  assert.equal(store.nextLevel("s", "off_agenda"), 1);
  store.intervened("s", "off_agenda");
  assert.deepEqual([payload().face, payload().level, payload().title], ["redirect", 1, "議題に戻りませんか？"]);
  store.intervened("s", "stalled", "silence");
  assert.deepEqual([payload().face, payload().level], ["nudge", 1], "silence nudges never escalate");
  assert.equal(store.nextLevel("s", "off_agenda"), 2);
  store.intervened("s", "off_agenda");
  assert.deepEqual([payload().face, payload().level, payload().title], ["angry", 2, "議題に戻りましょう"]);
  store.intervened("s", "stalled");
  assert.deepEqual([payload().face, payload().title], ["angry", "一度整理しましょう"]);
  store.resolve("s");
  assert.equal(store.nextLevel("s", "off_agenda"), 1, "a return starts over");
  store.intervened("s", "off_agenda");
  assert.equal(payload().face, "redirect");
});

test("a card left up for the whole hold is given up on: the next card starts over", () => {
  let time = 1000;
  const store = createDeviceStore(() => time);
  store.intervened("s", "off_agenda");
  time += 179_000;
  assert.equal(store.nextLevel("s", "off_agenda"), 2, "still up, so the next card escalates");
  time += 1_000;
  assert.equal(store.nextLevel("s", "off_agenda"), 1);
  store.intervened("s", "off_agenda");
  assert.equal(store.read("s").lastLevel, 1);
  store.intervened("s", "off_agenda");
  assert.equal(store.read("s").lastLevel, 2, "the new card counts from one");
});

test("a silence nudge shows the nudge face with a short question and the summarize cue", () => {
  const store = createDeviceStore(() => 1000);
  store.intervened("s", "stalled", "silence");
  const monitor = createMonitorStore(() => 1000).read("s");
  const payload = buildDevicePayload(monitor, store.read("s"), null, 2000);
  assert.equal(payload.view, "stalled");
  assert.equal(payload.face, "nudge");
  assert.equal(payload.title, "何か気になる点は？");
  assert.ok(Array.from(payload.title).length <= 12);
  assert.deepEqual(payload.cue, { id: "summarize", seq: 1 });
  store.intervened("s", "stalled");
  assert.equal(buildDevicePayload(monitor, store.read("s"), null, 2000).title, "意見を整理しませんか？");
  store.intervened("s", "off_agenda");
  assert.equal(store.read("s").lastCause, null);
});

test("silence judging respects cooldown and mute without consuming a manual request", async () => {
  const store = createDeviceStore();
  const judge = withDeviceControls("s", silenceJudge, store, { manual: false });
  assert.deepEqual(await judge({ ...input, secondsSinceLastIntervention: 59 }), { action: "SILENCE", reason: "Cooldown active", message: null, manual: false });
  const nudge = await judge({ ...input, secondsSinceLastIntervention: 60 });
  assert.equal(nudge.action, "INTERVENE");
  assert.equal(nudge.reason, "Meeting has gone silent");
  assert.equal(nudge.message, "ここまでで、気になる点はありますか？");
  store.mute("s");
  store.requestManual("s");
  assert.equal((await judge({ ...input, secondsSinceLastIntervention: 90 })).action, "WAIT");
  assert.equal(store.takeManual("s"), true, "the pending manual request is left for the next real judgement");
});

test("a manual request during silence keeps the silence reason", async () => {
  const store = createDeviceStore();
  const judge = withDeviceControls("s", silenceJudge, store);
  store.requestManual("s");
  const forced = await judge({ ...input, secondsSinceLastIntervention: 10 });
  assert.equal(forced.manual, true);
  assert.equal(forced.reason, "Manual request");
  store.requestManual("s");
  const silent = await judge({ ...input, secondsSinceLastIntervention: 90 });
  assert.equal(silent.reason, "Meeting has gone silent");
});
