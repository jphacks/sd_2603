# Jev 判定のローカル検証

`POST /api/judge` は `AI_PROVIDER=jev` のとき、Vercel AI Gateway の Jev に会議のアジェンダと直近の発言を送り、`SILENCE` / `WAIT` / `INTERVENE` を返します。`INTERVENE` は発話候補であり、このAPI自体は音声を再生しません。

`.env.local` に次を設定して `npm run dev` を起動します。Gatewayのキーはサーバー専用です。ローカルで試すときだけ有料AIの許可を有効にしてください。

```dotenv
AI_PROVIDER=jev
ALLOW_PAID_AI=true
AI_GATEWAY_API_KEY=your-gateway-key
JEV_MODEL_ID=typesafe-ai/jev-1.14.0
```

PowerShellからの確認例:

```powershell
$body = @{
  agenda = '次のリリース方針を決める'
  transcript = @('まず案Aを確認します', '案Bの費用はどうですか', '案Aの費用の話に戻りましょう')
  secondsSinceLastIntervention = 60
} | ConvertTo-Json
Invoke-RestMethod -Uri 'http://localhost:3000/api/judge' -Method Post -ContentType 'application/json' -Body $body
```

Jevには脱線・停滞・寄り道の有用性に加え、「今、短く声をかける価値があるか」を質問します。最新stagingの4質問と介入ゲートを維持した`v4-staging-gated`です。停滞>=0.6、または脱線>=0.5かつ有用性<0.8が介入候補ですが、どちらも介入価値`interveneNow`>=0.6が必要です。脱線または停滞>=0.4で介入条件を満たさない場合は`WAIT`です。判定とモニター補助線は`lib/judge/jev-policy.json`を共通で読みます。[反映内容・切り戻し](jev-tuning/staging-rollout.md)を参照してください。

レスポンスの`diagnostic`にはモデル名、質問バージョン、各判定値、遅延を含めます。入力が不足すると`WAIT`、介入後60秒以内は`SILENCE`になり、いずれもGatewayを呼びません。Gateway障害時はエラーを返し、モック判定には切り替えません。

4問すべての回答を必須とし、旧3問形式の応答や回答不足は`invalid_response`として拒否します。音声ワーカーではその場合も処理を停止します。

## 判定の評価

`node scripts/eval/jev-run.mjs`は合成ケースと、入力不足・クールダウンのローカル契約を確認します。実APIで評価する場合は上記の環境変数を設定し、`node --env-file=.env.local scripts/eval/jev-run.mjs --live`を実行します。独立した2件は`--live --holdout`で評価できます。ライブ評価は有料APIを各ケースにつき1回呼び、上流エラー時は停止します。誤介入・見逃し・未完走は終了コード1です。

少数の合成ケースによる初回評価では、旧3問・新4問ともに静観すべき5件中1件（脱線が始まった直後）で誤介入し、介入すべき継続脱線・停滞4件はすべて検出しました。決定後の雑談1件は参考評価とし、新4問では`WAIT`となりました。新4問の追加2件は有益な寄り道を静観し、停滞に介入しました。

誤介入ゼロという事前の合格条件には未達です。評価後に閾値や期待ラベルを変更していません。停滞を明言する比較的容易な例も含む小標本のため、実会議での精度を示すものではありません。脱線の長さ・進捗・自己修正を時系列で捉える評価を追加する必要があります。

CIとデプロイは既定で`AI_PROVIDER=mock`、`ALLOW_PAID_AI=false`です。Jevを公開環境で有効にする前に、`/api/judge`へ認証と利用量制限を追加してください。
