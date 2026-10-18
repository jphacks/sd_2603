# 一次評価者の入力契約

共通annotation-rubric.mdと指定blind/パケットだけを読む。自分が作者のものは判定しない。raw/、author-plans/、generation-spec.json、generation intent、他者ラベル、Jev予測は判定中開かない。idは対応キーだけであり設計カテゴリを復元しない。自分の既知の作成例に似ていてもそのラベルを転用しない。

観測末尾まで全発話を読み、会話固有の根拠と0-based発話参照を付ける。ステータスはINTERVENE_DRIFT/INTERVENE_STALLED/OK。閾値・連続スコアから逆算せず、議題・フェーズの意味に基づく。静かな時間を時刻欠損から創作しない、未来の復帰を仮定しない、単なる脱線を自動的に停滞へ変えない。両方が独立に介入を要する時だけSTALLED優先。作者意図の件数比率に合わせない。

annotations/primary-{judge}-on-{packet}.jsonl に1行1例: id,status,reason,evidenceTurns,confidence(high/medium/low),uncertain(bool),alternativeStatus(null可),annotator(judge_a/judge_b/judge_c),humanReviewed=false,labelSource=independent_gpt_silver。理由は会話固有の一文以上。根拠は0-based。全idを網羅し、gold.actionを追加しない。設計からのラベル一括複写や語句だけの自動分類コードは使わず、このGPTが本文を読む。

作者AのJudgeはB、作者BのJudgeはC、作者CのJudgeはA。作者役と一次評価役は実際に別サブエージェント。判定結果はGPT silverであり人間gold・完全な基盤モデル独立性とは称さない。完了時は件数分布と不確実数を報告して止まる。アプリ/ランナー/Jev変更・Gateway禁止。commitは統括担当。
