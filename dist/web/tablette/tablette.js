// @ts-nocheck
const emptyState = {
    happyHourActive: false,
    remainingSeconds: 0,
    matchStatus: 'NOT_STARTED',
    matchTitle: 'France vs Adversaire',
    matchInfo: null,
    score: null,
    drinks: [],
    livelyMessages: null,
    menu: {
        drinks: [],
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
const matchStatusLabels = {
    NOT_STARTED: 'Avant match',
    FIRST_HALF: '1re mi-temps',
    HALF_TIME: 'Mi-temps',
    SECOND_HALF: '2e mi-temps',
    FINISHED: 'Fin du match',
};
const homeTeam = document.querySelector('#home-team');
const awayTeam = document.querySelector('#away-team');
const homeTeamName = document.querySelector('#home-team-name');
const awayTeamName = document.querySelector('#away-team-name');
const homeScore = document.querySelector('#home-score');
const awayScore = document.querySelector('#away-score');
const matchTitle = document.querySelector('#match-title');
const matchStatus = document.querySelector('#match-status');
const eventBanner = document.querySelector('#event-banner');
const fullscreenMessage = document.querySelector('#fullscreen-message');
const happyHourState = document.querySelector('#happy-hour-state');
const timer = document.querySelector('#timer');
const timerNote = document.querySelector('#timer-note');
const discountNote = document.querySelector('#discount-note');
const drinkList = document.querySelector('#drink-list');
const connectionStatus = document.querySelector('#connection-status');
const connectionLabel = document.querySelector('#connection-label');
const livelyMessage = document.querySelector('#lively-message');
const requiredElements = [
    homeTeam,
    awayTeam,
    homeTeamName,
    awayTeamName,
    homeScore,
    awayScore,
    matchTitle,
    matchStatus,
    eventBanner,
    fullscreenMessage,
    happyHourState,
    timer,
    timerNote,
    discountNote,
    drinkList,
    connectionStatus,
    connectionLabel,
    livelyMessage,
];
let statePollInFlight = false;
let lastSuccessfulStateAt = 0;
let currentLivelyMessages = null;
let livelyMessageIndex = 0;
if (requiredElements.some((item) => !item)) {
    throw new Error('Missing tablette DOM element');
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
    const score = state.score || {};
    const home = info.homeTeam || state.homeTeam || emptyState.homeTeam;
    const away = info.awayTeam || state.awayTeam || emptyState.awayTeam;
    return {
        home,
        away,
        homeName: getTeamName(home, 'France'),
        awayName: getTeamName(away, 'Adversaire'),
        homeShortName: getTeamShortName(home, 'FRA'),
        awayShortName: getTeamShortName(away, 'ADV'),
        homeScore: Number.isFinite(info.homeScore)
            ? info.homeScore
            : Number.isFinite(state.homeScore)
                ? state.homeScore
                : score.homeScore ?? score.home ?? 0,
        awayScore: Number.isFinite(info.awayScore)
            ? info.awayScore
            : Number.isFinite(state.awayScore)
                ? state.awayScore
                : score.awayScore ?? score.away ?? 0,
        title: info.matchTitle || state.matchTitle || `${getTeamName(home, 'France')} vs ${getTeamName(away, 'Adversaire')}`,
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
function getLivelyMessages(state = emptyState) {
    if (!Object.hasOwn(state, 'livelyMessages')) {
        return null;
    }
    return Array.isArray(state.livelyMessages) ? state.livelyMessages : null;
}
function setConnectionStatus(kind = 'unstable') {
    const labels = {
        connected: 'Serveur connecté',
        unstable: 'Connexion instable',
        lost: 'Connexion perdue',
    };
    connectionLabel.textContent = labels[kind] || labels.unstable;
    connectionStatus.dataset.connection = kind;
}
function markStateConnectionOk() {
    lastSuccessfulStateAt = Date.now();
    setConnectionStatus('connected');
}
function markStateConnectionProblem() {
    setConnectionStatus(lastSuccessfulStateAt && Date.now() - lastSuccessfulStateAt < 10000 ? 'unstable' : 'lost');
}
function renderDrinkLoadError() {
    const item = document.createElement('article');
    item.className = 'drink-item error-item';
    item.textContent = 'Erreur de chargement de la carte des boissons';
    drinkList.replaceChildren(item);
}
function createDrinkItem(drink, happyHourActive = false) {
    const item = document.createElement('article');
    const name = document.createElement('strong');
    const prices = document.createElement('div');
    const price = document.createElement('span');
    const happyHourPrice = document.createElement('em');
    item.className = 'drink-item';
    name.textContent = `${drink.icon ? `${drink.icon} ` : ''}${drink.name || 'Boisson'}`;
    price.textContent = formatPrice(drink.originalPrice ?? drink.price, drink.currency);
    happyHourPrice.textContent = formatPrice(drink.happyHourPrice ?? drink.originalPrice ?? drink.price, drink.currency);
    happyHourPrice.hidden = !happyHourActive;
    price.classList.toggle('is-reduced', happyHourActive);
    prices.append(price, happyHourPrice);
    item.append(name, prices);
    return item;
}
function renderLivelyMessage() {
    if (currentLivelyMessages === null) {
        livelyMessage.textContent = 'Messages vivants non chargés';
        livelyMessage.dataset.kind = 'error';
        return;
    }
    if (!currentLivelyMessages.length) {
        livelyMessage.textContent = 'Aucun message vivant actif';
        livelyMessage.dataset.kind = 'neutral';
        return;
    }
    const message = currentLivelyMessages[livelyMessageIndex % currentLivelyMessages.length];
    livelyMessage.textContent = message.text || 'Message vivant invalide';
    livelyMessage.dataset.kind = message.text ? 'success' : 'error';
}
function renderState(incomingState = emptyState) {
    markStateConnectionOk();
    const state = {
        ...emptyState,
        ...incomingState,
    };
    const match = getMatchInfo(state);
    const isHappyHourActive = Boolean(state.happyHourActive);
    const drinks = getDrinks(incomingState);
    const livelyMessages = getLivelyMessages(incomingState);
    homeTeam.textContent = match.homeShortName;
    awayTeam.textContent = match.awayShortName;
    homeTeamName.textContent = match.homeName;
    awayTeamName.textContent = match.awayName;
    homeScore.textContent = String(match.homeScore);
    awayScore.textContent = String(match.awayScore);
    matchTitle.textContent = match.title;
    matchStatus.textContent = matchStatusLabels[state.matchStatus] || state.matchStatus || 'Match';
    eventBanner.textContent = state.bannerMessage || '';
    eventBanner.hidden = !state.bannerMessage;
    fullscreenMessage.textContent = state.fullscreenMessage || '';
    fullscreenMessage.hidden = !state.fullscreenMessage;
    happyHourState.textContent = isHappyHourActive ? 'Active' : 'Inactive';
    timer.textContent = formatSeconds(state.remainingSeconds);
    timerNote.textContent = isHappyHourActive
        ? 'Offre Happy Hour en cours au bar.'
        : 'Le chrono s’affiche ici quand une offre est active.';
    discountNote.textContent = isHappyHourActive ? 'Prix Happy Hour' : 'Prix bar';
    document.body.classList.toggle('happy-hour-active', isHappyHourActive);
    currentLivelyMessages = livelyMessages === null ? null : livelyMessages.filter((message) => message && message.active !== false);
    if (Array.isArray(currentLivelyMessages) && currentLivelyMessages.length) {
        livelyMessageIndex %= currentLivelyMessages.length;
    }
    else {
        livelyMessageIndex = 0;
    }
    renderLivelyMessage();
    if (!drinks) {
        renderDrinkLoadError();
    }
    else if (!drinks.length) {
        const item = document.createElement('article');
        item.className = 'drink-item';
        item.textContent = 'Aucune boisson active configurée';
        drinkList.replaceChildren(item);
    }
    else {
        drinkList.replaceChildren(...drinks.map((drink) => createDrinkItem(drink, isHappyHourActive)));
    }
}
function renderConnectionLost() {
    markStateConnectionProblem();
    matchStatus.textContent = 'Connexion serveur perdue';
    renderDrinkLoadError();
}
async function readResponseJson(response) {
    const text = await response.text();
    if (!text) {
        return {};
    }
    try {
        return JSON.parse(text);
    }
    catch {
        return {};
    }
}
async function loadState() {
    let response;
    try {
        response = await fetch('/api/state', { cache: 'no-store' });
    }
    catch {
        markStateConnectionProblem();
        renderConnectionLost();
        return;
    }
    if (!response.ok) {
        markStateConnectionProblem();
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
        await loadState();
    }
    finally {
        statePollInFlight = false;
    }
}
function connectRealtime() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socket.addEventListener('message', (event) => {
        try {
            renderState(JSON.parse(event.data));
        }
        catch {
            markStateConnectionProblem();
        }
    });
    socket.addEventListener('close', () => {
        renderConnectionLost();
        window.setTimeout(connectRealtime, 1000);
    });
}
void loadState();
setConnectionStatus('unstable');
connectRealtime();
window.setInterval(() => {
    void pollState();
}, 1000);
window.setInterval(() => {
    if (Array.isArray(currentLivelyMessages) && currentLivelyMessages.length > 1) {
        livelyMessageIndex = (livelyMessageIndex + 1) % currentLivelyMessages.length;
        renderLivelyMessage();
    }
    markStateConnectionProblem();
}, 5000);
export {};
