'use strict';

const { linksFor } = require('./links');

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICONS = {
  instagram:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z"/></svg>',
  tiktok:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.6 6.7a4.8 4.8 0 0 1-3.8-4.2V2h-3.4v13.7a2.9 2.9 0 1 1-2-2.8V9.4a6.3 6.3 0 1 0 5.4 6.3V8.7a8.2 8.2 0 0 0 4.8 1.5V6.8z"/></svg>',
  snapchat:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.2 1.5c1 0 4.4.3 6 3.9.5 1.2.4 3.2.3 4.8v.2c.2.1.5.2.9.2.3 0 .7-.1 1-.3.2-.1.4-.1.5-.1.2 0 .4 0 .6.1.5.2.8.5.8.9 0 .5-.4.9-1.4 1.3l-.3.1c-.4.1-1 .3-1.2.7-.1.2-.1.5.1.8 0 0 1.6 3.6 5.1 4.2.3 0 .5.3.5.6 0 .1 0 .2-.1.3-.3.6-1.4 1.1-3.5 1.4-.1.1-.1.5-.2.8-.1.3-.3.6-.7.6-.2 0-.5 0-.8-.1-.4-.1-1-.2-1.7-.2-.4 0-.8 0-1.2.1-.8.1-1.4.6-2.1 1.1-1 .7-2.1 1.5-3.8 1.5h-.3c-1.7 0-2.8-.8-3.8-1.5-.7-.5-1.4-1-2.1-1.1-.4-.1-.8-.1-1.2-.1-.7 0-1.3.1-1.7.2-.3.1-.6.1-.8.1-.4 0-.6-.3-.7-.6-.1-.3-.1-.6-.2-.8-2-.3-3.2-.8-3.5-1.4 0-.1-.1-.2-.1-.3 0-.3.2-.6.5-.6 3.5-.6 5.1-4.2 5.1-4.2.2-.3.2-.6.1-.8-.2-.4-.8-.6-1.2-.7l-.3-.1C1.2 12 .8 11.6.8 11.2c0-.4.3-.7.8-.9.2-.1.4-.1.6-.1.1 0 .3 0 .5.1.3.2.7.3 1 .3.4 0 .7-.1.8-.2v-.2c-.1-1.6-.2-3.6.3-4.8C6.5 1.8 9.9 1.5 10.9 1.5h1.3z"/></svg>',
  sms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM7 9h10v2H7V9zm6 5H7v-2h6v2zm4-6H7V6h10v2z"/></svg>',
  call: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>',
  contact:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M15 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>',
};

