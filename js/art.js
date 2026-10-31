// The cast and props. Syringe and Yeti are the designer's art (art/*.svg, cut by tools/build_art.py);
// the bottle, germs, guard cells and buttons are drawn here in the same flat style and palette.
import { Container, Graphics, Sprite, Texture, Circle, COL, E, sfx, rnd } from './engine.js';

export const M = {};      // art/manifest.json: where each designer part sits, in designer points
const TEX = {};

// ?art=3 draws the designer's art three times as fine: for close-up filming (tools/sizzle.html), not for visitors.
const SHARP = Math.max(1, Math.min(3, Number(new URLSearchParams(location.search).get('art')) || 1));

export async function loadArt() {
  Object.assign(M, await (await fetch('art/manifest.json')).json());
  const names = Object.keys(M).filter(n => n[0] !== '_');
  await Promise.all(names.map(n => new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(img.naturalWidth * SHARP); cv.height = Math.round(img.naturalHeight * SHARP);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      TEX[n] = Texture.from(cv); res();
    };
    img.onerror = rej; img.src = `art/${n}.png`;
  })));
}

// One designer part as a sprite sized in designer points, placed relative to (ox, oy).
function part(name, ox, oy, centred) {
  const m = M[name], sp = new Sprite(TEX[name]);
  sp.scale.set(m.w / TEX[name].width);
  if (centred) { sp.anchor.set(0.5); sp.position.set(m.x + m.w / 2 - ox, m.y + m.h / 2 - oy); }
  else sp.position.set(m.x - ox, m.y - oy);
  return sp;
}

// A designer part on its own, sized in designer points, with its top-left corner at (0,0).
export function partSprite(name) { const sp = new Sprite(TEX[name]); sp.scale.set(M[name].w / TEX[name].width); return sp; }

// A short curved highlight stroke, from angle a0 to a1 on a circle of radius r.
function sheen(g, x, y, r, a0, a1, style) {
  const am = (a0 + a1) / 2, rc = r / Math.cos((a1 - a0) / 2);
  return g.moveTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r)
    .quadraticCurveTo(x + Math.cos(am) * rc, y + Math.sin(am) * rc, x + Math.cos(a1) * r, y + Math.sin(a1) * r).stroke(style);
}

// ---------- the syringe ----------
// Lies along +x with the needle pointing right; (0,0) is the middle of the barrel. Units: designer points.
export const SYRINGE_PARTS = ['barrel', 'cap', 'stopper', 'needle', 'thumb', 'plunger', 'flange', 'hub'];
export function syringeOrigin() { const b = M.barrel; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }

