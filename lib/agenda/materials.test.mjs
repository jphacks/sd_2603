import assert from "node:assert/strict";
import test from "node:test";
import { SOURCE_CHAR_LIMIT, clearAgendas, getAgenda } from "./agenda.ts";
import { MAX_MATERIAL_BYTES, ingestJoinMaterials } from "./materials.ts";

const BOT_ID = "00000000-0000-4000-8000-000000000001";

function agenda(goal) {
  return {
    goal,
    items: [{ title: "項目", outcome: "決まっている" }],
  };
}

function file(name, text) {
  return { name, bytes: new TextEncoder().encode(text) };
}

test("two text files become two agendas and skip the judge", async () => {
  clearAgendas();
  const seen = [];
  const result = await ingestJoinMaterials({
    botId: BOT_ID,
    files: [file("first.txt", "検索を決める"), file("second.md", "公開日を決める")],
  }, {
    organize: async (source) => {
      seen.push(source);
      return agenda(source);
    },
  });
  assert.equal(result.saved, 2);
  assert.deepEqual(seen, ["検索を決める", "公開日を決める"]);
  assert.match(getAgenda(BOT_ID), /目的: 検索を決める/);
  assert.match(getAgenda(BOT_ID), /目的: 公開日を決める/);
  clearAgendas();
});

test("the organizer receives the file text even when it contains a document URL", async () => {
  clearAgendas();
  const source = "今日決めること\nhttps://docs.google.com/document/d/abcdefghij1234";
  let seen = "";
  const result = await ingestJoinMaterials({
    botId: BOT_ID,
    files: [file("proposal.txt", source)],
  }, {
    organize: async (text) => {
      seen = text;
      return agenda("方針を決める");
    },
  });
  assert.equal(seen, source);
  assert.equal(result.saved, 1);
  clearAgendas();
});

test("an unreadable file is skipped and a readable file is kept", async () => {
  clearAgendas();
  const result = await ingestJoinMaterials({
    botId: BOT_ID,
    files: [
      { name: "scan.pdf", bytes: new Uint8Array([1, 2, 3]) },
      file("notes.txt", "担当を決める"),
      { name: "binary.txt", bytes: Uint8Array.of(0x61, 0x00, 0x62) },
    ],
  }, {
    organize: async (source) => agenda(source),
  });
  assert.equal(result.saved, 1);
  assert.equal(result.items[0].message, "読めませんでした");
  assert.equal(result.items[2].message, "読めませんでした");
  assert.match(getAgenda(BOT_ID), /目的: 担当を決める/);
  clearAgendas();
});

test("an oversized file is dropped without organizing it", async () => {
  clearAgendas();
  const result = await ingestJoinMaterials({
    botId: BOT_ID,
    files: [{ name: "big.txt", bytes: null, tooLarge: true }, file("ok.txt", "方針を決める")],
  }, {
    organize: async (source) => {
      assert.ok(source.length <= SOURCE_CHAR_LIMIT);
      assert.equal(MAX_MATERIAL_BYTES >= 100_000, true);
      return agenda("方針を決める");
    },
  });
  assert.equal(result.items[0].message, "ファイルが大きすぎます");
  assert.equal(result.saved, 1);
  clearAgendas();
});

test("only the first five materials are organized", async () => {
  clearAgendas();
  let calls = 0;
  const files = Array.from({ length: 6 }, (_, index) => file(`item-${index}.txt`, `項目${index}`));
  const result = await ingestJoinMaterials({ botId: BOT_ID, files }, {
    organize: async () => {
      calls += 1;
      return agenda("方針を決める");
    },
  });
  assert.equal(calls, 5);
  assert.equal(result.saved, 5);
  assert.equal(result.items[5].message, "5件までです");
  clearAgendas();
});

test("no materials leaves the stored agenda unchanged", async () => {
  clearAgendas();
  const result = await ingestJoinMaterials({ botId: BOT_ID, files: [] }, {
    organize: async () => {
      throw new Error("organize should not run");
    },
  });
  assert.equal(result.saved, 0);
  assert.equal(getAgenda(BOT_ID), null);
  clearAgendas();
});
