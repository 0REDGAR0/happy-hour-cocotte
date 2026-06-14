import { randomBytes } from 'node:crypto';
const spotifyScopes = [
    'user-read-currently-playing',
    'user-read-playback-state',
];
const emptySpotifyState = {
    status: 'not_configured',
    title: '',
    artist: '',
    albumArtUrl: null,
    isPlaying: false,
    progressMs: null,
    durationMs: null,
    deviceName: null,
};
export class SpotifyService {
    redirectUri;
    accessToken = '';
    accessTokenExpiresAt = 0;
    pendingStates = new Set();
    runtimeDisconnected = false;
    lastState = emptySpotifyState;
    constructor(redirectUri) {
        this.redirectUri = redirectUri;
    }
    hasClientCredentials() {
        return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
    }
    hasRefreshToken() {
        return Boolean(process.env.SPOTIFY_REFRESH_TOKEN) && !this.runtimeDisconnected;
    }
    isConfigured() {
        return this.hasClientCredentials() && this.hasRefreshToken();
    }
    createLoginUrl() {
        if (!this.hasClientCredentials()) {
            throw new Error('Spotify client credentials are missing');
        }
        const state = randomBytes(16).toString('hex');
        this.pendingStates.add(state);
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: process.env.SPOTIFY_CLIENT_ID ?? '',
            scope: spotifyScopes.join(' '),
            redirect_uri: this.redirectUri,
            state,
            show_dialog: 'true',
        });
        return `https://accounts.spotify.com/authorize?${params.toString()}`;
    }
    async exchangeCodeForRefreshToken(code, state) {
        if (!this.hasClientCredentials()) {
            throw new Error('Spotify client credentials are missing');
        }
        if (!state || !this.pendingStates.has(state)) {
            throw new Error('Invalid Spotify OAuth state');
        }
        this.pendingStates.delete(state);
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.redirectUri,
        });
        const payload = await this.requestToken(body);
        if (!payload.refresh_token) {
            throw new Error('Spotify refresh token missing');
        }
        this.runtimeDisconnected = false;
        return payload.refresh_token;
    }
    disconnect() {
        this.accessToken = '';
        this.accessTokenExpiresAt = 0;
        this.runtimeDisconnected = true;
        this.lastState = {
            ...emptySpotifyState,
            status: 'not_configured',
        };
    }
    getStatus() {
        const status = this.lastState.status === 'not_configured' && this.isConfigured()
            ? 'no_playback'
            : this.lastState.status;
        return {
            configured: this.isConfigured(),
            hasClientId: Boolean(process.env.SPOTIFY_CLIENT_ID),
            hasClientSecret: Boolean(process.env.SPOTIFY_CLIENT_SECRET),
            hasRefreshToken: this.hasRefreshToken(),
            redirectUri: this.redirectUri,
            status: this.isConfigured() ? status : 'not_configured',
        };
    }
    async getCurrentlyPlaying() {
        if (!this.isConfigured()) {
            this.lastState = {
                ...emptySpotifyState,
                status: 'not_configured',
            };
            return this.lastState;
        }
        try {
            const accessToken = await this.getAccessToken();
            const response = await fetch('https://api.spotify.com/v1/me/player', {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });
            if (response.status === 204 || response.status === 202) {
                this.lastState = {
                    ...emptySpotifyState,
                    status: 'no_playback',
                };
                return this.lastState;
            }
            if (!response.ok) {
                this.lastState = {
                    ...emptySpotifyState,
                    status: 'error',
                };
                return this.lastState;
            }
            const payload = await response.json();
            const item = payload.item;
            if (!item) {
                this.lastState = {
                    ...emptySpotifyState,
                    status: 'no_playback',
                    isPlaying: Boolean(payload.is_playing),
                    progressMs: typeof payload.progress_ms === 'number' ? payload.progress_ms : null,
                    deviceName: payload.device?.name ?? null,
                };
                return this.lastState;
            }
            this.lastState = {
                status: 'connected',
                title: item.name ?? '',
                artist: item.artists?.map((artist) => artist.name).filter(Boolean).join(', ') ?? '',
                albumArtUrl: item.album?.images?.[0]?.url ?? null,
                isPlaying: Boolean(payload.is_playing),
                progressMs: typeof payload.progress_ms === 'number' ? payload.progress_ms : null,
                durationMs: typeof item.duration_ms === 'number' ? item.duration_ms : null,
                deviceName: payload.device?.name ?? null,
            };
            return this.lastState;
        }
        catch {
            this.lastState = {
                ...emptySpotifyState,
                status: 'error',
            };
            return this.lastState;
        }
    }
    async getAccessToken() {
        if (this.accessToken && Date.now() < this.accessTokenExpiresAt) {
            return this.accessToken;
        }
        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: process.env.SPOTIFY_REFRESH_TOKEN ?? '',
        });
        const payload = await this.requestToken(body);
        if (!payload.access_token) {
            throw new Error('Spotify access token missing');
        }
        this.accessToken = payload.access_token;
        this.accessTokenExpiresAt = Date.now() + Math.max(30, (payload.expires_in ?? 3600) - 60) * 1000;
        return this.accessToken;
    }
    async requestToken(body) {
        const credentials = Buffer
            .from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`)
            .toString('base64');
        const response = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        const payload = await response.json();
        if (!response.ok) {
            throw new Error(payload.error || 'Spotify token request failed');
        }
        return payload;
    }
}
