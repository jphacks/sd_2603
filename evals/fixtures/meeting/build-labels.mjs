import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = new URL("./", import.meta.url);
const descriptions = {
  on_track: "脱線していない（議題に沿っている）",
  productive_tangent: "脱線していない（有益な寄り道）",
  drift: "脱線している",
  stalled: "脱線していない（停滞している）",
  ambiguous: "判断が分かれる",
};
const sets = [
  ["derail", ["pilot"]],
  ["derail-hard", []],
  ["derail-multi", ["multi", "multi-mid"]],
];

// Labels apply to the exact transcript window, not individual audio turns.
const cases = sets.flatMap(([name, audioDirs]) => {
  const dataset = `datasets/${name}.json`;
  const rows = JSON.parse(readFileSync(new URL(dataset, root), "utf8"));
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  return rows.map((row) => {
    assert(Object.hasOwn(descriptions, row.label), `Unknown label: ${row.label}`);
    const audioFiles = audioDirs.flatMap((dir) =>
      [".wav", ".speech.wav"]
        .map((suffix) => `audio/${dir}/${row.id}${suffix}`)
        .filter((file) => existsSync(new URL(file, root))),
    );
    return {
      dataset,
      id: row.id,
      agenda: row.agenda,
      label: row.label,
      labelText: descriptions[row.label],
      isOffTopic: row.label === "ambiguous" ? null : row.label === "drift",
      ...(Object.hasOwn(row, "expectedNudge") ? { expectedNudge: row.expectedNudge } : {}),
      ...(row.humanAgreement ? { humanAgreement: row.humanAgreement } : {}),
      ...(row.group ? { group: row.group } : {}),
      ...(row.cutAt !== undefined ? { cutAt: row.cutAt } : {}),
      ...(row.note ? { note: row.note } : {}),
      audioFiles,
    };
  });
});

const cell = (value) => String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
const totals = Object.fromEntries(
  Object.keys(descriptions).map((label) => [label, cases.filter((row) => row.label === label).length]),
);
const counts = Object.entries(totals).map(([label, count]) => `- ${descriptions[label]}: ${count}件`).join("\n");
const sections = sets.map(([name]) => {
  const rows = cases.filter((row) => row.dataset === `datasets/${name}.json`);
  const lines = rows.map((row) => {
    const audio = row.audioFiles.map((file) => `[${file.slice(6)}](${file})`).join("<br>") || "—";
    return `| ${cell(row.id)} | ${row.labelText} | ${cell(row.agenda)} | ${audio} |`;
  });
  return `## ${name}\n\n| ID | 正解ラベル | 議題 | 対応する音声 |\n| --- | --- | --- | --- |\n${lines.join("\n")}`;
});
const markdown = `# 脱線判定の正解ラベル一覧

台本115ケースのラベルと、対応する会話全体の音声を一覧にしています。

${counts}

<code>labels.json</code> の <code>isOffTopic</code> は、脱線なら <code>true</code>、議題に沿った会話・有益な寄り道・停滞なら <code>false</code>、判断が分かれる場合は <code>null</code> です。停滞は脱線と別の状態です。

<code>label</code>、<code>expectedNudge</code>（指定がある場合）、<code>humanAgreement</code>、補足 <code>note</code> は台本の値を保持しています。<code>isOffTopic</code> はこの一覧で追加した上記ルールによる表現です。脱線の有無と介入すべきかどうかは別です。

ラベルは各台本の末尾時点の会話の状態を表します。途中で切ったケースは切り出しごとに異なるラベルを持ちます。下記の音声リンクは台本と同じ会話全体に対応するものだけです。短いサンプル・発言単位の音声・ノイズには、会話全体のラベルを自動では割り当てていません。

${sections.join("\n\n")}

再生成: <code>node evals/fixtures/meeting/build-labels.mjs</code>。更新確認のみ: 同じコマンドに <code>--check</code> を付けます。
`;

for (const [name, content] of [
  ["labels.json", JSON.stringify(cases, null, 2) + "\n"],
  ["LABELS.md", markdown],
]) {
  const file = new URL(name, root);
  if (process.argv.includes("--check")) {
    assert.equal(readFileSync(file, "utf8").replaceAll("\r\n", "\n"), content, `Regenerate ${name}`);
  } else {
    writeFileSync(file, content);
  }
}
console.log(`${cases.length} labeled cases, ${cases.reduce((sum, row) => sum + row.audioFiles.length, 0)} audio files: ${fileURLToPath(root)}`);
