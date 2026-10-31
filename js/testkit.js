// Test helpers, loaded only when the address has ?test. Not part of what visitors run.
//   T.tap(x, y) / T.drag(x0, y0, x1, y1)   touch the stage, in stage units
//   snap()                                   remember what the stage looks like now
//   sheet(name, cols)                        save every remembered picture as one contact sheet
import { app, root, stage } from './engine.js';

export function installTestKit() {
  const c = app.canvas;
  const P = (X, Y) => ({
    clientX: root.toGlobal({ x: X, y: Y }).x, clientY: root.toGlobal({ x: X, y: Y }).y,
    pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true, button: 0, buttons: 1,
  });
  const T = {
    down(X, Y) { c.dispatchEvent(new PointerEvent('pointerdown', P(X, Y))); },
    move(X, Y) { c.dispatchEvent(new PointerEvent('pointermove', P(X, Y))); },
    up(X, Y) { c.dispatchEvent(new PointerEvent('pointerup', P(X, Y))); },
    tap(X, Y) { T.down(X, Y); T.up(X, Y); },
    drag(a, b, x, y, n = 8) { T.down(a, b); for (let i = 1; i <= n; i++) T.move(a + (x - a) * i / n, b + (y - b) * i / n); T.up(x, y); },
  };
  const frames = [];
  window.T = T;
  window.snap = (h = 520) => {
    app.render();
    const cv = document.createElement('canvas');
    cv.height = h; cv.width = Math.round(h * c.width / c.height);
    const g = cv.getContext('2d');
    g.fillStyle = '#f8eb45'; g.fillRect(0, 0, cv.width, cv.height);      // the page colour behind the see-through stage
    g.drawImage(c, 0, 0, cv.width, cv.height);
    frames.push(cv);
  };
  window.sheet = async (name, cols = 6) => {
    if (!frames.length) return 'nothing';
    const w = frames[0].width, h = frames[0].height, rows = Math.ceil(frames.length / cols);
    const cv = document.createElement('canvas');
    cv.width = Math.min(cols, frames.length) * (w + 6); cv.height = rows * (h + 6);
    const g = cv.getContext('2d');
    g.fillStyle = '#222'; g.fillRect(0, 0, cv.width, cv.height);
    frames.forEach((f, i) => g.drawImage(f, (i % cols) * (w + 6) + 3, Math.floor(i / cols) * (h + 6) + 3));
    frames.length = 0;
    const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.85));
    await fetch('/__shot/' + name, { method: 'POST', body: blob });
    return name + ' ' + cv.width + 'x' + cv.height;
  };
}