export function makeSyringe({ cap = true } = {}) {
  const o = syringeOrigin();
  const rig = new Container(), plunger = new Container(), liquid = new Graphics();
  const p = {};
  for (const n of SYRINGE_PARTS) p[n] = part(n, o.x, o.y, false);
  // The face: the cheeks and smile are the designer's art; the two eyes are drawn here (same place, size and colour)
  // so that only the eyes blink. The art is drawn for a syringe pointing up to the right, so "down the face" is
  // a diagonal in the art: each eye is turned to match, and closes along its own up-and-down.
  const faceArt = part('face_rest', o.x, o.y, true), face = new Container();
  face.position.copyFrom(faceArt.position); faceArt.position.set(0, 0);
  const fx0 = M.face.x + M.face.w / 2, fy0 = M.face.y + M.face.h / 2;
  const eyes = M._points.syringe_eyes.map(([x, y, r]) => {
    const e = new Graphics().circle(0, 0, r).fill(COL.ink);
    e.position.set(x - fx0, y - fy0); e.rotation = Math.PI / 4;
    return e;
  });
  face.addChild(faceArt, ...eyes);
  p.face = face;
  plunger.addChild(p.stopper, p.thumb, p.plunger, p.face);
  rig.addChild(p.barrel, liquid, p.cap, p.needle, plunger, p.flange, p.hub);
  p.cap.visible = cap;
  const stopperFront = M.stopper.x + M.stopper.w - o.x;

  const s = {
    rig, parts: p, plunger, liquid, face: p.face,
    DMAX: 1000, pull: 0, wet: false, color: COL.yellow,
    tipX: M.needle.x + M.needle.w - o.x,
    capX: M.cap.x + M.cap.w / 2 - o.x,
    thumbX: M.thumb.x - o.x,
    backX: M.thumb.x - o.x,
    // how far the plunger is pulled back; with `wet` the space it leaves is full of vaccine
    setPull(d) {
      s.pull = Math.max(0, Math.min(s.DMAX, d));
      plunger.x = -s.pull;
      liquid.clear();
      if (s.wet && s.pull > 6) {
        const x0 = stopperFront - s.pull - 220, len = s.pull + 236;
        liquid.roundRect(x0, -362, len, 724, 215).fill(s.color);
        liquid.roundRect(x0 + 60, -300, Math.max(len - 330, 0), 46, 23).fill({ color: COL.white, alpha: 0.45 });
      }
    },
    // keep the face the right way up whatever way the syringe is pointing (art is drawn for -45 degrees)
    faceUp(rigRotation, flipped) { p.face.rotation = flipped ? rigRotation - Math.PI / 4 : -(rigRotation + Math.PI / 4); },
    blink(tl) {
      return tl.run(0.2, t => { const k = t < 0.4 ? 1 - t / 0.4 : (t - 0.4) / 0.6; eyes.forEach(e => { e.scale.y = Math.max(0.1, k); }); })
        .then(() => eyes.forEach(e => { e.scale.y = 1; }));
    },
    // blink now and then, so it is never a still picture
    live(tl) {
      let next = rnd(1.5, 3.5);
      return tl.every(dt => { next -= dt; if (next <= 0) { next = rnd(2.5, 5); s.blink(tl); } });
    },
  };
  s.setPull(0);
  return s;
}

// ---------- vaccine bottle ----------
// (0,0) is the middle of the cap's top edge: the spot the needle goes in. The bottle hangs down from it.
export function makeBottle(color, germKind) {
  const c = new Container(), liq = new Graphics();
  const glass = new Graphics().roundRect(-299, 149, 598, 466, 70).fill(COL.mint);
  const top = new Graphics().rect(-164, 115, 329, 40).fill(COL.mintDark).roundRect(-218, 0, 437, 119, 16).fill(COL.teal);
  const sheen = new Graphics().roundRect(-262, 210, 30, 150, 15).fill({ color: COL.white, alpha: 0.75 });
  const label = new Container();
  label.addChild(new Graphics().circle(0, 0, 118).fill(COL.cream));
  const mini = makeGerm(germKind); label.addChild(mini);
  label.position.set(0, 385);
  c.addChild(glass, liq, sheen, label, top);
  const b = {
    c, label, color, germKind, level: 1, upsideDown: false,
    setLevel(v) {
      b.level = Math.max(0, Math.min(1, v));
      liq.clear();
      const h = 422 * b.level;
      if (h > 4) liq.roundRect(-277, b.upsideDown ? 171 : 593 - h, 554, h, Math.min(52, h / 2)).fill(color);
    },
  };
  b.setLevel(1);
  return b;
}

