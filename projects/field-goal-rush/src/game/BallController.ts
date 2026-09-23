import Phaser from 'phaser';
import { TUNING } from '../config/GameTuning';
import { flightPose, type FlightOptions } from './math';

export class BallController {
  readonly sprite: Phaser.GameObjects.Image;
  readonly hand: Phaser.GameObjects.Image;
  private readonly handFade: Phaser.GameObjects.Image;
  phase: 'held' | 'windup' | 'release' | 'flight' = 'held';
  private held = true;
  private handBaseScale = 1;
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
    this.shadow = scene.add.ellipse(TUNING.ballStartX, TUNING.ballStartY + 121, 190, 28, 0x00130b, .5).setDepth(3);
    this.trail = scene.add.graphics().setDepth(6);
    this.halo = scene.add.image(390, 1360, 'glow').setTint(0x4fffee).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    this.groundLight = scene.add.image(390, TUNING.ballStartY + 132, 'glow').setTint(0x28ffd3).setDisplaySize(340, 108).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.rim = scene.add.image(390, 1360, 'football').setTintFill(0x62ffdb).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    this.sprite = scene.add.image(390, 1360, 'football').setDepth(8);
    this.hand = scene.add.image(390, 1360, 'throwing-hand').setOrigin(.686, .35).setDepth(9);
    // Fade only the lower sleeve. A local alpha mask follows the throwing rig,
    // so its transparent end cannot reveal a rectangular sprite edge in motion.
    const fadeKey = 'throwing-hand-alpha-mask';
    if (!scene.textures.exists(fadeKey)) {
      const texture = scene.textures.createCanvas(fadeKey, 16, 256)!;
      const ctx = texture.context;
      const gradient = ctx.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, '#fff');
      gradient.addColorStop(TUNING.handFadeStart, '#fff');
      gradient.addColorStop((TUNING.handFadeStart + TUNING.handFadeEnd) / 2, 'rgba(255,255,255,.5)');
      gradient.addColorStop(TUNING.handFadeEnd, 'rgba(255,255,255,0)');
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 16, 256);
      texture.refresh();
    }
    this.handFade = scene.make.image({ key: fadeKey, add: false }).setOrigin(.686, .35);
    this.hand.setMask(this.handFade.createBitmapMask());
    this.handBaseScale = TUNING.handSize / this.hand.height;
    this.baseScale = TUNING.ballHeight / this.sprite.height;
    this.reset();
  }

  reset() {
    this.pointCount = 0;
    this.progress.t = 0;
    this.held = true; this.phase = 'held';
    this.trail.clear();
    this.sprite.setPosition(this.startX, TUNING.ballStartY).setScale(this.baseScale * TUNING.ballStartScale).setRotation(0).setAlpha(1).setDepth(8);
    this.halo.setPosition(this.startX, TUNING.ballStartY).setDisplaySize(310, 370).setAlpha(.36);
    this.shadow.setX(this.startX).setAlpha(.16).setScale(1);
    this.groundLight.setPosition(this.startX, TUNING.ballStartY + 132).setVisible(true);
    this.rim.setPosition(this.startX, TUNING.ballStartY).setScale(this.baseScale * 1.04).setAlpha(.22).setDepth(7);
    this.hand.setAlpha(1).setVisible(true); this.followHeldHand();
  }

  updateLighting(time: number, ready: boolean, gold: boolean) {
    if (ready) {
      // Absolute offsets avoid drift; the scene's visual clock freezes in the background.
      const breath = .5 - .5 * Math.cos(time * Math.PI * 2 / TUNING.ballIdlePeriod);
      this.sprite.setY(TUNING.ballStartY - breath * TUNING.ballIdleLift)
        .setScale(this.baseScale * TUNING.ballStartScale * (1 + breath * TUNING.ballIdleScale));
      this.shadow.setScale(1 - breath * .035).setAlpha(.16 - breath * .02);
      this.followHeldHand();
    }
    const breathing = .5 + .5 * Math.sin(time * 2.6);
    const glowColor = gold ? 0xffdd72 : 0x4fffe0;
    this.rim.setPosition(this.sprite.x, this.sprite.y).setRotation(this.sprite.rotation)
      .setScale(this.sprite.scaleX * 1.045, this.sprite.scaleY * 1.025).setAlpha(this.sprite.alpha * (.16 + breathing * .14)).setTintFill(glowColor);
    this.groundLight.setX(this.sprite.x).setVisible(ready).setAlpha(.48 + breathing * .18).setTint(glowColor);
    if (this.held) this.halo.setPosition(this.sprite.x, this.sprite.y).setDisplaySize(290 + breathing * 18, 355 + breathing * 18).setAlpha(.48 + breathing * .13).setTint(glowColor);
    this.syncHandFade();
  }

  private followHeldHand() {
    // Reference pose: back of glove faces the player, thumb left, fingers wrap right.
    const scale = this.sprite.scaleY / this.baseScale;
    const angle = this.sprite.rotation;
    this.hand.setPosition(this.sprite.x, this.sprite.y).setScale(this.handBaseScale * scale).setRotation(angle);
    this.syncHandFade();
  }

  private syncHandFade() {
    this.handFade.setPosition(this.hand.x, this.hand.y)
      .setDisplaySize(this.hand.displayWidth, this.hand.displayHeight)
      .setRotation(this.hand.rotation);
  }

  throw(targetX: number, options: FlightOptions, complete: () => void, onRelease: () => void) {
    this.phase = 'windup'; this.held = true;
    const x = this.sprite.x, y = this.sprite.y;
    this.scene.tweens.add({
      targets: this.sprite, x: x - 35, y: y + 22, rotation: -.12,
      scaleX: this.baseScale * 1.035, scaleY: this.baseScale * 1.035,
      duration: TUNING.throwWindupDuration, ease: 'Sine.Out',
      onUpdate: () => this.followHeldHand(),
      onComplete: () => {
        this.phase = 'release';
        this.scene.tweens.add({
          targets: this.sprite, x: x + 32, y: y - 105, rotation: .18,
          scaleX: this.baseScale * .9, scaleY: this.baseScale * .9,
          duration: TUNING.throwReleaseDuration, ease: 'Quad.In',
          onUpdate: () => this.followHeldHand(),
          onComplete: () => {
            this.held = false; this.phase = 'flight';
            const release = { ...options, startX: this.sprite.x, startY: this.sprite.y,
              startScale: this.sprite.scaleY / this.baseScale, startRotation: this.sprite.rotation };
            onRelease(); this.fly(targetX, release, complete);
            // The hand follows through briefly, then retreats towards the player.
            this.scene.tweens.add({
              targets: this.hand, x: this.hand.x + 35, y: this.hand.y - 40,
              rotation: .28, scaleX: this.handBaseScale * .8, scaleY: this.handBaseScale * .8,
              duration: 100, ease: 'Sine.Out',
              onComplete: () => this.scene.tweens.add({
                targets: this.hand, x: x - 260, y: TUNING.ballStartY + 150,
                rotation: -.12, alpha: 0, duration: 150, ease: 'Sine.In',
              }),
            });
          },
        });
      },
    });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: TUNING.throwWindupDuration });
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
    this.scene.tweens.killTweensOf([this.sprite, this.hand, this.shadow, this.trail, this.halo, this.progress]);
    this.reset();
    this.startX = startX;
    if (transitionDuration) {
      this.hand.setAlpha(0);
      this.scene.tweens.add({ targets: this.hand, alpha: 1, duration: transitionDuration });
      this.scene.tweens.add({ targets: [this.sprite, this.shadow, this.halo], x: startX, duration: transitionDuration, ease: 'Sine.InOut', onUpdate: () => this.followHeldHand() });
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
    this.scene.tweens.killTweensOf([this.sprite, this.hand, this.shadow, this.trail, this.halo, this.progress]);
    this.hand.clearMask(true); this.handFade.destroy();
    this.sprite.destroy(); this.hand.destroy(); this.trail.destroy(); this.halo.destroy(); this.shadow.destroy();
    this.groundLight.destroy(); this.rim.destroy();
  }
}
