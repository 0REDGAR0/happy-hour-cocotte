# API State V2

`GET /api/state` reste le point d'entree unique pour l'etat affiche sur la TV,
l'overlay et le futur client Android/DeX.

Le contrat V2 ajoute des champs explicites sans supprimer les champs historiques.
Les pages existantes peuvent donc continuer a lire `happyHourActive`,
`remainingSeconds`, `homeTeam`, `awayTeam`, `homeScore`, `awayScore`,
`matchMode`, `scoreSource`, etc.

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

## Statuts de match

`matchStatus` peut valoir :

- `NOT_STARTED`
- `FIRST_HALF`
- `HALF_TIME`
- `SECOND_HALF`
- `FINISHED`

## Structure principale

Exemple de reponse simplifiee :

```json
{
  "displayMode": "PRE_MATCH",
  "matchStatus": "NOT_STARTED",
  "happyHourActive": false,
  "remainingSeconds": 0,
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
  "score": {
    "home": 0,
    "away": 0,
    "homeScore": 0,
    "awayScore": 0
  },
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
    "homeScore": 0,
    "awayScore": 0,
    "matchTitle": "France vs Unknown",
    "matchDescription": "Avant match"
  },
  "bannerMessage": "",
  "fullscreenMessage": "",
  "drinks": [
    {
      "id": "pinte-blonde",
      "name": "Pinte blonde",
      "price": 7,
      "happyHourPrice": 5.6,
      "currency": "EUR"
    }
  ],
  "menu": {
    "happyHourDiscountRate": 0.2,
    "drinks": []
  },
  "spotify": {
    "title": "",
    "artist": "",
    "albumArtUrl": null,
    "isPlaying": false
  }
}
```

`drinks` et `menu.drinks` exposent les memes donnees pour faciliter les clients
qui veulent soit une liste directe, soit un bloc menu extensible.

## Endpoints de pilotage

Tous ces endpoints renvoient le nouvel etat `/api/state`.

### Match

- `POST /api/match/start`
  - Passe `matchStatus` a `FIRST_HALF`.
  - `displayMode` devient `MATCH_LIVE`, sauf happy hour ou message plein ecran actif.

- `POST /api/match/half-time`
  - Passe `matchStatus` a `HALF_TIME`.
  - `displayMode` devient `HALF_TIME`, sauf happy hour ou message plein ecran actif.

- `POST /api/match/resume`
  - Passe `matchStatus` a `SECOND_HALF`.
  - `displayMode` devient `MATCH_LIVE`, sauf happy hour ou message plein ecran actif.

- `POST /api/match/finish`
  - Passe `matchStatus` a `FINISHED`.
  - Arrete la happy hour active et remet `remainingSeconds` a `0`.
  - `displayMode` devient `FULL_TIME`, sauf message plein ecran actif.

### Affichage

- `POST /api/display/banner`
  - Body JSON : `{ "message": "Texte bandeau" }`
  - Alias accepte : `{ "text": "Texte bandeau" }`
  - Met a jour `bannerMessage`.

- `POST /api/display/fullscreen-message`
  - Body JSON : `{ "message": "Texte plein ecran" }`
  - Alias accepte : `{ "text": "Texte plein ecran" }`
  - Met a jour `fullscreenMessage`.
  - `displayMode` devient `FULLSCREEN_MESSAGE`.

- `POST /api/display/clear-message`
  - Vide `bannerMessage` et `fullscreenMessage`.
  - `displayMode` revient au mode derive de la happy hour ou du statut de match.

## Compatibilite

Les endpoints existants restent disponibles :

- `POST /api/override/start`
- `POST /api/override/reset`
- `POST /api/override/stop`
- `POST /api/simulation/home-goal`
- `POST /api/simulation/away-goal`
- `POST /api/simulation/reset-score`
- `POST /api/simulation/undo-last`
- `POST /api/match/select`
- `POST /api/match/select-api`

Le mode simulation continue a modifier `homeScore`, `awayScore`,
`happyHourActive` et `remainingSeconds` comme avant.
