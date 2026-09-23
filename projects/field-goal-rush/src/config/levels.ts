import { ACTIVITY } from './ActivityConfig.ts';
import { TUNING } from './GameTuning.ts';

export const RUN_RULES = {
  durationMs: 30_000,
  lives: 3,
  cheerEvery: 5,
  goalsPerLevel: 1,
  transitionDuration: 220,
  windFactor: 16,
  bestStorageKey: 'field-goal-rush.rush30.variety.v1',
};

// Distance and base size progress after goals; each challenge supplies its own motion.
export const LEVELS = [
  { distance: 25, goalScale: 1, windMax: 0 },
  { distance: 30, goalScale: .97, windMax: 0 },
  { distance: 35, goalScale: .94, windMax: 0 },
  { distance: 40, goalScale: .91, windMax: .8 },
  { distance: 45, goalScale: .88, windMax: 1.2 },
  { distance: 50, goalScale: .85, windMax: 1.6 },
  { distance: 55, goalScale: .82, windMax: 2 },
  { distance: 60, goalScale: .8, windMax: 2.4 },
] as const;

export type MotionPattern = 'ANGLE' | 'TRACK' | 'GOLD';
interface GoalMotion { phase: number; moveSpeed: number; moveRange: number; laneOffset: number }
interface AimMotion { aimPhase: number; aimSpeed: number; aimRange: number; aimDirection: number; aimCenterX: number }
interface PreviousRound { lane: number; centerX: number; startX: number; pattern: MotionPattern }

export function goalPosition(elapsed: number, motion: GoalMotion): number {
  const anchor = TUNING.goalCenterX + motion.laneOffset;
  if (motion.moveRange <= 0) return anchor;
  // Constant pixels/second between lane edges; reverse immediately without a pause.
  const travel = motion.phase / (2 * Math.PI) + elapsed * motion.moveSpeed / (4 * motion.moveRange);
  const cycle = ((travel % 1) + 1) % 1;
  const offset = cycle < .25 ? cycle * 4 : cycle < .75 ? 2 - cycle * 4 : cycle * 4 - 4;
  return anchor + offset * motion.moveRange;
}

export function aimPosition(elapsed: number, motion: AimMotion): number {
  return motion.aimCenterX + Math.sin(motion.aimPhase + elapsed * motion.aimSpeed * motion.aimDirection) * motion.aimRange;
}

// Two distinct regular challenges, then a narrow precision shot. Lane and
// launch side change on success; random draws never create inaccessible shots.
export function createRound(goals: number, random = Math.random, previous?: PreviousRound) {
  const pick = <T>(values: readonly T[]): T => values[Math.min(values.length - 1, Math.floor(Math.max(0, Math.min(1, random())) * values.length))];
  const index = Math.min(Math.floor(goals / RUN_RULES.goalsPerLevel), LEVELS.length - 1);
  const level = LEVELS[index];
  const pressure = 1 - Math.exp(-Math.max(0, goals - 7) / 12);
  const pattern: MotionPattern = goals % 3 === 2 ? 'GOLD'
    : previous && previous.pattern !== 'GOLD' ? previous.pattern === 'ANGLE' ? 'TRACK' : 'ANGLE'
    : pick(['ANGLE', 'TRACK'] as const);
  const laneCenters = [245, 390, 535] as const;
  const candidates = [0, 1, 2].filter(lane => !previous || (lane !== previous.lane && Math.abs(laneCenters[lane] - previous.centerX) >= 105));
  const lane = pick(candidates);
  const anchor = laneCenters[lane];
  const startChoices = (lane === 0 ? [545, 390] : lane === 2 ? [235, 390] : [235, 545]).filter(x => x !== previous?.startX);
  const startX = pick(startChoices);
  const scale = (level.goalScale - .04 * pressure) * (pattern === 'GOLD' ? .8 : 1);
  const maxWind = goals < 5 ? 0 : Math.min(1.8, level.windMax + .4 * pressure);
  const wind = maxWind === 0 ? 0 : (random() < .5 ? -1 : 1) * Math.round((.4 + random() * .6) * maxWind * 10) / 10;
  const windOffset = wind * RUN_RULES.windFactor;
  const moveRange = Math.min(pattern === 'TRACK' ? 110 : pattern === 'GOLD' ? 96 : 84,
    anchor - 150 * scale - 24, 780 - anchor - 150 * scale - 24);
  const motion = {
    ...level, goalScale: scale, pattern, lane, startX,
    moveRange,
    moveSpeed: (95 + index * 9 + pressure * 30) * (pattern === 'TRACK' ? 1.12 : 1),
    aimCenterX: anchor - windOffset,
    aimRange: pattern === 'TRACK' ? 145 : pattern === 'GOLD' ? 160 : 180,
    aimSpeed: ((pattern === 'TRACK' ? 1.7 : pattern === 'GOLD' ? 1.9 : 1.45) + index * .07 + pressure * .15) * ACTIVITY.aimSpeedMultiplier,
    aimDirection: pick([-1, 1]),
    // Start away from the hit window so an instant follow-up tap is not a free goal.
    aimPhase: pick([-1, 1]) * (Math.PI / 2 + (random() - .5) * .3),
    phase: pick([0, Math.PI]),
    laneOffset: anchor - TUNING.goalCenterX,
  };
  return {
    ...motion, index, stage: goals, pressure, wind, windOffset,
    title: pattern === 'ANGLE' ? 'ANGLE SHOT' : pattern === 'TRACK' ? 'MOVING GOAL' : 'GOLD SHOT',
    instruction: pattern === 'ANGLE' ? 'SIDE ANGLE · TIME THE AIM' : pattern === 'TRACK' ? 'MOVING GOAL · CATCH THE CROSSING' : 'NARROW GOAL · STAY SHARP',
    rewardMultiplier: 1,
    centerX: goalPosition(0, motion),
    width: TUNING.goalWidth * scale,
    perfectRange: TUNING.perfectRange * scale * (1 - .25 * pressure) * (pattern === 'GOLD' ? .82 : 1),
    targetY: TUNING.goalBaseY + (TUNING.goalTargetY - TUNING.goalBaseY) * scale,
    topY: TUNING.goalBaseY + (TUNING.goalTopY - TUNING.goalBaseY) * scale,
    crossbarY: TUNING.goalBaseY + (TUNING.goalCrossbarY - TUNING.goalBaseY) * scale,
    endScale: TUNING.ballEndScale * scale,
  };
}

export type Round = ReturnType<typeof createRound>;
