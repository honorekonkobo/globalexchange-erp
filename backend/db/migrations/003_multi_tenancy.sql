-- ═══════════════════════════════════════════════════════════════
-- Multi-tenancy : chaque agence a ses propres données, isolées.
--
-- Au-delà du simple ajout de colonne, plusieurs contraintes qui étaient
-- globales doivent devenir "par agence" — sinon deux agences distinctes
-- entreraient en collision sur des identifiants générés de la même façon
-- (KYC-0001, GX-xxxxxx, MVT-xxxxxx redémarrent tous à zéro par agence) :
--   - kyc_clients.ref, transactions.ref, vault_movements.reference :
--     UNIQUE devient UNIQUE(agency_id, ...) au lieu d'un UNIQUE global.
--   - currency_rates.code et app_config.key : chaque agence fixe ses
--     propres taux/réglages, la clé primaire devient (agency_id, code|key).
--   - transactions.client_id référence désormais kyc_clients via une
--     clé étrangère composite (agency_id, client_id) → (agency_id, ref),
--     pour qu'une transaction ne puisse jamais pointer vers la fiche
--     KYC d'une AUTRE agence.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE agencies (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    city        VARCHAR(100),
    country     VARCHAR(100) DEFAULT 'Burkina Faso',
    phone       VARCHAR(30),
    email       VARCHAR(150) UNIQUE NOT NULL,
    plan        VARCHAR(20)  DEFAULT 'starter',   -- starter | pro | enterprise
    active      BOOLEAN      DEFAULT TRUE,
    created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Agence de démonstration : accueille toutes les données déjà existantes
INSERT INTO agencies (name, city, email) VALUES ('S.A.C Demo', 'Ouagadougou', 'demo@sac-bf.com');

-- ── cashiers ─────────────────────────────────────────────────
ALTER TABLE cashiers ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE cashiers SET agency_id = 1;
ALTER TABLE cashiers ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE cashiers DROP CONSTRAINT cashiers_counter_key;
ALTER TABLE cashiers ADD CONSTRAINT cashiers_agency_counter_key UNIQUE (agency_id, counter);
CREATE INDEX idx_cashiers_agency ON cashiers(agency_id);

-- ── kyc_clients ───────────────────────────────────────────────
-- La référence (KYC-0001...) redémarre à zéro pour chaque agence :
-- la clé primaire devient composite. La FK de transactions vers
-- kyc_clients_pkey doit être détachée d'abord (elle en dépend) ;
-- elle est reconstruite en composite juste après.
ALTER TABLE transactions DROP CONSTRAINT transactions_client_id_fkey;

ALTER TABLE kyc_clients ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE kyc_clients SET agency_id = 1;
ALTER TABLE kyc_clients ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE kyc_clients DROP CONSTRAINT kyc_clients_pkey;
ALTER TABLE kyc_clients ADD PRIMARY KEY (agency_id, ref);
CREATE INDEX idx_kyc_clients_agency ON kyc_clients(agency_id);

-- ── transactions ─────────────────────────────────────────────
ALTER TABLE transactions ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE transactions SET agency_id = 1;
ALTER TABLE transactions ALTER COLUMN agency_id SET NOT NULL;

ALTER TABLE transactions DROP CONSTRAINT transactions_ref_key;
ALTER TABLE transactions ADD CONSTRAINT transactions_agency_ref_key UNIQUE (agency_id, ref);

-- FK vers kyc_clients reconstruite en composite (agency_id, client_id)
ALTER TABLE transactions ADD CONSTRAINT transactions_client_id_fkey
    FOREIGN KEY (agency_id, client_id) REFERENCES kyc_clients(agency_id, ref) ON DELETE SET NULL;

CREATE INDEX idx_transactions_agency ON transactions(agency_id);

-- ── vault_movements ──────────────────────────────────────────
ALTER TABLE vault_movements ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE vault_movements SET agency_id = 1;
ALTER TABLE vault_movements ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE vault_movements DROP CONSTRAINT vault_movements_reference_key;
ALTER TABLE vault_movements ADD CONSTRAINT vault_movements_agency_reference_key UNIQUE (agency_id, reference);
CREATE INDEX idx_vault_movements_agency ON vault_movements(agency_id);

-- ── currency_rates ───────────────────────────────────────────
-- Chaque agence fixe ses propres taux : la clé primaire devient composite.
ALTER TABLE currency_rates ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE currency_rates SET agency_id = 1;
ALTER TABLE currency_rates ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE currency_rates DROP CONSTRAINT currency_rates_pkey;
ALTER TABLE currency_rates ADD PRIMARY KEY (agency_id, code);
CREATE INDEX idx_currency_rates_agency ON currency_rates(agency_id);

-- ── app_config ───────────────────────────────────────────────
-- Chaque agence a ses propres réglages (frais, seuils) : clé composite.
ALTER TABLE app_config ADD COLUMN agency_id INTEGER REFERENCES agencies(id);
UPDATE app_config SET agency_id = 1;
ALTER TABLE app_config ALTER COLUMN agency_id SET NOT NULL;
ALTER TABLE app_config DROP CONSTRAINT app_config_pkey;
ALTER TABLE app_config ADD PRIMARY KEY (agency_id, key);
CREATE INDEX idx_app_config_agency ON app_config(agency_id);
