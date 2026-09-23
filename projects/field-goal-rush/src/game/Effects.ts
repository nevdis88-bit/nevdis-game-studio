import Phaser from 'phaser';
import { TUNING } from '../config/GameTuning';
import type { KickResult } from './math';
import { RUN_RULES } from '../config/levels';
import { streakLabel } from './RunState';

export class Effects {
  private readonly particles: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly word: Phaser.GameObjects.Text;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly points: Phaser.GameObjects.Text;
  private readonly result: Phaser.GameObjects.Container;
  private audio?: AudioContext;
  private muted = false;
  private readonly cheer: Phaser.Sound.BaseSound;
  private readonly voices = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  constructor(private scene: Phaser.Scene) {
    this.cheer = scene.sound.add('cheer', { volume: .65 });
    this.particles = scene.add.particles(0, 0, 'confetti', {
      emitting: false, lifespan: 900, speed: { min: 150, max: 620 }, angle: { min: 195, max: 345 },
      gravityY: 680, rotate: { start: 0, end: 540 }, scale: { start: .9, end: .3 },
      alpha: { start: 1, end: 0 }, tint: [0xc5ff35, 0x22dcff, 0xffd735, 0xff508a],
      maxParticles: TUNING.maxParticles,
    }).setDepth(12);
    this.ring = scene.add.circle(0, 0, 42).setStrokeStyle(7, 0xa5fff0).setVisible(false).setDepth(7);
    this.word = scene.add.text(0, 0, '', { fontFamily: 'Barlow', fontSize: '148px', fontStyle: 'bold', color: '#c5ff35', stroke: '#285c07', strokeThickness: 7, align: 'center' }).setOrigin(.5).setShadow(0, 4, '#7fff14', 24, true, true);
    this.points = scene.add.text(0, 72, '', { fontFamily: 'Barlow', fontSize: '48px', color: '#c5ff35' }).setOrigin(.5).setShadow(0, 2, '#6dda16', 18, true, true);
    this.caption = scene.add.text(0, 116, '', { fontFamily: 'Barlow', fontSize: '25px', color: '#eaffdd', letterSpacing: 2 }).setOrigin(.5);
    this.result = scene.add.container(390, 1055, [this.word, this.points, this.caption]).setDepth(15).setVisible(false);
  }

