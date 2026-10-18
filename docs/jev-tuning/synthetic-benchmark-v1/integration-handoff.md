# 実装担当への引き渡し — core500固定済み、追加500作成中

担当ブランチ: `codex/jev-tuning-data`。新データ: `docs/jev-tuning/synthetic-benchmark-v1/`。完成状態・件数は `progress.json`、取得する版はコミットIDと `casesHash` をセットで固定する。作成中のパケットを完成500件として扱わない。

入力は `cases.json` または `cases-train.json` / `cases-validation.json` / `cases-test.json`（JSON配列）。`agenda`は現在の目的・フェーズを含み、`phase`も別に保持。`transcript`は話者付き文字列配列。`secondsSinceLastIntervention=120`は合成入力として固定した値で観測時刻ではない。`dataKind=synthetic`を維持する。既存guardを回避するためrealやreal-roleplayへ偽装しない。

`gold.status`は独立したGPT silverの意味ラベル。作者意図はrawの別ファイル。`gold.action`は付けていない。WAIT/SILENCE、3連続スコア、閾値からgoldを再計算しない。`annotation.humanReviewed=false`を保ち、実録・人間gold・本番性能と報告しない。

モデルに渡すのはagenda/phase/transcript等の入力のみで、gold・annotation・作者の意図・reason・sourceGroup・familyごとの設計スロットをプロンプトへ含めない。sourceGroupとcvFoldは分割管理にだけ使う。Train内の5-foldはcvFold=0..4に従い、同一sourceGroupを分けない。Validationで閾値等を選び、Test予測を使って会話・goldやプロンプトを調整しない。

本担当はアプリ・評価ランナー・Jev設定を変更していない。合成Testを受け入れる明示対応は実装担当が行う。Gateway・有料モデルAPI・Jev実測は本作業では未使用。分類正解率80%達成の報告ではない。

本文・盲検パケットはハッシュ固定。意図と判定の不一致、低信頼、境界例、クラス別標本を別担当が再確認し、初回と再判定を保存する。採用結果と理由はadoption-log.jsonl。公開後の修正は版・case ID・旧新hashを明示し、凍結済みTestを黙って上書きしない。

500→1000拡張は新しい100系列だけを追加し、先の500件のsplitを変更しない。拡張作者は新しい会話コンテキストで既存Test本文を入力しない予定。固定済み500件はreleases/core500/に保存する。1,000件に届かない場合も500件の完了と監査を優先する。

## 先行500件の受け渡し

2026-10-18 10:22 JST固定。`releases/core500/cases.json`（Train300/Validation100/Test100）。casesHash=`49afcd95c9eb2888c27139586da9eb94d98d97cf9d27f1f0930dccba8fa2108b`。独立一次判定500件と第三者再判定39件、全不確実3件の再確認、重複/近傍/split/fold監査と一時コピー再現を完了。追加版ができるまでこの不変releaseを使える。追加100系列の執筆・判定中もcore500を変更しない。
