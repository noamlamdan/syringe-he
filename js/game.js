// Germ Guard: the kid practises giving Yeti a shot, then goes inside to fight the germs.
// The shot follows what really happens, with the calming steps a child can use themselves:
//   cap off, bottle on, pull to fill  ->  close-up on Yeti  ->  pick something for Yeti to look at  ->
//   the cold, funny-smelling wipe  ->  one big slow breath (it spins a pinwheel)  ->  the quick poke while Yeti
//   looks away  ->  push, counted "one, two, three, done"  ->  pick a bandaid  ->  "it was over so fast!"
// Inside, the vaccine shows the sleepy white cells a picture of the germ; then the kid drags or flings the
// cells into the germs, wave after wave, ending with a boss germ. Annie narrates what is going on.
// Round 2 brings a germ the cells have never seen: they bounce off it, Yeti sneezes, and the kid picks
// which bottle teaches them. Nothing is ever wrong: the other bottle just earns more bonks and a sneeze.
import {
  Container, Graphics, Circle, COL, E, stage, defineScreen, go, drag, endDrag, invite, punch, shake,
  sfx, puff, sparkle, confetti, mark, rnd, pick, loadClips, playClip,
} from './engine.js';
import { M, makeSyringe, makeBottle, makeYeti, makeGerm, makeCard, makeDrop, makeGuard, GERM } from './art.js';
import { homeButton } from './screens.js';
import { LINES } from './lines.js';
import { track } from './track.js';

const DEG = Math.PI / 180;
const hyp = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
loadClips(Object.fromEntries(Object.keys(LINES).map(k => [k, `media/v_${k}.mp3`])));