const CSS = `
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
:root{--pink:#ff2e74;--orange:#ff8a3d;--bg:#0f0a1e;--card:#1c1433;--txt:#fff;--mut:#c4bae6}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;background:var(--bg)}
body{min-height:100vh;color:var(--txt);
 font:16px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;overscroll-behavior:none;
 padding:calc(env(safe-area-inset-top) + 16px) 18px calc(env(safe-area-inset-bottom) + 110px);
 background:radial-gradient(120% 60% at 15% 0%,#3a1556 0,transparent 60%),radial-gradient(100% 50% at 100% 100%,#4b0f2e 0,transparent 60%),var(--bg)}
.wrap{width:100%;max-width:440px;margin:0 auto}
.logo{font-size:clamp(28px,8vw,36px);font-weight:900;letter-spacing:-1px;line-height:1;text-align:center;
 background:linear-gradient(90deg,var(--pink),var(--orange));-webkit-background-clip:text;background-clip:text;color:transparent}
.logo span{display:inline-block;animation:beat 1.4s infinite;color:var(--orange);-webkit-text-fill-color:var(--orange)}
@keyframes beat{0%,100%{transform:scale(1)}15%{transform:scale(1.25)}30%{transform:scale(1)}}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:20px 0 22px}
.avatar{width:clamp(108px,32vw,150px);aspect-ratio:1;border-radius:50%;object-fit:cover;border:4px solid var(--pink);
 box-shadow:0 0 0 8px #ff2e7418,0 0 48px #ff2e7466;margin-bottom:14px;background:var(--card)}
.initial{display:flex;align-items:center;justify-content:center;font-size:clamp(46px,14vw,64px);font-weight:800;color:var(--pink)}
h1{font-size:clamp(28px,8.5vw,36px);font-weight:800;line-height:1.1;margin-bottom:8px;word-break:break-word}
.tag{color:var(--mut);font-size:16px;max-width:320px;white-space:pre-line}
.btns{display:flex;flex-direction:column;gap:10px}
.row{display:flex;gap:10px}.row a{flex:1}
a.b{display:flex;align-items:center;justify-content:center;gap:10px;min-height:58px;padding:0 18px;border-radius:18px;
 text-decoration:none;color:#fff;font-weight:700;font-size:17px;background:var(--card);border:1px solid #ffffff1a;transition:transform .1s}
a.b:active{transform:scale(.97)}
a.b svg{width:22px;height:22px;flex:none}
a.b span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ig{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)!important;border:0!important;min-height:64px!important;font-size:18px!important}
.tt{background:#000!important}
.sc{background:#fffc00!important;color:#000!important;border:0!important}
.ph{background:#25d366!important;border:0!important}
a.sub{background:transparent;border:0;min-height:44px;color:var(--mut);font-weight:600;font-size:15px}
.empty{color:var(--mut);font-size:18px;line-height:1.5;text-align:center}
.rizz{display:block;margin-top:16px;max-width:360px;padding:12px 16px;border-radius:16px;background:#ffffff0d;border:1px dashed #ff2e7466;color:var(--txt);text-decoration:none;font-size:16px;font-weight:600;line-height:1.35;animation:pop .5s ease-out}
.rizz q{quotes:'« ' ' »'}.rizz small{display:block;margin-top:6px;color:var(--mut);font-size:12px;font-weight:600}
@keyframes pop{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@media (max-height:700px){.hero{padding:12px 0 16px}.avatar{width:88px;border-width:3px;margin-bottom:10px;box-shadow:0 0 0 6px #ff2e7418,0 0 32px #ff2e7466}.initial{font-size:40px}h1{font-size:28px;margin-bottom:4px}.tag{font-size:15px}a.b{min-height:52px}.ig{min-height:56px!important}.btns{gap:8px}}
`;

function renderPerson(p, opts = {}) {
  const l = linksFor(p);
  const btn = (cls, href, icon, text) =>
    `<a class="b ${cls}" href="${esc(href)}" ${href.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${ICONS[icon]}<span>${esc(text)}</span></a>`;

  const btns = [];
  if (l.instagram) btns.push(btn('ig', l.instagram.url, 'instagram', `Instagram ${l.instagram.label}`));
  if (l.phone)
    btns.push(`<div class="row">${btn('ph', l.phone.sms, 'sms', 'Texto')}${btn('', l.phone.call, 'call', 'Appeler')}</div>`);
  if (l.snapchat) btns.push(btn('sc', l.snapchat.url, 'snapchat', `Snapchat ${l.snapchat.label}`));
  if (l.tiktok) btns.push(btn('tt', l.tiktok.url, 'tiktok', `TikTok ${l.tiktok.label}`));
  if (l.link) btns.push(btn('', l.link.url, 'link', l.link.label));
  if (l.phone) btns.push(btn('sub', '/vcard', 'contact', 'Ajouter aux contacts'));

  const avatar = p.photo
    ? `<img class="avatar" src="/photo/${esc(p.id)}?v=${p.photo}" alt="${esc(p.name)}">`
    : `<div class="avatar initial">${esc((p.name[0] || '?').toUpperCase())}</div>`;

  return layout(
    `${p.name} — Wanna date?`,
    `<section class="hero">${avatar}
      <h1>${esc(p.name)}</h1>
      <p class="tag">${p.tagline ? esc(p.tagline) : 'Tu as scanné le bon chandail 😏'}</p>
      ${opts.pickup ? `<a class="rizz" href="/?encore">💬 <q>${esc(opts.pickup)}</q><small>↻ une autre</small></a>` : ''}</section>
    <nav class="btns">${btns.join('') || '<p class="empty">Pas encore de contact… reviens plus tard 😉</p>'}</nav>`
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

function vcard(p) {
  const l = linksFor(p);
  const e = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${e(p.name)}`, `N:;${e(p.name)};;;`];
  if (l.phone) lines.push(`TEL;TYPE=CELL:${l.phone.tel}`);
  if (l.instagram) lines.push(`URL;TYPE=Instagram:${l.instagram.url}`);
  if (l.link) lines.push(`URL:${l.link.url}`);
  lines.push(`NOTE:${e('Rencontré grâce au chandail Wanna date? ⛷️')}`, 'END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

module.exports = { renderPerson, renderEmpty, vcard, linksFor };
