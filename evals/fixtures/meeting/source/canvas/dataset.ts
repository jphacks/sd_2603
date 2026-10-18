// Ambient Canvas 判定の評価データ（評価の準備物・製品コードではない）。
//
// 注意:
//  - 合成データ（AI が書いた）で、ラベル・正解の図表も私たちが付けた。実際の会議の書き起こしより整っている。
//    ここでの数字は「実会議より楽観的」と読むこと。本当の検証は実際に録音した会議でしかできない。
//  - WAIT / ambiguous は人間でも割れうる。ambiguous は精度の集計から除き、別に報告する。
//  - 判定の質問文・閾値・ルールはここには無い（Hack Day で作る）。
import { FLOW_SNIPPETS } from "./dataset-flow";
import { TABLE_SNIPPETS } from "./dataset-table";
import { QUIET_SNIPPETS } from "./dataset-quiet";
import type { CanvasSnippet } from "./types";

export const DATASET: CanvasSnippet[] = [...FLOW_SNIPPETS, ...TABLE_SNIPPETS, ...QUIET_SNIPPETS];

/** タイミング検証（発言を1つずつ増やして見る）の対象：時間窓を持つ元の会話 */
export const TIMING_GROUPS: CanvasSnippet[] = DATASET.filter((s) => s.window && s.category !== "cut");
