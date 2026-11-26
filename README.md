# Wanna date? 👕⛷️

Un gros QR code sur un t-shirt « Wanna date? ». Quand quelqu'un le scanne, il tombe sur
les réseaux (Instagram, texto/appel, Snapchat, TikTok…) de **celui qui porte le chandail aujourd'hui**.

Le principe : défi de ski entre amis, le perdant doit porter le chandail. Après la journée,
tu ouvres `/admin` sur ton iPhone, tu tapes sur le nom du perdant, et le QR code pointe
instantanément vers ses infos. Le QR code, lui, ne change jamais.

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

- **＋ Ajouter** : crée une fiche dans la banque (photo, petit message, Instagram, téléphone,
  Snapchat, TikTok, autre lien). Chacun ne met que ce qu'il veut partager.
- **Tap sur une personne** : c'est elle qui a le chandail maintenant. Effet immédiat sur le QR.
- **✎** : modifier ou supprimer une fiche.
- « Quand on scanne… » : par personne, soit une page avec tous ses liens, soit l'ouverture
  directe de son Instagram (ou Snap/TikTok/lien).
- **QR code** : télécharge le SVG (vectoriel, parfait pour l'imprimeur) ou le PNG 2000 px.
  Correction d'erreur maximale (H) : il reste lisible même froissé sur un chandail.
- **Hall of shame** : qui a perdu le plus souvent, et combien de scans chacun a récoltés.
- « Voir la page ↗ » montre la page publique sans compter de scan ni rediriger.

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
