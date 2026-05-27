import 'dotenv/config';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { ApiFootballProvider } from './football/api-football-provider.js';
import type { FranceMatchCandidate } from './football/football-provider.js';
import { createTeam } from './football/team-names.js';
import type { MatchMode, MatchProvider, MatchTeam, ScoreSource } from '../types/match.js';

type MatchOption = {
  id: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
};

type PublicState = {
  happyHourActive: boolean;
  remainingSeconds: number;
  scoreLockActive: boolean;
  scoreLockRemainingSeconds: number;
  canUndoLastAction: boolean;
  lastActionLabel: string | null;
  selectedMatchId: string;
  matchStarted: boolean;
  matchMode: MatchMode;
  scoreSource: ScoreSource;
  source: ScoreSource;
  provider: MatchProvider;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
  homeScore: number;
  awayScore: number;
};

type SelectMatchBody = {
  matchId?: string;
  mode?: MatchMode;
  customAwayTeam?: string;
  customAwayShortName?: string;
};

type SelectApiMatchBody = {
  matchId?: string;
};

type ScoreActionType = 'home-goal' | 'away-goal';

type LastScoreAction = {
  type: ScoreActionType;
  team: MatchTeam;
  previousScore: {
    home: number;
    away: number;
  };
  newScore: {
    home: number;
    away: number;
  };
  triggeredHappyHour: boolean;
  timestamp: number;
};

const app = Fastify({
  logger: true,
});

const webRoot = resolve(process.cwd(), 'src/web');
const barRoot = resolve(webRoot, 'bar');
const salleRoot = resolve(webRoot, 'salle');
const tvRoot = resolve(webRoot, 'tv');

const franceTeam = createTeam('France');

const quickSimulationMatches: MatchOption[] = [
  { id: 'france-unknown', homeTeam: franceTeam, awayTeam: createTeam('Unknown') },
  { id: 'france-germany', homeTeam: franceTeam, awayTeam: createTeam('Allemagne') },
  { id: 'france-spain', homeTeam: franceTeam, awayTeam: createTeam('Espagne') },
  { id: 'france-italy', homeTeam: franceTeam, awayTeam: createTeam('Italie') },
];

const apiFootballProvider = new ApiFootballProvider();
let cachedFranceApiMatches: FranceMatchCandidate[] = [];

const state: PublicState = {
  happyHourActive: false,
  remainingSeconds: 0,
  scoreLockActive: false,
  scoreLockRemainingSeconds: 0,
  canUndoLastAction: false,
  lastActionLabel: null,
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

const sockets = new Set<WebSocket>();
const websocketServer = new WebSocketServer({ noServer: true });
const scoreLockDurationSeconds = 30;
let scoreLockUntil = 0;
let lastScoreAction: LastScoreAction | null = null;

app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, _body, done) => {
  done(null, {});
});

function getScoreLockRemainingSeconds(): number {
  return Math.max(0, Math.ceil((scoreLockUntil - Date.now()) / 1000));
}

function getLastActionLabel(action: LastScoreAction | null): string | null {
  if (!action) {
    return null;
  }

  return action.type === 'home-goal'
    ? `But ${action.team.name}`
    : `But ${action.team.name}`;
}

function getState(): PublicState {
  const scoreLockRemainingSeconds = getScoreLockRemainingSeconds();
  const scoreLockActive = scoreLockRemainingSeconds > 0;

  return {
    ...state,
    scoreLockActive,
    scoreLockRemainingSeconds,
    canUndoLastAction: scoreLockActive && lastScoreAction !== null,
    lastActionLabel: scoreLockActive ? getLastActionLabel(lastScoreAction) : null,
  };
}

function sendState(socket: WebSocket): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(getState()));
  }
}

function broadcastState(): void {
  for (const socket of sockets) {
    sendState(socket);
  }
}

function startHappyHour(): void {
  state.happyHourActive = true;
  state.remainingSeconds = config.happyHourDurationSeconds;
  broadcastState();
}

function resetHappyHour(): void {
  if (state.happyHourActive) {
    state.remainingSeconds = config.happyHourDurationSeconds;
    broadcastState();
  }
}

function stopHappyHour(): void {
  state.happyHourActive = false;
  state.remainingSeconds = 0;
  broadcastState();
}

function cleanOpponentName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, 48);
}

