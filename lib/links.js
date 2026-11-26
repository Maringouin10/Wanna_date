'use strict';

// Accepte « @handle », « handle » ou une URL complète.
function handle(v) {
  if (!v) return '';
  v = v.trim();
  const url = /^https?:\/\/[^/]+\/(?:add\/)?@?([^/?#]+)/i.exec(v);
  return (url ? url[1] : v).replace(/^@/, '');
}

function phoneDigits(v) {
  if (!v) return '';
  const plus = v.trim().startsWith('+');
  const digits = v.replace(/\D/g, '');
  if (!digits) return '';
  // Numéro nord-américain à 10 chiffres → +1
  if (!plus && digits.length === 10) return '+1' + digits;
  return (plus ? '+' : '') + digits;
}

function safeUrl(v) {
  if (!v) return '';
  v = v.trim();
  if (!/^https?:\/\//i.test(v)) v = 'https://' + v;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

function linksFor(p) {
  const out = {};
  const ig = handle(p.instagram);
  if (ig) out.instagram = { url: `https://instagram.com/${encodeURIComponent(ig)}`, label: '@' + ig };
  const tt = handle(p.tiktok);
  if (tt) out.tiktok = { url: `https://www.tiktok.com/@${encodeURIComponent(tt)}`, label: '@' + tt };
  const sc = handle(p.snapchat);
  if (sc) out.snapchat = { url: `https://www.snapchat.com/add/${encodeURIComponent(sc)}`, label: sc };
  const tel = phoneDigits(p.phone);
  if (tel) out.phone = { tel, sms: `sms:${tel}`, call: `tel:${tel}`, label: p.phone.trim() };
  const link = safeUrl(p.link);
  if (link) out.link = { url: link, label: p.linkLabel || link.replace(/^https?:\/\//, '').replace(/\/$/, '') };
  return out;
}

module.exports = { linksFor, handle, phoneDigits, safeUrl };
