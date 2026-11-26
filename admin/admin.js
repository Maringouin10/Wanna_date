'use strict';

const $ = (s) => document.querySelector(s);
let state = { people: [], activeId: null, history: [], scans: { total: 0, byPerson: {} }, publicUrl: '' };
let editing = null; // personne en cours d'édition (null = nouvelle)
let pendingPhoto; // undefined = inchangée, null = retirée, string = nouvelle (data URL)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && url !== '/api/login') {
    showLogin();
    throw new Error('Non connecté');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function avatarHtml(p, cls = 'avatar') {
  if (p && p.photo) return `<div class="${cls}" style="background-image:url('/photo/${esc(p.id)}?v=${p.photo}')"></div>`;
  return `<div class="${cls}">${esc(((p && p.name) || '?')[0].toUpperCase())}</div>`;
}

const fmt = (ts) =>
  new Date(ts).toLocaleString('fr-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nameOf = (id) => (state.people.find((p) => p.id === id) || {}).name || 'Personne supprimée';

function nets(p) {
  return [p.instagram && 'IG', p.phone && '📱', p.snapchat && 'Snap', p.tiktok && 'TikTok', p.link && '🔗']
    .filter(Boolean)
    .join(' · ');
}

function render() {
  const cur = state.people.find((p) => p.id === state.activeId);
  const since = cur && state.history.find((h) => h.personId === cur.id);
  $('#current').innerHTML = cur
    ? `${avatarHtml(cur)}<div class="who"><div class="lbl">Le chandail est sur</div><div class="nm">${esc(cur.name)}</div>
       <div class="meta">${since ? 'depuis ' + fmt(since.at) + ' · ' : ''}${state.scans.byPerson[cur.id] || 0} scans</div></div>`
    : `<div class="avatar">?</div><div class="who"><div class="lbl">Le chandail est sur</div><div class="nm">Personne</div>
       <div class="meta">Tape quelqu’un ci-dessous</div></div>`;

  $('#grid').innerHTML =
    state.people
      .map(
        (p) => `<div class="person ${p.id === state.activeId ? 'on' : ''}" data-id="${esc(p.id)}">
          <button class="edit" data-edit="${esc(p.id)}" aria-label="Modifier">✎</button>
          ${avatarHtml(p)}<div class="nm">${esc(p.name)}</div><div class="nets">${esc(nets(p)) || 'aucun réseau'}</div></div>`
      )
      .join('') + `<div class="person add" id="addBtn"><div class="plus">＋</div><div>Ajouter</div></div>`;

  // Hall of shame : combien de fois chacun a hérité du chandail
  const counts = {};
  for (const h of state.history) if (h.personId) counts[h.personId] = (counts[h.personId] || 0) + 1;
  const board = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#leaderboard').innerHTML = board.length
    ? board
        .map(
          ([id, n], i) =>
            `<div class="it"><span>${['🥇', '🥈', '🥉'][i] || '·'} ${esc(nameOf(id))}</span><span>${n} défaite${n > 1 ? 's' : ''} · ${state.scans.byPerson[id] || 0} scans</span></div>`
        )
        .join('')
    : '<div class="empty">Personne n’a encore perdu 😇</div>';

  $('#history').innerHTML = state.history.length
    ? state.history
        .slice(0, 15)
        .map((h) => `<div class="it"><span>${h.personId ? '👕 ' + esc(nameOf(h.personId)) : '— personne'}</span><span>${fmt(h.at)}</span></div>`)
        .join('')
    : '<div class="empty">Aucun changement pour l’instant</div>';

  $('#qrUrl').textContent = `${state.publicUrl}/ · ${state.scans.total} scans au total`;
}

async function refresh() {
  state = await api('GET', '/api/state');
  render();
}

async function setActive(id) {
  if (id === state.activeId) return;
  const prev = state.activeId;
  state.activeId = id; // optimiste
  state.history.unshift({ personId: id, at: Date.now() });
  render();
  if (navigator.vibrate) navigator.vibrate(30);
  try {
    await api('POST', '/api/active', { id });
    toast(id ? `👕 C’est ${nameOf(id)} qui l’a !` : 'Plus personne ne l’a');
    refresh();
  } catch (e) {
    state.activeId = prev;
    refresh();
    toast('Oups : ' + e.message);
  }
}

// ---------- Fiche ----------

function openEditor(p) {
  editing = p || null;
  pendingPhoto = undefined;
  const f = $('#editForm');
  f.reset();
  for (const k of ['name', 'tagline', 'instagram', 'phone', 'snapchat', 'tiktok', 'link', 'linkLabel', 'redirect'])
    f.elements[k].value = (p && p[k]) || '';
  $('#editTitle').textContent = p ? `Modifier ${p.name}` : 'Nouvelle personne';
  $('#editDelete').hidden = !p;
  $('#editErr').textContent = '';
  updatePhotoPreview();
  $('#editor').showModal();
}

function updatePhotoPreview() {
  const el = $('#photoPreview');
  const has = pendingPhoto ? true : pendingPhoto === null ? false : !!(editing && editing.photo);
  if (pendingPhoto) el.style.backgroundImage = `url('${pendingPhoto}')`;
  else if (has) el.style.backgroundImage = `url('/photo/${editing.id}?v=${editing.photo}')`;
  else el.style.backgroundImage = '';
  el.textContent = has ? '' : '📷';
  $('#photoRemove').hidden = !has;
}

// Redimensionne côté client (carré 512px, JPEG) : photo légère, aucune lib serveur.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const size = 512;
      const s = Math.min(img.width, img.height);
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

$('#photoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    pendingPhoto = await resizeImage(file);
    updatePhotoPreview();
  } catch (err) {
    $('#editErr').textContent = err.message;
  }
  e.target.value = '';
});

