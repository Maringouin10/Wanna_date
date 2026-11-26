'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizeForm } = require('./fields');

const FIELDS = ['name', 'tagline', 'instagram', 'phone', 'snapchat', 'tiktok', 'link', 'linkLabel', 'redirect'];
const REDIRECTS = ['', 'instagram', 'tiktok', 'snapchat', 'link'];
const MAX_HISTORY = 500;
const MAX_SCANS = 50000;
const MAX_LEADS = 5000;

function clean(v, max = 200) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.photoDir = path.join(dir, 'photos');
    fs.mkdirSync(this.photoDir, { recursive: true });
    this.data = this.load();
  }

  load() {
    const empty = {
      people: [],
      activeId: null,
      history: [],
      scans: { total: 0, byPerson: {} },
      scanLog: [], // { at, p: porteur, v: visiteur (hash) }
      sessions: [], // { id, name, startedAt, endedAt }
      settings: { pickup: false, pickupLang: 'fr' },
      leads: [], // messages laissés par les gens qui scannent
    };
    try {
      return { ...empty, ...JSON.parse(fs.readFileSync(this.file, 'utf8')) };
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('db.json illisible, on repart à vide:', e.message);
      return empty;
    }
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  sanitize(input) {
    const p = {};
    for (const f of FIELDS) p[f] = clean(input[f], f === 'tagline' ? 280 : 200);
    if (!REDIRECTS.includes(p.redirect)) p.redirect = '';
    return p;
  }

  list() {
    return this.data.people;
  }

  get(id) {
    return this.data.people.find((p) => p.id === id) || null;
  }

  active() {
    return this.get(this.data.activeId);
  }

  create(input) {
    const p = { id: crypto.randomBytes(6).toString('hex'), ...this.sanitize(input), photo: false, createdAt: Date.now() };
    if (!p.name) throw new Error('Le nom est requis');
    this.data.people.push(p);
    if (input.photo) this.setPhoto(p, input.photo);
    this.save();
    return p;
  }

  update(id, input) {
    const p = this.get(id);
    if (!p) return null;
    Object.assign(p, this.sanitize({ ...p, ...input }));
    if (!p.name) throw new Error('Le nom est requis');
    if (input.photo === null) this.removePhoto(p);
    else if (input.photo) this.setPhoto(p, input.photo);
    this.save();
    return p;
  }

  remove(id) {
    const p = this.get(id);
    if (!p) return false;
    this.removePhoto(p);
    this.data.leads = this.data.leads.filter((l) => l.wearerId !== id);
    this.data.people = this.data.people.filter((x) => x.id !== id);
    if (this.data.activeId === id) this.data.activeId = null;
    this.save();
    return true;
  }

  setActive(id) {
    if (id !== null && !this.get(id)) return false;
    if (this.data.activeId === id) return true;
    this.data.activeId = id;
    this.data.history.unshift({ personId: id, at: Date.now() });
    this.data.history = this.data.history.slice(0, MAX_HISTORY);
    this.save();
    return true;
  }

  recordScan(visitor) {
    const id = this.data.activeId;
    this.data.scans.total++;
    if (id) this.data.scans.byPerson[id] = (this.data.scans.byPerson[id] || 0) + 1;
    this.data.scanLog.push({ at: Date.now(), p: id, v: visitor });
    if (this.data.scanLog.length > MAX_SCANS) this.data.scanLog.splice(0, this.data.scanLog.length - MAX_SCANS);
    // Écriture différée : on ne réécrit pas le fichier à chaque scan.
    clearTimeout(this._scanTimer);
    this._scanTimer = setTimeout(() => this.save(), 2000);
  }

  // ---------- Messages reçus ----------

  addLead(lead) {
    const l = { id: crypto.randomBytes(6).toString('hex'), at: Date.now(), read: false, ...lead };
    this.data.leads.unshift(l);
    this.data.leads = this.data.leads.slice(0, MAX_LEADS);
    this.save();
    return l;
  }

  markLeadsRead(ids) {
    const set = ids ? new Set(ids) : null;
    for (const l of this.data.leads) if (!set || set.has(l.id)) l.read = true;
    this.save();
  }

  deleteLead(id) {
    const n = this.data.leads.length;
    this.data.leads = this.data.leads.filter((l) => l.id !== id);
    if (n === this.data.leads.length) return false;
    this.save();
    return true;
  }

  recentLeadsFrom(visitor, ms) {
    const since = Date.now() - ms;
    return this.data.leads.filter((l) => l.v === visitor && l.at >= since).length;
  }

  setSettings(input) {
    const st = this.data.settings;
    if (typeof input.pickup === 'boolean') st.pickup = input.pickup;
    if (['fr', 'en'].includes(input.pickupLang)) st.pickupLang = input.pickupLang;
    if (input.form) st.form = normalizeForm(input.form, { strict: true });
    this.save();
    return st;
  }

  // ---------- Sessions de ski ----------

  activeSession() {
    return this.data.sessions.find((s) => !s.endedAt) || null;
  }

  getSession(id) {
    return this.data.sessions.find((s) => s.id === id) || null;
  }

  startSession(name) {
    const now = Date.now();
    const cur = this.activeSession();
    if (cur) cur.endedAt = now;
    const s = {
      id: crypto.randomBytes(5).toString('hex'),
      name: clean(name, 60) || `Ski du ${new Date(now).toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })}`,
      startedAt: now,
      endedAt: null,
    };
    this.data.sessions.unshift(s);
    this.save();
    return s;
  }

  endSession(id) {
    const s = this.getSession(id);
    if (!s) return null;
    if (!s.endedAt) s.endedAt = Date.now();
    this.save();
    return s;
  }

  renameSession(id, name) {
    const s = this.getSession(id);
    if (!s) return null;
    s.name = clean(name, 60) || s.name;
    this.save();
    return s;
  }

  deleteSession(id) {
    const before = this.data.sessions.length;
    this.data.sessions = this.data.sessions.filter((s) => s.id !== id);
    if (this.data.sessions.length === before) return false;
    this.save();
    return true;
  }

  // Statistiques sur une fenêtre de temps [from, to].
  stats(from, to = Date.now()) {
    const scans = this.data.scanLog.filter((s) => s.at >= from && s.at <= to);
    const visitors = new Set(scans.map((s) => s.v).filter(Boolean));
    const byPerson = {};
    for (const s of scans) if (s.p) byPerson[s.p] = (byPerson[s.p] || 0) + 1;
    const handoffs = this.data.history.filter((h) => h.at >= from && h.at <= to).reverse();
    const leads = this.data.leads.filter((l) => l.at >= from && l.at <= to);
    const leadsByPerson = {};
    for (const l of leads) leadsByPerson[l.wearerId] = (leadsByPerson[l.wearerId] || 0) + 1;
    return {
      from,
      to,
      total: scans.length,
      unique: visitors.size,
      byPerson,
      handoffs,
      leads: leads.length,
      leadsByPerson,
      leadTimes: leads.map((l) => l.at),
      times: scans.map((s) => s.at),
    };
  }

  photoPath(id) {
    return path.join(this.photoDir, `${id}.jpg`);
  }

  setPhoto(p, dataUrl) {
    const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
    if (!m) throw new Error('Photo invalide');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 1.5 * 1024 * 1024) throw new Error('Photo trop lourde');
    fs.writeFileSync(this.photoPath(p.id), buf);
    p.photo = Date.now(); // sert aussi de cache-buster
  }

  removePhoto(p) {
    fs.rmSync(this.photoPath(p.id), { force: true });
    p.photo = false;
  }
}

module.exports = { Store, REDIRECTS };
