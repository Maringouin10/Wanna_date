'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Store } = require('./lib/store');
const { Pickup } = require('./lib/pickup');
const { normalizeForm, DEFAULT_FORM } = require('./lib/fields');
const { renderForm, renderThanks, renderEmpty } = require('./lib/page');
const { handle, phoneDigits } = require('./lib/links');

const PORT = Number(process.env.PORT) || 3003;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const SESSION_DAYS = 180; // l'iPhone reste connecté longtemps

if (!ADMIN_PASSWORD) {
  console.error('⚠️  ADMIN_PASSWORD manquant : définis-le dans .env (voir .env.example).');
  process.exit(1);
}

const store = new Store(DATA_DIR);
const pickup = new Pickup(DATA_DIR);
if (process.env.PICKUP_FETCH !== 'off') pickup.schedule();

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

const wrap = (fn) => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};

const publicUrl = (req) => PUBLIC_URL || `${req.protocol}://${req.get('host')}`;


// Les robots d'aperçu (iMessage, Messenger, etc.) ne comptent pas comme des scans.
const BOT_RE = /bot|crawl|spider|preview|facebookexternalhit|whatsapp|slack|discord|telegram|curl|wget/i;

// Identifiant anonyme d'un visiteur (pour compter les visiteurs uniques) : hash non réversible.
const visitorId = (req) =>
  crypto.createHmac('sha256', SECRET).update(`${req.ip}|${req.get('user-agent') || ''}`).digest('base64url').slice(0, 12);

// ---------- Public : ce qu'on voit en scannant le chandail ----------

const formConfig = () => normalizeForm(store.data.settings.form);

const randomPickup = () => {
  const st = store.data.settings;
  return st.pickup ? pickup.random(st.pickupLang) : null;
};

app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store'); // le porteur change : jamais de cache
  const p = store.active();
  const counted = req.query.preview === undefined && req.query.encore === undefined && !BOT_RE.test(req.get('user-agent') || '');
  if (counted) store.recordScan(visitorId(req));
  if (!p) return res.send(renderEmpty());
  res.send(renderForm(p, { pickup: randomPickup(), form: formConfig() }));
});

