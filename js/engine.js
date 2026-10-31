// Stage, animation, touch and sound shared by every screen.
import { Application, Container, Graphics, Sprite, Texture, Circle, Rectangle } from '../vendor/pixi.min.mjs';
export { Container, Graphics, Sprite, Texture, Circle, Rectangle };

// The designer's palette, read from the syringe and Yeti art.
export const COL = {
  tan: 0xd0bda9, tanDark: 0xbfa992, cream: 0xfff6e0,
  mint: 0xc3ebe6, mintDark: 0x8cd5ca, teal: 0x39a49c, tealDark: 0x2c857e,
  pink: 0xef289d, pinkDark: 0xc81b80, button: 0xef4d8d, buttonDark: 0xc83473, pinkLight: 0xf469ba, cheek: 0xf294cf,
  plum: 0x3c2541, ink: 0x110f0d, white: 0xffffff,
  yellow: 0xeaea07, yellowDark: 0xc9c400, green: 0x6fcc94,
  coral: 0xec7059, coralDark: 0xd2543e, purple: 0x783382, purpleLight: 0x9a55a6,
  blue: 0x5ea5c9, blueDark: 0x4c7cbd, orange: 0xf58a1f,
  inside: 0xfbdce6, insideCell: 0xf7c3d5, insideCellDark: 0xf3aec6,
};

export const app = new Application();
export const root = new Container();   // everything is laid out in stage units inside this
export const fx = new Container();     // puffs, sparkles and confetti, above every screen
export const stage = { W: 1600, H: 900, s: 1, portrait: false, m: 900, cx: 800, cy: 450 };

// ---------- easing ----------
export const E = {
  linear: t => t,
  in: t => t * t,
  out: t => 1 - (1 - t) * (1 - t),
  inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: t => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  spring: t => 1 - Math.cos(t * 9) * Math.exp(-t * 5),   // overshoot and settle
};

const GET = {
  s: o => o.scale.x, sx: o => o.scale.x, sy: o => o.scale.y,
};
const SET = {
  s: (o, v) => o.scale.set(v), sx: (o, v) => { o.scale.x = v; }, sy: (o, v) => { o.scale.y = v; },
};
const get = (o, k) => (GET[k] ? GET[k](o) : o[k]);
const set = (o, k, v) => { if (SET[k]) SET[k](o, v); else o[k] = v; };

// A timeline belongs to one screen. Killing it stops everything that screen was animating.
export class Timeline {
  constructor() { this.items = []; this.loops = []; this.dead = false; this.time = 0; }
  tween(obj, to, dur, ease = E.outCubic) {
    return new Promise(res => {
      if (this.dead) return;
      const from = {};
      for (const k in to) from[k] = get(obj, k);
      this.items.push({ obj, from, to, dur: Math.max(dur, 0.0001), t: 0, ease, res });
    });
  }
  run(dur, fn) {   // fn(t) with t from 0 to 1
    return new Promise(res => { if (!this.dead) this.items.push({ fn, dur: Math.max(dur, 0.0001), t: 0, res }); });
  }
  wait(sec) { return this.run(sec, () => {}); }
  every(fn) { const h = { fn, off: false }; this.loops.push(h); return () => { h.off = true; }; }
  stop(obj) { this.items = this.items.filter(i => i.obj !== obj); }
  kill() { this.dead = true; this.items = []; this.loops = []; }
  update(dt) {
    if (this.dead) return;
    this.time += dt;
    for (const h of this.loops) if (!h.off) h.fn(dt, this.time);
    this.loops = this.loops.filter(h => !h.off);
    const items = this.items; this.items = [];
    const keep = [];
    for (const i of items) {
      i.t += dt;
      const t = Math.min(i.t / i.dur, 1);
      if (i.fn) i.fn(t);
      else if (!i.obj.destroyed) { const e = i.ease(t); for (const k in i.to) set(i.obj, k, i.from[k] + (i.to[k] - i.from[k]) * e); }
      if (t >= 1) i.res(); else keep.push(i);
    }
    if (!this.dead) this.items = keep.concat(this.items);
  }
}
export const fxTl = new Timeline();

