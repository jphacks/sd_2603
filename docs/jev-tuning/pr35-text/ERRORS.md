# PR35 判定不一致の記録

不一致は参照ラベルとの不一致であり、人間が確認した誤りとは限らない。主gold・閾値の変更や除外は行わない。不確実例も主分母に保持する。

## current-v3 — 10件

| Dataset / source ID | GPT参照 | Jev | 不確実 | 代替参照 | D / S / R | 固定済み参照理由 |
| --- | --- | --- | --- | --- | --- | --- |
| derail-hard / `am-scheduling-grind` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.040/0.700/0.210 | 各曜日の制約は増えており、空き枠なしと整理した段階。 |
| derail-hard / `g3-index-rebuild@7` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.030/0.660/0.360 | 夜間案への海外利用者の制約を示し無停止方式を新たに問う。 |
| derail-multi / `e1-layout@full` | INTERVENE_STALLED | OK | False | — | 0.050/0.490/0.220 | 互いに判断を委ねる応答が続き、再質問しても意見が増えず持越し。 |
| derail-hard / `am-wrapup-chat` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.910/0.040/0.090 | リリース日と凍結日を決定済みで、その後の打ち上げ手配を相談。 |
| derail-hard / `g7-template-loop@7` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.050/0.780/0.350 | 頻出だけのテンプレ化という絞込み案と選定作業の新たな懸念が出る。 |
| derail-hard / `am-silent-thinking` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.040/0.600/0.150 | 参照権限を確認し新しいエクスポートの問いに思考時間を取る段階。 |
| derail-hard / `am-newbie-lecture` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.900/0.240/0.240 | 認可とトークンの違いを説明し、設計に関わる共通理解を増やす寄道。 |
| derail-hard / `ot-heated-substantive` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.040/0.740/0.240 | 移行ガイド、旧版期限、大口顧客の反発など反論ごとに新しい論点が増える。 |
| derail-hard / `g8-self-correct@7` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.650/0.070/0.150 | 受入期間とメンターを決めた後の過去インターンに関する短い関連雑談。 |
| derail-hard / `g1-office-move@7` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.620/0.090/0.040 | 三ロールのたたき台作成後に引越しの短い応答があるが脱線の持続は未確認。 |

## frozen-selected-v4 — 7件

| Dataset / source ID | GPT参照 | Jev | 不確実 | 代替参照 | D / S / R | 固定済み参照理由 |
| --- | --- | --- | --- | --- | --- | --- |
| derail-multi / `e1-layout@full` | INTERVENE_STALLED | OK | False | — | 0.030/0.400/0.350 | 互いに判断を委ねる応答が続き、再質問しても意見が増えず持越し。 |
| derail-multi / `e1-layout@35` | INTERVENE_STALLED | OK | True | OK | 0.030/0.440/0.320 | 複数人が意見を出さず部長や他者へ判断を委ね、再促しも実らない。 |
| derail-hard / `am-wrapup-chat` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.960/0.060/0.060 | リリース日と凍結日を決定済みで、その後の打ち上げ手配を相談。 |
| derail-hard / `am-newbie-lecture` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.850/0.080/0.160 | 認可とトークンの違いを説明し、設計に関わる共通理解を増やす寄道。 |
| derail-hard / `ot-heated-substantive` | OK | INTERVENE_STALLED | True | INTERVENE_STALLED | 0.030/0.630/0.780 | 移行ガイド、旧版期限、大口顧客の反発など反論ごとに新しい論点が増える。 |
| derail-hard / `g8-self-correct@7` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.920/0.060/0.120 | 受入期間とメンターを決めた後の過去インターンに関する短い関連雑談。 |
| derail-hard / `g1-office-move@7` | OK | INTERVENE_DRIFT | True | INTERVENE_DRIFT | 0.880/0.090/0.040 | 三ロールのたたき台作成後に引越しの短い応答があるが脱線の持続は未確認。 |
