"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pause, Play, Square, Sparkles, ChevronRight, ChevronLeft, Mic, Volume2, Captions, Timer, X } from "lucide-react";
import { clock, elapsed } from "@/lib/meeting/session";
import { useSession } from "./SessionProvider";
import { Shell } from "./Shell";
const samples = ["まずは、今の状況をみんなで共有しましょう。", "優先度の高い課題から整理していきたいです。", "参加者が使いやすい形を、もう少し具体的に考えましょう。", "次のステップと担当をこの後話し合いましょう。"];
export function Meeting() {
  const { session, ready, saveSession, storageError } = useSession();
  const [now, setNow] = useState(0);
  const [intervention, setIntervention] = useState<"idle" | "judging" | "showing">("idle");
  const dialog = useRef<HTMLDialogElement>(null);
  const testButton = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (intervention === "idle") return;
    const id = setTimeout(() => setIntervention(intervention === "judging" ? "showing" : "idle"), intervention === "judging" ? 700 : 6000);
    return () => clearTimeout(id);
  }, [intervention]);
  useEffect(() => {
    if (intervention === "showing") dialog.current?.showModal();
    else if (dialog.current?.open) { dialog.current.close(); testButton.current?.focus(); }
  }, [intervention]);
  if (!ready) return <Shell><p>会議を読み込み中…</p></Shell>;
  if (!session || session.phase === "finished") return <Shell><h1 className="text-3xl">進行中の会議はありません</h1><Link className="secondary mt-6" href={session ? "/summary" : "/setup"}>{session ? "終了画面を見る" : "会議を準備する"}</Link></Shell>;
  const ms = elapsed(session, now || session.resumedAt || 0);
  const remaining = Math.max(0, session.config.minutes * 60000 - ms);
  const paused = session.phase === "paused";
  const sampleIndex = Math.floor(ms / 8000);
  function pause() {
    if (!session) return;
    const current = Date.now();
    saveSession({ ...session, phase: paused ? "running" : "paused", elapsedMs: elapsed(session, current), resumedAt: paused ? current : null });
  }
  function finish() {
    if (!session) return;
    saveSession({ ...session, phase: "finished", elapsedMs: elapsed(session, Date.now()), resumedAt: null });
    router.push("/summary");
  }
  function intervene() {
    if (!session || intervention !== "idle" || paused) return;
    saveSession({ ...session, interventionCount: session.interventionCount + 1 });
    setIntervention("judging");
  }
  return <Shell><div className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow">MEETING IN FOCUS</p><h1 className="mt-2 break-words text-xl text-slate-300">{session.config.title}</h1></div><div className="flex gap-2"><button className="secondary" onClick={pause}>{paused ? <Play size={16} aria-hidden /> : <Pause size={16} aria-hidden />}{paused ? "再開" : "一時停止"}</button><button className="secondary" onClick={finish}><Square size={16} aria-hidden /> 終了</button></div></div>
    {storageError && <p role="alert" className="mb-4 text-amber-300">一時保存できません。再読み込みすると会議状態が失われます。</p>}
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]"><section className="panel flex min-h-[380px] flex-col justify-between !p-8 md:!p-12"><div><div className="flex items-center justify-between text-sm"><span className="eyebrow">現在の議題</span><span className="text-slate-400">{String(session.agendaIndex + 1).padStart(2, "0")} / {String(session.config.agenda.length).padStart(2, "0")}</span></div><h2 className="mt-9 break-words text-4xl font-semibold leading-snug tracking-tight md:text-5xl">{session.config.agenda[session.agendaIndex]}</h2></div><div className="mt-10"><div className="mb-5 flex gap-2" aria-label="アジェンダ進捗">{session.config.agenda.map((_, i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= session.agendaIndex ? "bg-indigo-400" : "bg-slate-700"}`} />)}</div><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-400">{paused ? "一時停止中" : "ひとつの議題に、集中しましょう。"}</p><div className="flex gap-2"><button className="icon-button" aria-label="前の議題" disabled={session.agendaIndex === 0 || intervention !== "idle"} onClick={() => saveSession({ ...session, agendaIndex: session.agendaIndex - 1 })}><ChevronLeft size={20} /></button><button className="secondary" disabled={session.agendaIndex === session.config.agenda.length - 1 || intervention !== "idle"} onClick={() => saveSession({ ...session, agendaIndex: session.agendaIndex + 1 })}>次の議題 <ChevronRight size={16} aria-hidden /></button></div></div></div></section>
      <section className="panel flex flex-col justify-between"><div><p className="label flex items-center gap-2"><Timer size={18} aria-hidden /> 残り時間</p><p className={`font-mono text-6xl tracking-tight tabular-nums ${remaining === 0 ? "text-amber-300" : "text-indigo-200"}`}>{clock(remaining)}</p><p className="mt-4 text-sm text-slate-400">経過 {clock(ms)} <span className="mx-2">/</span> 予定 {session.config.minutes} 分</p>{remaining === 0 && <p className="mt-3 text-sm text-amber-300">予定時間を過ぎています</p>}</div><div className="mt-8 border-t border-slate-700 pt-5"><p className="label">アジェンダ</p><ol className="space-y-4">{session.config.agenda.map((text, i) => <li key={i} className={`flex gap-3 text-sm ${i === session.agendaIndex ? "text-indigo-200" : "text-slate-400"}`}><span>{String(i + 1).padStart(2, "0")}</span><span className="break-words">{text}</span></li>)}</ol></div></section>
      <section className="panel"><h2 className="label flex items-center gap-2"><Captions size={18} aria-hidden /> 直近の発言 <span className="badge">デモ</span></h2><p className="mb-3 text-xs text-slate-400">確定発言 · サンプル参加者</p><p className="text-xl leading-relaxed">{samples[sampleIndex % samples.length]}</p><p className="mt-5 border-t border-slate-700 pt-4 text-sm text-slate-400">暫定発言 · {paused ? "デモ文字起こしは停止中" : `${samples[(sampleIndex + 1) % samples.length].slice(0, 16)}…`}</p></section>
      <section className="panel"><p className="label flex items-center gap-2"><Sparkles size={18} aria-hidden /> AIファシリテーター</p><p role="status" className="text-lg text-indigo-200">{intervention === "judging" ? "判定中（デモ）" : intervention === "showing" ? "介入中（デモ）" : "待機中"}</p><p className="mt-2 text-sm leading-6 text-slate-400">手動で介入演出を確認できます。</p><button ref={testButton} className="secondary mt-5 w-full" disabled={paused || intervention !== "idle"} onClick={intervene}><Sparkles size={16} aria-hidden /> デモ介入を試す</button></section>
    </div><div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 text-sm text-slate-400"><span className="flex items-center gap-2"><Mic size={16} aria-hidden /> PCマイク：未接続 · {paused ? "デモ停止中" : "デモ認識中"}</span><span className="flex items-center gap-2"><Volume2 size={16} aria-hidden /> PC音声：未再生 · 演出のみ</span><span>Google Meet / M5StickS3：未接続</span></div>
    <dialog ref={dialog} className="intervention-dialog" aria-labelledby="intervention-title" onCancel={() => setIntervention("idle")}><div className="relative p-8 text-center md:p-16"><button className="icon-button absolute right-4 top-4" aria-label="介入表示を閉じる" onClick={() => setIntervention("idle")}><X size={20} /></button><Sparkles className="mx-auto mb-6 text-indigo-300" size={40} aria-hidden /><p className="eyebrow">AI INTERVENTION · DEMO</p><h2 id="intervention-title" className="my-8 text-3xl font-semibold leading-relaxed md:text-5xl">そろそろ議題に<br />戻りませんか？</h2><p className="text-indigo-200">「{session.config.agenda[session.agendaIndex]}」</p><p className="mt-8 text-sm text-slate-400">音声再生のデモ演出 · 実際の音声出力はありません</p><p className="mt-2 text-xs text-slate-400">6秒後に閉じます · Escキーでも閉じられます</p></div></dialog>
  </Shell>;
}