// ---------- Yeti ----------
// (0,0) is the ground between its feet. Units: designer points.
// His face is in pieces (eye whites, pupils, brows, mouth) so it can show how he feels:
//   happy    the designer's big smile
//   nervous  a wobbly little mouth and worried brows
//   brr      the same, eyes squeezed shut (the cold wipe)
//   in/out   eyes gently closed, breathing in through a small smile and blowing out through an "o"
//   ouch     a small "o" for the pinch
//   calm     eyes open, a small steady smile (coping)
//   relief   eyes closed in a smile, the big grin back
const MOODS = {
  happy: { mouth: 'art', brows: 'art', eyes: 'open' },
  nervous: { mouth: 'wavy', brows: 'worried', eyes: 'open' },
  brr: { mouth: 'wavy', brows: 'worried', eyes: 'tight' },
  in: { mouth: 'smile', brows: 'art', eyes: 'soft' },
  out: { mouth: 'o', brows: 'art', eyes: 'soft' },
  ouch: { mouth: 'small-o', brows: 'worried', eyes: 'open' },
  calm: { mouth: 'smile', brows: 'art', eyes: 'open' },
  relief: { mouth: 'art', brows: 'art', eyes: 'tight' },
};
export function makeYeti() {
  const y = M.yeti, ox = y.x + y.w / 2, oy = y.y + y.h;
  const c = new Container();
  const mouth = part('yeti_mouth', ox, oy), brows = part('yeti_brows', ox, oy);
  const eyeL = part('yeti_eye_l', ox, oy), eyeR = part('yeti_eye_r', ox, oy);
  const pupL = part('yeti_pupil_l', ox, oy), pupR = part('yeti_pupil_r', ox, oy);
  const pl0 = { x: pupL.x, y: pupL.y }, pr0 = { x: pupR.x, y: pupR.y };
  const mid = p => ({ x: M[p].x + M[p].w / 2 - ox, y: M[p].y + M[p].h / 2 - oy });
  const eL = mid('yeti_eye_l'), eR = mid('yeti_eye_r'), mo = mid('yeti_mouth');
  const drawn = new Graphics(), lids = new Graphics();          // the hand-drawn mouths and brows, and closed eyes
  c.addChild(part('yeti', ox, oy), mouth, brows, eyeL, eyeR, pupL, pupR, drawn, lids);
  const arm = M._points.yeti_arm;
  const INK = { width: 30, color: COL.ink, cap: 'round' }, LIP = { color: COL.white, cap: 'round', join: 'round' };
  const lid = (p, soft) => (soft
    ? lids.moveTo(p.x - 62, p.y - 6).quadraticCurveTo(p.x, p.y + 46, p.x + 62, p.y - 6).stroke(INK)        // gently closed
    : lids.moveTo(p.x - 62, p.y + 10).quadraticCurveTo(p.x, p.y - 62, p.x + 62, p.y + 10).stroke(INK));    // closed in a smile, or squeezed
  const yeti = {
    c, arm: { x: arm[0] - ox, y: arm[1] - oy }, tummy: { x: 0, y: -1480 }, nose: { x: 20, y: -2600 }, h: y.h, mood: 'happy',
    eyes(left, right, soft) {
      lids.clear();
      eyeL.visible = pupL.visible = left; eyeR.visible = pupR.visible = right;
      if (!left) lid(eL, soft); if (!right) lid(eR, soft);
    },
    // where he is looking: a small shift of both pupils, in his own units (about 30 is a clear glance)
    look(dx = 0, dy = 0) { pupL.position.set(pl0.x + dx, pl0.y + dy); pupR.position.set(pr0.x + dx, pr0.y + dy); },
    express(mood) {
      const m = MOODS[mood] || MOODS.happy;
      yeti.mood = mood;
      mouth.visible = m.mouth === 'art'; brows.visible = m.brows === 'art';
      drawn.clear();
      const x = mo.x, yy = mo.y + 30;
      if (m.mouth === 'wavy') drawn.moveTo(x - 130, yy).quadraticCurveTo(x - 65, yy - 46, x, yy).quadraticCurveTo(x + 65, yy + 46, x + 130, yy).stroke({ ...LIP, width: 46 });
      if (m.mouth === 'smile') drawn.moveTo(x - 120, yy - 22).quadraticCurveTo(x, yy + 62, x + 120, yy - 22).stroke({ ...LIP, width: 44 });
      if (m.mouth === 'o') drawn.ellipse(x, yy, 74, 86).fill(COL.white).ellipse(x, yy + 4, 38, 48).fill(0x4aa874);
      if (m.mouth === 'small-o') drawn.ellipse(x, yy, 50, 58).fill(COL.white).ellipse(x, yy + 3, 24, 30).fill(0x4aa874);
      if (m.brows === 'worried') {               // inner ends up
        drawn.moveTo(eL.x - 96, eL.y - 152).lineTo(eL.x + 56, eL.y - 204).stroke(INK);
        drawn.moveTo(eR.x + 96, eR.y - 152).lineTo(eR.x - 56, eR.y - 204).stroke(INK);
      }
      const open = m.eyes === 'open';
      yeti.eyes(open, open, m.eyes === 'soft');
    },
    async wink(tl) { yeti.eyes(true, false); await tl.wait(0.55); yeti.express(yeti.mood); },
    async blink(tl) { if (MOODS[yeti.mood].eyes !== 'open') return; yeti.eyes(false, false); await tl.wait(0.14); yeti.express(yeti.mood); },
    live(tl) {
      let next = rnd(2, 4);
      return tl.every(dt => { next -= dt; if (next <= 0) { next = rnd(3, 6); yeti.blink(tl); } });
    },
  };
  yeti.express('happy');
  return yeti;
}

