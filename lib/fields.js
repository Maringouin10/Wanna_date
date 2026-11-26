'use strict';

// Configuration du formulaire que remplissent les gens qui scannent (modifiable dans l'admin).
const MODES = ['hidden', 'optional', 'required'];
const KEYS = ['instagram', 'phone', 'city', 'message'];

const DEFAULT_FORM = {
  fields: {
    instagram: { mode: 'optional', label: 'Ton Instagram', placeholder: 'ton.insta' },
    phone: { mode: 'optional', label: 'Ton numéro', placeholder: '514 555-1234' },
    city: { mode: 'required', label: 'Ta ville', placeholder: 'Montréal' },
    message: { mode: 'required', label: 'Convaincs {nom} 😏', placeholder: 'Pourquoi toi? Sois drôle, sois créatif…' },
  },
};

const txt = (v, max, fallback) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return s || fallback;
};

// Fusionne avec les valeurs par défaut et valide. Lance une erreur si la config est inutilisable.
function normalizeForm(input = {}, { strict = false } = {}) {
  const out = { fields: {} };

  for (const k of KEYS) {
    const d = DEFAULT_FORM.fields[k];
    const f = (input.fields && input.fields[k]) || {};
    out.fields[k] = {
      mode: MODES.includes(f.mode) ? f.mode : d.mode,
      label: txt(f.label, 60, d.label),
      placeholder: txt(f.placeholder, 100, d.placeholder),
    };
  }
  if (out.fields.instagram.mode === 'hidden' && out.fields.phone.mode === 'hidden') {
    if (strict) throw new Error('Garde au moins Instagram ou le numéro, sinon personne ne pourra être recontacté.');
    out.fields.instagram.mode = 'optional';
  }
  return out;
}

module.exports = { DEFAULT_FORM, KEYS, MODES, normalizeForm };
