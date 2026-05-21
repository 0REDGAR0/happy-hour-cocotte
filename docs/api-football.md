# API Football

Provider retenu pour la premiere lecture reelle : API-Football / API-Sports v3.

Configuration locale :

```env
API_FOOTBALL_KEY=
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
```

La cle reste optionnelle. Si `API_FOOTBALL_KEY` est vide, le serveur continue de demarrer et `GET /api/matches/france` retourne `configured: false`.

Endpoints utilises :

- `GET /teams?search=France` pour retrouver l'id API de l'equipe nationale France.
- `GET /fixtures?team={id}&season={year}&timezone=Europe/Paris` pour recuperer les matchs par saison avec des parametres compatibles plan Free.

Le provider lit plusieurs saisons proches, puis filtre cote serveur pour prioriser les matchs live, les prochains matchs et les matchs recents. Les parametres reserves aux plans payants comme `next` et `last` ne sont pas utilises.

Authentification :

- header `x-apisports-key`
- la cle n'est jamais envoyee au frontend

Cette etape ne fait pas de polling, ne detecte pas automatiquement les buts et ne declenche pas la happy hour depuis l'API.
