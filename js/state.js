'use strict';

/**
 * STATE — Gestion des données & persistance localStorage
 * Les transactions sont sauvegardées entre les rafraîchissements de page.
 */

/* ── Utilitaires partagés (transactions → FCFA / caisse) ────── */

/** Extrait un montant numérique d'une chaîne du type "604 500 FCFA" */
function parseFCFA(str) {
    return Number(String(str).replace(/[^\d-]/g, '')) || 0;
}

/** Détermine si une transaction est une entrée de caisse (true) ou une sortie (false) */
function isVaultEntree(t) {
    const typeUpper = t.type.toUpperCase();
    /* Change VENTE / dépôts (hors RETRAIT) = entrée ; Change ACHAT / retraits = sortie */
    return t.typeCode === 'CHANGE' ? typeUpper.includes('VENTE') : !typeUpper.includes('RETRAIT');
}

/** Échappe les caractères HTML spéciaux avant insertion dans innerHTML (protection XSS) */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ══════════════════════════════════════════════════════════════
   State.transactions est un cache local synchronisé avec l'API
   (POST /api/transactions, GET /api/transactions). load() et
   addTransaction() sont asynchrones (appel réseau) ; filter() et
   search() restent synchrones et lisent le cache déjà en mémoire —
   aucun des nombreux appelants existants (renderDashTable, report.js,
   vault.js, kyc.js...) n'a donc besoin d'être converti en async.
══════════════════════════════════════════════════════════════ */

const State = {
    transactions: [],

    /** Charge les transactions depuis l'API (nécessite une session active) */
    async load() {
        try {
            this.transactions = await apiGet('/transactions');
        } catch (e) {
            console.warn('[GlobalEx] Échec du chargement des transactions :', e.message);
            this.transactions = [];
        }
    },

    /** Enregistre une transaction côté serveur et met à jour le cache local */
    async addTransaction(tx) {
        try {
            const saved = await apiPost('/transactions', tx);
            this.transactions.unshift(saved);
            return true;
        } catch (e) {
            console.warn('[GlobalEx] Échec d\'enregistrement de la transaction :', e.message);
            return false;
        }
    },

    /** Filtre par typeCode ('ALL' = tout) — opère sur le cache local */
    filter(typeCode) {
        if (typeCode === 'ALL') return this.transactions;
        return this.transactions.filter(t => t.typeCode === typeCode);
    },

    /** Recherche full-text (client, id, type) — opère sur le cache local */
    search(query) {
        const q = query.trim().toLowerCase();
        if (!q) return this.transactions;
        return this.transactions.filter(t =>
            t.client.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            t.type.toLowerCase().includes(q)
        );
    },
};


/* ══════════════════════════════════════════════════════════════
   KYC — Base clients & Anti-Blanchiment
══════════════════════════════════════════════════════════════ */

/* Cache local synchronisé avec l'API (mêmes principes que State/transactions
   ci-dessus) : load()/addClient()/updateClient() sont asynchrones (réseau) ;
   getClient()/searchClients() restent synchrones et lisent le cache. */

const KycState = {
    clients: [],

    /** Charge les clients KYC depuis l'API */
    async load() {
        try {
            this.clients = await apiGet('/kyc-clients');
        } catch (e) {
            console.warn('[GlobalEx] Échec du chargement des clients KYC :', e.message);
            this.clients = [];
        }
    },

    /** Crée une fiche client côté serveur et met à jour le cache local */
    async addClient(client) {
        try {
            const saved = await apiPost('/kyc-clients', client);
            this.clients.unshift(saved);
            return true;
        } catch (e) {
            console.warn('[GlobalEx] Échec de création de la fiche client :', e.message);
            return false;
        }
    },

    /** Met à jour une fiche existante côté serveur et dans le cache local */
    async updateClient(id, data) {
        try {
            const saved = await apiPut(`/kyc-clients/${id}`, data);
            const index = this.clients.findIndex(c => c.id === id);
            if (index !== -1) this.clients[index] = saved;
            return true;
        } catch (e) {
            console.warn('[GlobalEx] Échec de mise à jour de la fiche client :', e.message);
            return false;
        }
    },

    /** Récupère un client par son ID — lit le cache local */
    getClient(id) {
        return this.clients.find(c => c.id === id);
    },

    /** Recherche full-text (nom, numéro pièce, téléphone) — lit le cache local */
    searchClients(query) {
        const q = query.trim().toLowerCase();
        if (!q) return this.clients;
        return this.clients.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.idNumber.toLowerCase().includes(q) ||
            c.phone.toLowerCase().includes(q)
        );
    },
};


