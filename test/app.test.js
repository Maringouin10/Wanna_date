'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { linksFor, handle } = require('../lib/links');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dir, cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  proc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'secret', PICKUP_FETCH: 'off' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/healthz'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error('serveur pas démarré');
});
after(() => { proc.kill(); fs.rmSync(dir, { recursive: true, force: true }); });

const req = (method, url, body) =>
  fetch(BASE + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });

test('liens normalisés', () => {
  const l = linksFor({ instagram: 'https://www.instagram.com/jake.ski/', phone: '(514) 555-1234', snapchat: '@jk', tiktok: '', link: 'spotify.com/x' });
  assert.equal(handle('@tom.ski'), 'tom.ski');
  assert.equal(l.instagram.url, 'https://instagram.com/jake.ski');
  assert.equal(l.phone.call, 'tel:+15145551234');
  assert.equal(l.snapchat.url, 'https://www.snapchat.com/add/jk');
  assert.equal(l.link.url, 'https://spotify.com/x');
  assert.equal(l.tiktok, undefined);
  assert.equal(linksFor({ link: 'javascript:alert(1)' }).link, undefined);
});

test('admin protégé', async () => {
  assert.equal((await req('GET', '/api/state')).status, 401);
  assert.equal((await req('POST', '/api/login', { password: 'nope' })).status, 401);
  const r = await req('POST', '/api/login', { password: 'secret' });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
  assert.equal((await req('GET', '/api/state')).status, 200);
});

const form = (body, ua = 'Test') =>
  fetch(BASE + '/envoyer', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'user-agent': ua },
    body: new URLSearchParams(body),
  });

test('banque + bascule du porteur', async () => {
  let r = await req('GET', '/');
  assert.match(await r.text(), /en transit/);

  const jake = await (await req('POST', '/api/people', { name: 'Jake', tagline: '<b>salut</b>' })).json();
  const marin = await (await req('POST', '/api/people', { name: 'Marin' })).json();
  assert.equal((await req('POST', '/api/people', { name: '  ' })).status, 400);

  await req('POST', '/api/active', { id: jake.id });
  let html = await (await req('GET', '/')).text();
  assert.match(html, /Jake/);
  assert.match(html, /action="\/envoyer#f"/);
  assert.match(html, /&lt;b&gt;salut/); // échappé

  await req('POST', '/api/active', { id: marin.id });
  assert.match(await (await req('GET', '/')).text(), /Convaincs Marin/);

  const st = await (await req('GET', '/api/state')).json();
  assert.equal(st.activeId, marin.id);
  assert.equal(st.history.length, 2);
  assert.ok(st.scans.byPerson[jake.id] >= 1);

  await req('DELETE', `/api/people/${marin.id}`);
  assert.equal((await (await req('GET', '/api/state')).json()).activeId, null);
});

