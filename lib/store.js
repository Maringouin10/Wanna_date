'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FIELDS = ['name', 'tagline', 'instagram', 'phone', 'snapchat', 'tiktok', 'link', 'linkLabel', 'redirect'];
const REDIRECTS = ['', 'instagram', 'tiktok', 'snapchat', 'link'];
const MAX_HISTORY = 200;

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
    const empty = { people: [], activeId: null, history: [], scans: { total: 0, byPerson: {} } };
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

  recordScan() {
    const id = this.data.activeId;
    this.data.scans.total++;
    if (id) this.data.scans.byPerson[id] = (this.data.scans.byPerson[id] || 0) + 1;
    // Écriture différée : on ne réécrit pas le fichier à chaque scan.
    clearTimeout(this._scanTimer);
    this._scanTimer = setTimeout(() => this.save(), 2000);
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
