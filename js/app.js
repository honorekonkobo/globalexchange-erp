'use strict';

/**
 * APP — Point d'entrée principal
 * Initialisation de l'application et gestionnaires d'événements globaux.
 */

/* ── Authentification caissier (réelle, côté serveur) ───────── */

const AGENCY_SLUG_STORAGE_KEY = 'globalex_agency_slug';

/** Peuple le menu déroulant des guichetiers pour l'agence donnée (route publique, pas de token requis) */
async function populateCashierSelect(agencySlug) {
    const select = document.getElementById('auth-cashier');

    if (!agencySlug) {
        select.innerHTML = '<option value="">Saisissez un code agence</option>';
        return;
    }

    select.innerHTML = '<option value="">Chargement...</option>';
    try {
        const { cashiers } = await apiGet(`/auth/cashiers?agencySlug=${encodeURIComponent(agencySlug)}`);
        if (!cashiers.length) {
            select.innerHTML = '<option value="">Aucun guichetier pour cette agence</option>';
            return;
        }
        select.innerHTML = cashiers
            .map(c => `<option value="${c.id}">${c.name} — Guichet ${c.counter}</option>`)
            .join('');
    } catch (e) {
        select.innerHTML = '<option value="">Code agence invalide</option>';
        showToast('Code agence invalide', 'error');
    }
}

/** Relance le chargement des guichetiers à chaque saisie/sortie du champ agence */
function setupAgencyField() {
    const agencyInput = document.getElementById('auth-agency');
    const stored = localStorage.getItem(AGENCY_SLUG_STORAGE_KEY);
    if (stored) {
        agencyInput.value = stored;
        populateCashierSelect(stored);
    }

    let debounceTimer;
    const triggerLookup = () => {
        clearTimeout(debounceTimer);
        populateCashierSelect(agencyInput.value.trim().toLowerCase());
    };

    agencyInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(triggerLookup, 500);
    });
    agencyInput.addEventListener('blur', triggerLookup);
    agencyInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') { triggerLookup(); document.getElementById('auth-cashier').focus(); }
    });
}

/** Connexion : PIN vérifié côté serveur (hachage + verrou anti-bruteforce en base) */
async function attemptLogin() {
    const agencyInput = document.getElementById('auth-agency');
    const pinInput   = document.getElementById('auth-pin');
    const loginBtn   = document.getElementById('auth-login-btn');
    const loginLabel = document.getElementById('auth-login-btn-label');
    const agencySlug = agencyInput.value.trim().toLowerCase();
    const cashierId  = Number(document.getElementById('auth-cashier').value);
    const pin        = pinInput.value.trim();

    if (!agencySlug || !cashierId || !pin) {
        showToast('Code agence, guichetier et code PIN requis.', 'error');
        return;
    }

    loginBtn.disabled = true;
    loginLabel.textContent = 'Connexion...';

    let result;
    try {
        result = await apiPost('/auth/login', { agencySlug, cashierId, pin });
    } catch (e) {
        showToast(e.message, 'error');
        pinInput.classList.remove('shake');
        void pinInput.offsetWidth; /* relance l'animation */
        pinInput.classList.add('shake');
        pinInput.value = '';
        loginBtn.disabled = false;
        loginLabel.textContent = 'Ouvrir session';
        return;
    }

    localStorage.setItem(AGENCY_SLUG_STORAGE_KEY, agencySlug);

    setAuthToken(result.token);
    CONFIG.cashier.name    = result.cashier.name;
    CONFIG.cashier.counter = result.cashier.counter;

    document.getElementById('sidebar-cashier-name').textContent    = result.cashier.name;
    document.getElementById('sidebar-cashier-counter').textContent = `Guichet ${result.cashier.counter} — ${result.agency.name}`;

    loginLabel.textContent = 'Chargement des données...';
    await loadAppData();

    document.getElementById('auth-overlay').classList.add('hidden');
    loginBtn.disabled = false;
    loginLabel.textContent = 'Ouvrir session';
    showToast(`Session ouverte — Bienvenue, ${result.cashier.name} !`, 'success');

    /* Rafraîchissement périodique des transactions (visibilité multi-guichets) */
    setInterval(refreshTransactionsFromServer, 20000);
}

/** Recharge les transactions depuis l'API et met à jour les vues déjà affichées
 *  (permet à un guichet de voir les opérations effectuées sur un autre poste) */
