'use strict';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{--pink:#ff2e74;--orange:#ff8a3d;--bg:#0f0a1e;--card:#1c1433;--txt:#fff;--mut:#c4bae6;--red:#ff6b6b}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;background:var(--bg)}
body{min-height:100vh;color:var(--txt);
 font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
 padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 110px);
 background:radial-gradient(120% 60% at 15% 0%,#3a1556 0,transparent 60%),radial-gradient(100% 50% at 100% 100%,#4b0f2e 0,transparent 60%),var(--bg)}
.wrap{width:100%;max-width:440px;margin:0 auto}
.logo{font-size:clamp(28px,8vw,36px);font-weight:900;letter-spacing:-1px;line-height:1;text-align:center;
 background:linear-gradient(90deg,var(--pink),var(--orange));-webkit-background-clip:text;background-clip:text;color:transparent}
.logo span{display:inline-block;animation:beat 1.4s infinite;color:var(--orange);-webkit-text-fill-color:var(--orange)}
@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 0 20px}
.avatar{width:clamp(96px,28vw,132px);aspect-ratio:1;border-radius:50%;object-fit:cover;border:4px solid var(--pink);
 box-shadow:0 0 0 8px #ff2e7418,0 0 48px #ff2e7466;margin-bottom:12px;background:var(--card)}
.initial{display:flex;align-items:center;justify-content:center;font-size:clamp(42px,12vw,56px);font-weight:800;color:var(--pink)}
h1{font-size:clamp(26px,8vw,34px);font-weight:800;line-height:1.1;margin-bottom:6px;word-break:break-word}
.tag{color:var(--mut);font-size:16px;max-width:330px;white-space:pre-line}
.empty{color:var(--mut);font-size:18px;line-height:1.5;text-align:center}
.rizz{display:block;margin-top:14px;max-width:360px;padding:12px 16px;border-radius:16px;background:#ffffff0d;border:1px dashed #ff2e7466;color:var(--txt);text-decoration:none;font-size:15px;font-weight:600;line-height:1.35;animation:pop .5s ease-out}
.rizz q{quotes:'« ' ' »'}.rizz small{display:block;margin-top:6px;color:var(--mut);font-size:12px;font-weight:600}
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}

form{background:var(--card);border:1px solid #ffffff1a;border-radius:22px;padding:18px;display:flex;flex-direction:column;gap:14px}
form h2{font-size:20px;font-weight:800;text-align:center}
form .sub{color:var(--mut);font-size:14px;text-align:center;margin-top:-8px}
label{display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:700;color:var(--mut)}
input,textarea{font:inherit;font-size:16px;color:var(--txt);background:var(--bg);border:1px solid #ffffff26;border-radius:14px;padding:14px;width:100%;-webkit-appearance:none;appearance:none}
input:focus,textarea:focus{outline:2px solid var(--pink);border-color:transparent}
textarea{resize:vertical;min-height:96px}
.at{position:relative}.at input{padding-left:34px}.at::before{content:"@";position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--mut);font-weight:700}
.or{display:flex;align-items:center;gap:10px;color:var(--mut);font-size:13px;font-weight:700;margin:-4px 0}
.or::before,.or::after{content:"";flex:1;height:1px;background:#ffffff1f}
.duo{display:grid;grid-template-columns:96px 1fr;gap:12px}.duo.solo{grid-template-columns:120px}
label small{font-weight:600;opacity:.7}
.hp{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
button{font:inherit;font-size:18px;font-weight:800;color:#fff;border:0;border-radius:18px;min-height:58px;cursor:pointer;
 background:linear-gradient(90deg,var(--pink),var(--orange));box-shadow:0 8px 24px #ff2e7444;transition:transform .1s}
button:active{transform:scale(.97)}
.err{background:#ff6b6b1f;border:1px solid #ff6b6b66;color:#ffd0d0;border-radius:14px;padding:12px 14px;font-size:15px;font-weight:600}
.fine{color:#ffffff73;font-size:12px;text-align:center;line-height:1.4}
.count{align-self:flex-end;color:var(--mut);font-size:12px;margin-top:-10px}
.done{text-align:center;padding:30px 0}
.done .big{font-size:64px;margin-bottom:10px;animation:pop .6s ease-out}
.done h1{margin-bottom:10px}
.done p{color:var(--mut);font-size:17px;max-width:320px;margin:0 auto 22px}
.done a{color:var(--pink);font-weight:700;text-decoration:none}
@media (max-height:700px){.hero{padding:10px 0 14px}.avatar{width:80px;border-width:3px;margin-bottom:8px;box-shadow:0 0 0 6px #ff2e7418,0 0 32px #ff2e7466}.initial{font-size:36px}h1{font-size:26px}.tag{font-size:15px}}
`;

function avatar(p) {
  return p.photo
    ? `<img class="avatar" src="/photo/${esc(p.id)}?v=${p.photo}" alt="${esc(p.name)}">`
    : `<div class="avatar initial">${esc((p.name[0] || '?').toUpperCase())}</div>`;
}

// Page vue en scannant : le formulaire pour tenter sa chance avec le porteur du chandail.
function renderForm(p, opts = {}) {
  const v = opts.values || {};
  const form = opts.form;
  const F = form.fields;
  const name = (t) => esc(t).replace(/\{nom\}/g, esc(p.name));
  const on = (k) => F[k].mode !== 'hidden';
  const req = (k) => (F[k].mode === 'required' ? ' required' : '');
  const opt = (k) => (F[k].mode === 'optional' && !(k === 'instagram' || k === 'phone') ? ' <small>(optionnel)</small>' : '');
  const bothContacts = on('instagram') && on('phone');
  const eitherContact = bothContacts && F.instagram.mode === 'optional' && F.phone.mode === 'optional';

  const ig = on('instagram')
    ? `<label>${name(F.instagram.label)}<div class="at"><input name="instagram" value="${esc(v.instagram)}" placeholder="${name(F.instagram.placeholder)}" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="40"${req('instagram')}></div></label>`
    : '';
  const phone = on('phone')
    ? `<label>${name(F.phone.label)}<input name="phone" type="tel" inputmode="tel" value="${esc(v.phone)}" placeholder="${name(F.phone.placeholder)}" autocomplete="tel" maxlength="25"${req('phone')}></label>`
    : '';
  const age = `<label>${name(F.age.label)}<input name="age" type="number" inputmode="numeric" min="${form.minAge}" max="99" value="${esc(v.age)}" placeholder="${name(F.age.placeholder)}" required></label>`;
  const city = on('city')
    ? `<label>${name(F.city.label)}${opt('city')}<input name="city" value="${esc(v.city)}" placeholder="${name(F.city.placeholder)}" autocomplete="address-level2" maxlength="60"${req('city')}></label>`
    : '';
  const message = on('message')
    ? `<label>${name(F.message.label)}${opt('message')}<textarea name="message" maxlength="500" placeholder="${name(F.message.placeholder)}"${req('message')}>${esc(v.message)}</textarea></label>`
    : '';

  return layout(
    `${p.name} — Wanna date?`,
    `<section class="hero">${avatar(p)}
      <h1>${esc(p.name)}</h1>
      <p class="tag">${p.tagline ? esc(p.tagline) : 'Tu as scanné le bon chandail 😏'}</p>
      ${opts.pickup ? `<a class="rizz" href="/?encore">💬 <q>${esc(opts.pickup)}</q><small>↻ une autre</small></a>` : ''}</section>
    <form id="f" method="post" action="/envoyer#f" autocomplete="on">
      <h2>Tente ta chance 💌</h2>
      <p class="sub">Laisse tes infos, ${esc(p.name)} va peut-être te contacter.</p>
      ${opts.error ? `<div class="err" role="alert">${esc(opts.error)}</div>` : ''}
      <input type="hidden" name="w" value="${esc(p.id)}">
      <label class="hp" aria-hidden="true">Site web<input name="website" tabindex="-1" autocomplete="off"></label>
      ${ig}${eitherContact ? '<div class="or">ou</div>' : ''}${phone}
      ${city ? `<div class="duo">${age}${city}</div>` : `<div class="duo solo">${age}</div>`}
      ${message}
      <button type="submit">Envoyer 💌</button>
      <p class="fine">Réservé aux ${form.minAge} ans et plus. Tes infos sont transmises seulement à ${esc(p.name)} et ses amis du chandail, et effacées sur demande.</p>
    </form>`
  );
}

function renderThanks(p) {
  const name = p ? esc(p.name) : 'Le porteur du chandail';
  return layout(
    'Envoyé! — Wanna date?',
    `<section class="done"><div class="big">💌</div><h1>C’est envoyé!</h1>
      <p>${name} a reçu ton message. Croise les doigts 🤞</p>
      <a href="/?encore">‹ Retour</a></section>`
  );
}

function renderEmpty() {
  return layout(
    'Wanna date?',
    `<section class="hero"><p class="empty">Le chandail est en transit entre deux skieurs ⛷️<br>Réessaie dans un instant !</p></section>`
  );
}

function layout(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0f0a1e">
<meta name="format-detection" content="telephone=no">
<link rel="apple-touch-icon" href="/admin/icons/apple-touch-icon.png">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<link rel="icon" href="/admin/icons/icon.svg" type="image/svg+xml">
<style>${CSS}</style></head>
<body><main class="wrap"><div class="logo">Wanna date<span>?</span></div>${body}</main></body></html>`;
}

module.exports = { renderForm, renderThanks, renderEmpty };
