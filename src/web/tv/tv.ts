// @ts-nocheck

const fallbackDrinks = [
  { id: 'pinte-blonde', name: 'Pinte blonde', price: 7, happyHourPrice: 5.6, currency: 'EUR' },
  { id: 'pinte-ipa', name: 'Pinte IPA', price: 8, happyHourPrice: 6.4, currency: 'EUR' },
  { id: 'verre-vin', name: 'Verre de vin', price: 5, happyHourPrice: 4, currency: 'EUR' },
  { id: 'cocktail-maison', name: 'Cocktail maison', price: 9, happyHourPrice: 7.2, currency: 'EUR' },
  { id: 'soft', name: 'Soft', price: 3.5, happyHourPrice: 2.8, currency: 'EUR' },
];

const emptyState = {
  displayMode: 'IDLE',
  matchStatus: 'NOT_STARTED',
  happyHourActive: false,
  remainingSeconds: 0,
  bannerMessage: '',
  fullscreenMessage: '',
  matchInfo: null,
  score: null,
  drinks: fallbackDrinks,
  menu: {
    drinks: fallbackDrinks,
    happyHourDiscountRate: 0.2,
  },
  spotify: {
    title: '',
    artist: '',
    albumArtUrl: null,
    isPlaying: false,
  },
  homeTeam: {
    name: 'France',
    shortName: 'FRA',
  },
  awayTeam: {
    name: 'Adversaire',
    shortName: 'ADV',
  },
  homeScore: 0,
  awayScore: 0,
};

const displayModes = new Set([
  'PRE_MATCH',
  'MATCH_LIVE',
  'HAPPY_HOUR',
  'HALF_TIME',
  'FULL_TIME',
  'FULLSCREEN_MESSAGE',
  'IDLE',
]);

const stage = document.querySelector('#tv-stage');
const topBanner = document.querySelector('#top-banner');
let statePollInFlight = false;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function elementText(value = '', fallback = '-') {
  const text = String(value ?? '').trim();
  return escapeHtml(text || fallback);
}

