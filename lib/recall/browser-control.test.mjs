import assert from "node:assert/strict";
import { test } from "node:test";
import { invokeBrowserControl } from "./browser-control.ts";
import { controlAccessError } from "./controller.ts";

test("browser control denies by default before invoking a privileged handler", async () => {
  let called = false;
  const result = await invokeBrowserControl(false, async () => { called = true; return Response.json({}); }, {}, "fixture-control-".repeat(3));
  assert.equal(result.status, 403);
  assert.equal(called, false);
});

test("enabled browser control authenticates entirely on the server", async () => {
  const secret = "fixture-control-".repeat(3);
  const payload = { meetingUrl: "https://meet.google.com/abc-defg-hij", agenda: "test" };
  const result = await invokeBrowserControl(true, async request => {
    assert.equal(controlAccessError(request, secret), null);
    assert.deepEqual(await request.json(), payload);
    return Response.json({ id: "fixture-bot" });
  }, payload, ` ${secret}\n`);
  assert.equal(result.ok, true);
  assert.equal(result.data.id, "fixture-bot");
  assert.equal(JSON.stringify(result).includes(secret), false);
});

test("missing server credential remains blocked instead of bypassing authentication", async () => {
  const result = await invokeBrowserControl(true, async request => controlAccessError(request, undefined), {}, undefined);
  assert.equal(result.status, 503);
  assert.equal(result.data.code, "CONTROL_NOT_CONFIGURED");
});