async function refreshTransactionsFromServer() {
    await State.load();
    renderDashTable(State.transactions);
    renderHistoryTable(State.transactions);
    updateTxCounter();
}

/* ── Actions globales ───────────────────────────────────────── */

function openQuickModal() {
    switchTab('transfers');
}

/* ── Détection CDN indisponible (Tailwind / Lucide) ─────────── */
function checkCdnAvailability() {
    const failed = [];
    if (!window.__cdnStatus?.tailwind || typeof tailwind === 'undefined') failed.push('Tailwind CSS');
    if (!window.__cdnStatus?.lucide || typeof lucide === 'undefined')     failed.push('Lucide Icons');

    if (typeof lucide === 'undefined') {
        /* Évite de faire planter le reste de l'app si les icônes sont indisponibles */
        window.lucide = { createIcons: () => {} };
    }

    if (failed.length) {
        const banner = document.createElement('div');
        banner.className = 'fixed top-0 inset-x-0 z-[80] bg-red-600 text-white text-xs font-semibold text-center py-2 px-4';
        banner.textContent = `Erreur de chargement CDN : ${failed.join(' et ')} indisponible(s). Certaines fonctionnalités visuelles peuvent être dégradées.`;
        document.body.prepend(banner);
    }
}

/* ── Raccourcis clavier ──────────────────────────────────────── */
function handleKeyboardShortcuts(e) {
    if (!e.altKey) return;
    if (!document.getElementById('auth-overlay').classList.contains('hidden')) return;

    const shortcuts = { d: 'dashboard', e: 'exchange', t: 'transfers' };
    const tabId = shortcuts[e.key.toLowerCase()];
    if (tabId) {
        e.preventDefault();
        switchTab(tabId);
    }
}

function filterDashTable(code, event) {
    /* Met à jour le style des boutons filtres */
    document.querySelectorAll('.dash-fltr-btn').forEach(btn => {
        btn.classList.remove('bg-cyan-500', 'text-white');
        btn.classList.add('bg-gray-800', 'text-gray-300');
    });
    event.currentTarget.classList.remove('bg-gray-800', 'text-gray-300');
    event.currentTarget.classList.add('bg-cyan-500', 'text-white');

    renderDashTable(State.filter(code));
}

function searchHistory() {
    const query = document.getElementById('hist-search').value;
    renderHistoryTable(State.search(query));
}

/* ── Chargement des données (appelé une fois la session ouverte) ──
   Les quatre modules métier (transactions, KYC, caisse, taux) ainsi que
   les réglages partagés (seuils, frais) viennent désormais tous de l'API
   — plus aucune donnée sur localStorage. AppConfigState en premier : la
   caisse et les calculs de change dépendent de ses valeurs. */
async function loadAppData() {
    await AppConfigState.load();
    await State.load();
    await KycState.load();
    await VaultState.load();
    await RatesState.load();

    renderDashTable(State.transactions);
    renderHistoryTable(State.transactions);
    renderKycTable(KycState.clients);
    refreshVault();
    updateTxCounter();
    populateCurrencySelects();
    renderRatesDisplays();

    calcExchange();
    calcTransferFees();
    runDashCalc();

    console.info('[GlobalEx] Application initialisée avec', State.transactions.length, 'transactions.');
}

/* ── Bootstrap ──────────────────────────────────────────────── */

window.addEventListener('DOMContentLoaded', async () => {
    const loadStart = performance.now();

    /* 0. Vérifier la disponibilité des CDN externes */
    checkCdnAvailability();

    /* 1. Icônes Lucide */
    lucide.createIcons();

    /* 2. Écran d'authentification caissier — les données métier ne se
       chargent qu'après connexion (l'API les exige toutes). */
    setupAgencyField();
    const pinInput = document.getElementById('auth-pin');
    pinInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') attemptLogin(); });
    if (localStorage.getItem(AGENCY_SLUG_STORAGE_KEY)) {
        pinInput.focus();
    } else {
        document.getElementById('auth-agency').focus();
    }

    /* 3. Horloge temps réel du header */
    tickHeaderClock();
    setInterval(tickHeaderClock, 1000);

    /* 4. Raccourcis clavier (Alt+D/E/T) */
    window.addEventListener('keydown', handleKeyboardShortcuts);

    /* 5. Masquer le spinner de chargement (visible au moins 50ms) */
    const elapsed = performance.now() - loadStart;
    setTimeout(() => document.getElementById('loading-overlay')?.remove(), Math.max(0, 50 - elapsed));
});