// ---------- germs ----------
// Two kinds that differ in shape AND colour, about 150 across. Mischievous, never scary.
export const GERM = {
  spiky: { color: COL.coral, vaccine: COL.yellow },
  blob: { color: COL.purple, vaccine: COL.blue },
};
export function makeGerm(kind) {
  const c = new Container(), g = new Graphics();
  if (kind === 'spiky') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2, cx = Math.cos(a), cy = Math.sin(a);
      g.moveTo(cx * 44, cy * 44).lineTo(cx * 84, cy * 84).stroke({ width: 20, color: COL.coralDark, cap: 'round' });
      g.circle(cx * 88, cy * 88, 16).fill(COL.coralDark);
    }
    g.circle(0, 0, 64).fill(COL.coral);
    g.circle(30, 34, 9).fill(COL.coralDark).circle(44, 14, 5).fill(COL.coralDark);
    sheen(g, 0, 0, 47, Math.PI * 1.08, Math.PI * 1.36, { width: 9, color: COL.white, cap: 'round', alpha: 0.85 });
    g.ellipse(-20, -6, 8, 10).fill(COL.plum).ellipse(20, -6, 8, 10).fill(COL.plum);
    g.moveTo(-34, -27).lineTo(-13, -21).stroke({ width: 6, color: COL.plum, cap: 'round' });
    g.moveTo(34, -27).lineTo(13, -21).stroke({ width: 6, color: COL.plum, cap: 'round' });
    g.ellipse(-37, 14, 11, 7).fill({ color: COL.cheek, alpha: 0.9 }).ellipse(37, 14, 11, 7).fill({ color: COL.cheek, alpha: 0.9 });
    g.moveTo(-10, 18).quadraticCurveTo(2, 28, 13, 15).stroke({ width: 5.5, color: COL.plum, cap: 'round' });
  } else {
    g.circle(-26, 14, 50).fill(COL.purple).circle(28, 16, 46).fill(COL.purple).circle(2, -26, 46).fill(COL.purple);
    g.circle(-54, 54, 15).fill(COL.purple).circle(0, 62, 15).fill(COL.purple).circle(54, 54, 15).fill(COL.purple);
    g.circle(-48, 26, 9).fill(COL.purpleLight).circle(46, 34, 11).fill(COL.purpleLight).circle(30, -52, 7).fill(COL.purpleLight);
    sheen(g, 2, -26, 32, Math.PI * 1.1, Math.PI * 1.4, { width: 8, color: COL.white, cap: 'round', alpha: 0.8 });
    g.ellipse(-18, -8, 13, 15).fill(COL.white).ellipse(20, -8, 13, 15).fill(COL.white);
    g.circle(-15, -5, 6.5).fill(COL.plum).circle(23, -5, 6.5).fill(COL.plum);
    g.ellipse(-38, 16, 10, 6).fill({ color: COL.cheek, alpha: 0.9 }).ellipse(40, 16, 10, 6).fill({ color: COL.cheek, alpha: 0.9 });
    g.moveTo(-10, 20).quadraticCurveTo(1, 30, 12, 20).stroke({ width: 5.5, color: COL.plum, cap: 'round' });
    g.ellipse(2, 29, 6, 7).fill(COL.pinkLight);
  }
  c.addChild(g);
  c.kind = kind;
  return c;
}

