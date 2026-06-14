import 'dotenv/config';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { config } from './config.js';
import { ApiFootballProvider } from './football/api-football-provider.js';
import type { FranceMatchCandidate } from './football/football-provider.js';
import { createTeam } from './football/team-names.js';
import { SpotifyService } from './spotify/spotify-service.js';
import {
  createDrink as createPersistedDrink,
  createEventBanner,
  createLivelyMessage,
  createProgramItem,
  deleteDrink as deletePersistedDrink,
  deleteEventBanner,
  deleteLivelyMessage,
  deleteProgramItem,
  getPersistedMatchInfo,
  getPreMatchConfig,
  initializePersistentContent,
  listActiveDrinks,
  listActiveEventBanners,
  listActiveLivelyMessages,
  listActiveProgramItems,
  listDrinks,
  listEventBanners,
  listLivelyMessages,
  listProgramItems,
  updateLivelyMessage,
  updateEventBanner,
  updateDrink as updatePersistedDrink,
  updatePersistedMatchInfo,
  updatePreMatchConfig,
  updateProgramItem,
  type DrinkInput,
  type EventBannerInput,
  type LivelyMessageInput,
  type ProgramItemInput,
} from './storage/persistent-content.js';
import type {
  DisplayMode,
  DisplayStateV2,
  DrinkMenuItem,
  MatchStatus,
  PreMatchState,
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
  preMatch: PreMatchState;
  bannerMessage: string;
  fullscreenMessage: string;
  eventBanners: DisplayStateV2['eventBanners'];
  livelyMessages: DisplayStateV2['livelyMessages'];
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

type SpotifyCallbackQuery = {
  code?: string;
  state?: string;
  error?: string;
};

type PreMatchConfigureBody = {
  kickoffAt?: string;
  programMessages?: string[];
  homeFlag?: string;
  awayFlag?: string;
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

app.addHook('onSend', async (_request, reply, payload) => {
  const contentType = reply.getHeader('content-type');

  if (typeof contentType === 'string'
    && contentType.toLowerCase().startsWith('application/json')
    && !contentType.toLowerCase().includes('charset=')) {
    reply.header('content-type', 'application/json; charset=utf-8');
  }

  return payload;
});

const webRoot = resolve(process.cwd(), 'src/web');
const barRoot = resolve(webRoot, 'bar');
const salleRoot = resolve(webRoot, 'salle');
const tabletteRoot = resolve(webRoot, 'tablette');

const franceTeam = createTeam('France');

const quickSimulationMatches: MatchOption[] = [
  { id: 'france-unknown', homeTeam: franceTeam, awayTeam: createTeam('Unknown') },
  { id: 'france-germany', homeTeam: franceTeam, awayTeam: createTeam('Allemagne') },
  { id: 'france-spain', homeTeam: franceTeam, awayTeam: createTeam('Espagne') },
  { id: 'france-italy', homeTeam: franceTeam, awayTeam: createTeam('Italie') },
];

const apiFootballProvider = new ApiFootballProvider();
const spotifyService = new SpotifyService(config.spotifyRedirectUri);
let cachedFranceApiMatches: FranceMatchCandidate[] = [];

const happyHourDiscountRate = 0.2;
await initializePersistentContent();

const spotifyPlaceholder: SpotifyPlaceholder = {
  status: spotifyService.isConfigured() ? 'no_playback' : 'not_configured',
  title: '',
  artist: '',
  albumArtUrl: null,
  isPlaying: false,
  progressMs: null,
  durationMs: null,
  deviceName: null,
};
let spotifyState: SpotifyPlaceholder = spotifyPlaceholder;

const defaultPreMatchProgramMessages = [
  'Service au bar pendant tout le match',
  '10 minutes de Happy Hour Ã  chaque but de la France',
  'Les offres sâ€™affichent automatiquement sur la TV',
];

const persistedPreMatch = getPreMatchConfig();
const persistedMatch = getPersistedMatchInfo();

const state: PublicState = {
  displayMode: 'PRE_MATCH',
  matchStatus: 'NOT_STARTED',
  happyHourActive: false,
  remainingSeconds: 0,
  scoreLockActive: false,
  scoreLockRemainingSeconds: 0,
  canUndoLastAction: false,
  lastActionLabel: null,
  selectedMatchId: persistedMatch.selectedMatchId,
  matchStarted: persistedMatch.matchStarted,
  matchMode: persistedMatch.matchMode,
  scoreSource: persistedMatch.scoreSource,
  source: persistedMatch.source,
  provider: persistedMatch.provider,
  homeTeam: persistedMatch.homeTeam,
  awayTeam: persistedMatch.awayTeam,
  homeScore: persistedMatch.homeScore,
  awayScore: persistedMatch.awayScore,
  score: {
    home: 0,
    away: 0,
    homeScore: 0,
    awayScore: 0,
  },
  matchTitle: `${persistedMatch.homeTeam.name} vs ${persistedMatch.awayTeam.name}`,
  matchDescription: 'Avant match',
  matchInfo: {
    homeTeam: persistedMatch.homeTeam,
    awayTeam: persistedMatch.awayTeam,
    homeTeamName: persistedMatch.homeTeam.name || null,
    awayTeamName: persistedMatch.awayTeam.name || null,
    homeScore: persistedMatch.homeScore,
    awayScore: persistedMatch.awayScore,
    matchTitle: `${persistedMatch.homeTeam.name} vs ${persistedMatch.awayTeam.name}`,
    matchDescription: 'Avant match',
    kickoffAt: null,
  },
  preMatch: {
    enabled: persistedPreMatch.enabled,
    kickoffAt: persistedPreMatch.kickoffAt,
    programMessages: listActiveProgramItems().map((item) => item.text),
    programItems: listActiveProgramItems(),
    homeFlag: persistedPreMatch.homeFlag,
    awayFlag: persistedPreMatch.awayFlag,
  },
  bannerMessage: '',
  fullscreenMessage: '',
  eventBanners: listActiveEventBanners(),
  livelyMessages: listActiveLivelyMessages(),
  drinks: listActiveDrinks(),
  menu: {
    happyHourDiscountRate,
    drinks: listActiveDrinks(),
  },
  spotify: spotifyPlaceholder,
};

const sockets = new Set<WebSocket>();
const websocketServer = new WebSocketServer({ noServer: true });
const scoreLockDurationSeconds = 30;
const eventBannerDisplayDurationMs = 15000;
let scoreLockUntil = 0;
let lastScoreAction: LastScoreAction | null = null;
let eventBannerClearTimeout: NodeJS.Timeout | null = null;

function getLocalNetworkUrls(port = config.appPort): string[] {
  const urls: string[] = [];

  for (const interfaces of Object.values(networkInterfaces())) {
    for (const address of interfaces ?? []) {
      if (address.family !== 'IPv4' || address.internal) {
        continue;
      }

      urls.push(`http://${address.address}:${port}`);
    }
  }

  return urls;
}

function getServerInfo() {
  const localNetworkUrls = getLocalNetworkUrls();

  return {
    host: '0.0.0.0',
    port: config.appPort,
    publicBaseUrl: config.publicBaseUrl || null,
    localNetworkUrls,
    status: 'ok',
  };
}

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function cleanOptionalDateTime(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().replace(/\s+/g, '').slice(0, 40);
}

function cleanFlag(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }

  const cleanValue = Array.from(value.trim()).slice(0, 4).join('');
  return cleanValue || fallback;
}

function cleanProgramMessages(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return defaultPreMatchProgramMessages;
  }

  const messages = value
    .map((message) => cleanDisplayMessage(message, 140))
    .filter((message) => message.length > 0)
    .slice(0, 6);

  return messages.length > 0 ? messages : defaultPreMatchProgramMessages;
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

function getNormalizedKickoffAt(): string | null {
  const kickoffAt = state.preMatch.kickoffAt.trim();

  if (!kickoffAt) {
    return null;
  }

  const date = new Date(kickoffAt);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

async function persistCurrentMatchInfo(): Promise<void> {
  await updatePersistedMatchInfo({
    selectedMatchId: state.selectedMatchId,
    matchStarted: state.matchStarted,
    matchMode: state.matchMode,
    scoreSource: state.scoreSource,
    source: state.source,
    provider: state.provider,
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
  });
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
      return state.preMatch.enabled && state.selectedMatchId ? 'PRE_MATCH' : 'IDLE';
    default:
      return 'IDLE';
  }
}

function getState(): PublicState {
  const scoreLockRemainingSeconds = getScoreLockRemainingSeconds();
  const scoreLockActive = scoreLockRemainingSeconds > 0;
  const matchTitle = getMatchTitle();
  const matchDescription = getMatchDescription();
  const activeDrinks = listActiveDrinks();
  const activeEventBanners = listActiveEventBanners();
  const activeLivelyMessages = listActiveLivelyMessages();
  const activeProgramItems = listActiveProgramItems();
  const matchInfo = {
    homeTeam: state.homeTeam,
    awayTeam: state.awayTeam,
    homeTeamName: state.homeTeam.name || null,
    awayTeamName: state.awayTeam.name || null,
    homeScore: state.homeScore,
    awayScore: state.awayScore,
    matchTitle,
    matchDescription,
    kickoffAt: getNormalizedKickoffAt(),
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
    preMatch: {
      ...state.preMatch,
      programItems: activeProgramItems,
      programMessages: activeProgramItems.map((item) => item.text),
    },
    eventBanners: activeEventBanners,
    livelyMessages: activeLivelyMessages,
    drinks: activeDrinks,
    menu: {
      happyHourDiscountRate,
      drinks: activeDrinks,
    },
    spotify: spotifyState,
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

async function selectMatch(matchId: string, mode: MatchMode, customAwayTeam = '', customAwayShortName = ''): Promise<PublicState> {
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
  state.preMatch.enabled = true;
  state.fullscreenMessage = '';
  scoreLockUntil = 0;
  lastScoreAction = null;
  await persistCurrentMatchInfo();
  broadcastState();
  return getState();
}

async function applyApiMatchSelection(match: FranceMatchCandidate): Promise<PublicState> {
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
  state.preMatch.enabled = true;
  state.fullscreenMessage = '';
  scoreLockUntil = 0;
  lastScoreAction = null;
  await persistCurrentMatchInfo();
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

function changeHomeScore(delta: number): PublicState {
  state.homeScore = Math.max(0, state.homeScore + delta);
  scoreLockUntil = 0;
  lastScoreAction = null;
  broadcastState();
  return getState();
}

function changeAwayScore(delta: number): PublicState {
  state.awayScore = Math.max(0, state.awayScore + delta);
  scoreLockUntil = 0;
  lastScoreAction = null;
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

async function startMatch(): Promise<PublicState> {
  state.matchStarted = true;
  state.matchStatus = 'FIRST_HALF';
  state.preMatch.enabled = false;
  await updatePreMatchConfig({ enabled: false });
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

async function finishMatch(): Promise<PublicState> {
  state.matchStarted = false;
  state.matchStatus = 'FINISHED';
  state.preMatch.enabled = false;
  state.happyHourActive = false;
  state.remainingSeconds = 0;
  await updatePreMatchConfig({ enabled: false });
  broadcastState();
  return getState();
}

async function activatePreMatch(): Promise<PublicState> {
  state.preMatch.enabled = true;
  state.matchStarted = false;
  state.matchStatus = 'NOT_STARTED';
  state.happyHourActive = false;
  state.remainingSeconds = 0;
  state.fullscreenMessage = '';
  await updatePreMatchConfig({ enabled: true });
  broadcastState();
  return getState();
}

async function deactivatePreMatch(): Promise<PublicState> {
  state.preMatch.enabled = false;
  await updatePreMatchConfig({ enabled: false });
  broadcastState();
  return getState();
}

async function configurePreMatch(body: PreMatchConfigureBody | undefined): Promise<PublicState> {
  const updatedPreMatch = await updatePreMatchConfig({
    enabled: state.preMatch.enabled,
    kickoffAt: cleanOptionalDateTime(body?.kickoffAt),
    homeFlag: cleanFlag(body?.homeFlag, state.preMatch.homeFlag),
    awayFlag: cleanFlag(body?.awayFlag, state.preMatch.awayFlag),
  });

  if (body && 'programMessages' in body) {
    const messages = cleanProgramMessages(body.programMessages);
    const existingItems = listProgramItems();

    for (let index = 0; index < messages.length; index += 1) {
      const existingItem = existingItems[index];
      const input: ProgramItemInput = {
        text: messages[index],
        active: true,
        sortOrder: (index + 1) * 10,
      };

      if (existingItem) {
        await updateProgramItem(existingItem.id, input);
      } else {
        await createProgramItem(input);
      }
    }

    for (const extraItem of existingItems.slice(messages.length)) {
      await updateProgramItem(extraItem.id, { active: false });
    }
  }

  const activeProgramItems = listActiveProgramItems();
  state.preMatch = {
    ...updatedPreMatch,
    programItems: activeProgramItems,
    programMessages: activeProgramItems.map((item) => item.text),
  };
  broadcastState();
  return getState();
}

function setBannerMessage(message: string): PublicState {
  if (eventBannerClearTimeout) {
    clearTimeout(eventBannerClearTimeout);
    eventBannerClearTimeout = null;
  }

  state.bannerMessage = message;
  broadcastState();
  return getState();
}

function showEventBanner(message: string): PublicState {
  if (eventBannerClearTimeout) {
    clearTimeout(eventBannerClearTimeout);
  }

  state.bannerMessage = message;
  eventBannerClearTimeout = setTimeout(() => {
    if (state.bannerMessage === message) {
      state.bannerMessage = '';
      broadcastState();
    }

    eventBannerClearTimeout = null;
  }, eventBannerDisplayDurationMs);
  broadcastState();
  return getState();
}

function showRandomEventBanner(): PublicState {
  const activeBanners = listActiveEventBanners();

  if (!activeBanners.length) {
    throw new Error('No active event banner');
  }

  const index = Math.floor(Math.random() * activeBanners.length);
  return showEventBanner(activeBanners[index].text);
}

function setFullscreenMessage(message: string): PublicState {
  state.fullscreenMessage = message;
  broadcastState();
  return getState();
}

function clearDisplayMessages(): PublicState {
  if (eventBannerClearTimeout) {
    clearTimeout(eventBannerClearTimeout);
    eventBannerClearTimeout = null;
  }

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

setInterval(() => {
  void spotifyService.getCurrentlyPlaying().then((nextSpotifyState) => {
    spotifyState = nextSpotifyState;
    broadcastState();
  });
}, 15000);

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

app.get('/api/server-info', async () => {
  return getServerInfo();
});

app.get('/api/spotify/login', async (_request, reply) => {
  try {
    return reply.redirect(spotifyService.createLoginUrl());
  } catch (error) {
    return reply.code(400).type('text/plain; charset=utf-8').send(
      error instanceof Error ? error.message : 'Spotify login unavailable',
    );
  }
});

app.get<{ Querystring: SpotifyCallbackQuery }>('/api/spotify/callback', async (request, reply) => {
  if (request.query.error) {
    return reply.code(400).type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="fr">
      <head><meta charset="UTF-8"><title>Spotify non connecte</title></head>
      <body>
        <h1>Spotify non connecte</h1>
        <p>Spotify a refuse la connexion : ${escapeHtml(cleanDisplayMessage(request.query.error, 120))}</p>
      </body>
      </html>
    `);
  }

  if (!request.query.code || !request.query.state) {
    return reply.code(400).type('text/plain; charset=utf-8').send('Code Spotify manquant.');
  }

  try {
    const refreshToken = await spotifyService.exchangeCodeForRefreshToken(request.query.code, request.query.state);

    return reply.type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="fr">
      <head><meta charset="UTF-8"><title>Spotify connecte</title></head>
      <body>
        <h1>Spotify connecte</h1>
        <p>Ajoutez cette valeur dans votre fichier .env, puis redemarrez le serveur.</p>
        <pre>SPOTIFY_REFRESH_TOKEN=${escapeHtml(refreshToken)}</pre>
        <p>Gardez ce token prive. Ne le committez pas.</p>
      </body>
      </html>
    `);
  } catch (error) {
    return reply.code(400).type('text/html; charset=utf-8').send(`
      <!doctype html>
      <html lang="fr">
      <head><meta charset="UTF-8"><title>Erreur Spotify</title></head>
      <body>
        <h1>Erreur Spotify</h1>
        <p>${escapeHtml(cleanDisplayMessage(error instanceof Error ? error.message : 'Connexion Spotify impossible', 200))}</p>
      </body>
      </html>
    `);
  }
});

app.get('/api/spotify/status', async () => {
  return spotifyService.getStatus();
});

app.post('/api/spotify/disconnect', async () => {
  spotifyService.disconnect();
  spotifyState = {
    ...spotifyPlaceholder,
    status: 'not_configured',
  };
  broadcastState();
  return {
    ok: true,
    status: spotifyService.getStatus(),
  };
});

app.get('/api/drinks', async () => {
  return {
    drinks: listDrinks(),
    happyHourDiscountRate,
  };
});

app.post<{ Body: DrinkInput }>('/api/drinks', async (request, reply) => {
  try {
    const drink = await createPersistedDrink(request.body ?? {});
    broadcastState();
    return drink;
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'Invalid drink',
    });
  }
});

app.put<{ Body: DrinkInput; Params: { id: string } }>('/api/drinks/:id', async (request, reply) => {
  try {
    const drink = await updatePersistedDrink(request.params.id, request.body ?? {});
    broadcastState();
    return drink;
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown drink',
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/drinks/:id', async (request, reply) => {
  try {
    await deletePersistedDrink(request.params.id);
    broadcastState();
    return { ok: true };
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown drink',
    });
  }
});

app.get('/api/program', async () => {
  return {
    programItems: listProgramItems(),
  };
});

app.post<{ Body: ProgramItemInput }>('/api/program', async (request, reply) => {
  try {
    const item = await createProgramItem(request.body ?? {});
    const activeProgramItems = listActiveProgramItems();
    state.preMatch.programItems = activeProgramItems;
    state.preMatch.programMessages = activeProgramItems.map((programItem) => programItem.text);
    broadcastState();
    return item;
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'Invalid program item',
    });
  }
});

app.put<{ Body: ProgramItemInput; Params: { id: string } }>('/api/program/:id', async (request, reply) => {
  try {
    const item = await updateProgramItem(request.params.id, request.body ?? {});
    const activeProgramItems = listActiveProgramItems();
    state.preMatch.programItems = activeProgramItems;
    state.preMatch.programMessages = activeProgramItems.map((programItem) => programItem.text);
    broadcastState();
    return item;
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown program item',
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/program/:id', async (request, reply) => {
  try {
    await deleteProgramItem(request.params.id);
    const activeProgramItems = listActiveProgramItems();
    state.preMatch.programItems = activeProgramItems;
    state.preMatch.programMessages = activeProgramItems.map((programItem) => programItem.text);
    broadcastState();
    return { ok: true };
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown program item',
    });
  }
});

