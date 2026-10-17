"use client";

import { useState } from "react";

export type MeetChatInfo = {
  webhookPath: string; webhookUrl: string | null;
  recallKeyConfigured: boolean; verificationConfigured: boolean; googleDriveConfigured: boolean;
};

type Props = {
  botId: string | null;
  busy: boolean;
  onBind: (botId: string) => Promise<unknown>;
  onInfo: () => Promise<MeetChatInfo | null>;
};

export function MeetChatConnection({ botId, busy, onBind, onInfo }: Props) {
  const [value, setValue] = useState(botId ?? "");
  const [info, setInfo] = useState<MeetChatInfo | null>(null);
  const [saved, setSaved] = useState(false);
  return <section className="focus-meet-connection"><h2>Meetチャットを受信</h2><p>Botの入室時に、この会議のWebhook URLを指定します。登録済みBotからの署名付きイベントだけを受け取ります。</p><button type="button" className="focus-button" disabled={busy} onClick={async () => setInfo(await onInfo())}>受信先URLと設定を確認</button>
    {info && <div className="focus-connection-info"><label htmlFor="chat-webhook-url">Webhook URL</label><input id="chat-webhook-url" readOnly value={info.webhookUrl ?? info.webhookPath} /><p>{info.webhookUrl ? "入室CLIの --chat-webhook に指定してください。" : "FOCUS_PUBLIC_BASE_URLの設定が必要です。"}</p><ul><li>Recall APIキー：{info.recallKeyConfigured ? "設定済み" : "未設定"}</li><li>Webhook検証シークレット：{info.verificationConfigured ? "設定済み" : "未設定"}</li><li>非公開Driveファイル認証：{info.googleDriveConfigured ? "設定済み" : "未設定"}</li></ul></div>}
    <form onSubmit={async event => { event.preventDefault(); if (await onBind(value)) setSaved(true); }}><label htmlFor="chat-bot-id">受信するBot ID</label><input id="chat-bot-id" required value={value} onChange={event => { setValue(event.target.value); setSaved(false); }} placeholder="入室したBotのUUID" /><button className="focus-button" disabled={busy}>受信Bot IDを登録</button>{(saved || botId) && <p role="status">受信Bot IDを登録済みです。入室時のWebhook設定も確認してください。</p>}</form>
  </section>;
}
