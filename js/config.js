'use strict';

/**
 * CONFIG — Constantes globales de l'application
 * Modifier ici pour changer les taux, frais, opérateurs, etc.
 */
const CONFIG = {

    /* ── Taux de change ─────────────────────────────────────────
       Liste ouverte : de nouvelles devises peuvent être ajoutées
       (ou supprimées) directement depuis l'interface "Fixer les
       Taux du Jour", sans toucher au code. `fixed: true` réserve
       le statut de devise à parité fixe (BCEAO) — non supprimable,
       non modifiable au jour le jour.
    ── ─────────────────────────────────────────────────────────── */
    rates: {
        EUR: { name: 'Euro',             symbol: '€',  buy: 650.00, sell: 657.50, official: 655.957, trend: 'fixed', trendLabel: 'Fixe',   fixed: true  },
        USD: { name: 'Dollar Américain', symbol: '$',  buy: 604.50, sell: 614.00, official: 604.50,  trend: '+0.4%', trendLabel: '+0.4%',  fixed: false },
        GBP: { name: 'Livre Sterling',   symbol: '£',  buy: 775.00, sell: 790.00, official: 782.10,  trend: '-0.1%', trendLabel: '-0.1%',  fixed: false },
        CAD: { name: 'Dollar Canadien',  symbol: '$',  buy: 440.00, sell: 452.00, official: 445.20,  trend: '+0.2%', trendLabel: '+0.2%',  fixed: false },
        MAD: { name: 'Dirham Marocain',  symbol: 'DH', buy: 60.30,  sell: 61.90,  official: 61.00,   trend: 'fixed', trendLabel: 'Fixe',   fixed: false },
    },

    /* ── Soldes flottants (UV) par opérateur ────────────────── */
    providerFloats: {
        OM:   '1 850 000 FCFA',
        WU:   '9 450,00 USD',
        WAVE: '2 100 000 FCFA',
        MOOV: '950 000 FCFA',
        MG:   '4 100,00 USD',
    },

    /* ── Frais fixes (timbre / bordereau) ───────────────────── */
    exchangeFee: 500,           // FCFA
    transferFeeRate: 0.01,      // 1 %

    /* ── Caisse & Trésorerie ─────────────────────────────────── */
    vault: {
        minThreshold: 500000,   // FCFA
        openingBalance: 2000000, // FCFA
    },

    /* ── Guichetier actif (rempli après connexion par l'API) ── */
    cashier: {
        name:    'Aïcha Ouédraogo',
        counter: '#02',
        agency:  'Agence Centrale, Avenue Kwame N\'Krumah, Ouagadougou',
        phone:   '+226 25 30 12 34',
    },

};