$('#photoRemove').addEventListener('click', () => {
  pendingPhoto = null;
  updatePhotoPreview();
});

$('#editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = Object.fromEntries(new FormData(e.target));
  if (pendingPhoto !== undefined) body.photo = pendingPhoto;
  $('#editSave').disabled = true;
  try {
    if (editing) await api('PUT', `/api/people/${editing.id}`, body);
    else await api('POST', '/api/people', body);
    $('#editor').close();
    toast('Enregistré ✅');
    refresh();
  } catch (err) {
    $('#editErr').textContent = err.message;
  } finally {
    $('#editSave').disabled = false;
  }
});

$('#editCancel').addEventListener('click', () => $('#editor').close());

$('#editDelete').addEventListener('click', async () => {
  if (!editing || !confirm(`Supprimer ${editing.name} de la banque ?`)) return;
  try {
    await api('DELETE', `/api/people/${editing.id}`);
    $('#editor').close();
    toast('Supprimé');
    refresh();
  } catch (err) {
    $('#editErr').textContent = err.message;
  }
});

// ---------- Grille ----------

$('#grid').addEventListener('click', (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) return openEditor(state.people.find((p) => p.id === edit.dataset.edit));
  if (e.target.closest('#addBtn')) return openEditor(null);
  const card = e.target.closest('.person[data-id]');
  if (card) setActive(card.dataset.id);
});

// ---------- Connexion ----------

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  const v = Date.now();
  $('#qrImg').src = `/api/qr.svg?v=${v}`;
  $('#qrSvg').href = '/api/qr.svg';
  $('#qrPng').href = '/api/qr.png';
  await refresh();
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#loginErr').textContent = '';
  try {
    await api('POST', '/api/login', { password: e.target.password.value });
    e.target.reset();
    showApp();
  } catch (err) {
    $('#loginErr').textContent = err.message;
  }
});

$('#logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  showLogin();
});

// Rafraîchir quand on revient dans l'app (PWA en arrière-plan sur l'iPhone)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#app').hidden) refresh().catch(() => {});
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});

fetch('/api/state', { credentials: 'same-origin' })
  .then((r) => (r.ok ? showApp() : showLogin()))
  .catch(() => showLogin());
