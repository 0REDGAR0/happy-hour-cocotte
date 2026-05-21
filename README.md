# Cocotte Goal Happy Hour

Application locale pour declencher une happy hour pendant les matchs de la France.

## API Football

Le mode simulation reste disponible sans configuration. Pour afficher les matchs France recuperes depuis API-Football / API-Sports v3 dans `/bar/setup`, renseigner les variables locales :

```env
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
```

La cle API ne doit pas etre committee. Sans cle, `/api/matches/france` retourne `configured: false` et l'interface affiche que l'API n'est pas configuree.
