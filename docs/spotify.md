# Spotify

L'integration Spotify est optionnelle. Sans configuration complete, le serveur
n'appelle pas Spotify et `/api/state.spotify.status` vaut `not_configured`.
Aucun faux morceau n'est expose.

## Variables d'environnement

Ajouter ces variables dans `.env` :

```env
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=http://localhost:3000/api/spotify/callback
SPOTIFY_REFRESH_TOKEN=
```

Ne jamais committer `.env`. Ne jamais hardcoder `SPOTIFY_CLIENT_ID` ou
`SPOTIFY_CLIENT_SECRET` dans le code.

## Configuration Spotify Developer

1. Ouvrir le dashboard Spotify Developer.
2. Creer ou ouvrir l'application Cocotte.
3. Copier le Client ID dans `SPOTIFY_CLIENT_ID`.
4. Copier le Client Secret dans `SPOTIFY_CLIENT_SECRET`.
5. Ajouter l'URL de redirection exacte :

```text
http://localhost:3000/api/spotify/callback
```

Si `APP_PORT` change ou si vous utilisez une URL publique locale differente,
mettre la meme valeur dans Spotify Developer et dans `SPOTIFY_REDIRECT_URI`.

## Recuperer le refresh token

1. Demarrer le serveur avec `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` et
   `SPOTIFY_REDIRECT_URI` remplis.
2. Ouvrir `/admin`, section `Musique`, puis cliquer sur `Connecter Spotify`.
3. Autoriser l'application Spotify.
4. La page `/api/spotify/callback` affiche une ligne :

```env
SPOTIFY_REFRESH_TOKEN=...
```

5. Copier cette ligne dans `.env`.
6. Redemarrer le serveur.

Le refresh token est secret. S'il a ete partage ou expose, regenerer le Client
Secret et refaire le flux de connexion.

## Endpoints

- `GET /api/spotify/login`
  - Redirige vers Spotify avec les scopes :
    `user-read-currently-playing` et `user-read-playback-state`.

- `GET /api/spotify/callback`
  - Echange le `code` Spotify contre un refresh token.
  - Affiche clairement la ligne `SPOTIFY_REFRESH_TOKEN=...` a mettre dans `.env`.

- `GET /api/spotify/status`
  - Retourne l'etat de configuration sans exposer le secret.

- `POST /api/spotify/disconnect`
  - Vide le token d'acces en memoire et desactive Spotify jusqu'au prochain
    redemarrage. Si `SPOTIFY_REFRESH_TOKEN` reste dans `.env`, la connexion
    redeviendra active au redemarrage.

## Contrat `/api/state.spotify`

```json
{
  "status": "connected",
  "title": "Titre",
  "artist": "Artiste",
  "albumArtUrl": "https://...",
  "isPlaying": true,
  "progressMs": 42000,
  "durationMs": 180000,
  "deviceName": "Telephone"
}
```

`status` peut valoir :

- `connected` : Spotify configure et morceau courant disponible.
- `not_configured` : variables absentes, incompletes ou deconnexion runtime.
- `error` : erreur API Spotify ou token invalide.
- `no_playback` : Spotify configure, mais aucune lecture active ou aucun morceau courant.

Le serveur utilise le refresh token pour obtenir un access token, puis lit
`https://api.spotify.com/v1/me/player`.
