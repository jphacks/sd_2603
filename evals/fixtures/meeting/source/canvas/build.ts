// データ作成の補助（評価の準備物）。
import type { CanvasSnippet, Category, Decision, Label, Utterance } from "./types";

/** "話者|発言" の行を発言の配列にする */
export function conv(src: string): Utterance[] {
  return src
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf("|");
      if (i < 0) throw new Error(`conv: "|" がない行: ${l}`);
      return { speaker: l.slice(0, i).trim(), text: l.slice(i + 1).trim() };
    });
}

export interface SnippetInit {
  id: string;
  category: Category;
  scenario: string;
  agenda: string;
  src: string;
  label: Label;
  humanAgreement?: "clear" | "split";
  acceptable?: Decision[];
  hasActiveDiagram?: boolean;
  activeSummary?: string;
  window?: { earliestTurn: number; latestTurn: number };
  gold?: CanvasSnippet["gold"];
  note?: string;
}

export function mk(i: SnippetInit): CanvasSnippet {
  return {
    id: i.id,
    group: i.id,
    category: i.category,
    scenario: i.scenario,
    agenda: i.agenda,
    utterances: conv(i.src),
    label: i.label,
    humanAgreement: i.humanAgreement ?? "clear",
    acceptable: i.acceptable,
    hasActiveDiagram: i.hasActiveDiagram,
    activeSummary: i.activeSummary,
    window: i.window,
    gold: i.gold,
    note: i.note,
  };
}

export interface CutSpec {
  turns: number;
  label: Decision;
  note?: string;
}

/** 元の会話（full）と、先頭から turns 発言で切った版を返す */
export function withCuts(base: CanvasSnippet, cuts: CutSpec[]): CanvasSnippet[] {
  const total = base.utterances.length;
  const variants = cuts.map((c): CanvasSnippet => {
    if (c.turns >= total) throw new Error(`${base.id}: cut turns(${c.turns}) >= total(${total})`);
    return {
      ...base,
      id: `${base.id}@${Math.round((c.turns / total) * 100)}`,
      group: base.id,
      category: "cut",
      label: c.label,
      utterances: base.utterances.slice(0, c.turns),
      cut: { turns: c.turns, ofTotal: total },
      gold: undefined,
      window: undefined,
      note: c.note ?? `${base.id} の先頭${c.turns}発言`,
    };
  });
  return [...variants, base];
}