// Formulaire envoyé par quelqu'un qui a scanné le chandail.
app.post('/envoyer', express.urlencoded({ extended: false, limit: '10kb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const b = req.body || {};
  // Le message va à la personne affichée au moment du scan (même si le chandail a changé depuis).
  const p = store.get(String(b.w || '')) || store.active();
  if (!p) return res.send(renderEmpty());
  if (b.website) return res.redirect(303, '/merci'); // robot (champ piège rempli)

  const values = {
    instagram: String(b.instagram || '').trim().slice(0, 40),
    phone: String(b.phone || '').trim().slice(0, 25),
    city: String(b.city || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    message: String(b.message || '').trim().slice(0, 500),
  };
  const form = formConfig();
  const F = form.fields;
  const fail = (error) => res.status(400).send(renderForm(p, { values, error, form, pickup: randomPickup() }));
  // Un champ masqué est ignoré même si quelqu'un l'envoie quand même.
  for (const k of ['instagram', 'phone', 'city', 'message']) if (F[k].mode === 'hidden') values[k] = '';

  const ig = handle(values.instagram);
  if (ig && !/^[A-Za-z0-9._]{1,30}$/.test(ig)) return fail('Ce nom Instagram n’a pas l’air valide.');
  const tel = phoneDigits(values.phone);
  if (values.phone && (tel.replace(/\D/g, '').length < 7 || tel.replace(/\D/g, '').length > 15))
    return fail('Ce numéro de téléphone n’a pas l’air valide.');
  if (F.instagram.mode === 'required' && !ig) return fail('Laisse ton Instagram, sinon on ne pourra pas te répondre 😉');
  if (F.phone.mode === 'required' && !tel) return fail('Laisse ton numéro, sinon on ne pourra pas te répondre 😉');
  if (!ig && !tel) {
    const both = F.instagram.mode !== 'hidden' && F.phone.mode !== 'hidden';
    return fail(both ? 'Laisse au moins ton Instagram ou ton numéro, sinon on ne pourra pas te répondre 😉'
      : `Laisse ton ${F.instagram.mode !== 'hidden' ? 'Instagram' : 'numéro'}, sinon on ne pourra pas te répondre 😉`);
  }
  if (F.city.mode === 'required' && values.city.length < 2)
    return fail('Dis-nous dans quelle ville tu habites (pas de relation à distance 😉).');
  if (F.message.mode === 'required' && values.message.length < 2)
    return fail(`Écris un petit message pour convaincre ${p.name} 😏`);

  const v = visitorId(req);
  if (store.recentLeadsFrom(v, 10 * 60e3) >= 3) return fail('Wow, motivé! Attends quelques minutes avant de renvoyer un message.');

  store.addLead({
    wearerId: p.id,
    sessionId: store.activeSession()?.id || null,
    instagram: ig,
    phone: tel,
    phoneRaw: values.phone,
    city: values.city,
    message: values.message,
    v,
  });
  res.redirect(303, `/merci?w=${encodeURIComponent(p.id)}`);
});

app.get('/merci', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.send(renderThanks(store.get(String(req.query.w || '')) || null));
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
    sessions: store.data.sessions.map((x) => {
      const st = store.stats(x.startedAt, x.endedAt || Date.now());
      return { ...x, total: st.total, unique: st.unique };
    }),
    activeSessionId: store.activeSession()?.id || null,
    settings: { ...store.data.settings, form: formConfig() },
    formDefaults: DEFAULT_FORM,
    unreadLeads: store.data.leads.filter((l) => !l.read).length,
    leadCounts: store.data.leads.reduce((acc, l) => ((acc[l.wearerId] = (acc[l.wearerId] || 0) + 1), acc), {}),
    pickup: pickup.info(),
    publicUrl: publicUrl(req),
  });
});

// Stats : ?session=<id>  ou  ?from=<ms>&to=<ms>
app.get('/api/stats', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.query.session) {
    const x = store.getSession(String(req.query.session));
    if (!x) return res.sendStatus(404);
    return res.json({ session: x, ...store.stats(x.startedAt, x.endedAt || Date.now()) });
  }
  const from = Number(req.query.from) || Date.now() - 864e5;
  const to = Number(req.query.to) || Date.now();
  res.json({ session: null, ...store.stats(from, to) });
});

app.get('/api/leads', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(store.data.leads.map(({ v, ...l }) => l));
});

app.post('/api/leads/read', requireAuth, (req, res) => {
  store.markLeadsRead(Array.isArray(req.body?.ids) ? req.body.ids : null);
  res.json({ ok: true });
});

app.delete('/api/leads/:id', requireAuth, (req, res) => {
  store.deleteLead(req.params.id) ? res.json({ ok: true }) : res.sendStatus(404);
});

app.put('/api/settings', requireAuth, wrap((req, res) => {
  store.setSettings(req.body || {});
  res.json({ ...store.data.settings, form: formConfig() });
}));

app.get('/api/pickup', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const lang = req.query.lang === 'en' ? 'en' : 'fr';
  res.json({ line: pickup.random(lang), ...pickup.info() });
});

app.post('/api/pickup/refresh', requireAuth, async (req, res) => {
  await pickup.refresh();
  res.json(pickup.info());
});

app.post('/api/sessions', requireAuth, (req, res) => res.json(store.startSession(req.body?.name)));

app.post('/api/sessions/:id/end', requireAuth, (req, res) => {
  const x = store.endSession(req.params.id);
  x ? res.json(x) : res.sendStatus(404);
});

app.put('/api/sessions/:id', requireAuth, (req, res) => {
  const x = store.renameSession(req.params.id, req.body?.name);
  x ? res.json(x) : res.sendStatus(404);
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  store.deleteSession(req.params.id) ? res.json({ ok: true }) : res.sendStatus(404);
});


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
