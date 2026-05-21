import { createTeam } from './team-names.js';
const maxReturnedMatches = 8;
const seasonsToRead = 5;
const liveStatuses = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'SUSP', 'INT', 'LIVE']);
const upcomingStatuses = new Set(['TBD', 'NS']);
export class ApiFootballProvider {
    apiKey;
    baseUrl;
    provider = 'api-football';
    constructor(apiKey = process.env.API_FOOTBALL_KEY ?? '', baseUrl = process.env.API_FOOTBALL_BASE_URL ?? 'https://v3.football.api-sports.io') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }
    isConfigured() {
        return this.apiKey.trim().length > 0;
    }
    async getFranceMatches() {
        if (!this.isConfigured()) {
            return [];
        }
        const franceTeamId = await this.getFranceTeamId();
        const currentYear = new Date().getFullYear();
        const seasons = Array.from({ length: seasonsToRead }, (_value, index) => currentYear - index);
        const seasonResults = await Promise.all(seasons.map((season) => this.fetchFixturesForSeasonSafely(franceTeamId, season)));
        const successfulResults = seasonResults.filter((result) => result.success);
        if (successfulResults.length === 0) {
            const firstError = seasonResults.find((result) => result.error)?.error;
            throw new Error(firstError || 'Aucun match France trouve');
        }
        const fixturesById = new Map();
        for (const fixture of successfulResults.flatMap((result) => result.matches)) {
            fixturesById.set(fixture.id, fixture);
        }
        return this.filterRelevantMatches([...fixturesById.values()]);
    }
    async getFranceTeamId() {
        const payload = await this.fetchApi('teams', {
            search: 'France',
        });
        const teams = Array.isArray(payload.response) ? payload.response : [];
        const franceTeam = teams.find((item) => {
            const team = item.team;
            return team?.national === true && team.name?.toLowerCase() === 'france';
        }) ?? teams.find((item) => {
            const team = item.team;
            return team?.national === true && team.country?.toLowerCase() === 'france';
        }) ?? teams.find((item) => item.team?.name?.toLowerCase() === 'france');
        const teamId = franceTeam?.team?.id;
        if (typeof teamId !== 'number') {
            throw new Error('Equipe France introuvable');
        }
        return teamId;
    }
    async fetchFixturesForSeason(teamId, season) {
        const payload = await this.fetchApi('fixtures', {
            team: String(teamId),
            season: String(season),
            timezone: 'Europe/Paris',
        });
        const fixtures = Array.isArray(payload.response) ? payload.response : [];
        return fixtures.flatMap((item) => {
            const fixtureId = item.fixture?.id;
            if (typeof fixtureId !== 'number') {
                return [];
            }
            return [{
                    id: String(fixtureId),
                    homeTeam: createTeam(item.teams?.home?.name ?? 'Unknown', item.teams?.home?.code ?? ''),
                    awayTeam: createTeam(item.teams?.away?.name ?? 'Unknown', item.teams?.away?.code ?? ''),
                    homeScore: item.goals?.home ?? 0,
                    awayScore: item.goals?.away ?? 0,
                    status: item.fixture?.status?.short ?? item.fixture?.status?.long ?? 'UNKNOWN',
                    kickoffAt: item.fixture?.date,
                    source: this.provider,
                    provider: this.provider,
                }];
        });
    }
    async fetchFixturesForSeasonSafely(teamId, season) {
        try {
            return {
                success: true,
                matches: await this.fetchFixturesForSeason(teamId, season),
            };
        }
        catch (error) {
            return {
                success: false,
                matches: [],
                error: error instanceof Error ? error.message : `Erreur saison ${season}`,
            };
        }
    }
    filterRelevantMatches(matches) {
        const now = Date.now();
        const liveMatches = matches
            .filter((match) => liveStatuses.has(match.status))
            .sort((first, second) => this.getMatchTime(first) - this.getMatchTime(second));
        const upcomingMatches = matches
            .filter((match) => this.isUpcomingMatch(match, now))
            .sort((first, second) => this.getMatchTime(first) - this.getMatchTime(second));
        const recentMatches = matches
            .filter((match) => this.isRecentMatch(match, now))
            .sort((first, second) => this.getMatchTime(second) - this.getMatchTime(first));
        const relevantMatches = new Map();
        for (const match of [...liveMatches, ...upcomingMatches, ...recentMatches]) {
            relevantMatches.set(match.id, match);
            if (relevantMatches.size >= maxReturnedMatches) {
                break;
            }
        }
        return [...relevantMatches.values()];
    }
    isUpcomingMatch(match, now) {
        const matchTime = this.getMatchTime(match);
        return matchTime >= now && (upcomingStatuses.has(match.status) || !liveStatuses.has(match.status));
    }
    isRecentMatch(match, now) {
        const matchTime = this.getMatchTime(match);
        return matchTime > 0 && matchTime < now && !liveStatuses.has(match.status);
    }
    getMatchTime(match) {
        return match.kickoffAt ? Date.parse(match.kickoffAt) || 0 : 0;
    }
    async fetchApi(endpoint, params) {
        const url = new URL(endpoint.replace(/^\/+/, ''), `${this.baseUrl.replace(/\/+$/, '')}/`);
        for (const [key, value] of Object.entries(params)) {
            url.searchParams.set(key, value);
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
            const response = await fetch(url, {
                headers: {
                    'x-apisports-key': this.apiKey,
                    accept: 'application/json',
                },
                signal: controller.signal,
            });
            if (!response.ok) {
                throw new Error(`API Football HTTP ${response.status}`);
            }
            const payload = await response.json();
            const errorMessage = this.extractApiError(payload.errors);
            if (errorMessage) {
                throw new Error(errorMessage);
            }
            return payload;
        }
        catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('API Football timeout');
            }
            if (error instanceof Error) {
                throw new Error(error.message.slice(0, 120));
            }
            throw new Error('Erreur API Football');
        }
        finally {
            clearTimeout(timeout);
        }
    }
    extractApiError(errors) {
        if (!errors) {
            return '';
        }
        if (Array.isArray(errors)) {
            return errors.filter(Boolean).join(', ').slice(0, 120);
        }
        if (typeof errors === 'object') {
            const values = Object.values(errors).filter(Boolean);
            return values.join(', ').slice(0, 120);
        }
        if (typeof errors === 'string') {
            return errors.slice(0, 120);
        }
        return '';
    }
}