/* ══════════════════════════════════════════════════════════════
   VAULT — Caisse & Trésorerie (mouvements manuels)
══════════════════════════════════════════════════════════════ */

/* Cache local synchronisé avec l'API (mêmes principes que State/KycState
   ci-dessus). Le serveur attribue lui-même l'heure et la référence
   (MVT-XXXXXX) du mouvement — voir routes/vault.js. */

const VaultState = {
    movements: [],

    /** Charge le journal des mouvements manuels depuis l'API */
    async load() {
        try {
            this.movements = await apiGet('/vault/movements');
        } catch (e) {
            console.warn('[GlobalEx] Échec du chargement des mouvements de caisse :', e.message);
            this.movements = [];
        }
    },

    /** Enregistre un mouvement (alimentation/retrait) côté serveur et met à jour le cache */
    async addMovement(movement) {
        try {
            const saved = await apiPost('/vault/movements', movement);
            this.movements.unshift(saved);
            return true;
        } catch (e) {
            console.warn('[GlobalEx] Échec d\'enregistrement du mouvement de caisse :', e.message);
            return false;
        }
    },
};


/* ══════════════════════════════════════════════════════════════
   RATES — Taux de change du jour (fixés manuellement chaque matin)
══════════════════════════════════════════════════════════════ */

/* CONFIG.rates est entièrement remplacé par la réponse de l'API à chaque
   opération (chargement, mise à jour, ajout, suppression de devise) : le
   serveur est désormais l'unique source de vérité, y compris pour la
   validation et le calcul de tendance (voir backend/routes/rates.js) —
   ces méthodes lèvent donc une erreur explicite plutôt que de la ravaler,
   pour que l'appelant puisse afficher le message précis du serveur. */

const RatesState = {
    lastUpdated: null,

    /** Charge les taux du jour depuis l'API */
    async load() {
        try {
            const rates = await apiGet('/rates');
            CONFIG.rates = rates;
            const timestamps = Object.values(rates).map(r => r.updatedAt).filter(Boolean).sort();
            this.lastUpdated = timestamps.length ? timestamps.at(-1) : null;
        } catch (e) {
            console.warn('[GlobalEx] Échec du chargement des taux :', e.message);
        }
    },

    /** Met à jour les taux flottants du jour côté serveur (peut lever une erreur) */
    async updateRates(updates) {
        CONFIG.rates = await apiPut('/rates', updates);
        this.lastUpdated = new Date().toISOString();
    },

    /** Ajoute une nouvelle devise côté serveur (peut lever une erreur) */
    async addCurrency(data) {
        CONFIG.rates = await apiPost('/rates', data);
    },

    /** Supprime une devise côté serveur (peut lever une erreur) */
    async deleteCurrency(code) {
        CONFIG.rates = await apiDelete(`/rates/${code}`);
    },
};


/* ══════════════════════════════════════════════════════════════
   APP CONFIG — Seuils de caisse et frais (partagés entre guichets)
══════════════════════════════════════════════════════════════ */

const AppConfigState = {
    /** Charge les réglages depuis l'API et les applique dans CONFIG */
    async load() {
        try {
            const cfg = await apiGet('/config');
            if (cfg.vaultMinThreshold   != null) CONFIG.vault.minThreshold   = cfg.vaultMinThreshold;
            if (cfg.vaultOpeningBalance != null) CONFIG.vault.openingBalance = cfg.vaultOpeningBalance;
            if (cfg.exchangeFee         != null) CONFIG.exchangeFee         = cfg.exchangeFee;
            if (cfg.transferFeeRate     != null) CONFIG.transferFeeRate     = cfg.transferFeeRate;
        } catch (e) {
            /* En cas d'échec, on conserve les valeurs par défaut de config.js */
            console.warn('[GlobalEx] Échec du chargement de la configuration :', e.message);
        }
    },
};
