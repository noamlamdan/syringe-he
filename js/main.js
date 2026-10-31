// How a Syringe Works: movie, then puzzle, then the Germ Guard game.
import { app, boot, go, advance, clock, currentScreen, stage, root } from './engine.js';
import { loadArt } from './art.js';
import { track } from './track.js';
import './screens.js';
import './game.js';

const q = new URLSearchParams(location.search);

await Promise.all([boot(), loadArt()]);
document.getElementById('wait').classList.add('gone');
track('open');

clock.manual = q.has('test');

// ?start=puzzle or ?start=game&round=2 jumps straight to a screen (for testing)
const start = q.get('start');
if (start === 'game') go('game', { round: Number(q.get('round')) || 1, known: q.get('round') === '2' ? ['spiky'] : [] });
else go(['intro', 'movie', 'puzzle', 'plan', 'hub'].includes(start) ? start : 'hub');

window.__zz = { app, go, advance, stage, root, screen: currentScreen };
if (q.has('test')) (await import('./testkit.js')).installTestKit();
