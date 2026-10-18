# 実コーパス調査メモ（2026-10-18）

## 数え方と適用範囲

`research-dbdc3-real-breakdown-cases.jsonl` は **125の異なる実収集対話**から各1件を選んだ調査事例。125本の論文ではない。人間同士の会議でもなく、人間・チャットボットの雑談である。「対話継続を阻害する状態」の一次注釈付き実例という調査根拠として数える。これらを会議の脱線・停滞の正解ラベルと読み替えてはならない。DBDC-X→Jev-stalled/driftedの直接変換は実施していない。

会議には明示アジェンダ・意思決定目的が必要。雑談の話題転換はそれ自体で会議脱線にならず、単発の不適切応答も継続的停滞とは異なる。したがって125件の `jev_gold_label` はnull、`eligible_for_primary_meeting_validation_test` はfalse。②で作る会議スクリプトは別の合成／翻案データであり、この125件と同じ実会議評価集合として合算しない。

## DBDC3 — 採用した実会話事例125件

- 主催者データ公開: https://dbd-challenge.github.io/dbdc3/data/
- タスク定義: https://dbd-challenge.github.io/dbdc3/
- 元ファイル記号O/T/Xの定義: https://dbd-challenge.github.io/dbdc3/getting_started （O=not breakdown, T=possible breakdown, X=breakdown）
- 論文: Higashinaka, Funakoshi, Kobayashi, Inaba (2016), *The dialogue breakdown detection challenge: Task description, datasets, and evaluation metrics*, https://aclanthology.org/L16-1502/
- 原本: https://dbd-challenge.github.io/dbdc3/data/DBDC3.zip
- 版: 同梱00READMEのv1.2、2018-02-28。`dbdc3_revised/ja/eval`のみ使用。原版との二重計上を排除。
- 原本SHA-256: `736229795dc3732f8e6bb421f094dc820ef944fef9d9d320d4110ef992b60e85`
- **データの**ライセンス: MIT。主催者がデータページと同梱00READMEでデータへの適用を明示。`DBDC3-LICENSE.txt`・`DBDC3-00README.txt`を保存。
- 別配布の `DBDC3_context.zip` はCC-BY-SA-4.0。今回は取得・混入していない。
- 日本語150会話を調査し、初期プロンプト以外のsystemターンにX比率2/3以上がある125会話を抽出。各会話で最大X比率のターンを1件、同率なら最初を選択。ターゲット以前最大6ターンも原文保存。未来の応答を選択文脈に混ぜない。
- 件数: DCM 36、DIT 40、IRS 49。各ターゲット30人注釈、X最低20人。注釈者個人ID・タイムスタンプは出力しない。
- 各行にはarchive member、原本対話ID、turn index、member SHA-256、票数分布、抽出本文を記録。
- これは元注釈への選択一致であり、LLMの判定精度ではない。Jev、Gateway、モデル予測値を一切使っていない。

### 原本照合の再現

Python標準ライブラリのみ。既存zipを指定する場合:

```bash
python3 docs/jev-tuning/positive-expansion/verify_dbdc3_research_cases.py --archive /tmp/jev-corpus-cases/DBDC3.zip
```

`--archive`を省略すると公式zipを取得。原本ハッシュが一致しなければ停止する。検証は全150会話から抽出対象集合を再計算し、125件・対話一意性・原文範囲・全票数・各memberハッシュを照合する。2026-10-18に125件全てで成功。ネットワーク以外の依存なし。

## CaSiNo — 強い停滞候補2件（別領域）

- 著者公開repo: https://github.com/kushalchawla/CaSiNo
- データ説明: https://github.com/kushalchawla/CaSiNo/blob/main/data/README.md
- 論文: Chawla et al. (2021), https://aclanthology.org/2021.naacl-main.254/
- 取得版: `2f6ed4a6a55110152a7699fbaa8150d6036314be`
- データ `data/casino.json`: 1030件、SHA-256 `4f2c4560a0070906ed018c3f0766e35f8f8f31b36274ebf35b608621915744ab`。
- ライセンス: CC-BY-4.0。データを含むrepository説明がroot LICENSEへの参照を明示することを確認。一般的なコードのMITを流用したものではない。
- `research-casino-stall-candidates.jsonl`: dialogue142のturn6–17、dialogue939のturn12–28。双方に反復交渉の進行障害がある。939では条件不変・時間浪費が本文で明示される。交渉不成立／Walk-Awayの結果だけから停滞を決めていない。
- 2者の資源交渉。多人数会議と区別。独立したJev正解ラベルは未付与。原文抜粋のみ、翻訳なし、人口統計・性格属性を除外した。

## DeliData — 取得確認済み、正例数には未計上

- 著者公開: https://huggingface.co/datasets/gkaradzhov/DeliData
- 取得版: `dfccbf5d5206330d074a0d31e1a564b68bf6a4eb`
- 論文: Karadzhov, Stafford, Vlachos (2023), *DeliData: A dataset for deliberation in multi-party problem solving*, DOI 10.1145/3610056。
- 著者dataset cardがCC-BY-4.0を明示。
- 500会話別TSV、17610行（MESSAGE以外にINITIAL/SUBMITあり）。実体は`/tmp/jev-corpus-cases/delidata/`へ取得。
- グループ問題解決対話として領域適合性は高いが、None annotationは挨拶やためらいを含む。None→脱線、performance_change=0→停滞は誤り。Reasoning/Moderation/solutionなどの既存注釈はJevラベルでない。
- このため今回の正例125件に機械的に足さず、精査用予備sourceとしてのみ記録。

## CraigslistBargain — ライセンス確認不足で採用せず

著者: https://stanfordnlp.github.io/cocoa/ 、https://github.com/stanfordnlp/cocoa 。repoのMIT本文はsoftwareを対象とする一方、外部配布会話データへの明示適用を今回確認できていない。コードlicenseを原文会話へ流用しないため抽出・再配布なし。交渉不成立だけを停滞の証明としない点はCaSiNoと同じ。

配布READMEとLICENSEは内容を変えず、Gitで扱うため改行をLF・行末空白なしに正規化した。元バイト列は固定ZIP内に残る。

CaSiNo root LICENSEの固定版コピーを `CaSiNo-LICENSE.txt` に保存。主催者のDBDC3ライセンスと混ぜず、各行のlicenseとsourceを保持する。
