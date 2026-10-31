// Home, the movie and the puzzle.
import {
  Container, Graphics, Sprite, Circle, COL, E, stage, app, defineScreen, go, toCss, drag, endDrag,
  sfx, puff, star, sparkle, confetti, punch, progress, mark, rnd, clock as testClock, loadClips, playClip, captions,
} from './engine.js';
import { M, makeSyringe, makeYeti, makeGerm, makeButton, breathe, partSprite, SYRINGE_PARTS, syringeOrigin } from './art.js';
import { LINES } from './lines.js';
import { track } from './track.js';

const TILT = -Math.PI / 4;      // the designer draws the syringe at 45 degrees, needle up and to the right
const BTN = {
  movie: { icon: 'play', color: COL.button, dark: COL.buttonDark },
  puzzle: { icon: 'puzzle', color: COL.teal, dark: COL.tealDark },
  game: { icon: 'game', color: COL.orange, dark: 0xcf6c0f },
  home: { icon: 'home', color: COL.plum, dark: 0x271629 },
};
const video = () => document.getElementById('movie');
const foot = () => document.getElementById('foot');
const voice = () => document.getElementById('say');
const caption = () => document.getElementById('cap');

// Whatever the browser does, the movie may only run while its own screen is showing.
for (const ev of ['playing', 'timeupdate']) video().addEventListener(ev, () => { const v = video(); if (!v.classList.contains('on') && !v.paused) v.pause(); });

// The grown-ups note: opened from the bottom of the home screen, closed with the cross or a touch outside it.
// One tip at a time. Swipe along it, touch it for the next one, or use the dots and arrows.
{
  const tips = document.getElementById('tips'), view = tips.querySelector('.view'), strip = tips.querySelector('.track');
  const dots = tips.querySelector('.dots'), prev = tips.querySelector('.prev'), next = tips.querySelector('.next');
  const n = strip.children.length;
  let i = 0;
  const show = (to, pull = 0) => {
    i = Math.max(0, Math.min(n - 1, to));
    strip.style.transition = pull ? 'none' : '';
    strip.style.transform = `translateX(calc(${i * 100}% + ${pull}px))`;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    prev.disabled = i === 0; next.disabled = i === n - 1;
  };
  for (let k = 0; k < n; k++) {
    const d = dots.appendChild(document.createElement('button'));
    d.type = 'button'; d.setAttribute('aria-label', `טיפ ${k + 1} מתוך ${n}`); d.appendChild(document.createElement('i'));
    d.addEventListener('click', () => show(k));
  }
  prev.addEventListener('click', () => show(i - 1));
  next.addEventListener('click', () => show(i + 1));
  // a finger along the card. On a phone held upright the whole page is drawn turned, so "along" is down the glass.
  let from = null, pull = 0;
  const along = e => (stage.turned ? e.clientY : e.clientX);
  view.addEventListener('pointerdown', e => { from = along(e); pull = 0; try { view.setPointerCapture(e.pointerId); } catch (err) { /* fine */ } });
  view.addEventListener('pointermove', e => {
    if (from === null) return;
    pull = along(e) - from;
    const edge = (i === 0 && pull < 0) || (i === n - 1 && pull > 0);
    show(i, (edge ? pull * 0.25 : pull) || 0.01);
  });
  const let_go = () => {
    if (from === null) return;
    from = null;
    show(Math.abs(pull) < 8 ? i + 1 : pull > 40 ? i + 1 : pull < -40 ? i - 1 : i);      // a plain touch turns to the next tip
  };
  view.addEventListener('pointerup', let_go);
  view.addEventListener('pointercancel', () => { from = null; show(i); });
  window.addEventListener('keydown', e => { if (tips.hidden) return; if (e.key === 'ArrowLeft') show(i + 1); else if (e.key === 'ArrowRight') show(i - 1); else if (e.key === 'Escape') tips.hidden = true; });
  document.getElementById('tipsOpen').addEventListener('click', () => { show(0); tips.hidden = false; track('tips'); });
  tips.addEventListener('click', e => { if (e.target === tips || e.target.closest('.x')) tips.hidden = true; });
}

// what Annie says about each of the three big buttons, the first time they appear
const SAY_BTN = { movie: 'בואו נראה איך מזרק עובד!', puzzle: 'בואו נרכיב את פאזל המזרק!', game: 'בואו נתרגל לתת זריקה!' };
loadClips({ movie: 'media/say_movie.mp3', puzzle: 'media/say_puzzle.mp3', game: 'media/say_game.mp3' });

const CLEAN = new URLSearchParams(location.search).has('clean');
export function homeButton(tl, parent) {
  const b = makeButton(tl, { ...BTN.home, r: 46, onTap: () => go('hub') });
  b.position.set(78, 78); b.isUi = true;
  if (CLEAN) b.visible = false;      // filming: no buttons in the picture
  parent.addChild(b);
  return b;
}

// The syringe doing its happy pump: pull back, push in, twice.
export async function pump(tl, syr, times = 2) {
  for (let i = 0; i < times; i++) {
    sfx.whoosh(true);
    await tl.run(0.26, t => syr.setPull(E.out(t) * 520));
    sfx.whoosh(false);
    await tl.run(0.2, t => syr.setPull((1 - E.in(t)) * 520));
    sfx.clunk(1.3);
  }
}

