# Jev 判定のローカル検証

`POST /api/judge` は `AI_PROVIDER=jev` のとき、Vercel AI Gateway の Jev に会議のアジェンダと直近の発言を送り、`SILENCE` / `WAIT` / `INTERVENE` を返します。`INTERVENE` は発話候補であり、このAPI自体は音声を再生しません。

`.env.local` に次を設定して `npm run dev` を起動します。Gatewayのキーはサーバー専用です。ローカルで試すときだけ有料AIの許可を有効にしてください。

```dotenv
AI_PROVIDER=jev
ALLOW_PAID_AI=true
AI_GATEWAY_API_KEY=your-gateway-key
JEV_MODEL_ID=typesafe-ai/jev
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

Jevには脱線・停滞・寄り道の有用性を質問します。脱線または停滞が0.6以上のとき介入候補にします。ただし有益な寄り道が0.6以上なら、脱線だけを理由に介入しません。0.4以上の不確かな場合は`WAIT`です。これらの値は初期値であり、実会議での評価を通じて調整します。

レスポンスの`diagnostic`にはモデル名、質問バージョン、各判定値、遅延を含めます。入力が不足すると`WAIT`、介入後60秒以内は`SILENCE`になり、いずれもGatewayを呼びません。Gateway障害時はエラーを返し、モック判定には切り替えません。

CIとデプロイは既定で`AI_PROVIDER=mock`、`ALLOW_PAID_AI=false`です。Jevを公開環境で有効にする前に、`/api/judge`へ認証と利用量制限を追加してください。