  static createTextures(scene: Phaser.Scene) {
    if (!scene.textures.exists('glow')) {
      const texture = scene.textures.createCanvas('glow', 128, 128)!;
      const ctx = texture.context;
      const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.25, '#ffffffa0'); gradient.addColorStop(1, '#ffffff00');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, 128, 128); texture.refresh();
    }
    if (!scene.textures.exists('confetti')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff).fillRect(0, 0, 12, 22).generateTexture('confetti', 12, 22); g.destroy();
    }
  }

  unlockAudio() {
    if (!this.audio) {
      try { this.audio = new AudioContext(); } catch { return; }
    }
    if (this.audio.state === 'suspended') void this.audio.resume().catch(() => {});
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stopSounds();
  }

  stopSounds() {
    this.cheer.stop();
    if (!this.audio) return;
    const now = this.audio.currentTime;
    for (const { oscillator, gain } of this.voices) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(.0001, now, .004);
      oscillator.stop(now + .02);
    }
  }

  setPaused(paused: boolean) { this.particles.active = !paused; }

  private playComboCheer() {
    if (this.muted) return;
    this.cheer.stop();
    this.cheer.play();
  }

  private tone(frequency: number, duration: number, delay = 0, endFrequency?: number, wave: OscillatorType = 'sine', volume = .12) {
    if (this.muted || !this.audio || this.audio.state !== 'running') return;
    const at = this.audio.currentTime + delay;
    const oscillator = this.audio.createOscillator();
    const gain = this.audio.createGain();
    oscillator.type = wave; oscillator.frequency.setValueAtTime(frequency, at);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, at + duration);
    gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(volume, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(at); oscillator.stop(at + duration);
    const voice = { oscillator, gain };
    this.voices.add(voice);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.voices.delete(voice); };
  }

  playEndCue(outOfLives: boolean) {
    // Called only when the result modal first appears, after the final shot resolves.
    if (outOfLives) {
      this.tone(220, .2, 0, undefined, 'triangle', .13);
      this.tone(174.61, .24, .18, undefined, 'triangle', .13);
      this.tone(130.81, .6, .38, 98, 'triangle', .14);
      this.tone(65.41, .55, .38, undefined, 'sine', .055);
    } else {
      // A short Bb-major welcome fanfare, in the same key as the stadium music.
      this.tone(466.16, .18, 0, undefined, 'triangle', .11);
      this.tone(587.33, .18, .14, undefined, 'triangle', .11);
      this.tone(698.46, .2, .28, undefined, 'triangle', .11);
      this.tone(932.33, .78, .44, undefined, 'triangle', .12);
      for (const frequency of [466.16, 587.33, 698.46]) this.tone(frequency, .85, .44, undefined, 'sine', .035);
    }
  }

  kickContact(x: number, y: number) {
    this.ring.setPosition(x, y).setScale(.35, .7).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: this.ring, scaleX: 1.4, scaleY: .4, alpha: 0, duration: 130, ease: 'Cubic.Out' });
    this.particles.setParticleTint([0xb8ff1a, 0x50c943, 0xffffff]);
    this.particles.explode(8, x, y + 45);
    this.scene.cameras.main.shake(65, .0018);
    this.tone(220, .09, 0, 55, 'triangle', .22);
  }

  show(result: KickResult, x: number, y: number, streak: number, multiplier = 1, goalStreak = streak, reward = 0) {
    this.scene.tweens.killTweensOf(this.result);
    const perfect = result === 'PERFECT';
    const miss = result === 'NO GOOD';
    const color = perfect ? '#c5ff35' : miss ? '#ff795e' : '#8ef7ff';
    this.word.setText(`${result}!`).setColor(color).setFontSize(perfect ? 98 : 88)
      .setStroke(miss ? '#641726' : perfect ? '#286207' : '#044f86', 7)
      .setShadow(0, 4, color, perfect ? 28 : 12, true, true);
    // Celebrate consecutive goals; rewards are determined once by RunState.
    if (!miss && goalStreak > 0 && goalStreak % RUN_RULES.cheerEvery === 0) this.playComboCheer();
    this.points.setText(miss ? '' : `+${reward} COINS`).setColor(multiplier === 2 ? '#ffdf63' : color);
    this.caption.setText(miss ? 'KEEP TRYING' : multiplier === 2 ? 'GOLD SHOT · DOUBLE COINS' : perfect ? streakLabel(streak) || 'RIGHT THROUGH THE MIDDLE' : 'KEEP IT GOING')
      .setY(miss ? 72 : 116).setColor(streak >= 5 ? '#ffdf63' : '#eaffdd');
    this.result.setPosition(390, 1055).setVisible(true).setAlpha(1).setScale(.65).setAngle(-4);
    this.scene.tweens.add({ targets: this.result, scale: 1, duration: 160, ease: 'Back.Out' });
    if (!miss) {
      this.particles.setParticleTint(perfect ? [0xc5ff35, 0x22dcff, 0xffd735, 0xff508a] : [0x22dcff, 0xffffff]);
      this.particles.explode(perfect ? 48 : 16, x, y);
      this.scene.cameras.main.flash(perfect ? 90 : 50, 120, 235, 210, false, undefined, this);
      this.scene.cameras.main.shake(TUNING.screenShakeDuration, perfect ? .003 : .001);
      this.tone(523, .2); this.tone(659, .22, .07); this.tone(perfect ? 1046 : 784, .38, .14);
    } else {
      this.tone(180, .21, 0, 90);
      this.scene.cameras.main.shake(70, .0015);
    }
    this.scene.tweens.add({ targets: this.result, alpha: 0, y: 1035, delay: TUNING.resultDuration - 170, duration: 150 });
  }

  reset() { this.stopSounds(); this.scene.tweens.killTweensOf(this.result); this.result.setVisible(false).setPosition(390, 1055); this.ring.setVisible(false); }

  destroy() {
    this.stopSounds();
    this.cheer.destroy();
    this.scene.tweens.killTweensOf([this.ring, this.result]);
    this.particles.destroy(); this.ring.destroy(); this.result.destroy(true);
    if (this.audio) void this.audio.close().catch(() => {});
  }
}
