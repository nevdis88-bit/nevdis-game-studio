import Phaser from 'phaser';
import { ASSETS, DESIGN_HEIGHT, DESIGN_WIDTH, TUNING } from '../config/GameTuning';
import { BallController } from '../game/BallController';
import { Effects } from '../game/Effects';
import { judgeKick, type KickResult } from '../game/math';
import { createRound, goalPosition, aimPosition, RUN_RULES, type Round } from '../config/levels';
import { newRun, recordKick, readBest, saveBest, runEndReason, type RunEndReason } from '../game/RunState';
import { RunClock } from '../game/RunClock';
import { StadiumAmbience } from '../game/StadiumAmbience';
import { bindKickInput } from '../game/KickInput';

export interface GameHooks {
  ready(): void;
  hud(coins: number, seconds: number, lives: number): void;
  ended(coins: number, goals: number, reason: RunEndReason): void;
}
type State = 'TRANSITION' | 'AIMING' | 'KICKING' | 'RESULT' | 'GAME_OVER';

export class GameScene extends Phaser.Scene {
  state: State = 'AIMING';
  lockedAimX = TUNING.goalCenterX as number;
  lastResult: KickResult | null = null;
  kickCount = 0;
  paused = false;
  run = newRun();
  clock = new RunClock();
  round: Round = createRound(0);
  bestScore = 0;
  finalTargetX = TUNING.goalCenterX as number;
  private motionTime = 0;
  private visualTime = 0;
  private goalVisual = { centerX: 390, scale: 1 };
  private aimVisual = { x: 390, windOffset: 0 };
  private lockedRound?: Round;
  private ball!: BallController;
  private effects!: Effects;
  private ambience!: StadiumAmbience;
  private music!: Phaser.Sound.BaseSound;
  private aim!: Phaser.GameObjects.Graphics;
  private marker!: Phaser.GameObjects.Container;
  private goal!: Phaser.GameObjects.Image;
  private goalShadow!: Phaser.GameObjects.Image;
  private goalLightLeft!: Phaser.GameObjects.Image;
  private goalLightRight!: Phaser.GameObjects.Image;
  private target!: Phaser.GameObjects.Graphics;
  private startPrompt!: Phaser.GameObjects.Container;
  private muted = false;
  private musicEnabled = true;
  private manualPause = true;
  private playing = false;
  private haptics = false;
  private resetTimer?: Phaser.Time.TimerEvent;
  private unbindKickInput?: () => void;

  constructor(private hooks: GameHooks) { super('Game'); }

  preload() {
    this.load.image('stadium', ASSETS.stadium);
    this.load.image('football', ASSETS.football);
    this.load.image('kicking-foot', ASSETS.kickingFoot);
    this.load.image('goal', ASSETS.goal);
    this.load.image('coin', ASSETS.coin);
    this.load.image('heart', ASSETS.heart);
    this.load.svg('tap-hand', ASSETS.tapHand, { scale: 2 });
    this.load.audio('music', ASSETS.music);
    this.load.audio('cheer', ASSETS.cheer);
    this.load.on('loaderror', this.onLoadError, this);
  }

