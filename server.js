'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Store } = require('./lib/store');
const { renderPerson, renderEmpty, vcard, linksFor } = require('./lib/page');

const PORT = Number(process.env.PORT) || 3003;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const TZ = process.env.TZ || 'America/Toronto';
const SESSION_DAYS = 180; // l'iPhone reste connecté longtemps

if (!ADMIN_PASSWORD) {
  console.error('⚠️  ADMIN_PASSWORD manquant : définis-le dans .env (voir .env.example).');
  process.exit(1);
}

const store = new Store(DATA_DIR);

// Secret de session persistant (généré une seule fois dans le volume).
const secretFile = path.join(DATA_DIR, '.session-secret');
let SECRET = process.env.SESSION_SECRET;
if (!SECRET) {
  try {
    SECRET = fs.readFileSync(secretFile, 'utf8').trim();
  } catch {
    SECRET = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(secretFile, SECRET, { mode: 0o600 });
  }
}
// Changer le mot de passe invalide toutes les sessions existantes.
const sign = (v) => crypto.createHmac('sha256', SECRET + ADMIN_PASSWORD).update(v).digest('base64url');

function makeToken() {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `${exp}.${sign(String(exp))}`;
}

function validToken(t) {
  if (!t) return false;
  const [exp, sig] = t.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isAuthed = (req) => validToken(cookies(req).wd_session);

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Non connecté' });
}

// Anti-bruteforce minimal sur /api/login.
const attempts = new Map();
function tooManyAttempts(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  attempts.set(ip, list);
  return list.length >= 10;
}

const app = express();
app.set('trust proxy', true);
app.disable('x-powered-by');
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

const publicUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;

const fmtDate = (ts) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, day: 'numeric', month: 'long', year: 'numeric' }).format(ts);

function directUrl(p) {
  if (!p.redirect) return null;
  const l = linksFor(p)[p.redirect];
  return l ? l.url : null;
}

// ---------- Public : ce qu'on voit en scannant le chandail ----------

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store'); // le porteur change : jamais de cache
  const p = store.active();
  if (req.query.preview === undefined) store.recordScan();
  if (!p) return res.send(renderEmpty());
  const direct = req.query.preview === undefined && directUrl(p);
  if (direct) return res.redirect(302, direct);
  const since = store.data.history.find((h) => h.personId === p.id);
  res.send(renderPerson(p, { since: since ? fmtDate(since.at) : null }));
});

app.get('/vcard', (req, res) => {
  const p = store.active();
  if (!p) return res.redirect('/');
  const filename = p.name.replace(/[^\w-]+/g, '_') || 'contact';
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'text/vcard; charset=utf-8');
  res.set('Content-Disposition', `inline; filename="${filename}.vcf"`);
  res.send(vcard(p));
});

app.get('/photo/:id', (req, res) => {
  const p = store.get(req.params.id);
  if (!p || !p.photo) return res.sendStatus(404);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.type('image/jpeg').sendFile(store.photoPath(p.id));
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// ---------- Admin (PWA) ----------

app.use('/admin', express.static(path.join(__dirname, 'admin'), { index: 'index.html', maxAge: 0 }));

app.post('/api/login', (req, res) => {
  const ip = req.ip;
  if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Trop d’essais, réessaie dans 15 min' });
  const pw = String(req.body?.password || '');
  const a = crypto.createHash('sha256').update(pw).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  if (!crypto.timingSafeEqual(a, b)) {
    attempts.get(ip).push(Date.now());
    return res.status(401).json({ error: 'Mauvais mot de passe' });
  }
  attempts.delete(ip);
  res.cookie('wd_session', makeToken(), {
    httpOnly: true,
    sameSite: 'strict',
    secure: req.secure,
    maxAge: SESSION_DAYS * 864e5,
    path: '/',
  });
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('wd_session', { path: '/' });
  res.json({ ok: true });
});

app.get('/api/state', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    people: store.list(),
    activeId: store.data.activeId,
    history: store.data.history.slice(0, 50),
    scans: store.data.scans,
    publicUrl: publicUrl(req),
  });
});

const wrap = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

app.post('/api/people', requireAuth, wrap((req, res) => res.json(store.create(req.body || {}))));

app.put(
  '/api/people/:id',
  requireAuth,
  wrap((req, res) => {
    const p = store.update(req.params.id, req.body || {});
    p ? res.json(p) : res.sendStatus(404);
  })
);

app.delete('/api/people/:id', requireAuth, (req, res) => {
  store.remove(req.params.id) ? res.json({ ok: true }) : res.sendStatus(404);
});

app.post('/api/active', requireAuth, (req, res) => {
  const id = req.body?.id ?? null;
  if (!store.setActive(id)) return res.status(404).json({ error: 'Personne introuvable' });
  res.json({ ok: true, activeId: id });
});

app.get('/api/qr.:fmt(svg|png)', requireAuth, async (req, res) => {
  const opts = { errorCorrectionLevel: 'H', margin: 2, color: { dark: '#000000', light: '#ffffff' } };
  const url = publicUrl(req) + '/';
  if (req.params.fmt === 'svg') {
    res.type('image/svg+xml').send(await QRCode.toString(url, { ...opts, type: 'svg' }));
  } else {
    res.type('image/png').send(await QRCode.toBuffer(url, { ...opts, width: 2000 }));
  }
});

app.use((req, res) => res.status(404).send('Introuvable'));

const server = app.listen(PORT, () => console.log(`Wanna date? en ligne sur le port ${PORT}`));

function shutdown() {
  store.save();
  server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
