export const config = {
    appPort: Number(process.env.APP_PORT ?? 3000),
    happyHourDurationSeconds: Number(process.env.HAPPY_HOUR_DURATION_SECONDS ?? 300),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    spotifyRedirectUri: (process.env.SPOTIFY_REDIRECT_URI ?? 'http://localhost:3000/api/spotify/callback').trim(),
};
