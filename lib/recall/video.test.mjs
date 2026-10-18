import assert from "node:assert/strict";
import { test } from "node:test";
import { outputMeetingView, outputVideo, renderVideoJpeg, videoCopy, videoSvg } from "./video.ts";

for (const [kind, mode] of [["idle", "on-track"], ["off_agenda", "off-track"], ["stalled", "silence"]]) {
  test(`webpage camera follows ${kind} using the existing animated page, not legacy JPEG output`, async () => {
    const calls = [];
    await outputMeetingView("test-bot", Buffer.from("jpeg"), { kind, agenda: "Agenda" }, {
      env: { RECALL_API_KEY: "test", RECALL_REGION: "ap-northeast-1", RECALL_CAMERA_URL: "https://camera.example.test/recall/camera" },
      fetch: async (url, init) => { calls.push({ url, init }); return new Response(null, { status: init.method === "DELETE" ? 204 : 200 }); },
    });
    assert.deepEqual(calls.map(call => call.init.method), ["DELETE", "POST"]);
    assert.ok(calls.every(call => call.url.endsWith("/bot/test-bot/output_media/")));
    assert.deepEqual(JSON.parse(calls[0].init.body), { camera: true });
    const camera = JSON.parse(calls[1].init.body).camera;
    assert.equal(camera.kind, "webpage");
    assert.equal(new URL(camera.config.url).searchParams.get("mode"), mode);
    assert.equal(new URL(camera.config.url).searchParams.get("embed"), "1");
  });
}

test("failed camera stop is not retried or followed by an ambiguous start", async () => {
  let calls = 0;
  await assert.rejects(outputMeetingView("bot", Buffer.from("jpeg"), { kind: "idle" }, {
    env: { RECALL_API_KEY: "test", RECALL_REGION: "ap-northeast-1", RECALL_CAMERA_URL: "https://camera.example.test/recall/camera" },
    fetch: async () => { calls++; return new Response(null, { status: 403 }); },
  }), { kind: "auth" });
  assert.equal(calls, 1);
});

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
