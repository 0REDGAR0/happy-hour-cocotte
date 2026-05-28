// @ts-nocheck

const emptyState = {
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
  displayMode: 'PRE_MATCH',
  matchStatus: 'NOT_STARTED',
  bannerMessage: '',
  fullscreenMessage: '',
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
const undoLastButton = element('#undo-last-button');
const scoreLockNotice = element('#score-lock-notice');
const undoStatus = element('#undo-status');
const audioToggleButton = element('#audio-toggle-button');
const audioAlertBanner = element('#audio-alert-banner');
const matchStartButton = element('#match-start-button');
const matchHalfTimeButton = element('#match-half-time-button');
const matchResumeButton = element('#match-resume-button');
const matchFinishButton = element('#match-finish-button');
const bannerMessageInput = element('#banner-message-input');
const sendBannerButton = element('#send-banner-button');
const fullscreenMessageInput = element('#fullscreen-message-input');
const showFullscreenButton = element('#show-fullscreen-button');
const clearMessagesButton = element('#clear-messages-button');
const displayMessageStatus = element('#display-message-status');
const displayModeValue = element('#display-mode-value');
const matchStatusValue = element('#match-status-value');
const happyHourActiveValue = element('#happy-hour-active-value');
const remainingSecondsValue = element('#remaining-seconds-value');
const currentScoreValue = element('#current-score-value');
const spotifyTitleValue = element('#spotify-title-value');
const spotifyArtistValue = element('#spotify-artist-value');
const spotifyPlayingValue = element('#spotify-playing-value');

const audioAlertsStorageKey = 'cocotte.bar.audioAlertsEnabled';
let audioAlertsEnabled = localStorage.getItem(audioAlertsStorageKey) === 'true';
let audioContext = null;
let hasRenderedState = false;
let previousHappyHourActive = false;
let alertAnimationTimeout = 0;
let statePollInFlight = false;

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

function getScoreParts(state = emptyState) {
  const score = state.score || {};

  return {
    home: Number.isFinite(state.homeScore) ? state.homeScore : score.homeScore ?? score.home ?? 0,
    away: Number.isFinite(state.awayScore) ? state.awayScore : score.awayScore ?? score.away ?? 0,
  };
}

function setDisplayMessageStatus(message = '', kind = 'neutral') {
  displayMessageStatus.textContent = message;
  displayMessageStatus.dataset.kind = kind;
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

function renderAudioToggle() {
  audioToggleButton.textContent = audioAlertsEnabled
    ? 'Alertes sonores activées'
    : 'Activer les alertes sonores';
  audioToggleButton.classList.toggle('enabled', audioAlertsEnabled);
  audioToggleButton.setAttribute('aria-pressed', String(audioAlertsEnabled));
}

function getAudioContext() {
  if (!audioContext) {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;

    if (!AudioContextConstructor) {
      return null;
    }

    audioContext = new AudioContextConstructor();
  }

  return audioContext;
}

async function unlockAudioContext() {
  const context = getAudioContext();

  if (context && context.state === 'suspended') {
    await context.resume();
  }

  return context;
}

function playTone(context, destination, startTime, frequency, duration, volume, type = 'sine') {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, startTime + duration * 0.34);
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.012);
  gain.gain.setValueAtTime(volume * 0.82, startTime + duration * 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration + 0.04);
}

