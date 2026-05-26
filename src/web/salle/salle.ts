// @ts-nocheck

const emptyState = {
  happyHourActive: false,
  remainingSeconds: 0,
  scoreLockActive: false,
  scoreLockRemainingSeconds: 0,
  canUndoLastAction: false,
  lastActionLabel: null,
  matchMode: 'simulation',
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
const timer = element('#timer');
const statusLabel = element('#status-label');
const statusDot = element('#status-dot');
const homeGoalButton = element('#home-goal-button');
const awayGoalButton = element('#away-goal-button');
const undoLastButton = element('#undo-last-button');
const scoreLockNotice = element('#score-lock-notice');
const undoStatus = element('#undo-status');
const actionStatus = element('#action-status');
const connectionStatus = element('#connection-status');

let latestState = emptyState;
let realtimeReconnectTimeout = 0;

function formatSeconds(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

function simulationEnabled(state = emptyState) {
  return state.matchMode === 'simulation';
}

function setActionStatus(message = '', kind = 'neutral') {
  actionStatus.textContent = message;
  actionStatus.dataset.kind = kind;
}

function setConnectionStatus(message = '', connected = false) {
  connectionStatus.textContent = message;
  connectionStatus.classList.toggle('connected', connected);
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

function renderState(state = emptyState) {
  latestState = {
    ...emptyState,
    ...state,
  };
  const homeName = getTeamName(state.homeTeam);
  const awayName = getTeamName(state.awayTeam);
  const isSimulation = simulationEnabled(state);
  const isScoreLocked = Boolean(state.scoreLockActive);

  homeTeam.textContent = getTeamShortName(state.homeTeam);
  awayTeam.textContent = getTeamShortName(state.awayTeam);
  homeScore.textContent = String(state.homeScore);
  awayScore.textContent = String(state.awayScore);
  matchFullName.textContent = `${homeName} vs ${awayName}`;
  timer.textContent = state.happyHourActive ? formatSeconds(state.remainingSeconds) : '0:00';

  document.body.classList.toggle('happy-hour-active', state.happyHourActive);
  document.body.classList.toggle('score-locked', isScoreLocked);
  document.body.classList.toggle('api-live-mode', !isSimulation);
  statusDot.classList.toggle('active', state.happyHourActive);
  statusLabel.textContent = state.happyHourActive
    ? 'Happy hour active'
    : 'Happy hour inactive';

  homeGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  awayGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  undoLastButton.toggleAttribute('disabled', !isSimulation || !state.canUndoLastAction);
  scoreLockNotice.textContent = isScoreLocked
    ? `Score verrouillé : ${state.scoreLockRemainingSeconds} s`
    : 'Score modifiable';
  undoStatus.textContent = state.canUndoLastAction
    ? `Action annulable : ${state.lastActionLabel || 'dernier but'}`
    : 'Aucune action annulable';

  if (isScoreLocked) {
    setActionStatus('Attente fin du verrou ou annulation possible', 'warning');
  } else if (!isSimulation) {
    setActionStatus('Actions salle désactivées en mode API live', 'warning');
  } else {
    setActionStatus('Prêt', 'neutral');
  }
}

async function postAction(path = '') {
  setActionStatus('Action en cours', 'neutral');

  let response;

  try {
    response = await fetch(path, { method: 'POST' });
  } catch {
    setActionStatus('Erreur réseau, action non envoyée', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    if (payload.error === 'score_locked') {
      const remainingSeconds = payload.lockRemainingSeconds ?? latestState.scoreLockRemainingSeconds ?? 0;
      scoreLockNotice.textContent = `Score verrouillé : ${remainingSeconds} s`;
      setActionStatus('Score verrouillé, annulation possible pendant le verrou', 'warning');
      return;
    }

    undoStatus.textContent = payload.error === 'no_undo_available'
      ? 'Aucune action annulable'
      : `Erreur action : ${response.status}`;
    setActionStatus(
      payload.error === 'no_undo_available' ? 'Aucune action à annuler' : 'Action refusée',
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
    response = await fetch('/api/state');
  } catch {
    setActionStatus('Impossible de charger l’état initial', 'error');
    return;
  }

  if (!response.ok) {
    setActionStatus(`Etat initial indisponible : ${response.status}`, 'error');
    return;
  }

  renderState(await readResponseJson(response));
}

function connectRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  window.clearTimeout(realtimeReconnectTimeout);
  setConnectionStatus('Connexion temps réel en cours', false);

  socket.addEventListener('open', () => {
    setConnectionStatus('Temps réel connecté', true);
  });

  socket.addEventListener('message', (event) => {
    try {
      renderState(JSON.parse(event.data));
    } catch {
      setConnectionStatus('Message temps réel invalide', false);
    }
  });

  socket.addEventListener('error', () => {
    setConnectionStatus('Erreur temps réel', false);
  });

  socket.addEventListener('close', () => {
    setConnectionStatus('Temps réel déconnecté, reconnexion', false);
    realtimeReconnectTimeout = window.setTimeout(connectRealtime, 1000);
  });
}

homeGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-goal');
});

awayGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-goal');
});

undoLastButton.addEventListener('click', () => {
  void postAction('/api/simulation/undo-last');
});

void loadInitialState();
connectRealtime();