test('formulaire : les gens qui scannent laissent leurs infos', async () => {
  const lea = await (await req('POST', '/api/people', { name: 'Léa' })).json();
  await req('POST', '/api/active', { id: lea.id });

  // Ni Insta ni numéro
  let r = await form({ w: lea.id, age: '25', message: 'Salut' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /au moins ton Instagram ou ton numéro/);
  // Mineur refusé
  r = await form({ w: lea.id, instagram: 'kid', age: '16', message: 'Salut' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /18 ans et plus/);
  // Message requis, valeurs conservées et échappées
  r = await form({ w: lea.id, instagram: '@tom"x', age: '25', message: '' });
  assert.equal(r.status, 400);
  // Valide
  // Ville obligatoire
  r = await form({ w: lea.id, instagram: 'tom.ski', age: '27', message: 'Salut' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /ville/);
  r = await form({ w: lea.id, instagram: 'https://instagram.com/tom.ski/', phone: '(514) 555-1234', age: '27', city: '  Saint-Sauveur ', message: 'Je skie mieux que toi <3' });
  assert.equal(r.status, 303);
  assert.match(r.headers.get('location'), /^\/merci/);
  assert.match(await (await fetch(BASE + r.headers.get('location'))).text(), /C’est envoyé/);
  // Robot (champ piège) : ignoré silencieusement
  r = await form({ w: lea.id, instagram: 'bot', age: '30', message: 'spam', website: 'x' });
  assert.equal(r.status, 303);

  let state = await (await req('GET', '/api/state')).json();
  assert.equal(state.unreadLeads, 1);
  const leads = await (await req('GET', '/api/leads')).json();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].instagram, 'tom.ski');
  assert.equal(leads[0].phone, '+15145551234');
  assert.equal(leads[0].age, 27);
  assert.equal(leads[0].city, 'Saint-Sauveur');
  assert.equal(leads[0].wearerId, lea.id);
  assert.equal(leads[0].v, undefined); // l'empreinte du visiteur n'est pas exposée

  // Anti-spam : 3 messages max par 10 min
  for (let i = 0; i < 2; i++) await form({ w: lea.id, instagram: 'tom.ski', age: '27', city: 'Laval', message: 'encore ' + i });
  r = await form({ w: lea.id, instagram: 'tom.ski', age: '27', city: 'Laval', message: 'encore' });
  assert.match(await r.text(), /Attends quelques minutes/);
  assert.equal(r.status, 400);

  await req('POST', '/api/leads/read', {});
  assert.equal((await (await req('GET', '/api/state')).json()).unreadLeads, 0);
  assert.equal((await req('DELETE', `/api/leads/${leads[0].id}`)).status, 200);
  const st = await (await req('GET', '/api/stats?from=0')).json();
  assert.equal(st.leads, 2);
  assert.equal(st.leadsByPerson[lea.id], 2);
});

test('page scanneur sans pied de page + robots ignorés', async () => {
  const jake = await (await req('POST', '/api/people', { name: 'Zed' })).json();
  await req('POST', '/api/active', { id: jake.id });
  const before = (await (await req('GET', '/api/state')).json()).scans.total;
  const html = await (await req('GET', '/')).text();
  assert.doesNotMatch(html, /change de propriétaire|Porté par/);
  await fetch(BASE + '/', { headers: { 'user-agent': 'facebookexternalhit/1.1' } });
  assert.equal((await (await req('GET', '/api/state')).json()).scans.total, before + 1);
});

test('sessions de ski + stats', async () => {
  const s1 = await (await req('POST', '/api/sessions', { name: 'Tremblant' })).json();
  assert.equal(s1.endedAt, null);
  await fetch(BASE + '/', { headers: { 'user-agent': 'A' } });
  await fetch(BASE + '/', { headers: { 'user-agent': 'A' } });
  await fetch(BASE + '/', { headers: { 'user-agent': 'B' } });
  let st = await (await req('GET', `/api/stats?session=${s1.id}`)).json();
  assert.equal(st.total, 3);
  assert.equal(st.unique, 2);
  assert.equal(st.times.length, 3);

  // Démarrer une nouvelle session termine l'ancienne.
  const s2 = await (await req('POST', '/api/sessions', {})).json();
  const state = await (await req('GET', '/api/state')).json();
  assert.equal(state.activeSessionId, s2.id);
  assert.ok(state.sessions.find((x) => x.id === s1.id).endedAt);
  assert.equal(state.sessions.find((x) => x.id === s1.id).total, 3);

  await req('POST', `/api/sessions/${s2.id}/end`);
  assert.equal((await (await req('GET', '/api/state')).json()).activeSessionId, null);
  await req('PUT', `/api/sessions/${s1.id}`, { name: 'Mont-Tremblant' });
  st = await (await req('GET', `/api/stats?session=${s1.id}`)).json();
  assert.equal(st.session.name, 'Mont-Tremblant');
  assert.equal((await req('DELETE', `/api/sessions/${s2.id}`)).status, 200);
  assert.equal((await req('GET', `/api/stats?session=${s2.id}`)).status, 404);
});

test('pickup line activable depuis admin', async () => {
  const z = await (await req('POST', '/api/people', { name: 'Rizz', instagram: 'rizz' })).json();
  await req('POST', '/api/active', { id: z.id });
  assert.doesNotMatch(await (await req('GET', '/')).text(), /class="rizz"/);
  const st = await (await req('PUT', '/api/settings', { pickup: true, pickupLang: 'fr' })).json();
  assert.equal(st.pickup, true);
  const html = await (await req('GET', '/')).text();
  assert.match(html, /class="rizz"/);
  const before = (await (await req('GET', '/api/state')).json()).scans.total;
  await req('GET', '/?encore'); // « une autre » ne compte pas comme un scan
  assert.equal((await (await req('GET', '/api/state')).json()).scans.total, before);
  assert.ok((await (await req('GET', '/api/pickup?lang=fr')).json()).line.length > 10);
  await req('PUT', '/api/settings', { pickup: false });
});

test('formulaire configurable : âge minimum et champs', async () => {
  const ana = await (await req('POST', '/api/people', { name: 'Ana' })).json();
  await req('POST', '/api/active', { id: ana.id });

  // Âge minimum sous 18 refusé, configuration sans moyen de contact refusée
  assert.equal((await req('PUT', '/api/settings', { form: { minAge: 16 } })).status, 400);
  assert.equal((await req('PUT', '/api/settings', { form: { fields: { instagram: { mode: 'hidden' }, phone: { mode: 'hidden' } } } })).status, 400);

  const r0 = await req('PUT', '/api/settings', {
    form: {
      minAge: 21,
      fields: {
        instagram: { mode: 'required', label: 'Ton insta pour {nom}' },
        phone: { mode: 'hidden' },
        city: { mode: 'optional' },
        message: { mode: 'hidden' },
        age: { mode: 'hidden' }, // l'âge reste toujours obligatoire
      },
    },
  });
  assert.equal(r0.status, 200);
  const cfg = (await r0.json()).form;
  assert.equal(cfg.minAge, 21);
  assert.equal(cfg.fields.age.mode, 'required');

  const html = await (await req('GET', '/?preview')).text();
  assert.match(html, /Ton insta pour Ana/);
  assert.doesNotMatch(html, /name="phone"/);
  assert.doesNotMatch(html, /name="message"/);
  assert.match(html, /21 ans et plus/);

  let r = await form({ w: ana.id, instagram: 'joe', age: '19' }, 'UA-cfg');
  assert.match(await r.text(), /21 ans et plus/);
  r = await form({ w: ana.id, phone: '5145550000', age: '25' }, 'UA-cfg');
  assert.match(await r.text(), /Laisse ton Instagram/);
  r = await form({ w: ana.id, instagram: 'joe', age: '25', message: 'ignoré' }, 'UA-cfg'); // ville optionnelle, message masqué
  assert.equal(r.status, 303);
  const lead = (await (await req('GET', '/api/leads')).json())[0];
  assert.equal(lead.instagram, 'joe');
  assert.equal(lead.message, '');

  // Retour aux valeurs par défaut
  const defaults = (await (await req('GET', '/api/state')).json()).formDefaults;
  await req('PUT', '/api/settings', { form: defaults });
  assert.match(await (await req('GET', '/?preview')).text(), /18 ans et plus/);
});

test('QR code', async () => {
  const r = await req('GET', '/api/qr.svg');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<svg/);
  assert.equal((await req('GET', '/api/qr.png')).headers.get('content-type'), 'image/png');
});
