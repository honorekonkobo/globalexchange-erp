-- ═══════════════════════════════════════════════════════════════
-- Code agence (slug) : identifie l'agence sur l'écran de connexion,
-- avant même la sélection du guichetier ("même URL, espace isolé"
-- — pas de sous-domaine par agence).
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE agencies ADD COLUMN slug VARCHAR(50) UNIQUE;

UPDATE agencies SET slug = 'sac-demo' WHERE id = 1;

ALTER TABLE agencies ALTER COLUMN slug SET NOT NULL;
