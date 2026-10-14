"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Plus, Trash2, Mic, Volume2, Video, ListChecks, Timer } from "lucide-react";
import { configSchema, defaultConfig, type MeetingConfig } from "@/lib/meeting/session";
import { useSession } from "./SessionProvider";
import { Shell } from "./Shell";
export function Setup() {
  const state = useSession();
  if (!state.ready || !state.config) return <Shell><p>設定を読み込み中…</p></Shell>;
  return <SetupForm initial={state.config} />;
}
function SetupForm({ initial }: { initial: MeetingConfig }) {
  const [config, setConfig] = useState(initial ?? defaultConfig);
  const [error, setError] = useState("");
  const { saveConfig, saveSession, session, storageError } = useSession();
  const router = useRouter();
  function update(c: MeetingConfig) { setConfig(c); if (configSchema.safeParse(c).success) saveConfig(c); }
  function start(e: FormEvent) {
    e.preventDefault();
    const parsed = configSchema.safeParse(config);
    if (!parsed.success) { setError("会議名・議題を入力し、会議時間を1〜240分に設定してください。"); return; }
    saveConfig(parsed.data);
    saveSession({ config: parsed.data, phase: "running", agendaIndex: 0, elapsedMs: 0, resumedAt: Date.now(), interventionCount: 0 });
    router.push("/meeting");
  }
  return <Shell><div className="mb-9"><p className="eyebrow">LET’S GET FOCUSED</p><h1 className="mt-3 text-3xl font-semibold md:text-4xl">会議の準備をしましょう</h1><p className="mt-4 text-slate-400">議題を決めて、あとは会話に集中。AIの進行サポートをデモで体験できます。</p></div>
    {session && session.phase !== "finished" && <p className="mb-6 text-indigo-200"><Link href="/meeting" className="underline">進行中の会議に戻る</Link> · 新しく開始すると現在の会議を置き換えます。</p>}
    <form onSubmit={start} className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="panel space-y-8"><div><label htmlFor="title" className="label">会議タイトル</label><input id="title" required maxLength={100} value={config.title} onChange={e => update({ ...config, title: e.target.value })} placeholder="例：プロダクト定例ミーティング" /></div>
        <div><h2 className="label flex items-center gap-2"><ListChecks size={18} aria-hidden /> アジェンダ</h2><p className="mb-4 text-sm text-slate-400">話し合う順番に議題を登録してください。</p><div className="space-y-3">{config.agenda.map((item, index) => <div className="flex items-center gap-3" key={index}><span className="text-sm text-indigo-300">{String(index + 1).padStart(2, "0")}</span><label className="sr-only" htmlFor={`agenda-${index}`}>議題 {index + 1}</label><input id={`agenda-${index}`} required maxLength={200} value={item} onChange={e => update({ ...config, agenda: config.agenda.map((text, i) => i === index ? e.target.value : text) })} /><button type="button" className="icon-button" aria-label={`議題 ${index + 1} を削除`} disabled={config.agenda.length === 1} onClick={() => update({ ...config, agenda: config.agenda.filter((_, i) => i !== index) })}><Trash2 size={18} /></button></div>)}</div><button type="button" className="secondary mt-4" disabled={config.agenda.length >= 12} onClick={() => update({ ...config, agenda: [...config.agenda, ""] })}><Plus size={17} aria-hidden /> 議題を追加</button></div>
        <div><label htmlFor="minutes" className="label flex items-center gap-2"><Timer size={18} aria-hidden /> 会議時間</label><div className="flex items-center gap-3"><input id="minutes" className="max-w-32" type="number" min={1} max={240} required value={Number.isNaN(config.minutes) ? "" : config.minutes} onChange={e => update({ ...config, minutes: e.target.valueAsNumber })} /><span className="text-slate-400">分</span></div></div>
      </section>
      <div className="space-y-6"><section className="panel space-y-6"><h2 className="text-lg font-semibold">音声と接続</h2><div><label htmlFor="input" className="label flex items-center gap-2"><Mic size={18} aria-hidden /> 音声入力</label><select id="input" defaultValue="pc"><option value="pc">PCマイク（未接続・デモのみ）</option><option disabled>M5StickS3（未実装）</option></select></div><div><label htmlFor="output" className="label flex items-center gap-2"><Volume2 size={18} aria-hidden /> 音声出力</label><select id="output" defaultValue="pc"><option value="pc">PC（音声再生は後続対応）</option><option disabled>M5StickS3（未実装）</option></select></div><p className="flex items-center gap-2 text-sm text-slate-400"><Video size={18} aria-hidden /> Google Meet音声連携：後続対応</p></section><section className="rounded-2xl border border-indigo-400/20 bg-indigo-400/5 p-6"><h2 className="font-medium text-indigo-200">この会議はデモで動作します</h2><p className="mt-3 text-sm leading-7 text-slate-400">サンプル発言と手動のAI介入を表示します。マイクの収音・音声再生・外部API呼び出しは行いません。</p></section></div>
      <div className="lg:col-span-2 flex flex-wrap items-center justify-between gap-4"><p className="text-sm text-slate-400">設定と会議はこのタブ内で一時保存されます。</p><button className="primary" type="submit">デモ会議を始める <ArrowRight size={18} aria-hidden /></button></div>
      {(error || storageError) && <p role="alert" className="text-amber-300 lg:col-span-2">{error || "一時保存を利用できません。画面遷移は可能ですが再読み込みすると状態が失われます。"}</p>}
    </form></Shell>;
}
