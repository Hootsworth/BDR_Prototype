import { randomInt } from 'node:crypto';

export const AI_MODEL_ASSIGNMENTS = [
  'Meta Spark 1.3 Contributor',
  'Gemini 3.7 Flash',
  'ChatGPT 5.6 Nano'
] as const;

export type AiModelAssignment = typeof AI_MODEL_ASSIGNMENTS[number];

export function chooseAiModelAssignment(): AiModelAssignment {
  return AI_MODEL_ASSIGNMENTS[randomInt(AI_MODEL_ASSIGNMENTS.length)];
}

export function getUtcWeekStart(date = new Date()): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day.toISOString().slice(0, 10);
}
