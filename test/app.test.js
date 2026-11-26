'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { linksFor } = require('../lib/links');

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
let proc, dir, cookie = '';

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-'));
  proc = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT, DATA_DIR: dir, ADMIN_PASSWORD: 'secret' },
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

test('banque + bascule du porteur', async () => {
  let r = await req('GET', '/');
  assert.match(await r.text(), /en transit/);

  const jake = await (await req('POST', '/api/people', { name: 'Jake', instagram: '@jake', phone: '514 555 1234', tagline: '<b>salut</b>' })).json();
  const marin = await (await req('POST', '/api/people', { name: 'Marin', instagram: 'marin', redirect: 'instagram' })).json();
  assert.equal((await req('POST', '/api/people', { name: '  ' })).status, 400);

  await req('POST', '/api/active', { id: jake.id });
  let html = await (await req('GET', '/')).text();
  assert.match(html, /Jake/);
  assert.match(html, /instagram\.com\/jake/);
  assert.match(html, /sms:\+15145551234/);
  assert.match(html, /&lt;b&gt;salut/); // échappé
  assert.match(await (await req('GET', '/vcard')).text(), /TEL;TYPE=CELL:\+15145551234/);

  await req('POST', '/api/active', { id: marin.id });
  r = await req('GET', '/');
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), 'https://instagram.com/marin');
  assert.match(await (await req('GET', '/?preview')).text(), /Marin/);

  const st = await (await req('GET', '/api/state')).json();
  assert.equal(st.activeId, marin.id);
  assert.equal(st.history.length, 2);
  assert.ok(st.scans.byPerson[jake.id] >= 1);

  await req('DELETE', `/api/people/${marin.id}`);
  assert.equal((await (await req('GET', '/api/state')).json()).activeId, null);
});

test('QR code', async () => {
  const r = await req('GET', '/api/qr.svg');
  assert.equal(r.status, 200);
  assert.match(await r.text(), /<svg/);
  assert.equal((await req('GET', '/api/qr.png')).headers.get('content-type'), 'image/png');
});