  create() {
    document.getElementById('loading')?.remove();
    this.load.off('loaderror', this.onLoadError, this);
    this.state = 'AIMING'; this.paused = false; this.motionTime = 0; this.kickCount = 0; this.lastResult = null;
    this.visualTime = 0;
    this.run = newRun(); this.clock = new RunClock(); this.round = createRound(0);
    this.goalVisual = { centerX: this.round.centerX, scale: this.round.goalScale };
    this.aimVisual = { x: aimPosition(0, this.round), windOffset: this.round.windOffset };
    this.lockedRound = undefined;
    try { this.bestScore = Math.max(this.bestScore, readBest(window.localStorage)); } catch { /* Storage may be unavailable. */ }
    Effects.createTextures(this);
    this.add.image(DESIGN_WIDTH / 2, DESIGN_HEIGHT, 'stadium').setOrigin(.5, 1)
      .setDisplaySize(DESIGN_WIDTH * TUNING.stadiumScale, DESIGN_HEIGHT * TUNING.stadiumScale);
    this.ambience = new StadiumAmbience(this);
    // Soft vignettes frame the compact HUD and the field.
    const shade = this.add.graphics().setDepth(1);
    shade.fillGradientStyle(0x01091e, 0x01091e, 0x01091e, 0x01091e, .7, .7, 0, 0).fillRect(0, 0, 780, 480);
    const bottomShadeTop = 1390;
    // Reach the actual canvas bottom even when the design height changes.
    shade.fillGradientStyle(0x001b13, 0x001b13, 0x00100c, 0x00100c, 0, 0, .85, .85)
      .fillRect(0, bottomShadeTop, DESIGN_WIDTH, DESIGN_HEIGHT - bottomShadeTop);
    this.createGoal();
    this.aim = this.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    const circle = this.add.circle(0, 0, 18, 0xc5ff35, .15).setStrokeStyle(3, 0xd4ff87);
    const dot = this.add.circle(0, 0, 7, 0xf5ffec);
    const glow = this.add.image(0, 0, 'glow').setTint(0xaaff28).setDisplaySize(100, 100).setAlpha(.55).setBlendMode(Phaser.BlendModes.ADD);
    this.marker = this.add.container(390, TUNING.goalTargetY, [glow, circle, dot]).setDepth(5);
    this.ball = new BallController(this);
    this.ball.prepare(this.round.startX);
    this.createStartPrompt();
    this.effects = new Effects(this);
    this.effects.setMuted(this.muted);
    // One loop per scene. Input starts it, satisfying mobile autoplay restrictions.
    this.sound.pauseOnBlur = false;
    this.music = this.sound.add('music');
    this.music.addMarker({ name: 'loop', start: 0, duration: 30, config: { loop: true, volume: .28 } });
    this.refreshHud();
    this.unbindKickInput = bindKickInput(this.game.canvas, () => this.onTap());
    this.input.keyboard?.on('keydown-SPACE', this.onSpace, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onBlur, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.onFocus, this);
    this.game.events.on(Phaser.Core.Events.VISIBLE, this.onFocus, this);
    this.game.canvas.setAttribute('aria-label', 'Field Goal Rush. Goal position and shot type change after a goal. Every third challenge has a narrower goal. Kick with a tap or press space when the landing marker lines up with the goal.');
    this.game.canvas.setAttribute('tabindex', '0');
    this.announce('30 seconds. Tap when the marker is inside the goal.');
    this.drawAim();
    this.setPaused(true);
    this.hooks.ready();
  }

  private onLoadError(file: Phaser.Loader.File) {
    const small = document.querySelector('#loading small');
    if (small) small.textContent = `Could not load ${file.key}. Please refresh.`;
  }

  private text(x: number, y: number, value: string, size: number, color = '#ffffff') {
    return this.add.text(x, y, value, { fontFamily: 'Barlow', fontSize: `${size}px`, fontStyle: 'bold', color, align: 'center' }).setOrigin(.5);
  }