async function playHappyHourSound() {
  const context = await unlockAudioContext();

  if (!context) {
    return;
  }

  const now = context.currentTime;
  const masterGain = context.createGain();
  const compressor = context.createDynamicsCompressor();

  masterGain.gain.setValueAtTime(0.74, now);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.9);
  compressor.threshold.setValueAtTime(-16, now);
  compressor.knee.setValueAtTime(20, now);
  compressor.ratio.setValueAtTime(8, now);
  compressor.attack.setValueAtTime(0.004, now);
  compressor.release.setValueAtTime(0.18, now);
  masterGain.connect(compressor);
  compressor.connect(context.destination);

  const notes = [
    { offset: 0, frequency: 880, duration: 0.28, volume: 0.52, type: 'triangle' },
    { offset: 0, frequency: 1760, duration: 0.18, volume: 0.18, type: 'sine' },
    { offset: 0.24, frequency: 1174, duration: 0.32, volume: 0.5, type: 'triangle' },
    { offset: 0.24, frequency: 2348, duration: 0.2, volume: 0.16, type: 'sine' },
    { offset: 0.62, frequency: 880, duration: 0.28, volume: 0.5, type: 'triangle' },
    { offset: 0.62, frequency: 1760, duration: 0.18, volume: 0.17, type: 'sine' },
    { offset: 0.86, frequency: 1318, duration: 0.42, volume: 0.48, type: 'triangle' },
    { offset: 0.86, frequency: 2637, duration: 0.22, volume: 0.15, type: 'sine' },
  ];

  for (const note of notes) {
    playTone(
      context,
      masterGain,
      now + note.offset,
      note.frequency,
      note.duration,
      note.volume,
      note.type,
    );
  }
}

function showAudioAlertAnimation() {
  window.clearTimeout(alertAnimationTimeout);
  document.body.classList.add('audio-alert-playing');
  audioAlertBanner.hidden = false;

  alertAnimationTimeout = window.setTimeout(() => {
    document.body.classList.remove('audio-alert-playing');
    audioAlertBanner.hidden = true;
  }, 2400);
}

async function triggerHappyHourAlert() {
  if (!audioAlertsEnabled) {
    return;
  }

  showAudioAlertAnimation();
  await playHappyHourSound();
}

async function enableAudioAlerts() {
  audioAlertsEnabled = true;
  localStorage.setItem(audioAlertsStorageKey, 'true');
  renderAudioToggle();
  showAudioAlertAnimation();
  await playHappyHourSound();
}

function renderTvControlState(state = emptyState) {
  const score = getScoreParts(state);

  displayModeValue.textContent = state.displayMode || 'PRE_MATCH';
  matchStatusValue.textContent = state.matchStatus || (state.matchStarted ? 'FIRST_HALF' : 'NOT_STARTED');
  happyHourActiveValue.textContent = String(Boolean(state.happyHourActive));
  remainingSecondsValue.textContent = String(state.remainingSeconds ?? 0);
  currentScoreValue.textContent = `${score.home} - ${score.away}`;

  const banner = state.bannerMessage || '';
  const fullscreen = state.fullscreenMessage || '';

  if (fullscreen) {
    setDisplayMessageStatus(`Plein écran actif : ${fullscreen}`, 'success');
  } else if (banner) {
    setDisplayMessageStatus(`Bannière active : ${banner}`, 'success');
  } else {
    setDisplayMessageStatus('Aucun message TV actif');
  }
}

function renderSpotifyState(state = emptyState) {
  const spotify = state.spotify || {};

  spotifyTitleValue.textContent = spotify.title || '-';
  spotifyArtistValue.textContent = spotify.artist || '-';
  spotifyPlayingValue.textContent = spotify.isPlaying ? 'Oui' : 'Non';
}

