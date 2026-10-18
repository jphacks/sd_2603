# 日本語合成会議ベンチマーク v1

**core500は2026-10-18 10:22 JSTに固定済み。追加500件は作成中。** 実装担当はまず `releases/core500/cases.json` または同ディレクトリのsplit別JSONを取得できる。ルートのcases.jsonは拡張中に増えるため、評価時はreleaseとコミットを固定する。

## 固定500件

- Train300 / Validation100 / Test100、100の新規場面系列。
- 設計: 脱線150 / 停滞150 / 紛らわしい正常150 / 明確に正常50。
- 独立一次判定: DRIFT150 / STALLED150 / OK200。設計意図は評価者に非公開で、結果を意図へ合わせていない。差分0件もそのまま記録。
- 作者3名と別の一次Judge3役を循環割当。第三の担当者が39件を再判定。不確実3件は全て再確認し保持、再判定不一致0件。GPT同士の一致であり人間goldや完全に独立した基盤モデルではない。
- 発話数は原則6〜12。各台本は新規に個別執筆し、名詞だけの置換で量産していない。文字列近傍・完全重複・既存Testへの近似再利用を検査。
- sourceGroupが対になる5例を束ね、Train内cvFoldも同系列で固定。Train fold0..4は各60件。
- ケース本文とラベル・分割・生成仕様にhashを付与。一時コピーで梱包と監査の8成果物がバイト一致。

**すべて日本語の合成会議、独立GPT silver。実録・人間の認定正解・本番精度ではない。Jevの採点・精度80%達成の結果ではない。** Gateway・有料モデルAPIは使っていない。

## 入口

| ファイル | 役割 |
|---|---|
| `releases/core500/` | 先行500件の不変スナップショット、split別JSONとmanifest |
| `cases.json`, `cases-{train,validation,test}.json` | 現在の組立版。追加作成中は未固定の増分を含む |
| `generation-spec.json`, `split-manifest.json`, `spec-hashes.json` | 本文量産前に固定したcore500の場面・意図・分割・hash |
| `extension-spec*.json`, `extension-split-manifest.json` | 追加100系列の事前仕様。core500のsplitは変更しない |
| `research-map.md`, `research-references.json` | 既存28資料の再利用、24現象と正常反例、確認深度・留保 |
| `raw/*-intents.jsonl` | 作者意図。独立Judgeには渡さない |
| `blind/` | agenda/phase/transcriptと対応IDのみ。渡した本文はhash固定 |
| `annotations/primary-*.jsonl`, `review-*.jsonl` | 初回・再判定を別々に保持 |
| `adoption-log.jsonl` | 初回を暫定採用し、異論・不確実性を残す理由 |
| `duplicate-audit.json`, `case-label-hashes.jsonl` | 重複・split/fold・既存Testとの文字列近傍、本文とラベルの対応hash |
| `progress.json`, `../progress-pro.md` | 件数、分布、未完了、担当、段階Push |
| `integration-handoff.md` | 合成Testの明示取り込み、スキーマと評価上の注意 |

研究mapは生成前の調査記録として固定したので、冒頭の「本文未生成」はその記録時点を指す。現在の完成状態はprogressとreleaseを見る。既存8997c70・96102b3、positive-expansionを再利用し、資料調査をやり直していない。DBDC125破綻を会議goldに変換せず、既存111正例や旧Test/派生本文をTrainへ移していない。研究上の原則だけを使った新規場面であり、文献が個々の創作台本を検証したという意味ではない。原文転載・データライセンスの新たな推定は行っていない。

## 再現

Python標準ライブラリだけで実行する。API呼出しなし。

```bash
python3 docs/jev-tuning/synthetic-benchmark-v1/scripts/package.py
python3 docs/jev-tuning/synthetic-benchmark-v1/scripts/audit.py
python3 docs/jev-tuning/synthetic-benchmark-v1/scripts/reproduce.py
```

reproduceは一時コピーで処理し、元の固定releaseを上書きしない。GPTの同じ返答を再生成するのでなく、版管理した個別台本と独立ラベルを入力として同じパケット・監査を再構成する。rawとprimaryはcompleted-packetsで完成確認したものだけ取り込む。対応hashはUTF-8・キーソート・空白なしのcanonical JSONにSHA256。

独立評価者へ渡すのは共通ルーブリックと議題・フェーズ・会話だけ。理由は会話固有、根拠発話は0始まり。gold.actionや連続スコアは付けず、現行閾値からstatusを逆算しない。secondsSinceLastIntervention=120は合成設定で観測時刻ではない。時刻欠損から沈黙や未来の復帰を推測しない。

## 拡張と評価

拡張作者D/E/Fは履歴のない新しいGPTサブエージェント会話から開始し、core500のTest本文を入力しない。まず自分のTrain全件を書き、その後heldoutへ進む。sourceGroup101〜200だけを追加し、固定500件の本文・ラベル・split変更は監査で拒否する。1,000件が完成・監査された場合のみfull1000 releaseを公開する。

アプリ・評価ランナー・Jev設定・表示名称は変更していない。合成Testを受け入れる明示対応は実装担当が行い、dataKindを実録に偽装しない。モデルにはgold/annotation/作者意図を渡さず、Train内5-foldはsourceGroup/cvFoldを守る。Test予測を使って台本・正解やプロンプトを調整しない。低信頼・設計との不一致を精度改善のため除外しない。
