import { ACTIVITY } from '../config/ActivityConfig.ts';
import { RUN_RULES } from '../config/levels.ts';
import type { KickResult } from './math.ts';

export interface RunState {
  score: number;
  lives: number;
  streak: number;
  goalStreak: number;
  bestStreak: number;
  goals: number;
  shots: number;
  longestGoal: number;
}

export function newRun(): RunState {
  return { lives: RUN_RULES.lives, score: 0, streak: 0, goalStreak: 0, bestStreak: 0, goals: 0, shots: 0, longestGoal: 0 };
}

export function recordKick(run: RunState, result: KickResult, distance: number, multiplier = 1, random = Math.random): RunState {
  if (run.lives <= 0) return run;
  const streak = result === 'PERFECT' ? run.streak + 1 : 0;
  const made = result !== 'NO GOOD';
  return {
    lives: Math.max(0, run.lives - Number(!made)),
    score: run.score + kickReward(result, streak, multiplier, random),
    streak,
    goalStreak: made ? run.goalStreak + 1 : 0,
    bestStreak: Math.max(run.bestStreak, streak),
    goals: run.goals + Number(made),
    shots: run.shots + 1,
    longestGoal: made ? Math.max(run.longestGoal, distance) : run.longestGoal,
  };
}

export function kickReward(result: KickResult, _streak: number, multiplier = 1, random = Math.random): number {
  if (result === 'NO GOOD') return 0;
  const [low, high] = result === 'PERFECT' ? ACTIVITY.perfectReward : ACTIVITY.goodReward;
  const roll = Math.min(.999999, Math.max(0, random()));
  const reward = result === 'PERFECT'
    ? (roll >= 1 - ACTIVITY.perfectBonusChance ? high : low)
    : low + Math.floor(roll * (high - low + 1));
  return reward * multiplier;
}

export function streakLabel(streak: number) {
  return streak >= 5 ? `ON FIRE  /  ${streak} STREAK` : streak >= 2 ? `${streak} STREAK` : '';
}

export function readBest(storage: Pick<Storage, 'getItem'>): number {
  try {
    const value = Number(storage.getItem(RUN_RULES.bestStorageKey));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export function saveBest(storage: Pick<Storage, 'setItem'>, best: number) {
  try { storage.setItem(RUN_RULES.bestStorageKey, String(best)); } catch { /* Keep the session playable when storage is blocked. */ }
}

export type RunEndReason = 'time' | 'lives';
/** Life exhaustion takes precedence if the final miss also reaches the buzzer. */
export function runEndReason(run: RunState, remainingMs: number): RunEndReason | null {
  return run.lives <= 0 ? 'lives' : remainingMs <= 0 ? 'time' : null;
}