// ---------- screens ----------
const screens = {};
let current = null;
export function defineScreen(name, make) { screens[name] = make; }
export function go(name, opts = {}) {
  endDrag();
  if (current) {
    current.tl.kill();
    current.api.destroy && current.api.destroy();
    current.view.destroy({ children: true });
  }
  const view = new Container(), tl = new Timeline();
  root.addChildAt(view, 0);
  current = { name, view, tl, api: {}, opts };
  document.getElementById('over').dataset.screen = name;      // the page layer places and hides a few things by screen
  view.alpha = 0;
  tl.tween(view, { alpha: 1 }, 0.25, E.out);
  current.api = screens[name]({ view, tl, opts }) || {};
}
export const currentScreen = () => current;

// The stage is always wider than tall. On a phone held upright the whole stage is drawn turned a quarter
// turn, so people simply turn the phone to look at it (and it still works if their screen rotation is locked).
function fit(force) {
  const w = window.innerWidth, h = window.innerHeight;
  const turned = h > w, vw = turned ? h : w, vh = turned ? w : h;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const W = clamp(Math.round(900 * vw / vh), 1300, 2800), H = 900;      // up to about 3:1, so a phone on its side with the browser bars showing is still filled edge to edge
  const big = force || Math.abs(W - stage.W) / stage.W > 0.08;
  if (big) Object.assign(stage, { W, H, portrait: false, m: 900, cx: W / 2, cy: H / 2 });
  const s = stage.s = Math.min(vw / stage.W, vh / stage.H);
  const ox = stage.ox = (vw - stage.W * s) / 2, oy = stage.oy = (vh - stage.H * s) / 2;
  Object.assign(stage, { turned, vw, vh });
  root.scale.set(s);
  if (turned) { root.rotation = Math.PI / 2; root.position.set(w - oy, ox); }
  else { root.rotation = 0; root.position.set(ox, oy); }
  app.stage.hitArea = new Rectangle(0, 0, w, h);
  // the ordinary page layers (movie underneath, captions and the app link on top) are turned the same way
  for (const id of ['under', 'over']) {
    const el = document.getElementById(id);
    Object.assign(el.style, { width: vw + 'px', height: vh + 'px', transform: turned ? `translate(${w}px, 0) rotate(90deg)` : 'none' });
    el.classList.toggle('short', vh < 460);
    for (const [k, v] of [['--u', s], ['--ox', ox], ['--oy', oy]]) el.style.setProperty(k, v + 'px');      // one stage unit, and where the stage starts
    el.style.setProperty('--z', Math.min(2.5, Math.max(1, s / 0.5)).toFixed(3));      // page text and the footer grow with big screens (phones: 1)
  }
  // The movie is 2.2 times as wide as it is tall. On phone-shaped screens it fills the screen (a little is trimmed off
  // two edges); on squarer ones, such as tablets, trimming would lose too much, so the whole picture is shown.
  const shape = vw / vh, film = document.getElementById('movie');
  if (film) film.style.objectFit = shape >= 1.6 && shape <= 3.2 ? 'cover' : 'contain';
  if (current) {
    if (big && !force) {      // the window changed shape: lay the screen out again where the kid left off
      const keep = current.api.state ? current.api.state() : current.opts;
      go(current.name, keep);
    } else if (current.api.layout) current.api.layout();
  }
}
// stage units -> pixels inside the page layers, for the few things that are ordinary page elements
export const toCss = (x, y) => ({ x: stage.ox + x * stage.s, y: stage.oy + y * stage.s });

