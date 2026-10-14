"use client";
import Link from "next/link";
import { ArrowRight, Check, Timer, Sparkles, ListChecks } from "lucide-react";
import { clock } from "@/lib/meeting/session";
import { useSession } from "./SessionProvider";
import { Shell } from "./Shell";
export function Summary() {
  const { session, ready } = useSession();
  if (!ready) return <Shell><p>結果を読み込み中…</p></Shell>;
  if (!session || session.phase !== "finished") return <Shell><h1 className="text-3xl">終了した会議はありません</h1><Link href={session ? "/meeting" : "/setup"} className="secondary mt-6">{session ? "会議に戻る" : "会議を準備する"}</Link></Shell>;
  return <Shell><main className="mx-auto max-w-3xl"><div className="mb-10 text-center"><span className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-400/15 text-indigo-300"><Check size={30} aria-hidden /></span><p className="eyebrow">SESSION COMPLETE</p><h1 className="mt-4 text-4xl font-semibold">おつかれさまでした</h1><p className="mt-4 break-words text-lg text-slate-400">{session.config.title}</p></div><div className="mb-6 grid gap-4 sm:grid-cols-3">{[{ icon: Timer, label: "会議の経過時間", value: clock(session.elapsedMs) }, { icon: ListChecks, label: "登録した議題", value: `${session.config.agenda.length} 件` }, { icon: Sparkles, label: "デモ介入回数", value: `${session.interventionCount} 回` }].map(({ icon: Icon, label, value }) => <div className="panel text-center" key={label}><Icon className="mx-auto mb-3 text-indigo-300" size={20} aria-hidden /><p className="text-sm text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p></div>)}</div><section className="panel"><h2 className="mb-6 text-lg font-semibold">今回のアジェンダ</h2><ol className="space-y-5">{session.config.agenda.map((text, i) => <li className="flex items-start gap-4" key={i}><span className="text-indigo-300">{String(i + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 break-words">{text}</span><span className="shrink-0 text-xs text-slate-400">{i === session.agendaIndex ? "終了時の議題" : i > session.agendaIndex ? "未到達" : "通過"}</span></li>)}</ol></section><p className="my-6 text-center text-sm leading-7 text-slate-400">デモ会議の記録です。TODO・決定事項の自動抽出は未実装です。<br />このタブを閉じると一時保存データは失われます。</p><div className="flex justify-center"><Link href="/setup" className="primary">次の会議を準備する <ArrowRight size={18} aria-hidden /></Link></div></main></Shell>;
}
