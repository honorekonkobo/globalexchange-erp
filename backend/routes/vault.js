import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(requireAuth);

function serialize(row) {
    return {
        time:      row.time,
        reference: row.reference,
        direction: row.direction,
        amount:    Number(row.amount),
        reason:    row.reason,
    };
}

/** GET /api/vault/movements — journal des mouvements manuels (caisse), scopé à l'agence du caissier */
router.get('/movements', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT * FROM vault_movements WHERE agency_id = $1 ORDER BY created_at DESC',
        [req.cashier.agencyId]
    );
    res.json(rows.map(serialize));
}));

/** POST /api/vault/movements — alimentation ou retrait manuel de caisse, pour l'agence du caissier */
router.post('/movements', asyncHandler(async (req, res) => {
    const { direction, amount, reason } = req.body ?? {};
    if (!['IN', 'OUT'].includes(direction) || !amount || amount <= 0 || !reason) {
        return res.status(400).json({ error: 'Direction (IN/OUT), montant positif et motif requis.' });
    }

    const time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const reference = 'MVT-' + Math.floor(100000 + Math.random() * 900000);

    const { rows } = await pool.query(
        `INSERT INTO vault_movements (agency_id, reference, time, direction, amount, reason, cashier_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [req.cashier.agencyId, reference, time, direction, amount, reason, req.cashier.id]
    );
    res.status(201).json(serialize(rows[0]));
}));

export default router;
