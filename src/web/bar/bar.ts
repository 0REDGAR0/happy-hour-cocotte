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
  preMatch: {
    enabled: true,
    kickoffAt: '',
    programMessages: [
      'Service au bar pendant tout le match',
      '5 minutes de Happy Hour à chaque but de la France',
      'Les offres s’affichent automatiquement sur la TV',
    ],
  },
  spotify: {
    status: 'not_configured',
    title: '',
    artist: '',
    albumArtUrl: null,
    isPlaying: false,
    progressMs: null,
    durationMs: null,
    deviceName: null,
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
const scoreHomePlusButton = element('#score-home-plus-button');
const scoreHomeMinusButton = element('#score-home-minus-button');
const scoreAwayPlusButton = element('#score-away-plus-button');
const scoreAwayMinusButton = element('#score-away-minus-button');
const resetScoreButton = element('#reset-score-button');
const scoreLockNotice = element('#score-lock-notice');
const undoStatus = element('#undo-status');
const audioToggleButton = element('#audio-toggle-button');
const audioAlertBanner = element('#audio-alert-banner');
const matchStartButton = element('#match-start-button');
const matchHalfTimeButton = element('#match-half-time-button');
const matchResumeButton = element('#match-resume-button');
const matchFinishButton = element('#match-finish-button');
const preMatchActivateButtons = Array.from(document.querySelectorAll('[data-pre-match-activate]'));
const preMatchDeactivateButton = element('#pre-match-deactivate-button');
const preMatchKickoffInput = element('#pre-match-kickoff-input');
const preMatchProgramInputs = Array.from(document.querySelectorAll('.pre-match-program-input'));
const preMatchSaveButton = element('#pre-match-save-button');
const preMatchStatus = element('#pre-match-status');
const preMatchSummaryHomeTeam = element('#pre-match-summary-home-team');
const preMatchSummaryAwayTeam = element('#pre-match-summary-away-team');
const preMatchSummaryKickoff = element('#pre-match-summary-kickoff');
const preMatchSummaryEnabled = element('#pre-match-summary-enabled');
const preMatchSummaryProgram = element('#pre-match-summary-program');
const fullscreenMessageInput = element('#fullscreen-message-input');
const showFullscreenButton = element('#show-fullscreen-button');
const clearMessagesButton = element('#clear-messages-button');
const displayMessageStatus = element('#display-message-status');
const eventBannerEditor = element('#event-banner-editor');
const addEventBannerButton = element('#add-event-banner-button');
const saveEventBannersButton = element('#save-event-banners-button');
const showRandomBannerButton = element('#show-random-banner-button');
const eventBannerStatus = element('#event-banner-status');
const displayModeValue = element('#display-mode-value');
const matchStatusValue = element('#match-status-value');
const happyHourActiveValue = element('#happy-hour-active-value');
const remainingSecondsValue = element('#remaining-seconds-value');
const currentScoreValue = element('#current-score-value');
const serverUrlValue = element('#server-url-value');
const serverPublicUrlStatus = element('#server-public-url-status');
const serverQuickLinks = element('#server-quick-links');
const spotifyStatusValue = element('#spotify-status-value');
const spotifyTitleValue = element('#spotify-title-value');
const spotifyArtistValue = element('#spotify-artist-value');
const spotifyPlayingValue = element('#spotify-playing-value');
const spotifyProgressValue = element('#spotify-progress-value');
const spotifyDeviceValue = element('#spotify-device-value');
const spotifyConnectLink = element('#spotify-connect-link');
const spotifyNavStatus = element('#spotify-nav-status');
const currentSectionTitle = element('#current-section-title');
const navItems = Array.from(document.querySelectorAll('.nav-item'));
const dashboardSections = Array.from(document.querySelectorAll('.dashboard-section'));
const drinkEditor = element('#drink-editor');
const addDrinkButton = element('#add-drink-button');
const saveDrinksButton = element('#save-drinks-button');
const drinksStatus = element('#drinks-status');
const programEditor = element('#program-editor');
const addProgramButton = element('#add-program-button');
const saveProgramButton = element('#save-program-button');
const programStatus = element('#program-status');
const livelyEditor = element('#lively-editor');
const addLivelyMessageButton = element('#add-lively-message-button');
const saveLivelyMessagesButton = element('#save-lively-messages-button');
const livelyStatus = element('#lively-status');

const audioAlertsStorageKey = 'cocotte.bar.audioAlertsEnabled';
let audioAlertsEnabled = localStorage.getItem(audioAlertsStorageKey) === 'true';
let audioContext = null;
let hasRenderedState = false;
let previousHappyHourActive = false;
let alertAnimationTimeout = 0;
let statePollInFlight = false;
let preMatchFormDirty = false;
let editableDrinks = [];
let editableProgramItems = [];
let editableEventBanners = [];
let editableLivelyMessages = [];
let lastSuccessfulStateAt = 0;

const sectionTitles = {
  overview: 'Vue générale',
  'pre-match': 'Diffusion & contenus',
  drinks: 'Boissons',
  music: 'Musique',
  system: 'État système',
};

function formatSeconds(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPrice(price = 0) {
  return `${Number(price || 0).toFixed(2)} €`;
}

function formatMs(value = null) {
  if (!Number.isFinite(value)) {
    return '-';
  }

  return formatSeconds(Math.floor(value / 1000));
}

function escapeAttribute(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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

function setPreMatchStatus(message = '', kind = 'neutral') {
  preMatchStatus.textContent = message;
  preMatchStatus.dataset.kind = kind;
}

function setDrinksStatus(message = '', kind = 'neutral') {
  drinksStatus.textContent = message;
  drinksStatus.dataset.kind = kind;
}

function setProgramStatus(message = '', kind = 'neutral') {
  programStatus.textContent = message;
  programStatus.dataset.kind = kind;
}

function setEventBannerStatus(message = '', kind = 'neutral') {
  eventBannerStatus.textContent = message;
  eventBannerStatus.dataset.kind = kind;
}

function setLivelyStatus(message = '', kind = 'neutral') {
  livelyStatus.textContent = message;
  livelyStatus.dataset.kind = kind;
}

function setConnectionStatus(kind = 'unstable') {
  const labels = {
    connected: 'Serveur connecté',
    unstable: 'Connexion instable',
    lost: 'Connexion perdue',
  };

  statusLabel.textContent = labels[kind] || labels.unstable;
  statusDot.dataset.connection = kind;
}

function markStateConnectionOk() {
  lastSuccessfulStateAt = Date.now();
  setConnectionStatus('connected');
}

function markStateConnectionProblem() {
  setConnectionStatus(lastSuccessfulStateAt && Date.now() - lastSuccessfulStateAt < 10000 ? 'unstable' : 'lost');
}

function toDateTimeLocalValue(value = '') {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16);
  }

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toOffsetDateTime(value = '') {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const pad = (part) => String(part).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffsetMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.floor(absoluteOffsetMinutes / 60);
  const offsetRestMinutes = absoluteOffsetMinutes % 60;

  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`,
    `${offsetSign}${pad(offsetHours)}:${pad(offsetRestMinutes)}`,
  ].join('');
}

function formatKickoff(value = '') {
  if (!value) {
    return 'Non renseigné';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function showSection(sectionId = 'overview') {
  const nextSection = sectionTitles[sectionId] ? sectionId : 'overview';

  for (const section of dashboardSections) {
    const isActive = section.dataset.section === nextSection;
    section.classList.toggle('active', isActive);
    section.toggleAttribute('hidden', !isActive);
  }

  for (const item of navItems) {
    const isActive = item.dataset.sectionTarget === nextSection;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-current', isActive ? 'page' : 'false');
  }

  currentSectionTitle.textContent = sectionTitles[nextSection];
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
    setDisplayMessageStatus(`Bannière diffusée : ${banner}`, 'success');
  } else {
    setDisplayMessageStatus('Aucun message plein ecran actif');
  }
}

function renderServerInfo(payload = {}) {
  const publicBaseUrl = payload.publicBaseUrl || '';
  const localNetworkUrls = Array.isArray(payload.localNetworkUrls) ? payload.localNetworkUrls : [];
  const baseUrl = publicBaseUrl || localNetworkUrls[0] || window.location.origin;

  serverUrlValue.textContent = baseUrl;
  serverPublicUrlStatus.textContent = publicBaseUrl ? 'Configure' : 'Non configure';
  serverPublicUrlStatus.dataset.kind = publicBaseUrl ? 'success' : 'neutral';

  const links = [
    { label: '/admin', path: '/admin' },
    { label: '/salle', path: '/salle' },
    { label: '/tablette', path: '/tablette' },
  ].map((item) => {
    const link = document.createElement('a');
    link.href = `${baseUrl}${item.path}`;
    link.textContent = item.label;
    link.target = '_blank';
    link.rel = 'noreferrer';
    return link;
  });

  serverQuickLinks.replaceChildren(...links);
}

async function loadServerInfo() {
  let response;

  try {
    response = await fetch('/api/server-info', { cache: 'no-store' });
  } catch {
    serverUrlValue.textContent = 'Connexion serveur perdue';
    serverPublicUrlStatus.textContent = 'Indisponible';
    serverPublicUrlStatus.dataset.kind = 'error';
    serverQuickLinks.textContent = '-';
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    serverUrlValue.textContent = `Erreur serveur : ${response.status}`;
    serverPublicUrlStatus.textContent = 'Indisponible';
    serverPublicUrlStatus.dataset.kind = 'error';
    serverQuickLinks.textContent = '-';
    return;
  }

  renderServerInfo(payload);
}

function renderSpotifyState(state = emptyState) {
  const spotify = state.spotify || {};
  const statusLabels = {
    connected: 'Connecté',
    not_configured: 'Non configuré',
    error: 'Erreur',
    no_playback: 'Aucune lecture',
  };

  spotifyStatusValue.textContent = statusLabels[spotify.status] || spotify.status || 'Inconnu';
  spotifyStatusValue.dataset.kind = spotify.status === 'connected' ? 'success' : spotify.status === 'error' ? 'error' : 'neutral';
  spotifyConnectLink.href = '/api/spotify/login';

  if (spotify.status === 'not_configured') {
    spotifyNavStatus.textContent = 'Spotify non configuré';
    spotifyTitleValue.textContent = 'Spotify non configure';
    spotifyArtistValue.textContent = '-';
    spotifyPlayingValue.textContent = 'Non configure';
    spotifyProgressValue.textContent = '-';
    spotifyDeviceValue.textContent = '-';
    return;
  }

  if (spotify.status === 'error') {
    spotifyNavStatus.textContent = 'Erreur Spotify';
    spotifyTitleValue.textContent = 'Erreur Spotify';
    spotifyArtistValue.textContent = '-';
    spotifyPlayingValue.textContent = 'Erreur';
    spotifyProgressValue.textContent = '-';
    spotifyDeviceValue.textContent = '-';
    return;
  }

  if (spotify.status === 'no_playback') {
    spotifyNavStatus.textContent = 'Aucune lecture';
    spotifyTitleValue.textContent = 'Aucun morceau en cours';
    spotifyArtistValue.textContent = '-';
    spotifyPlayingValue.textContent = 'Non';
    spotifyProgressValue.textContent = '-';
    spotifyDeviceValue.textContent = spotify.deviceName || '-';
    return;
  }

  spotifyTitleValue.textContent = spotify.title || '-';
  spotifyArtistValue.textContent = spotify.artist || '-';
  spotifyPlayingValue.textContent = spotify.isPlaying ? 'Oui' : 'Non';
  spotifyProgressValue.textContent = `${formatMs(spotify.progressMs)} / ${formatMs(spotify.durationMs)}`;
  spotifyDeviceValue.textContent = spotify.deviceName || '-';
  spotifyNavStatus.textContent = spotify.isPlaying
    ? `${spotify.title || 'Lecture en cours'}${spotify.artist ? ` - ${spotify.artist}` : ''}`
    : 'Spotify connecté, en pause';
}

function renderPreMatchState(state = emptyState) {
  const preMatch = {
    ...emptyState.preMatch,
    ...(state.preMatch || {}),
  };
  const messages = Array.isArray(preMatch.programMessages)
    ? preMatch.programMessages
    : emptyState.preMatch.programMessages;
  const programItems = Array.isArray(preMatch.programItems)
    ? preMatch.programItems
    : messages.map((message, index) => ({
        id: `legacy-${index}`,
        icon: '•',
        text: message,
        active: true,
        sortOrder: (index + 1) * 10,
      }));

  if (!preMatchFormDirty) {
    preMatchKickoffInput.value = toDateTimeLocalValue(preMatch.kickoffAt || '');

    preMatchProgramInputs.forEach((input, index) => {
      input.value = messages[index] || '';
    });
  }

  preMatchSummaryHomeTeam.textContent = getTeamName(state.homeTeam);
  preMatchSummaryAwayTeam.textContent = getTeamName(state.awayTeam);
  preMatchSummaryKickoff.textContent = formatKickoff(preMatch.kickoffAt || '');
  preMatchSummaryEnabled.textContent = preMatch.enabled ? 'Actif' : 'Inactif';
  preMatchSummaryEnabled.dataset.kind = preMatch.enabled ? 'success' : 'neutral';
  preMatchSummaryProgram.replaceChildren(...programItems.map((programItem) => {
    const item = document.createElement('li');
    item.textContent = `${programItem.icon || '•'} ${programItem.text || ''}`.trim();
    return item;
  }));

  setPreMatchStatus(
    preMatch.enabled ? 'Écran avant-match actif' : 'Écran avant-match désactivé',
    preMatch.enabled ? 'success' : 'neutral',
  );
}

function renderDrinksState(state = emptyState) {
  if (!editableDrinks.length) {
    const drinks = Array.isArray(state.drinks) && state.drinks.length ? state.drinks : state.menu?.drinks ?? [];
    editableDrinks = drinks.map((drink) => ({ ...drink }));
    renderDrinkEditor();
  }
}

function renderDrinkEditor() {
  if (!editableDrinks.length) {
    const note = document.createElement('p');
    note.className = 'placeholder-note';
    note.textContent = 'Aucune boisson renseignée.';
    drinkEditor.replaceChildren(note);
    return;
  }

  drinkEditor.replaceChildren(...editableDrinks.map((drink, index) => {
    const item = document.createElement('article');
    item.className = 'drink-editor-row';
    item.dataset.index = String(index);
    item.innerHTML = `
      <label class="message-field">
        <span>Icone</span>
        <input data-drink-field="icon" type="text" maxlength="8" value="${escapeAttribute(drink.icon || '')}">
      </label>
      <label class="message-field">
        <span>Nom</span>
        <input data-drink-field="name" type="text" value="${escapeAttribute(drink.name || '')}">
      </label>
      <label class="message-field">
        <span>Prix original</span>
        <input data-drink-field="originalPrice" type="number" min="0" step="0.1" value="${drink.originalPrice ?? drink.price ?? 0}">
      </label>
      <label class="message-field">
        <span>Prix Happy Hour</span>
        <input data-drink-field="happyHourPrice" type="number" min="0" step="0.1" value="${drink.happyHourPrice ?? drink.price ?? 0}">
      </label>
      <label class="drink-active-field">
        <input data-drink-field="active" type="checkbox" ${drink.active === false ? '' : 'checked'}>
        <span>Actif</span>
      </label>
      <button class="control-button danger drink-delete-button" type="button">Supprimer</button>
    `;
    return item;
  }));
}

function renderState(state = emptyState) {
  markStateConnectionOk();
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
  sourceBadge.textContent = isSimulation ? 'MATCH SIMULE' : 'API LIVE PLACEHOLDER';

  resetButton.toggleAttribute('disabled', !state.happyHourActive);
  stopButton.toggleAttribute('disabled', !state.happyHourActive);
  scoreHomePlusButton.toggleAttribute('disabled', !isSimulation);
  scoreHomeMinusButton.toggleAttribute('disabled', !isSimulation);
  scoreAwayPlusButton.toggleAttribute('disabled', !isSimulation);
  scoreAwayMinusButton.toggleAttribute('disabled', !isSimulation);
  resetScoreButton.toggleAttribute('disabled', !isSimulation);
  scoreLockNotice.textContent = isScoreLocked
    ? `Score verrouillé : ${state.scoreLockRemainingSeconds} s`
    : 'Score modifiable';
  undoStatus.textContent = state.canUndoLastAction
    ? `Action annulable : ${state.lastActionLabel || 'dernier but'}`
    : 'Aucune action annulable';
  renderTvControlState(state);
  renderSpotifyState(state);
  renderPreMatchState(state);
  renderDrinksState(state);

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

async function sendFullscreenMessage() {
  const message = fullscreenMessageInput.value.trim();

  if (!message) {
    setDisplayMessageStatus('Message plein écran vide, action ignorée', 'error');
    return;
  }

  await postJsonAction('/api/display/fullscreen-message', { message });
}

async function loadEditableDrinks() {
  let response;

  try {
    response = await fetch('/api/drinks', { cache: 'no-store' });
  } catch {
    setDrinksStatus('Chargement boissons impossible : connexion serveur perdue', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    setDrinksStatus(`Chargement boissons impossible : ${response.status}`, 'error');
    return;
  }

  editableDrinks = Array.isArray(payload.drinks) ? payload.drinks.map((drink) => ({ ...drink })) : [];
  renderDrinkEditor();
  setDrinksStatus('Carte chargée.', 'success');
}

function readDrinkEditor() {
  editableDrinks = Array.from(document.querySelectorAll('.drink-editor-row')).map((row) => {
    const index = Number(row.dataset.index);
    const currentDrink = editableDrinks[index] ?? {};
    const iconInput = row.querySelector('[data-drink-field="icon"]');
    const nameInput = row.querySelector('[data-drink-field="name"]');
    const priceInput = row.querySelector('[data-drink-field="originalPrice"]');
    const happyHourPriceInput = row.querySelector('[data-drink-field="happyHourPrice"]');
    const activeInput = row.querySelector('[data-drink-field="active"]');

    return {
      ...currentDrink,
      icon: iconInput.value.trim(),
      name: nameInput.value.trim(),
      originalPrice: Number(priceInput.value),
      price: Number(priceInput.value),
      happyHourPrice: Number(happyHourPriceInput.value),
      active: Boolean(activeInput.checked),
    };
  });
}

async function saveEditableDrinks() {
  readDrinkEditor();
  setDrinksStatus('Sauvegarde en cours...');

  for (const drink of editableDrinks) {
    if (!drink.name) {
      setDrinksStatus('Chaque boisson doit avoir un nom.', 'error');
      return;
    }

    const method = drink.id ? 'PUT' : 'POST';
    const path = drink.id ? `/api/drinks/${encodeURIComponent(drink.id)}` : '/api/drinks';
    let response;

    try {
      response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(drink),
      });
    } catch {
      setDrinksStatus('Sauvegarde impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setDrinksStatus(`Sauvegarde refusée : ${response.status}`, 'error');
      return;
    }
  }

  await loadEditableDrinks();
  setDrinksStatus('Carte sauvegardée.', 'success');
}

function addEditableDrink() {
  readDrinkEditor();
  editableDrinks = [
    ...editableDrinks,
    {
      id: '',
      name: 'Nouvelle boisson',
      icon: '🍺',
      originalPrice: 0,
      price: 0,
      happyHourPrice: 0,
      active: true,
      currency: 'EUR',
    },
  ];
  renderDrinkEditor();
}

async function deleteEditableDrink(index) {
  readDrinkEditor();
  const drink = editableDrinks[index];

  if (!drink) {
    return;
  }

  if (drink.id) {
    let response;

    try {
      response = await fetch(`/api/drinks/${encodeURIComponent(drink.id)}`, { method: 'DELETE' });
    } catch {
      setDrinksStatus('Suppression impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setDrinksStatus(`Suppression refusée : ${response.status}`, 'error');
      return;
    }
  }

  editableDrinks = editableDrinks.filter((_, candidateIndex) => candidateIndex !== index);
  renderDrinkEditor();
  setDrinksStatus('Boisson supprimée.', 'success');
}

async function loadEditableProgram() {
  let response;

  try {
    response = await fetch('/api/program', { cache: 'no-store' });
  } catch {
    setProgramStatus('Chargement programme impossible : connexion serveur perdue', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    setProgramStatus(`Chargement programme impossible : ${response.status}`, 'error');
    return;
  }

  editableProgramItems = Array.isArray(payload.programItems)
    ? payload.programItems.map((item) => ({ ...item }))
    : [];
  renderProgramEditor();
  setProgramStatus('Programme charge.', 'success');
}

function renderProgramEditor() {
  if (!editableProgramItems.length) {
    const note = document.createElement('p');
    note.className = 'placeholder-note';
    note.textContent = 'Aucune ligne de programme renseignee.';
    programEditor.replaceChildren(note);
    return;
  }

  programEditor.replaceChildren(...editableProgramItems.map((programItem, index) => {
    const item = document.createElement('article');
    item.className = 'program-editor-row';
    item.dataset.index = String(index);
    item.innerHTML = `
      <label class="message-field">
        <span>Icone</span>
        <input data-program-field="icon" type="text" maxlength="8" value="${escapeAttribute(programItem.icon || '')}">
      </label>
      <label class="message-field">
        <span>Texte</span>
        <input data-program-field="text" type="text" maxlength="140" value="${escapeAttribute(programItem.text || '')}">
      </label>
      <label class="message-field">
        <span>Ordre</span>
        <input data-program-field="sortOrder" type="number" step="1" value="${programItem.sortOrder ?? (index + 1) * 10}">
      </label>
      <label class="drink-active-field">
        <input data-program-field="active" type="checkbox" ${programItem.active === false ? '' : 'checked'}>
        <span>Actif</span>
      </label>
      <button class="control-button danger program-delete-button" type="button">Supprimer</button>
    `;
    return item;
  }));
}

function readProgramEditor() {
  editableProgramItems = Array.from(document.querySelectorAll('.program-editor-row')).map((row) => {
    const index = Number(row.dataset.index);
    const currentItem = editableProgramItems[index] ?? {};
    const iconInput = row.querySelector('[data-program-field="icon"]');
    const textInput = row.querySelector('[data-program-field="text"]');
    const activeInput = row.querySelector('[data-program-field="active"]');
    const sortOrderInput = row.querySelector('[data-program-field="sortOrder"]');

    return {
      ...currentItem,
      icon: iconInput.value.trim(),
      text: textInput.value.trim(),
      active: Boolean(activeInput.checked),
      sortOrder: Number(sortOrderInput.value),
    };
  });
}

async function saveEditableProgram() {
  readProgramEditor();
  setProgramStatus('Sauvegarde en cours...');

  for (const programItem of editableProgramItems) {
    if (!programItem.text) {
      setProgramStatus('Chaque ligne de programme doit avoir un texte.', 'error');
      return;
    }

    const method = programItem.id ? 'PUT' : 'POST';
    const path = programItem.id ? `/api/program/${encodeURIComponent(programItem.id)}` : '/api/program';
    let response;

    try {
      response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(programItem),
      });
    } catch {
      setProgramStatus('Sauvegarde programme impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setProgramStatus(`Sauvegarde programme refusee : ${response.status}`, 'error');
      return;
    }
  }

  await loadEditableProgram();
  setProgramStatus('Programme sauvegarde.', 'success');
}

function addEditableProgramItem() {
  readProgramEditor();
  editableProgramItems = [
    ...editableProgramItems,
    {
      id: '',
      icon: '•',
      text: 'Nouvelle ligne',
      active: true,
      sortOrder: (editableProgramItems.length + 1) * 10,
    },
  ];
  renderProgramEditor();
}

async function deleteEditableProgramItem(index) {
  readProgramEditor();
  const programItem = editableProgramItems[index];

  if (!programItem) {
    return;
  }

  if (programItem.id) {
    let response;

    try {
      response = await fetch(`/api/program/${encodeURIComponent(programItem.id)}`, { method: 'DELETE' });
    } catch {
      setProgramStatus('Suppression programme impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setProgramStatus(`Suppression programme refusee : ${response.status}`, 'error');
      return;
    }
  }

  editableProgramItems = editableProgramItems.filter((_, candidateIndex) => candidateIndex !== index);
  renderProgramEditor();
  setProgramStatus('Ligne de programme supprimee.', 'success');
}

async function loadEditableEventBanners() {
  let response;

  try {
    response = await fetch('/api/event-banners', { cache: 'no-store' });
  } catch {
    setEventBannerStatus('Chargement bannieres impossible : connexion serveur perdue', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    setEventBannerStatus(`Chargement bannieres impossible : ${response.status}`, 'error');
    return;
  }

  if (!Array.isArray(payload.eventBanners)) {
    setEventBannerStatus('Chargement bannieres impossible : donnees absentes', 'error');
    return;
  }

  editableEventBanners = payload.eventBanners.map((banner) => ({ ...banner }));
  renderEventBannerEditor();
  setEventBannerStatus('Bannieres chargees.', 'success');
}

function renderEventBannerEditor() {
  if (!editableEventBanners.length) {
    const note = document.createElement('p');
    note.className = 'placeholder-note';
    note.textContent = 'Aucune banniere evenementielle configuree.';
    eventBannerEditor.replaceChildren(note);
    return;
  }

  eventBannerEditor.replaceChildren(...editableEventBanners.map((banner, index) => {
    const item = document.createElement('article');
    item.className = 'event-banner-editor-row';
    item.dataset.index = String(index);
    item.innerHTML = `
      <label class="message-field">
        <span>Texte</span>
        <input data-event-banner-field="text" type="text" maxlength="160" value="${escapeAttribute(banner.text || '')}">
      </label>
      <label class="message-field">
        <span>Ordre</span>
        <input data-event-banner-field="sortOrder" type="number" step="1" value="${banner.sortOrder ?? (index + 1) * 10}">
      </label>
      <label class="drink-active-field">
        <input data-event-banner-field="active" type="checkbox" ${banner.active === false ? '' : 'checked'}>
        <span>Actif</span>
      </label>
      <button class="control-button danger event-banner-delete-button" type="button">Supprimer</button>
    `;
    return item;
  }));
}

function readEventBannerEditor() {
  editableEventBanners = Array.from(document.querySelectorAll('.event-banner-editor-row')).map((row) => {
    const index = Number(row.dataset.index);
    const currentBanner = editableEventBanners[index] ?? {};
    const textInput = row.querySelector('[data-event-banner-field="text"]');
    const activeInput = row.querySelector('[data-event-banner-field="active"]');
    const sortOrderInput = row.querySelector('[data-event-banner-field="sortOrder"]');

    return {
      ...currentBanner,
      text: textInput.value.trim(),
      active: Boolean(activeInput.checked),
      sortOrder: Number(sortOrderInput.value),
    };
  });
}

async function saveEditableEventBanners() {
  readEventBannerEditor();
  setEventBannerStatus('Sauvegarde en cours...');

  for (const banner of editableEventBanners) {
    if (!banner.text) {
      setEventBannerStatus('Chaque banniere doit avoir un texte.', 'error');
      return;
    }

    const method = banner.id ? 'PUT' : 'POST';
    const path = banner.id ? `/api/event-banners/${encodeURIComponent(banner.id)}` : '/api/event-banners';
    let response;

    try {
      response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(banner),
      });
    } catch {
      setEventBannerStatus('Sauvegarde bannieres impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setEventBannerStatus(`Sauvegarde bannieres refusee : ${response.status}`, 'error');
      return;
    }
  }

  await loadEditableEventBanners();
  setEventBannerStatus('Bannieres sauvegardees.', 'success');
}

function addEditableEventBanner() {
  readEventBannerEditor();
  editableEventBanners = [
    ...editableEventBanners,
    {
      id: '',
      text: 'Nouvelle banniere evenementielle',
      active: true,
      sortOrder: (editableEventBanners.length + 1) * 10,
    },
  ];
  renderEventBannerEditor();
}

async function deleteEditableEventBanner(index) {
  readEventBannerEditor();
  const banner = editableEventBanners[index];

  if (!banner) {
    return;
  }

  if (banner.id) {
    let response;

    try {
      response = await fetch(`/api/event-banners/${encodeURIComponent(banner.id)}`, { method: 'DELETE' });
    } catch {
      setEventBannerStatus('Suppression banniere impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setEventBannerStatus(`Suppression banniere refusee : ${response.status}`, 'error');
      return;
    }
  }

  editableEventBanners = editableEventBanners.filter((_, candidateIndex) => candidateIndex !== index);
  renderEventBannerEditor();
  setEventBannerStatus('Banniere supprimee.', 'success');
}

async function showRandomEventBanner() {
  let response;

  try {
    response = await fetch('/api/display/random-banner', { method: 'POST' });
  } catch {
    setEventBannerStatus('Diffusion banniere impossible : connexion serveur perdue', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    setEventBannerStatus(
      payload.error === 'No active event banner'
        ? 'Aucune banniere active a diffuser.'
        : `Diffusion banniere refusee : ${response.status}`,
      'error',
    );
    return;
  }

  renderState(payload);
  setEventBannerStatus('Banniere diffusee.', 'success');
}

async function loadEditableLivelyMessages() {
  let response;

  try {
    response = await fetch('/api/lively-messages', { cache: 'no-store' });
  } catch {
    setLivelyStatus('Chargement messages vivants impossible : connexion serveur perdue', 'error');
    return;
  }

  const payload = await readResponseJson(response);

  if (!response.ok) {
    setLivelyStatus(`Chargement messages vivants impossible : ${response.status}`, 'error');
    return;
  }

  editableLivelyMessages = Array.isArray(payload.livelyMessages)
    ? payload.livelyMessages.map((message) => ({ ...message }))
    : [];
  renderLivelyEditor();
  setLivelyStatus('Messages vivants charges.', 'success');
}

function renderLivelyEditor() {
  if (!editableLivelyMessages.length) {
    const note = document.createElement('p');
    note.className = 'placeholder-note';
    note.textContent = 'Aucune phrase vivante configuree.';
    livelyEditor.replaceChildren(note);
    return;
  }

  livelyEditor.replaceChildren(...editableLivelyMessages.map((message, index) => {
    const item = document.createElement('article');
    item.className = 'lively-editor-row';
    item.dataset.index = String(index);
    item.innerHTML = `
      <label class="message-field">
        <span>Phrase</span>
        <input data-lively-field="text" type="text" maxlength="140" value="${escapeAttribute(message.text || '')}">
      </label>
      <label class="message-field">
        <span>Ordre</span>
        <input data-lively-field="sortOrder" type="number" step="1" value="${message.sortOrder ?? (index + 1) * 10}">
      </label>
      <label class="drink-active-field">
        <input data-lively-field="active" type="checkbox" ${message.active === false ? '' : 'checked'}>
        <span>Actif</span>
      </label>
      <button class="control-button danger lively-delete-button" type="button">Supprimer</button>
    `;
    return item;
  }));
}

function readLivelyEditor() {
  editableLivelyMessages = Array.from(document.querySelectorAll('.lively-editor-row')).map((row) => {
    const index = Number(row.dataset.index);
    const currentMessage = editableLivelyMessages[index] ?? {};
    const textInput = row.querySelector('[data-lively-field="text"]');
    const activeInput = row.querySelector('[data-lively-field="active"]');
    const sortOrderInput = row.querySelector('[data-lively-field="sortOrder"]');

    return {
      ...currentMessage,
      text: textInput.value.trim(),
      active: Boolean(activeInput.checked),
      sortOrder: Number(sortOrderInput.value),
    };
  });
}

async function saveEditableLivelyMessages() {
  readLivelyEditor();
  setLivelyStatus('Sauvegarde en cours...');

  for (const message of editableLivelyMessages) {
    if (!message.text) {
      setLivelyStatus('Chaque phrase doit avoir un texte.', 'error');
      return;
    }

    const method = message.id ? 'PUT' : 'POST';
    const path = message.id ? `/api/lively-messages/${encodeURIComponent(message.id)}` : '/api/lively-messages';
    let response;

    try {
      response = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
    } catch {
      setLivelyStatus('Sauvegarde messages vivants impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setLivelyStatus(`Sauvegarde messages vivants refusee : ${response.status}`, 'error');
      return;
    }
  }

  await loadEditableLivelyMessages();
  setLivelyStatus('Messages vivants sauvegardes.', 'success');
}

function addEditableLivelyMessage() {
  readLivelyEditor();
  editableLivelyMessages = [
    ...editableLivelyMessages,
    {
      id: '',
      text: 'Nouvelle phrase vivante',
      active: true,
      sortOrder: (editableLivelyMessages.length + 1) * 10,
    },
  ];
  renderLivelyEditor();
}

async function deleteEditableLivelyMessage(index) {
  readLivelyEditor();
  const message = editableLivelyMessages[index];

  if (!message) {
    return;
  }

  if (message.id) {
    let response;

    try {
      response = await fetch(`/api/lively-messages/${encodeURIComponent(message.id)}`, { method: 'DELETE' });
    } catch {
      setLivelyStatus('Suppression message vivant impossible : connexion serveur perdue', 'error');
      return;
    }

    if (!response.ok) {
      setLivelyStatus(`Suppression message vivant refusee : ${response.status}`, 'error');
      return;
    }
  }

  editableLivelyMessages = editableLivelyMessages.filter((_, candidateIndex) => candidateIndex !== index);
  renderLivelyEditor();
  setLivelyStatus('Message vivant supprime.', 'success');
}

async function savePreMatchConfig() {
  preMatchFormDirty = false;

  let response;

  try {
    response = await fetch('/api/pre-match/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kickoffAt: toOffsetDateTime(preMatchKickoffInput.value),
      }),
    });
  } catch {
    setPreMatchStatus('Configuration impossible : connexion serveur perdue', 'error');
    return;
  }
  const payload = await readResponseJson(response);

  if (!response.ok) {
    setPreMatchStatus(`Configuration refusée : ${response.status}`, 'error');
    return;
  }

  renderState(payload);
  setPreMatchStatus('Configuration avant-match sauvegardée', 'success');
}

async function loadInitialState() {
  let response;

  try {
    response = await fetch('/api/state');
  } catch {
    markStateConnectionProblem();
    setPreMatchStatus('Connexion serveur perdue', 'error');
    setDrinksStatus('Connexion serveur perdue', 'error');
    setProgramStatus('Connexion serveur perdue', 'error');
    setEventBannerStatus('Connexion serveur perdue', 'error');
    setLivelyStatus('Connexion serveur perdue', 'error');
    throw new Error('Connexion serveur perdue');
  }

  if (!response.ok) {
    markStateConnectionProblem();
    setPreMatchStatus(`Chargement etat impossible : ${response.status}`, 'error');
    setDrinksStatus(`Chargement etat impossible : ${response.status}`, 'error');
    setProgramStatus(`Chargement etat impossible : ${response.status}`, 'error');
    setEventBannerStatus(`Chargement etat impossible : ${response.status}`, 'error');
    setLivelyStatus(`Chargement etat impossible : ${response.status}`, 'error');
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
    } else {
      markStateConnectionProblem();
      setPreMatchStatus(`Chargement etat impossible : ${response.status}`, 'error');
    }
  } catch {
    markStateConnectionProblem();
    setPreMatchStatus('Connexion serveur perdue', 'error');
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
      markStateConnectionProblem();
    }
  });

  socket.addEventListener('close', () => {
    markStateConnectionProblem();
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

scoreHomePlusButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-plus');
});

scoreHomeMinusButton.addEventListener('click', () => {
  void postAction('/api/simulation/home-minus');
});

scoreAwayPlusButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-plus');
});

scoreAwayMinusButton.addEventListener('click', () => {
  void postAction('/api/simulation/away-minus');
});

resetScoreButton.addEventListener('click', () => {
  if (!window.confirm('Confirmer la remise à zéro du score ?')) {
    return;
  }

  void postAction('/api/simulation/reset-score');
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

for (const button of preMatchActivateButtons) {
  button.addEventListener('click', () => {
    void postAction('/api/pre-match/activate');
  });
}

preMatchDeactivateButton.addEventListener('click', () => {
  void postAction('/api/pre-match/deactivate');
});

preMatchSaveButton.addEventListener('click', () => {
  void savePreMatchConfig();
});

[
  preMatchKickoffInput,
  ...preMatchProgramInputs,
].forEach((input) => {
  input.addEventListener('input', () => {
    preMatchFormDirty = true;
  });
});

showFullscreenButton.addEventListener('click', () => {
  void sendFullscreenMessage();
});

clearMessagesButton.addEventListener('click', () => {
  void postAction('/api/display/clear-message');
});

addDrinkButton.addEventListener('click', addEditableDrink);

saveDrinksButton.addEventListener('click', () => {
  void saveEditableDrinks();
});

addProgramButton.addEventListener('click', addEditableProgramItem);

saveProgramButton.addEventListener('click', () => {
  void saveEditableProgram();
});

addEventBannerButton.addEventListener('click', addEditableEventBanner);

saveEventBannersButton.addEventListener('click', () => {
  void saveEditableEventBanners();
});

showRandomBannerButton.addEventListener('click', () => {
  void showRandomEventBanner();
});

addLivelyMessageButton.addEventListener('click', addEditableLivelyMessage);

saveLivelyMessagesButton.addEventListener('click', () => {
  void saveEditableLivelyMessages();
});

drinkEditor.addEventListener('click', (event) => {
  const button = event.target.closest('.drink-delete-button');

  if (!button) {
    return;
  }

  const row = button.closest('.drink-editor-row');
  void deleteEditableDrink(Number(row?.dataset.index ?? -1));
});

programEditor.addEventListener('click', (event) => {
  const button = event.target.closest('.program-delete-button');

  if (!button) {
    return;
  }

  const row = button.closest('.program-editor-row');
  void deleteEditableProgramItem(Number(row?.dataset.index ?? -1));
});

eventBannerEditor.addEventListener('click', (event) => {
  const button = event.target.closest('.event-banner-delete-button');

  if (!button) {
    return;
  }

  const row = button.closest('.event-banner-editor-row');
  void deleteEditableEventBanner(Number(row?.dataset.index ?? -1));
});

livelyEditor.addEventListener('click', (event) => {
  const button = event.target.closest('.lively-delete-button');

  if (!button) {
    return;
  }

  const row = button.closest('.lively-editor-row');
  void deleteEditableLivelyMessage(Number(row?.dataset.index ?? -1));
});

for (const item of navItems) {
  item.addEventListener('click', () => {
    showSection(item.dataset.sectionTarget);
  });
}

audioToggleButton.addEventListener('click', () => {
  void enableAudioAlerts();
});

document.addEventListener('click', () => {
  if (audioAlertsEnabled) {
    void unlockAudioContext();
  }
}, { once: true });

renderAudioToggle();
setConnectionStatus('unstable');
showSection('overview');
void loadInitialState().catch(() => {});
void loadEditableDrinks();
void loadEditableProgram();
void loadEditableEventBanners();
void loadEditableLivelyMessages();
void loadServerInfo();
connectRealtime();
window.setInterval(() => {
  void pollState();
}, 1000);
window.setInterval(markStateConnectionProblem, 5000);

export {};
