import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, TUNING } from '../config/GameTuning';

/** Small animated patches keep the painted stadium and its flag artwork intact. */
export class StadiumAmbience {
  private flags: { texture: Phaser.Textures.CanvasTexture; image: Phaser.GameObjects.Image; x: number; y: number; w: number; h: number; reverse: boolean }[] = [];
  private lights: Phaser.GameObjects.Image[] = [];
  private fireworks: Phaser.GameObjects.Graphics;
  private source: HTMLImageElement;
  private lastFrame = -1;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private scene: Phaser.Scene) {
    this.source = scene.textures.get('stadium').getSourceImage() as HTMLImageElement;
    this.fireworks = scene.add.graphics().setDepth(1.5).setBlendMode(Phaser.BlendModes.ADD);
    const scale = TUNING.stadiumScale;
    const position = (x: number, y: number) => [
      DESIGN_WIDTH / 2 + (x - DESIGN_WIDTH / 2) * scale,
      DESIGN_HEIGHT + (y - DESIGN_HEIGHT) * scale,
    ];
    const patches = [
      [58, 646, 51, 43, 0], [98, 620, 64, 64, 0], [200, 687, 52, 49, 0],
      [308, 702, 49, 47, 0], [435, 700, 72, 49, 1],
      [544, 676, 86, 52, 1], [646, 630, 61, 74, 1],
    ];
    patches.forEach(([x, y, w, h, reverse], i) => {
      const key = `stadium-flag-${i}`;
      const texture = scene.textures.createCanvas(key, w * 2, h * 2)!;
      const [px, py] = position(x, y);
      const image = scene.add.image(px, py, key).setOrigin(0).setDisplaySize(w * scale, h * scale).setDepth(.5);
      this.flags.push({ texture, image, x, y, w, h, reverse: !!reverse });
    });
    for (let i = 0; i < 26; i++) {
      const lower = i >= 16;
      const x = lower ? 150 + ((i * 79) % 480) : 28 + ((i * 137) % 724);
      const y = lower ? 906 + 47 * Math.sin(x / 780 * Math.PI) : 742 + 70 * Math.sin(x / 780 * Math.PI) + (i % 3) * 8;
      const [px, py] = position(x, y);
      this.lights.push(scene.add.image(px, py, 'glow').setDepth(.6)
        .setTint(i % 5 === 0 ? 0xffe6b0 : 0xc4eaff).setDisplaySize(9 + i % 4 * 3, 9 + i % 4 * 3)
        .setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));
    }
    this.update(0);
  }

  private drawFireworks(time: number) {
    const g = this.fireworks.clear();
    if (this.reducedMotion) return;
    const bursts = [
      { delay: 1, x: 205, y: 350, color: 0x57e7ff, accent: 0xd8fbff, scale: 1.26 },
      { delay: 2.75, x: 405, y: 390, color: 0xff76e8, accent: 0xffdafa, scale: .98 },
      { delay: 4.25, x: 585, y: 315, color: 0xffd85a, accent: 0xfff5c2, scale: 1.24 },
    ];
    for (const burst of bursts) {
      const phase = ((time - burst.delay) % 6.8 + 6.8) % 6.8;
      if (phase > 1.75) continue;
      if (phase < .5) {
        const rise = Phaser.Math.Easing.Cubic.Out(phase / .5);
        const headY = burst.y + 125 * (1 - rise);
        g.lineStyle(3, burst.color, .18 + rise * .5).lineBetween(burst.x, headY + 30, burst.x, headY);
        g.fillStyle(burst.accent, .9).fillCircle(burst.x, headY, 2.5);
        continue;
      }
      const age = (phase - .5) / 1.25;
      const expand = Phaser.Math.Easing.Quadratic.Out(Math.min(age * 1.45, 1));
      const fade = (1 - age) ** 1.45;
      const radius = (12 + expand * 76) * burst.scale;
      const previousRadius = Math.max(4, radius - 17);
      for (let i = 0; i < 18; i++) {
        const angle = i / 18 * Math.PI * 2 + Math.sin(i * 9.7) * .045;
        const length = .76 + (i % 4) * .07;
        const gravity = age * age * (28 + i % 3 * 7);
        const x1 = burst.x + Math.cos(angle) * previousRadius * length;
        const y1 = burst.y + Math.sin(angle) * previousRadius * length + gravity * .65;
        const x2 = burst.x + Math.cos(angle) * radius * length;
        const y2 = burst.y + Math.sin(angle) * radius * length + gravity;
        g.lineStyle(i % 3 === 0 ? 3 : 2, i % 4 === 0 ? burst.accent : burst.color, fade * .72)
          .lineBetween(x1, y1, x2, y2);
        g.fillStyle(i % 4 === 0 ? burst.accent : burst.color, fade * .85).fillCircle(x2, y2, i % 3 === 0 ? 2.2 : 1.4);
      }
      g.fillStyle(burst.accent, fade * .65).fillCircle(burst.x, burst.y + age * age * 10, 3.5 * fade);
    }
  }

  update(time: number) {
    if (this.reducedMotion && this.lastFrame >= 0) return;
    // Only the tiny flag patches upload to the GPU, at 20 fps.
    const frame = Math.floor(time * 20);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    this.drawFireworks(time);
    // Patch coordinates use the design canvas; source artwork can have a higher resolution.
    const sourceScaleX = this.source.width / DESIGN_WIDTH;
    const sourceScaleY = this.source.height / DESIGN_HEIGHT;
    this.flags.forEach(({ texture, x, y, w, h, reverse }, i) => {
      const ctx = texture.context;
      ctx.setTransform(2, 0, 0, 2, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (let col = 0; col < w; col += 2) {
        const t = col / w;
        const freeEnd = reverse ? 1 - t : t;
        const wave = Math.sin(time * 3.3 - freeEnd * 5 + i * .8) * 2.7 * freeEnd;
        const stripWidth = Math.min(2, w - col);
        ctx.drawImage(this.source, (x + col) * sourceScaleX, y * sourceScaleY,
          stripWidth * sourceScaleX, h * sourceScaleY, col, wave, stripWidth, h);
      }
      // Feather outside the flag silhouette into the original painted sky.
      ctx.globalCompositeOperation = 'destination-in';
      const vertical = ctx.createLinearGradient(0, 0, 0, h);
      vertical.addColorStop(0, '#0000'); vertical.addColorStop(.14, '#000');
      vertical.addColorStop(.85, '#000'); vertical.addColorStop(1, '#0000');
      ctx.fillStyle = vertical; ctx.fillRect(0, 0, w, h);
      const horizontal = ctx.createLinearGradient(0, 0, w, 0);
      horizontal.addColorStop(0, '#0000'); horizontal.addColorStop(.12, '#000');
      horizontal.addColorStop(.88, '#000'); horizontal.addColorStop(1, '#0000');
      ctx.fillStyle = horizontal; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
      texture.refresh();
    });
    this.lights.forEach((light, i) => {
      const pulse = Math.max(0, Math.sin(time * (1.05 + i % 4 * .13) + i * 2.399));
      light.setAlpha(this.reducedMotion ? .06 : .025 + .65 * pulse ** 18);
    });
  }

  destroy() {
    this.fireworks.destroy();
    this.flags.forEach(({ texture, image }) => { image.destroy(); this.scene.textures.remove(texture.key); });
    this.lights.forEach(light => light.destroy());
    this.flags = []; this.lights = [];
  }
}
