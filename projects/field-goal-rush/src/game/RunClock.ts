import { RUN_RULES } from '../config/levels.ts';

// Monotonic elapsed time, independent of frame rate and animation timeScale.
export class RunClock {
  remainingMs = RUN_RULES.durationMs;
  started = false;
  private lastTime: number | null = null;

  start(now: number) {
    if (this.started) return;
    this.started = true;
    this.lastTime = now;
  }

  tick(now: number) {
    if (this.lastTime === null) return;
    this.remainingMs = Math.max(0, this.remainingMs - Math.max(0, now - this.lastTime));
    this.lastTime = Math.max(now, this.lastTime);
  }

  pause(now: number) { this.tick(now); this.lastTime = null; }
  resume(now: number) { if (this.started && this.remainingMs > 0) this.lastTime = now; }
}