defineScreen('game', ({ view, tl, opts }) => {
  const { W, H, cx, cy } = stage;
  const st = { round: opts.round || 1, known: [...(opts.known || [])] };
  track('game');
  const S = 0.17 * Math.max(0.82, Math.min(1, W / 1600));   // stage units per designer point, while filling the syringe
  const k = S / 0.2;
  const BS = S * 1.45;      // bottles are drawn a little bigger than life so the label reads
  const FILL_ROT = -45 * DEG, POKE_ROT = -31 * DEG;
  // The shot itself is a close-up: Yeti fills the left of the frame (just his face and arm) and the syringe is small.
  const q = Math.max(0.74, Math.min(1, W / 1700));
  const YC = 0.42 * q, SC = 0.14 * q;                      // Yeti's and the syringe's size in the close-up
  const FACE = { x: 15, y: -2764 }, MOUTH = { x: 31, y: -2464 };   // on Yeti, measured from the ground between his feet
  const F = { x: W * 0.3, y: H * 0.35 };                   // where the middle of his face sits in the close-up
  const closeAt = m => ({ x: F.x - FACE.x * YC * m, y: F.y - FACE.y * YC * m });   // Yeti's spot for a given swell (breathing)
  let SS = S, YS = S;                                      // the syringe's and Yeti's size right now

  const world = view.addChild(new Container());
  const inside = view.addChild(new Container());
  const maskG = view.addChild(new Graphics());
  inside.mask = maskG; inside.visible = false;
  inside.pivot.set(cx, cy); inside.position.set(cx, cy);
  const ui = view.addChild(new Container());
  homeButton(tl, ui);
  let down = null;     // while the kid is working something, a touch anywhere drives it

  // ---------- Annie: says a line and shows its words ----------
  const cap = document.getElementById('cap');
  let voice = null, sayId = 0;
  function say(key) {
    const [words, dur] = LINES[key], id = ++sayId;
    if (voice) voice.stop(); voice = null;
    cap.textContent = words; cap.classList.add('on');
    playClip(key).then(h => { if (id === sayId && !tl.dead) voice = h; else h.stop(); });
    tl.wait(dur + 0.7).then(() => { if (id === sayId) cap.classList.remove('on'); });
    return dur;
  }

  // ---------- outside: Yeti, the syringe, the bottles ----------
  const yetiY = H + 34 * k;
  const L = {
    fill: { x: cx - 70, y: cy + 10 }, yetiMid: { x: cx - 120, y: yetiY },
    one: [{ x: Math.min(cx + 520, W - 130), y: cy + 100 }],
    two: [{ x: Math.min(cx + 640, W - 110) - 220, y: cy + 120 }, { x: Math.min(cx + 640, W - 110), y: cy + 120 }],
    germ: [{ x: 210, y: 250 }, { x: cx + 40, y: 130 }],
  };

  const yeti = makeYeti();
  yeti.c.scale.set(S);
  const glow = new Graphics();
  const bottleLayer = new Container();
  const syr = makeSyringe({ cap: true });
  const germLayer = new Container();
  world.addChild(yeti.c, glow, bottleLayer, syr.rig, germLayer);
  yeti.live(tl); syr.live(tl);
  yeti.c.eventMode = 'static';
  yeti.c.on('pointertap', () => { if (!down) { sfx.giggle(); hop(yeti.c, 30 * k); } });

  const pose = { rot: FILL_ROT, flip: false };
  const dirOf = (rot, flip) => (flip ? { x: -Math.cos(rot), y: -Math.sin(rot) } : { x: Math.cos(rot), y: Math.sin(rot) });
  const dir = () => dirOf(pose.rot, pose.flip);
  function setPose(rot, flip) { pose.rot = rot; pose.flip = flip; syr.rig.rotation = rot; syr.rig.scale.set(flip ? -SS : SS, SS); syr.faceUp(rot, flip); }
  const along = u => { const d = dir(); return { x: syr.rig.x + d.x * u * SS, y: syr.rig.y + d.y * u * SS }; };   // a spot u points along the syringe
  const tipAt = () => along(syr.tipX);
  const thumbAt = () => along(syr.thumbX - syr.pull);
  const rigFor = (tip, rot, flip, sc = SS) => { const d = dirOf(rot, flip); return { x: tip.x - d.x * syr.tipX * sc, y: tip.y - d.y * syr.tipX * sc }; };
  const yetiPt = p => ({ x: yeti.c.x + p.x * YS, y: yeti.c.y + p.y * YS });

  // A hop remembers where the thing stood, so hops that pile up (quick taps) cannot walk it off its spot.
  const standing = new WeakMap();
  async function hop(obj, h = 44, dur = 0.34) {
    const was = standing.get(obj), y0 = was ? was.y : obj.y, mine = { y: y0 };
    standing.set(obj, mine);
    await tl.run(dur, t => { if (standing.get(obj) === mine) obj.y = y0 - Math.sin(t * Math.PI) * h; });
    if (standing.get(obj) !== mine) return;      // a newer hop has taken over
    standing.delete(obj);
    obj.y = y0;
    punch(tl, obj, 0.06, 0.26);
  }
  // glide, turn, resize and (if needed) flip the syringe to a new pose
  function moveSyringe(to, rot, flip, dur = 0.65, sc = SS) {
    const p0 = { x: syr.rig.x, y: syr.rig.y }, r0 = pose.rot, f0 = pose.flip ? -1 : 1, f1 = flip ? -1 : 1, s0 = SS;
    return tl.run(dur, t => {
      const e = E.inOut(t), r = r0 + (rot - r0) * e, sz = s0 + (sc - s0) * e;
      let f = f0 + (f1 - f0) * e; if (Math.abs(f) < 0.08) f = f < 0 ? -0.08 : 0.08;
      syr.rig.position.set(p0.x + (to.x - p0.x) * e, p0.y + (to.y - p0.y) * e - Math.sin(t * Math.PI) * 50);
      syr.rig.rotation = r; syr.rig.scale.set(f * sz, sz); syr.faceUp(r, f < 0);
      if (t >= 1) { SS = sc; setPose(rot, flip); syr.rig.position.set(to.x, to.y); }
    });
  }
  const hot = (p, r) => { const c = new Container(); c.position.set(p.x, p.y); c.hitArea = new Circle(0, 0, r); c.eventMode = 'static'; c.cursor = 'pointer'; ui.addChild(c); return c; };
  const tapped = c => new Promise(res => c.once('pointertap', () => res(c)));
  // A finger wobbles: a touch that moves less than this (in stage units) is a plain touch, not a drag.
  const TAP = 48;
  // "Touch and it goes where it is needed", the same as sending a white cell at a germ: a plain touch makes the
  // thing fly to its place by itself. It can be carried there by hand too. Used for the wipe and the bandaid.
  function carry(obj, target, reach, onArrive, choose) {
    let going = false;
    const send = async it => {
      if (going) return; going = true;
      down = null; endDrag();
      const p0 = { x: it.x, y: it.y }, lift = Math.min(130, hyp(p0, target) * 0.35);
      sfx.whoosh(true);
      await tl.run(0.42, t => { const u = E.inOut(t); it.position.set(p0.x + (target.x - p0.x) * u, p0.y + (target.y - p0.y) * u - Math.sin(u * Math.PI) * lift); });
      onArrive(it);
    };
    down = (pos, e) => {
      if (e.target && e.target.isUi) return false;
      const it = choose ? choose(pos) : obj, p0 = { x: it.x, y: it.y };
      let far = 0;
      sfx.lift();
      drag(e, {
        move: p => { if (going) return; far = Math.max(far, hyp(p, pos)); it.position.set(p0.x + p.x - pos.x, p0.y + p.y - pos.y); if (hyp(it, target) < reach) { going = true; onArrive(it); } },
        end: () => { if (far < TAP) send(it); },
      });
      return true;
    };
  }

  // the germs that hang about outside, pulling faces
  const outGerms = [];
  function addOutGerm(kind, from) {
    const c = makeGerm(kind), g = { c, kind, home: { ...L.germ[outGerms.length % 2] }, ph: rnd(0, 6), free: false };
    c.scale.set(0.85); c.position.set(from.x, from.y);
    c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, 105);
    c.on('pointertap', () => { if (down) return; sfx.raspberry(); punch(tl, c, 0.2, 0.4); });
    germLayer.addChild(c); outGerms.push(g);
    return g;
  }
  let lookItem = null;
  const seen = { pad: null, pads: [] };      // what a test can touch (tools/render_phone.mjs puts a finger on it)
  tl.every((dt, time) => {
    for (const g of outGerms) if (g.free) {
      g.c.position.set(g.home.x + Math.sin(time * 0.9 + g.ph) * 26, g.home.y + Math.sin(time * 1.5 + g.ph) * 16);
      g.c.rotation = Math.sin(time * 1.2 + g.ph) * 0.14;
    }
    if (lookItem && lookItem.rest) lookItem.y = lookItem.rest.y + Math.sin(time * 2.1) * 9;
  });

  // --- step: take the cap off
  async function capOff() {
    const at = along(syr.capX), h = invite(tl, ui, at.x, at.y, 82), z = hot(at, 125);
    await tapped(z);
    z.destroy(); h.stop();
    const capPart = syr.parts.cap, x0 = capPart.x;
    await tl.tween(capPart, { x: x0 - 70 }, 0.14, E.out);                // a little tug back first
    sfx.pop(1.2); puff(tipAt(), COL.mint, 6, 14);
    await tl.tween(capPart, { x: x0 + 1500, alpha: 0 }, 0.4, E.out);
    capPart.visible = false; capPart.x = x0; capPart.alpha = 1;
  }

  // --- step: bottles land; touch one and it goes onto the needle
  async function chooseBottle(kinds) {
    const spots = kinds.length === 1 ? L.one : L.two;
    const bottles = kinds.map((kind, i) => {
      const b = makeBottle(GERM[kind].vaccine, kind);
      b.c.scale.set(BS); b.c.position.set(spots[i].x, -260);
      bottleLayer.addChild(b.c);
      return b;
    });
    await Promise.all(bottles.map((b, i) => tl.wait(i * 0.16).then(() => tl.tween(b.c, { y: spots[i].y }, 0.42, E.in))
      .then(() => { sfx.clunk(1.1 + i * 0.2); return punch(tl, b.c, 0.12, 0.3); })));
    const mid = b => ({ x: b.c.x, y: b.c.y + 330 * BS });
    const hints = bottles.map(b => invite(tl, ui, mid(b).x, mid(b).y, 88));
    const zones = bottles.map(b => hot(mid(b), 120));
    const z = await Promise.race(zones.map(tapped));
    const b = bottles[zones.indexOf(z)];
    zones.forEach(o => o.destroy()); hints.forEach(o => o.stop());
    bottles.filter(o => o !== b).forEach(o => tl.tween(o.c, { y: H + 300, rotation: 0.6 }, 0.5, E.in).then(() => o.c.destroy({ children: true })));
    // squash, then up and over onto the needle, upside down
    sfx.lift();
    await tl.tween(b.c, { sy: BS * 0.86 }, 0.12, E.out);
    b.c.scale.set(BS);
    const p0 = { x: b.c.x, y: b.c.y }, p1 = along(syr.tipX - 210), r1 = pose.rot - Math.PI / 2;
    await tl.run(0.5, t => {
      const e = E.inOut(t);
      b.c.position.set(p0.x + (p1.x - p0.x) * e, p0.y + (p1.y - p0.y) * e - Math.sin(t * Math.PI) * 140);
      b.c.rotation = r1 * e;
      if (t > 0.5 && !b.upsideDown) { b.upsideDown = true; b.setLevel(b.level); }
    });
    sfx.clunk(0.9); punch(tl, b.c, 0.1, 0.3);
    return b;
  }

  // --- step: the plunger. Pull to fill, push to empty; a finger anywhere drives it along the syringe.
  function plunger(goal, onChange) {
    return new Promise(res => {
      let idle = 1.2, demo = false, held = false, last = syr.pull, over = false, stepping = false;
      const h = invite(tl, ui, 0, 0, 84);
      const reached = () => (goal === 'full' ? syr.pull >= syr.DMAX * 0.97 : syr.pull <= syr.DMAX * 0.03);
      const set = d => {
        syr.setPull(d); onChange(syr.pull);
        if (Math.abs(syr.pull - last) > 65) { last = syr.pull; sfx.slurp(syr.pull / syr.DMAX); }
      };
      const finish = () => {
        if (over) return; over = true;
        down = null; endDrag(); off(); h.stop();
        set(goal === 'full' ? syr.DMAX : 0);
        res();
      };
      // nobody touching? the syringe shows the move itself, slowly, then waits again
      const nudge = async () => {
        const p = syr.pull, to = goal === 'full' ? Math.min(p + 190, syr.DMAX * 0.9) : Math.max(p - 190, syr.DMAX * 0.1);
        await tl.run(0.6, t => { if (!held && !stepping) set(p + (to - p) * E.inOut(t)); });
        await tl.run(0.6, t => { if (!held && !stepping) set(to + (p - to) * E.inOut(t)); });
      };
      // a plain touch moves it a third of the way by itself: three touches and it is done (one... two... three!)
      const step = async () => {
        if (over || stepping) return; stepping = true; idle = 0;
        const p = syr.pull, third = syr.DMAX / 3 + 2, to = goal === 'full' ? Math.min(syr.DMAX, p + third) : Math.max(0, p - third);
        await tl.run(0.36, t => { if (!over) set(p + (to - p) * E.inOut(t)); });
        stepping = false; idle = 0;
        if (!over && reached()) finish();
      };
      const off = tl.every(dt => {
        const p = thumbAt(); h.g.position.set(p.x, p.y);
        if (held || demo || stepping) return;
        idle += dt;
        if (idle > 3.4) { demo = true; nudge().then(() => { demo = false; idle = 0; }); }
      });
      down = (pos, e) => {
        if (e.target && e.target.isUi) return false;
        if (stepping) return true;
        held = true; idle = 0;
        const d0 = syr.pull, a = dir();
        let far = 0;
        drag(e, {
          move: p => { far = Math.max(far, hyp(p, pos)); if (far < TAP * 0.5) return; set(d0 - ((p.x - pos.x) * a.x + (p.y - pos.y) * a.y) / SS); if (reached()) finish(); },
          end: () => { held = false; idle = 0; if (far < TAP) step(); },
        });
        return true;
      };
    });
  }

  async function pullPhase(b) {
    syr.wet = true; syr.color = b.color;
    await plunger('full', d => b.setLevel(1 - d / syr.DMAX));
    sfx.plink(3);
    punch(tl, syr.rig, 0.06, 0.3);
    await tl.wait(0.35);
    // the empty bottle pops off and tumbles away
    sfx.pop(0.9);
    const d = dir(), p0 = { x: b.c.x, y: b.c.y }, r0 = b.c.rotation;
    await tl.run(0.7, t => { b.c.position.set(p0.x + d.x * 260 * t + 120 * t, p0.y + d.y * 260 * t + 900 * t * t); b.c.rotation = r0 + t * 2.4; });
    b.c.destroy({ children: true });
  }

  // ---------- the close-up: Yeti's turn ----------
  let shots = 0;
  // the spot on Yeti's arm for this shot (the second shot goes a little higher up), in his own units and on screen
  const spotLocal = () => ({ x: yeti.arm.x - shots * 30, y: yeti.arm.y - shots * 170 });
  const armAt = () => yetiPt(spotLocal());

  // Yeti comes in close; the syringe waits out of sight so the first things he meets are the calm ones
  async function toCloseUp() {
    moveSyringe({ x: W + 560, y: H * 0.28 }, FILL_ROT, false, 0.6);
    YS = YC; yeti.c.scale.set(YC); yeti.c.rotation = 0;
    const at = closeAt(1);
    yeti.c.position.set(-(M.yeti.w / 2) * YC - 160, at.y);
    outGerms.forEach((g, i) => { g.home = { x: W * 0.62 + i * 190, y: 118 }; });
    sfx.whoosh(true);
    await tl.tween(yeti.c, { x: at.x }, 0.7, E.outCubic);
    tl.tween(yeti.c, { rotation: -0.022 }, 0.5, E.inOut);        // a little unsure: he leans back a touch,
    yeti.express('nervous'); yeti.look(28, 8);                   // with a wobbly mouth, worried brows and a sideways glance
    if (lookItem) tl.tween(lookItem, { alpha: 1 }, 0.3);
  }

  // --- step: a choice. What would Yeti like to look at? (Looking at something else really does help.)
  const lookSpot = { x: Math.max(110, F.x - 440 * q), y: H * 0.27 };
  function makeLook(kind) {
    const c = new Container(), g = new Graphics();
    if (kind === 'toy') {                       // a star plush
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 34 : 70; pts.push(Math.cos(a) * r, Math.sin(a) * r); }
      g.poly(pts).fill(COL.yellow).stroke({ width: 18, color: COL.yellow, join: 'round' });
      g.ellipse(-16, -2, 6, 8).fill(COL.plum).ellipse(16, -2, 6, 8).fill(COL.plum);
      g.ellipse(-30, 14, 9, 6).fill(COL.cheek).ellipse(30, 14, 9, 6).fill(COL.cheek);
      g.moveTo(-9, 14).quadraticCurveTo(0, 23, 9, 14).stroke({ width: 5, color: COL.plum, cap: 'round' });
    } else if (kind === 'bubbles') {
      for (const [x, y, r] of [[-28, 18, 44], [36, -22, 34], [30, 44, 20], [-34, -44, 16]]) {
        g.circle(x, y, r).fill({ color: COL.mint, alpha: 0.9 }).circle(x, y, r).stroke({ width: 5, color: COL.white, alpha: 0.9 });
        g.moveTo(x - r * 0.55, y - r * 0.2).quadraticCurveTo(x - r * 0.45, y - r * 0.55, x - r * 0.1, y - r * 0.6).stroke({ width: Math.max(4, r * 0.14), color: COL.white, cap: 'round' });
      }
    } else {                                    // a little friend
      const f = makeYeti(); f.c.children[0].tint = 0xffdcc6; f.c.scale.set(0.042); f.c.y = 86;
      c.addChild(f.c);
    }
    c.addChildAt(g, 0);
    return c;
  }
  async function lookChoice() {
    if (lookItem) { yeti.look(-34, -10); return; }   // already chosen on the first shot: he looks at it again
    say('look');
    const kinds = ['toy', 'bubbles', 'friend'], xs = [0.56, 0.72, 0.88].map(f => W * f), y = H * 0.46;
    const items = kinds.map((kind, i) => {
      const c = new Container();
      c.addChild(new Graphics().circle(0, 9, 108).fill({ color: COL.plum, alpha: 0.12 }).circle(0, 0, 108).fill(COL.cream), makeLook(kind));
      c.position.set(xs[i], y); c.scale.set(0);
      world.addChild(c);
      tl.wait(0.15 + i * 0.13).then(() => { sfx.pop(1 + i * 0.15); return tl.tween(c, { s: 1 }, 0.3, E.outBack); });
      return c;
    });
    await tl.wait(0.7);
    const hints = xs.map(x => invite(tl, ui, x, y, 116)), zones = xs.map(x => hot({ x, y }, 128));
    const i = zones.indexOf(await Promise.race(zones.map(tapped)));
    zones.forEach(o => o.destroy()); hints.forEach(o => o.stop());
    items.forEach((c, j) => { if (j !== i) tl.tween(c, { s: 0 }, 0.2, E.in).then(() => c.destroy({ children: true })); });
    sfx.plink(2);
    lookItem = items[i];
    await tl.tween(lookItem, { x: lookSpot.x, y: lookSpot.y, s: 0.82 }, 0.55, E.inOut);
    lookItem.rest = { ...lookSpot };
    yeti.look(-34, -10);                        // he looks at it
    punch(tl, lookItem, 0.1, 0.3).then(() => lookItem.scale.set(0.82));
    await tl.wait(0.3);
  }

  // --- step: the wipe. Cold, and it smells funny, and then the spot is clean. Drag the wipe to his arm (or touch).
  async function swabPhase() {
    say('swab');
    const a = armAt(), sp = spotLocal();
    const pad = new Container();
    pad.addChild(new Graphics().roundRect(-74, -62, 148, 136, 28).fill({ color: COL.plum, alpha: 0.12 }).roundRect(-74, -72, 148, 136, 28).fill(COL.white)
      .roundRect(-52, -50, 104, 92, 18).fill(0xd3ecfb).moveTo(-34, -30).quadraticCurveTo(-10, -44, 16, -32).stroke({ width: 9, color: COL.white, cap: 'round' }));
    pad.position.set(Math.min(W - 170, a.x + 340 * q), a.y - 70 * q); pad.rotation = -0.2; pad.scale.set(0);
    world.addChild(pad); seen.pad = pad;
    sfx.pop(1.2);
    await tl.tween(pad, { s: 1 }, 0.35, E.outBack);
    const h = invite(tl, ui, pad.x, pad.y, 120), off = tl.every(() => h.g.position.set(pad.x, pad.y));
    await new Promise(res => {
      let over = false;
      carry(pad, a, 120, async () => {
        if (over) return; over = true;
        down = null; endDrag(); h.stop(); off();
        await tl.tween(pad, { x: a.x, y: a.y, rotation: 0 }, 0.2, E.inOut);
        // brr! three little dabs; Yeti shivers and scrunches up at the smell, then it is done
        yeti.express('brr'); sfx.eep();
        const y0 = closeAt(1);
        tl.run(1.1, t => { yeti.c.x = y0.x + Math.sin(t * 60) * 7 * (1 - t); });
        for (let i = 0; i < 3; i++) {
          sfx.drip();
          sparkle({ x: a.x + rnd(-30, 30), y: a.y + rnd(-30, 30) }, [0xd3ecfb, COL.white], 4, 70);
          await tl.tween(pad, { x: a.x + (i % 2 ? -22 : 22) * q, y: a.y - 26 * q }, 0.11, E.out);
          await tl.tween(pad, { x: a.x, y: a.y }, 0.11, E.in);
        }
        // the smell: a few wiggly wisps drift up
        for (let i = 0; i < 3; i++) {
          const w = world.addChild(new Graphics().moveTo(0, 0).bezierCurveTo(16, -18, -16, -36, 0, -54).stroke({ width: 8, color: COL.mintDark, cap: 'round', alpha: 0.9 }));
          w.position.set(a.x + (i - 1) * 46, a.y - 60);
          tl.tween(w, { y: w.y - 130, alpha: 0 }, 1.1, E.out).then(() => w.destroy());
        }
        await tl.wait(0.7);
        // the clean spot: this is where the shot will go
        const clean = new Graphics().circle(0, 0, 120).fill({ color: 0xd3ecfb, alpha: 0.95 }).circle(0, 0, 120).stroke({ width: 16, color: COL.mintDark, alpha: 0.8 });
        clean.position.set(sp.x, sp.y); clean.scale.set(0);
        yeti.c.addChild(clean); yeti.clean = clean;
        tl.tween(clean, { s: 1 }, 0.3, E.outBack);
        sfx.plink(3); sparkle(a, [COL.white, 0xd3ecfb, COL.yellow], 7, 110);
        tl.tween(pad, { x: W + 200, y: a.y - 200, rotation: 1 }, 0.5, E.in).then(() => pad.destroy({ children: true }));
        yeti.express('nervous');
        await tl.wait(Math.max(0.6, LINES.swab[1] - 5));
        res();
      });
    });
  }

  // --- step: one big slow breath. Hold to breathe in, let go to blow: the pinwheel spins. (A touch does it all.)
  function makePinwheel() {
    const c = new Container(), wheel = new Container();
    c.addChild(new Graphics().roundRect(-8, 0, 16, 230, 8).fill(COL.plum));
    [COL.pink, COL.yellow, COL.teal, COL.pinkLight].forEach((col, i) => {
      const b = new Graphics().poly([0, 0, 0, -96, 70, -70]).fill(col).stroke({ width: 8, color: col, join: 'round' });
      b.rotation = i * Math.PI / 2; wheel.addChild(b);
    });
    wheel.addChild(new Graphics().circle(0, 0, 16).fill(COL.white));
    c.addChild(wheel); c.wheel = wheel;
    return c;
  }
  let pinAt = null;      // where the pinwheel is (for filming)
  function breathPhase() {
    return new Promise(res => {
      say('breathe');
      const pw = makePinwheel(), at = { x: F.x + 590 * q, y: F.y + 30 * q };
      pinAt = at;
      pw.position.set(at.x, at.y); pw.scale.set(0);
      world.addChild(pw);
      tl.tween(pw, { s: 1.15 * q }, 0.35, E.outBack);
      const h = invite(tl, ui, F.x, F.y + 40 * q, 170);
      let f = 0, spin = 0.6, phase = 'wait', held = false, auto = false, idle = 0, over = false, puffT = 0;
      const swell = v => { const m = 1 + 0.045 * E.inOut(v), p = closeAt(m); yeti.c.scale.set(YC * m); yeti.c.position.set(p.x, p.y); };
      let air = null;      // the sound of the breath, to breathe along with
      const begin = () => { if (phase !== 'wait') return; phase = 'in'; h.stop(); air = sfx.breathIn(1.5); yeti.express('in'); };
      const done = async () => {
        if (over) return; over = true;
        down = null; endDrag();
        swell(0);
        sfx.plink(4); sparkle(at, [COL.white, COL.yellow, COL.pinkLight], 8, 130);
        yeti.express('relief');                                  // aaah
        tl.tween(yeti.c, { rotation: 0 }, 0.5, E.outBack);      // shoulders drop: he feels better
        await tl.wait(1.1);
        yeti.express('calm'); yeti.look(-34, -10);
        off();
        tl.tween(pw, { s: 0 }, 0.25, E.in).then(() => pw.destroy({ children: true }));
        res();
      };
      const off = tl.every(dt => {
        pw.wheel.rotation += spin * dt; spin = Math.max(0.6, spin * Math.exp(-dt * 0.9));
        if (over) return;
        if (phase === 'wait') { idle += dt; if (idle > 5.5) { auto = true; begin(); } }     // nobody touching: Yeti shows how
        else if (phase === 'in') {
          f = Math.min(1, f + dt / 1.5); swell(f);
          if (!held && !auto) { if (f >= 0.45) phase = 'out'; else auto = true; }          // let go early: finish the breath in for them
          if (f >= 1 && (auto || !held)) phase = 'out';
          if (phase === 'out') { if (air) air.stop(); air = sfx.breathOut(Math.max(0.9, f * 1.5)); yeti.express('out'); }
        } else {
          f = Math.max(0, f - dt / 1.5); swell(f); spin = Math.min(22, spin + dt * 26);
          if ((puffT -= dt) <= 0) {                                                        // his breath, on its way to the pinwheel
            puffT = 0.09;
            const m = yetiPt(MOUTH), d = world.addChild(new Graphics().circle(0, 0, rnd(12, 20)).fill({ color: COL.white, alpha: 0.8 }));
            d.position.set(m.x + 40, m.y + rnd(-12, 12));
            tl.tween(d, { x: at.x - 20, y: at.y + rnd(-30, 30), alpha: 0 }, 0.5, E.out).then(() => d.destroy());
          }
          if (f <= 0) done();
        }
      });
      down = (pos, e) => {
        if (e.target && e.target.isUi) return false;
        if (phase !== 'out' && !over) { held = true; auto = false; begin(); drag(e, { move() {}, end() { held = false; } }); }
        return true;
      };
    });
  }

  // --- step: the syringe comes over, the quick poke while Yeti looks at his thing, then push to a count of three
  async function approach() {
    const d = dirOf(POKE_ROT, true), a = armAt();
    sfx.whoosh(true);
    yeti.express('nervous'); yeti.look(30, 10);
    await moveSyringe(rigFor({ x: a.x - d.x * 150 * q, y: a.y - d.y * 150 * q }, POKE_ROT, true, SC), POKE_ROT, true, 0.85, SC);
  }
  function pokePhase() {
    return new Promise(res => {
      const a = armAt(), h = invite(tl, ui, a.x, a.y, 74);
      let over = false;
      const finish = async () => {
        if (over) return; over = true;
        down = null; endDrag(); h.stop();
        const d = dir(), from = tipAt(), back = { x: a.x - d.x * 110 * q, y: a.y - d.y * 110 * q }, into = { x: a.x + d.x * 12 * q, y: a.y + d.y * 12 * q };
        const tipTo = (p, o, t) => { const r = rigFor({ x: p.x + (o.x - p.x) * t, y: p.y + (o.y - p.y) * t }, pose.rot, pose.flip); syr.rig.position.set(r.x, r.y); };
        // Yeti turns to his thing instead of watching the needle
        tl.tween(yeti.c, { rotation: -0.03 }, 0.3, E.out);
        yeti.express('calm'); yeti.look(-34, -10);
        if (lookItem) punch(tl, lookItem, 0.14, 0.4).then(() => lookItem.scale.set(0.82));
        await tl.run(0.3, t => tipTo(from, back, E.out(t)));          // line up
        await tl.wait(0.25);
        await tl.run(0.09, t => tipTo(back, into, t));                  // the quick poke
        say('pinch');
        sfx.pop(1.5);
        yeti.express('ouch');
        await tl.wait(0.5);
        yeti.express('calm');
        res();
      };
      down = (pos, e) => {
        if (e.target && e.target.isUi) return false;
        const r0 = { x: syr.rig.x, y: syr.rig.y }, t0 = tipAt();
        let far = 0;
        drag(e, {
          move: p => {
            far = Math.max(far, hyp(p, pos));
            const tx = Math.max(40, Math.min(W - 40, t0.x + p.x - pos.x)), ty = Math.max(40, Math.min(H - 40, t0.y + p.y - pos.y));
            syr.rig.position.set(r0.x + tx - t0.x, r0.y + ty - t0.y);
            if (hyp(tipAt(), a) < 90) finish();
          },
          end: () => { if (far < TAP) finish(); },     // a plain touch sends it in by itself
        });
        return true;
      };
    });
  }
  async function pushPhase(b) {
    const a = armAt();
    // three dots fill as the plunger goes in, while Annie counts: it really is that quick
    const dots = [0, 1, 2].map(i => { const g = world.addChild(new Graphics()); g.position.set(a.x + (1 - i) * 62 * q, Math.min(H - 60, a.y + 118 * q)); return g; });
    const draw = n => dots.forEach((g, i) => g.clear().circle(0, 0, 20 * q).fill(i < n ? COL.pink : COL.white).circle(0, 0, 20 * q).stroke({ width: 5, color: COL.pink }));
    let n = 0, started = 0;
    draw(0);
    await plunger('empty', d => {
      const f = 1 - d / syr.DMAX;
      glow.clear().circle(a.x, a.y, (40 + f * 80) * q).fill({ color: b.color, alpha: 0.4 });
      if (f > 0.04 && !started) { started = tl.time; say('count'); }
      while (n < 3 && f >= (n + 1) / 3 - 0.02) { n++; draw(n); sfx.plink(n + 1); punch(tl, dots[n - 1], 0.3, 0.3); }
    });
    if (!started) { started = tl.time; say('count'); }
    draw(3);
    syr.wet = false; syr.setPull(0);
    tl.tween(glow, { alpha: 0 }, 0.5).then(() => { glow.clear(); glow.alpha = 1; });
    const d = dir(), t0 = tipAt();
    await tl.run(0.3, t => { const r = rigFor({ x: t0.x - d.x * 300 * q * E.out(t), y: t0.y - d.y * 300 * q * E.out(t) }, pose.rot, pose.flip); syr.rig.position.set(r.x, r.y); });
    tl.tween(yeti.c, { rotation: 0 }, 0.4, E.outBack);
    yeti.express('relief');                                                     // all done: phew
    await tl.wait(Math.max(0.2, LINES.count[1] - (tl.time - started)));       // let "all done!" finish
    yeti.express('happy'); yeti.look(0, 0);
    dots.forEach(g => tl.tween(g, { s: 0 }, 0.2, E.in).then(() => g.destroy()));
  }

  // --- step: a choice of bandaid. Drag one onto the clean spot (a plain touch does it too).
  const BANDAIDS = [
    g => g.roundRect(-120, -48, 240, 96, 48).fill(COL.pinkLight).roundRect(-42, -34, 84, 68, 16).fill(COL.cream)
      .circle(-84, -14, 6).fill(COL.pinkDark).circle(-84, 14, 6).fill(COL.pinkDark).circle(84, -14, 6).fill(COL.pinkDark).circle(84, 14, 6).fill(COL.pinkDark),
    g => { g.roundRect(-120, -48, 240, 96, 48).fill(COL.purpleLight).roundRect(-42, -34, 84, 68, 16).fill(COL.cream);      // purple, not yellow: the page behind is yellow
      for (const x of [-82, 82]) g.moveTo(x, -20).quadraticCurveTo(x, 0, x + 20, 0).quadraticCurveTo(x, 0, x, 20).quadraticCurveTo(x, 0, x - 20, 0).quadraticCurveTo(x, 0, x, -20).fill(COL.yellow); },
    g => g.roundRect(-120, -48, 240, 96, 48).fill(COL.blue).roundRect(-42, -34, 84, 68, 16).fill(COL.white)
      .circle(-92, -16, 8).fill(COL.white).circle(-72, 14, 8).fill(COL.white).circle(72, -14, 8).fill(COL.white).circle(92, 16, 8).fill(COL.white),
  ];
  async function bandaidPhase() {
    say('bandaid');
    const sp = spotLocal(), to = armAt(), BIG = 0.8 * q;
    const y = Math.min(H - 92, to.y + 100 * q);
    const pads = BANDAIDS.map((drawIt, i) => {
      const c = new Container(), g = new Graphics(); drawIt(g); c.addChild(g);
      c.position.set(Math.min(W - 130, to.x + (165 + i * 222) * q), y); c.rotation = -0.18 + i * 0.16; c.scale.set(0);
      world.addChild(c);
      tl.wait(i * 0.12).then(() => { sfx.pop(1.1 + i * 0.15); return tl.tween(c, { s: BIG }, 0.32, E.outBack); });
      return c;
    });
    await tl.wait(0.7);
    seen.pads = pads;
    const hints = pads.map(c => { const h = invite(tl, ui, c.x, c.y, 118 * q); return h; });
    await new Promise(res => {
      let over = false, mine = null;
      const takeOne = it => { if (mine) return; mine = it; hints.forEach(h => h.stop()); world.addChild(it); pads.filter(o => o !== it).forEach(o => tl.tween(o, { s: 0 }, 0.2, E.in).then(() => o.destroy({ children: true }))); };
      carry(null, to, 120, async it => {
        if (over) return; over = true;
        takeOne(it);
        down = null; endDrag();
        await tl.tween(it, { x: to.x, y: to.y, s: YC, rotation: 0.5 }, 0.22, E.inOut);
        sfx.clunk(1.4); sparkle(to, [COL.white, COL.pinkLight, COL.yellow], 7, 110);
        world.removeChild(it);                       // from here on it rides on Yeti's arm
        it.position.set(sp.x, sp.y); it.scale.set(1);
        yeti.c.addChild(it);
        if (yeti.clean) { yeti.clean.destroy(); yeti.clean = null; }
        res();
      }, pos => { const it = mine || pads.slice().sort((p1, p2) => hyp(p1, pos) - hyp(p2, pos))[0]; takeOne(it); return it; });
    });
    shots++;
  }
  // --- and the best bit: saying what went well, so that is what is remembered
  async function proud() {
    const dur = say('proud');
    sfx.giggle(); sfx.chime();
    sparkle(yetiPt(FACE), [COL.white, COL.yellow, COL.pinkLight], 10, 300 * q);
    yeti.wink(tl);
    if (lookItem) hop(lookItem, 30, 0.3);
    await hop(yeti.c, 40 * q);
    await tl.wait(Math.max(0.6, dur - 0.2));
  }

  async function vaccinate(kinds) {
    // Yeti steps out and the syringe comes to the middle, big, to be filled
    yeti.express('happy'); yeti.look(0, 0);
    tl.tween(yeti.c, { x: -(M.yeti.w / 2) * YS - 180 }, 0.6, E.inOut);
    if (lookItem) tl.tween(lookItem, { alpha: 0 }, 0.3);
    outGerms.forEach((g, i) => { g.home = { ...L.germ[i % 2] }; });
    sfx.whoosh(false);
    await moveSyringe(L.fill, FILL_ROT, false, 0.7, S);
    // st.step names the step in progress (tests wait on it)
    st.step = 'cap'; if (syr.parts.cap.visible) await capOff();
    if (kinds.length > 1) say('pick_bottle');
    st.step = 'bottle'; const b = await chooseBottle(kinds);
    st.step = 'pull'; await pullPhase(b);
    st.step = 'closeup'; await toCloseUp();
    st.step = 'look'; await lookChoice();
    st.step = 'swab'; await swabPhase();
    st.step = 'breath'; await breathPhase();
    st.step = 'approach'; await approach();
    st.step = 'poke'; await pokePhase();
    st.step = 'push'; await pushPhase(b);
    st.step = 'bandaid'; await bandaidPhase();
    st.step = 'proud'; await proud();
    st.step = 'shot-done';
    track('shot');
    return b;
  }

  // ---------- the way in and out: a round window that opens from one spot ----------
  const R = Math.hypot(W, H) + 80;
  const iris = (p, r) => maskG.clear().circle(p.x, p.y, Math.max(r, 0.5)).fill(0xffffff);
  async function goInside(p) {
    buildInside();
    iris(p, 0.5); inside.visible = true;
    sfx.whoosh(true);
    await tl.run(0.8, t => iris(p, E.inOut(t) * R));
    world.visible = false;
  }
  async function goOutside(p) {
    world.visible = true;
    sfx.whoosh(false);
    await tl.run(0.7, t => iris(p, (1 - E.inOut(t)) * R));
    inside.visible = false;
    clearInside();
  }

  // ---------- inside Yeti ----------
  let guards = [], germs = [], cells = [], carriers = [], guardLayer = null, germIn = null, cardLayer = null;
  const bounds = { x0: 110, x1: W - 110, y0: 240, y1: H - 120 };
  function clearInside() {
    inside.removeChildren().forEach(c => c.destroy({ children: true }));
    guards = []; germs = []; cells = []; carriers = [];
  }
  function buildInside() {
    clearInside();
    inside.addChild(new Graphics().rect(-700, -700, W + 1400, H + 1400).fill(COL.inside));
    for (let i = 0; i < 9; i++) {
      const r = rnd(46, 105), g = new Graphics().circle(0, 0, r).fill(COL.insideCell).circle(0, 0, r * 0.52).fill({ color: COL.insideCellDark, alpha: 0.55 });
      g.position.set(rnd(0, W), rnd(0, H));
      inside.addChild(g); cells.push({ g, vx: rnd(-14, 14), vy: rnd(-9, 9), r });
    }
    // the needle, seen from inside
    inside.addChild(new Graphics().roundRect(cx - 46, -70, 92, 96, 22).fill(COL.teal)
      .poly([cx - 9, 0, cx + 9, 0, cx + 9, 118, cx - 9, 142]).fill(COL.plum));
    guardLayer = inside.addChild(new Container());
    germIn = inside.addChild(new Container());
    cardLayer = inside.addChild(new Container());
    const homes = [{ x: cx - 400, y: cy + 150 }, { x: cx, y: cy + 215 }, { x: cx + 400, y: cy + 150 }];
    homes.forEach(hm => {
      const g = makeGuard();
      g.home = hm; g.c.position.set(hm.x, hm.y);
      st.known.forEach(kd => { g.addBadge(tl, kd); });
      g.look(st.known.length ? 'happy' : 'sleep');
      g.c.eventMode = 'static'; g.c.cursor = 'pointer'; g.c.hitArea = new Circle(0, 0, 112);
      g.c.on('pointertap', () => g.onTap && g.onTap());
      g.c.on('pointerdown', e => g.onGrab && g.onGrab(e));
      guardLayer.addChild(g.c); guards.push(g);
    });
  }
  let hs = null;                                              // the fight in progress, if any (see hunt)
  const gb = { x0: 85, x1: W - 85, y0: 175, y1: H - 95 };     // where the white cells may roam
  tl.every((dt, time) => {
    if (!inside.visible) return;
    for (const c of cells) {
      c.g.x += c.vx * dt; c.g.y += c.vy * dt;
      if (c.g.x < -c.r) c.g.x = W + c.r; if (c.g.x > W + c.r) c.g.x = -c.r;
      if (c.g.y < -c.r) c.g.y = H + c.r; if (c.g.y > H + c.r) c.g.y = -c.r;
    }
    for (const g of guards) g.idle(dt, time);
    for (const m of germs) {
      if (m.held) continue;
      m.scared = false;
      if (hs && m.flee && m.came && !m.froze) {   // a germ that sees a white cell coming scoots away (never faster than a finger)
        let near = null, nd = m.flee;
        for (const g of guards) { const d = hyp(g.c, m.c); if (d < nd) { nd = d; near = g; } }
        if (near) { m.vx += (m.c.x - near.c.x) / (nd || 1) * 620 * dt; m.vy += (m.c.y - near.c.y) / (nd || 1) * 620 * dt; m.scared = true; }
        const sp = Math.hypot(m.vx, m.vy) || 1, top = near ? m.max : m.cruise;
        if (sp > top) { const f = Math.max(top / sp, 1 - dt * 2.5); m.vx *= f; m.vy *= f; }
      }
      m.c.x += m.vx * dt; m.c.y += m.vy * dt;
      if (m.c.x < bounds.x0 && m.vx < 0) m.vx = Math.abs(m.vx); if (m.c.x > bounds.x1 && m.vx > 0) m.vx = -Math.abs(m.vx);
      if (m.c.y < bounds.y0 && m.vy < 0) m.vy = Math.abs(m.vy); if (m.c.y > bounds.y1 && m.vy > 0) m.vy = -Math.abs(m.vy);
      // once a germ has come in it stays in: nowhere to hide from a white cell
      if (!m.came) m.came = m.c.x > bounds.x0 && m.c.x < bounds.x1 && m.c.y > bounds.y0 - 60 && m.c.y < bounds.y1 + 60;
      else { m.c.x = Math.max(bounds.x0 - 15, Math.min(bounds.x1 + 15, m.c.x)); m.c.y = Math.max(bounds.y0 - 15, Math.min(bounds.y1 + 15, m.c.y)); }
      m.c.rotation = Math.sin(time * (m.scared ? 8 : 2.2) + m.ph) * (m.boss ? 0.07 : 0.2);
      const w = Math.sin(time * (m.scared ? 11 : 3.1) + m.ph) * (m.scared ? 0.09 : 0.05); m.c.scale.set(m.s * (1 + w), m.s * (1 - w));
    }
    if (hs) for (const g of guards) { if (!hs) break; hs.step(g, dt); }      // a fight can end part-way through a frame
    for (const c of carriers) if (!c.taken && c.rest) c.c.y = c.rest.y + Math.sin(time * 2 + c.ph) * 10;
  });
  const wiggle = obj => tl.run(0.4, t => { obj.rotation = Math.sin(t * 19) * 0.16 * (1 - t); });

  // The vaccine comes down the needle as three drops, each carrying a picture of the germ.
  // Touch a guard (or a picture) and the guard studies it and earns that germ's badge.
  function train(kind) {
    return new Promise(res => {
      const color = GERM[kind].vaccine;
      let left = 3, n = 0;
      st.step = 'train';
      const rests = [cx - 300, cx, cx + 300].map((x, i) => ({ x, y: cy - 150 + (i === 1 ? 50 : 0) }));
      const news = !guards[0].knows.includes(kind);
      tl.wait(0.5).then(() => say(news ? 'in_body' : 'in_know'));
      const hints = new Map();
      rests.forEach((rest, i) => {
        const c = new Container(), card = makeCard(kind);
        const drop = makeDrop(color, 74); drop.y = 22;
        card.scale.set(0.74); card.y = 26;
        c.addChild(drop, card);
        c.position.set(cx, 150); c.scale.set(0);
        cardLayer.addChild(c);
        const car = { c, rest: null, taken: false, ph: rnd(0, 6) };
        carriers.push(car);
        c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, 105);
        c.on('pointertap', () => { const g = nearest(guards.filter(q => !q.busy && !q.fed), c); if (g) give(g, car); });
        tl.wait(0.25 + i * 0.4).then(() => { sfx.drip(); return tl.tween(c, { s: 1, y: 215 }, 0.3, E.outBack); })
          .then(() => tl.tween(c, { x: rest.x, y: rest.y }, 0.7, E.inOut)).then(() => { car.rest = rest; });
      });
      tl.wait(1.9).then(() => guards.forEach(g => { if (!g.fed) hints.set(g, invite(tl, guardLayer, g.home.x, g.home.y, 100)); }));
      const nearest = (list, c) => list.slice().sort((p, q) => hyp(p.c, c) - hyp(q.c, c))[0];
      async function give(g, car) {
        car = car || nearest(carriers.filter(q => !q.taken && q.rest), g.c);
        if (!car || car.taken || !car.rest || g.busy || g.fed) { sfx.giggle(); wiggle(g.body); return; }
        g.busy = true; g.fed = true; car.taken = true;
        if (hints.has(g)) hints.get(g).stop();
        if (g.asleep) {                       // wake up: a big yawn and a stretch
          sfx.yawn();
          g.look('happy');
          await tl.run(0.45, t => { const s = Math.sin(t * Math.PI) * 0.22; g.body.scale.set(1 - s * 0.5, 1 + s); });
        }
        const c = car.c;
        await tl.tween(c, { x: g.c.x + 118, y: g.c.y - 46, s: 0.9 }, 0.45, E.inOut);
        if (g.knows.includes(kind)) {         // "I know this one already": two nods, the picture pops
          for (let i = 0; i < 2; i++) { await tl.tween(g.face, { y: 12 }, 0.1, E.out); await tl.tween(g.face, { y: 0 }, 0.1, E.out); }
          sfx.plink(1); puff(c, color, 7, 16);
          c.destroy({ children: true });
        } else {                               // study it: lean in, think, then the badge
          await tl.tween(g.body, { rotation: 0.2 }, 0.25, E.out);
          await tl.wait(0.5);
          sparkle({ x: g.c.x, y: g.c.y - 30 }, [COL.white, COL.yellow, color], 7, 100);
          tl.tween(g.body, { rotation: 0 }, 0.25, E.outBack);
          await tl.tween(c, { x: g.c.x + 50, y: g.c.y + 52, s: 0 }, 0.25, E.in);
          c.destroy({ children: true });
          sfx.plink(2 + n++);
          await g.addBadge(tl, kind);
          hop(g.c, 34, 0.3);
        }
        g.busy = false;
        if (--left === 0) {
          if (news) await tl.wait(say('in_power') + 0.2);      // "now the white cells have superpowers"
          if (!st.known.includes(kind)) st.known.push(kind);
          carriers = [];
          guards.forEach(q => { q.onTap = null; q.fed = false; });
          await tl.wait(0.5);
          res();
        }
      }
      guards.forEach(g => { g.fed = false; g.onTap = () => give(g); });
    });
  }

  // The fight. The kid grabs a white cell and drags or flings it into the germs; touching a germ sends the
  // nearest cell dashing at it. A cell that knows the germ gobbles it; one that does not bounces off with a
  // puzzled look. Germs the cells know come in waves and end with a big boss germ that takes three bumps.
  // Resolves 'won' when everything is eaten, 'sneeze' after three puzzled bounces. No clock, no losing.
  function hunt(kind, waves, boss) {
    return new Promise(res => {
      st.step = 'fight';
      const known = guards[0].knows.includes(kind);
      let wave = -1, caught = 0, bumps = 0, over = false, idle = 0, left = 0, touched = false;
      const hints = [];
      const toward = (a, b) => { const d = hyp(a, b) || 1; return { x: (a.x - b.x) / d, y: (a.y - b.y) / d, d }; };
      const dropHints = () => { hints.forEach(h => h.stop()); hints.length = 0; };

      const finish = async what => {
        if (over) return; over = true;
        stopIdle(); endDrag(); dropHints();
        hs = null;
        guards.forEach(g => { g.drag = null; g.onGrab = null; g.vx = g.vy = 0; g.body.rotation = 0; g.body.scale.set(1); g.look('happy'); });
        await tl.wait(what === 'won' ? 0.4 : 0.9);                      // the held breath
        await Promise.all(guards.map(g => tl.tween(g.c, { x: g.home.x, y: g.home.y }, 0.5, E.outBack)));
        guards.forEach(g => { g.busy = false; });
        if (what === 'won') {
          say('in_win');
          sfx.chime();
          guards.forEach((g, i) => tl.wait(i * 0.09).then(() => hop(g.c, 50, 0.32)));
          await tl.wait(1.1);
        }
        res(what);
      };

      const spawn = (i, n) => {
        const fast = wave > 0, c = makeGerm(kind), side = i % 2 ? W + 120 : -120;
        const m = {
          c, kind, s: 0.95, r: 62, held: false, ph: rnd(0, 6), vx: (side < 0 ? 1 : -1) * rnd(75, 105), vy: rnd(-50, 50),
          flee: known ? (fast ? 300 : 235) : 0, max: fast ? 220 : 165, cruise: fast ? 110 : 88,
        };
        c.position.set(side, bounds.y0 + (bounds.y1 - bounds.y0) * (i + 0.5) / n);
        c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, 108);
        c.on('pointertap', () => { idle = 0; sendNearest(m); });
        germIn.addChild(c); germs.push(m);
      };
      const spawnBoss = () => {
        const c = makeGerm(kind);
        c.addChild(new Graphics().poly([-44, -58, -44, -104, -22, -82, 0, -112, 22, -82, 44, -104, 44, -58]).fill(COL.yellow)
          .stroke({ width: 7, color: COL.yellow, join: 'round' }).circle(0, -70, 7).fill(COL.pink));
        const m = { c, kind, boss: true, hp: 3, s: 2.3, r: 62 * 2.3, held: true, ph: rnd(0, 6), vx: pick([-55, 55]), vy: 40, flee: 0 };
        c.scale.set(m.s); c.position.set(cx, -260);
        c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, 108);
        c.on('pointertap', () => { idle = 0; sendNearest(m); });
        germIn.addChild(c); germs.push(m);
        sfx.rumble(); shake(7, 0.35); say('in_boss');
        tl.tween(c, { y: bounds.y0 + 130 }, 0.9, E.outBack).then(() => { m.held = false; sfx.raspberry(); });
      };
      const nextWave = async () => {
        wave++;
        if (wave < waves.length) {
          if (wave > 0) { await tl.wait(0.7); if (over) return; }
          sfx.giggle();
          const n = left = waves[wave];
          for (let i = 0; i < n; i++) tl.wait(0.15 + i * 0.4).then(() => { if (!over) spawn(i, n); });
        } else if (boss && known) { await tl.wait(0.9); if (!over) spawnBoss(); }
        else finish('won');
      };

      // a touched germ freezes with fright and the cell homes in on it, so a touch always lands
      const dash = (g, m) => { g.target = m; g.chase = 0; m.froze = true; m.vx *= 0.2; m.vy *= 0.2; sfx.eep(); sfx.whoosh(true); };
      const letGo = g => { const m = g.target; g.target = null; if (m && germs.includes(m)) { m.froze = false; m.vx = rnd(-90, 90); m.vy = rnd(-90, 90); } };
      const sendNearest = m => {
        if (over || m.held || !m.came) return;       // not while it is still drifting in from the edge
        const free = guards.filter(g => !g.drag && !g.asleep && !g.target);
        if (free.length) dash(free.sort((p, q) => hyp(p.c, m.c) - hyp(q.c, m.c))[0], m);
      };
      const bounce = (g, m, speed) => {
        if (g.drag) { endDrag(); g.drag = null; }
        const n = toward(g.c, m.c), v = Math.max(Math.hypot(g.vx, g.vy) * 0.6, speed);
        g.vx = n.x * v; g.vy = n.y * v; g.target = null; m.froze = false;
        sfx.boing();
      };
      const touch = (g, m) => {
        if (!known) {                               // never met this germ: bonk, a puzzled look, and it blows a raspberry
          if (g.cool > 0) return;
          g.cool = 0.8; bounce(g, m, 460);
          g.look('hm'); g.hmT = 1.1;
          tl.wait(0.3).then(() => sfx.hm());
          tl.wait(0.75).then(() => sfx.raspberry());
          if (++bumps >= 3) finish('sneeze');
        } else if (m.boss) {                        // the boss: each bump knocks it down a size
          if (g.cool > 0) return;
          g.cool = 0.5; bounce(g, m, 640);
          m.hp--;
          sfx.clunk(0.7); sfx.pop(0.6 + (3 - m.hp) * 0.18); shake(8, 0.22);
          sparkle(m.c, [GERM[kind].color, COL.white, COL.yellow], 8, 90 * m.s);
          if (m.hp > 0) { const s0 = m.s, s1 = s0 - 0.5; tl.run(0.4, t => { m.s = s0 + (s1 - s0) * E.outBack(t); m.r = 62 * m.s; }); }
          else {
            germs.splice(germs.indexOf(m), 1);
            sparkle(m.c, [GERM[kind].color, COL.white, COL.yellow, COL.pinkLight], 14, 230);
            puff(m.c, GERM[kind].color, 10, 26); confetti(36);
            m.c.destroy({ children: true });
            finish('won');
          }
        } else {                                    // gulp
          germs.splice(germs.indexOf(m), 1);
          caught++; left--;
          sfx.pop(0.85 + Math.min(caught, 10) * 0.07); sfx.plink(caught % 8);
          sparkle(m.c, [GERM[kind].color, COL.white, COL.yellow], 8, 115);
          m.c.destroy({ children: true });
          g.gulp = 0.28;
          if (left === 0) nextWave();
        }
      };
      // one white cell, one frame: follow the finger or glide, bounce off the walls, and meet germs
      const step = (g, dt) => {
        g.cool -= dt;
        if (g.hmT > 0) { g.hmT -= dt; if (g.hmT <= 0) g.look('happy'); }
        if (g.drag) {
          const f = Math.min(1, dt * 16), nx = g.c.x + (g.drag.x - g.c.x) * f, ny = g.c.y + (g.drag.y - g.c.y) * f;
          g.vx = g.vx * 0.5 + (nx - g.c.x) / dt * 0.5; g.vy = g.vy * 0.5 + (ny - g.c.y) / dt * 0.5;
          g.c.position.set(nx, ny);
        } else {
          if (g.target) {
            g.chase += dt;
            if (!germs.includes(g.target)) g.target = null;
            else if (g.chase > 2.5) letGo(g);              // cannot get there: give up, the germ wanders on
            else { const n = toward(g.target.c, g.c), v = Math.max(Math.hypot(g.vx, g.vy), 820); g.vx = n.x * v; g.vy = n.y * v; }
          }
          g.c.x += g.vx * dt; g.c.y += g.vy * dt;
          const f = Math.exp(-dt * 1.5); g.vx *= f; g.vy *= f;
        }
        let wall = false;
        if (g.c.x < gb.x0) { g.c.x = gb.x0; if (g.vx < 0) { g.vx *= -0.7; wall = true; } }
        if (g.c.x > gb.x1) { g.c.x = gb.x1; if (g.vx > 0) { g.vx *= -0.7; wall = true; } }
        if (g.c.y < gb.y0) { g.c.y = gb.y0; if (g.vy < 0) { g.vy *= -0.7; wall = true; } }
        if (g.c.y > gb.y1) { g.c.y = gb.y1; if (g.vy > 0) { g.vy *= -0.7; wall = true; } }
        let sp = Math.hypot(g.vx, g.vy);
        if (sp > 1600) { g.vx *= 1600 / sp; g.vy *= 1600 / sp; sp = 1600; }
        if (wall && !g.drag && sp > 260) sfx.boing();
        g.body.rotation = g.hmT > 0 ? Math.sin(g.hmT * 12) * 0.2 : Math.max(-0.3, Math.min(0.3, g.vx / 2600));
        if (g.gulp > 0) { g.gulp -= dt; const t = 1 - Math.max(g.gulp, 0) / 0.28, q = Math.cos(t * 9) * (1 - t) * 0.24; g.body.scale.set(1 + q, 1 - q); }
        else { const st = Math.min(sp / 2600, 0.2); g.body.scale.set(1 + st, 1 - st * 0.6); }
        g.tr = (g.tr || 0) - dt;
        if (sp > 480 && g.tr <= 0) {                // a little trail when it is really moving
          g.tr = 0.05;
          const d = guardLayer.addChildAt(new Graphics().circle(0, 0, 30).fill({ color: COL.white, alpha: 0.6 }), 0);
          d.position.set(g.c.x, g.c.y);
          tl.tween(d, { s: 0.2, alpha: 0 }, 0.32, E.out).then(() => d.destroy());
        }
        for (const m of germs.slice()) if (!over && !m.held && hyp(g.c, m.c) < m.r + 60) touch(g, m);
      };

      guards.forEach(g => {
        g.busy = true; g.vx = g.vy = 0; g.cool = 0; g.hmT = 0; g.gulp = 0; g.drag = null; g.target = null; g.onTap = null;
        g.onGrab = e => {
          if (over || g.asleep) return;
          touched = true; idle = 0; dropHints();
          letGo(g);
          sfx.lift();
          const p0 = view.toLocal(e.global), ox = g.c.x - p0.x, oy = g.c.y - p0.y;
          g.drag = { x: g.c.x, y: g.c.y };
          drag(e, { move: q => { idle = 0; if (g.drag) { g.drag.x = q.x + ox; g.drag.y = q.y + oy; } }, end: () => { g.drag = null; } });
        };
      });
      hs = { step };
      say(known ? 'in_germs' : 'in_new');
      nextWave();
      // first fight: one cell shows how it is done, then rings invite the kid to grab one
      if (known && !st.shown) {
        st.shown = true;
        tl.wait(1.5).then(() => { if (!over && !touched && germs[0]) sendNearest(germs[0]); });
      }
      tl.wait(known ? 3.2 : 1.6).then(() => {
        if (over || touched) return;
        guards.forEach(g => { const h = invite(tl, guardLayer, g.c.x, g.c.y, 100); h.guard = g; hints.push(h); });
      });
      // if the kid just watches, a cell goes for a germ by itself now and then
      const stopIdle = tl.every(dt => {
        for (const h of hints) h.g.position.set(h.guard.c.x, h.guard.c.y);
        idle += dt;
        if (idle > 6 && !over) { idle = 0; const m = pick(germs.filter(q => !q.held)); if (m) sendNearest(m); }
      });
    });
  }

  async function sneezeInside() {
    for (const q of [1, 1.3]) { sfx.inhale(q); await tl.tween(inside, { s: 1 + 0.035 * q }, 0.32, E.out); await tl.wait(0.12); }
    await tl.wait(0.3);
    sfx.choo();
    germs.forEach(m => { m.vx = rnd(-240, 240); m.vy = rnd(-200, 200); });
    guards.forEach(g => tl.tween(g.c, { rotation: Math.PI * 2 }, 0.7, E.out).then(() => { g.c.rotation = 0; }));
    await tl.tween(inside, { s: 1 }, 0.5, E.spring);
    inside.scale.set(1);
    germs.forEach(m => { m.vx *= 0.3; m.vy *= 0.3; });
    await tl.wait(0.6);
  }
  async function sneezeOutside() {
    yeti.eyes(false, false);
    sfx.inhale(1);
    await tl.tween(yeti.c, { rotation: -0.06 }, 0.35, E.out);
    sfx.inhale(1.3);
    await tl.tween(yeti.c, { rotation: -0.11 }, 0.3, E.out);
    await tl.wait(0.3);
    sfx.choo();
    tl.tween(yeti.c, { rotation: 0.1 }, 0.1, E.in).then(() => tl.tween(yeti.c, { rotation: 0 }, 0.6, E.spring));
    const nose = yetiPt(yeti.nose);
    puff({ x: nose.x + 60 * k, y: nose.y + 40 * k }, COL.white, 12, 26);
    await tl.wait(0.8);
    yeti.eyes(true, true);
  }

  // ---------- the story ----------
  async function introOne() {
    yeti.c.position.set(L.yetiMid.x, L.yetiMid.y);
    setPose(FILL_ROT, false);
    syr.rig.position.set(W + 700, L.fill.y - 240);
    await tl.wait(0.5);
    sfx.giggle(); hop(yeti.c, 34 * k);
    await tl.wait(0.8);
    // a germ shows up and makes a nuisance of itself
    const g = addOutGerm('spiky', { x: W + 140, y: 120 });
    const head = yetiPt({ x: 900, y: -3300 });
    sfx.raspberry();
    await tl.tween(g.c, { x: head.x, y: head.y }, 0.9, E.inOut);
    const told = say('start'), from = tl.time;      // what the game is for, while the germ is being a pest
    yeti.eyes(false, false); sfx.eep();
    tl.tween(yeti.c, { rotation: -0.07 }, 0.25, E.out);
    await tl.run(1.0, t => { g.c.position.set(head.x + Math.sin(t * 9) * 60 * k, head.y + Math.cos(t * 9) * 36 * k - 36 * k); });
    await tl.tween(g.c, { x: g.home.x, y: g.home.y }, 0.7, E.inOut);
    g.free = true;
    yeti.eyes(true, true);
    tl.tween(yeti.c, { rotation: 0 }, 0.4, E.outBack);
    await tl.wait(Math.max(0.4, told + 0.3 - (tl.time - from)));      // let the line finish before the syringe arrives
  }
  async function cheer(last) {
    outGerms.forEach(g => { g.free = false; sfx.eep(); tl.tween(g.c, { x: W + 300, y: -200, s: 0.3 }, 0.6, E.in).then(() => g.c.destroy({ children: true })); });
    outGerms.length = 0;
    await tl.wait(0.4);
    sfx.fanfare(); confetti(last ? 70 : 40);
    for (let i = 0; i < (last ? 3 : 2); i++) { hop(syr.rig, 30, 0.3); await hop(yeti.c, 50 * k, 0.36); }
    await tl.wait(0.5);
  }
  async function introTwo() {
    // a germ nobody has met slips in while Yeti is celebrating
    const g = addOutGerm('blob', { x: W + 140, y: 200 });
    sfx.giggle();
    const tum = yetiPt(yeti.tummy);
    await tl.tween(g.c, { x: tum.x + 260 * k, y: tum.y - 220 * k }, 0.9, E.inOut);
    await tl.wait(0.35);
    sfx.raspberry();
    await tl.tween(g.c, { x: tum.x, y: tum.y, s: 0.15 }, 0.45, E.in);
    puff(tum, COL.purple, 7, 16); sfx.pop(0.7);
    outGerms.splice(outGerms.indexOf(g), 1); g.c.destroy({ children: true });
    yeti.blink(tl); punch(tl, yeti.c, 0.04, 0.3);
    await tl.wait(0.5);
    await goInside(tum);
    await hunt('blob', [3], false);        // the cells only know the first germ: bonk, shrug, then...
    await sneezeInside();
    await goOutside(yetiPt(yeti.nose));
    await sneezeOutside();
  }

  (async () => {
    if (st.round === 1) {
      await introOne();
      const b = await vaccinate(['spiky']);
      await goInside(armAt());
      await train(b.germKind);
      await hunt('spiky', [4, 6], true);
      track('fight');
      await goOutside(armAt());
      await cheer(false);
      st.round = 2;
      await introTwo();
    } else {                               // picking up round 2 (the phone was turned)
      YS = YC; yeti.c.scale.set(YC); yeti.c.position.set(closeAt(1).x, closeAt(1).y);
      syr.parts.cap.visible = false;
      setPose(FILL_ROT, false); syr.rig.position.set(L.fill.x, L.fill.y);
      await tl.wait(0.4);
    }
    for (;;) {
      const b = await vaccinate(['spiky', 'blob']);
      await goInside(armAt());
      await train(b.germKind);
      if (await hunt('blob', [4, 5], true) === 'won') break;
      await sneezeInside();
      await goOutside(yetiPt(yeti.nose));
      await sneezeOutside();
    }
    await goOutside(armAt());
    await cheer(true);
    mark('game');
    track('game_done');
    await tl.wait(1.2);
    go('plan');
  })();

  // test handle: what is on screen inside, and a way to touch it without a finger
  window.__game = {
    st, germs: () => germs.map(m => ({ x: Math.round(m.c.x), y: Math.round(m.c.y), held: m.held, boss: !!m.boss, hp: m.hp })),
    guards: () => guards.map(g => ({ knows: g.knows, asleep: g.asleep, busy: g.busy, x: Math.round(g.c.x), y: Math.round(g.c.y) })),
    tapGerm: i => germs[i] && germs[i].c.emit('pointertap', {}), tapGuard: i => guards[i] && guards[i].c.emit('pointertap', {}),
    inside: () => inside.visible,
    look: () => lookItem, yeti: () => ({ x: yeti.c.x, y: yeti.c.y, s: YS }),
    // where to point a camera (tools/sizzle.html)
    cam: () => ({ face: { x: yeti.c.x + FACE.x * yeti.c.scale.x, y: yeti.c.y + FACE.y * yeti.c.scale.y }, mouth: { x: yeti.c.x + MOUTH.x * yeti.c.scale.x, y: yeti.c.y + MOUTH.y * yeti.c.scale.y }, arm: armAt(), tip: tipAt(), thumb: thumbAt(), syr: { x: syr.rig.x, y: syr.rig.y }, look: lookItem ? { x: lookItem.x, y: lookItem.y } : null, pin: pinAt }),
    pad: () => (seen.pad && !seen.pad.destroyed ? { x: seen.pad.x, y: seen.pad.y } : null),
    pads: () => seen.pads.filter(c => !c.destroyed).map(c => ({ x: c.x, y: c.y })),
    pts: () => ({ cap: along(syr.capX), one: L.one.map(p => ({ x: p.x, y: p.y + 330 * BS })), two: L.two.map(p => ({ x: p.x, y: p.y + 330 * BS })), axis: dir(), arm: armAt() }),
  };

  return {
    onDown: (pos, e, onNothing) => (down ? down(pos, e) : false),
    destroy() { sayId++; if (voice) voice.stop(); cap.classList.remove('on'); },
    state: () => ({ round: st.round, known: st.round === 2 ? ['spiky'] : [] }),
  };
});
