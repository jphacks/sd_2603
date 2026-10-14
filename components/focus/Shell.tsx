import { AudioLines, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
export function Shell({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full min-h-screen max-w-[1440px] px-5 py-7 md:px-12 md:py-9">
    <header className="mb-12 flex flex-wrap items-center justify-between gap-4 border-b border-slate-700/60 pb-6">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-indigo-400/15 p-2.5 text-indigo-300"><AudioLines aria-hidden /></span><span className="text-xl font-semibold tracking-tight">Focus<span className="ml-3 text-xs font-normal tracking-widest text-slate-400">MEETING FACILITATOR</span></span></div>
      <span className="flex items-center gap-2 rounded-full border border-indigo-400/25 bg-indigo-400/10 px-4 py-2 text-xs text-indigo-200"><Sparkles size={14} aria-hidden /> デモモード · 外部接続なし</span>
    </header>{children}
    <footer className="mt-10 border-t border-slate-700/50 pt-5 text-xs text-slate-400">会話に集中するための、静かな進行サポート。<span className="ml-3">Phase 1 / Focus UI</span></footer>
  </div>;
}
