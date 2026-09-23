-- ═══════════════════════════════════════════════════════════════
-- S.A.C ERP — Schéma PostgreSQL complet (état consolidé)
--
-- Équivalent, en un seul fichier, du résultat cumulé de
-- 001_init.sql → 002_kyc_ref_as_pk.sql → 003_multi_tenancy.sql →
-- 004_agency_slug.sql. Utile pour provisionner une base neuve
-- (ex : nouvel environnement Supabase) en une seule exécution,
-- sans rejouer l'historique des migrations.
--
-- Toutes les instructions sont idempotentes (IF NOT EXISTS) :
-- ce fichier peut être exécuté sans risque même si le schéma
-- existe déjà (y compris par le runner de migrations, qui le
-- traiterait sinon comme une migration supplémentaire).
--
-- Aucune donnée de démonstration — schéma seul.
-- ═══════════════════════════════════════════════════════════════

-- ── agencies ─────────────────────────────────────────────────
-- Racine du multi-tenant : chaque table métier référence agency_id.
-- La désactivation d'une agence se fait via active = false ;
-- aucune suppression en cascade n'existe dans ce schéma — les
-- données financières ne sont jamais supprimées automatiquement.
CREATE TABLE IF NOT EXISTS agencies (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    slug        VARCHAR(50)  NOT NULL UNIQUE,   -- code agence saisi à l'écran de connexion
    city        VARCHAR(100),
    country     VARCHAR(100) DEFAULT 'Burkina Faso',
    phone       VARCHAR(30),
    email       VARCHAR(150) NOT NULL UNIQUE,
    plan        VARCHAR(20)  DEFAULT 'starter', -- starter | pro | enterprise
    active      BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- ── cashiers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cashiers (
    id              SERIAL PRIMARY KEY,
    agency_id       INTEGER NOT NULL REFERENCES agencies(id),
    name            TEXT NOT NULL,
    counter         TEXT NOT NULL,              -- ex : "#01"
    pin_hash        TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    locked_until    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agency_id, counter)                 -- le numéro de guichet redémarre par agence
);

CREATE INDEX IF NOT EXISTS idx_cashiers_agency ON cashiers(agency_id);

-- ── kyc_clients ───────────────────────────────────────────────
-- La référence lisible (KYC-0001...) sert directement de clé primaire
-- (composite avec agency_id) : elle redémarre à zéro pour chaque agence.
CREATE TABLE IF NOT EXISTS kyc_clients (
    agency_id   INTEGER NOT NULL REFERENCES agencies(id),
    ref         TEXT NOT NULL,                  -- ex : KYC-0001
    name        TEXT NOT NULL,
    id_type     TEXT NOT NULL,
    id_number   TEXT NOT NULL,
    phone       TEXT NOT NULL,
    nationality TEXT,
    birth_date  DATE,
    photo       TEXT,                           -- image encodée en base64
    verified    BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (agency_id, ref)
);

CREATE INDEX IF NOT EXISTS idx_kyc_clients_agency ON kyc_clients(agency_id);

-- ── currency_rates ───────────────────────────────────────────
-- Chaque agence fixe ses propres taux : clé primaire composite.
CREATE TABLE IF NOT EXISTS currency_rates (
    agency_id   INTEGER NOT NULL REFERENCES agencies(id),
    code        TEXT NOT NULL,                  -- ex : EUR, USD, MAD
    name        TEXT NOT NULL,
    symbol      TEXT NOT NULL,
    buy         NUMERIC NOT NULL,
    sell        NUMERIC NOT NULL,
    official    NUMERIC NOT NULL,
    trend       TEXT NOT NULL DEFAULT 'fixed',
    trend_label TEXT NOT NULL DEFAULT 'Fixe',
    fixed       BOOLEAN NOT NULL DEFAULT false, -- devise à taux fixe, non modifiable/supprimable
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (agency_id, code)
);

CREATE INDEX IF NOT EXISTS idx_currency_rates_agency ON currency_rates(agency_id);

-- ── app_config ───────────────────────────────────────────────
-- Réglages par agence (frais, seuils de caisse, verrou anti-bruteforce...).
CREATE TABLE IF NOT EXISTS app_config (
    agency_id   INTEGER NOT NULL REFERENCES agencies(id),
    key         TEXT NOT NULL,
    value       TEXT NOT NULL,
    PRIMARY KEY (agency_id, key)
);

CREATE INDEX IF NOT EXISTS idx_app_config_agency ON app_config(agency_id);

-- ── transactions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id          SERIAL PRIMARY KEY,
    agency_id   INTEGER NOT NULL REFERENCES agencies(id),
    ref         TEXT NOT NULL,                  -- référence lisible (ex : GX-10928)
    time        TEXT NOT NULL,                  -- heure affichée HH:MM
    type        TEXT NOT NULL,
    type_code   TEXT NOT NULL,
    client      TEXT NOT NULL,
    client_id   TEXT,                           -- référence texte vers kyc_clients.ref (nullable)
    amount      TEXT NOT NULL,                  -- déjà formaté (ex : "604 000 FCFA")
    fee         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'Terminé',
    cashier_id  INTEGER REFERENCES cashiers(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agency_id, ref),                    -- la référence redémarre par agence
    -- Clé étrangère composite : une transaction ne peut jamais pointer
    -- vers la fiche KYC d'une AUTRE agence que la sienne.
    FOREIGN KEY (agency_id, client_id) REFERENCES kyc_clients(agency_id, ref) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_agency ON transactions(agency_id);

-- ── vault_movements ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_movements (
    id          SERIAL PRIMARY KEY,
    agency_id   INTEGER NOT NULL REFERENCES agencies(id),
    reference   TEXT NOT NULL,                  -- ex : MVT-482913
    time        TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
    amount      NUMERIC NOT NULL,
    reason      TEXT NOT NULL,
    cashier_id  INTEGER REFERENCES cashiers(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (agency_id, reference)               -- la référence redémarre par agence
);

CREATE INDEX IF NOT EXISTS idx_vault_movements_agency ON vault_movements(agency_id);
