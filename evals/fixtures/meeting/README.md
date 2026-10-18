# 会議テスト素材

会議の判定や音声認識のテストに使う台本・合成音声です。このディレクトリのファイルだけで利用できます。

## 台本

| ファイル | 件数 | 内容 |
| --- | ---: | --- |
| `replays/sample.json` | 1 | 発言ごとの待ち時間 `delayMs` を持つ短い会話 |
| `datasets/derail.json` | 36 | 議題に沿った会話、有益な寄り道、脱線、停滞など |
| `datasets/derail-hard.json` | 47 | 長い会話や、同じ会話を途中で切った難しいケース |
| `datasets/derail-multi.json` | 32 | 大人数・上下関係・割り込みを含むケース |
| `datasets/canvas.json` | 54 | フロー図・表の提示、待機、沈黙の判定用ケース |

`datasets/` は TypeScript データを展開した JSON です。議題 `agenda`、話者・発言 `utterances`、ラベルや補足情報を含みます。TypeScript データと生成用ヘルパーは `source/` にあります。

## 脱線しているかの正解ラベル

**[ラベル一覧](LABELS.md)** に脱線判定用115ケースの日本語ラベルと、対応するWAVへのリンクをまとめています。機械的に読む場合は [`labels.json`](labels.json) を使用してください。

| `label` | 意味 | `isOffTopic` |
| --- | --- | --- |
| `on_track` | 議題に沿っている | `false` |
| `productive_tangent` | 短く本筋を外れるが、議題に役立つ寄り道 | `false` |
| `drift` | 脱線している | `true` |
| `stalled` | 議題は変わっていないが停滞している | `false` |
| `ambiguous` | 判断が分かれる | `null` |

ラベルは台本JSONの `label` にも保存されています。`isOffTopic` は無関係な話への脱線かを表し、介入の要否とは別です。`expectedIntervention` は、指定された `expectedNudge` を優先し、未指定の場合は `drift` / `stalled` を `true`、`on_track` / `productive_tangent` を `false`、`ambiguous` を `null` とした項目です。途中で切った台本のラベルや判断の補足も保持しています。

`ambiguous` は状態判定の精度集計から除外し、介入の評価は `humanAgreement` の `clear` / `split` を別集計します。Canvas用54ケースのラベルは図表提示の判定を表すため、この脱線ラベル一覧には含めていません。ラベルの定義・集計ルール・音声条件は [評価データの使い方](EVAL_DATA_GUIDE.md) を参照してください。

```javascript
import { readFileSync } from "node:fs";

const labels = JSON.parse(
  readFileSync("evals/fixtures/meeting/labels.json", "utf8"),
);
const answer = labels.find((item) => item.audioFiles.includes("audio/pilot/dr-trip-late.wav"));
// answer.label === "drift", answer.isOffTopic === true
```

リポジトリのルートで、例えば次のように読み込めます。追加パッケージや API キーは不要です。

```javascript
import { readFileSync } from "node:fs";

const cases = JSON.parse(
  readFileSync("evals/fixtures/meeting/datasets/derail.json", "utf8"),
);
const meeting = cases.find((item) => item.id === "ot-sprint");
const input = {
  agenda: meeting.agenda,
  transcript: meeting.utterances.map(({ speaker, text }) => `${speaker}: ${text}`),
  secondsSinceLastIntervention: 300,
};
```

`input` はこのリポジトリの `JudgeInput` に渡せる形です。`on_track` / `productive_tangent` / `drift` / `stalled` / `ambiguous` や Canvas 用ラベルを使用しているため、既存の `jev-cases.json` の期待アクションとは個別に対応を決めてください。既存の評価コマンドが自動でこれらを読み込むわけではありません。

## 音声

WAV は **664 ファイル、約 190 MiB**。分割音声・キャッシュ・ノイズも含みます。

| 場所 | 内容・台本との対応 |
| --- | --- |
| `audio/sample*.wav` | 聞き比べ用の短い合成音声 |
| `audio/pilot/<id>.wav` | `datasets/derail.json` の同じ `id` の会話（12 件） |
| `audio/pilot/<id>.txt` | 検証で得られた音声認識結果。正解台本は上記 JSON |
| `audio/multi/<id>.wav` | `datasets/derail-multi.json` の同じ `id` の会話（10 件） |
| `audio/multi-mid/<id>.wav` | 同じ会話の別条件での合成音声（10 件） |
| `audio/multi*/<id>.speech.wav` | ノイズを加える前の音声 |
| `audio/multi/cache/` | 発言ごとの生成音声キャッシュ |
| `audio/multi-mid/turns/` | 速度などを加工した発言単位の音声 |
| `audio/multi*/noise-*.wav` | ノイズ素材 |
| `audio/multi*/_chunk.wav` | 検証時に残った音声チャンク |
| `audio/replay/` | 音声認識の欠落・無音区間を確認する短いフレーズ |

例えば `audio/pilot/ot-sprint.wav` と `datasets/derail.json` の `ot-sprint` を組み合わせて使用できます。JSON の全ケースに音声があるわけではありません。

短いサンプルの台本は以下の対応です（発言番号は 1 から数えます）。

| 音声 | `datasets/derail.json` 内の台本 |
| --- | --- |
| `sample1_kore_ontrack.wav` | `ot-share-link` の発言 1〜3 |
| `sample2_puck_drift.wav` | `dr-trip-late` の発言 3〜5 |
| `sample3_charon_stalled.wav` | `st-pricing` の発言 4〜6 |
| `sample4_lite_kore.wav` | `ot-sprint` の発言 1〜3 |
| `sample5_dialogue.wav` | `ot-hackathon` の発言 1〜6 から、最初の 2 話者の発言を抽出 |

`audio/replay/` の台本:

| ファイル | 発話 |
| --- | --- |
| `p1.wav` | これ今聞こえてますか？ |
| `p2.wav` | なんでこんなに品質悪いんですか？ |
| `p3.wav` | えーと、来週の会議なんですけど、場所を変えたほうがいいかなと思っていて。 |
| `p4.wav` | ちょっと待ってください、今の数字、もう一回言ってもらえますか。 |
| `p2pause.wav` | なんでこんなに〔1.2 秒の無音〕品質悪いんですか？ |

台本・ラベルは合成データ、音声は TTS です。実会議での精度を示すデータではありません。

## ファイルの検証

`manifest.json` にファイルの相対パス、バイト数、SHA-256 と JSON データセットの件数を記録しています。ハッシュは `audio/`、`replays/`、`source/` 内のファイルが対象です。`.gitattributes` でこれらのファイルの改行自動変換を無効にし、チェックアウト後も同じバイト列を保持します。ライセンスは `source/LICENSE` を参照してください。
