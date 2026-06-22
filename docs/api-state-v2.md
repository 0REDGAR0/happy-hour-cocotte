# API State V2

`GET /api/state` reste le point d'entree unique pour l'etat affiche sur la TV,
l'overlay et les clients salle.

Le contrat V2 garde les champs historiques (`happyHourActive`,
`remainingSeconds`, `homeTeam`, `awayTeam`, `homeScore`, `awayScore`,
`matchMode`, `scoreSource`, etc.) et ajoute des champs explicites pour
l'avant-match.

## Modes d'affichage

`displayMode` peut valoir :

- `PRE_MATCH` : match selectionne, pas encore commence.
- `MATCH_LIVE` : match en cours.
- `HAPPY_HOUR` : happy hour active.
- `HALF_TIME` : mi-temps.
- `FULL_TIME` : match termine.
- `FULLSCREEN_MESSAGE` : message plein ecran actif.
- `IDLE` : aucun affichage prioritaire.

Priorite de calcul actuelle :

1. `FULLSCREEN_MESSAGE` si `fullscreenMessage` est non vide.
2. `HAPPY_HOUR` si `happyHourActive` vaut `true`.
3. Mode derive de `matchStatus`.

Pour `matchStatus = NOT_STARTED`, `displayMode` vaut `PRE_MATCH` uniquement si
`preMatch.enabled` vaut `true`. Sinon, l'affichage revient a `IDLE`.

## Structure principale

Exemple de reponse simplifiee :

```json
{
  "displayMode": "PRE_MATCH",
  "matchStatus": "NOT_STARTED",
  "happyHourActive": false,
  "happyHourDurationSeconds": 300,
  "remainingSeconds": 0,
  "happyHourEndsAt": null,
  "preMatch": {
    "enabled": true,
    "kickoffAt": "2026-06-14T21:00:00+02:00",
    "programMessages": [
      "Service au bar pendant tout le match"
    ],
    "programItems": [
      {
        "id": "service-bar",
        "icon": "🍽️",
        "text": "Service au bar pendant tout le match",
        "active": true,
        "sortOrder": 10
      }
    ],
    "homeFlag": "🇫🇷",
    "awayFlag": "🇩🇪"
  },
  "homeTeam": {
    "name": "France",
    "shortName": "FRA"
  },
  "awayTeam": {
    "name": "Unknown",
    "shortName": "ADV"
  },
  "homeScore": 0,
  "awayScore": 0,
  "matchTitle": "France vs Unknown",
  "matchDescription": "Avant match",
  "matchInfo": {
    "homeTeam": {
      "name": "France",
      "shortName": "FRA"
    },
    "awayTeam": {
      "name": "Unknown",
      "shortName": "ADV"
    },
    "homeTeamName": "France",
    "awayTeamName": "Unknown",
    "homeScore": 0,
    "awayScore": 0,
    "matchTitle": "France vs Unknown",
    "matchDescription": "Avant match",
    "kickoffAt": "2026-06-14T19:00:00.000Z"
  },
  "eventBanners": [
    {
      "id": "happy-hour-bientot",
      "text": "Gardez un oeil sur le score : Happy Hour a chaque but de la France.",
      "active": true,
      "sortOrder": 10
    }
  ],
  "livelyMessages": [
    {
      "id": "allez-les-bleus",
      "text": "Allez les Bleus, la Cocotte est avec vous.",
      "active": true,
      "sortOrder": 10
    }
  ],
  "drinks": [
    {
      "id": "pinte-blonde",
      "name": "Pinte blonde",
      "originalPrice": 7,
      "price": 7,
      "happyHourPrice": 5.6,
      "icon": "🍺",
      "currency": "EUR",
      "active": true
    }
  ],
  "menu": {
    "happyHourDiscountRate": 0.2,
    "drinks": []
  },
  "spotify": {
    "status": "not_configured",
    "title": "",
    "artist": "",
    "albumArtUrl": null,
    "isPlaying": false,
    "progressMs": null,
    "durationMs": null,
    "deviceName": null
  }
}
```

`drinks` et `menu.drinks` exposent les memes donnees pour faciliter les clients
qui veulent soit une liste directe, soit un bloc menu extensible. Seules les
boissons actives sont exposees dans `/api/state`.

La duree Happy Hour standard est de 5 minutes, exposee via
`happyHourDurationSeconds = 300`. Pendant une Happy Hour, `remainingSeconds`
indique le temps restant et `happyHourEndsAt` expose l'heure de fin estimee en
ISO 8601 UTC. Hors Happy Hour, `remainingSeconds` vaut `0` et
`happyHourEndsAt` vaut `null`.

`price` reste un alias compatible de `originalPrice`. Les nouveaux clients
doivent lire `originalPrice`, `happyHourPrice`, `icon` et `active`.