// ---------- home ----------
// First visit: the syringe, a few words for grown-ups about what this is, and one big play button (it starts the spoken intro). After the intro the three
// big buttons pop in one at a time while Annie says what each one does. Later visits just show the three.
defineScreen('hub', ({ view, tl, opts }) => {
  const { W, H, cx, cy } = stage;
  const first = !progress.intro && !progress.movie && !progress.puzzle && !progress.game;
  const syr = makeSyringe({ cap: true });
  const S = (first ? 520 : 540) / 3600;
  const at = { x: W * 0.23, y: H * 0.47 };
  syr.rig.scale.set(S); syr.rig.rotation = TILT; syr.faceUp(TILT, false);
  const mid = 177 * S;   // the middle of the whole syringe sits a little ahead of the barrel's middle
  // white sparkles round the syringe, as in the share picture: each twinkles in its own slow time (small and faint,
  // then bright and full with a little turn), never all together
  [[-250, -235, 38], [120, 150, 20], [215, 300, 34], [-290, 60, 18], [60, -290, 14], [-150, 290, 15], [255, -70, 12]].forEach(([x, y, r], i) => {
    const g = view.addChild(star(COL.white, r)), ph = i * 2.4, sp = 1.5 + (i % 3) * 0.35;
    g.position.set(Math.max(r + 16, at.x + x), at.y + y);
    tl.every((dt, time) => {
      const k = 0.5 + 0.5 * Math.sin(time * sp + ph), e = k * k * (3 - 2 * k);
      g.scale.set(0.4 + 0.75 * e); g.alpha = 0.45 + 0.55 * e; g.rotation = Math.sin(time * 0.7 + ph) * 0.3;
    });
  });
  view.addChild(syr.rig);
  syr.live(tl);
  // the syringe sways gently about its middle, like something floating, and drifts up and down a little
  tl.every((dt, time) => {
    const rot = TILT + Math.sin(time * 1.25) * 0.075 + Math.sin(time * 0.53 + 1) * 0.02, bob = Math.sin(time * 1.7) * 12;
    syr.rig.rotation = rot;
    syr.rig.position.set(at.x - Math.cos(rot) * mid, at.y - Math.sin(rot) * mid + bob);
  });

  if (testClock.manual) window.__hub = { syr, tl };      // for tests
  // poke the syringe and it shows off
  let busy = false;
  syr.rig.eventMode = 'static'; syr.rig.cursor = 'pointer';
  syr.rig.on('pointertap', async () => { if (busy) return; busy = true; await pump(tl, syr, 1); busy = false; });

  const cap = caption();
  let talking = null;
  const add = (kind, x, y, r, to = kind) => {
    const b = makeButton(tl, { ...BTN[kind], r, onTap: () => go(to) });
    b.position.set(x, y); b.scale.set(0);
    view.addChild(b);
    return b;
  };
  // The grown-ups' words are ordinary page text. They start just right of the syringe, sized in step with the
  // stage, and leave an empty square for the play button: put the button there.
  const opener = document.getElementById('opener'), slot = opener.querySelector('.go');
  let play = null;
  if (testClock.manual) window.__hub.play = () => (play && !play.destroyed ? { x: play.x, y: play.y } : null);      // for tests: where the play button is
  const place = () => {
    if (!first) return;
    const s = stage.s, left = toCss(at.x + 300, 0).x;
    Object.assign(opener.style, { left: left + 'px', width: Math.min(stage.vw - left - 20, 1480 * s) + 'px' });
    opener.style.setProperty('--u', s + 'px');
    // longer words on squarer screens: the block shrinks until it fits above the footer
    const room = Math.min(stage.vh * 0.46, foot().offsetTop - stage.vh * 0.46) * 2 - 24;
    if (opener.offsetHeight > room) opener.style.setProperty('--u', (s * room / opener.offsetHeight) + 'px');
    let x = opener.offsetLeft + slot.offsetWidth / 2, y = opener.offsetTop - opener.offsetHeight / 2 + slot.offsetHeight / 2;   // the words are centred on their own top edge
    for (let el = slot; el && el !== opener; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
    if (play) play.position.set((x - stage.ox) / s, (y - stage.oy) / s - 6);
  };
  if (first) {
    const b = play = add('movie', W * 0.5, H * 0.66, 96, 'intro');
    place();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!tl.dead) place(); });   // the words settle once their font arrives
    // the play button pulses gently, and a soft white ring opens out from it in the same slow time
    const halo = view.addChildAt(new Graphics().circle(0, 0, 96).fill(COL.white), view.getChildIndex(b));
    halo.alpha = 0;
    if (CLEAN) { b.visible = false; halo.visible = false; }      // filming: no buttons in the picture
    tl.wait(1.4).then(() => { sfx.pop(1); return tl.tween(b, { s: 1 }, 0.35, E.outBack); }).then(() => {      // after the question and the sentence, before the two points
      const t0 = tl.time;
      tl.every((dt, time) => {
        if (b.destroyed) return;
        const u = ((time - t0) / 2.6) % 1;
        b.scale.set(1 + Math.sin(u * Math.PI * 2) * 0.065);
        halo.position.copyFrom(b.position); halo.scale.set(1.02 + 0.5 * u); halo.alpha = 0.5 * (1 - u) * (1 - u);
      });
    });
  } else {
    const next = !progress.movie ? 'movie' : !progress.puzzle ? 'puzzle' : !progress.game ? 'game' : null;
    // three big buttons in a row, as big as the room beside the syringe allows
    const room = W * 0.62, gap = Math.min(330, room / 3.05), r = gap * 0.42, bx = W * 0.665, by = H * 0.45;
    const btns = ['movie', 'puzzle', 'game'].map((k, i) => add(k, bx + (1 - i) * gap, by, r));
    const settle = () => { const i = ['movie', 'puzzle', 'game'].indexOf(next); if (i >= 0 && !tl.dead) breathe(tl, btns[i]); };
    if (opts.announce && !progress.said) {
      mark('said');
      (async () => {
        await tl.wait(0.5);
        for (const [i, k] of ['movie', 'puzzle', 'game'].entries()) {
          sfx.pop(0.9 + i * 0.15);
          tl.tween(btns[i], { s: 1.12 }, 0.35, E.outBack);
          cap.textContent = SAY_BTN[k]; cap.classList.add('on');
          talking = await playClip(k);
          if (tl.dead) { talking.stop(); return; }
          await tl.wait((talking.dur || 1.6) + 0.15);
          tl.tween(btns[i], { s: 1 }, 0.25, E.out);
          await tl.wait(0.2);
        }
        cap.classList.remove('on');
        settle();
      })();
    } else {
      btns.forEach((b, i) => tl.wait(0.2 + i * 0.09).then(() => { sfx.pop(0.9 + i * 0.15); return tl.tween(b, { s: 1 }, 0.3, E.outBack); }).then(() => { if (i === 2) settle(); }));
    }
  }
  // along the bottom: the Zizzlelab logo with a quiet link to the full game
  foot().classList.add('on');
  // the copyright note sits in the bottom left corner, unless the footer would bump into it (see #legal in index.html)
  const legal = document.getElementById('legal'), over = document.getElementById('over');
  const fitLegal = () => {
    const f = foot(); over.classList.remove('legal-under'); f.style.left = '';
    const room = legal.offsetLeft + legal.offsetWidth + 18, vw = over.clientWidth, fw = f.offsetWidth;
    if ((vw - fw) / 2 >= room) return;                                  // fits beside the footer as it is
    if (room + fw + 16 <= vw) { f.style.left = (room + fw / 2) + 'px'; return; }      // move the footer over a little
    over.classList.add('legal-under');                                  // no room: one line under the footer
  };
  fitLegal();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!tl.dead) fitLegal(); });
  opener.classList.toggle('on', first);
  return { layout: () => { place(); fitLegal(); }, destroy() { foot().classList.remove('on'); opener.classList.remove('on'); document.getElementById('tips').hidden = true; cap.classList.remove('on'); if (talking) talking.stop(); } };
});

