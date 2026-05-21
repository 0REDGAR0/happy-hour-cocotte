// @ts-nocheck

const emptyState = {
  happyHourActive: false,
  remainingSeconds: 0,
  selectedMatchId: 'france-unknown',
  matchStarted: false,
  matchMode: 'simulation',
  scoreSource: 'simulation',
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
const sourceBadge = element('#source-badge');
const startButton = element('#start-button');
const resetButton = element('#reset-button');
const stopButton = element('#stop-button');
const homeGoalButton = element('#home-goal-button');
const awayGoalButton = element('#away-goal-button');
const resetScoreButton = element('#reset-score-button');

function formatSeconds(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function simulationEnabled(state = emptyState) {
  return state.matchMode === 'simulation';
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

function renderState(state = emptyState) {
  const homeName = getTeamName(state.homeTeam);
  const awayName = getTeamName(state.awayTeam);

  homeTeam.textContent = getTeamShortName(state.homeTeam);
  awayTeam.textContent = getTeamShortName(state.awayTeam);
  homeScore.textContent = String(state.homeScore);
  awayScore.textContent = String(state.awayScore);
  matchFullName.textContent = `${homeName} vs ${awayName}`;
  timer.textContent = formatSeconds(state.remainingSeconds);

  const isSimulation = simulationEnabled(state);

  document.body.classList.toggle('happy-hour-active', state.happyHourActive);
  document.body.classList.toggle('api-live-mode', !isSimulation);
  statusDot.classList.toggle('active', state.happyHourActive);
  statusLabel.textContent = state.happyHourActive
    ? 'Happy hour active'
    : 'Happy hour inactive';
  sourceBadge.textContent = isSimulation ? 'MATCH SIMULE' : 'API LIVE PLACEHOLDER';

  resetButton.toggleAttribute('disabled', !state.happyHourActive);
  stopButton.toggleAttribute('disabled', !state.happyHourActive);
  homeGoalButton.toggleAttribute('disabled', !isSimulation);
  awayGoalButton.toggleAttribute('disabled', !isSimulation);
  resetScoreButton.toggleAttribute('disabled', !isSimulation);
}

async function postAction(path = '') {
  const response = await fetch(path, { method: 'POST' });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  renderState(await response.json());
}

async function loadInitialState() {
  const response = await fetch('/api/state');

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  renderState(await response.json());
}

function connectRealtime() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

  socket.addEventListener('message', (event) => {
    renderState(JSON.parse(event.data));
  });

  socket.addEventListener('close', () => {
    window.setTimeout(connectRealtime, 1000);
  });
}

startButton.addEventListener('click', () => {
  void postAction('/api/override/start');
});

resetButton.addEventListener('click', () => {
  void postAction('/api/override/reset');
});

stopButton.addEventListener('click', () => {
  void postAction('/api/override/stop');
});

homeGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-goal');
});

awayGoalButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-goal');
});

resetScoreButton.addEventListener('click', () => {
  void postAction('/api/simulation/reset-score');
});

void loadInitialState();
connectRealtime();

export {};