export async function boot() {
  await app.init({
    resizeTo: window, backgroundAlpha: 0, antialias: true,      // see-through: the movie plays underneath
    resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true,
  });
  document.getElementById('app').appendChild(app.canvas);
  app.stage.addChild(root);
  root.addChild(fx);
  app.stage.eventMode = 'static';
  fit(true);
  app.renderer.on('resize', () => fit(false));
  app.ticker.add(t => {
    const dt = Math.min(t.deltaMS / 1000, 0.05);
    if (clock.manual) return;
    if (current) current.tl.update(dt);
    fxTl.update(dt);
  });
  captions.start();
  // phones only let sound start from a finished touch, so listen for that as well as the press
  for (const ev of ['touchend', 'click', 'pointerup']) window.addEventListener(ev, audioUnlock, { capture: true, passive: true });
  app.stage.on('pointerdown', e => {
    audioUnlock();
    const pos = root.toLocal(e.global);
    const onNothing = e.target === app.stage;
    const handled = current && current.api.onDown && current.api.onDown(pos, e, onNothing);
    if (!handled && onNothing) { puff(pos); sfx.tap(); }   // even a touch on nothing answers back
  });
}

// For testing: step every animation forward by hand. With clock.manual the page's own clock is stopped,
// so a test sees exactly the time it asked for.
export const clock = { manual: false };
export async function advance(sec) {
  for (let t = 0; t < sec; t += 1 / 60) {
    if (current) current.tl.update(1 / 60); fxTl.update(1 / 60);
    for (let i = 0; i < 6; i++) await null;      // let each screen's story take its next step
  }
  app.render();
}

// ---------- touch ----------
let dragOff = null;
export function endDrag() { if (dragOff) dragOff(); dragOff = null; }
export function drag(e, { move, end }) {
  endDrag();
  const id = e.pointerId;
  const onMove = ev => { if (ev.pointerId === id) move(root.toLocal(ev.global)); };
  const onUp = ev => { if (ev.pointerId !== id) return; const p = root.toLocal(ev.global); endDrag(); end && end(p); };
  app.stage.on('globalpointermove', onMove);
  app.stage.on('pointerup', onUp); app.stage.on('pointerupoutside', onUp); app.stage.on('pointercancel', onUp);
  dragOff = () => {
    app.stage.off('globalpointermove', onMove);
    app.stage.off('pointerup', onUp); app.stage.off('pointerupoutside', onUp); app.stage.off('pointercancel', onUp);
  };
}
export function tappable(obj, r, fn) {
  obj.eventMode = 'static'; obj.cursor = 'pointer';
  if (r) obj.hitArea = new Circle(0, 0, r);
  obj.on('pointertap', e => fn(e));
  return obj;
}

// ---------- small effects ----------
export const rnd = (a, b) => a + Math.random() * (b - a);
export const pick = a => a[Math.floor(Math.random() * a.length)];
const posIn = (c, where) => where.addChild(c);

