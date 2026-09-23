-- ═══════════════════════════════════════════════════════════════
-- S.A.C ERP — Schéma initial
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cashiers (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    counter         TEXT NOT NULL UNIQUE,
    pin_hash        TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS kyc_clients (
    id          SERIAL PRIMARY KEY,
    ref         TEXT NOT NULL UNIQUE,          -- référence lisible affichée au guichet (ex : KYC-0001)
    name        TEXT NOT NULL,
    id_type     TEXT NOT NULL,
    id_number   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    nationality TEXT,
    birth_date  DATE,
    photo       TEXT,                          -- image encodée en base64 (comme côté frontend)
    verified    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
    id          SERIAL PRIMARY KEY,
    ref         TEXT NOT NULL UNIQUE,          -- référence lisible (ex : GX-10928)
    time        TEXT NOT NULL,                 -- heure affichée HH:MM (conservé tel quel pour le frontend)
    type        TEXT NOT NULL,
    type_code   TEXT NOT NULL,
    client      TEXT NOT NULL,
    client_id   INTEGER REFERENCES kyc_clients(id) ON DELETE SET NULL,
    amount      TEXT NOT NULL,                 -- déjà formaté (ex : "604 000 FCFA"), comme aujourd'hui
    fee         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Terminé',
    cashier_id  INTEGER REFERENCES cashiers(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vault_movements (
    id          SERIAL PRIMARY KEY,
    reference   TEXT NOT NULL UNIQUE,
    time        TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount      NUMERIC NOT NULL,
    reason      TEXT NOT NULL,
    cashier_id  INTEGER REFERENCES cashiers(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS currency_rates (
    code        TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    buy         NUMERIC NOT NULL,
    sell        NUMERIC NOT NULL,
    official    NUMERIC NOT NULL,
    trend       TEXT NOT NULL DEFAULT 'fixed',
    trend_label TEXT NOT NULL DEFAULT 'Fixe',
    fixed       BOOLEAN NOT NULL DEFAULT false,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- ── Seed : taux du jour (mêmes valeurs que CONFIG.rates côté frontend) ──
INSERT INTO currency_rates (code, name, symbol, buy, sell, official, trend, trend_label, fixed) VALUES
    ('EUR', 'Euro',             '€',  650.00, 657.50, 655.957, 'fixed', 'Fixe',  true),
    ('USD', 'Dollar Américain', '$',  604.50, 614.00, 604.50,  '+0.4%', '+0.4%', false),
    ('GBP', 'Livre Sterling',   '£',  775.00, 790.00, 782.10,  '-0.1%', '-0.1%', false),
    ('CAD', 'Dollar Canadien',  '$',  440.00, 452.00, 445.20,  '+0.2%', '+0.2%', false),
    ('MAD', 'Dirham Marocain',  'DH', 60.30,  61.90,  61.00,   'fixed', 'Fixe',  false)
ON CONFLICT (code) DO NOTHING;

-- ── Seed : configuration (mêmes valeurs que CONFIG côté frontend) ──
INSERT INTO app_config (key, value) VALUES
    ('vault.minThreshold',   '500000'),
    ('vault.openingBalance', '2000000'),
    ('exchangeFee',          '500'),
    ('transferFeeRate',      '0.01'),
    ('maxLoginAttempts',     '5'),
    ('loginLockoutMs',       '30000')
ON CONFLICT (key) DO NOTHING;
