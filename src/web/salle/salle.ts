// @ts-nocheck

const emptyState = {
  happyHourActive: false,
  remainingSeconds: 0,
  scoreLockActive: false,
  scoreLockRemainingSeconds: 0,
  canUndoLastAction: false,
  lastActionLabel: null,
  matchMode: 'simulation',
  matchStatus: 'NOT_STARTED',
  bannerMessage: '',
  fullscreenMessage: '',
  drinks: [],
  menu: { drinks: [] },
  homeTeam: {
    name: 'France',
    shortName: 'FRA',
  },
  awayTeam: {
    name: 'Unknown',
    shortName: 'ADV',
  },
  homeScore: 0,
  awayScore: 0,
};

const matchStatusLabels = {
  NOT_STARTED: 'Avant match',
  FIRST_HALF: '1re mi-temps',
  HALF_TIME: 'Mi-temps',
  SECOND_HALF: '2e mi-temps',
  FINISHED: 'Fin du match',
};

function element(selector = '') {
  const match = document.querySelector(selector);

  if (!match) {
    throw new Error(`Missing element: ${selector}`);
  }

  return match;
}

const homeTeam = element('#home-team');
const awayTeam = element('#away-team');
const homeScore = element('#home-score');
const awayScore = element('#away-score');
const matchFullName = element('#match-full-name');
const matchStatus = element('#match-status');
const timer = element('#timer');
const statusLabel = element('#status-label');
const statusDot = element('#status-dot');
const homeGoalButton = element('#home-goal-button');
const awayGoalButton = element('#away-goal-button');
const homeMinusButton = element('#home-minus-button');
const awayMinusButton = element('#away-minus-button');
const resetScoreButton = element('#reset-score-button');
const undoLastButton = element('#undo-last-button');
const scoreLockNotice = element('#score-lock-notice');
const undoStatus = element('#undo-status');
const actionStatus = element('#action-status');
const connectionStatus = element('#connection-status');
const importantMessage = element('#important-message');
const drinksNote = element('#drinks-note');
const drinkList = element('#drink-list');

let latestState = emptyState;
let realtimeReconnectTimeout = 0;
let statePollInFlight = false;
let lastSuccessfulStateAt = 0;

function formatSeconds(totalSeconds = 0) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPrice(price = 0, currency = 'EUR') {
  return `${Number(price || 0).toFixed(2)} ${currency === 'EUR' ? '€' : currency}`;
}

function getTeamName(team = '') {
  return typeof team === 'string' ? team : team.name;
}

function getTeamShortName(team = '') {
  if (typeof team === 'string') {
    return team;
  }

  return team.shortName || team.name;
}

function getScoreParts(state = emptyState) {
  const score = state.score || {};

  return {
    home: Number.isFinite(state.homeScore) ? state.homeScore : score.homeScore ?? score.home ?? 0,
    away: Number.isFinite(state.awayScore) ? state.awayScore : score.awayScore ?? score.away ?? 0,
  };
}

function getDrinks(state = emptyState) {
  if (Object.hasOwn(state, 'drinks') && Array.isArray(state.drinks)) {
    return state.drinks;
  }

  if (Object.hasOwn(state, 'menu') && Array.isArray(state.menu?.drinks)) {
    return state.menu.drinks;
  }

  return null;
}

function simulationEnabled(state = emptyState) {
  return state.matchMode === 'simulation';
}

function setActionStatus(message = '', kind = 'neutral') {
  actionStatus.textContent = message;
  actionStatus.dataset.kind = kind;
}

function setConnectionStatus(kind = 'unstable') {
  const labels = {
    connected: 'Serveur connecté',
    unstable: 'Connexion instable',
    lost: 'Connexion perdue',
  };
  const label = labels[kind] || labels.unstable;

  statusLabel.textContent = label;
  statusDot.dataset.connection = kind;
  connectionStatus.textContent = label;
  connectionStatus.dataset.connection = kind;
}

