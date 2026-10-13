import type {
  JudgeProvider,
} from "./types";

/**
 * Jev decision model provider
 *
 * Planned:
 * Next.js -> Vercel AI Gateway -> Jev
 *
 * Do not execute during mock deployments.
 */
export const jevJudge: JudgeProvider = async (
  _input
) => {
  throw new Error(
    "Jev provider is not configured yet"
  );
};