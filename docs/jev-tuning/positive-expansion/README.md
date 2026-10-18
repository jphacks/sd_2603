# 脱線・停滞の正例追加 — 調査と評価用会話

ユーザー指定の①調査100件以上、②Validation/Test会話100件以上に対応。統合側の実際のブランチ・判定定義を読み、予測値を見ずにデータを作成した。**Jevは実行しておらず、80%達成の結果ではない。**

## ① 調査155記録

| 種別 | 件数 | 根拠・適用範囲 |
|---|---:|---|
| 異なる論文・データセット資料 | 28 | 30登録から同一URLの2重複を除去。会議障害の直接研究と隣接研究を区別 |
| 実収集の日本語対話破綻例 | 125 | DBDC3の異なる125対話。各30人中20人以上が破綻(X)と注釈。人間とbotの会話であり、会議goldではない |
| 人間同士の交渉停滞候補 | 2 | CaSiNo。拒否と条件不変の反復を含む。会議ではなく、独立したJev gold未付与 |
| 合計 | 155 | 創作会話はこの数に含めない。同じ会話を複数回数えない |

入口: [調査一覧155件](research-index.md)、[機械可読調査簿](research-ledger.jsonl)。出典の定義・ページ・確認範囲は `research-drift.jsonl` / `research-stalled.jsonl`。論文の存在だけで本文や再配布許諾まで確認済みとしない。

会議を直接扱う中核根拠は、Lehmann-Willenbrock et al. (2013) *A Sequential Analysis of Procedural Meeting Communication* のTable1にある目的と無関係な例・独話、Kauffeld & Lehmann-Willenbrock (2012) *Meetings Matter* の非機能的相互作用、Kauffeld & Meyers (2009) *Complaint and solution-oriented circles*、不満循環の逐次分析など。否定意見・雑談を一律に異常とせず、有益な寄り道・修復・問題把握の進展という反例も記録した。

実対話125件には元ファイル・会話ID・対象発話・抽出範囲・本文・人手票・原本/member hashを保存。全件の内容も別途読み、具体的な障害を `research-barriers-final.jsonl` に要約した。内訳は無関係な応答64、反復8、非整合38、共通理解失敗10、文脈不足5。これらの内容分類はGPTによる観察で、人手X注釈そのものとは区別する。

**実会議の脱線・停滞正例を125件確保したとは主張しない。** DBDCには会議agendaがなく、単発の不適切応答と会議の持続的な停滞は同義でない。すべて `jev_gold_label=null`、会議の主評価適格=falseを保持。具体的な会議の正例は②の新規創作として用意した。

原本、版、権利表示、再現は [実コーパス調査メモ](research-corpus-notes.md)。DBDC主データは主催者がMIT適用を明示し、別のCC BY-SA4.0 context配布は混ぜていない。CaSiNoはCC BY4.0、license全文を別保存した。権利未確認のCraigslist原文は再配布せず、DeliDataのNone注釈を脱線へ自動変換しなかった。

## ② 会議用の正例111件＋境界例1件

文献が定義した機序を、2人のGPT作者が新しい日本語の会議へ具体化した。**実録の抜粋・翻訳ではない。** 各7〜12発話で、会議の目的、phase、クールダウン120秒を明示。本文の全く同じ例や、議題だけを変えた例は最終版にない。

作者と別のGPT評価者が112会話を全文読み、生成意図・他者ラベル・Jev予測を見ずに判定した。結果は脱線56／停滞56。方法論の対立が建設的比較とも読める1件をuncertainとして主評価から除外し、**主評価用111件（脱線56／停滞55）**を出力した。銀ラベルであり、独立した人間goldではない。

| 用途 | 件数 | 脱線 | 停滞 | 推奨ファイル |
|---|---:|---:|---:|---|
| Validation・主評価 | 55 | 28 | 27 | `data/primary-positive-validation.json` |
| Test・主評価 | 56 | 28 | 28 | `data/primary-positive-test.json` |
| 境界例・診断用 | 1 | 0 | 1（代替OK） | `data/uncertain-cases.jsonl` |
| 境界込みValidation/Test | 112 | 56 | 56 | `data/positive-validation.json` / `positive-test.json` |