function cleanOpponentShortName(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function withCustomShortName(team: MatchTeam, shortName = ''): MatchTeam {
  const cleanShortName = cleanOpponentShortName(shortName);

  if (!cleanShortName) {
    return team;
  }

  return {
    ...team,
    shortName: cleanShortName,
  };
}

function selectMatch(matchId: string, mode: MatchMode, customAwayTeam = '', customAwayShortName = ''): PublicState {
  const customOpponent = cleanOpponentName(customAwayTeam);
  const customShortName = cleanOpponentShortName(customAwayShortName);
  const quickMatch = quickSimulationMatches.find((option) => option.id === matchId);
  const match = customOpponent
    ? {
        id: 'france-custom',
        homeTeam: franceTeam,
        awayTeam: withCustomShortName(createTeam(customOpponent), customShortName),
      }
    : quickMatch && {
        ...quickMatch,
        awayTeam: withCustomShortName(quickMatch.awayTeam, customShortName),
      };

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
  scoreLockUntil = 0;
  lastScoreAction = null;
  broadcastState();
  return getState();
}

function applyApiMatchSelection(match: FranceMatchCandidate): PublicState {
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
  scoreLockUntil = 0;
  lastScoreAction = null;
  broadcastState();
  return getState();
}

async function selectApiMatch(matchId: string): Promise<PublicState> {
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

function startScoreLock(): void {
  scoreLockUntil = Date.now() + scoreLockDurationSeconds * 1000;
}

function scoreLockedError() {
  return {
    ok: false,
    error: 'score_locked',
    lockRemainingSeconds: getScoreLockRemainingSeconds(),
  };
}

function addHomeGoal(): PublicState {
  const previousHomeScore = state.homeScore;
  const previousAwayScore = state.awayScore;
  state.homeScore += 1;

  if (state.happyHourActive) {
    state.remainingSeconds = config.happyHourDurationSeconds;
  } else {
    state.happyHourActive = true;
    state.remainingSeconds = config.happyHourDurationSeconds;
  }

  lastScoreAction = {
    type: 'home-goal',
    team: state.homeTeam,
    previousScore: {
      home: previousHomeScore,
      away: previousAwayScore,
    },
    newScore: {
      home: state.homeScore,
      away: state.awayScore,
    },
    triggeredHappyHour: true,
    timestamp: Date.now(),
  };
  startScoreLock();
  broadcastState();
  return getState();
}

function addAwayGoal(): PublicState {
  const previousHomeScore = state.homeScore;
  const previousAwayScore = state.awayScore;
  state.awayScore += 1;
  lastScoreAction = {
    type: 'away-goal',
    team: state.awayTeam,
    previousScore: {
      home: previousHomeScore,
      away: previousAwayScore,
    },
    newScore: {
      home: state.homeScore,
      away: state.awayScore,
    },
    triggeredHappyHour: false,
    timestamp: Date.now(),
  };
  startScoreLock();
  broadcastState();
  return getState();
}

function resetScore(): PublicState {
  state.homeScore = 0;
  state.awayScore = 0;
  scoreLockUntil = 0;
  lastScoreAction = null;
  broadcastState();
  return getState();
}

function undoLastScoreAction(): PublicState {
  if (!lastScoreAction || getScoreLockRemainingSeconds() === 0) {
    throw new Error('No score action to undo');
  }

  if (lastScoreAction.type === 'home-goal') {
    state.homeScore = Math.max(0, lastScoreAction.previousScore.home);

    if (lastScoreAction.triggeredHappyHour) {
      state.happyHourActive = false;
      state.remainingSeconds = 0;
    }
  } else {
    state.awayScore = Math.max(0, lastScoreAction.previousScore.away);
  }

  lastScoreAction = null;
  scoreLockUntil = 0;
  broadcastState();
  return getState();
}

function readHtml(root: string): Promise<string> {
  return readFile(resolve(root, 'index.html'), 'utf8');
}

setInterval(() => {
  const wasScoreLocked = getScoreLockRemainingSeconds() > 0;

  if (state.happyHourActive) {
    state.remainingSeconds = Math.max(0, state.remainingSeconds - 1);

    if (state.remainingSeconds === 0) {
      state.happyHourActive = false;
    }
  }

  if (wasScoreLocked && getScoreLockRemainingSeconds() === 0) {
    lastScoreAction = null;
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
  } catch (error) {
    cachedFranceApiMatches = [];

    return {
      provider: apiFootballProvider.provider,
      configured,
      matches: [],
      error: error instanceof Error ? error.message : 'Erreur API Football',
    };
  }
});

app.post<{ Body: SelectMatchBody }>('/api/match/select', async (request, reply) => {
  const matchId = request.body?.matchId ?? '';
  const mode = request.body?.mode ?? 'simulation';

  if (mode !== 'simulation' && mode !== 'api-live') {
    return reply.code(400).send({ error: 'Invalid match mode' });
  }

  try {
    return selectMatch(matchId, mode, request.body?.customAwayTeam, request.body?.customAwayShortName);
  } catch {
    return reply.code(400).send({ error: 'Invalid match selection' });
  }
});

app.post<{ Body: SelectApiMatchBody }>('/api/match/select-api', async (request, reply) => {
  const matchId = request.body?.matchId ?? '';

  if (!matchId) {
    return reply.code(400).send({ error: 'Missing match id' });
  }

  try {
    return await selectApiMatch(matchId);
  } catch (error) {
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

app.post('/api/simulation/home-goal', async (_request, reply) => {
  if (getScoreLockRemainingSeconds() > 0) {
    return reply.code(409).send(scoreLockedError());
  }

  return addHomeGoal();
});

app.post('/api/simulation/away-goal', async (_request, reply) => {
  if (getScoreLockRemainingSeconds() > 0) {
    return reply.code(409).send(scoreLockedError());
  }

  return addAwayGoal();
});

app.post('/api/simulation/reset-score', async () => {
  return resetScore();
});

app.post('/api/simulation/undo-last', async (_request, reply) => {
  try {
    return undoLastScoreAction();
  } catch {
    return reply.code(409).send({
      ok: false,
      error: 'no_undo_available',
    });
  }
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

app.get('/salle', async (_request, reply) => {
  const html = await readHtml(salleRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/salle/', async (_request, reply) => {
  const html = await readHtml(salleRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/salle/salle.js', async (_request, reply) => {
  const script = await readFile(resolve(salleRoot, 'salle.ts'), 'utf8');
  return reply.type('application/javascript; charset=utf-8').send(script);
});

app.get('/salle/salle.css', async (_request, reply) => {
  const style = await readFile(resolve(salleRoot, 'salle.css'), 'utf8');
  return reply.type('text/css; charset=utf-8').send(style);
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
