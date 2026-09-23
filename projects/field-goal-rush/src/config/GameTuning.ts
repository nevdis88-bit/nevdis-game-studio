export const DESIGN_WIDTH = 780;
export const DESIGN_HEIGHT = 1688;

export const TUNING = {
  // Bottom-anchored crop lifts the field horizon ~80px without exposing an edge.
  stadiumScale: 1.12,
  ballStartX: 390,
  ballStartY: 1330,
  ballHeight: 330,
  goalCenterX: 390,
  goalTargetY: 570,
  goalTopY: 480,
  goalCrossbarY: 810,
  goalBaseY: 972,
  // Inside edges of the uprights at the first distance.
  goalWidth: 240,
  flightDuration: 560,
  kickWindupDuration: 125,
  kickSwingDuration: 130,
  footSize: 600,
  footFadeStart: .06,
  footFadeEnd: .30,
  arcHeight: 296,
  ballStartScale: 1,
  ballEndScale: 0.28,
  ballSpin: Math.PI * .75,
  perfectRange: 36,
  resultDuration: 650,
  recoveryDuration: 120,
  screenShakeDuration: 90,
  trailLength: 16,
  trailSampleInterval: 20,
  trailAlpha: 0.85,
  maxParticles: 64,
} as const;

export const ASSETS = {
  stadium: './assets/stadium.webp?v=figma-restored-3',
  football: './assets/football-forward.png',
  kickingFoot: './assets/kicking-foot-v1.png',
  goal: './assets/goal-rendered.png?v=figma-20260917-6',
  coin: './assets/coin-green.png?v=figma-20260917-2',
  heart: './assets/heart-3d.png?v=figma-20260917-2',
  tapHand: './assets/tap-hand.svg?v=figma-20260917-1',
  music: './assets/stadium-rush.m4a?v=stadium-brass',
  cheer: './assets/cheer-crowd.mp3?v=1',
};
