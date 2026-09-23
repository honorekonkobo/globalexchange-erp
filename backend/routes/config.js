import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(requireAuth);

/** Correspondance clé DB (app_config) ↔ nom exposé à l'API/au frontend */
const CONFIG_KEYS = {
    vaultMinThreshold:   'vault.minThreshold',
    vaultOpeningBalance: 'vault.openingBalance',
    exchangeFee:         'exchangeFee',
    transferFeeRate:     'transferFeeRate',
};

/** GET /api/config — scopé à l'agence du caissier */
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT key, value FROM app_config WHERE agency_id = $1',
        [req.cashier.agencyId]
    );
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));

    const out = {};
    for (const [apiKey, dbKey] of Object.entries(CONFIG_KEYS)) {
        out[apiKey] = byKey[dbKey] !== undefined ? Number(byKey[dbKey]) : null;
    }
    res.json(out);
}));

/** PUT /api/config — met à jour un ou plusieurs réglages, pour l'agence du caissier */
router.put('/', asyncHandler(async (req, res) => {
    const updates = req.body ?? {};
    const agencyId = req.cashier.agencyId;

    for (const [apiKey, value] of Object.entries(updates)) {
        const dbKey = CONFIG_KEYS[apiKey];
        if (!dbKey) continue; // ignore les clés inconnues plutôt que de planter la requête
        if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
            return res.status(400).json({ error: `Valeur invalide pour ${apiKey}.` });
        }
        await pool.query(
            `INSERT INTO app_config (agency_id, key, value) VALUES ($1, $2, $3)
             ON CONFLICT (agency_id, key) DO UPDATE SET value = EXCLUDED.value`,
            [agencyId, dbKey, String(value)]
        );
    }

    const { rows } = await pool.query('SELECT key, value FROM app_config WHERE agency_id = $1', [agencyId]);
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.value]));
    const out = {};
    for (const [apiKey, dbKey] of Object.entries(CONFIG_KEYS)) {
        out[apiKey] = byKey[dbKey] !== undefined ? Number(byKey[dbKey]) : null;
    }
    res.json(out);
}));

export default router;
