import Phaser from 'phaser';
import { TUNING } from '../config/GameTuning';
import { flightPose, type FlightOptions } from './math';

export class BallController {
  readonly sprite: Phaser.GameObjects.Image;
  readonly foot: Phaser.GameObjects.Image;
  private readonly footFade: Phaser.GameObjects.Image;
  phase: 'ready' | 'windup' | 'contact' | 'flight' = 'ready';
  private grounded = true;
  private footBaseScale = 1;
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly halo: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly groundLight: Phaser.GameObjects.Image;
  private readonly rim: Phaser.GameObjects.Image;
  private readonly points = Array.from({ length: TUNING.trailLength }, () => ({ x: 0, y: 0 }));
  private readonly pose = { x: 0, y: 0, scale: 1, rotation: 0 };
  private readonly trailPose = { x: 0, y: 0, scale: 1, rotation: 0 };
  private readonly progress = { t: 0 };
  private pointCount = 0;
  private baseScale = 1;
  private startX = TUNING.ballStartX as number;

  constructor(private scene: Phaser.Scene) {
    this.shadow = scene.add.ellipse(TUNING.ballStartX, TUNING.ballStartY + 165, 160, 25, 0x00130b, .5).setDepth(3);
    this.trail = scene.add.graphics().setDepth(6);
    this.halo = scene.add.image(390, 1360, 'glow').setTint(0x4fffee).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    this.groundLight = scene.add.image(390, TUNING.ballStartY + 132, 'glow').setTint(0x28ffd3).setDisplaySize(340, 108).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.rim = scene.add.image(390, 1360, 'football').setTintFill(0x62ffdb).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    this.sprite = scene.add.image(390, 1360, 'football').setDepth(8);
    this.foot = scene.add.image(390, 1360, 'kicking-foot').setOrigin(.94, .90).setDepth(9);
    // Fade the upper sock in sprite space; the mask follows every kick pose.
    const fadeKey = 'kicking-foot-alpha-mask';
    if (!scene.textures.exists(fadeKey)) {
      const texture = scene.textures.createCanvas(fadeKey, 16, 256)!;
      const ctx = texture.context;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, 'rgba(255,255,255,0)');
      gradient.addColorStop(TUNING.footFadeStart, 'rgba(255,255,255,0)');
      gradient.addColorStop((TUNING.footFadeStart + TUNING.footFadeEnd) / 2, 'rgba(255,255,255,.5)');
      gradient.addColorStop(TUNING.footFadeEnd, '#fff');
      gradient.addColorStop(1, '#fff');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 256);
      texture.refresh();
    }
    this.footFade = scene.make.image({ key: fadeKey, add: false }).setOrigin(.94, .90);
    this.foot.setMask(this.footFade.createBitmapMask());
    this.footBaseScale = TUNING.footSize / this.foot.height;
    this.baseScale = TUNING.ballHeight / this.sprite.height;
    this.reset();
  }

  reset() {
    this.pointCount = 0;
    this.progress.t = 0;
    this.grounded = true; this.phase = 'ready';
    this.trail.clear();
    this.sprite.setPosition(this.startX, TUNING.ballStartY).setScale(this.baseScale * TUNING.ballStartScale).setRotation(0).setAlpha(1).setDepth(8);
    this.halo.setPosition(this.startX, TUNING.ballStartY).setDisplaySize(310, 370).setAlpha(.36);
    this.shadow.setX(this.startX).setAlpha(.16).setScale(1);
    this.groundLight.setPosition(this.startX, TUNING.ballStartY + 132).setVisible(true);
    this.rim.setPosition(this.startX, TUNING.ballStartY).setScale(this.baseScale * 1.04).setAlpha(.22).setDepth(7);
    this.foot.setAlpha(0).setVisible(false); this.placeReadyFoot();
  }

  updateLighting(time: number, ready: boolean, gold: boolean) {
    if (ready) {
      // The upright ball stays planted until the boot makes contact.
      this.sprite.setY(TUNING.ballStartY).setScale(this.baseScale * TUNING.ballStartScale);
      this.shadow.setScale(1).setAlpha(.22);
      this.foot.setVisible(false); this.placeReadyFoot();
    }
    const breathing = .5 + .5 * Math.sin(time * 2.6);
    const glowColor = gold ? 0xffdd72 : 0x4fffe0;
    this.rim.setPosition(this.sprite.x, this.sprite.y).setRotation(this.sprite.rotation)
      .setScale(this.sprite.scaleX * 1.045, this.sprite.scaleY * 1.025).setAlpha(this.sprite.alpha * (.16 + breathing * .14)).setTintFill(glowColor);
    this.groundLight.setX(this.sprite.x).setVisible(ready).setAlpha(.48 + breathing * .18).setTint(glowColor);
    if (this.grounded) this.halo.setPosition(this.sprite.x, this.sprite.y).setDisplaySize(290 + breathing * 18, 355 + breathing * 18).setAlpha(.48 + breathing * .13).setTint(glowColor);
    this.syncFootFade();
  }

  private placeReadyFoot() {
    this.foot.setPosition(this.sprite.x - 128, TUNING.ballStartY + 110)
      .setScale(this.footBaseScale).setRotation(0);
    this.syncFootFade();
  }

  private syncFootFade() {
    this.footFade.setPosition(this.foot.x, this.foot.y)
      .setDisplaySize(this.foot.displayWidth, this.foot.displayHeight)
      .setRotation(this.foot.rotation);
  }

  kick(targetX: number, options: FlightOptions, complete: () => void, onContact: () => void) {
    this.phase = 'windup'; this.grounded = true;
    const x = this.sprite.x, y = this.sprite.y;
    this.foot.setPosition(x - 220, y + 175).setScale(this.footBaseScale)
      .setRotation(-.13).setAlpha(0).setVisible(true);
    this.syncFootFade();
    this.scene.tweens.add({
      targets: this.foot, x: x - 172, y: y + 143, rotation: -.10, alpha: 1,
      duration: TUNING.kickWindupDuration, ease: 'Sine.Out',
      onUpdate: () => this.syncFootFade(),
      onComplete: () => {
        this.phase = 'contact';
        this.scene.tweens.add({
          targets: this.foot, x: x - 48, y: y + 48, rotation: -.08,
          duration: TUNING.kickSwingDuration, ease: 'Quad.In',
          onUpdate: () => this.syncFootFade(),
          onComplete: () => {
            this.grounded = false; this.phase = 'flight';
            const launch = { ...options, startX: x, startY: y,
              startScale: this.sprite.scaleY / this.baseScale, startRotation: 0 };
            onContact(); this.fly(targetX, launch, complete);
            this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 100 });
            // Only the foot follows through; the ball has already launched.
            this.scene.tweens.add({
              targets: this.foot, x: x + 4, y: y - 42, rotation: -.23,
              duration: 100, ease: 'Sine.Out', onUpdate: () => this.syncFootFade(),
              onComplete: () => this.scene.tweens.add({
                targets: this.foot, x: x - 245, y: y + 125,
                rotation: -.06, alpha: 0, duration: 170, onComplete: () => this.foot.setVisible(false), ease: 'Sine.In',
                onUpdate: () => this.syncFootFade(),
              }),
            });
          },
        });
      },
    });
  }

  private fly(targetX: number, options: FlightOptions, complete: () => void) {
    this.scene.tweens.add({ targets: this.progress, t: 1, duration: TUNING.flightDuration, ease: 'Linear',
      onUpdate: () => {
        flightPose(this.progress.t, targetX, this.pose, options);
        this.sprite.setPosition(this.pose.x, this.pose.y)
          .setScale(this.baseScale * this.pose.scale * (.94 + .06 * Math.cos(this.progress.t * Math.PI * 8)), this.baseScale * this.pose.scale)
          .setRotation(this.pose.rotation);
        this.halo.setPosition(this.pose.x, this.pose.y).setDisplaySize(260 * this.pose.scale, 300 * this.pose.scale).setAlpha(.55);
        this.sampleTrail(this.progress.t, targetX, options);
        this.drawTrail();
      },
      onComplete: complete,
    });
  }

  finish() {
    // Cross the goal plane, then recede behind the uprights; judgment happens only once.
    this.sprite.setDepth(3);
    this.halo.setDepth(3);
    this.rim.setDepth(3);
    this.scene.tweens.add({ targets: this.sprite, x: this.sprite.x + (this.sprite.x - 390) * .22, y: this.sprite.y - 75, scale: this.baseScale * .12, alpha: 0, duration: 100 });
    this.scene.tweens.add({ targets: [this.trail, this.halo], alpha: 0, duration: 100 });
  }

  prepare(startX = TUNING.ballStartX as number, transitionDuration = 0) {
    this.scene.tweens.killTweensOf([this.sprite, this.foot, this.shadow, this.trail, this.halo, this.progress]);
    this.reset();
    this.startX = startX;
    if (transitionDuration) {
      this.scene.tweens.add({ targets: [this.sprite, this.shadow, this.halo], x: startX, duration: transitionDuration, ease: 'Sine.InOut', onUpdate: () => { this.foot.setVisible(false); this.placeReadyFoot(); } });
    }
    else { this.sprite.setX(startX); this.shadow.setX(startX); this.halo.setX(startX); }
    this.updateLighting(0, true, false);
    this.trail.setAlpha(1);
    this.halo.setDepth(7);
  }

  private sampleTrail(t: number, targetX: number, options: FlightOptions) {
    // Sample the controlled trajectory at fixed time offsets. A 120 Hz display
    // must not halve the trail's length compared with a 60 Hz display.
    this.pointCount = Math.min(Math.ceil(t * TUNING.flightDuration / TUNING.trailSampleInterval) + 1, this.points.length);
    for (let i = 0; i < this.pointCount; i++) {
      flightPose(t - i * TUNING.trailSampleInterval / TUNING.flightDuration, targetX, this.trailPose, options);
      this.points[i].x = this.trailPose.x;
      this.points[i].y = this.trailPose.y;
    }
  }

  private drawTrail() {
    this.trail.clear();
    for (let i = this.pointCount - 1; i > 0; i--) {
      const strength = 1 - i / this.pointCount;
      const a = this.points[i];
      const b = this.points[i - 1];
      this.trail.lineStyle(50 * strength + 4, 0x007bff, strength * TUNING.trailAlpha * .25).lineBetween(a.x, a.y, b.x, b.y);
      this.trail.lineStyle(24 * strength + 2, 0x24dfff, strength * TUNING.trailAlpha * .8).lineBetween(a.x, a.y, b.x, b.y);
      this.trail.lineStyle(6 * strength + 1, 0xd8ffff, strength * TUNING.trailAlpha).lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  destroy() {
    this.scene.tweens.killTweensOf([this.sprite, this.foot, this.shadow, this.trail, this.halo, this.progress]);
    this.foot.clearMask(true); this.footFade.destroy();
    this.sprite.destroy(); this.foot.destroy(); this.trail.destroy(); this.halo.destroy(); this.shadow.destroy();
    this.groundLight.destroy(); this.rim.destroy();
  }
}
