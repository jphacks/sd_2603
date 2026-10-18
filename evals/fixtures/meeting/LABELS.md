# 脱線判定の正解ラベル一覧

台本115ケースのラベルと、対応する会話全体の音声を一覧にしています。

- 脱線していない（議題に沿っている）: 38件
- 脱線していない（有益な寄り道）: 14件
- 脱線している: 24件
- 脱線していない（停滞している）: 16件
- 判断が分かれる: 23件

<code>labels.json</code> の <code>isOffTopic</code> は、脱線なら <code>true</code>、議題に沿った会話・有益な寄り道・停滞なら <code>false</code>、判断が分かれる場合は <code>null</code> です。停滞は脱線と別の状態です。

<code>label</code>、<code>expectedNudge</code>（指定がある場合）、<code>humanAgreement</code>、補足 <code>note</code> は台本の値を保持しています。<code>isOffTopic</code> はこの一覧で追加した上記ルールによる表現です。脱線の有無と介入すべきかどうかは別です。

ラベルは各台本の末尾時点の会話の状態を表します。途中で切ったケースは切り出しごとに異なるラベルを持ちます。下記の音声リンクは台本と同じ会話全体に対応するものだけです。短いサンプル・発言単位の音声・ノイズには、会話全体のラベルを自動では割り当てていません。

## derail

| ID | 正解ラベル | 議題 | 対応する音声 |
| --- | --- | --- | --- |
| ot-share-link | 脱線していない（議題に沿っている） | 新機能「共有リンク」の仕様を固める | [pilot/ot-share-link.wav](audio/pilot/ot-share-link.wav) |
| ot-sprint | 脱線していない（議題に沿っている） | スプリント12のレビューと次スプリントの優先順位づけ | [pilot/ot-sprint.wav](audio/pilot/ot-sprint.wav) |
| ot-hackathon | 脱線していない（議題に沿っている） | 社内ハッカソンの日程と会場の決定 | [pilot/ot-hackathon.wav](audio/pilot/ot-hackathon.wav) |
| ot-hiring | 脱線していない（議題に沿っている） | エンジニア採用の面接フローの見直し | — |
| ot-budget | 脱線していない（議題に沿っている） | 来期のマーケティング予算の配分 | — |
| ot-incident | 脱線していない（議題に沿っている） | 先週のサーバー障害の原因と再発防止策 | — |
| ot-design | 脱線していない（議題に沿っている） | ログイン画面のデザインレビュー | — |
| ot-onboarding | 脱線していない（議題に沿っている） | 新入社員のオンボーディング計画 | — |
| pt-share-expiry | 脱線していない（有益な寄り道） | 新機能「共有リンク」の仕様を固める | [pilot/pt-share-expiry.wav](audio/pilot/pt-share-expiry.wav) |
| pt-budget-actuals | 脱線していない（有益な寄り道） | 来期のマーケティング予算の配分 | [pilot/pt-budget-actuals.wav](audio/pilot/pt-budget-actuals.wav) |
| pt-hackathon-wifi | 脱線していない（有益な寄り道） | 社内ハッカソンの日程と会場の決定 | [pilot/pt-hackathon-wifi.wav](audio/pilot/pt-hackathon-wifi.wav) |
| pt-hiring-others | 脱線していない（有益な寄り道） | エンジニア採用の面接フローの見直し | — |
| pt-incident-monitor | 脱線していない（有益な寄り道） | 先週のサーバー障害の原因と再発防止策 | — |
| pt-sprint-velocity | 脱線していない（有益な寄り道） | スプリント12のレビューと次スプリントの優先順位づけ | — |
| dr-trip-late | 脱線している | 新機能「共有リンク」の仕様を固める | [pilot/dr-trip-late.wav](audio/pilot/dr-trip-late.wav) |
| dr-budget-hr-mid | 脱線している | 来期のマーケティング予算の配分 | [pilot/dr-budget-hr-mid.wav](audio/pilot/dr-budget-hr-mid.wav) |
| dr-hiring-drama-early | 脱線している | エンジニア採用の面接フローの見直し | [pilot/dr-hiring-drama-early.wav](audio/pilot/dr-hiring-drama-early.wav) |
| dr-incident-lunch | 脱線している | 先週のサーバー障害の原因と再発防止策 | — |
| dr-hackathon-otherproj | 脱線している | 社内ハッカソンの日程と会場の決定 | — |
| dr-design-baseball | 脱線している | ログイン画面のデザインレビュー | — |
| dr-sprint-moving | 脱線している | スプリント12のレビューと次スプリントの優先順位づけ | — |
| dr-onboarding-otherproj | 脱線している | 新入社員のオンボーディング計画 | — |
| st-pricing | 脱線していない（停滞している） | 新プランの月額料金を決める | [pilot/st-pricing.wav](audio/pilot/st-pricing.wav) |
| st-venue | 脱線していない（停滞している） | 社内ハッカソンの会場を決める | [pilot/st-venue.wav](audio/pilot/st-venue.wav) |
| st-interviewers | 脱線していない（停滞している） | エンジニア採用の面接フローの見直し | [pilot/st-interviewers.wav](audio/pilot/st-interviewers.wav) |
| st-release-date | 脱線していない（停滞している） | 新機能「共有リンク」のリリース日を決める | — |
| st-ads-vs-event | 脱線していない（停滞している） | 来期のマーケティング予算の配分 | — |
| st-button-color | 脱線していない（停滞している） | ログイン画面のデザインレビュー | — |
| st-oncall-owner | 脱線していない（停滞している） | 障害対応の当番体制を決める | — |
| st-kickoff-date | 脱線していない（停滞している） | キックオフ会議の日程調整 | — |
| am-competitor-gossip | 判断が分かれる | 新プランの月額料金を決める | — |
| am-icebreaker | 判断が分かれる | 来期のマーケティング予算の配分 | — |
| am-deep-dive | 判断が分かれる | ログイン画面のデザインレビュー | — |
| am-recap | 判断が分かれる | 新機能「共有リンク」の仕様を固める | — |
| am-dependency | 判断が分かれる | 新入社員のオンボーディング計画 | — |
| am-low-energy | 判断が分かれる | 来期のマーケティング予算の配分 | — |