// ---------- the spoken intro ----------
// Annie says why shots matter while Yeti, the syringe and a couple of germs act it out. Then the three buttons.
const SAY = [
  [0.1, 'צריכים ללכת לקבל זריקה?'],
  [2.5, 'הרבה ילדים קצת חוששים מזריקות.'],
  [5.5, 'קודם מנגבים לכם את הזרוע במגבון קטן. הוא מרגיש קר, ויש לו ריח קצת מצחיק.'],
  [11.9, 'זה רק כדי לנקות!'],
  [13.8, 'אחר כך מגיעה הזריקה. ומאחוריה יש המצאה ממש מגניבה!'],
  [19.0, 'היא עושה עבודה חשובה: היא שומרת עליכם ועל ילדים אחרים!'],
];
defineScreen('intro', ({ view, tl, opts }) => {
  const { W, H, portrait } = stage;
  mark('intro');
  track('intro');
  const a = voice(), cap = caption();
  let clock = opts.at || 0, waited = 0;
  try { a.currentTime = clock; } catch (e) { /* not loaded yet: it starts from the top */ }
  a.play().catch(() => captions.auto());      // the voice cannot start: show the words instead
  // The scene keeps time with the voice itself, so a slow connection cannot pull them apart. If the voice
  // never starts (blocked, or no signal), the scene runs on by itself after a short wait, with the captions.
  tl.every(dt => {
    if (testClock.manual || a.ended) clock += dt;
    else if (!a.paused && a.currentTime > 0.05) clock = Math.max(clock, a.currentTime);
    else if ((waited += dt) > 3.5) { clock += dt; captions.auto(); }
  });
  const until = t => (t > clock ? tl.wait(t - clock) : Promise.resolve());
  const say = i => { cap.textContent = SAY[i][1]; cap.classList.add('on'); };

  homeButton(tl, view);
  const skip = makeButton(tl, { ...BTN.movie, r: 46, onTap: () => go('hub', { announce: true }) });
  skip.position.set(W - 78, 78);
  view.addChild(skip);

  // the cast
  const tall = portrait ? Math.min(700, H * 0.42) : 560, Sy = tall / M.yeti.h, q = Sy / 0.17;
  const ground = portrait ? H * 0.78 : H * 0.97, yx = portrait ? W * 0.42 : W * 0.3;
  const back = view.addChild(new Container());
  const friends = [[-215, 0xffdcc6], [200, 0xd3e8ff]].map(([dx, tint]) => {
    const f = makeYeti();
    f.c.children[0].tint = tint;
    f.c.scale.set(0); f.c.position.set(yx + dx * q, ground - 6);
    back.addChild(f.c);
    return f;
  });
  const yeti = makeYeti();
  yeti.c.scale.set(Sy); yeti.c.position.set(yx, ground + tall + 200);
  view.addChild(yeti.c);
  yeti.live(tl);
  const shield = view.addChild(new Graphics());
  const centre = { x: yx, y: ground - tall * 0.47 }, R = tall * (portrait ? 0.6 : 0.68);
  shield.position.set(centre.x, centre.y); shield.scale.set(0);
  shield.circle(0, 0, R).fill({ color: COL.mint, alpha: 0.28 }).circle(0, 0, R).stroke({ width: 16, color: COL.white, alpha: 0.9 });
  shield.moveTo(-R * 0.62, -R * 0.5).quadraticCurveTo(-R * 0.36, -R * 0.82, 0, -R * 0.86).stroke({ width: 18, color: COL.white, cap: 'round', alpha: 0.8 });
  const syr = makeSyringe({ cap: true });
  const Ss = Sy * 0.8, home = portrait ? { x: W * 0.62, y: H * 0.26 } : { x: W * 0.68, y: H * 0.46 };
  syr.rig.scale.set(Ss); syr.rig.rotation = TILT; syr.faceUp(TILT, false);
  syr.rig.position.set(W + 500, home.y - 120);
  view.addChild(syr.rig);
  syr.live(tl);
  // two germs that will come at the shield from the upper right and the upper left
  const germs = [['spiky', -0.5], ['blob', Math.PI + (portrait ? 1.1 : 0.75)]].map(([kind, ang]) => {
    const g = makeGerm(kind), ux = Math.cos(ang), uy = Math.sin(ang);
    g.scale.set(0.9); g.position.set(centre.x + ux * (R + 1900), centre.y + uy * (R + 1900));      // well off screen until its cue
    g.way = { ux, uy };
    view.addChild(g);
    return g;
  });
  const out = (g, d) => ({ x: centre.x + g.way.ux * (R + d), y: centre.y + g.way.uy * (R + d) });
  const hopUp = async (obj, h, dur = 0.34) => { const y0 = obj.y; await tl.run(dur, t => { obj.y = y0 - Math.sin(t * Math.PI) * h; }); obj.y = y0; punch(tl, obj, 0.06, 0.26); };

  // the wipe, and the clean spot it leaves on his arm
  const armAt = { x: yx + yeti.arm.x * Sy, y: ground + yeti.arm.y * Sy };
  const pad = view.addChild(new Container());
  pad.addChild(new Graphics().roundRect(-74, -72, 148, 136, 28).fill(COL.white).roundRect(-52, -50, 104, 92, 18).fill(0xd3ecfb));
  pad.scale.set(0); pad.position.set(armAt.x + 330 * q, armAt.y - 150 * q);
  const clean = new Graphics().circle(0, 0, 120).fill({ color: 0xd3ecfb, alpha: 0.95 }).circle(0, 0, 120).stroke({ width: 16, color: COL.mintDark, alpha: 0.8 });
  clean.position.set(yeti.arm.x, yeti.arm.y); clean.scale.set(0);
  yeti.c.addChild(clean);

  (async () => {
    // "Do you need to go for a shot?"
    await until(0.2); say(0);
    sfx.pop(0.9);
    await tl.tween(yeti.c, { y: ground }, 0.5, E.outBack);
    // "Lots of kids feel a bit nervous about shots." A small, honest wobble: he leans back and blinks.
    await until(2.7); say(1);
    tl.tween(yeti.c, { rotation: -0.07 }, 0.4, E.out);
    yeti.express('nervous'); yeti.look(26, 8);
    await until(4.1);
    yeti.blink(tl);
    // "First, your arm gets a little wipe. It feels cold, and it smells a bit funny."
    await until(5.7); say(2);
    tl.tween(yeti.c, { rotation: 0 }, 0.4, E.out);
    sfx.pop(1.2);
    await tl.tween(pad, { s: 0.62 * q }, 0.3, E.outBack);
    await tl.tween(pad, { x: armAt.x, y: armAt.y }, 0.5, E.inOut);
    await until(9.3);                                   // "cold": brr
    yeti.express('brr'); sfx.eep();
    tl.run(1.0, t => { yeti.c.x = yx + Math.sin(t * 60) * 5 * (1 - t); });
    for (let i = 0; i < 3; i++) {
      sfx.drip(); sparkle({ x: armAt.x + rnd(-20, 20), y: armAt.y + rnd(-20, 20) }, [0xd3ecfb, COL.white], 4, 60);
      await tl.tween(pad, { x: armAt.x + (i % 2 ? -14 : 14), y: armAt.y - 18 }, 0.11, E.out);
      await tl.tween(pad, { x: armAt.x, y: armAt.y }, 0.11, E.in);
    }
    await until(10.3);                                   // "smells funny": little wisps drift up
    for (let i = 0; i < 3; i++) {
      const w = view.addChild(new Graphics().moveTo(0, 0).bezierCurveTo(14, -16, -14, -32, 0, -48).stroke({ width: 7, color: COL.mintDark, cap: 'round' }));
      w.position.set(armAt.x + (i - 1) * 36, armAt.y - 50);
      tl.tween(w, { y: w.y - 110, alpha: 0 }, 1.2, E.out).then(() => w.destroy());
    }
    // "That's just to make it clean!"
    await until(12.0); say(3);
    yeti.express('relief');
    tl.wait(0.9).then(() => { yeti.express('happy'); yeti.look(0, 0); });
    tl.tween(clean, { s: 1 }, 0.3, E.outBack);
    sfx.plink(3); sparkle(armAt, [COL.white, 0xd3ecfb, COL.yellow], 7, 100);
    tl.tween(pad, { x: W + 200, y: armAt.y - 240, rotation: 1 }, 0.6, E.in);
    // "Then comes the shot. And there's actually a really cool invention behind it!"
    await until(13.9); say(4);
    sfx.whoosh(false);
    await tl.tween(syr.rig, { x: home.x, y: home.y }, 0.6, E.outBack);
    tl.run(0.5, t => { syr.rig.rotation = TILT + Math.sin(t * 16) * 0.08 * (1 - t); });        // a little wave hello
    await until(16.4);
    await hopUp(syr.rig, 70 * q, 0.4);
    sparkle({ x: syr.rig.x, y: syr.rig.y }, [COL.white, COL.yellow, COL.pinkLight], 10, 190 * q);
    sfx.chime();
    await pump(tl, syr, 2);
    // "It does an important job in keeping you and other kids safe!"
    await until(19.1); say(5);
    tl.tween(clean, { alpha: 0 }, 0.4);
    friends.forEach((f, i) => tl.wait(i * 0.22).then(() => { sfx.pop(1.1 + i * 0.2); return tl.tween(f.c, { s: Sy * 0.6 }, 0.35, E.outBack); }));
    tl.tween(germs[0], out(germs[0], 230), 1.1, E.inOut);
    tl.tween(germs[1], out(germs[1], 230), 1.3, E.inOut);
    sfx.giggle();
    await until(20.9);
    sfx.plink(4);
    await tl.tween(shield, { s: 1 }, 0.4, E.outBack);                                           // the shield goes up
    // the germs bonk off it, one after the other, and clear off
    for (const g of germs) {
      await tl.tween(g, out(g, 58), 0.22, E.in);
      sfx.boing(); punch(tl, shield, 0.03, 0.3);
      puff(out(g, 0), COL.white, 5, 12);
      tl.tween(g, { ...out(g, 1900), rotation: g.way.ux > 0 ? 3 : -3 }, 1.0, E.out);
      await tl.wait(0.45);
    }
    await until(23.0);
    sfx.fanfare();
    yeti.wink(tl);
    friends.forEach((f, i) => tl.wait(0.1 + i * 0.1).then(() => hopUp(f.c, 40 * q)));
    hopUp(syr.rig, 46 * q);
    await hopUp(yeti.c, 60 * q);
    await until(24.3);
    track('intro_end');
    go('hub', { announce: true });
  })();

  return {
    state: () => ({ at: clock }),
    destroy() { a.pause(); cap.classList.remove('on'); },
  };
});