function renderState(state = emptyState) {
  const homeName = getTeamName(state.homeTeam);
  const awayName = getTeamName(state.awayTeam);
  const score = getScoreParts(state);
  const isScoreLocked = Boolean(state.scoreLockActive);
  const happyHourStarted = hasRenderedState
    && !previousHappyHourActive
    && state.happyHourActive;

  homeTeam.textContent = getTeamShortName(state.homeTeam);
  awayTeam.textContent = getTeamShortName(state.awayTeam);
  homeScore.textContent = String(score.home);
  awayScore.textContent = String(score.away);
  matchFullName.textContent = `${homeName} vs ${awayName}`;
  timer.textContent = formatSeconds(state.remainingSeconds);

  const isSimulation = simulationEnabled(state);

  document.body.classList.toggle('happy-hour-active', state.happyHourActive);
  document.body.classList.toggle('api-live-mode', !isSimulation);
  document.body.classList.toggle('score-locked', isScoreLocked);
  statusDot.classList.toggle('active', state.happyHourActive);
  statusLabel.textContent = state.happyHourActive
    ? 'Happy hour active'
    : 'Happy hour inactive';
  sourceBadge.textContent = isSimulation ? 'MATCH SIMULE' : 'API LIVE PLACEHOLDER';

  resetButton.toggleAttribute('disabled', !state.happyHourActive);
  stopButton.toggleAttribute('disabled', !state.happyHourActive);
  homeGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  awayGoalButton.toggleAttribute('disabled', !isSimulation || isScoreLocked);
  resetScoreButton.toggleAttribute('disabled', !isSimulation);
  undoLastButton.toggleAttribute('disabled', !isSimulation || !state.canUndoLastAction);
  scoreLockNotice.textContent = isScoreLocked
    ? `Score verrouillé : ${state.scoreLockRemainingSeconds} s`
    : 'Score modifiable';
  undoStatus.textContent = state.canUndoLastAction
    ? `Action annulable : ${state.lastActionLabel || 'dernier but'}`
    : 'Aucune action annulable';
  renderTvControlState(state);
  renderSpotifyState(state);

  if (happyHourStarted) {
    void triggerHappyHourAlert();
  }

  previousHappyHourActive = state.happyHourActive;
  hasRenderedState = true;
}

async function postAction(path = '') {
  const response = await fetch(path, { method: 'POST' });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    if (payload.error === 'score_locked') {
      scoreLockNotice.textContent = `Score verrouillé : ${payload.lockRemainingSeconds} s`;
      return;
    }

    undoStatus.textContent = payload.error === 'no_undo_available'
      ? 'Aucune action annulable'
      : `Erreur action : ${response.status}`;
    return;
  }

  renderState(payload);
}

async function postJsonAction(path = '', body = {}) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await readResponseJson(response);

  if (!response.ok) {
    setDisplayMessageStatus(`Action TV refusée : ${response.status}`, 'error');
    return;
  }

  renderState(payload);
}

async function sendBannerMessage() {
  const message = bannerMessageInput.value.trim();

  if (!message) {
    setDisplayMessageStatus('Bannière vide, action ignorée', 'error');
    return;
  }

  await postJsonAction('/api/display/banner', { message });
}

async function sendFullscreenMessage() {
  const message = fullscreenMessageInput.value.trim();

  if (!message) {
    setDisplayMessageStatus('Message plein écran vide, action ignorée', 'error');
    return;
  }

  await postJsonAction('/api/display/fullscreen-message', { message });
}

async function loadInitialState() {
  const response = await fetch('/api/state');

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  renderState(await readResponseJson(response));
}

async function pollState() {
  if (statePollInFlight) {
    return;
  }

  statePollInFlight = true;

  try {
    const response = await fetch('/api/state', { cache: 'no-store' });

    if (response.ok) {
      renderState(await readResponseJson(response));
    }
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
      // Ignore malformed realtime payloads; polling keeps the panel in sync.
    }
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
  if (!window.confirm('Confirmer la remise à zéro du score ?')) {
    return;
  }

  void postAction('/api/simulation/reset-score');
});

undoLastButton.addEventListener('click', () => {
  void postAction('/api/simulation/undo-last');
});

matchStartButton.addEventListener('click', () => {
  void postAction('/api/match/start');
});

matchHalfTimeButton.addEventListener('click', () => {
  void postAction('/api/match/half-time');
});

matchResumeButton.addEventListener('click', () => {
  void postAction('/api/match/resume');
});

matchFinishButton.addEventListener('click', () => {
  void postAction('/api/match/finish');
});

sendBannerButton.addEventListener('click', () => {
  void sendBannerMessage();
});

showFullscreenButton.addEventListener('click', () => {
  void sendFullscreenMessage();
});

clearMessagesButton.addEventListener('click', () => {
  void postAction('/api/display/clear-message');
});

audioToggleButton.addEventListener('click', () => {
  void enableAudioAlerts();
});

document.addEventListener('click', () => {
  if (audioAlertsEnabled) {
    void unlockAudioContext();
  }
}, { once: true });

renderAudioToggle();
void loadInitialState();
connectRealtime();
window.setInterval(() => {
  void pollState();
}, 1000);

export {};