## derail-hard

| ID | 正解ラベル | 議題 | 対応する音声 |
| --- | --- | --- | --- |
| g1-office-move@4 | 脱線していない（議題に沿っている） | 社内向け管理画面APIの権限設計（ロール分け）を決める | — |
| g1-office-move@7 | 判断が分かれる | 社内向け管理画面APIの権限設計（ロール分け）を決める | — |
| g1-office-move@full | 脱線している | 社内向け管理画面APIの権限設計（ロール分け）を決める | — |
| g2-referral-bonus@4 | 脱線していない（議題に沿っている） | 今期のKPIレビューと下期の重点施策 | — |
| g2-referral-bonus@7 | 脱線している | 今期のKPIレビューと下期の重点施策 | — |
| g2-referral-bonus@full | 脱線している | 今期のKPIレビューと下期の重点施策 | — |
| g3-index-rebuild@4 | 脱線していない（議題に沿っている） | 検索機能のパフォーマンス改善方針 | — |
| g3-index-rebuild@7 | 脱線していない（議題に沿っている） | 検索機能のパフォーマンス改善方針 | — |
| g3-index-rebuild@full | 脱線していない（停滞している） | 検索機能のパフォーマンス改善方針 | — |
| g4-encoding-detour@4 | 脱線していない（議題に沿っている） | 旧システムからの移行計画（データ移行の手順） | — |
| g4-encoding-detour@7 | 脱線していない（有益な寄り道） | 旧システムからの移行計画（データ移行の手順） | — |
| g4-encoding-detour@full | 脱線していない（議題に沿っている） | 旧システムからの移行計画（データ移行の手順） | — |
| g5-catering-to-lunch@4 | 脱線していない（議題に沿っている） | 秋の顧客向けイベントの内容と担当の確定 | — |
| g5-catering-to-lunch@7 | 判断が分かれる | 秋の顧客向けイベントの内容と担当の確定 | — |
| g5-catering-to-lunch@full | 脱線している | 秋の顧客向けイベントの内容と担当の確定 | — |
| g6-release-scope@4 | 脱線していない（議題に沿っている） | 来月のリリース計画（スコープと日程）の確認 | — |
| g6-release-scope@7 | 脱線していない（議題に沿っている） | 来月のリリース計画（スコープと日程）の確認 | — |
| g6-release-scope@full | 脱線していない（議題に沿っている） | 来月のリリース計画（スコープと日程）の確認 | — |
| g7-template-loop@4 | 脱線していない（議題に沿っている） | カスタマーサポートの問い合わせ対応フローの改善 | — |
| g7-template-loop@7 | 脱線していない（議題に沿っている） | カスタマーサポートの問い合わせ対応フローの改善 | — |
| g7-template-loop@full | 脱線していない（停滞している） | カスタマーサポートの問い合わせ対応フローの改善 | — |
| g8-self-correct@4 | 脱線していない（議題に沿っている） | インターン受け入れの準備と担当割り | — |
| g8-self-correct@7 | 判断が分かれる | インターン受け入れの準備と担当割り | — |
| g8-self-correct@full | 脱線していない（議題に沿っている） | インターン受け入れの準備と担当割り | — |
| ot-decision-buried | 脱線していない（議題に沿っている） | 下期の採用計画（人数と時期）を決める | — |
| ot-steer-back-done | 脱線していない（議題に沿っている） | 秋の顧客向けイベントの内容と担当の確定 | — |
| ot-jargon | 脱線していない（議題に沿っている） | 新規APIのSLOとエラーバジェットの合意 | — |
| ot-heated-substantive | 脱線していない（議題に沿っている） | APIの後方互換性の方針（破壊的変更の扱い） | — |
| pt-deep-dive-long | 脱線していない（有益な寄り道） | 検索機能のパフォーマンス改善方針 | — |
| pt-license-check | 脱線していない（有益な寄り道） | 来月のリリース計画（スコープと日程）の確認 | — |
| pt-affects-agenda | 脱線していない（有益な寄り道） | 秋の顧客向けイベントの内容と担当の確定 | — |
| pt-past-lesson | 脱線していない（有益な寄り道） | 新入社員のオンボーディング資料の改訂方針 | — |
| pt-customer-complaint | 脱線していない（有益な寄り道） | 問い合わせフォームの項目見直し | — |
| dr-slide-commute | 脱線している | 来週の社内勉強会のテーマと発表者を決める | — |
| dr-org-gossip | 脱線している | チームの目標設定（OKR）のたたき台作成 | — |
| dr-ai-at-home | 脱線している | カスタマーサポートの問い合わせ対応フローの改善 | — |
| st-priority-rephrased | 脱線していない（停滞している） | 来月のリリース計画（スコープと日程）の確認 | — |
| st-oncall-newbie | 脱線していない（停滞している） | 障害対応（オンコール）の担当ローテーションの決め方 | — |
| st-ad-budget | 脱線していない（停滞している） | 来期の広告予算を増やすか減らすか | — |
| am-scheduling-grind | 判断が分かれる | 定例ミーティングの曜日と時間の変更 | — |
| am-silent-thinking | 判断が分かれる | 社内向け管理画面APIの権限設計（ロール分け）を決める | — |
| am-interleaved-lunch | 判断が分かれる | 旧システムからの移行計画（データ移行の手順） | — |
| am-competitor-funding | 判断が分かれる | 来月のリリース計画（スコープと日程）の確認 | — |
| am-wrapup-chat | 判断が分かれる | 来月のリリース計画（スコープと日程）の確認 | — |
| am-newbie-lecture | 判断が分かれる | 社内向け管理画面APIの権限設計（ロール分け）を決める | — |
| am-morale-in-kpi | 判断が分かれる | 今期のKPIレビュー | — |
| am-decision-recheck | 判断が分かれる | 社内ツールのアカウント発行ルールの確認 | — |