// ---------- the movie ----------
const MOVIE_WORDS = [[0.0, 5.272, "מזרק הוא צינורית קטנה, שאחות או רופא משתמשים בה לדברים חשובים,"], [5.607, 9.036999999999999, "כמו לקחת קצת דם לבדיקה, או לתת זריקת חיסון."], [9.283, 11.723999999999998, "חיסון עוזר לגוף שלכם להתאמן."], [12.158, 14.462, "הוא מראה לגוף איך וירוס נראה,"], [14.732, 18.948, "כדי שאם הווירוס יגיע אחר כך, הגוף כבר ידע מה לעשות."], [19.021, 21.351, "עכשיו בואו נראה איך המזרק עובד."], [21.9, 24.599999999999998, "קודם כול, החיסון נמצא בבקבוקון קטן."], [25.05, 29.849999999999998, "האחות או הרופא מכניסים את המחט, ומושכים את הבוכנה אחורה."], [30.31, 34.03, "מושכים... מושכים... מושכים..."], [34.307, 38.286, "הבוכנה יוצרת בתוך המזרק מקום ריק שנקרא ואקום."], [38.492, 42.958000000000006, "כמו לשתות בקשית: שואבים, והמיץ נכנס פנימה."], [42.979, 44.851000000000006, "המזרק עושה אותו דבר."], [45.07, 47.980000000000004, "הבוכנה נמשכת, והחיסון נכנס פנימה."], [48.347, 50.716, "עכשיו החיסון נמצא בתוך המזרק."], [51.024, 53.292, "ואז מגיעה הדקירה המהירה."], [53.66, 59.06, "המחט עוברת דרך העור, והבוכנה דוחפת את החיסון דרך הצינורית הקטנטנה,"], [59.13, 62.45, "דרך המחט החלולה, ואל תוך הגוף."], [62.706, 65.148, "אז המזרק עושה שני דברים חכמים."], [65.18, 67.78, "מושכים אחורה: החיסון נכנס."], [68.1, 70.53, "דוחפים קדימה: החיסון יוצא."]];
// The movie fills the whole screen (it plays on the page layer underneath; the buttons are drawn over it).
// Touch the movie to pause or carry on. When it ends, three big buttons: again, puzzle, game.
defineScreen('movie', ({ view, tl, opts }) => {
  const v = video(), under = document.getElementById('under');
  const buttons = view.addChild(new Container());
  const home = homeButton(tl, view);
  let ended = !!opts.done, stopBreath = null;
  const mk = (kind, r) => { const b = makeButton(tl, { ...BTN[kind], r, onTap: () => (kind === 'movie' ? replay() : go(kind)) }); b.isUi = true; buttons.addChild(b); return b; };
  const bPuzzle = mk('puzzle', 100), bGame = mk('game', 100), bAgain = mk('movie', 100);
  // a veil of the page's yellow behind the finished buttons so they read over the last frame of the movie
  const paused = view.addChildAt(new Graphics(), 0);

  function layout() {
    const { W, H, cx, cy } = stage;
    paused.clear();
    if (ended) {
      paused.rect(-400, -400, W + 800, H + 800).fill({ color: 0xf8eb45, alpha: 0.78 });
      [bAgain, bPuzzle, bGame].forEach((b, i) => { b.visible = true; b.scale.set(1.3); b.position.set(cx + (1 - i) * 330, cy); });
    } else {       // while it plays: puzzle and game wait small in the corner, out of the picture's way
      bAgain.visible = false;
      [bPuzzle, bGame].forEach((b, i) => { b.scale.set(0.6); b.position.set(W - 226 + i * 140, H - 86); });
    }
  }
  function replay() {
    ended = false; if (stopBreath) stopBreath(); stopBreath = null;
    layout(); v.currentTime = 0; v.play().catch(() => {});
  }
  const onEnd = () => {
    track('movie_end');
    ended = true; layout();
    sfx.chime();
    [bAgain, bPuzzle, bGame].forEach(b => punch(tl, b, 0.14));
    tl.wait(0.4).then(() => { stopBreath = breathe(tl, bPuzzle, 0.08); });
  };
  v.addEventListener('ended', onEnd);
  // the words of the narration, for the CC button
  const cap = caption(), showWords = () => { const w = MOVIE_WORDS.find(l => v.currentTime >= l[0] && v.currentTime < l[1]); cap.textContent = w ? w[2] : ''; cap.classList.toggle('on', !!w); };
  v.addEventListener('timeupdate', showWords);
  v.muted = false;
  v.classList.add('on'); under.classList.add('movie');
  layout();
  mark('movie');
  track('movie');
  if (ended) stopBreath = breathe(tl, bPuzzle, 0.08);
  else {
    try { v.currentTime = opts.resume || 0; } catch (e) { /* not ready yet: it starts from the top */ }
    v.play().catch(() => { v.controls = true; });      // if the browser wants its own touch first, show its play button
  }
  return {
    layout,
    // a touch on the movie itself pauses it or carries on
    onDown: (pos, e, onNothing) => { if (!onNothing || ended) return false; if (v.paused) v.play().catch(() => {}); else { v.pause(); sfx.tap(); } return true; },
    state: () => (ended ? { done: true } : { resume: v.currentTime }),
    destroy() { v.pause(); v.controls = false; v.classList.remove('on'); under.classList.remove('movie'); v.removeEventListener('ended', onEnd); v.removeEventListener('timeupdate', showWords); cap.classList.remove('on'); },
  };
});

