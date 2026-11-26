'use strict';

const fs = require('fs');
const path = require('path');

// Banque française écrite à la main (la RizzAPI n'a que de l'anglais).
const FR = [
  'Es-tu une piste noire? Parce que je tombe pour toi.',
  'T’as pas froid? Parce que moi, je viens de fondre.',
  'Je suis pas un moniteur de ski, mais je peux t’apprendre à tomber… en amour.',
  'Est-ce que t’es un télésiège? Parce que je veux passer du temps assis à côté de toi.',
  'Ton sourire réchauffe plus qu’un chocolat chaud au chalet.',
  'Je pensais que la plus belle vue était au sommet. Je me trompais.',
  'Si t’étais une piste, tu serais hors-piste : complètement hors de ma ligue.',
  'J’ai perdu un défi de ski pour porter ce chandail. Ça valait la peine si ça m’a mené à toi.',
  'Tu fais monter ma température plus vite qu’un après-ski au soleil.',
  'Je t’aurais bien envoyé un message, mais t’es encore plus belle en personne.',
  'Est-ce que t’as une carte? Parce que je me perds dans tes yeux.',
  'Excuse-moi, je crois que t’as échappé quelque chose : mon cœur.',
  'T’es pas une raquette, mais t’as complètement chaviré mon cœur.',
  'Si la beauté était un crime, tu ferais perpétuité.',
  'Est-ce que tu crois au coup de foudre, ou je repasse devant toi?',
  'J’espère que tu connais les premiers soins, parce que tu viens de me couper le souffle.',
  'T’es comme la poudreuse du matin : rare et magnifique.',
  'Mon GPS a perdu le nord depuis que je t’ai vue.',
  'Je cherchais l’amour sur les pentes. Je l’ai trouvé au bas.',
  'T’as scanné mon chandail. Techniquement, c’est toi qui as fait le premier pas.',
  'Mes amis m’ont fait porter ce chandail pour m’humilier. Merci de rendre ça romantique.',
  'Est-ce que t’es une tuque? Parce que j’ai envie de te garder près de moi tout l’hiver.',
  'Je suis comme un flocon : unique, et prêt à tomber pour toi.',
  'Ton prénom, c’est Wi-Fi? Parce que je sens une connexion.',
  'T’es la raison pour laquelle j’ai arrêté de regarder mon téléphone… sauf maintenant.',
  'Si t’étais un légume, tu serais une cute-combre.',
  'Est-ce que t’es un dépanneur? Parce que t’as tout ce que je cherche.',
  'Je suis pas photographe, mais je nous vois très bien ensemble.',
  'T’as dû faire mal en tombant du ciel… ou c’était de la piste des experts?',
  'On devrait sortir ensemble. Je promets de pas te faire porter le chandail.',
  'Ma mère m’a dit de suivre mes rêves. Alors, ton Insta?',
  'Est-ce que t’es une boule à neige? Parce que t’as bouleversé mon monde.',
  'J’allais dire une pickup line, mais t’es déjà rendue à la page de contact. Bravo.',
  'T’es comme une poutine à 2 h du matin : exactement ce dont j’avais besoin.',
  'Je suis pas bon en ski, mais je suis très bon pour tomber sur la bonne personne.',
  'Est-ce que t’es du sirop d’érable? Parce que t’es sucrée et 100 % d’ici.',
  'Si tu me donnes ton numéro, je te garantis un tour de télésiège très romantique.',
  'T’as quelque chose dans les yeux… Ah non, c’est juste des étoiles.',
  'Ma tuque est chaude, mais ton sourire l’est encore plus.',
  'Pas besoin de remonte-pente : avec toi, je suis déjà au septième ciel.',
  'J’ai pas de pickup line. J’ai juste un chandail et beaucoup de courage.',
  'Est-ce que t’es une piste verte? Parce que tout semble facile avec toi.',
  'Je mettrais bien mes skis de côté pour une journée avec toi.',
  'T’es la meilleure chose que ce QR code m’a apportée.',
  'Est-ce que t’es un feu de foyer? Parce que je veux rester près de toi toute la soirée.',
  'Tu viens souvent ici, ou c’est le destin qui t’a fait scanner mon chandail?',
  'J’ai perdu au ski, mais j’ai l’impression que je vais gagner aujourd’hui.',
  'Si t’étais une saison, tu serais l’hiver : tu me fais frissonner.',
  'Je suis comme un bonhomme de neige : je fonds quand tu souris.',
  'Est-ce que t’as un plaster? Je me suis écorché en tombant pour toi.',
];

// Filtre les blagues déplacées de l'API anglaise.
const BLOCK = /african|asian|indian|chinese|mexican|black|white|retard|gay|rape|drunk|kill|bed|sex|naked|nude|pant|underwear|panties|bra\b|boob|ass\b|dick|penis|sperm|virgin|69|hooker|slave|terror|gun|bomb|nazi|fat\b/i;
const API = 'https://rizzapi.vercel.app/language/';
const LANGS = { en: 'English', fr: 'French' }; // « french » est listé dans la doc mais pas encore rempli

class Pickup {
  constructor(dataDir) {
    this.file = path.join(dataDir, 'pickup-en.json');
    this.en = [];
    this.frApi = []; // phrases françaises de la RizzAPI, dès qu'elles existeront
    this.enUpdatedAt = null;
    this.loading = false;
    try {
      const c = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.en = c.lines || [];
      this.frApi = c.fr || [];
      this.enUpdatedAt = c.updatedAt || null;
    } catch {}
  }

  // Préchargement de toute la banque anglaise (l'API est lente : jamais appelée pendant un scan).
  async fetchLang(name) {
    const res = await fetch(`${API}${name}?page=1&perPage=5000`, { signal: AbortSignal.timeout(60000) });
    if (res.status === 404) return []; // langue pas encore disponible
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return [...new Set(data.map((x) => String(x.text || '').trim()))].filter(
      (t) => t.length > 10 && t.length <= 160 && !BLOCK.test(t)
    );
  }

  async refresh() {
    if (this.loading) return;
    this.loading = true;
    try {
      const [en, fr] = await Promise.all([this.fetchLang(LANGS.en), this.fetchLang(LANGS.fr).catch(() => [])]);
      if (en.length) this.en = en;
      if (fr.length) this.frApi = fr;
      this.enUpdatedAt = Date.now();
      fs.writeFileSync(this.file, JSON.stringify({ updatedAt: this.enUpdatedAt, lines: this.en, fr: this.frApi }));
      console.log(`Pickup lines préchargées : ${this.en.length} en anglais, ${fr.length} en français (RizzAPI)`);
    } catch (e) {
      console.warn('RizzAPI injoignable, on garde le cache :', e.message);
    } finally {
      this.loading = false;
    }
  }

  // Rafraîchit au démarrage si le cache a plus d'une semaine, puis chaque jour.
  schedule() {
    if (!this.enUpdatedAt || Date.now() - this.enUpdatedAt > 7 * 864e5) this.refresh();
    setInterval(() => this.refresh(), 864e5).unref();
  }

  random(lang) {
    const pool = lang === 'en' && this.en.length ? this.en : [...FR, ...this.frApi];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  info() {
    return { fr: FR.length + this.frApi.length, frApi: this.frApi.length, en: this.en.length, enUpdatedAt: this.enUpdatedAt, loading: this.loading };
  }
}

module.exports = { Pickup, FR };
