export type JudgeInput = {
  agenda: string;
  transcript: string[];
  secondsSinceLastIntervention: number;
};

export type JudgeResult = {
  action: "SILENCE" | "WAIT" | "INTERVENE";
  reason: string;
  message: string | null;
  diagnostic?: {
    drifted: number;
    stalled: number;
    tangentIsRelevant: number;
    interveneNow: number;
    model: string;
    latencyMs: number;
    questionVersion: string;
  };
};

export type JudgeProvider = (
  input: JudgeInput
) => Promise<JudgeResult>;
