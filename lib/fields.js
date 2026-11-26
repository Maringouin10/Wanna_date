'use strict';

// Configuration du formulaire que remplissent les gens qui scannent (modifiable dans l'admin).
const MODES = ['hidden', 'optional', 'required'];
const KEYS = ['instagram', 'phone', 'age', 'city', 'message'];
const LEGAL_MIN_AGE = 18; // plancher non négociable : c'est une app de rencontre

const DEFAULT_FORM = {
  minAge: 18,
  fields: {
    instagram: { mode: 'optional', label: 'Ton Instagram', placeholder: 'ton.insta' },
    phone: { mode: 'optional', label: 'Ton numéro', placeholder: '514 555-1234' },
    age: { mode: 'required', label: 'Ton âge', placeholder: '25' },
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
  const out = { minAge: DEFAULT_FORM.minAge, fields: {} };
  const age = Number(input.minAge);
  if (input.minAge !== undefined && strict && (!Number.isInteger(age) || age < LEGAL_MIN_AGE || age > 99))
    throw new Error(`L’âge minimum doit être entre ${LEGAL_MIN_AGE} et 99 ans.`);
  if (Number.isInteger(age)) out.minAge = Math.min(99, Math.max(LEGAL_MIN_AGE, age));

  for (const k of KEYS) {
    const d = DEFAULT_FORM.fields[k];
    const f = (input.fields && input.fields[k]) || {};
    out.fields[k] = {
      mode: k === 'age' ? 'required' : MODES.includes(f.mode) ? f.mode : d.mode, // l'âge est toujours demandé
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

module.exports = { DEFAULT_FORM, KEYS, MODES, LEGAL_MIN_AGE, normalizeForm };