`preMatch.programMessages` reste expose pour compatibilite. La source principale
est maintenant `preMatch.programItems`, triee par `sortOrder` et filtree sur
`active`.

`livelyMessages` expose les petites phrases d'ambiance actives pour `/tablette`,
triees par `sortOrder`. Si le champ est absent ou invalide, les clients doivent
afficher une erreur visible et ne pas inventer de phrases.

`eventBanners` expose les bannieres evenementielles actives. La banniere
effectivement diffusee reste `bannerMessage`, afin que l'overlay TV/DeX,
`/tablette` et `/salle` affichent le meme message au meme moment.

`matchInfo` est le bloc recommande pour les clients Android qui affichent
l'avant-match. Il expose les equipes sous forme historique d'objets
`homeTeam` / `awayTeam` et ajoute les alias scalaires `homeTeamName` /
`awayTeamName`. Le champ `matchInfo.kickoffAt` est derive de
`preMatch.kickoffAt` et normalise en ISO 8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`)
pour etre directement parseable par `Instant.parse`. Si la date persistante est
absente ou invalide, `matchInfo.kickoffAt` vaut `null`.

## Donnees persistantes

Les donnees necessaires a l'overlay `PRE_MATCH` sont persistantes dans
`data/pre-match-content.json` :

- `drinks` : `id`, `name`, `originalPrice`, `price` (alias), `happyHourPrice`, `icon`, `currency`, `active`.
- `programItems` : `id`, `icon`, `text`, `active`, `sortOrder`.
- `eventBanners` : `id`, `text`, `active`, `sortOrder`.
- `livelyMessages` : `id`, `text`, `active`, `sortOrder`.
- `preMatch` : `enabled`, `kickoffAt`, `homeFlag`, `awayFlag`.
- `match` : match selectionne et equipes affichees par l'avant-match.

Si le fichier est absent, le serveur cree un fichier initial dans `data/`.
Si le fichier existe mais est illisible ou invalide, le serveur ne remplace pas
les donnees par des valeurs factices.

## Pas de fallback silencieux

Les clients ne doivent pas afficher de fausses donnees comme si elles etaient
reelles. Une erreur serveur, base de donnees ou fichier JSON doit produire un
etat visible :

- `/tablette` et `/salle` affichent `Connexion serveur perdue` si `/api/state` ne repond pas.
- `/tablette` et `/salle` affichent `Erreur de chargement de la carte des boissons` si la carte n'est pas presente dans l'etat recu.
- `/tablette` affiche une erreur visible si `livelyMessages` n'est pas present dans l'etat recu.
- `/admin` affiche une erreur de chargement ou de sauvegarde dans la section concernee.
- Spotify expose `spotify.status = "not_configured"` sans configuration et `spotify.status = "error"` en cas d'erreur API.

## Endpoints boissons

- `GET /api/drinks`
  - Renvoie toutes les boissons, actives ou non, pour l'edition dans `/admin`.

- `POST /api/drinks`
  - Body JSON : `{ "name": "Pinte blonde", "originalPrice": 7, "happyHourPrice": 5.6, "icon": "🍺", "active": true }`.
  - Ajoute une boisson persistante.

- `PUT /api/drinks/:id`
  - Met a jour `name`, `originalPrice`, `happyHourPrice`, `icon` et `active`.

- `DELETE /api/drinks/:id`
  - Supprime une boisson persistante.

Apres chaque modification, `/api/state` est rediffuse par WebSocket et expose la
carte active dans `drinks` et `menu.drinks`.

## Endpoints programme

- `GET /api/program`
  - Renvoie toutes les lignes de programme, actives ou non.

- `POST /api/program`
  - Body JSON : `{ "icon": "⚽", "text": "5 minutes de Happy Hour", "active": true, "sortOrder": 20 }`.
  - Ajoute une ligne de programme persistante.

- `PUT /api/program/:id`
  - Met a jour `icon`, `text`, `active` et `sortOrder`.

- `DELETE /api/program/:id`
  - Supprime une ligne de programme persistante.

## Endpoints messages vivants

- `GET /api/lively-messages`
  - Renvoie toutes les phrases d'ambiance, actives ou non, pour l'edition dans `/admin`.

- `POST /api/lively-messages`
  - Body JSON : `{ "text": "Allez les Bleus", "active": true, "sortOrder": 10 }`.
  - Ajoute une phrase persistante.

- `PUT /api/lively-messages/:id`
  - Met a jour `text`, `active` et `sortOrder`.

- `DELETE /api/lively-messages/:id`
  - Supprime une phrase persistante.

Apres chaque modification, `/api/state` est rediffuse par WebSocket et expose
les phrases actives dans `livelyMessages`.

## Endpoints bannieres evenementielles

- `GET /api/event-banners`
  - Renvoie toutes les bannieres, actives ou non, pour l'edition dans `/admin`.

- `POST /api/event-banners`
  - Body JSON : `{ "text": "Service au bar pendant le match", "active": true, "sortOrder": 10 }`.
  - Ajoute une banniere persistante.

- `PUT /api/event-banners/:id`
  - Met a jour `text`, `active` et `sortOrder`.

- `DELETE /api/event-banners/:id`
  - Supprime une banniere persistante.

- `POST /api/display/random-banner`
  - Choisit une banniere active et la diffuse immediatement dans `bannerMessage`.
  - La diffusion actuelle est effacee automatiquement apres une duree courte cote serveur.

Apres chaque modification, `/api/state` est rediffuse par WebSocket et expose
les bannieres actives dans `eventBanners`.

## Avant-match

`preMatch` pilote l'ecran avant-match :

- `enabled` : active ou desactive le mode avant-match quand le match n'a pas commence.
- `kickoffAt` : date/heure persistante du coup d'envoi, historiquement au format ISO avec offset. Ce champ peut etre vide si aucune date n'est configuree.
- `programItems` : lignes "Au programme" persistantes, avec pictogramme et ordre.
- `programMessages` : compatibilite temporaire derivee de `programItems`.
- `homeFlag` : drapeau ou symbole de l'equipe domicile.
- `awayFlag` : drapeau ou symbole de l'equipe exterieure.

Pour le countdown PRE_MATCH Android, utiliser `matchInfo.kickoffAt`. Aucun
champ countdown deja calcule n'est expose par `/api/state`; le client doit
calculer la difference entre l'heure courante et cette date. Si
`matchInfo.kickoffAt` vaut `null`, le client doit afficher une erreur explicite
ou un etat "date non configuree", sans inventer de date.

`POST /api/pre-match/configure` continue d'accepter `kickoffAt`, `homeFlag`,
`awayFlag` et `programMessages`. Les nouveaux clients doivent utiliser
`/api/program` pour editer le programme.

## Spotify

`spotify.status` peut valoir :

- `connected` : Spotify configure et morceau courant disponible.
- `not_configured` : variables Spotify absentes ou incompletes.
- `error` : erreur API Spotify ou jeton invalide.
- `no_playback` : Spotify configure, mais aucune lecture active ou aucun morceau courant.

Aucun faux morceau par defaut n'est expose.

## Compatibilite

Les endpoints existants restent disponibles :

- `POST /api/override/start`
- `POST /api/override/reset`
- `POST /api/override/stop`
- `POST /api/simulation/home-goal`
- `POST /api/simulation/away-goal`
- `POST /api/simulation/home-plus`
- `POST /api/simulation/home-minus`
- `POST /api/simulation/away-plus`
- `POST /api/simulation/away-minus`
- `POST /api/simulation/reset-score`
- `POST /api/simulation/undo-last`
- `POST /api/match/select`
- `POST /api/match/select-api`
- `POST /api/pre-match/activate`
- `POST /api/pre-match/deactivate`
- `POST /api/pre-match/configure`
- `POST /api/display/random-banner`
- `GET /api/event-banners`
- `POST /api/event-banners`
- `PUT /api/event-banners/:id`
- `DELETE /api/event-banners/:id`
- `GET /api/lively-messages`
- `POST /api/lively-messages`
- `PUT /api/lively-messages/:id`
- `DELETE /api/lively-messages/:id`

Le mode simulation continue a modifier `homeScore`, `awayScore`,
`happyHourActive` et `remainingSeconds` comme avant.

## Champs recommandes pour overlay Android

Pour l'overlay Android, lire en priorite :

- `displayMode` pour choisir l'ecran a rendre.
- `matchStatus`, `matchTitle` et `matchInfo.matchDescription` pour l'etat du match.
- `matchInfo.homeTeamName` et `matchInfo.awayTeamName` pour les noms affichables.
- `matchInfo.kickoffAt` pour le compte a rebours normalise.
- `preMatch.kickoffAt` pour compatibilite historique avec l'ancienne source.
- `drinks` ou `menu.drinks` pour `name`, `originalPrice`, `happyHourPrice`, `icon`, `currency` et `active`.
- `preMatch.programItems` pour le programme avec `text` et `icon`.
- `spotify` pour le statut musique, le titre, l'artiste, la progression, la duree et l'appareil.
- `happyHourActive`, `happyHourDurationSeconds`, `remainingSeconds` et `happyHourEndsAt` pour l'etat Happy Hour.

Si un champ attendu est absent ou invalide, l'overlay doit afficher un etat
visible d'erreur ou de chargement. Il ne doit pas inventer de match, de date, de
boisson, de programme ou de morceau Spotify.
