import test from 'node:test';
import assert from 'node:assert/strict';
import { bindKickInput } from '../src/game/KickInput.ts';

function fixture(pointer = true) {
  const canvas = new EventTarget();
  let rect = { left: 12, top: 24, width: 300, height: 650, right: 312, bottom: 674 };
  Object.assign(canvas, {
    ownerDocument: { defaultView: pointer ? { PointerEvent: Event } : {} },
    getBoundingClientRect: () => rect,
  });
  let kicks = 0;
  const unbind = bindKickInput(canvas as unknown as HTMLCanvasElement, () => kicks++);
  const send = (type: string, values: Record<string, unknown> = {}, canceled = false) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { clientX: 162, clientY: 540, button: 0, isPrimary: true, ...values });
    if (canceled) event.preventDefault();
    canvas.dispatchEvent(event);
    return event;
  };
  return { canvas, send, unbind, kicks: () => kicks, resize: (next: typeof rect) => { rect = next; } };
}

test('finger, pen and mouse presses kick once; compatibility events cannot double kick', () => {
  const f = fixture();
  for (const pointerType of ['touch', 'pen', 'mouse']) {
    assert.equal(f.send('pointerdown', { pointerType }).defaultPrevented, true);
    f.send('mousedown'); f.send('click');
  }
  assert.equal(f.kicks(), 3);
});

test('second fingers and non-primary mouse buttons do not kick', () => {
  const f = fixture();
  f.send('pointerdown', { pointerType: 'touch', isPrimary: false });
  f.send('pointerdown', { button: 2 });
  assert.equal(f.kicks(), 0);
});

test('hit testing follows the live scaled canvas after resizing and excludes the HUD', () => {
  const f = fixture();
  f.send('pointerdown', { clientY: 50 });
  f.send('pointerdown', { clientX: 500 });
  f.send('pointerdown', { clientY: 900 });
  assert.equal(f.kicks(), 0);
  f.resize({ left: 100, top: 200, width: 150, height: 325, right: 250, bottom: 525 });
  f.send('pointerdown', { clientX: 175, clientY: 470 });
  assert.equal(f.kicks(), 1);
  f.send('pointerdown'); // The old point is now below the canvas.
  assert.equal(f.kicks(), 1);
  f.resize({ left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 });
  f.send('pointerdown', { clientX: 0, clientY: 0 });
  assert.equal(f.kicks(), 1);
});

test('a webview preventing its default gesture does not discard the canvas press', () => {
  const f = fixture();
  f.send('pointerdown', { pointerType: 'touch' }, true);
  assert.equal(f.kicks(), 1);
});

test('legacy touch starts kick immediately and suppress synthetic mouse presses', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const f = fixture(false), point = { clientX: 162, clientY: 540 };
  const press = f.send('touchstart', { touches: [point], changedTouches: [point] });
  assert.equal(press.defaultPrevented, true);
  now += 300; f.send('mousedown'); f.send('click');
  assert.equal(f.kicks(), 1);
  f.send('touchstart', { touches: [point, point], changedTouches: [point] });
  assert.equal(f.kicks(), 1);
  now += 1001; f.send('mousedown');
  assert.equal(f.kicks(), 2);
});

test('scene cleanup removes both modern and legacy input listeners', () => {
  for (const pointer of [true, false]) {
    const f = fixture(pointer), point = { clientX: 162, clientY: 540 };
    f.unbind();
    f.send('pointerdown'); f.send('mousedown');
    f.send('touchstart', { touches: [point], changedTouches: [point] });
    assert.equal(f.kicks(), 0);
  }
});