// The picture the vaccine carries: a card showing which germ to look out for.
export function makeCard(kind) {
  const c = new Container();
  c.addChild(new Graphics().roundRect(-62, -70, 124, 146, 22).fill({ color: COL.plum, alpha: 0.12 }));
  c.addChild(new Graphics().roundRect(-62, -76, 124, 146, 22).fill(COL.cream));
  c.addChild(new Graphics().roundRect(-20, -90, 40, 26, 10).fill(COL.teal));
  const g = makeGerm(kind); g.scale.set(0.52); g.y = 2; c.addChild(g);
  c.kind = kind;
  return c;
}
// A drop of vaccine, pointing up.
export function makeDrop(color, r = 26) {
  return new Graphics().moveTo(0, -r * 1.7).bezierCurveTo(r * 0.4, -r * 0.9, r, -r * 0.3, r, r * 0.25)
    .arc(0, r * 0.25, r, 0, Math.PI).bezierCurveTo(-r, -r * 0.3, -r * 0.4, -r * 0.9, 0, -r * 1.7).fill(color)
    .ellipse(-r * 0.35, r * 0.1, r * 0.18, r * 0.3).fill({ color: COL.white, alpha: 0.6 });
}

// ---------- guard cells (the body's helpers) ----------
// A white puffball about 170 across. Asleep until the vaccine shows it what to look for.
export function makeGuard() {
  const c = new Container(), body = new Container(), face = new Container();
  const puffShape = (g, dy, color) => {
    g.circle(0, dy, 66).fill(color);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.3; g.circle(Math.cos(a) * 56, Math.sin(a) * 56 + dy, 30).fill(color); }
  };
  const g = new Graphics();
  puffShape(g, 9, 0xe6c3d6); puffShape(g, 0, COL.white);
  body.addChild(g);
  const open = new Graphics().ellipse(-24, -8, 9, 12).fill(COL.plum).ellipse(24, -8, 9, 12).fill(COL.plum)
    .circle(-27, -12, 3).fill(COL.white).circle(21, -12, 3).fill(COL.white);
  const shut = new Graphics();
  for (const x of [-24, 24]) shut.moveTo(x - 11, -8).quadraticCurveTo(x, 4, x + 11, -8).stroke({ width: 6, color: COL.plum, cap: 'round' });
  const cheeks = new Graphics().ellipse(-44, 14, 12, 8).fill(COL.cheek).ellipse(44, 14, 12, 8).fill(COL.cheek);
  const smile = new Graphics().moveTo(-11, 14).quadraticCurveTo(0, 26, 11, 14).stroke({ width: 6, color: COL.plum, cap: 'round' });
  const oh = new Graphics().ellipse(0, 19, 7, 8).fill(COL.plum);
  const snore = new Graphics().circle(0, 0, 20).fill({ color: COL.mint, alpha: 0.95 }).circle(-6, -6, 5).fill({ color: COL.white, alpha: 0.9 });
  snore.position.set(40, 26);
  face.addChild(cheeks, open, shut, smile, oh, snore);
  const badges = new Container();
  body.addChild(face, badges);
  c.addChild(body);
  const guard = {
    c, body, face, knows: [], asleep: true, busy: false, home: { x: 0, y: 0 }, phase: rnd(0, 6),
    look(mode) {   // 'sleep' | 'happy' | 'hm'
      guard.asleep = mode === 'sleep';
      open.visible = !guard.asleep; shut.visible = guard.asleep; snore.visible = guard.asleep;
      smile.visible = mode !== 'hm'; oh.visible = mode === 'hm';
    },
    idle(dt, time) {   // breathing; the snore bubble swells while asleep
      const k = Math.sin(time * (guard.asleep ? 1.6 : 2.6) + guard.phase);
      face.y = k * 2;
      if (!guard.busy) body.scale.set(1 + k * 0.025, 1 - k * 0.025);
      if (guard.asleep) snore.scale.set(0.7 + (k + 1) * 0.28);
    },
    addBadge(tl, kind) {
      guard.knows.push(kind);
      const b = new Container();
      b.addChild(new Graphics().circle(0, 0, 30).fill(COL.cream));
      const m = makeGerm(kind); m.scale.set(0.27); b.addChild(m);
      b.position.set(guard.knows.length === 1 ? 50 : -50, 52); b.scale.set(0);
      badges.addChild(b);
      return tl.tween(b, { s: 1 }, 0.3, E.outBack);
    },
  };
  guard.look('sleep');
  return guard;
}

