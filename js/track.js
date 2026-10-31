// Anonymous usage counts. Each milestone a visit reaches sends one tiny record to our own database:
// which milestone, the day, phone / tablet / computer, and a random id that lasts only as long as the tab is open.
// No cookies, no names, nothing kept on the phone, nothing that identifies a person. Totals: hq.zizzlelab.com/stats/syringe/
// Nothing is sent from a local copy, or when the address has ?test or ?quiet (so our own testing is not counted).
const URL = 'https://firestore.googleapis.com/v1/projects/work-hq-daefd/databases/(default)/documents/syringeEvents?key=AIzaSyBpis_dEAwP2Da1TY0SXoPSFeNwDYI4Zaw';
const q = new URLSearchParams(location.search);
const off = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || q.has('test') || q.has('quiet') || true;      // HEBREW REVIEW COPY: counting is off
const sent = new Set();

function visitId() {
  try {
    let v = sessionStorage.getItem('syringeVisit');
    if (!v) { v = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('syringeVisit', v); }
    return v;
  } catch (e) { return Math.random().toString(36).slice(2, 12); }
}
function device() {
  const touch = navigator.maxTouchPoints > 0, small = Math.min(screen.width, screen.height);
  return !touch ? 'computer' : small < 600 ? 'phone' : 'tablet';
}

export function track(e) {
  if (off || sent.has(e)) return;
  sent.add(e);
  const now = new Date(), pad = n => String(n).padStart(2, '0');
  const fields = {
    e: { stringValue: e }, v: { stringValue: visitId() }, at: { stringValue: now.toISOString() },
    day: { stringValue: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` }, dev: { stringValue: device() },
  };
  const from = (q.get('from') || '').replace(/[^\w-]/g, '').slice(0, 16);      // e.g. ?from=qr on a printed code
  if (from) fields.src = { stringValue: from };
  try { fetch(URL, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields }) }).catch(() => {}); } catch (err) { /* never in the way of play */ }
}
