-- ═══════════════════════════════════════════════════════════════
-- L'email d'agence n'est utilisé par aucune fonctionnalité (pas
-- d'envoi d'email dans l'app) — il reste un identifiant de contact
-- utile mais ne doit plus bloquer la création d'une agence.
-- UNIQUE reste valide sur une colonne nullable en Postgres (plusieurs
-- NULL ne sont jamais considérés en conflit entre eux).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE agencies ALTER COLUMN email DROP NOT NULL;
