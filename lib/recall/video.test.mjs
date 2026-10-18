import assert from "node:assert/strict";
import { test } from "node:test";
import { outputVideo, renderVideoJpeg, videoCopy, videoSvg } from "./video.ts";

test("off-agenda card uses agenda text and escapes markup", () => {
  const view = { kind: "off_agenda", agenda: "次の<重要>&リリース" };
  const copy = videoCopy(view);
  assert.match(copy.message, /次の<重要>&リリース/);
  const svg = videoSvg(view);
  assert.match(svg, /次の&lt;重要&gt;&amp;リリース/);
  assert.doesNotMatch(svg, /次の<重要>/);
});

test("short agendas fit one line and longer ones wrap with a truncated agenda", () => {
  assert.deepEqual(videoCopy({ kind: "off_agenda", agenda: "予算の配分" }).lines, ["「予算の配分」に戻りませんか？"]);
  assert.deepEqual(videoCopy({ kind: "off_agenda", agenda: "次のリリース方針を決める" }).lines,
    ["「次のリリース方針を決める」", "に戻りませんか？"]);
  const long = videoCopy({ kind: "off_agenda", agenda: "次のリリース方針と予算と担当者と公開日を決める" });
  assert.equal(long.message, "「次のリリース方針と予算と担当者と公開日を決める」に戻りませんか？");
  assert.deepEqual(long.lines, ["「次のリリース方針と予算と担当…」", "に戻りませんか？"]);
  assert.equal(videoSvg({ kind: "off_agenda", agenda: "次のリリース方針と予算と担当者と公開日を決める" }).match(/class="line"/g).length, 2);
});

test("each view shows its own face, and the idle card has no text", () => {
  const idle = videoSvg({ kind: "idle" });
  assert.equal(videoCopy({ kind: "idle" }).message, null);
  assert.doesNotMatch(idle, /class="line"/);
  assert.match(idle, /M65\.8 141H119\.8/);
  assert.doesNotMatch(idle, /M317 5\.5/);
  const stalled = videoSvg({ kind: "stalled" });
  assert.match(stalled, /<circle cx="156\.5" cy="209"/);
  assert.match(stalled, /ここまでの意見を、整理しませんか？/);
  assert.match(videoSvg({ kind: "off_agenda", agenda: "予算" }), /M119 202H180/);
});

test("renders a Recall-compatible JPEG", async () => {
  const jpeg = await renderVideoJpeg({ kind: "off_agenda", agenda: "次のリリース方針を決める" });
  assert.deepEqual([...jpeg.subarray(0, 2)], [0xff, 0xd8]);
  assert.ok(jpeg.byteLength < 1_300_000);
});

test("posts JPEG to the fixed regional Recall endpoint", async () => {
  let call;
  await outputVideo("00000000-0000-4000-8000-000000000000", Buffer.from([0xff, 0xd8]), {
    apiKey: "test-key",
    region: "us-west-2",
    fetch: async (url, options) => {
      call = { url, options };
      return new Response(null, { status: 200 });
    },
  });
  assert.equal(call.url, "https://us-west-2.recall.ai/api/v1/bot/00000000-0000-4000-8000-000000000000/output_video/");
  assert.equal(call.options.headers.Authorization, "test-key");
  assert.deepEqual(JSON.parse(call.options.body), { kind: "jpeg", b64_data: "/9g=" });
});

test("rejects an arbitrary upstream region", async () => {
  await assert.rejects(outputVideo("bot", Buffer.from([]), {
    apiKey: "test-key", region: "attacker.example",
  }), { kind: "config" });
});

test("does not send video without a Recall API key", async () => {
  let called = false;
  await assert.rejects(outputVideo("bot", Buffer.from([]), {
    apiKey: "", region: "us-east-1",
    fetch: async () => { called = true; return new Response(null, { status: 200 }); },
  }), { kind: "config" });
  assert.equal(called, false);
});

test("classifies Recall HTTP errors without exposing response content", async () => {
  for (const [providerStatus, kind] of [[403, "auth"], [429, "rate_limit"], [502, "upstream"]]) {
    await assert.rejects(outputVideo("bot", Buffer.from([1]), {
      apiKey: "private-key", region: "us-east-1",
      fetch: async () => new Response("private response body", { status: providerStatus }),
    }), (error) => {
      assert.equal(error.kind, kind);
      assert.deepEqual(error.diagnostic, { stage: "http", providerStatus });
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /private|recall\.ai|bot/);
      return true;
    });
  }
});

test("classifies DNS and timeout failures without exposing exception content", async () => {
  const failures = [
    { error: new TypeError("private URL and key", { cause: Object.assign(new Error("private host"), { code: "ENOTFOUND" }) }),
      diagnostic: { stage: "transport", errorName: "TypeError", causeCode: "ENOTFOUND" } },
    { error: new DOMException("private URL", "TimeoutError"),
      diagnostic: { stage: "transport", errorName: "TimeoutError" } },
    { error: Object.assign(new Error("private URL"), { code: "PRIVATE_CODE" }),
      diagnostic: { stage: "transport", errorName: "OtherError" } },
  ];
  for (const { error: failure, diagnostic } of failures) {
    await assert.rejects(outputVideo("bot", Buffer.from([1]), {
      apiKey: "private-key", region: "us-east-1", fetch: async () => { throw failure; },
    }), (error) => {
      assert.equal(error.kind, "upstream");
      assert.deepEqual(error.diagnostic, diagnostic);
      assert.doesNotMatch(JSON.stringify(error.diagnostic), /private|recall\.ai|bot/);
      return true;
    });
  }
});

test("a silence nudge keeps the nudge face but asks a question that invites speech", () => {
  const view = { kind: "stalled", cause: "silence" };
  const copy = videoCopy(view);
  assert.equal(copy.message, "ここまでで、気になる点はありますか？");
  assert.deepEqual(copy.lines, ["ここまでで、", "気になる点はありますか？"]);
  for (const line of copy.lines) assert.ok(Array.from(line).length <= 17);
  const svg = videoSvg(view);
  assert.match(svg, /<circle cx="156\.5" cy="209"/);
  assert.doesNotMatch(svg, /整理しませんか/);
  assert.equal(videoCopy({ kind: "stalled", cause: "repetition" }).message, videoCopy({ kind: "stalled" }).message);
});
