import assert from "node:assert/strict";
import test from "node:test";
import { applyAction, cameraState } from "./model.ts";

function fixture() {
  return { id: crypto.randomUUID(), revision: 0, title: "定例", agenda: "非公開の議題", notes: [{ id: "private", text: "非公開のメモ", createdAt: "2026-10-17T00:00:00Z" }], proposal: null, sharedMessage: null, closed: false, expiresAt: Date.now() + 60000 };
}

test("camera demo modes are shared with the output without exposing private session data", () => {
  for (const mode of ["off-track", "silence", "on-track"]) {
    const session = applyAction({ ...fixture(), sharedMessage: "old message" }, { action: "cameraDemo", mode });
    assert.equal(cameraState(session).cameraDemoMode, mode);
    assert.equal(session.sharedMessage, null);
    assert.equal(JSON.stringify(cameraState(session)).includes("非公開"), false);
    assert.equal(applyAction(session, { action: "clear" }).cameraDemoMode, null);
    assert.throws(() => applyAction({ ...session, closed: true }, { action: "cameraDemo", mode }));
  }
});

test("private proposal and notes never enter the camera response", () => {
  const session = applyAction(fixture(), { action: "propose", message: "非公開の提案" });
  assert.equal(session.proposal.state, "pending");
  assert.deepEqual(Object.keys(cameraState(session)).sort(), ["cameraDemoMode", "closed", "revision", "sharedMessage", "title"]);
  assert.equal(JSON.stringify(cameraState(session)).includes("非公開"), false);
});

test("defer keeps the camera private; sharing requires the current proposal", () => {
  const session = applyAction(fixture(), { action: "propose", message: "一度まとめましょう" });
  const deferred = applyAction(session, { action: "defer", proposalId: session.proposal.id });
  assert.equal(deferred.sharedMessage, null);
  assert.throws(() => applyAction(deferred, { action: "share", proposalId: session.proposal.id }));
  assert.throws(() => applyAction(session, { action: "share", proposalId: crypto.randomUUID() }));
  const shared = applyAction(session, { action: "share", proposalId: session.proposal.id });
  assert.equal(cameraState(shared).sharedMessage, "一度まとめましょう");
  assert.equal(applyAction(shared, { action: "clear" }).sharedMessage, null);
});

test("close clears published content and rejects later changes", () => {
  const session = { ...fixture(), sharedMessage: "提案" };
  const closed = applyAction(session, { action: "close" });
  assert.equal(closed.sharedMessage, null);
  assert.equal(cameraState(closed).closed, true);
  assert.throws(() => applyAction(closed, { action: "propose", message: "再表示" }));
});

test("agenda attachment and its note update atomically", () => {
  const next = applyAction(fixture(), { action: "note", text: "agenda.mdを添付", agenda: "新しい議題" });
  assert.equal(next.agenda, "新しい議題");
  assert.equal(next.notes.at(-1).text, "agenda.mdを添付");
  assert.equal(next.revision, 1);
});
