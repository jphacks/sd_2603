import assert from "node:assert/strict";
import test from "node:test";
import { startCameraOutput } from "./output.ts";

test("starts the webpage as the bot camera without creating a bot or recording", async () => {
  const status = await startCameraOutput({ apiKey: "test-key", region: "ap-northeast-1", botId: "bot-id", cameraUrl: "https://example.com/focus/camera/session#token=view-only" }, async (url, options) => {
    assert.equal(url, "https://ap-northeast-1.recall.ai/api/v1/bot/bot-id/output_media/");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, "Token test-key");
    assert.deepEqual(JSON.parse(options.body), { camera: { kind: "webpage", config: { url: "https://example.com/focus/camera/session#token=view-only" } } });
    return new Response("{}", { status: 200 });
  });
  assert.equal(status, 200);
});

test("returns upstream failure status without leaking its response", async () => {
  assert.equal(await startCameraOutput({ apiKey: "test-key", region: "us-east-1", botId: "id", cameraUrl: "https://example.com" }, async () => new Response("private-error-details", { status: 401 })), 401);
});
