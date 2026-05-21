// @ts-nocheck
const setupForm = document.querySelector('#setup-form');
const opponentGrid = document.querySelector('#opponent-grid');
const customAwayTeam = document.querySelector('#custom-away-team');
const setupError = document.querySelector('#setup-error');
const apiLiveNote = document.querySelector('#api-live-note');
const apiMatchesSection = document.querySelector('#api-matches-section');
const apiMatchesStatus = document.querySelector('#api-matches-status');
const apiMatchList = document.querySelector('#api-match-list');
const apiRefreshButton = document.querySelector('#api-refresh-button');
let apiMatchesLoaded = false;
function setError(message = '') {
    if (setupError) {
        setupError.textContent = message;
    }
}
function setApiStatus(message = '') {
    if (apiMatchesStatus) {
        apiMatchesStatus.textContent = message;
    }
}
function currentMode() {
    return document.querySelector('input[name="mode"]:checked')?.value ?? 'simulation';
}
function updateModeMessage() {
    const apiLiveSelected = currentMode() === 'api-live';
    apiLiveNote?.toggleAttribute('hidden', !apiLiveSelected);
    apiMatchesSection?.toggleAttribute('hidden', !apiLiveSelected);
    if (apiLiveSelected && !apiMatchesLoaded) {
        void loadApiFranceMatches();
    }
}
function renderOpponents(payload = { quickOpponents: [], selectedMatchId: 'france-unknown', matchMode: 'simulation', customAwayTeam: '' }) {
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
        note.textContent = 'Mode simulation disponible en secours';
        label.append(input, title, note);
        input.checked = opponent.id === payload.selectedMatchId || (payload.customAwayTeam && opponent.id === 'france-unknown');
        opponentGrid.append(label);
    }
    const modeInput = document.querySelector(`input[name="mode"][value="${payload.matchMode}"]`);
    if (modeInput) {
        modeInput.checked = true;
    }
    if (customAwayTeam) {
        customAwayTeam.value = payload.customAwayTeam ?? '';
    }
    updateModeMessage();
}
async function loadSetup() {
    const response = await fetch('/api/matches');
    if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
    }
    renderOpponents(await response.json());
}
function formatKickoff(kickoffAt = '') {
    if (!kickoffAt) {
        return '';
    }
    const date = new Date(kickoffAt);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    return new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeStyle: 'short',
    }).format(date);
}
function renderApiMatch(match) {
    const card = document.createElement('article');
    const score = document.createElement('strong');
    const fullName = document.createElement('span');
    const meta = document.createElement('small');
    const button = document.createElement('button');
    const kickoff = formatKickoff(match.kickoffAt);
    card.className = 'api-match-card';
    score.textContent = `${match.homeTeam?.shortName ?? 'ADV'} vs ${match.awayTeam?.shortName ?? 'ADV'}`;
    fullName.textContent = `${match.homeTeam?.name ?? 'Unknown'} vs ${match.awayTeam?.name ?? 'Unknown'}`;
    meta.textContent = [match.status, kickoff].filter(Boolean).join(' - ');
    button.type = 'button';
    button.textContent = 'Suivre ce match';
    button.addEventListener('click', () => {
        void selectApiMatch(match.id);
    });
    card.append(score, fullName, meta, button);
    return card;
}
function renderApiMatches(payload = { configured: false, matches: [] }) {
    if (!apiMatchList) {
        return;
    }
    apiMatchList.innerHTML = '';
    if (!payload.configured) {
        setApiStatus('API non configurée');
        return;
    }
    if (payload.error) {
        setApiStatus(payload.error);
        return;
    }
    if (!Array.isArray(payload.matches) || payload.matches.length === 0) {
        setApiStatus('Aucun match France trouvé');
        return;
    }
    setApiStatus(`${payload.matches.length} match(s) trouve(s)`);
    for (const match of payload.matches) {
        apiMatchList.append(renderApiMatch(match));
    }
}
async function loadApiFranceMatches() {
    apiMatchesLoaded = true;
    setApiStatus('Chargement...');
    if (apiMatchList) {
        apiMatchList.innerHTML = '';
    }
    try {
        const response = await fetch('/api/matches/france');
        if (!response.ok) {
            throw new Error(`Request failed: ${response.status}`);
        }
        renderApiMatches(await response.json());
    }
    catch {
        setApiStatus('Erreur API Football');
    }
}
async function selectApiMatch(matchId) {
    setError('');
    const response = await fetch('/api/match/select-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId }),
    });
    if (!response.ok) {
        setError('Selection de match API invalide.');
        return;
    }
    window.location.href = '/bar';
}
async function submitSetup(event) {
    event.preventDefault();
    setError('');
    if (currentMode() === 'api-live') {
        setError('Choisissez un match API avec le bouton Suivre ce match.');
        return;
    }
    const formData = new FormData(setupForm);
    const body = {
        mode: formData.get('mode'),
        matchId: formData.get('matchId'),
        customAwayTeam: String(formData.get('customAwayTeam') ?? '').trim(),
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
setupForm?.addEventListener('change', updateModeMessage);
apiRefreshButton?.addEventListener('click', () => {
    apiMatchesLoaded = false;
    void loadApiFranceMatches();
});
void loadSetup().catch(() => {
    setError('Impossible de charger la configuration.');
});
export {};
