// @ts-nocheck

const emptyState = {
  happyHourActive: false,
  remainingSeconds: 0,
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

const discountRate = 0.2;
const drinks = [
  { name: 'Pinte blonde', price: 7 },
  { name: 'Pinte IPA', price: 8 },
  { name: 'Verre de vin', price: 5 },
  { name: 'Cocktail maison', price: 9 },
  { name: 'Soft', price: 3.5 },
];
const confettiColors = ['#af593f', '#5e8f63', '#e0b24b', '#5c3a21', '#6d5b4b'];
const burstDurationMs = 4200;
const waitingMessageMinDelayMs = 20000;
const waitingMessageMaxDelayMs = 30000;
const waitingMessageTransitionMs = 420;
const waitingMessages = [
  'En attente du prochain declenchement',
  'Un but fran\u00e7ais peut lancer la f\u00eate \u00e0 tout moment',
  "Restez pr\u00eats, la happy hour peut tomber d'un instant \u00e0 l'autre",
  'Prochain but des Bleus : -20 % sur les boissons s\u00e9lectionn\u00e9es',
  'Le match continue, la Cocotte surveille le score',
  'Si la France marque, le chrono d\u00e9marre',
];
let previousHappyHourActive = false;
let hasRenderedState = false;
let burstTimeout = 0;
let waitingMessageTimeout = 0;
let waitingMessageTransitionTimeout = 0;
let waitingMessageIndex = 0;

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
const activeMessage = element('#active-message');
const inactiveMessage = element('#inactive-message');
const waitingMessage = element('#waiting-message');
const drinkList = element('#drink-list');
const drinksNote = element('#drinks-note');
const confettiLayer = element('#confetti-layer');
const goalBurst = element('#goal-burst');
const burstConfetti = element('#burst-confetti');

function formatSeconds(totalSeconds = 0) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatPrice(price = 0) {
  return `${price.toFixed(2)} \u20ac`;
}

function createDrinkCard(drink) {
  const item = document.createElement('article');
  const name = document.createElement('h3');
  const prices = document.createElement('div');
  const normalPrice = document.createElement('span');
  const arrow = document.createElement('span');
  const discountedPrice = document.createElement('strong');
  const reducedPrice = drink.price * (1 - discountRate);

  item.className = 'drink-item';
  name.textContent = drink.name;
  prices.className = 'drink-prices';
  normalPrice.className = 'normal-price';
  normalPrice.textContent = formatPrice(drink.price);
  arrow.className = 'price-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  discountedPrice.className = 'discount-price';
  discountedPrice.textContent = formatPrice(reducedPrice);

  prices.append(normalPrice, arrow, discountedPrice);
  item.append(name, prices);

  return item;
}

function renderDrinks() {
  drinkList.replaceChildren(...drinks.map(createDrinkCard));
}

function renderConfetti() {
  const fragments = [];

  for (let index = 0; index < 18; index += 1) {
    const piece = document.createElement('span');
    const color = confettiColors[index % confettiColors.length];

    piece.className = 'confetti';
    piece.style.setProperty('--x', `${Math.round(Math.random() * 96)}vw`);
    piece.style.setProperty('--delay', `${(Math.random() * 3).toFixed(2)}s`);
    piece.style.setProperty('--duration', `${(5.4 + Math.random() * 3).toFixed(2)}s`);
    piece.style.setProperty('--spin', `${Math.round(240 + Math.random() * 480)}deg`);
    piece.style.setProperty('--confetti-color', color);
    fragments.push(piece);
  }

  confettiLayer.replaceChildren(...fragments);
}

function renderBurstConfetti() {
  const fragments = [];

  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement('span');
    const color = confettiColors[index % confettiColors.length];
    const side = index % 2 === 0 ? -1 : 1;

    piece.className = 'burst-piece';
    piece.style.setProperty('--burst-x', `${side * (18 + Math.round(Math.random() * 26))}vw`);
    piece.style.setProperty('--burst-y', `${-24 + Math.round(Math.random() * 66)}vh`);
    piece.style.setProperty('--burst-delay', `${(Math.random() * 0.55).toFixed(2)}s`);
    piece.style.setProperty('--burst-spin', `${Math.round(180 + Math.random() * 540)}deg`);
    piece.style.setProperty('--confetti-color', color);
    fragments.push(piece);
  }

  burstConfetti.replaceChildren(...fragments);
}

function playGoalBurst() {
  window.clearTimeout(burstTimeout);
  renderBurstConfetti();
  goalBurst.hidden = false;
  goalBurst.classList.remove('playing');
  void goalBurst.offsetWidth;
  goalBurst.classList.add('playing');

  burstTimeout = window.setTimeout(() => {
    goalBurst.classList.remove('playing');
    goalBurst.hidden = true;
  }, burstDurationMs);
}

function showNextWaitingMessage() {
  waitingMessageIndex = (waitingMessageIndex + 1) % waitingMessages.length;
  waitingMessage.classList.add('is-changing');

  window.clearTimeout(waitingMessageTransitionTimeout);
  waitingMessageTransitionTimeout = window.setTimeout(() => {
    waitingMessage.textContent = waitingMessages[waitingMessageIndex];
    waitingMessage.classList.remove('is-changing');
    waitingMessageTransitionTimeout = 0;
    scheduleNextWaitingMessage();
  }, waitingMessageTransitionMs);
}

function getNextWaitingMessageDelay() {
  return waitingMessageMinDelayMs
    + Math.round(Math.random() * (waitingMessageMaxDelayMs - waitingMessageMinDelayMs));
}

function scheduleNextWaitingMessage() {
  window.clearTimeout(waitingMessageTimeout);
  waitingMessageTimeout = window.setTimeout(showNextWaitingMessage, getNextWaitingMessageDelay());
}

function startWaitingMessages() {
  if (!waitingMessageTimeout && !waitingMessageTransitionTimeout) {
    scheduleNextWaitingMessage();
  }
}

function stopWaitingMessages() {
  window.clearTimeout(waitingMessageTimeout);
  window.clearTimeout(waitingMessageTransitionTimeout);
  waitingMessageTimeout = 0;
  waitingMessageTransitionTimeout = 0;
  waitingMessage.classList.remove('is-changing');
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
  const shouldPlayBurst = hasRenderedState
    && !previousHappyHourActive
    && state.happyHourActive;

  homeTeam.textContent = getTeamShortName(state.homeTeam);
  awayTeam.textContent = getTeamShortName(state.awayTeam);
  homeScore.textContent = String(state.homeScore);
  awayScore.textContent = String(state.awayScore);
  matchFullName.textContent = `${homeName} vs ${awayName}`;
  timer.textContent = formatSeconds(state.remainingSeconds);

  document.body.classList.toggle('happy-hour-active', state.happyHourActive);
  activeMessage.toggleAttribute('hidden', !state.happyHourActive);
  inactiveMessage.toggleAttribute('hidden', state.happyHourActive);
  drinksNote.textContent = state.happyHourActive
    ? '-20 % appliqu\u00e9s pendant le chrono'
    : 'Prix habituels';

  if (state.happyHourActive) {
    stopWaitingMessages();
  } else {
    startWaitingMessages();
  }

  if (shouldPlayBurst) {
    playGoalBurst();
  }

  previousHappyHourActive = state.happyHourActive;
  hasRenderedState = true;
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

void loadInitialState();
connectRealtime();
renderDrinks();
renderConfetti();
renderBurstConfetti();

export {};