export function puff(p, color = COL.cream, n = 5, size = 12) {
  for (let i = 0; i < n; i++) {
    const g = posIn(new Graphics().circle(0, 0, rnd(size * 0.6, size)).fill({ color, alpha: 0.9 }), fx);
    const a = rnd(0, Math.PI * 2), d = rnd(18, 46);
    g.position.set(p.x, p.y); g.scale.set(0.3);
    fxTl.tween(g, { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, s: 1, alpha: 0 }, rnd(0.3, 0.45), E.out).then(() => g.destroy());
  }
}
export function star(color = COL.white, r = 14) {
  const g = new Graphics();
  g.moveTo(0, -r).quadraticCurveTo(0, 0, r, 0).quadraticCurveTo(0, 0, 0, r).quadraticCurveTo(0, 0, -r, 0).quadraticCurveTo(0, 0, 0, -r).fill(color);
  return g;
}
export function sparkle(p, colors = [COL.white, COL.yellow], n = 8, reach = 110) {
  for (let i = 0; i < n; i++) {
    const g = posIn(star(pick(colors), rnd(12, 22)), fx);
    const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3), d = rnd(reach * 0.5, reach);
    g.position.set(p.x, p.y); g.scale.set(0.2);
    fxTl.tween(g, { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, s: 1, rotation: rnd(-2, 2) }, 0.3, E.outBack)
      .then(() => fxTl.tween(g, { s: 0, alpha: 0 }, rnd(0.25, 0.45), E.in)).then(() => g.destroy());
  }
}
export function confetti(n = 46) {
  const cols = [COL.pink, COL.teal, COL.yellow, COL.white, COL.pinkLight, COL.green];
  for (let i = 0; i < n; i++) {
    const g = posIn(new Graphics().roundRect(-9, -5, 18, 10, 4).fill(pick(cols)), fx);
    const x = rnd(0, stage.W), sway = rnd(30, 90), ph = rnd(0, 6), spin = rnd(-6, 6), dur = rnd(1.4, 2.3), delay = i * 0.02;
    g.position.set(x, -30); g.visible = false;
    fxTl.wait(delay).then(() => { g.visible = true; return fxTl.run(dur, t => {
      g.y = -30 + (stage.H + 80) * t * t * 0.6 + (stage.H + 80) * t * 0.4;
      g.x = x + Math.sin(ph + t * 6) * sway; g.rotation = spin * t; g.scale.y = Math.cos(ph + t * 14);
    }); }).then(() => g.destroy());
  }
}
// A soft ring that keeps spreading from something that wants to be touched.
export function invite(tl, parent, x, y, r = 70, color = COL.white) {
  const g = parent.addChild(new Graphics());
  g.position.set(x, y);
  let t = 0;
  const off = tl.every(dt => {
    t += dt;
    g.clear();
    for (let k = 0; k < 2; k++) {
      const u = ((t / 1.6) + k * 0.5) % 1;
      g.circle(0, 0, r * (0.55 + u * 0.75)).stroke({ width: 7, color, alpha: (1 - u) * 0.75 });
    }
  });
  return { g, stop() { off(); if (!g.destroyed) g.destroy(); } };
}
let shakeBusy = false;
export function shake(amp = 10, dur = 0.3) {   // amp in stage units; never two at once
  if (shakeBusy) return; shakeBusy = true;
  const bx = root.x, by = root.y;
  fxTl.run(dur, t => {
    const k = (1 - t) * amp * stage.s;
    root.position.set(bx + rnd(-k, k), by + rnd(-k, k));
    if (t >= 1) { root.position.set(bx, by); shakeBusy = false; fit(false); }
  });
}
// squash on y, stretch on x, then spring back: the house "landed" punch
// A punch remembers the size the thing had before, so punches that pile up (quick taps) cannot make it grow or shrink.
const punched = new WeakMap();
export function punch(tl, obj, amt = 0.12, dur = 0.32) {
  const was = punched.get(obj), sx = was ? was.sx : (Math.sign(obj.scale.x) || 1), base = was ? was.base : Math.abs(obj.scale.y);
  const mine = { sx, base };
  punched.set(obj, mine);
  return tl.run(dur, t => {
    const k = Math.cos(t * 9) * (1 - t) * amt;
    if (!obj.destroyed && punched.get(obj) === mine) obj.scale.set(sx * base * (1 + k), base * (1 - k));
  }).then(() => { if (punched.get(obj) === mine) { punched.delete(obj); if (!obj.destroyed) obj.scale.set(sx * base, base); } });
}

