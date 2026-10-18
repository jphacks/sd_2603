# 作者作業指示

資料整理・仕様・分割は本文生成前に固定済み（4cf3744）。自身の author-plans/{a,b,c}.json と research-map.md と annotation-rubric.md だけを参照。他作者のplan・raw・意図・他者ラベル・既存Test本文・Jev予測は開かない。

各familyの場面、フェーズ、現象から**新しい日本語の具体的な会話**を個別に執筆する。議題名・名詞差し替えだけの共通テンプレートや決まり文句の接ぎ木で件数を作らない。同familyの5例は問題と正常の対として関係するが、末尾の一文だけで機械的に反転させる安易な構成ばかりにしない。発言順、参加人数、根拠・手続き・寄り道の内容、自然な口語、明示的な休憩許可、修復経過等を変える。近似は同familyに留める。

各例は6〜12発話（基本6〜8、各発言おおむね15〜60字）。agendaは会議の目的と現在のphaseを含む。phaseは別フィールドにも記録。正例なら観測末尾で問題が残ること、正常なら目的に対する具体的な進展や許可等が読み取れること。単なる長さ・キーワード・『停滞です』『脱線です』等の露骨なメタ宣言だけへ依存しない。設計上のカテゴリはgoldではなく独立Judgeが後で判断する。

raw/{author}-{batch}.jsonl は1行1会話、フィールドid,familyId,agenda,phase,transcript（話者付きstring配列）,author。idはplanのdesignSlotsから正確に使う。本文にdesignIntentや作者理由を入れない。意図は別ファイル raw/{author}-{batch}-intents.jsonl にid,designIntent,authorReasonを記録する。全台本は具体的な原文として記述し、プログラムの名詞入替で量産しない。書込み後、id集合・6〜12発話・5例/familyを検証。commitやPushは統括担当のみ。

まず**担当内で最初のTrain10系列=50件だけ**をbatch01として作り、完了したら止めて報告する。他の作者の50件を独立Judgeとして判定するタスクを次に受ける。Trainがすべて完成するまで自分のValidation/Test本文を作らない。評価者として他担当Testを読むのも、全Train執筆終了後にする。

Gateway・有料モデルAPIは禁止。このGPTセッションで執筆する。アプリ・ランナー・Jev設定・既存成果物は変更しない。新ディレクトリ内の自分のrawだけ編集する。作業場所: /home/fc6.ctrl/.codex/worktrees/jev-tuning-data/meeting-facilitator。シェルsandbox起動不可なら明示担当依頼に基づくrequire_escalatedを使う。

拡張を実行する場合は作者D/E/Fが author-plans/d.json,e.json,f.json を同じ契約で使う。新しいサブエージェント会話で開始し、core500のTest本文は一切入力しない。拡張でも自身のTrainを全て書いた後にheldoutを執筆する。