## derail-multi

| ID | 正解ラベル | 議題 | 対応する音声 |
| --- | --- | --- | --- |
| a1-golf@35 | 判断が分かれる | 新サービスのリリース日程と体制の確認 | — |
| a1-golf@65 | 脱線している | 新サービスのリリース日程と体制の確認 | — |
| a1-golf@full | 脱線している | 新サービスのリリース日程と体制の確認 | [multi/a1-golf@full.wav](audio/multi/a1-golf@full.wav)<br>[multi/a1-golf@full.speech.wav](audio/multi/a1-golf@full.speech.wav)<br>[multi-mid/a1-golf@full.wav](audio/multi-mid/a1-golf@full.wav)<br>[multi-mid/a1-golf@full.speech.wav](audio/multi-mid/a1-golf@full.speech.wav) |
| a2-health | 脱線している | 大口顧客向け新プランの提案内容の確定 | [multi/a2-health.wav](audio/multi/a2-health.wav)<br>[multi/a2-health.speech.wav](audio/multi/a2-health.speech.wav)<br>[multi-mid/a2-health.wav](audio/multi-mid/a2-health.wav)<br>[multi-mid/a2-health.speech.wav](audio/multi-mid/a2-health.speech.wav) |
| a3-oldwar@35 | 判断が分かれる | 来期の予算配分（部門別）の確認 | — |
| a3-oldwar@65 | 脱線している | 来期の予算配分（部門別）の確認 | — |
| a3-oldwar@full | 脱線している | 来期の予算配分（部門別）の確認 | — |
| a4-complaint | 脱線している | システム障害の再発防止策の合意 | — |
| b1-trip@35 | 判断が分かれる | 社内システム刷新プロジェクトの進め方 | — |
| b1-trip@65 | 脱線している | 社内システム刷新プロジェクトの進め方 | — |
| b1-trip@full | 脱線している | 社内システム刷新プロジェクトの進め方 | [multi/b1-trip@full.wav](audio/multi/b1-trip@full.wav)<br>[multi/b1-trip@full.speech.wav](audio/multi/b1-trip@full.speech.wav)<br>[multi-mid/b1-trip@full.wav](audio/multi-mid/b1-trip@full.wav)<br>[multi-mid/b1-trip@full.speech.wav](audio/multi-mid/b1-trip@full.speech.wav) |
| b2-son | 脱線している | 採用計画（来期の増員）の確認 | [multi/b2-son.wav](audio/multi/b2-son.wav)<br>[multi/b2-son.speech.wav](audio/multi/b2-son.speech.wav)<br>[multi-mid/b2-son.wav](audio/multi-mid/b2-son.wav)<br>[multi-mid/b2-son.speech.wav](audio/multi-mid/b2-son.speech.wav) |
| c1-pricing@35 | 脱線していない（議題に沿っている） | 値上げの是非と顧客への説明方針 | — |
| c1-pricing@65 | 脱線していない（議題に沿っている） | 値上げの是非と顧客への説明方針 | — |
| c1-pricing@full | 脱線していない（議題に沿っている） | 値上げの是非と顧客への説明方針 | [multi/c1-pricing@full.wav](audio/multi/c1-pricing@full.wav)<br>[multi/c1-pricing@full.speech.wav](audio/multi/c1-pricing@full.speech.wav)<br>[multi-mid/c1-pricing@full.wav](audio/multi-mid/c1-pricing@full.wav)<br>[multi-mid/c1-pricing@full.speech.wav](audio/multi-mid/c1-pricing@full.speech.wav) |
| c2-logistics | 脱線していない（議題に沿っている） | 物流委託先の見直し | [multi/c2-logistics.wav](audio/multi/c2-logistics.wav)<br>[multi/c2-logistics.speech.wav](audio/multi/c2-logistics.speech.wav)<br>[multi-mid/c2-logistics.wav](audio/multi-mid/c2-logistics.wav)<br>[multi-mid/c2-logistics.speech.wav](audio/multi-mid/c2-logistics.speech.wav) |
| d1-sync@35 | 脱線していない（有益な寄り道） | データ連携機能の仕様確定 | — |
| d1-sync@65 | 脱線していない（議題に沿っている） | データ連携機能の仕様確定 | — |
| d1-sync@full | 脱線していない（議題に沿っている） | データ連携機能の仕様確定 | [multi/d1-sync@full.wav](audio/multi/d1-sync@full.wav)<br>[multi/d1-sync@full.speech.wav](audio/multi/d1-sync@full.speech.wav)<br>[multi-mid/d1-sync@full.wav](audio/multi-mid/d1-sync@full.wav)<br>[multi-mid/d1-sync@full.speech.wav](audio/multi-mid/d1-sync@full.speech.wav) |
| d2-rain | 脱線していない（有益な寄り道） | イベント当日の運営体制と安全対策 | — |
| e1-layout@35 | 判断が分かれる | 新オフィスのレイアウト案の決定 | — |
| e1-layout@65 | 脱線していない（停滞している） | 新オフィスのレイアウト案の決定 | — |
| e1-layout@full | 脱線していない（停滞している） | 新オフィスのレイアウト案の決定 | [multi/e1-layout@full.wav](audio/multi/e1-layout@full.wav)<br>[multi/e1-layout@full.speech.wav](audio/multi/e1-layout@full.speech.wav)<br>[multi-mid/e1-layout@full.wav](audio/multi-mid/e1-layout@full.wav)<br>[multi-mid/e1-layout@full.speech.wav](audio/multi-mid/e1-layout@full.speech.wav) |
| e2-booth | 脱線していない（停滞している） | 展示会の出展ブースの内容の決定 | [multi/e2-booth.wav](audio/multi/e2-booth.wav)<br>[multi/e2-booth.speech.wav](audio/multi/e2-booth.speech.wav)<br>[multi-mid/e2-booth.wav](audio/multi-mid/e2-booth.wav)<br>[multi-mid/e2-booth.speech.wav](audio/multi-mid/e2-booth.speech.wav) |
| f1-train@35 | 脱線していない（議題に沿っている） | 問い合わせ対応の初動時間の短縮 | — |
| f1-train@65 | 判断が分かれる | 問い合わせ対応の初動時間の短縮 | — |
| f1-train@full | 脱線していない（議題に沿っている） | 問い合わせ対応の初動時間の短縮 | — |
| g1-lunch | 判断が分かれる | 四半期の施策レビューと次四半期の重点 | — |
| h1-gonogo | 脱線していない（議題に沿っている） | リリースのGo/No-Go判定 | [multi/h1-gonogo.wav](audio/multi/h1-gonogo.wav)<br>[multi/h1-gonogo.speech.wav](audio/multi/h1-gonogo.speech.wav)<br>[multi-mid/h1-gonogo.wav](audio/multi-mid/h1-gonogo.wav)<br>[multi-mid/h1-gonogo.speech.wav](audio/multi-mid/h1-gonogo.speech.wav) |
| i1-delay@35 | 脱線していない（議題に沿っている） | 納期遅延への対応方針 | — |
| i1-delay@65 | 脱線していない（議題に沿っている） | 納期遅延への対応方針 | — |
| i1-delay@full | 脱線していない（議題に沿っている） | 納期遅延への対応方針 | — |

再生成: <code>node evals/fixtures/meeting/build-labels.mjs</code>。更新確認のみ: 同じコマンドに <code>--check</code> を付けます。
