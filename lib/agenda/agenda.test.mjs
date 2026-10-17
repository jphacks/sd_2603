import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { AGENDA_CHAT_PROMPT } from "../../scripts/recall.mjs";
import { receiveChatWebhook } from "./receive.ts";
import {
  AGENDA_CHAR_LIMIT,
  SOURCE_CHAR_LIMIT,
  agendaForJudge,
  agendaSource,
  clearAgendas,
  getAgenda,
  googleDocExportUrl,
  renderAgenda,
  saveAgenda,
} from "./agenda.ts";
import { fetchPublicDocument } from "./document.ts";
import { ingestChatMessage } from "./ingest.ts";
import { verifyRecallWebhook } from "../recall/webhook.ts";

const BOT_ID = "00000000-0000-4000-8000-000000000001";
const SECRET = `whsec_${Buffer.from("agenda-webhook-secret").toString("base64")}`;

function organized() {
  return {
    goal: "次のリリース方針を決める",
    items: [
      { title: "提供機能", outcome: "検索か通知かを一つに決める" },
      { title: "公開日", outcome: "日付を一つに決める" },
      { title: "担当", outcome: "担当者を一人決める" },
    ],
  };
}

test("public Google Docs are the only fetchable agenda URL", () => {
  const id = "abc-DEF_1234";
  assert.equal(
    googleDocExportUrl(`https://docs.google.com/document/d/${id}/edit?usp=sharing`),
    `https://docs.google.com/document/d/${id}/export?format=txt`,
  );
  for (const blocked of [
    `http://docs.google.com/document/d/${id}`,
    `https://docs.google.com.evil.com/document/d/${id}`,
    `https://drive.google.com/file/d/${id}`,
    `https://docs.google.com/spreadsheets/d/${id}`,
    `https://user:pass@docs.google.com/document/d/${id}`,
    "https://example.com/document/d/abcdefghij",
  ]) {
    assert.equal(googleDocExportUrl(blocked), null);
  }
});

test("one chat message reads only the first public Google Doc", () => {
  const first = "abcdefghij1111";
  const second = "abcdefghij2222";
  const source = agendaSource(
    `資料 https://docs.google.com/document/d/${first}/edit と https://docs.google.com/document/d/${second}/edit`,
  );
  assert.equal(source.kind, "document");
  assert.equal(source.exportUrl, `https://docs.google.com/document/d/${first}/export?format=txt`);
});

test("chat without a marker is ignored and other hosts are not fetched", () => {
  assert.equal(agendaSource("週末の予定を話しましょう"), null);
  const linked = agendaSource("アジェンダ https://example.com/minutes.pdf");
  assert.equal(linked.kind, "text");
  assert.equal(agendaSource("https://docs.google.com.evil.com/document/d/abcdefghij"), null);
});

test("a long note becomes a decision agenda within 500 characters", async () => {
  clearAgendas();
  const seen = [];
  const note = `アジェンダ\n前回は検索基盤の障害を確認した。${"経緯を繰り返す。".repeat(2000)}`;
  const result = await ingestChatMessage({
    botId: BOT_ID,
    participantName: "坂口",
    text: note,
  }, {
    organize: async (source) => {
      seen.push(source);
      return organized();
    },
  });
  assert.equal(result.updated, true);
  assert.ok(seen[0].length <= SOURCE_CHAR_LIMIT);
  assert.match(result.agenda, /^目的: 次のリリース方針を決める/);
  assert.ok(result.agenda.length <= AGENDA_CHAR_LIMIT);
  assert.equal((result.agenda.match(/^\d\./gm) ?? []).length, 3);
  assert.equal(agendaForJudge(BOT_ID, "呼び出し側の文"), result.agenda);
  clearAgendas();
});

test("render drops trailing items until the judge string fits", () => {
  const agenda = renderAgenda({
    goal: "方針を決める",
    items: [
      { title: "一つ目", outcome: "あ".repeat(800) },
      { title: "二つ目", outcome: "い".repeat(800) },
    ],
  });
  assert.ok(agenda.length <= AGENDA_CHAR_LIMIT);
  assert.match(agenda, /^目的: 方針を決める/);
  assert.equal(agenda.includes("二つ目"), false);
});

