// Ambient Canvas 判定の評価用の型（評価の準備物。製品コードではない）。
// 注意: ここに判定ロジック・質問文・閾値は一切含めない。それらは Hack Day で書く。

export type Decision = "SILENCE" | "WAIT" | "FLOW" | "TABLE";
export type Label = Decision | "ambiguous";
export const DECISIONS: Decision[] = ["SILENCE", "WAIT", "FLOW", "TABLE"];

/** 図表を出す判定か */
export const isVisual = (d: Decision): boolean => d === "FLOW" || d === "TABLE";

export type Category = "flow" | "table" | "wait" | "silence" | "dedup" | "ambiguous" | "cut";
export const CATEGORIES: Category[] = ["flow", "table", "wait", "silence", "dedup", "ambiguous", "cut"];

export interface Utterance {
  speaker: string;
  text: string;
}

export interface FlowData {
  nodes: { id: string; label: string }[];
  edges: { from: string; to: string; label?: string }[];
}

export interface TableData {
  columns: string[];
  rows: string[][];
}

export interface CanvasSnippet {
  id: string;
  /** 同じ会話から切り出した版は同じ group を持つ（元の id） */
  group: string;
  category: Category;
  scenario: string;
  agenda: string;
  utterances: Utterance[];
  label: Label;
  humanAgreement: "clear" | "split";
  /** label が ambiguous のとき、許容できる判定 */
  acceptable?: Decision[];
  hasActiveDiagram?: boolean;
  /** すでに共有画面に出ている図表の要約（重複表示の検証用） */
  activeSummary?: string;
  /**
   * 図表を出してよい時間窓（元の会話の発言数で数える。両端を含む）。
   * earliestTurn: 構造が出そろって、出して意味がある最初の発言数。
   * latestTurn: これを過ぎると遅すぎる最後の発言数。
   */
  window?: { earliestTurn: number; latestTurn: number };
  /** 途中で切った版のとき、何発言目まで含むか */
  cut?: { turns: number; ofTotal: number };
  gold?: { flow?: FlowData; table?: TableData };
  note?: string;
}

// ───────── 判定器（Judge）の差し込み口 ─────────

export type InputForm = "T1" | "T2";

export interface JudgeInput {
  agenda: string;
  /** T1: 話者名あり／T2: speaker は空文字、句読点なし */
  utterances: Utterance[];
  hasActiveDiagram: boolean;
  activeSummary?: string;
  form: InputForm;
}

export interface JudgeOutput {
  decision: Decision;
  /** 判定器が出した確率などの数値（記録用） */
  scores?: Record<string, number>;
  raw?: unknown;
  costUsd?: number;
}

export interface JudgeContext {
  snippetId: string;
  /** 渡した発言数 */
  turns: number;
  run: number;
  /** 発言数を1つずつ増やして見る「タイミング検証」の呼び出しか */
  sweep: boolean;
}

export type Judge = (input: JudgeInput, ctx: JudgeContext) => Promise<JudgeOutput>;

/** 認証・残高などで続行できないときに投げる。ハーネスは即座に中断する。 */
export class FatalJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalJudgeError";
  }
}

// ───────── 入力の整形（T1/T2） ─────────

const PUNCT_RE = /[、。，．,.？！?!「」『』（）()…・〜~―—　]/g;

export function toForm(utterances: Utterance[], form: InputForm): Utterance[] {
  if (form === "T1") return utterances.map((u) => ({ ...u }));
  return utterances.map((u) => ({ speaker: "", text: u.text.replace(PUNCT_RE, "") }));
}

/** 判定器が会話を1つの文字列にしたいときの補助 */
export function renderLines(input: { utterances: Utterance[] }): string[] {
  return input.utterances.map((u) => (u.speaker ? `${u.speaker}: ${u.text}` : u.text));
}
