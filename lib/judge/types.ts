export type JudgeInput = {
  agenda: string;
  transcript: string[];
  secondsSinceLastIntervention: number;
};

export type JudgeResult = {
  action: "SILENCE" | "WAIT" | "INTERVENE";
  reason: string;
  message: string | null;
};

export type JudgeProvider = (
  input: JudgeInput
) => Promise<JudgeResult>;