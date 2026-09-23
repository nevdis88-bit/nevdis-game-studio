import { DESIGN_HEIGHT } from '../config/GameTuning.ts';

/** Use the visible canvas bounds, including the phone frame's CSS transform. */
export function bindKickInput(canvas: HTMLCanvasElement, kick: () => void) {
  const activate = (event: Event, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 ||
        !Number.isFinite(clientX) || !Number.isFinite(clientY) ||
        clientX < rect.left || clientX > rect.right ||
        clientY < rect.top + rect.height * 350 / DESIGN_HEIGHT || clientY > rect.bottom) return;
    if (event.cancelable) event.preventDefault();
    kick();
  };

  // Bind directly instead of depending on Phaser's touch-device detection,
  // window focus requests or cached page-coordinate transforms in webviews.
  if (canvas.ownerDocument.defaultView?.PointerEvent) {
    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      activate(event, event.clientX, event.clientY);
    };
    canvas.addEventListener('pointerdown', down, { passive: false });
    return () => canvas.removeEventListener('pointerdown', down);
  }

  // Older webviews expose only Touch Events. Suppress the following synthetic
  // mouse event so a single finger press cannot kick twice.
  let ignoreMouseUntil = 0;
  const touch = (event: TouchEvent) => {
    ignoreMouseUntil = Date.now() + 1000;
    if (event.touches.length !== 1) return;
    const point = event.changedTouches[0];
    if (point) activate(event, point.clientX, point.clientY);
  };
  const mouse = (event: MouseEvent) => {
    if (event.button !== 0 || Date.now() < ignoreMouseUntil) return;
    activate(event, event.clientX, event.clientY);
  };
  canvas.addEventListener('touchstart', touch, { passive: false });
  canvas.addEventListener('mousedown', mouse);
  return () => {
    canvas.removeEventListener('touchstart', touch);
    canvas.removeEventListener('mousedown', mouse);
  };
}
