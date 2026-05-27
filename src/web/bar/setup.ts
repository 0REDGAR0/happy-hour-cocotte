// @ts-nocheck

const setupForm = document.querySelector('#setup-form');
const opponentGrid = document.querySelector('#opponent-grid');
const customAwayTeam = document.querySelector('#custom-away-team');
const customAwayShortName = document.querySelector('#custom-away-short-name');
const setupError = document.querySelector('#setup-error');

function setError(message = '') {
  if (setupError) {
    setupError.textContent = message;
  }
}

function cleanShortName(value = '') {
  return value.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
}

function syncShortNameInput() {
  if (customAwayShortName) {
    customAwayShortName.value = cleanShortName(customAwayShortName.value);
  }
}

function renderOpponents(payload = { quickOpponents: [], selectedMatchId: 'france-unknown', customAwayTeam: '' }) {
  if (!opponentGrid) {
    return;
  }

  opponentGrid.innerHTML = '';

  for (const opponent of payload.quickOpponents) {
    const label = document.createElement('label');
    label.className = 'choice-card opponent-choice';
    const input = document.createElement('input');
    const title = document.createElement('span');
    const note = document.createElement('small');

    input.type = 'radio';
    input.name = 'matchId';
    input.value = opponent.id;
    title.textContent = `France vs ${opponent.name}`;
    note.textContent = opponent.shortName;

    label.append(input, title, note);

    input.checked = opponent.id === payload.selectedMatchId || (payload.customAwayTeam && opponent.id === 'france-unknown');
    opponentGrid.append(label);
  }

  if (customAwayTeam) {
    customAwayTeam.value = payload.customAwayTeam ?? '';
  }
}

async function loadSetup() {
  const response = await fetch('/api/matches');

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  renderOpponents(await response.json());
}

async function submitSetup(event) {
  event.preventDefault();
  setError('');
  syncShortNameInput();

  const formData = new FormData(setupForm);
  const body = {
    mode: 'simulation',
    matchId: formData.get('matchId'),
    customAwayTeam: String(formData.get('customAwayTeam') ?? '').trim(),
    customAwayShortName: cleanShortName(String(formData.get('customAwayShortName') ?? '')),
  };

  const response = await fetch('/api/match/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    setError('Selection de match invalide.');
    return;
  }

  window.location.href = '/bar';
}

setupForm?.addEventListener('submit', (event) => {
  void submitSetup(event);
});

customAwayShortName?.addEventListener('input', syncShortNameInput);

void loadSetup().catch(() => {
  setError('Impossible de charger la configuration.');
});

export {};