function formatSeconds(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPrice(value = 0, currency = 'EUR') {
  const amount = Number(value) || 0;
  const suffix = currency === 'EUR' ? '€' : currency;
  return `${amount.toFixed(2)} ${suffix}`;
}

function getTeamName(team, fallback = '') {
  if (typeof team === 'string') {
    return team;
  }

  return team?.name || fallback;
}

function getTeamShortName(team, fallback = '') {
  if (typeof team === 'string') {
    return team;
  }

  return team?.shortName || team?.name || fallback;
}

function getMatchInfo(state = emptyState) {
  const info = state.matchInfo || {};
  const homeTeam = info.homeTeam || state.homeTeam || emptyState.homeTeam;
  const awayTeam = info.awayTeam || state.awayTeam || emptyState.awayTeam;
  const score = state.score || {};
  const homeScore = Number.isFinite(info.homeScore)
    ? info.homeScore
    : Number.isFinite(state.homeScore)
      ? state.homeScore
      : score.homeScore ?? score.home ?? 0;
  const awayScore = Number.isFinite(info.awayScore)
    ? info.awayScore
    : Number.isFinite(state.awayScore)
      ? state.awayScore
      : score.awayScore ?? score.away ?? 0;

  return {
    homeTeam,
    awayTeam,
    homeName: getTeamName(homeTeam, 'France'),
    awayName: getTeamName(awayTeam, 'Adversaire'),
    homeShortName: getTeamShortName(homeTeam, 'FRA'),
    awayShortName: getTeamShortName(awayTeam, 'ADV'),
    homeScore,
    awayScore,
    title: info.matchTitle || state.matchTitle || `${getTeamName(homeTeam, 'France')} vs ${getTeamName(awayTeam, 'Adversaire')}`,
    description: info.matchDescription || state.matchDescription || 'Match Cocotte Happy Hour',
  };
}

function getDrinks(state = emptyState) {
  const drinks = Array.isArray(state.drinks) && state.drinks.length
    ? state.drinks
    : Array.isArray(state.menu?.drinks) && state.menu.drinks.length
      ? state.menu.drinks
      : fallbackDrinks;

  return drinks.slice(0, 5);
}

function getSpotify(state = emptyState) {
  return {
    title: state.spotify?.title || 'Playlist Cocotte',
    artist: state.spotify?.artist || 'En attente de lecture',
    albumArtUrl: state.spotify?.albumArtUrl || '',
    isPlaying: Boolean(state.spotify?.isPlaying),
  };
}

function getDisplayMode(state = emptyState) {
  if (state.fullscreenMessage) {
    return 'FULLSCREEN_MESSAGE';
  }

  if (state.happyHourActive) {
    return 'HAPPY_HOUR';
  }

  if (displayModes.has(state.displayMode)) {
    return state.displayMode;
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
      return 'PRE_MATCH';
    default:
      return 'IDLE';
  }
}

function renderScoreBug(match) {
  return `
    <aside class="score-bug" aria-label="Score actuel">
      <span>${elementText(match.homeShortName, 'FRA')}</span>
      <strong>${escapeHtml(match.homeScore)} - ${escapeHtml(match.awayScore)}</strong>
      <span>${elementText(match.awayShortName, 'ADV')}</span>
    </aside>
  `;
}

function renderBrandBlock() {
  return `
    <section class="brand-panel">
      <p class="kicker">Cocotte</p>
      <h1>Happy Hour</h1>
      <p class="brand-subtitle">Football, bar et bons moments en direct</p>
      <div class="brand-mark" aria-hidden="true">
        <span>C</span>
      </div>
    </section>
  `;
}

function renderMusicCard(state) {
  const spotify = getSpotify(state);
  const playingLabel = spotify.isPlaying ? 'Lecture en cours' : 'Pause';
  const albumArt = spotify.albumArtUrl
    ? `<img src="${escapeHtml(spotify.albumArtUrl)}" alt="">`
    : '<div class="album-placeholder" aria-hidden="true">SP</div>';

  return `
    <section class="music-card" aria-label="Musique actuelle">
      ${albumArt}
      <div>
        <p class="micro-label">Musique actuelle</p>
        <strong>${elementText(spotify.title, 'Playlist Cocotte')}</strong>
        <span>${elementText(spotify.artist, 'En attente de lecture')}</span>
        <small>${playingLabel}</small>
      </div>
    </section>
  `;
}

function renderDrinkList(state, compact = false) {
  return `
    <section class="drinks-card ${compact ? 'is-compact' : ''}" aria-label="Carte boissons">
      <div class="panel-heading">
        <p class="kicker">Carte boissons</p>
        <h2>Offre Cocotte</h2>
      </div>
      <div class="drink-list">
        ${getDrinks(state).map((drink) => `
          <article class="drink-row">
            <span>${elementText(drink.name, 'Boisson')}</span>
            <div>
              <small>${formatPrice(drink.price, drink.currency)}</small>
              <strong>${formatPrice(drink.happyHourPrice ?? drink.price, drink.currency)}</strong>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `;
}

function renderPreMatch(state) {
  const match = getMatchInfo(state);

  return `
    <div class="pre-match-layout">
      <div class="left-stack">
        ${renderBrandBlock()}
        ${renderMusicCard(state)}
      </div>
      <section class="match-preview panel">
        <p class="kicker">Prochain match</p>
        <h2>${elementText(match.title)}</h2>
        <div class="versus-card">
          <div>
            <span>${elementText(match.homeShortName)}</span>
            <strong>${elementText(match.homeName)}</strong>
          </div>
          <em>VS</em>
          <div>
            <span>${elementText(match.awayShortName)}</span>
            <strong>${elementText(match.awayName)}</strong>
          </div>
        </div>
        <p class="match-description">${elementText(match.description, 'Avant match')}</p>
        ${renderDrinkList(state)}
      </section>
    </div>
  `;
}

function renderMatchLive(state) {
  const match = getMatchInfo(state);

  return `
    <section class="broadcast-panel">
      <div class="broadcast-label">
        <span>Direct match</span>
        <strong>${elementText(match.description, 'Match en cours')}</strong>
      </div>
      <div class="field-lines" aria-hidden="true"></div>
      <div class="live-center">
        <p class="kicker">Cocotte TV</p>
        <h1>${elementText(match.title)}</h1>
        <p>Overlay actif pendant la diffusion</p>
      </div>
      ${renderScoreBug(match)}
    </section>
  `;
}

function renderHappyHour(state) {
  const match = getMatchInfo(state);

  return `
    <section class="happy-hour-layout">
      <aside class="happy-panel">
        <p class="kicker">But France</p>
        <h1>Happy Hour en cours</h1>
        <p class="offer-pill">-20 % sur une sélection de boissons</p>
        <div class="timer-block">
          <span>Temps restant</span>
          <strong>${formatSeconds(state.remainingSeconds)}</strong>
        </div>
        ${renderDrinkList(state, true)}
      </aside>
      <section class="dark-broadcast">
        <div class="field-lines" aria-hidden="true"></div>
        <p>Diffusion TV en arrière-plan</p>
        ${renderScoreBug(match)}
      </section>
    </section>
  `;
}

function renderHalfTime(state) {
  const match = getMatchInfo(state);
  const serviceMessage = state.bannerMessage || 'Service au bar, reprise à suivre.';
  const timer = Number(state.remainingSeconds) > 0
    ? `<div class="resume-timer"><span>Reprise dans</span><strong>${formatSeconds(state.remainingSeconds)}</strong></div>`
    : '';

  return `
    <section class="event-screen half-time-screen">
      <p class="kicker">Mi-temps</p>
      <h1>Pause au bar</h1>
      <div class="big-score">
        <span>${elementText(match.homeShortName)}</span>
        <strong>${escapeHtml(match.homeScore)} - ${escapeHtml(match.awayScore)}</strong>
        <span>${elementText(match.awayShortName)}</span>
      </div>
      ${timer}
      <p class="event-message">${elementText(serviceMessage)}</p>
    </section>
  `;
}

function renderFullTime(state) {
  const match = getMatchInfo(state);

  return `
    <section class="event-screen full-time-screen">
      <p class="kicker">Fin de match</p>
      <h1>Merci d'avoir suivi le match à la Cocotte</h1>
      <div class="big-score">
        <span>${elementText(match.homeShortName)}</span>
        <strong>${escapeHtml(match.homeScore)} - ${escapeHtml(match.awayScore)}</strong>
        <span>${elementText(match.awayShortName)}</span>
      </div>
      <p class="event-message">La soirée continue au bar.</p>
    </section>
  `;
}

function renderFullscreenMessage(state) {
  const message = state.fullscreenMessage || state.bannerMessage || 'Information Cocotte';

  return `
    <section class="fullscreen-message-screen">
      <div class="info-panel">
        <p class="kicker">Information</p>
        <h1>${elementText(message)}</h1>
        <span>Cocotte Happy Hour</span>
      </div>
    </section>
  `;
}

function renderIdle() {
  return `
    <section class="idle-screen">
      <p class="kicker">Cocotte Happy Hour</p>
      <h1>Overlay éteint</h1>
      <p>En attente d'un match ou d'un message TV.</p>
    </section>
  `;
}

function renderTopBanner(state, mode) {
  const message = String(state.bannerMessage || '').trim();
  const shouldShow = message && mode !== 'FULLSCREEN_MESSAGE' && mode !== 'IDLE';

  topBanner.hidden = !shouldShow;
  topBanner.textContent = shouldShow ? message : '';
}

function renderState(incomingState = emptyState) {
  const state = {
    ...emptyState,
    ...incomingState,
    spotify: {
      ...emptyState.spotify,
      ...(incomingState.spotify || {}),
    },
  };
  const mode = getDisplayMode(state);
  const modeClass = `mode-${mode.toLowerCase().replaceAll('_', '-')}`;

  renderTopBanner(state, mode);
  document.body.className = modeClass;
  stage.className = `tv-stage ${modeClass}`;

  switch (mode) {
    case 'PRE_MATCH':
      stage.innerHTML = renderPreMatch(state);
      break;
    case 'MATCH_LIVE':
      stage.innerHTML = renderMatchLive(state);
      break;
    case 'HAPPY_HOUR':
      stage.innerHTML = renderHappyHour(state);
      break;
    case 'HALF_TIME':
      stage.innerHTML = renderHalfTime(state);
      break;
    case 'FULL_TIME':
      stage.innerHTML = renderFullTime(state);
      break;
    case 'FULLSCREEN_MESSAGE':
      stage.innerHTML = renderFullscreenMessage(state);
      break;
    case 'IDLE':
    default:
      stage.innerHTML = renderIdle();
      break;
  }
}

async function readResponseJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function loadState() {
  const response = await fetch('/api/state', { cache: 'no-store' });

  if (!response.ok) {
    return;
  }

  renderState(await readResponseJson(response));
}

async function pollState() {
  if (statePollInFlight) {
    return;
  }

  statePollInFlight = true;

  try {
    await loadState();
  } finally {
    statePollInFlight = false;
  }
}

function connectRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener('message', (event) => {
    try {
      renderState(JSON.parse(event.data));
    } catch {
      // Polling keeps the screen current if a realtime payload is malformed.
    }
  });

  socket.addEventListener('close', () => {
    window.setTimeout(connectRealtime, 1000);
  });
}

renderState(emptyState);
void loadState();
connectRealtime();
window.setInterval(() => {
  void pollState();
}, 1000);

export {};