// ---------- round buttons ----------
const ICON = {
  play(g, r) { g.poly([-0.26 * r, -0.4 * r, 0.44 * r, 0, -0.26 * r, 0.4 * r]).fill(COL.white).stroke({ width: 0.14 * r, color: COL.white, join: 'round' }); },
  puzzle(g, r, color) {
    g.roundRect(-0.42 * r, -0.26 * r, 0.64 * r, 0.64 * r, 0.1 * r).fill(COL.white);
    g.circle(0.3 * r, 0.06 * r, 0.16 * r).fill(COL.white).circle(-0.1 * r, -0.34 * r, 0.16 * r).fill(COL.white);
    g.circle(-0.42 * r, 0.06 * r, 0.13 * r).fill(color);
  },
  game(g, r, color) {
    g.roundRect(-0.07 * r, -0.26 * r, 0.14 * r, 0.44 * r, 0.07 * r).fill(COL.white);
    g.circle(0, -0.32 * r, 0.2 * r).fill(COL.white);
    g.roundRect(-0.46 * r, 0.1 * r, 0.92 * r, 0.34 * r, 0.14 * r).fill(COL.white);
    g.circle(0.26 * r, 0.27 * r, 0.07 * r).fill(color);
  },
  home(g, r) {
    g.poly([-0.46 * r, 0.02 * r, 0, -0.42 * r, 0.46 * r, 0.02 * r]).fill(COL.white).stroke({ width: 0.1 * r, color: COL.white, join: 'round' });
    g.roundRect(-0.3 * r, -0.02 * r, 0.6 * r, 0.42 * r, 0.06 * r).fill(COL.white);
  },
};
export function makeButton(tl, { icon, color, dark, r = 90, onTap }) {
  const c = new Container(), top = new Container();
  c.addChild(new Graphics().circle(0, r * 0.12, r).fill(dark));
  const g = new Graphics().circle(0, 0, r).fill(color);
  sheen(g, 0, 0, r * 0.78, Math.PI * 1.1, Math.PI * 1.38, { width: r * 0.09, color: COL.white, cap: 'round', alpha: 0.55 });
  ICON[icon](g, r, color);
  top.addChild(g); c.addChild(top);
  c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, Math.max(r * 1.15, 64));
  const up = () => { tl.stop(top); tl.tween(top, { y: 0 }, 0.25, E.outBack); };
  c.on('pointerdown', () => { tl.stop(top); top.y = r * 0.09; sfx.tap(); });
  c.on('pointerup', up); c.on('pointerupoutside', up);
  c.on('pointertap', () => { sfx.pop(1.1); onTap && onTap(); });
  c.top = top;
  return c;
}
// the gentle "this one next" breathing on a button
export function breathe(tl, obj, amt = 0.06, speed = 3.2) {
  const base = obj.scale.x;
  return tl.every((dt, time) => { if (!obj.destroyed) obj.scale.set(base * (1 + Math.sin(time * speed) * amt)); });
}
