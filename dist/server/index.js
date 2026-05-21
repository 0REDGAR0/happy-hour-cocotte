import 'dotenv/config';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { ApiFootballProvider } from './football/api-football-provider.js';
import { createTeam } from './football/team-names.js';
const app = Fastify({
    logger: true,
});
const webRoot = resolve(process.cwd(), 'src/web');
const barRoot = resolve(webRoot, 'bar');
const tvRoot = resolve(webRoot, 'tv');
const franceTeam = createTeam('France');
const quickSimulationMatches = [
    { id: 'france-unknown', homeTeam: franceTeam, awayTeam: createTeam('Unknown') },
    { id: 'france-germany', homeTeam: franceTeam, awayTeam: createTeam('Allemagne') },
    { id: 'france-spain', homeTeam: franceTeam, awayTeam: createTeam('Espagne') },
    { id: 'france-italy', homeTeam: franceTeam, awayTeam: createTeam('Italie') },
];
const apiFootballProvider = new ApiFootballProvider();
let cachedFranceApiMatches = [];
const state = {
    happyHourActive: false,
    remainingSeconds: 0,
    selectedMatchId: 'france-unknown',
    matchStarted: false,
    matchMode: 'simulation',
    scoreSource: 'simulation',
    source: 'simulation',
    provider: 'manual',
    homeTeam: franceTeam,
    awayTeam: createTeam('Unknown'),
    homeScore: 0,
    awayScore: 0,
};
const sockets = new Set();
const websocketServer = new WebSocketServer({ noServer: true });
app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, _body, done) => {
    done(null, {});
});
function getState() {
    return { ...state };
}
function sendState(socket) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(getState()));
    }
}
function broadcastState() {
    for (const socket of sockets) {
        sendState(socket);
    }
}
function startHappyHour() {
    state.happyHourActive = true;
    state.remainingSeconds = config.happyHourDurationSeconds;
    broadcastState();
}
function resetHappyHour() {
    if (state.happyHourActive) {
        state.remainingSeconds = config.happyHourDurationSeconds;
        broadcastState();
    }
}
function stopHappyHour() {
    state.happyHourActive = false;
    state.remainingSeconds = 0;
    broadcastState();
}
function cleanOpponentName(value) {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}
function selectMatch(matchId, mode, customAwayTeam = '') {
    const customOpponent = cleanOpponentName(customAwayTeam);
    const quickMatch = quickSimulationMatches.find((option) => option.id === matchId);
    const match = customOpponent
        ? { id: 'france-custom', homeTeam: franceTeam, awayTeam: createTeam(customOpponent) }
        : quickMatch;
    if (!match) {
        throw new Error('Unknown match');
    }
    state.selectedMatchId = customOpponent ? `france-custom-${customOpponent.toLowerCase()}` : match.id;
    state.matchStarted = true;
    state.matchMode = mode;
    state.scoreSource = mode === 'simulation' ? 'simulation' : 'api-live-placeholder';
    state.source = state.scoreSource;
    state.provider = mode === 'simulation' ? 'manual' : 'api-football';
    state.homeTeam = match.homeTeam;
    state.awayTeam = match.awayTeam;
    state.homeScore = 0;
    state.awayScore = 0;
    state.happyHourActive = false;
    state.remainingSeconds = 0;
    broadcastState();
    return getState();
}
function applyApiMatchSelection(match) {
    state.selectedMatchId = `api-football-${match.id}`;
    state.matchStarted = true;
    state.matchMode = 'api-live';
    state.scoreSource = 'api-live-placeholder';
    state.source = state.scoreSource;
    state.provider = 'api-football';
    state.homeTeam = match.homeTeam;
    state.awayTeam = match.awayTeam;
    state.homeScore = match.homeScore;
    state.awayScore = match.awayScore;
    state.happyHourActive = false;
    state.remainingSeconds = 0;
    broadcastState();
    return getState();
}
async function selectApiMatch(matchId) {
    if (!apiFootballProvider.isConfigured()) {
        throw new Error('API Football not configured');
    }
    let match = cachedFranceApiMatches.find((candidate) => candidate.id === matchId);
    if (!match) {
        cachedFranceApiMatches = await apiFootballProvider.getFranceMatches();
        match = cachedFranceApiMatches.find((candidate) => candidate.id === matchId);
    }
    if (!match) {
        throw new Error('Unknown API match');
    }
    return applyApiMatchSelection(match);
}
function addHomeGoal() {
    state.homeScore += 1;
    if (state.happyHourActive) {
        state.remainingSeconds = config.happyHourDurationSeconds;
    }
    else {
        state.happyHourActive = true;
        state.remainingSeconds = config.happyHourDurationSeconds;
    }
    broadcastState();
    return getState();
}
function addAwayGoal() {
    state.awayScore += 1;
    broadcastState();
    return getState();
}
function resetScore() {
    state.homeScore = 0;
    state.awayScore = 0;
    broadcastState();
    return getState();
}
function readHtml(root) {
    return readFile(resolve(root, 'index.html'), 'utf8');
}
setInterval(() => {
    if (state.happyHourActive) {
        state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);
        if (state.remainingSeconds === 0) {
            state.happyHourActive = false;
        }
    }
    broadcastState();
}, 1000);
websocketServer.on('connection', (socket) => {
    sockets.add(socket);
    sendState(socket);
    socket.on('close', () => {
        sockets.delete(socket);
    });
});
app.server.on('upgrade', (request, socket, head) => {
    if (request.url !== '/ws') {
        socket.destroy();
        return;
    }
    websocketServer.handleUpgrade(request, socket, head, (client) => {
        websocketServer.emit('connection', client, request);
    });
});
app.get('/health', async () => {
    return { status: 'ok' };
});
app.get('/api/state', async () => {
    return getState();
});
app.get('/api/matches', async () => {
    return {
        modes: [
            { id: 'simulation', label: 'Match simule' },
            { id: 'api-live', label: 'API live' },
        ],
        matches: quickSimulationMatches,
        quickOpponents: quickSimulationMatches.map((match) => ({
            id: match.id,
            name: match.awayTeam.name,
            shortName: match.awayTeam.shortName,
        })),
        selectedMatchId: state.selectedMatchId,
        matchMode: state.matchMode,
        customAwayTeam: state.selectedMatchId.startsWith('france-custom-') ? state.awayTeam.name : '',
    };
});
app.get('/api/matches/france', async () => {
    const configured = apiFootballProvider.isConfigured();
    if (!configured) {
        cachedFranceApiMatches = [];
        return {
            provider: apiFootballProvider.provider,
            configured,
            matches: [],
        };
    }
    try {
        cachedFranceApiMatches = await apiFootballProvider.getFranceMatches();
        return {
            provider: apiFootballProvider.provider,
            configured,
            matches: cachedFranceApiMatches,
        };
    }
    catch (error) {
        cachedFranceApiMatches = [];
        return {
            provider: apiFootballProvider.provider,
            configured,
            matches: [],
            error: error instanceof Error ? error.message : 'Erreur API Football',
        };
    }
});
app.post('/api/match/select', async (request, reply) => {
    const matchId = request.body?.matchId ?? '';
    const mode = request.body?.mode ?? 'simulation';
    if (mode !== 'simulation' && mode !== 'api-live') {
        return reply.code(400).send({ error: 'Invalid match mode' });
    }
    try {
        return selectMatch(matchId, mode, request.body?.customAwayTeam);
    }
    catch {
        return reply.code(400).send({ error: 'Invalid match selection' });
    }
});
app.post('/api/match/select-api', async (request, reply) => {
    const matchId = request.body?.matchId ?? '';
    if (!matchId) {
        return reply.code(400).send({ error: 'Missing match id' });
    }
    try {
        return await selectApiMatch(matchId);
    }
    catch (error) {
        return reply.code(400).send({
            error: error instanceof Error ? error.message : 'Invalid API match selection',
        });
    }
});
app.post('/api/override/start', async () => {
    startHappyHour();
    return getState();
});
app.post('/api/override/reset', async () => {
    resetHappyHour();
    return getState();
});
app.post('/api/override/stop', async () => {
    stopHappyHour();
    return getState();
});
app.post('/api/simulation/home-goal', async () => {
    return addHomeGoal();
});
app.post('/api/simulation/away-goal', async () => {
    return addAwayGoal();
});
app.post('/api/simulation/reset-score', async () => {
    return resetScore();
});
app.get('/bar', async (_request, reply) => {
    const html = await readHtml(barRoot);
    return reply.type('text/html; charset=utf-8').send(html);
});
app.get('/bar/', async (_request, reply) => {
    const html = await readHtml(barRoot);
    return reply.type('text/html; charset=utf-8').send(html);
});
app.get('/bar/setup', async (_request, reply) => {
    const html = await readFile(resolve(barRoot, 'setup.html'), 'utf8');
    return reply.type('text/html; charset=utf-8').send(html);
});
app.get('/bar/setup.js', async (_request, reply) => {
    const script = await readFile(resolve(barRoot, 'setup.ts'), 'utf8');
    return reply.type('application/javascript; charset=utf-8').send(script);
});
app.get('/bar/bar.js', async (_request, reply) => {
    const script = await readFile(resolve(barRoot, 'bar.ts'), 'utf8');
    return reply.type('application/javascript; charset=utf-8').send(script);
});
app.get('/tv', async (_request, reply) => {
    const html = await readHtml(tvRoot);
    return reply.type('text/html; charset=utf-8').send(html);
});
app.get('/tv/', async (_request, reply) => {
    const html = await readHtml(tvRoot);
    return reply.type('text/html; charset=utf-8').send(html);
});
app.get('/tv/tv.js', async (_request, reply) => {
    const script = await readFile(resolve(tvRoot, 'tv.ts'), 'utf8');
    return reply.type('application/javascript; charset=utf-8').send(script);
});
await app.register(fastifyStatic, {
    root: webRoot,
    prefix: '/',
});
const address = await app.listen({
    host: '0.0.0.0',
    port: config.appPort,
});
console.log(`Cocotte Goal Happy Hour server listening on ${address}`);