function markStateConnectionOk() {
  lastSuccessfulStateAt = Date.now();
  setConnectionStatus('connected');
}

function markStateConnectionProblem() {
  setConnectionStatus(lastSuccessfulStateAt && Date.now() - lastSuccessfulStateAt < 10000 ? 'unstable' : 'lost');
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

function hasValidDrinkShape(drink) {
  return Boolean(
    drink
    && typeof drink === 'object'
    && typeof drink.name === 'string'
    && drink.name.trim()
    && Number.isFinite(Number(drink.originalPrice ?? drink.price))
    && Number.isFinite(Number(drink.happyHourPrice ?? drink.originalPrice ?? drink.price)),
  );
}

function createDrinkItem(drink, happyHourActive) {
  const item = document.createElement('article');
  const name = document.createElement('strong');
  const prices = document.createElement('div');
  const normalLabel = document.createElement('small');
  const price = document.createElement('span');
  const happyHourLabel = document.createElement('small');
  const happyHourPrice = document.createElement('em');

  item.className = 'drink-item';
  name.textContent = `${drink.icon ? `${drink.icon} ` : ''}${drink.name || 'Boisson'}`;
  normalLabel.textContent = 'Normal';
  price.textContent = formatPrice(drink.originalPrice ?? drink.price, drink.currency);
  happyHourLabel.textContent = 'Happy Hour';
  happyHourPrice.textContent = formatPrice(drink.happyHourPrice ?? drink.originalPrice ?? drink.price, drink.currency);
  price.classList.toggle('is-reduced', happyHourActive);
  prices.append(normalLabel, price, happyHourLabel, happyHourPrice);
  item.append(name, prices);
  return item;
}

function renderDrinkLoadError() {
  const item = document.createElement('article');
  item.className = 'drink-item error-item';
  item.textContent = 'Carte des boissons non chargée';
  drinkList.replaceChildren(item);
}

function renderConnectionLost() {
  markStateConnectionProblem();
  matchStatus.textContent = 'Connexion serveur perdue';
  renderDrinkLoadError();
}

function renderState(state = emptyState) {
  markStateConnectionOk();
  latestState = {
    ...emptyState,
    ...state,
  };
  const score = getScoreParts(latestState);
  const homeName = getTeamName(latestState.homeTeam);
  const awayName = getTeamName(latestState.awayTeam);
  const isSimulation = simulationEnabled(latestState);
  const isScoreLocked = Boolean(latestState.scoreLockActive);
  const isHappyHourActive = Boolean(latestState.happyHourActive);
  const message = latestState.fullscreenMessage || latestState.bannerMessage || '';
  const drinks = getDrinks(state);

  homeTeam.textContent = getTeamShortName(latestState.homeTeam);
  awayTeam.textContent = getTeamShortName(latestState.awayTeam);
  homeScore.textContent = String(score.home);
  awayScore.textContent = String(score.away);
  matchFullName.textContent = `${homeName} vs ${awayName}`;
  matchStatus.textContent = matchStatusLabels[latestState.matchStatus] || latestState.matchStatus || 'Match';
  timer.textContent = isHappyHourActive ? formatSeconds(latestState.remainingSeconds) : '0:00';
  importantMessage.textContent = message || 'Aucun message pour la salle.';
  drinksNote.textContent = 'Prix normal / Happy Hour';

  document.body.classList.toggle('happy-hour-active', isHappyHourActive);
  document.body.classList.toggle('score-locked', isScoreLocked);
  document.body.classList.toggle('api-live-mode', !isSimulation);

  homeGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  awayGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  homeMinusButton.toggleAttribute('disabled', !isSimulation);
  awayMinusButton.toggleAttribute('disabled', !isSimulation);
  resetScoreButton.toggleAttribute('disabled', !isSimulation);
  undoLastButton.toggleAttribute('disabled', !isSimulation || !latestState.canUndoLastAction);
  scoreLockNotice.textContent = isScoreLocked
    ? `Score verrouille : ${latestState.scoreLockRemainingSeconds} s`
    : 'Score modifiable';
  undoStatus.textContent = latestState.canUndoLastAction
    ? `Action annulable : ${latestState.lastActionLabel || 'dernier but'}`
    : 'Aucune action annulable';

  if (!drinks) {
    renderDrinkLoadError();
  } else if (!drinks.length) {
    const item = document.createElement('article');
    item.className = 'drink-item';
    item.textContent = 'Aucune boisson active configurée';
    drinkList.replaceChildren(item);
  } else if (drinks.some((drink) => !hasValidDrinkShape(drink))) {
    renderDrinkLoadError();
  } else {
    drinkList.replaceChildren(...drinks.map((drink) => createDrinkItem(drink, isHappyHourActive)));
  }

  if (isScoreLocked) {
    setActionStatus('Attente fin du verrou ou annulation possible', 'warning');
  } else if (!isSimulation) {
    setActionStatus('Actions salle desactivees en mode API live', 'warning');
  } else {
    setActionStatus('Pret', 'neutral');
  }
}

async function postAction(path = '') {
  setActionStatus('Action en cours', 'neutral');

  let response;

  try {
    response = await fetch(path, { method: 'POST' });
  } catch {
    setActionStatus('Erreur reseau, action non envoyee', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    if (payload.error === 'score_locked') {
      const remainingSeconds = payload.lockRemainingSeconds ?? latestState.scoreLockRemainingSeconds ?? 0;
      scoreLockNotice.textContent = `Score verrouille : ${remainingSeconds} s`;
      setActionStatus('Score verrouille, annulation possible pendant le verrou', 'warning');
      return;
    }

    undoStatus.textContent = payload.error === 'no_undo_available'
      ? 'Aucune action annulable'
      : `Erreur action : ${response.status}`;
    setActionStatus(
      payload.error === 'no_undo_available' ? 'Aucune action a annuler' : 'Action refusee',
      'error',
    );
    return;
  }

  renderState(payload);
  setActionStatus('Action prise en compte', 'success');
}

async function loadInitialState() {
  let response;

  try {
    response = await fetch('/api/state', { cache: 'no-store' });
  } catch {
    markStateConnectionProblem();
    setActionStatus("Impossible de charger l'etat initial", 'error');
    renderConnectionLost();
    return;
  }

  if (!response.ok) {
    markStateConnectionProblem();
    setActionStatus(`Etat initial indisponible : ${response.status}`, 'error');
    renderConnectionLost();
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
    await loadInitialState();
  } finally {
    statePollInFlight = false;
  }
}

function connectRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  window.clearTimeout(realtimeReconnectTimeout);
  setConnectionStatus('unstable');

  socket.addEventListener('open', () => {
    markStateConnectionOk();
  });

  socket.addEventListener('message', (event) => {
    try {
      renderState(JSON.parse(event.data));
    } catch {
      markStateConnectionProblem();
    }
  });

  socket.addEventListener('error', () => {
    markStateConnectionProblem();
  });

  socket.addEventListener('close', () => {
    renderConnectionLost();
    realtimeReconnectTimeout = window.setTimeout(connectRealtime, 1000);
  });
}

homeGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-goal');
});

awayGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-goal');
});

homeMinusButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-minus');
});

awayMinusButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-minus');
});

undoLastButton.addEventListener('click', () => {
  void postAction('/api/simulation/undo-last');
});

resetScoreButton.addEventListener('click', () => {
  if (!window.confirm('Confirmer la remise a zero du score ?')) {
    return;
  }

  void postAction('/api/simulation/reset-score');
});

setConnectionStatus('unstable');
void loadInitialState();
connectRealtime();
window.setInterval(() => {
  void pollState();
}, 1000);
window.setInterval(markStateConnectionProblem, 5000);
