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
import type {
  DisplayMode,
  DisplayStateV2,
  DrinkMenuItem,
  MatchStatus,
  SpotifyPlaceholder,
} from '../types/display-state.js';
import type { MatchMode, MatchProvider, MatchTeam, ScoreSource } from '../types/match.js';

type MatchOption = {
  id: string;
  homeTeam: MatchTeam;
  awayTeam: MatchTeam;
};

type PublicState = {
  displayMode: DisplayMode;
  matchStatus: MatchStatus;
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
  score: {
    home: number;
    away: number;
    homeScore: number;
    awayScore: number;
  };
  matchTitle: string;
  matchDescription: string;
  matchInfo: DisplayStateV2['matchInfo'];
  bannerMessage: string;
  fullscreenMessage: string;
  drinks: DrinkMenuItem[];
  menu: DisplayStateV2['menu'];
  spotify: SpotifyPlaceholder;
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

type DisplayMessageBody = {
  message?: string;
  text?: string;
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

const happyHourDiscountRate = 0.2;
const baseDrinks = [
  { id: 'pinte-blonde', name: 'Pinte blonde', price: 7 },
  { id: 'pinte-ipa', name: 'Pinte IPA', price: 8 },
  { id: 'verre-vin', name: 'Verre de vin', price: 5 },
  { id: 'cocktail-maison', name: 'Cocktail maison', price: 9 },
  { id: 'soft', name: 'Soft', price: 3.5 },
];

const drinks: DrinkMenuItem[] = baseDrinks.map((drink) => ({
  ...drink,
  happyHourPrice: Number((drink.price * (1 - happyHourDiscountRate)).toFixed(2)),
  currency: 'EUR',
}));

const spotifyPlaceholder: SpotifyPlaceholder = {
  title: '',
  artist: '',
  albumArtUrl: null,
  isPlaying: false,
};

const state: PublicState = {
  displayMode: 'PRE_MATCH',
  matchStatus: 'NOT_STARTED',
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
  score: {
    home: 0,
    away: 0,
    homeScore: 0,
    awayScore: 0,
  },
  matchTitle: 'France vs Unknown',
  matchDescription: 'Avant match',
  matchInfo: {
    homeTeam: franceTeam,
    awayTeam: createTeam('Unknown'),
    homeScore: 0,
    awayScore: 0,
    matchTitle: 'France vs Unknown',
    matchDescription: 'Avant match',
  },
  bannerMessage: '',
  fullscreenMessage: '',
  drinks,
  menu: {
    happyHourDiscountRate,
    drinks,
  },
  spotify: spotifyPlaceholder,
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

function cleanDisplayMessage(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function getMatchTitle(): string {
  return `${state.homeTeam.name} vs ${state.awayTeam.name}`;
}

function getMatchDescription(): string {
  switch (state.matchStatus) {
    case 'FIRST_HALF':
      return 'Premiere mi-temps';
    case 'HALF_TIME':
      return 'Mi-temps';
    case 'SECOND_HALF':
      return 'Deuxieme mi-temps';
    case 'FINISHED':
      return 'Match termine';
    case 'NOT_STARTED':
    default:
      return 'Avant match';
  }
}

function getDisplayMode(): DisplayMode {
  if (state.fullscreenMessage) {
    return 'FULLSCREEN_MESSAGE';
  }

  if (state.happyHourActive) {
    return 'HAPPY_HOUR';
  }

  switch (state.matchStatus) {
    case 'FIRST_HALF':
    case 'SECOND_HALF':
      return 'MATCH_LIVE';
    case 'HALF_TIME':
      return 'HALF_TIME';
    case 'FINISHED':
      return 'FULL_TIME';
    case 'NOT_STARTED':
      return state.selectedMatchId ? 'PRE_MATCH' : 'IDLE';
    default:
      return 'IDLE';
  }
}

function getState(): PublicState {
  const scoreLockRemainingSeconds = getScoreLockRemainingSeconds();
  const scoreLockActive = scoreLockRemainingSeconds > 0;
  const matchTitle = getMatchTitle();
  const matchDescription = getMatchDescription();
  const matchInfo = {
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    matchTitle,
    matchDescription,
  };

  return {
    ...state,
    displayMode: getDisplayMode(),
    scoreLockActive,
    scoreLockRemainingSeconds,
    canUndoLastAction: scoreLockActive && lastScoreAction !== null,
    lastActionLabel: scoreLockActive ? getLastActionLabel(lastScoreAction) : null,
    score: {
      home: state.homeScore,
      away: state.awayScore,
      homeScore: state.homeScore,
      awayScore: state.awayScore,
    },
    matchTitle,
    matchDescription,
    matchInfo,
    drinks,
    menu: {
      happyHourDiscountRate,
      drinks,
    },
    spotify: spotifyPlaceholder,
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
  state.matchStatus = 'NOT_STARTED';
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
  state.fullscreenMessage = '';
  scoreLockUntil = 0;
  lastScoreAction = null;
  broadcastState();
  return getState();
}

function applyApiMatchSelection(match: FranceMatchCandidate): PublicState {
  state.selectedMatchId = `api-football-${match.id}`;
  state.matchStarted = true;
  state.matchStatus = 'NOT_STARTED';
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
  state.fullscreenMessage = '';
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

function startMatch(): PublicState {
  state.matchStarted = true;
  state.matchStatus = 'FIRST_HALF';
  broadcastState();
  return getState();
}

function setHalfTime(): PublicState {
  state.matchStarted = true;
  state.matchStatus = 'HALF_TIME';
  broadcastState();
  return getState();
}

function resumeMatch(): PublicState {
  state.matchStarted = true;
  state.matchStatus = 'SECOND_HALF';
  broadcastState();
  return getState();
}

function finishMatch(): PublicState {
  state.matchStarted = false;
  state.matchStatus = 'FINISHED';
  state.happyHourActive = false;
  state.remainingSeconds = 0;
  broadcastState();
  return getState();
}

function setBannerMessage(message: string): PublicState {
  state.bannerMessage = message;
  broadcastState();
  return getState();
}

function setFullscreenMessage(message: string): PublicState {
  state.fullscreenMessage = message;
  broadcastState();
  return getState();
}

function clearDisplayMessages(): PublicState {
  state.bannerMessage = '';
  state.fullscreenMessage = '';
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

app.post('/api/match/start', async () => {
  return startMatch();
});

app.post('/api/match/half-time', async () => {
  return setHalfTime();
});

app.post('/api/match/resume', async () => {
  return resumeMatch();
});

app.post('/api/match/finish', async () => {
  return finishMatch();
});

app.post<{ Body: DisplayMessageBody }>('/api/display/banner', async (request, reply) => {
  const message = cleanDisplayMessage(request.body?.message ?? request.body?.text, 160);

  if (!message) {
    return reply.code(400).send({ error: 'Missing banner message' });
  }

  return setBannerMessage(message);
});

app.post<{ Body: DisplayMessageBody }>('/api/display/fullscreen-message', async (request, reply) => {
  const message = cleanDisplayMessage(request.body?.message ?? request.body?.text, 320);

  if (!message) {
    return reply.code(400).send({ error: 'Missing fullscreen message' });
  }

  return setFullscreenMessage(message);
});

app.post('/api/display/clear-message', async () => {
  return clearDisplayMessages();
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
