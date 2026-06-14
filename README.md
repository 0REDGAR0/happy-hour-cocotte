# Cocotte Goal Happy Hour

Application locale pour declencher une happy hour pendant les matchs de la France.

## Pages locales

- `/admin` : tableau de bord administrateur.
- `/bar` : redirige vers `/admin` pour compatibilite.
- `/tablette` : affichage salle simplifie pour iPad/tablette.
- `/tv` : alias temporaire redirige vers `/tablette`.

`/admin` permet aussi d'editer les boissons, le programme avant-match, les
bannieres evenementielles diffusees via `bannerMessage` et les messages vivants
affiches sur `/tablette`.

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
