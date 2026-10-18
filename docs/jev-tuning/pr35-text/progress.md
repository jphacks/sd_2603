# PR #35 text評価 — 逐次進捗

## 計画固定

- 出典PR: https://github.com/jphacks/sd_2603/pull/35
- 対象コミット: `90d82bd6968b4d2163c01a72319003869df2b7b7`。
- 対象はdatasetsのcanvas54/derail36/derail-hard47/derail-multi32、計169台本。WAV、ASR、Canvas画像の認識は対象外。
- 入力はagendaと話者付きutterancesのtextのみ。原本label/humanAgreement/note/scenario/category/group/phase/expectedNudge等を除き、IDを匿名化。既存humanAgreementを人間確認の証明として使わない。
- 新しいラベル担当が全169件を独立に意味3分類。境界例は除外せずuncertainと代替ラベルを保存。GPT silverで人間goldではない。
- ラベル完成・schema/根拠・inputHash検証・hash固定が終わるまで、Jev呼び出しとテスト担当の実測開始を行わない。
- 別の新しいテスト担当が固定ラベルを受領して実測。質問・閾値の探索やラベル修正はしない。
- 比較設定は現行v3/0.6・0.6・0.6/WAIT0.4と前回選択v4/0.5・0.6・0.8/WAIT0.4。モデルJev1.14.0、入力は両設定・ラベル担当と同一のagenda/text。phaseを推測・追記しない。
- 判定だけを比較するため前回介入から120秒を合成条件として固定。発話数が少ないケースも除外せず、既存runtimeゲートを適用し、影響数を明示。
- Accuracy/Macro-F1/混同行列/クラス別Precision・Recall/介入二値/データセット別/uncertain別を記録。169件には同系列の切断・長短版があり、独立169会議とは称さない。原本groupは分布報告に使えるが閾値探索には使わない。
- Gatewayは最初10件で速度/料金を再点検し、以降成功キャッシュを再利用。最大400試行・保守的予約$1、並列3。失敗分のみ再開し、API失敗を正解や成功として扱わない。
- 現在ブランチ`codex/jev-pr35-evaluation`。未追跡の既存`docs/jevno-demo-script.md`には触れない。PRやstagingはマージしない。

## 進捗

- PR取得と4つの原本JSONのSHA固定が完了。169件すべてを匿名化し、agenda/textの完全一致重複は0。
- ラベル担当`pr35_labeler`（履歴を引き継がない新しい担当）を開始。Jev呼び出し0。テスト担当はまだ起動していない。

- 独立ラベル169件が完了。全ID・入力hash・根拠index・schemaを統合側でも照合し、label-freeze.jsonへ原本hashを固定。分布{'OK': 124, 'INTERVENE_DRIFT': 27, 'INTERVENE_STALLED': 18}、uncertain24件。除外なし。固定前Jev呼び出し0。これから別の新しいテスト担当を起動する。