全112会話を読む: [Validation56会話](data/positive-validation.md)、[Test56会話](data/positive-test.md)。各例に研究参照・ラベル・個別理由・根拠発話・入力hash・生成系列を付与。

- 28の生成機序族×4例。**112独立した現象・実会議とは称さない**。同族4例は必ず同じsplitに置いた。Trainには追加しない。
- 非冒頭の発話本文の完全重複0。全ペアの本文5文字gram Jaccard>=0.65は0。既存Train等との正規化完全一致0。ただし共通の定義や一般的な語彙まで未見という意味ではない。
- 当初v1は同じ発話の議題差替えが多いとレビューで分かり、全112例を個別に書き直した。`authored-cases.jsonl` / v1ラベルは設計履歴のみで最終評価には使用しない。
- `authored-v2-a/b.jsonl` は版管理した作者出力、`intent-v2-a/b.jsonl` は生成意図。主判定は別の `labels-authored-v2.jsonl`。作者意図と一致させるための再ラベルはしていない。
- `blind-authored-v2.jsonl` のcanonical JSON hashを全ラベルと照合。ラベルを付けた後に本文を変更すると検証が失敗する。
- 観測末尾の状態を判断し、架空の未来の復帰や時刻欠損からの沈黙は使わない。許可休憩、有益な寄り道、進行中の比較を除外した、明確な正例中心の診断セット。

## 統合側との定義と形式

[判定契約](definition-contract.md)、[統合手順と差分](integration-handoff.md)、初回・再確認のcommit/hashを `integration-snapshot.json` / `integration-final-check.json` に保存。

作成中に統合側はHEAD7f66361、v3、Jev1.14.0へ更新された。質問の意味、停滞優先、閾値は読取当初から変わっていないことを差分で確認した。アプリ・名前・判定関数は変更していない。

**現行統合側のprovenance guardは合成holdoutを拒否する。** 111件が一般スキーマを満たすことはNode24で検証したが、`Synthetic case outside train`となることも確認済み。kindを実録と偽って回避していない。取り込みには統合担当が、ユーザー指定の新しい「文献から作成した評価用合成」契約を明示的にサポートする必要がある。

## 評価で言えること

正例のみなので、脱線／停滞のRecall、見逃し率、API失敗率の診断に使う。これだけで誤介入率・3クラス全体Accuracy80%を証明しない。既存正常例と合算する場合も、実録／創作ごとの結果と構成比率を併記する。

生成者は意味定義を揃えるため統合側v1/v2/v3質問を読んだ。このため質問設計から独立した外部ベンチマークではない。Jevの予測・score cacheを見て会話やgoldを変更してはいない。Validationでのみ選択し、Testはfreeze後の最終評価に使う。

## 再現と監査

Python3標準ライブラリ。保存済みの個別創作・独立ラベルを固定入力として、梱包・hash・系列・件数・根拠・重複を再検証する。GPTに同じ回答を再生成させる手順ではない。

```bash
python3 docs/jev-tuning/positive-expansion/scripts/package_positive.py
python3 docs/jev-tuning/positive-expansion/scripts/reproduce_positive.py
python3 docs/jev-tuning/positive-expansion/verify_dbdc3_research_cases.py --archive /tmp/jev-corpus-cases/DBDC3.zip
```

DBDCの`--archive`省略時は主催者の固定ZIPを取得し、SHA256が違えば停止する。梱包を一時コピーで再現してバイト一致確認済み。ラベル後の本文改変・split改変を拒否する負の検証も実施した。監査結果とファイルhashは `positive-audit.json`。Gateway・モデルAPI呼び出しは0回。

統合側のオフライン形状確認を再実行する場合（Node24）:

```bash
node docs/jev-tuning/positive-expansion/scripts/check_integration.mjs /path/to/integration-checkout
```

結果は `integration-schema-check.json`。一般形状の検証成功と、現行provenance制約の不適合を別項目で示し、不適合を隠して全チェック成功とはしない。