// ---------- sound: soft, close and small. Everything is made here, no files. ----------
let ac = null, master = null;
export function audioUnlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
  }
  if (ac.state === 'suspended') ac.resume();
}
const vary = () => rnd(0.94, 1.08);
function tone({ f = 440, f2, type = 'sine', dur = 0.15, vol = 0.2, delay = 0, attack = 0.006 }) {
  if (!ac) return;
  const t0 = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
let noiseBuf = null;
function hiss() {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
// One long, soft breath to breathe along with: air drawn in (thin, rising, growing) or blown out (fuller, falling,
// fading away). Gives back a way to end it early, for when the breath is let go before it is full.
function breath(inward, dur) {
  if (!ac) return { stop() {} };
  const t0 = ac.currentTime, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = hiss(); s.loop = true;
  fl.type = 'bandpass'; fl.Q.value = inward ? 1.5 : 0.9;
  fl.frequency.setValueAtTime(inward ? 480 : 1250, t0);
  fl.frequency.exponentialRampToValueAtTime(inward ? 1650 : 360, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  if (inward) { g.gain.linearRampToValueAtTime(0.13, t0 + dur * 0.8); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); }
  else { g.gain.linearRampToValueAtTime(0.17, t0 + Math.min(0.16, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); }
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.05);
  return { stop() { try { const t = ac.currentTime; g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(0.0001, t, 0.04); s.stop(t + 0.25); } catch (e) { /* already over */ } } };
}
function noise({ dur = 0.2, vol = 0.1, f = 1000, f2, q = 1.2, delay = 0 }) {
  if (!ac) return;
  hiss();
  const t0 = ac.currentTime + delay, s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
  s.buffer = noiseBuf; fl.type = 'bandpass'; fl.Q.value = q; fl.frequency.setValueAtTime(f, t0);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
const NOTE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5];   // C D E G A C D E
export const sfx = {
  tap() { tone({ f: 520 * vary(), f2: 360, dur: 0.07, vol: 0.07 }); },
  pop(p = 1) { tone({ f: 300 * p * vary(), f2: 720 * p, dur: 0.09, vol: 0.2 }); },
  plink(i = 0) { const f = NOTE[Math.min(i, NOTE.length - 1)]; tone({ f, dur: 0.32, vol: 0.16, type: 'triangle' }); tone({ f: f * 2, dur: 0.2, vol: 0.05, delay: 0.01 }); },
  clunk(p = 1) { tone({ f: 190 * p * vary(), f2: 95 * p, dur: 0.13, vol: 0.28, type: 'triangle' }); noise({ dur: 0.05, vol: 0.06, f: 1700 }); },
  lift() { tone({ f: 420 * vary(), f2: 640, dur: 0.08, vol: 0.1 }); },
  whoosh(up = true) { noise({ dur: 0.28, vol: 0.09, f: up ? 500 : 1500, f2: up ? 1700 : 420 }); },
  boing() { tone({ f: 250 * vary(), f2: 130, dur: 0.16, vol: 0.2, type: 'triangle' }); tone({ f: 190, f2: 260, dur: 0.22, vol: 0.14, type: 'triangle', delay: 0.14 }); },
  slurp(level) { tone({ f: 260 + level * 420, f2: 300 + level * 460, dur: 0.07, vol: 0.08, type: 'triangle' }); noise({ dur: 0.06, vol: 0.02, f: 900 + level * 900 }); },
  drip() { tone({ f: 900 * vary(), f2: 500, dur: 0.08, vol: 0.1 }); },
  hm() { tone({ f: 300, f2: 250, dur: 0.16, vol: 0.16, type: 'triangle' }); tone({ f: 240, f2: 330, dur: 0.24, vol: 0.16, type: 'triangle', delay: 0.2 }); },
  raspberry() { for (let i = 0; i < 6; i++) tone({ f: 120 + (i % 2) * 30, dur: 0.05, vol: 0.12, type: 'sawtooth', delay: i * 0.045 }); },
  giggle() { for (let i = 0; i < 4; i++) tone({ f: 760 + (i % 2) * 180, f2: 900 + (i % 2) * 160, dur: 0.07, vol: 0.09, delay: i * 0.09 }); },
  yawn() { tone({ f: 330, f2: 520, dur: 0.3, vol: 0.1 }); tone({ f: 520, f2: 300, dur: 0.4, vol: 0.1, delay: 0.3 }); },
  eep() { tone({ f: 900, f2: 1400, dur: 0.12, vol: 0.1 }); },
  breathIn(dur = 1.5) { return breath(true, dur); },
  breathOut(dur = 1.5) { return breath(false, dur); },
  inhale(k = 1) { noise({ dur: 0.34, vol: 0.05, f: 500 * k, f2: 1500 * k, q: 2 }); tone({ f: 380 * k, f2: 520 * k, dur: 0.3, vol: 0.07 }); },
  choo() { noise({ dur: 0.4, vol: 0.2, f: 2400, f2: 500, q: 0.7 }); tone({ f: 700, f2: 200, dur: 0.3, vol: 0.14, type: 'triangle' }); },
  rumble() { tone({ f: 85, f2: 42, dur: 0.7, vol: 0.3 }); noise({ dur: 0.6, vol: 0.06, f: 180, f2: 80, q: 0.8 }); },
  chime() { [0, 2, 3, 5].forEach((n, i) => { tone({ f: NOTE[n], dur: 0.5, vol: 0.14, type: 'triangle', delay: i * 0.11 }); }); },
  fanfare() { [0, 2, 3, 5, 3, 5, 7].forEach((n, i) => { tone({ f: NOTE[n], dur: 0.45, vol: 0.13, type: 'triangle', delay: i * 0.12 }); tone({ f: NOTE[n] * 2, dur: 0.25, vol: 0.04, delay: i * 0.12 }); }); },
};

// ---------- spoken lines (recorded voice, played through the same sound system as the effects) ----------
const clips = {};
export function loadClips(map) { for (const k in map) clips[k] = { raw: fetch(map[k]).then(r => r.arrayBuffer()).catch(() => null), buf: null }; }
// Starts a line; gives back how long it is and a way to cut it off.
export async function playClip(name) {
  audioUnlock();
  const c = clips[name], silent = () => { captions.auto(); return { dur: 0, stop() {} }; };      // it cannot be heard: show the words
  if (!ac || !c) return silent();
  try {
    if (!c.buf) { const raw = await c.raw; if (!raw) return silent(); c.buf = await new Promise((res, rej) => ac.decodeAudioData(raw.slice(0), res, rej)); }
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = c.buf; g.gain.value = 0.95; src.connect(g); g.connect(ac.destination); src.start();
    if (ac.state !== 'running') captions.auto();
    return { dur: c.buf.duration, stop() { try { src.stop(); } catch (e) { /* already over */ } } };
  } catch (e) { return silent(); }
}

// ---------- the words on screen ----------
// Off unless asked for: the little CC button in the corner turns them on and off, and the choice is remembered.
// A page cannot tell that a phone is on silent, but it can tell when it could not start a sound at all; then the
// words come on by themselves (unless the CC button has already been used to turn them off).
export const captions = {
  on: false, chosen: false,
  set(on, chosen = true) {
    this.on = on; if (chosen) this.chosen = true;
    const over = document.getElementById('over'), b = document.getElementById('cc');
    over.classList.toggle('cc', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (chosen) { try { localStorage.setItem('syringeCC', on ? '1' : '0'); } catch (e) { /* private window */ } }
  },
  auto() { if (!this.chosen && !this.on) this.set(true, false); },
  start() {
    let saved = null;
    try { saved = localStorage.getItem('syringeCC'); } catch (e) { /* private window */ }
    if (saved) this.set(saved === '1');
    const b = document.getElementById('cc'), cap = document.getElementById('cap');
    b.addEventListener('click', () => { b.classList.remove('nudge'); this.set(!this.on); audioUnlock(); sfx.tap(); });
    // the first time there are words to show and they are hidden, the button gives one small bounce
    let nudged = false;
    new MutationObserver(() => {
      if (nudged || this.on || !cap.classList.contains('on')) return;
      nudged = true; b.classList.add('nudge');
    }).observe(cap, { attributes: true, attributeFilter: ['class'] });
  },
};

// ---------- what the visitor has finished (kept for this visit only) ----------
export const progress = { intro: false, said: false, movie: false, puzzle: false, game: false, plan: false };
try { Object.assign(progress, JSON.parse(sessionStorage.getItem('syringe') || '{}')); } catch (e) { /* private window */ }
export function mark(k) { progress[k] = true; try { sessionStorage.setItem('syringe', JSON.stringify(progress)); } catch (e) { /* fine */ } }