// ---------- my plan ----------
// After the game the kid picks two things THEY will do at their own shot. A plan made ahead of time is far more
// likely to be used on the day; the words in the caption are for the grown-up they show it to.
const PLAN = [
  { words: 'לקחת נשימה גדולה ואיטית', draw(g) {
    g.roundRect(-5, 0, 10, 86, 5).fill(COL.plum);
    [COL.pink, COL.yellow, COL.teal, COL.pinkLight].forEach((col, i) => { const a = i * Math.PI / 2, c = Math.cos(a), n = Math.sin(a);
      g.poly([0, 0, 58 * n, -58 * c, 42 * c + 42 * n, 42 * n - 42 * c]).fill(col); });
    g.circle(0, 0, 10).fill(COL.white);
  } },
  { words: 'להסתכל על הצעצוע שלי', draw(g) {
    const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 30 : 62; pts.push(Math.cos(a) * r, Math.sin(a) * r + 4); }
    g.poly(pts).fill(COL.yellow).stroke({ width: 16, color: COL.yellow, join: 'round' });
    g.ellipse(-14, 2, 5, 7).fill(COL.plum).ellipse(14, 2, 5, 7).fill(COL.plum).moveTo(-8, 16).quadraticCurveTo(0, 24, 8, 16).stroke({ width: 5, color: COL.plum, cap: 'round' });
  } },
  { words: 'להחזיק יד', draw(g) {
    g.circle(-26, -14, 34).fill(COL.pink).circle(26, -14, 34).fill(COL.pink).poly([-56, 2, 56, 2, 0, 66]).fill(COL.pink).stroke({ width: 8, color: COL.pink, join: 'round' });
    g.moveTo(-40, -26).quadraticCurveTo(-34, -40, -18, -40).stroke({ width: 9, color: COL.white, cap: 'round', alpha: 0.7 });
  } },
  { words: 'לשיר שיר', draw(g) {
    g.roundRect(-8, -62, 12, 104, 6).fill(COL.teal).ellipse(-22, 44, 28, 20).fill(COL.teal);
    g.moveTo(0, -58).quadraticCurveTo(44, -50, 46, -8).stroke({ width: 14, color: COL.teal, cap: 'round' });
  } },
];
defineScreen('plan', ({ view, tl }) => {
  const { W, H } = stage;
  const cap = caption();
  let talking = null;
  const tell = (key, words) => { if (talking) talking.stop(); cap.textContent = words || LINES[key][0]; cap.classList.add('on'); playClip(key).then(h => { if (tl.dead) h.stop(); else talking = h; }); };
  homeButton(tl, view);
  // Yeti, proud, on the left
  const yeti = makeYeti(), tall = 540, Sy = tall / M.yeti.h;
  yeti.c.scale.set(Sy); yeti.c.position.set(W * 0.17, H * 0.97);
  view.addChild(yeti.c);
  yeti.live(tl);
  const hopUp = async (obj, h) => { const y0 = obj.y; await tl.run(0.34, t => { obj.y = y0 - Math.sin(t * Math.PI) * h; }); obj.y = y0; punch(tl, obj, 0.06, 0.26); };

  const gap = Math.min(290, W * 0.64 / 4), r = gap * 0.42, x0 = W * 0.66 + gap * 1.5, y = H * 0.47;
  const picks = [];
  let done = false;
  const discs = PLAN.map((o, i) => {
    const c = new Container(), ring = new Graphics(), g = new Graphics();
    c.addChild(new Graphics().circle(0, r * 0.1, r).fill({ color: COL.plum, alpha: 0.14 }).circle(0, 0, r).fill(COL.cream), ring, g);
    o.draw(g); g.scale.set(r / 112);
    c.position.set(x0 - i * gap, y); c.scale.set(0);
    c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new Circle(0, 0, r * 1.1);
    c.on('pointertap', () => choose(i));
    c.ring = ring;
    view.addChild(c);
    tl.wait(0.5 + i * 0.14).then(() => { sfx.pop(0.9 + i * 0.12); return tl.tween(c, { s: 1 }, 0.3, E.outBack); });
    return c;
  });
  const paint = () => discs.forEach((c, i) => {
    const on = picks.includes(i);
    c.ring.clear();
    if (on) c.ring.circle(0, 0, r + 8).stroke({ width: 16, color: COL.pink });
    c.alpha = done && !on ? 0.35 : 1;
  });
  if (testClock.manual) window.__plan = { choose: i => choose(i) };      // for tests and the reel
  function choose(i) {
    if (done) return;
    if (picks.includes(i)) { picks.splice(picks.indexOf(i), 1); sfx.tap(); paint(); return; }      // changed their mind
    picks.push(i);
    sfx.plink(picks.length + 1); punch(tl, discs[i], 0.12, 0.3);
    paint();
    if (picks.length === 2) finish();
  }
  async function finish() {
    done = true; paint();
    mark('plan');
    track('plan');
    await tl.wait(0.5);
    tell('plan_done', 'התוכנית שלי: ' + picks.map(i => PLAN[i].words).join(' + ') + '. הראו למבוגר!');
    sfx.fanfare(); confetti(40);
    yeti.wink(tl);
    await hopUp(yeti.c, 50);
    const b = makeButton(tl, { ...BTN.home, r: 84, onTap: () => go('hub') });
    b.position.set(W * 0.66, H * 0.82); b.scale.set(0);
    view.addChild(b);
    await tl.wait(1.2);
    await tl.tween(b, { s: 1 }, 0.3, E.outBack);
    breathe(tl, b);
  }
  tl.wait(0.4).then(() => tell('plan_ask'));
  return { destroy() { cap.classList.remove('on'); if (talking) talking.stop(); } };
});

