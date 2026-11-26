'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let state = { people: [], activeId: null, history: [], scans: { total: 0, byPerson: {} }, sessions: [], activeSessionId: null, publicUrl: '' };
let tab = 'dash';
let openSessionId = null; // session affichée dans l'onglet Sessions
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

// ---------- Formats ----------

const pad = (n) => String(n).padStart(2, '0');
const hm = (ts) => { const d = new Date(ts); return `${d.getHours()}h${pad(d.getMinutes())}`; };
const day = (ts) => new Date(ts).toLocaleDateString('fr-CA', { weekday: 'short', day: 'numeric', month: 'short' });
const when = (ts) => `${day(ts)} · ${hm(ts)}`;
function dur(ms) {
  const m = Math.max(0, Math.round(ms / 60e3));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${pad(m % 60)}`;
  return `${Math.round(h / 24)} jours`;
}
function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return day(ts);
}
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;

const person = (id) => state.people.find((p) => p.id === id);
const nameOf = (id) => (person(id) || {}).name || 'Personne supprimée';

function avatarHtml(p, cls = 'avatar') {
  if (p && p.photo) return `<div class="${cls}" style="background-image:url('/photo/${esc(p.id)}?v=${p.photo}')"></div>`;
  return `<div class="${cls}">${esc(((p && p.name) || '?')[0].toUpperCase())}</div>`;
}


// ---------- Graphique : scans par tranche de temps ----------

function bucketize(times, from, to) {
  const span = to - from;
  const unit = span <= 3 * 3600e3 ? 'q' : span <= 36 * 3600e3 ? 'h' : 'd';
  const start = new Date(from);
  if (unit === 'q') start.setMinutes(Math.floor(start.getMinutes() / 15) * 15, 0, 0);
  else if (unit === 'h') start.setMinutes(0, 0, 0);
  else start.setHours(0, 0, 0, 0);
  const next = (t) => {
    const d = new Date(t);
    if (unit === 'q') d.setMinutes(d.getMinutes() + 15);
    else if (unit === 'h') d.setHours(d.getHours() + 1);
    else d.setDate(d.getDate() + 1);
    return d.getTime();
  };
  const out = [];
  let t = start.getTime();
  while (t < to || out.length < 4) {
    const e = next(t);
    out.push({ from: t, to: e, n: 0, future: t > Date.now() });
    t = e;
    if (out.length > 400) break;
  }
  let i = 0;
  for (const ts of [...times].sort((a, b) => a - b)) {
    while (i < out.length - 1 && ts >= out[i].to) i++;
    out[i].n++;
  }
  const label = (b) => (unit === 'd' ? new Date(b.from).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' }) : unit === 'h' ? `${new Date(b.from).getHours()}h` : hm(b.from));
  const range = (b) => (unit === 'd' ? day(b.from) : `${hm(b.from)} – ${hm(b.to)}`);
  return { unit, buckets: out.map((b) => ({ ...b, label: label(b), range: range(b) })) };
}

function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v);
}

function chartHtml(st) {
  if (!st.total) return '<div class="chart-empty">Aucun scan pour l’instant.<br>Le graphique se remplit à chaque scan du chandail 📈</div>';
  const { unit, buckets } = bucketize(st.times, st.from, st.to);
  const max = niceMax(Math.max(...buckets.map((b) => b.n)));
  const peak = buckets.reduce((a, b) => (b.n > a.n ? b : a));
  const every = Math.ceil(buckets.length / 7);
  const cols = buckets
    .map((b, i) => {
      const h = (b.n / max) * 100;
      return `<div class="col${b.future ? ' dim' : ''}" data-tip="${esc(b.range)}" data-n="${b.n}">
        ${b === peak ? `<span class="peak num" style="bottom:${h}%">${b.n}</span>` : ''}
        <div class="bar${b.n ? '' : ' zero'}" style="height:${h}%"></div></div>`;
    })
    .join('');
  const xs = buckets.map((b, i) => `<span>${i % every === 0 ? esc(b.label) : ''}</span>`).join('');
  const grid = [0.5, 1].map((f) => `<div class="grid-l" style="bottom:${f * 100}%"></div>`).join('');
  const title = { q: 'Scans par quart d’heure', h: 'Scans par heure', d: 'Scans par jour' }[unit];
  return `<div class="cardHead"><h2>${title}</h2></div>
    <div class="chart">
      <div class="yax num"><span>${max}</span><span>${(max / 2).toLocaleString("fr-CA")}</span><span>0</span></div>
      <div class="plot">${grid}${cols}</div>
      <div class="xax">${xs}</div>
    </div>`;
}

// Infobulle au survol (souris) ou au toucher (iPhone).
function showTip(e) {
  const col = e.target.closest?.('.chart .col') || document.elementFromPoint(e.clientX, e.clientY)?.closest('.chart .col');
  const tip = $('#tip');
  if (!col) return (tip.hidden = true);
  const r = col.getBoundingClientRect();
  const n = Number(col.dataset.n);
  tip.innerHTML = `${esc(col.dataset.tip)} · <b class="num">${n}</b> scan${n > 1 ? 's' : ''}`;
  tip.style.left = Math.min(Math.max(r.left + r.width / 2, 90), innerWidth - 90) + 'px';
  tip.style.top = r.top + r.height - (col.querySelector(".bar").offsetHeight || 0) - 16 + "px";
  tip.hidden = false;
}
document.addEventListener('pointermove', (e) => { if (e.target.closest?.('.plot')) showTip(e); else $('#tip').hidden = true; });
document.addEventListener('pointerdown', (e) => { if (e.target.closest?.('.plot')) showTip(e); else $('#tip').hidden = true; });
document.addEventListener('scroll', () => ($('#tip').hidden = true), true);

// ---------- Bloc de stats (dashboard + détail de session) ----------

function statsHtml(st) {
  const { buckets } = bucketize(st.times, st.from, st.to);
  const peak = buckets.reduce((a, b) => (b.n > a.n ? b : a), { n: 0 });
  const last = st.times.length ? Math.max(...st.times) : null;
  const hours = Math.max((st.to - st.from) / 3600e3, 1);

  const kpis = `<div class="kpis">
    <div class="kpi hero"><div class="k">Scans</div><div class="v num">${st.total}</div>
      <div class="s">${st.unique} visiteur${st.unique > 1 ? 's' : ''} unique${st.unique > 1 ? 's' : ''} · ${(st.total / hours).toFixed(1).replace('.', ',')} / heure</div></div>
    <div class="kpi"><div class="k">Visiteurs uniques</div><div class="v num">${st.unique}</div>
      <div class="s">${st.total ? Math.round((st.unique / st.total) * 100) + ' % des scans' : '—'}</div></div>
    <div class="kpi"><div class="k">Heure de pointe</div><div class="v num">${peak.n ? esc(peak.label) : '—'}</div>
      <div class="s">${peak.n ? plural(peak.n, 'scan') : 'pas encore'}</div></div>
    <div class="kpi"><div class="k">Dernier scan</div><div class="v" style="font-size:22px">${last ? hm(last) : '—'}</div>
      <div class="s">${last ? ago(last) : 'aucun'}</div></div>
    <div class="kpi"><div class="k">Messages reçus 💌</div><div class="v num">${st.leads}</div>
      <div class="s">${st.unique ? Math.round((st.leads / st.unique) * 100) + ' % des visiteurs' : '—'}</div></div>
  </div>`;

  const ranked = Object.entries(st.byPerson).sort((a, b) => b[1] - a[1]);
  const top = ranked[0]?.[1] || 1;
  const byPerson = ranked.length
    ? `<div class="card"><div class="cardHead"><h2>Scans par porteur</h2></div><div class="hbars">${ranked
        .map(([id, n]) => `<div class="hbar">${avatarHtml(person(id))}<div><div class="nm">${esc(nameOf(id))}</div>
          <div class="track"><div class="fill" style="width:${(n / top) * 100}%"></div></div></div><div class="n num">${n}<small style="display:block;color:var(--mut);font-size:11px;font-weight:600;text-align:right">${st.leadsByPerson[id] || 0} 💌</small></div></div>`)
        .join('')}</div></div>`
    : '';

  const handoffs = st.handoffs.length
    ? `<div class="card list">${st.handoffs
        .map((h) => `<div class="it"><span>${h.personId ? '👕 ' + esc(nameOf(h.personId)) : '— personne'}</span><span class="num">${when(h.at)}</span></div>`)
        .join('')}</div>`
    : '';

  return `${kpis}<div class="card">${chartHtml(st)}</div>${byPerson}${handoffs ? '<h2 class="sec">Passations</h2>' + handoffs : ''}`;
}

// ---------- Dashboard ----------

async function renderDash() {
  const live = state.sessions.find((s) => s.id === state.activeSessionId);
  $('#sessionCard').innerHTML = live
    ? `<div class="card session live"><span class="live-badge">SESSION EN COURS</span>
        <div class="nm">${esc(live.name)}</div>
        <div class="meta">Depuis ${hm(live.startedAt)} · ${dur(Date.now() - live.startedAt)}</div>
        <div class="row"><button data-open-session="${live.id}">Détails</button><button class="primary" id="endSession">Terminer la session</button></div></div>`
    : `<form class="card session stack" id="startForm">
        <div><h2>Aucune session en cours</h2><p class="hint" style="margin:4px 0 0">Démarre une session au début de la journée de ski pour suivre tous les scans.</p></div>
        <input name="name" placeholder="Nom (ex. Mont-Tremblant)" maxlength="60">
        <button class="primary" type="submit">⛷️ Démarrer une session de ski</button></form>`;

  const cur = person(state.activeId);
  const since = cur && state.history.find((h) => h.personId === cur.id);
  $('#wearerNow').innerHTML = cur
    ? `<div class="wearerNow">${avatarHtml(cur)}<div><div class="nm">${esc(cur.name)}</div>
        <div class="meta">${since ? 'depuis ' + when(since.at) : ''}</div></div></div>`
    : `<div class="wearerNow"><div class="avatar">?</div><div><div class="nm">Personne</div><div class="meta">Choisis qui l’a ci-dessous</div></div></div>`;
  $('#chips').innerHTML = state.people
    .map((p) => `<button class="chip${p.id === state.activeId ? ' on' : ''}" data-wear="${esc(p.id)}">${avatarHtml(p)}${esc(p.name)}</button>`)
    .join('') || '<button class="chip" data-goto="team">＋ Ajouter des gens</button>';

  renderPickup();
  $('#newLeads').innerHTML = state.unreadLeads
    ? `<div class="card newLeads" data-goto="inbox"><div class="ic">💌</div><div class="t">
        <b>${plural(state.unreadLeads, 'nouveau message')}</b><span>Quelqu’un veut tenter sa chance</span></div><span>›</span></div>`
    : '';

  const q = live ? `session=${live.id}` : `from=${new Date().setHours(0, 0, 0, 0)}`;
  try {
    const st = await api('GET', '/api/stats?' + q);
    $('#dashStats').innerHTML = `<h2 class="sec">${live ? 'Stats de la session' : 'Aujourd’hui'}</h2>` + statsHtml(st);
  } catch {}
}

// ---------- Messages reçus ----------

let leads = [];
let inboxFilter = 'all';

async function renderInbox() {
  try {
    leads = await api('GET', '/api/leads');
  } catch {
    return;
  }
  const counts = {};
  for (const l of leads) counts[l.wearerId] = (counts[l.wearerId] || 0) + 1;
  const ids = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  $('#inboxFilter').innerHTML = leads.length
    ? `<button class="chip${inboxFilter === 'all' ? ' on' : ''}" data-filter="all">Tous <span class="cnt">${leads.length}</span></button>` +
      ids.map((id) => `<button class="chip${inboxFilter === id ? ' on' : ''}" data-filter="${esc(id)}">${avatarHtml(person(id))}${esc(nameOf(id))} <span class="cnt">${counts[id]}</span></button>`).join('')
    : '';
  const shown = leads.filter((l) => inboxFilter === 'all' || l.wearerId === inboxFilter);
  $('#inbox').innerHTML = shown.length
    ? shown.map(leadHtml).join('')
    : '<div class="card list"><div class="empty">Aucun message pour l’instant. Va skier avec le chandail ⛷️</div></div>';

  // Ce qui est affiché est considéré comme lu (le surlignage reste jusqu'à la prochaine visite).
  const unread = shown.filter((l) => !l.read).map((l) => l.id);
  if (unread.length) {
    await api('POST', '/api/leads/read', { ids: unread }).catch(() => {});
    state.unreadLeads = Math.max(0, (state.unreadLeads || 0) - unread.length);
    $('#badge').hidden = !state.unreadLeads;
    $('#badge').textContent = state.unreadLeads;
  }
}

function leadHtml(l) {
  const p = person(l.wearerId);
  const acts = [];
  if (l.instagram) acts.push(`<a class="ig" href="https://instagram.com/${encodeURIComponent(l.instagram)}" target="_blank" rel="noopener">@${esc(l.instagram)}</a>`);
  if (l.phone) acts.push(`<a class="sms" href="sms:${esc(l.phone)}">💬 Texto</a><a href="tel:${esc(l.phone)}">📞 ${esc(l.phoneRaw || l.phone)}</a>`);
  return `<div class="card lead${l.read ? '' : ' new'}">
    <div class="lh">${avatarHtml(p)}<div class="who">Pour <b>${esc(nameOf(l.wearerId))}</b> · ${ago(l.at)}</div></div>
    ${l.age || l.city ? `<div class="tags">${l.age ? `<span>🎂 ${l.age} ans</span>` : ''}${l.city ? `<span>📍 ${esc(l.city)}</span>` : ''}</div>` : ''}
    <div class="msg">${esc(l.message)}</div>
    <div class="acts">${acts.join('')}<button class="del" data-del-lead="${esc(l.id)}" aria-label="Supprimer">🗑</button></div>
  </div>`;
}

// ---------- Pickup line ----------

let pickupPreview = null;

function renderPickup() {
  const st = state.settings || { pickup: false, pickupLang: 'fr' };
  const info = state.pickup || { fr: 0, en: 0 };
  const el = $('#pickupCard');
  el.className = 'card pickupCard' + (st.pickup ? '' : ' off');
  el.innerHTML = `<div class="toggleRow"><div class="t"><b>💬 Pickup line</b>
      <span>${st.pickup ? 'Affichée au hasard à chaque scan' : 'Désactivée'}</span></div>
      <button class="switch${st.pickup ? ' on' : ''}" id="pickupToggle" role="switch" aria-checked="${st.pickup}" aria-label="Pickup line"></button></div>
    <div class="seg">
      <button data-lang="fr" class="${st.pickupLang === 'fr' ? 'on' : ''}">🇫🇷 Français (${info.fr})</button>
      <button data-lang="en" class="${st.pickupLang === 'en' ? 'on' : ''}" ${info.en ? '' : 'disabled'}>🇺🇸 RizzAPI (${info.en || '…'})</button>
    </div>
    <div class="rizzPreview"><q>${esc(pickupPreview || '…')}</q><button id="pickupNext" aria-label="Une autre">↻</button></div>`;
  if (!pickupPreview) nextPickup();
}

async function nextPickup() {
  const lang = (state.settings || {}).pickupLang || 'fr';
  try {
    const r = await api('GET', `/api/pickup?lang=${lang}`);
    pickupPreview = r.line;
    const q = $('#pickupCard q');
    if (q) q.textContent = r.line;
  } catch {}
}

async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  renderPickup();
  $('#newLeads').innerHTML = state.unreadLeads
    ? `<div class="card newLeads" data-goto="inbox"><div class="ic">💌</div><div class="t">
        <b>${plural(state.unreadLeads, 'nouveau message')}</b><span>Quelqu’un veut tenter sa chance</span></div><span>›</span></div>`
    : '';
  try {
    state.settings = await api('PUT', '/api/settings', patch);
  } catch (e) {
    toast('Oups : ' + e.message);
    refresh();
  }
}

// ---------- Équipe ----------

function renderTeam() {
  $('#grid').innerHTML =
    state.people
      .map(
        (p) => `<div class="person ${p.id === state.activeId ? 'on' : ''}" data-wear="${esc(p.id)}">
          <button class="edit" data-edit="${esc(p.id)}" aria-label="Modifier">✎</button>
          ${avatarHtml(p)}<div class="nm">${esc(p.name)}</div><div class="nets">${plural((state.leadCounts || {})[p.id] || 0, 'message')} 💌</div></div>`
      )
      .join('') + `<div class="person add" id="addBtn"><div class="plus">＋</div><div>Ajouter</div></div>`;

  const counts = {};
  for (const h of state.history) if (h.personId) counts[h.personId] = (counts[h.personId] || 0) + 1;
  const board = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#leaderboard').innerHTML = board.length
    ? board
        .map(([id, n], i) => `<div class="it"><span>${['🥇', '🥈', '🥉'][i] || '·'} ${esc(nameOf(id))}</span>
          <span class="num">${plural(n, 'défaite')} · ${plural(state.scans.byPerson[id] || 0, 'scan')}</span></div>`)
        .join('')
    : '<div class="empty">Personne n’a encore perdu 😇</div>';
}

// ---------- Sessions ----------

function renderSessions() {
  $('#sessions').innerHTML = state.sessions.length
    ? state.sessions
        .map((s) => {
          const live = !s.endedAt;
          return `<div class="card sess" data-open-session="${s.id}">
            <div class="ic">${live ? '🔴' : '⛷️'}</div>
            <div class="bd"><div class="nm">${esc(s.name)}</div>
              <div class="meta">${day(s.startedAt)} · ${live ? 'en cours · ' + dur(Date.now() - s.startedAt) : dur(s.endedAt - s.startedAt)}</div></div>
            <div class="n num">${s.total}<small>scans</small></div></div>`;
        })
        .join('')
    : '<div class="card list"><div class="empty">Aucune session. Démarre-en une depuis le Dashboard ⛷️</div></div>';
  if (openSessionId) renderSessionDetail();
}

async function renderSessionDetail() {
  const el = $('#sessionDetail');
  try {
    const st = await api('GET', `/api/stats?session=${openSessionId}`);
    const s = st.session;
    el.innerHTML = `<button class="back" data-close-session>‹ Sessions</button>
      <div>${!s.endedAt ? '<span class="live-badge">EN COURS</span>' : ''}<h1>${esc(s.name)}</h1>
      <p class="hint" style="margin:2px 0 0">${when(s.startedAt)} → ${s.endedAt ? hm(s.endedAt) : 'maintenant'} · ${dur((s.endedAt || Date.now()) - s.startedAt)}</p></div>
      ${statsHtml(st)}
      <div class="row">${!s.endedAt ? '<button class="primary" id="endSession">Terminer</button>' : ''}<button id="renameSession">Renommer</button></div>
      <button class="ghost danger full" id="deleteSession">Supprimer la session</button>`;
    $('#sessionsList').hidden = true;
    el.hidden = false;
  } catch {
    openSessionId = null;
    closeSession();
  }
}

function closeSession() {
  openSessionId = null;
  $('#sessionDetail').hidden = true;
  $('#sessionsList').hidden = false;
}

// ---------- Plus ----------

function renderMore() {
  if (!$('#formSettings').contains(document.activeElement)) renderFormSettings();
  $('#history').innerHTML = state.history.length
    ? state.history
        .slice(0, 20)
        .map((h) => `<div class="it"><span>${h.personId ? '👕 ' + esc(nameOf(h.personId)) : '— personne'}</span><span class="num">${when(h.at)}</span></div>`)
        .join('')
    : '<div class="empty">Aucun changement pour l’instant</div>';
  $('#qrUrl').textContent = `${state.publicUrl}/ · ${plural(state.scans.total, 'scan')} au total`;
}

// ---------- Réglages du formulaire ----------

const FIELD_INFO = {
  instagram: ['📸 Instagram', 'Leur @'],
  phone: ['📱 Numéro', 'Pour texter ou appeler'],
  city: ['📍 Ville', 'Pas de relation à distance'],
  message: ['💬 Message', 'Pour convaincre'],
};
const MODE_LABELS = { hidden: 'Masqué', optional: 'Optionnel', required: 'Obligatoire' };
let formDraft = null;

function renderFormSettings() {
  if (!formDraft) formDraft = JSON.parse(JSON.stringify(state.settings.form));
  const f = formDraft;
  const rows = Object.keys(FIELD_INFO)
    .map((k) => {
      const c = f.fields[k];
      const [title, sub] = FIELD_INFO[k];
      const seg = `<div class="seg">${Object.keys(MODE_LABELS)
              .map((m) => `<button type="button" data-field="${k}" data-mode="${m}" class="${c.mode === m ? 'on' : ''}${m === 'required' ? ' req' : ''}">${MODE_LABELS[m]}</button>`)
              .join('')}</div>`;
      return `<div class="card fieldCfg${c.mode === 'hidden' ? ' hidden' : ''}">
        <div class="fh"><b>${title}</b><span>${sub}</span></div>${seg}
        <div class="texts">
          <label>Titre<input data-text="${k}" data-prop="label" value="${esc(c.label)}" maxlength="60"></label>
          <label>Exemple<input data-text="${k}" data-prop="placeholder" value="${esc(c.placeholder)}" maxlength="100"></label>
        </div></div>`;
    })
    .join('');
  $('#formSettings').innerHTML = `
    ${rows}
    <p class="hint" style="margin:0">Astuce : <b>{nom}</b> dans un titre est remplacé par le prénom de celui qui porte le chandail.
      Si Instagram et numéro sont tous les deux optionnels, il faut au moins l’un des deux.</p>
    <div class="formActions"><button type="button" class="ghost" id="formReset">Par défaut</button>
      <button type="submit" class="primary">Enregistrer</button></div>
    <a class="pill" style="text-align:center" href="/?preview" target="_blank" rel="noopener">Voir le formulaire ↗</a>`;
}

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.text) formDraft.fields[t.dataset.text][t.dataset.prop] = t.value;
});

document.addEventListener('click', (e) => {
  const mode = e.target.closest('[data-mode]');
  if (mode) {
    formDraft.fields[mode.dataset.field].mode = mode.dataset.mode;
    return renderFormSettings();
  }
  if (e.target.closest('#formReset')) {
    if (!confirm('Remettre le formulaire par défaut ? (pense à Enregistrer)')) return;
    formDraft = JSON.parse(JSON.stringify(state.formDefaults));
    return renderFormSettings();
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'formSettings') return;
  e.preventDefault();
  const btn = $('button[type=submit]', e.target);
  btn.disabled = true;
  try {
    state.settings = await api('PUT', '/api/settings', { form: formDraft });
    formDraft = null;
    renderFormSettings();
    toast('Formulaire enregistré ✅');
  } catch (err) {
    toast('⚠️ ' + err.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Navigation ----------

function render() {
  if (tab === 'dash') renderDash();
  if (tab === 'team') renderTeam();
  if (tab === 'inbox') renderInbox();
  const badge = $('#badge');
  badge.hidden = !state.unreadLeads;
  badge.textContent = state.unreadLeads > 99 ? '99+' : state.unreadLeads;
  if (tab === 'sessions') renderSessions();
  if (tab === 'more') renderMore();
}

async function refresh() {
  state = await api('GET', '/api/state');
  render();
}

function goto(t) {
  tab = t;
  for (const v of $$('.view')) v.hidden = v.id !== 'v-' + t;
  for (const b of $$('.tabbar button')) b.classList.toggle('on', b.dataset.tab === t);
  if (t !== 'sessions') closeSession();
  scrollTo(0, 0);
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
    toast(`👕 C’est ${nameOf(id)} qui l’a !`);
    refresh();
  } catch (e) {
    state.activeId = prev;
    refresh();
    toast('Oups : ' + e.message);
  }
}

document.addEventListener('click', async (e) => {
  const t = e.target;
  const tabBtn = t.closest('.tabbar button');
  if (tabBtn) return goto(tabBtn.dataset.tab);
  const go = t.closest('[data-goto]');
  if (go) return goto(go.dataset.goto);
  const edit = t.closest('[data-edit]');
  if (edit) return openEditor(person(edit.dataset.edit));
  if (t.closest('#addBtn')) return openEditor(null);
  const wear = t.closest('[data-wear]');
  if (wear) return setActive(wear.dataset.wear);

  const filter = t.closest('[data-filter]');
  if (filter) {
    inboxFilter = filter.dataset.filter;
    return renderInbox();
  }
  const delLead = t.closest('[data-del-lead]');
  if (delLead) {
    if (!confirm('Supprimer ce message ?')) return;
    await api('DELETE', `/api/leads/${delLead.dataset.delLead}`);
    toast('Message supprimé');
    return refresh();
  }
  if (t.closest('#readAll')) {
    await api('POST', '/api/leads/read', {});
    return refresh();
  }
  if (t.closest('#pickupToggle')) {
    const on = !state.settings.pickup;
    await saveSettings({ pickup: on });
    return toast(on ? '💬 Pickup lines activées' : 'Pickup lines désactivées');
  }
  if (t.closest('#pickupNext')) return nextPickup();
  const lang = t.closest('[data-lang]');
  if (lang) {
    pickupPreview = null;
    return saveSettings({ pickupLang: lang.dataset.lang });
  }

  const open = t.closest('[data-open-session]');
  if (open) {
    openSessionId = open.dataset.openSession;
    if (tab !== 'sessions') goto('sessions');
    else renderSessionDetail();
    return scrollTo(0, 0);
  }
  if (t.closest('[data-close-session]')) return closeSession(), renderSessions();

  if (t.closest('#endSession')) {
    const id = openSessionId || state.activeSessionId;
    if (!confirm('Terminer la session ? Les stats seront gardées.')) return;
    await api('POST', `/api/sessions/${id}/end`);
    toast('Session terminée 🏁');
    return refresh();
  }
  if (t.closest('#renameSession')) {
    const s = state.sessions.find((x) => x.id === openSessionId);
    const name = prompt('Nom de la session', s ? s.name : '');
    if (!name) return;
    await api('PUT', `/api/sessions/${openSessionId}`, { name });
    return refresh();
  }
  if (t.closest('#deleteSession')) {
    if (!confirm('Supprimer cette session ? (les scans eux-mêmes sont gardés)')) return;
    await api('DELETE', `/api/sessions/${openSessionId}`);
    closeSession();
    toast('Session supprimée');
    return refresh();
  }
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'startForm') return;
  e.preventDefault();
  const btn = $('button', e.target);
  btn.disabled = true;
  try {
    await api('POST', '/api/sessions', { name: e.target.name.value });
    toast('Session démarrée ⛷️ Bonne ski !');
    await refresh();
  } finally {
    btn.disabled = false;
  }
});

// ---------- Fiche personne ----------

function openEditor(p) {
  editing = p || null;
  pendingPhoto = undefined;
  const f = $('#editForm');
  f.reset();
  for (const k of ['name', 'tagline'])
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
  if (!editing || !confirm(`Supprimer ${editing.name} de la banque ? Ses messages reçus seront aussi effacés.`)) return;
  try {
    await api('DELETE', `/api/people/${editing.id}`);
    $('#editor').close();
    toast('Supprimé');
    refresh();
  } catch (err) {
    $('#editErr').textContent = err.message;
  }
});

// ---------- Connexion ----------

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#qrImg').src = `/api/qr.svg?v=${Date.now()}`;
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

// Données à jour quand on revient dans l'app, et en direct pendant une session.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && !$('#app').hidden) refresh().catch(() => {});
});
setInterval(() => {
  if (!document.hidden && !$('#app').hidden && (tab === 'dash' || tab === 'inbox' || openSessionId) && !$('#editor').open) refresh().catch(() => {});
}, 20000);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/admin/sw.js', { scope: '/admin/' }).catch(() => {});

fetch('/api/state', { credentials: 'same-origin' })
  .then((r) => (r.ok ? showApp() : showLogin()))
  .catch(() => showLogin());
