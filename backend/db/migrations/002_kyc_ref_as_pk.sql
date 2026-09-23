-- ═══════════════════════════════════════════════════════════════
-- Simplifie kyc_clients : la référence lisible (ex: KYC-0001), déjà
-- utilisée comme "id" partout côté frontend (State/KycState), devient
-- directement la clé primaire — au lieu d'un id serial interne séparé
-- que le frontend n'a jamais manipulé. transactions.client_id référence
-- désormais cette même valeur texte plutôt qu'un entier interne.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_client_id_fkey;
ALTER TABLE transactions ALTER COLUMN client_id TYPE TEXT USING client_id::TEXT;

ALTER TABLE kyc_clients DROP CONSTRAINT IF EXISTS kyc_clients_pkey;
ALTER TABLE kyc_clients DROP CONSTRAINT IF EXISTS kyc_clients_ref_key;
ALTER TABLE kyc_clients DROP COLUMN IF EXISTS id;
ALTER TABLE kyc_clients ADD PRIMARY KEY (ref);

ALTER TABLE transactions ADD CONSTRAINT transactions_client_id_fkey
    FOREIGN KEY (client_id) REFERENCES kyc_clients(ref) ON DELETE SET NULL;
