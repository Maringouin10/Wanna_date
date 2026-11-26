# Wanna date? 👕⛷️

Un gros QR code sur un t-shirt « Wanna date? ». Quand quelqu'un le scanne, il voit la photo et
le message de **celui qui porte le chandail aujourd'hui**, et peut tenter sa chance : il laisse
son Instagram ou son numéro, sa ville et un message pour convaincre. Tout arrive dans
l'onglet **💌 Reçus** de l'admin.

Le principe : défi de ski entre amis, le perdant doit porter le chandail. Après la journée,
tu ouvres `/admin` sur ton iPhone, tu tapes sur le nom du perdant, et le QR code affiche
instantanément sa page. Le QR code, lui, ne change jamais.

## Lancer

```bash
cp .env.example .env      # puis mets un vrai ADMIN_PASSWORD et ton PUBLIC_URL
docker compose up -d --build
```

- Page publique (ce que voient les gens qui scannent) : `https://ton-domaine/`
- Admin : `https://ton-domaine/admin`

Les données (banque de personnes, photos, historique, compteur de scans) sont dans le
volume Docker `wanna-date-data` (`/data` dans le conteneur).

## Mettre en ligne

Le QR code doit pointer vers une adresse accessible depuis n'importe quel téléphone, en HTTPS
idéalement. Mets l'app derrière un reverse proxy (Caddy, Traefik, Nginx Proxy Manager, Cloudflare
Tunnel…) et indique cette adresse dans `PUBLIC_URL` **avant d'imprimer le QR code**.

Exemple Caddy :

```
wannadate.exemple.com {
    reverse_proxy localhost:3003
}
```

## Installer l'admin sur l'iPhone (PWA)

1. Ouvre `https://ton-domaine/admin` dans **Safari** et connecte-toi.
2. Bouton Partager → **Sur l'écran d'accueil**.
3. L'app « Wanna date » s'ouvre en plein écran; la session reste active 180 jours.

## Utilisation

L'admin a 4 onglets en bas de l'écran :

- **💌 Reçus** : les messages laissés par les gens qui ont scanné (Insta, texto/appel en un tap,
  âge, message), filtrables par porteur. Pastille rouge = nouveaux messages.
- **📊 Dashboard** : démarrer/terminer une session de ski, changer le porteur en un tap,
  et les stats en direct (scans, visiteurs uniques, heure de pointe, dernier scan,
  graphique des scans par heure, scans par porteur, passations).
- **👕 Équipe** : la banque de gens + le Hall of shame.
- **⛷️ Sessions** : toutes les journées de ski passées, avec leurs stats détaillées.
- **⚙️ Plus** : QR code à imprimer, historique, déconnexion.

### Sessions de ski

Au début de la journée : Dashboard → nom de la montagne → **Démarrer une session de ski**.
Chaque scan est enregistré avec son heure et la personne qui portait le chandail. En fin de
journée : **Terminer la session**. Démarrer une nouvelle session termine automatiquement
l'ancienne. Le graphique s'adapte : par quart d'heure (session courte), par heure, ou par jour.

Les « visiteurs uniques » sont calculés à partir d'une empreinte anonyme (hash non réversible
de l'IP + navigateur) : aucune donnée personnelle des gens qui scannent n'est stockée.
Les robots d'aperçu de liens (iMessage, Messenger, WhatsApp…) ne comptent pas.

### Pickup lines 💬

Sur le Dashboard, l'interrupteur **Pickup line** ajoute une phrase de drague tirée au hasard
sur la page scanneur (bouton « ↻ une autre » pour en voir une autre, sans compter un scan de plus).

- **Français** : banque intégrée écrite à la main + les phrases `French` de la RizzAPI dès
  qu'elles seront publiées (la doc liste le français, mais l'API répond encore « Language not found »).
- **RizzAPI** (anglais) : toute la banque de https://rizzapi.vercel.app est téléchargée
  d'avance dans `/data/pickup-en.json` (au démarrage si le cache a plus d'une semaine,
  puis une fois par jour). L'API est lente, donc elle n'est jamais appelée pendant un scan.
  Les blagues déplacées sont filtrées. `PICKUP_FETCH=off` désactive le téléchargement.

### Détails

- **＋ Ajouter** : crée une fiche dans la banque (prénom, photo, petit message affiché aux gens
  qui scannent).
- **Tap sur une personne** : c'est elle qui a le chandail maintenant. Effet immédiat sur le QR.
- **✎** : modifier ou supprimer une fiche.
- **Formulaire** : par défaut Insta *ou* numéro, ville et message (500 caractères max), plus
  une case « J'ai 18 ans ou plus » à cocher (pas de question d'âge). Tout se règle dans
  **⚙️ Plus → Formulaire des scanneurs** : pour chaque champ *Masqué / Optionnel / Obligatoire*,
  son titre et son exemple (`{nom}` = prénom du porteur). Il faut garder au moins Instagram ou
  le numéro. Anti-spam : champ piège pour les robots et 3 messages max par visiteur toutes les
  10 minutes. Le message va à la personne affichée au moment du scan.
- **QR code** : télécharge le SVG (vectoriel, parfait pour l'imprimeur) ou le PNG 2000 px.
  Correction d'erreur maximale (H) : il reste lisible même froissé sur un chandail.
- **Hall of shame** : qui a perdu le plus souvent, et combien de scans chacun a récoltés.
- « Voir la page ↗ » montre la page publique sans compter de scan.

## Variables d'environnement

| Variable         | Rôle                                                              |
|------------------|-------------------------------------------------------------------|
| `ADMIN_PASSWORD` | Mot de passe de `/admin` (obligatoire). Le changer déconnecte tout le monde. |
| `PUBLIC_URL`     | URL encodée dans le QR code. Vide = adresse utilisée pour ouvrir l'admin. |
| `HOST_PORT`      | Port exposé sur l'hôte (défaut 3003).                             |
| `TZ`             | Fuseau pour les dates (défaut `America/Toronto`).                 |

## Développement

```bash
npm install
ADMIN_PASSWORD=test npm start
npm test
```
