# Cocotte Goal Happy Hour

Application locale pour declencher une happy hour pendant les matchs de la France.

## Branche back-v4

La branche de travail `back-v4` prepare le back Fastify + WebSocket pour une
offre Happy Hour unique : la pinte de bière est à 4€ au lieu de 9€.

Les nouvelles installations creent une seule offre active par defaut
`Pinte de bière` (`originalPrice: 9`, `happyHourPrice: 4`, `currency: EUR`).
Si un fichier persistant contient deja plusieurs boissons actives, elles ne
sont pas supprimees automatiquement : les desactiver depuis `/admin` >
`Boissons` pour garder uniquement l'offre principale.

## Pages locales

- `/admin` : tableau de bord administrateur.
- `/bar` : redirige vers `/admin` pour compatibilite.
- `/salle` : pilotage simplifie en salle.
- `/tablette` : affichage salle simplifie pour iPad/tablette.
- `/tv` : alias temporaire redirige vers `/tablette`.

`/admin` permet aussi d'editer les boissons, le programme avant-match, les
bannieres evenementielles diffusees via `bannerMessage` et les messages vivants
affiches sur `/tablette`.

Quand une Happy Hour demarre vraiment, `/api/state` expose temporairement
`happyHourAnnouncement` pendant environ 5 secondes. Cet objet contient un `id`,
`startedAt`, `expiresAt` et le message `La pinte est à 4€ au lieu de 9€`.
L'overlay Android doit afficher l'annonce plein ecran une seule fois par `id`,
puis revenir a l'affichage normal. Les champs historiques `happyHourActive`,
`remainingSeconds` et `happyHourEndsAt` restent inchanges.

Les bannieres aleatoires restent separees de cette annonce : `/api/event-banners`
sert a les administrer, `/api/display/random-banner` choisit une banniere active
et la publie temporairement dans `bannerMessage` pendant environ 15 secondes.
`/api/display/fullscreen-message` et `/api/display/clear-message` restent les
outils manuels de regie pour les messages plein ecran spontanes.

La vue generale `/bar` contient une soundbox de regie avec les boutons Klaxon,
Sifflet, Ambiance et Goal. Elle agit comme telecommande : chaque clic appelle
`POST /api/soundbox/play` et publie temporairement `soundboxEvent` dans
`/api/state`. Le son final est prevu cote overlay Android / TV, qui dedoublonne
les evenements par `id` et choisit le fichier audio ou le log associe.

Types soundbox autorises : `horn`, `whistle`, `cheer`, `goal`. Chaque evenement
contient un `id` unique, un `type`, un `label`, un `asset`, `startedAt` et
`expiresAt`.

## Acces reseau stable

Un serveur Node ne peut pas garantir seul une IP fixe. Pour garder la meme URL
sur telephone, tablette ou TV, utilisez de preference une reservation DHCP sur
la box, le routeur ou le hotspot. Alternative possible : IP statique cote
appareil si le systeme le permet.

Quand une IP ou un nom local stable existe, renseigner :

```env
PUBLIC_BASE_URL=http://192.168.1.50:3000
```

Cette variable sert a afficher l'URL stable dans `/admin` et `/api/server-info`.
Voir `docs/network.md` pour les etapes detaillees.

## API Football

Le mode simulation reste disponible sans configuration. Pour afficher les matchs France recuperes depuis API-Football / API-Sports v3 dans `/admin/setup`, renseigner les variables locales :

```env
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
```

La cle API ne doit pas etre committee. Sans cle, `/api/matches/france` retourne `configured: false` et l'interface affiche que l'API n'est pas configuree.

## Spotify

Spotify est gere cote serveur via Authorization Code Flow et reste optionnel.
Voir `docs/spotify.md` pour les variables `SPOTIFY_CLIENT_ID`,
`SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` et `SPOTIFY_REFRESH_TOKEN`.
