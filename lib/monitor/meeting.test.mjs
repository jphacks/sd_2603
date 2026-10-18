import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMeetingSelection } from "./meeting.ts";
import { createMonitorStore, monitorStore } from "./store.ts";
import { resolveMeetingSession } from "./resolve-meeting.ts";

test("Meet URLs and codes select the same meeting; Bot IDs remain supported", () => {
  const expected = { kind: "meeting", value: "https://meet.google.com/abc-defg-hij" };
  for (const value of ["abc-defg-hij", " ABC-DEFG-HIJ ", "https://meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij/?authuser=0#details"])
    assert.deepEqual(parseMeetingSelection(value), expected);
  assert.deepEqual(parseMeetingSelection("39b3a9c6-5125-465c-bbac-fc12cd74e531"), { kind: "session", value: "39b3a9c6-5125-465c-bbac-fc12cd74e531" });
  for (const value of ["", "https://example.com/abc-defg-hij", "http://meet.google.com/abc-defg-hij", "https://meet.google.com.evil.test/abc-defg-hij", "https://user:pass@meet.google.com/abc-defg-hij", "https://meet.google.com/abc-defg-hij/extra", "invalid input", "a".repeat(2049)])
    assert.equal(parseMeetingSelection(value), null);
});

test("joining maps its meeting URL to the returned Bot ID, including rejoining", () => {
  const store = createMonitorStore();
  store.activate("bot-a", "https://meet.google.com/abc-defg-hij?authuser=0");
  assert.equal(store.resolveMeeting("abc-defg-hij"), "bot-a");
  assert.equal(store.resolveMeeting("https://meet.google.com/xyz-abcd-efg"), null);
  store.activate("bot-b", "https://meet.google.com/abc-defg-hij");
  assert.equal(store.resolveMeeting("abc-defg-hij"), "bot-b");
});

test("CLI meeting state resolves only its matching URL and refreshes a rejoined Bot ID", async () => {
  const url = "https://meet.google.com/klm-nopq-rst";
  assert.equal(await resolveMeetingSession(url, async () => ({ id: "cli-a", meetingUrl: url })), "cli-a");
  assert.equal(monitorStore.resolveMeeting("klm-nopq-rst"), "cli-a");
  assert.equal(await resolveMeetingSession(url, async () => ({ id: "cli-b", meetingUrl: url })), "cli-b");
  assert.equal(await resolveMeetingSession("https://meet.google.com/uvw-xyza-bcd", async () => ({ id: "cli-b", meetingUrl: url })), null);
  assert.equal(await resolveMeetingSession("https://meet.google.com/uvw-xyza-bcd", async () => { throw new Error("No state"); }), null);
  assert.equal(await resolveMeetingSession(url, async () => { throw new Error("No state"); }), "cli-b");
});


test("multiple meeting references resolve their own Bot IDs without replacing each other", async () => {
  const a = "https://meet.google.com/aaa-bbbb-ccc";
  const b = "https://meet.google.com/ddd-eeee-fff";
  const load = async () => [{ id: "multi-a", meetingUrl: a }, { id: "multi-b", meetingUrl: b }];
  assert.equal(await resolveMeetingSession(a, load), "multi-a");
  assert.equal(await resolveMeetingSession(b, load), "multi-b");
  assert.equal(await resolveMeetingSession(a, load), "multi-a");
});