  private createGoal() {
    // Cache alpha-clipped stadium reflections, keeping the original gold / blue material.
    for (const side of ['left', 'right'] as const) {
      const key = `goal-light-${side}`;
      if (this.textures.exists(key)) continue;
      const texture = this.textures.createCanvas(key, 600, 1044)!;
      const ctx = texture.context;
      ctx.drawImage(this.textures.get('goal').getSourceImage() as HTMLImageElement, 0, 0, 600, 1044);
      ctx.globalCompositeOperation = 'source-in';
      const light = ctx.createLinearGradient(side === 'left' ? 0 : 600, 0, side === 'left' ? 600 : 0, 0);
      light.addColorStop(0, 'rgba(180,205,255,.7)');
      light.addColorStop(.13, 'rgba(115,145,255,.18)');
      light.addColorStop(.5, 'rgba(100,130,255,.065)');
      light.addColorStop(1, 'rgba(100,130,255,0)');
      ctx.fillStyle = light; ctx.fillRect(0, 0, 600, 1044);
      ctx.globalCompositeOperation = 'source-over';
      texture.refresh();
    }
    this.goalShadow = this.add.image(390, TUNING.goalBaseY + 10, 'glow')
      .setTint(0x000c05).setAlpha(.88).setDepth(3);
    const materialDepth = 4;
    this.goal = this.add.image(390, 470, 'goal').setOrigin(.5, 0).setDepth(materialDepth);
    this.goalLightLeft = this.add.image(390, 470, 'goal-light-left').setOrigin(.5, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(materialDepth + .1);
    this.goalLightRight = this.add.image(390, 470, 'goal-light-right').setOrigin(.5, 0)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(materialDepth + .2);
    this.target = this.add.graphics().setDepth(2);
    this.refreshGoal();
  }

  private refreshGoal() {
    const x = this.goalVisual.centerX;
    const base = TUNING.goalBaseY;
    const scale = this.goalVisual.scale;
    const top = base + (TUNING.goalCrossbarY - base) * scale;
    const topY = base + (TUNING.goalTopY - base) * scale;
    const targetY = base + (TUNING.goalTargetY - base) * scale;
    const perfectRange = this.round.perfectRange * scale / this.round.goalScale;
    // Single 300×522 transparent sprite: uprights plus support, preserving collision coordinates.
    this.goal.setPosition(x, topY - 10 * scale)
      .setDisplaySize(300 * scale, 522 * scale);
    this.goalShadow.setPosition(x, base + 10 * scale).setDisplaySize(150 * scale, 32 * scale);
    // GOLD changes rewards and guide color, never the goalpost's paint or padding.
    this.goal.clearTint();
    const across = Phaser.Math.Clamp(x / DESIGN_WIDTH, 0, 1);
    this.goalLightLeft.setPosition(this.goal.x, this.goal.y).setDisplaySize(this.goal.displayWidth, this.goal.displayHeight)
      .setAlpha(.45 + .3 * (1 - across));
    this.goalLightRight.setPosition(this.goal.x, this.goal.y).setDisplaySize(this.goal.displayWidth, this.goal.displayHeight)
      .setAlpha(.45 + .3 * across);
    const target = this.target.clear();
    target.fillStyle(0xc5ff35, .035).fillRoundedRect(x - perfectRange, topY + 25 * scale, perfectRange * 2, top - topY - 50 * scale, 12);
    target.lineStyle(2, 0xd7ff83, .48);
    for (let y = targetY + 42 * scale; y < top - 25 * scale; y += 20) target.lineBetween(x, y, x, y + 6);
    target.strokeCircle(x, targetY, perfectRange);
    target.lineStyle(2, 0xc5ff35, .8).lineBetween(x - 40 * scale, targetY, x - 25 * scale, targetY).lineBetween(x + 25 * scale, targetY, x + 40 * scale, targetY);
  }

  private refreshHud() { this.refreshClock(); }
  private refreshClock() {
    this.hooks.hud(this.run.score, Math.ceil(this.clock.remainingMs / 1000), this.run.lives);
    if (import.meta.env.DEV) {
      Object.assign(this.game.canvas.dataset, { state: this.state, paused: String(this.paused), animationsPaused: String(this.tweens.paused), kicks: String(this.kickCount), kickPhase: this.ball?.phase ?? 'ready', footVisible: String(!!this.ball?.foot.visible && this.ball.foot.alpha > .01), ballY: String(this.ball?.sprite.y ?? 0) });
    }
  }

  private createStartPrompt() {
    // Exact Figma export; opacity and editable geometry are baked into the SVG.
    // Offset transparent padding so the visible icon-and-label row stays centered.
    const hand = this.add.image(-23, -46, 'tap-hand').setOrigin(0).setDisplaySize(90, 103);
    const labelX = 84.4 - 23 + 20;
    const label = this.text(labelX, 0, 'TAP TO KICK', 38).setOrigin(0, .5).setLetterSpacing(.5).setShadow(0, 3, '#001711', 8, true, true);
    const promptWidth = labelX + label.width;
    this.startPrompt = this.add.container((DESIGN_WIDTH - promptWidth) / 2, 1580, [hand, label]).setDepth(14);
    this.tweens.add({ targets: this.startPrompt, alpha: .86, duration: 820, ease: 'Sine.InOut', yoyo: true, repeat: -1 });
  }

  private syncClock() {
    this.clock.tick(performance.now());
    this.refreshClock();
    // A kick accepted before the buzzer always gets its final judgment.
    const reason = runEndReason(this.run, this.clock.remainingMs);
    if (reason && this.state !== 'KICKING' && this.state !== 'GAME_OVER') this.showGameOver(reason);
  }

  private showGameOver(reason: RunEndReason = 'time') {
    if (this.state === 'GAME_OVER') return;
    this.state = 'GAME_OVER'; this.playing = false;
    this.clock.pause(performance.now());
    this.resetTimer?.remove(false); this.resetTimer = undefined;
    this.tweens.killTweensOf([this.goalVisual, this.aimVisual, this.aim, this.marker]);
    this.effects.reset(); this.aim.setAlpha(0); this.marker.setAlpha(0);
    this.effects.playEndCue(reason === 'lives'); this.music.pause();
    this.hooks.ended(this.run.score, this.run.goals, reason);
    this.refreshHud();
  }

  startRun() {
    this.manualPause = false; this.playing = true;
    this.paused = false; this.time.paused = false;
    this.tweens.killAll();
    // killAll clears tweens, but does NOT clear TweenManager.paused.
    // The home screen and quit flow pause the manager; every new run must resume it.
    this.tweens.resumeAll(); this.tweens.timeScale = 1;
    this.resetTimer?.remove(false); this.resetTimer = undefined;
    this.run = newRun(); this.clock = new RunClock();
    this.round = createRound(0); this.effects.reset();
    this.effects.setMuted(this.muted); this.effects.setPaused(false);
    this.kickCount = 0; this.lastResult = null; this.visualTime = 0;
    this.startPrompt.setVisible(true).setAlpha(1);
    this.nextBall(); this.clock.start(performance.now()); this.startMusic();
  }

  quitRun() {
    this.manualPause = true; this.playing = false;
    this.setPaused(true); this.effects.stopSounds(); this.music.pause();
  }
  pausePlay() { this.manualPause = true; this.setPaused(true); }
  resumePlay() { this.manualPause = false; this.setPaused(false); this.startMusic(); }
  setAudio(sound: boolean, music: boolean, haptics: boolean) {
    this.muted = !sound; this.musicEnabled = music; this.haptics = haptics;
    this.effects?.setMuted(this.paused || this.muted);
    if (!music) this.music?.pause(); else if (this.playing) this.startMusic();
  }

  private onTap() {
    if (!this.playing || this.paused || this.state !== 'AIMING') return;
    this.effects.unlockAudio(); this.kick();
  }
  private onSpace(event: KeyboardEvent) {
    if (event.repeat || !this.playing || this.paused || this.state === 'GAME_OVER') return;
    if (document.activeElement?.tagName === 'BUTTON') return;
    event.preventDefault();
    this.effects.unlockAudio(); this.kick();
  }

  private startMusic() {
    if (!this.musicEnabled || this.paused || !this.playing) return;
    if (this.music.isPaused) this.music.resume();
    else if (!this.music.isPlaying) this.music.play('loop');
  }

  private onBlur() {
    this.music.pause();
    this.setPaused(true);
    this.effects.stopSounds();
  }

  private onFocus() {
    if (document.hidden || this.manualPause || !this.playing) return;
    this.setPaused(false);
    if (this.music.isPaused) this.startMusic();
  }

  private setPaused(paused: boolean) {
    if (this.state === 'GAME_OVER' || this.paused === paused) return;
    if (!this.paused) {
      this.syncClock();
      if (this.state as State === 'GAME_OVER') return;
      this.clock.pause(performance.now());
    } else this.clock.resume(performance.now());
    this.paused = paused;
    this.time.paused = this.paused;
    this.effects.setMuted(this.paused || this.muted);
    this.effects.setPaused(this.paused);
    if (this.paused) this.music.pause(); else if (this.music.isPaused) this.startMusic();
    if (this.paused) this.tweens.pauseAll(); else this.tweens.resumeAll();
    this.refreshHud();
  }

  qaKick(miss: boolean, slow = false) {
    const params = new URLSearchParams(location.search);
    if (!import.meta.env.DEV || params.get('demo') !== '1' || params.get('qa') !== '1' || this.state !== 'AIMING') return;
    this.tweens.timeScale = slow ? .18 : 1;
    this.aimVisual.x = this.round.centerX - this.round.windOffset + (miss ? this.round.width : 0);
    this.kick();
  }

  kick() {
    if (!this.playing || this.state !== 'AIMING' || this.paused) return;
    this.syncClock();
    if (this.state as State !== 'AIMING') return;
    this.clock.start(performance.now());
    this.startMusic();
    this.startPrompt.setVisible(false);
    // Lock state synchronously before creating any tweens: rapid taps cannot queue kicks.
    this.state = 'KICKING';
    this.kickCount++;
    this.lockedRound = { ...this.round };
    this.lockedAimX = this.aimVisual.x;
    this.finalTargetX = this.lockedAimX + this.lockedRound.windOffset;
    this.refreshHud();
    this.tweens.add({ targets: [this.aim, this.marker], alpha: 0, duration: 90 });
    this.ball.kick(this.lockedAimX, this.lockedRound, () => this.resolveKick(), () => {
      this.effects.kickContact(this.ball.sprite.x, this.ball.sprite.y);
      if (this.haptics) navigator.vibrate?.(18);
    });
  }

  private resolveKick() {
    if (this.state !== 'KICKING' || !this.lockedRound) return;
    this.state = 'RESULT'; this.tweens.timeScale = 1;
    const locked = this.lockedRound;
    this.lastResult = judgeKick(this.finalTargetX, locked.centerX, locked.width, locked.perfectRange);
    const previousScore = this.run.score;
    this.run = recordKick(this.run, this.lastResult, locked.distance, locked.rewardMultiplier);
    if (this.run.score > this.bestScore) {
      this.bestScore = this.run.score;
      try { saveBest(window.localStorage, this.bestScore); } catch { /* In-memory best still works. */ }
    }
    this.refreshHud();
    this.ball.finish();
    this.effects.show(this.lastResult, this.finalTargetX, locked.targetY, this.run.streak, locked.rewardMultiplier, this.run.goalStreak, this.run.score - previousScore);
    this.announce(`${this.lastResult}. ${this.run.score} coins. ${this.run.lives} lives remaining.`);
    this.syncClock();
    if (this.state as State === 'GAME_OVER') return;
    this.resetTimer = this.time.delayedCall(TUNING.recoveryDuration, this.nextBall, [], this);
  }

  private nextBall() {
    this.resetTimer = undefined;
    const reason = runEndReason(this.run, this.clock.remainingMs);
    if (reason) { this.showGameOver(reason); return; }
    this.state = 'TRANSITION';
    this.lockedRound = undefined;
    if (this.lastResult !== 'NO GOOD') this.round = createRound(this.run.goals, Math.random, this.run.shots ? this.round : undefined);
    this.round.centerX = goalPosition(0, this.round);
    this.ball.prepare(this.round.startX, RUN_RULES.transitionDuration);
    this.motionTime = 0;
    this.refreshHud();
    this.aim.setAlpha(.3); this.marker.setAlpha(.3);
    this.tweens.add({
      targets: this.aimVisual, x: aimPosition(0, this.round), windOffset: this.round.windOffset,
      duration: RUN_RULES.transitionDuration, ease: 'Sine.InOut',
    });
    this.tweens.add({
      targets: this.goalVisual, centerX: this.round.centerX, scale: this.round.goalScale,
      duration: RUN_RULES.transitionDuration, ease: 'Sine.InOut',
      onUpdate: () => { this.refreshGoal(); this.drawAim(); },
      onComplete: () => {
        if (this.state !== 'TRANSITION') return;
        this.state = 'AIMING';
        this.aim.setAlpha(1); this.marker.setAlpha(1);
        this.refreshHud(); this.drawAim();
      },
    });
  }

  update(_time: number, delta: number) {
    if (!this.playing || this.paused || this.state === 'GAME_OVER') return;
    this.syncClock();
    this.visualTime += Math.min(delta, 50) / 1000;
    this.ambience.update(this.visualTime);
    this.ball.updateLighting(this.visualTime, this.state === 'AIMING' || this.state === 'TRANSITION', this.round.pattern === 'GOLD');
    if (this.state !== 'AIMING') return;
    this.motionTime += Math.min(delta, 50) / 1000;
    this.round.centerX = goalPosition(this.motionTime, this.round);
    this.aimVisual.x = aimPosition(this.motionTime, this.round);
    this.goalVisual.centerX = this.round.centerX;
    this.refreshGoal();
    this.drawAim();
  }

  private drawAim() {
    const g = this.aim.clear();
    const sx = this.ball.sprite.x;
    const sy = TUNING.ballStartY - 75;
    const targetY = TUNING.goalBaseY + (TUNING.goalTargetY - TUNING.goalBaseY) * this.goalVisual.scale;
    const ty = targetY + 40;
    const tx = this.aimVisual.x;
    // Constant-curvature circle: vertical tangent at the ball, exact live endpoint.
    // Centered aim is the straight-line limit; this only changes the guide's shape.
    const dx = tx - sx, dy = ty - sy;
    const straight = Math.abs(dx) < .001;
    const sweep = 2 * Math.atan2(dx, -dy);
    const radius = straight ? 0 : (dx * dx + dy * dy) / (2 * dx);
    const sample = (t: number) => {
      const angle = sweep * t;
      // 2 sin²(a/2) avoids cancellation in 1 - cos(a) near the center.
      return {
        x: straight ? sx + dx * t : sx + 2 * radius * Math.sin(angle / 2) ** 2,
        y: straight ? sy + dy * t : sy - radius * Math.sin(angle),
        nx: straight ? 1 : Math.cos(angle), ny: straight ? 0 : Math.sin(angle),
        width: Phaser.Math.Linear(86, 11, t),
      };
    };
    const smooth = (v: number) => { const t = Phaser.Math.Clamp(v, 0, 1); return t * t * (3 - 2 * t); };
    const fade = (t: number) => smooth(t / .18) * smooth((1 - t) / .24);
    const pulse = .5 + .5 * Math.sin(this.visualTime * 2.8);
    const gold = this.round.pattern === 'GOLD';
    const layers = gold
      ? [[24, .04, 0xffaa15], [13, .09, 0xffc428], [6, .32, 0xffdd48], [2, .8, 0xfff3d7]]
      : [[24, .04, 0x15ffaa], [13, .09, 0x28ffc8], [6, .32, 0x48ffdc], [2, .8, 0xd7fff3]];
    const segments = 48;
    for (let i = 0; i < segments; i++) {
      const t = i / segments, next = (i + 1) / segments;
      const a = sample(t), b = sample(next), alpha = fade((t + next) / 2);
      g.fillStyle(gold ? 0xe9b520 : 0x20e9bd, (.13 + .1 * (1 - t) + pulse * .025) * alpha)
        .beginPath().moveTo(a.x - a.nx * a.width, a.y - a.ny * a.width)
        .lineTo(b.x - b.nx * b.width, b.y - b.ny * b.width)
        .lineTo(b.x + b.nx * b.width, b.y + b.ny * b.width)
        .lineTo(a.x + a.nx * a.width, a.y + a.ny * a.width).closePath().fillPath();
      for (const [width, opacity, color] of layers) {
        g.lineStyle(width, color, opacity * alpha);
        for (const side of [-1, 1]) g.lineBetween(
          a.x + side * a.nx * a.width, a.y + side * a.ny * a.width,
          b.x + side * b.nx * b.width, b.y + side * b.ny * b.width);
      }
    }
    for (let i = 0; i < 6; i++) {
      const t = (i / 6 + this.visualTime * .24) % 1;
      const p = sample(t), w = Phaser.Math.Linear(48, 7, t);
      // Chevrons follow the ribbon's tangent instead of remaining rigidly vertical.
      const points = [[0, .65], [1, 0], [1, -.45], [0, .2], [-1, -.45], [-1, 0]];
      g.fillStyle(gold ? 0xfff2c0 : 0xe3fff4, fade(t) * .9).beginPath();
      points.forEach(([u, v], index) => {
        const x = p.x + (p.nx * u + p.ny * v) * w;
        const y = p.y + (p.ny * u - p.nx * v) * w;
        if (index === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.closePath().fillPath();
    }
    for (let i = 0; i < 9; i++) {
      const t = (i / 9 + this.visualTime * .3) % 1;
      const p = sample(t), offset = Math.sin(i * 12.7) * p.width * .76;
      const x = p.x + p.nx * offset, y = p.y + p.ny * offset;
      const alpha = fade(t) * .7;
      g.fillStyle(gold ? 0xffdb39 : 0x39ffe5, alpha * .15).fillCircle(x, y, 7 - 4 * t);
      g.fillStyle(0xeaffff, alpha).fillCircle(x, y, 1.8 - t);
    }
    this.marker.setPosition(tx, targetY).setScale(this.goalVisual.scale);
    // The amber landing hint exposes wind compensation without hiding the raw aim.
    const drift = this.aimVisual.windOffset;
    if (Math.abs(drift) > 1) {
      const end = tx + drift;
      g.lineStyle(2, 0xffd477, .85);
      for (let d = 0; d < Math.abs(drift); d += 7) {
        const direction = Math.sign(drift);
        g.lineBetween(tx + d * direction, targetY, tx + Math.min(d + 3, Math.abs(drift)) * direction, targetY);
      }
      g.strokeCircle(end, targetY, 8).fillStyle(0xffe5a0).fillCircle(end, targetY, 3);
    }
  }

  private announce(message: string) {
    const node = document.getElementById('announcer');
    if (node) node.textContent = message;
  }

  private cleanup() {
    this.resetTimer?.remove(false);
    this.resetTimer = undefined;
    this.unbindKickInput?.(); this.unbindKickInput = undefined;
    this.input.keyboard?.off('keydown-SPACE', this.onSpace, this);
    this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.game.events.off(Phaser.Core.Events.HIDDEN, this.onBlur, this);
    this.game.events.off(Phaser.Core.Events.FOCUS, this.onFocus, this);
    this.game.events.off(Phaser.Core.Events.VISIBLE, this.onFocus, this);
    this.tweens.killAll();
    this.ball.destroy(); this.effects.destroy(); this.music.destroy(); this.ambience.destroy();
    this.time.paused = false;
  }
}