app.get('/api/event-banners', async () => {
  return {
    eventBanners: listEventBanners(),
  };
});

app.post<{ Body: EventBannerInput }>('/api/event-banners', async (request, reply) => {
  try {
    const banner = await createEventBanner(request.body ?? {});
    state.eventBanners = listActiveEventBanners();
    broadcastState();
    return banner;
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'Invalid event banner',
    });
  }
});

app.put<{ Body: EventBannerInput; Params: { id: string } }>('/api/event-banners/:id', async (request, reply) => {
  try {
    const banner = await updateEventBanner(request.params.id, request.body ?? {});
    state.eventBanners = listActiveEventBanners();
    broadcastState();
    return banner;
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown event banner',
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/event-banners/:id', async (request, reply) => {
  try {
    await deleteEventBanner(request.params.id);
    state.eventBanners = listActiveEventBanners();
    broadcastState();
    return { ok: true };
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown event banner',
    });
  }
});

app.get('/api/lively-messages', async () => {
  return {
    livelyMessages: listLivelyMessages(),
  };
});

app.post<{ Body: LivelyMessageInput }>('/api/lively-messages', async (request, reply) => {
  try {
    const message = await createLivelyMessage(request.body ?? {});
    state.livelyMessages = listActiveLivelyMessages();
    broadcastState();
    return message;
  } catch (error) {
    return reply.code(400).send({
      error: error instanceof Error ? error.message : 'Invalid lively message',
    });
  }
});

