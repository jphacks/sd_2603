import assert from "node:assert/strict";
import { test } from "node:test";
import { outputVideo, renderVideoJpeg, videoCopy, videoSvg } from "./video.ts";

test("off-agenda card uses agenda text and escapes markup", () => {
  const view = { kind: "off_agenda", agenda: "次の<重要>&リリース" };
  const copy = videoCopy(view);
  assert.match(copy.title, /次の<重要>&リリース/);
  const svg = videoSvg(view);
  assert.match(svg, /次の&lt;重要&gt;&amp;リリース/);
  assert.doesNotMatch(svg, /次の<重要>/);
});

test("common and longer agendas remain legible across one or two lines", () => {
  const common = videoCopy({ kind: "off_agenda", agenda: "次のリリース方針を決める" });
  assert.equal(common.title, "「次のリリース方針を決める」");
  const long = videoSvg({ kind: "off_agenda", agenda: "次のリリース方針と予算と担当者と公開日を決める" });
  assert.match(long, /y="350"/);
  assert.match(long, /y="418"/);
  assert.match(long, /というアジェンダに戻りましょう/);
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