// ---------- the puzzle ----------
// The syringe pops apart onto the shelf; drag each part back where it belongs.
const SHELF_ORDER = ['barrel', 'hub', 'plunger', 'needle', 'flange', 'stopper', 'cap', 'thumb'];
// what each part is called: said (the team's recordings, media/part_<name>.mp3) when the part is picked up
const PART_NAMES = {"barrel": "גוף המזרק", "plunger": "בוכנה", "stopper": "פקק גומי", "flange": "אוגן", "thumb": "משענת לאגודל", "hub": "בסיס המחט", "needle": "מחט", "cap": "מכסה המחט"};
loadClips(Object.fromEntries(SHELF_ORDER.map(n => ['part_' + n, `media/part_${n}.mp3`])));

defineScreen('puzzle', ({ view, tl, opts }) => {
  track('puzzle');
  const { W, H, cx, cy, portrait } = stage;
  const placed = new Set(opts.placed || []);
  const o = syringeOrigin();
  const S = (portrait ? Math.min(W * 0.86, H * 0.44) : Math.min(H * 0.86, W * 0.5)) / 3900;
  const centre = portrait ? { x: cx, y: H * 0.27 } : { x: W * 0.29, y: cy };
  const cos = Math.cos(TILT), sin = Math.sin(TILT);
  const boardAt = { x: centre.x - cos * 177 * S, y: centre.y - sin * 177 * S };
  const board = new Container();
  board.position.set(boardAt.x, boardAt.y); board.rotation = TILT; board.scale.set(S);
  view.addChild(board);
  const pieceLayer = view.addChild(new Container());
  homeButton(tl, view);
  let done = false, live = false;

  // one part, centred on its own middle, in designer points
  function shape(name) {
    const m = M[name], c = new Container();
    const add = n => {
      const mm = M[n], sp = partSprite(n);
      sp.position.set(mm.x - (m.x + m.w / 2), mm.y - (m.y + m.h / 2));
      c.addChild(sp);
    };
    add(name);
    if (name === 'plunger') add('face');
    return c;
  }
  const slotOf = name => { const m = M[name]; return { x: m.x + m.w / 2 - o.x, y: m.y + m.h / 2 - o.y }; };
  const toStage = p => ({ x: boardAt.x + (p.x * cos - p.y * sin) * S, y: boardAt.y + (p.x * sin + p.y * cos) * S });

  // the shadow of the whole syringe: where everything goes
  const shadow = new Container();
  for (const n of SYRINGE_PARTS) { const s = shape(n), p = slotOf(n); s.position.set(p.x, p.y); s.children.forEach(k => { k.tint = 0x000000; }); shadow.addChild(s); }
  const b = shadow.getLocalBounds();
  const flat = new Sprite(app.renderer.generateTexture({ target: shadow, resolution: 0.5 }));
  flat.position.set(b.minX, b.minY); flat.alpha = 0.13;
  shadow.destroy({ children: true });
  board.addChild(flat);
  const slots = board.addChild(new Container());   // placed parts, kept in the designer's stacking order
  slots.sortableChildren = true;

  // shelf spots
  const area = portrait ? { x: 50, y: H * 0.53, w: W - 100, h: H * 0.47 - 60, cols: 4 } : { x: W * 0.57, y: 70, w: W * 0.43 - 50, h: H - 140, cols: 3 };
  const rows = Math.ceil(8 / area.cols), cw = area.w / area.cols, ch = area.h / rows;
  const pieces = {};
  SHELF_ORDER.forEach((name, i) => {
    const m = M[name], big = (m.w + m.h) * 0.7071 * S;
    const pc = shape(name);
    const p = {
      name, pc, slot: toStage(slotOf(name)),
      shelf: { x: area.x + cw * ((i % area.cols) + 0.5), y: area.y + ch * (Math.floor(i / area.cols) + 0.5) },
      shelfScale: S * Math.min(1, Math.min(cw, ch, 215) * 0.95 / big), tilt: TILT + rnd(-0.12, 0.12), busy: false,
    };
    pc.rotation = TILT; pc.scale.set(S);
    pc.eventMode = 'static'; pc.cursor = 'grab';
    pc.hitArea = new Circle(0, 0, Math.max(Math.hypot(m.w, m.h) / 2, 78 / p.shelfScale));
    pc.on('pointerdown', e => grab(p, e));
    pieces[name] = p;
    if (placed.has(name)) settle(p); else pieceLayer.addChild(pc);
  });

  function settle(p) {     // into the board for good
    const s = slotOf(p.name);
    p.pc.eventMode = 'none'; p.pc.rotation = 0; p.pc.scale.set(1); p.pc.position.set(s.x, s.y);
    p.pc.zIndex = M._order.indexOf(p.name);
    slots.addChild(p.pc);
  }

  // say the part's name as it is picked up (not over and over if the same part is picked up again straight away)
  const cap = caption();
  let naming = null, named = '', namedAt = -99, nameId = 0;
  function name(p) {
    if (p.name === named && tl.time - namedAt < 4) return;
    named = p.name; namedAt = tl.time;
    const id = ++nameId;
    if (naming) naming.stop(); naming = null;
    cap.textContent = PART_NAMES[p.name]; cap.classList.add('on');
    playClip('part_' + p.name).then(h => { if (id === nameId && !tl.dead) naming = h; else h.stop(); });
    tl.wait(1.8).then(() => { if (id === nameId) cap.classList.remove('on'); });
  }

  function grab(p, e) {
    if (!live || p.busy || placed.has(p.name)) return;
    const start = stage_local(e), off = { x: p.pc.x - start.x, y: p.pc.y - start.y };
    pieceLayer.addChild(p.pc);
    tl.stop(p.pc);
    sfx.lift();
    name(p);
    tl.tween(p.pc, { s: S * 1.07, rotation: TILT }, 0.14, E.outBack);
    drag(e, {
      move: q => { p.pc.position.set(q.x + off.x, q.y + off.y); },
      end: () => drop(p),
    });
  }
  const stage_local = e => view.toLocal(e.global);

  async function drop(p) {
    const d = Math.hypot(p.pc.x - p.slot.x, p.pc.y - p.slot.y);
    p.busy = true;
    tl.stop(p.pc);
    if (d < 125) {              // close enough: the app finishes it
      await tl.tween(p.pc, { x: p.slot.x, y: p.slot.y, s: S, rotation: TILT }, 0.12, E.out);
      placed.add(p.name);
      settle(p);
      sfx.clunk(1 + placed.size * 0.05); sfx.plink(placed.size - 1);
      sparkle(p.slot, [COL.white, COL.yellow, COL.pinkLight], 7, 90);
      punch(tl, board, 0.05, 0.3).then(() => board.scale.set(S));
      if (placed.size === SYRINGE_PARTS.length) finish();
    } else {                     // not there: it floats back to its spot, no fuss
      sfx.boing();
      await tl.tween(p.pc, { x: p.shelf.x, y: p.shelf.y, s: p.shelfScale, rotation: p.tilt }, 0.4, E.outBack);
    }
    p.busy = false;
  }

  async function finish() {
    done = true; live = false;
    mark('puzzle');
    track('puzzle_done');
    await tl.wait(0.4);                       // the held breath before the party
    const syr = makeSyringe({ cap: true });
    syr.faceUp(TILT, false);
    board.removeChild(slots); slots.destroy({ children: true }); flat.visible = false;
    board.addChild(syr.rig);
    syr.live(tl);
    sfx.fanfare(); confetti(50);
    await tl.tween(board, { y: boardAt.y - 60 }, 0.22, E.out);
    await tl.tween(board, { y: boardAt.y }, 0.2, E.in);
    punch(tl, board, 0.1, 0.4).then(() => board.scale.set(S));
    await pump(tl, syr, 2);
    await syr.blink(tl);
    await tl.wait(1.1);
    go('hub');
  }

  // opening: whole, a wobble, then it pops apart onto the shelf
  (async () => {
    const loose = SHELF_ORDER.map(n => pieces[n]).filter(p => !placed.has(p.name));
    if (opts.placed) {           // coming back after the phone was turned
      loose.forEach(p => { p.pc.position.set(p.shelf.x, p.shelf.y); p.pc.scale.set(p.shelfScale); p.pc.rotation = p.tilt; });
      live = true; return;
    }
    flat.alpha = 0;
    loose.forEach(p => { p.pc.position.set(p.slot.x, p.slot.y); });
    // draw them stacked the way the designer stacks them while still whole
    M._order.forEach(n => { if (pieces[n]) pieceLayer.addChild(pieces[n].pc); });
    await tl.wait(0.7);
    await tl.run(0.5, t => { view.x = Math.sin(t * 26) * 7 * t; });
    view.x = 0;
    sfx.pop(0.8); puff(centre, COL.cream, 9, 22);
    tl.tween(flat, { alpha: 0.13 }, 0.4);
    await Promise.all(loose.map((p, i) => tl.wait(i * 0.06).then(() => {
      sfx.pop(1 + i * 0.07);
      return tl.tween(p.pc, { x: p.shelf.x, y: p.shelf.y, s: p.shelfScale, rotation: p.tilt }, 0.5, E.outBack);
    })));
    live = true;
  })();

  // test handle: where each loose piece sits and where it belongs
  window.__puzzle = { pieces: () => SHELF_ORDER.filter(n => !placed.has(n)).map(n => ({ name: n, at: { x: pieces[n].pc.x, y: pieces[n].pc.y }, slot: pieces[n].slot })) };

  return { state: () => ({ placed: [...placed] }), destroy() { nameId++; if (naming) naming.stop(); cap.classList.remove('on'); } };
});