test("a later chat agenda is kept together with the earlier one", () => {
  clearAgendas();
  saveAgenda(BOT_ID, organized());
  const second = {
    goal: "来期の予算を決める",
    items: [{ title: "上限", outcome: "金額を一つに決める" }],
  };
  const combined = saveAgenda(BOT_ID, second);
  assert.match(combined, /目的: 次のリリース方針を決める/);
  assert.match(combined, /目的: 来期の予算を決める/);
  assert.equal(getAgenda(BOT_ID), combined);
  clearAgendas();
});

test("a failed document keeps the previous agenda", async () => {
  clearAgendas();
  saveAgenda(BOT_ID, organized());
  const previous = getAgenda(BOT_ID);
  const result = await ingestChatMessage({
    botId: BOT_ID,
    participantName: "坂口",
    text: "https://docs.google.com/document/d/abcdefghij1234",
  }, {
    fetch: async () => new Response("<!DOCTYPE html><html>login</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
    organize: async () => {
      throw new Error("organize should not run");
    },
  });
  assert.equal(result.reason, "kept");
  assert.equal(result.agenda, previous);
  clearAgendas();
});

test("document fetch rejects a redirect away from Google", async () => {
  const page = "https://docs.google.com/document/d/abcdefghij1234/export?format=txt";
  await assert.rejects(
    () => fetchPublicDocument(page, async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/secret" },
    })),
    /取得先が不正/,
  );
  const text = await fetchPublicDocument(page, async (input) => {
    if (String(input) === page) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://doc-0.googleusercontent.com/export" },
      });
    }
    return new Response("今日決めること", { status: 200, headers: { "content-type": "text/plain" } });
  });
  assert.equal(text, "今日決めること");
});

test("the bot prompt and unrelated chat do not replace an agenda", async () => {
  clearAgendas();
  saveAgenda(BOT_ID, organized());
  const previous = getAgenda(BOT_ID);
  const own = await ingestChatMessage({
    botId: BOT_ID,
    participantName: "MTG Lab",
    text: AGENDA_CHAT_PROMPT,
  }, { organize: async () => organized() });
  const noise = await ingestChatMessage({
    botId: BOT_ID,
    participantName: "坂口",
    text: "了解です",
  });
  assert.equal(own.reason, "bot");
  assert.equal(noise.reason, "ignored");
  assert.equal(getAgenda(BOT_ID), previous);
  clearAgendas();
});

function signedRequest(payload, { secret = SECRET, timestamp = 1_700_000_000, signature } = {}) {
  const id = "msg_test";
  const stamp = String(timestamp);
  const mac = createHmac("sha256", Buffer.from(secret.slice("whsec_".length), "base64"))
    .update(`${id}.${stamp}.${payload}`)
    .digest("base64");
  return new Request("https://demo.example/api/recall/chat", {
    method: "POST",
    headers: {
      "webhook-id": id,
      "webhook-timestamp": stamp,
      "webhook-signature": signature ?? `v1,${mac}`,
    },
    body: payload,
  });
}

test("webhook signature accepts the current secret and rejects a mismatch", () => {
  const payload = "{\"event\":\"participant_events.join\"}";
  const request = signedRequest(payload);
  assert.doesNotThrow(() => verifyRecallWebhook({
    secret: SECRET,
    headers: request.headers,
    payload,
    nowSeconds: 1_700_000_000,
  }));
  assert.throws(() => verifyRecallWebhook({
    secret: SECRET,
    headers: signedRequest(payload, { signature: "v1,aaaa" }).headers,
    payload,
    nowSeconds: 1_700_000_000,
  }));
});

test("chat webhook ignores unsigned calls and non-agenda messages", async () => {
  clearAgendas();
  const unsigned = await receiveChatWebhook({ payload: "{}", headers: {}, secret: SECRET });
  assert.equal(unsigned.status, 401);

  const payload = JSON.stringify({
    event: "participant_events.chat_message",
    data: {
      data: { participant: { name: "坂口" }, data: { text: "了解です" } },
      bot: { id: BOT_ID },
    },
  });
  const request = signedRequest(payload, { timestamp: 1_700_000_100 });
  const accepted = await receiveChatWebhook({
    payload,
    headers: request.headers,
    secret: SECRET,
  }, { nowSeconds: 1_700_000_100 });
  assert.equal(accepted.status, 200);
  assert.deepEqual(accepted.body, { updated: false, reason: "ignored" });
  assert.equal(getAgenda(BOT_ID), null);
  clearAgendas();
});
