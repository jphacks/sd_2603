import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGoogleMeetUrl } from "./meeting-url.ts";

test("normalizes a direct Google Meet URL", () => {
  assert.equal(
    normalizeGoogleMeetUrl("  https://meet.google.com/ABC-DEFG-HIJ?authuser=0  "),
    "https://meet.google.com/abc-defg-hij",
  );
});

test("rejects non-Meet, lookalike and malformed URLs", () => {
  for (const value of [
    "http://meet.google.com/abc-defg-hij",
    "https://meet.google.com.example/abc-defg-hij",
    "https://meet.google.com/lookup/team-room",
    "https://meet.google.com/abc",
    "https://tel.meet/abc-defg-hij",
  ]) {
    assert.equal(normalizeGoogleMeetUrl(value), null, value);
  }
});