app.put<{ Body: LivelyMessageInput; Params: { id: string } }>('/api/lively-messages/:id', async (request, reply) => {
  try {
    const message = await updateLivelyMessage(request.params.id, request.body ?? {});
    state.livelyMessages = listActiveLivelyMessages();
    broadcastState();
    return message;
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown lively message',
    });
  }
});

app.delete<{ Params: { id: string } }>('/api/lively-messages/:id', async (request, reply) => {
  try {
    await deleteLivelyMessage(request.params.id);
    state.livelyMessages = listActiveLivelyMessages();
    broadcastState();
    return { ok: true };
  } catch (error) {
    return reply.code(404).send({
      error: error instanceof Error ? error.message : 'Unknown lively message',
    });
  }
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
    return await selectMatch(matchId, mode, request.body?.customAwayTeam, request.body?.customAwayShortName);
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

app.post('/api/pre-match/activate', async () => {
  return activatePreMatch();
});

app.post('/api/pre-match/deactivate', async () => {
  return deactivatePreMatch();
});

app.post<{ Body: PreMatchConfigureBody }>('/api/pre-match/configure', async (request) => {
  return configurePreMatch(request.body);
});

app.post<{ Body: DisplayMessageBody }>('/api/display/banner', async (request, reply) => {
  const message = cleanDisplayMessage(request.body?.message ?? request.body?.text, 160);

  if (!message) {
    return reply.code(400).send({ error: 'Missing banner message' });
  }

  return setBannerMessage(message);
});

app.post('/api/display/random-banner', async (_request, reply) => {
  try {
    return showRandomEventBanner();
  } catch (error) {
    return reply.code(409).send({
      error: error instanceof Error ? error.message : 'No active event banner',
    });
  }
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

app.post('/api/simulation/home-minus', async () => {
  return changeHomeScore(-1);
});

app.post('/api/simulation/away-minus', async () => {
  return changeAwayScore(-1);
});

app.post('/api/simulation/home-plus', async () => {
  return changeHomeScore(1);
});

app.post('/api/simulation/away-plus', async () => {
  return changeAwayScore(1);
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

app.get('/admin', async (_request, reply) => {
  const html = await readHtml(barRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/admin/', async (_request, reply) => {
  const html = await readHtml(barRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/admin/setup', async (_request, reply) => {
  const html = await readFile(resolve(barRoot, 'setup.html'), 'utf8');
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/admin/setup.js', async (_request, reply) => {
  const script = await readFile(resolve(barRoot, 'setup.ts'), 'utf8');
  return reply.type('application/javascript; charset=utf-8').send(script);
});

app.get('/admin/bar.js', async (_request, reply) => {
  const script = await readFile(resolve(barRoot, 'bar.ts'), 'utf8');
  return reply.type('application/javascript; charset=utf-8').send(script);
});

app.get('/admin/bar.css', async (_request, reply) => {
  const style = await readFile(resolve(barRoot, 'bar.css'), 'utf8');
  return reply.type('text/css; charset=utf-8').send(style);
});

app.get('/bar', async (_request, reply) => {
  return reply.redirect('/admin');
});

app.get('/bar/', async (_request, reply) => {
  return reply.redirect('/admin');
});

app.get('/bar/setup', async (_request, reply) => {
  return reply.redirect('/admin/setup');
});

app.get('/bar/setup.js', async (_request, reply) => {
  return reply.redirect('/admin/setup.js');
});

app.get('/bar/bar.js', async (_request, reply) => {
  return reply.redirect('/admin/bar.js');
});

app.get('/bar/bar.css', async (_request, reply) => {
  return reply.redirect('/admin/bar.css');
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

app.get('/tablette', async (_request, reply) => {
  const html = await readHtml(tabletteRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/tablette/', async (_request, reply) => {
  const html = await readHtml(tabletteRoot);
  return reply.type('text/html; charset=utf-8').send(html);
});

app.get('/tablette/tablette.js', async (_request, reply) => {
  const script = await readFile(resolve(tabletteRoot, 'tablette.ts'), 'utf8');
  return reply.type('application/javascript; charset=utf-8').send(script);
});

app.get('/tablette/tablette.css', async (_request, reply) => {
  const style = await readFile(resolve(tabletteRoot, 'tablette.css'), 'utf8');
  return reply.type('text/css; charset=utf-8').send(style);
});

app.get('/tv', async (_request, reply) => {
  return reply.redirect('/tablette');
});

app.get('/tv/', async (_request, reply) => {
  return reply.redirect('/tablette');
});

app.get('/tv/tv.js', async (_request, reply) => {
  return reply.redirect('/tablette/tablette.js');
});

app.get('/tv/tv.css', async (_request, reply) => {
  return reply.redirect('/tablette/tablette.css');
});

await app.register(fastifyStatic, {
  root: webRoot,
  prefix: '/',
  setHeaders: (response, filePath) => {
    if (filePath.endsWith('.html')) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
      response.setHeader('content-type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      response.setHeader('content-type', 'text/css; charset=utf-8');
    } else if (filePath.endsWith('.json')) {
      response.setHeader('content-type', 'application/json; charset=utf-8');
    }
  },
});

const address = await app.listen({
  host: '0.0.0.0',
  port: config.appPort,
});

console.log(`Cocotte Goal Happy Hour server listening on ${address}`);
if (config.publicBaseUrl) {
  console.log(`Public server URL: ${config.publicBaseUrl}`);
} else {
  const localUrls = getLocalNetworkUrls();
  console.log(`Local server URLs: ${localUrls.length ? localUrls.join(', ') : address}`);
}
