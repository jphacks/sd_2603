# ProductionへのJev反映

ユーザーのProduction反映指示に従い、確認済みstaging `05573ca`をmainへ取り込む。mainはstagingより古いため、最新stagingのアプリ・4質問介入ゲート・回帰テストも含めて取り込む。

- モデル: `typesafe-ai/jev-1.14.0`、質問: `v4-staging-gated`。
- 閾値: drifted 0.5、stalled 0.6、tangentIsRelevant 0.8。interveneNow 0.6、cooldown/発話数ゲートを維持。
- デプロイ時のAI_PROVIDER=jev / ALLOW_PAID_AI=trueをmainにも適用。CIのMock設定は維持。
- Productionの既存ブラウザー操作認証設定は維持。秘密情報は追加しない。
- staging統合版の固定169件評価は163/169 (96.45%)。合成台本とGPT参照ラベルであり、実会議での精度保証ではない。

## 進捗

1. 最新main/staging取得、未コミット変更を別worktreeで保全。
2. stagingベースの作業ブランチでProduction設定を用意。
3. Push・main向けPR・CIを確認後、マージしてProductionデプロイを確認する。

## 復旧

ProductionのJevだけ停止して以前のMock運用へ戻す場合は、このPRで追加したmain向けDEPLOY_AI_PROVIDER/DEPLOY_ALLOW_PAID_AI条件をstagingのみへ戻し、通常のPRからmainへ反映する。最新版アプリを維持したまま復旧できる。

PR全体を戻す必要がある場合はmainでマージコミットに対して`git revert -m 1 <merge SHA>`し、Pushする。共有履歴のreset/force pushはしない。stagingのJev切り戻しは[別手順](staging-rollout.md)を参照。
