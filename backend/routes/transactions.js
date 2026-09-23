import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(requireAuth);

/** Convertit une ligne DB vers la forme attendue par le frontend (State.transactions) */
function serialize(row) {
    return {
        id:       row.ref,
        time:     row.time,
        type:     row.type,
        typeCode: row.type_code,
        client:   row.client,
        clientId: row.client_id,
        amount:   row.amount,
        fee:      row.fee,
        status:   row.status,
    };
}

/** GET /api/transactions?type=CODE&q=recherche — liste (plus récentes d'abord), scopée à l'agence du caissier */
router.get('/', asyncHandler(async (req, res) => {
    const { type, q } = req.query;
    const clauses = ['agency_id = $1'];
    const params  = [req.cashier.agencyId];

    if (type && type !== 'ALL') {
        params.push(type);
        clauses.push(`type_code = $${params.length}`);
    }
    if (q) {
        params.push(`%${q}%`);
        const p = params.length;
        clauses.push(`(client ILIKE $${p} OR ref ILIKE $${p} OR type ILIKE $${p})`);
    }

    const { rows } = await pool.query(
        `SELECT * FROM transactions WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`,
        params
    );
    res.json(rows.map(serialize));
}));

/** POST /api/transactions — enregistre une opération (change ou transfert), pour l'agence du caissier */
router.post('/', asyncHandler(async (req, res) => {
    const { id: ref, time, type, typeCode, client, clientId, amount, fee, status } = req.body ?? {};

    if (!ref || !time || !type || !typeCode || !client || !amount || !fee) {
        return res.status(400).json({ error: 'Champs de transaction manquants.' });
    }

    try {
        const { rows } = await pool.query(
            `INSERT INTO transactions (agency_id, ref, time, type, type_code, client, client_id, amount, fee, status, cashier_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [req.cashier.agencyId, ref, time, type, typeCode, client, clientId ?? null, amount, fee, status ?? 'Terminé', req.cashier.id]
        );
        res.status(201).json(serialize(rows[0]));
    } catch (e) {
        if (e.code === '23505') { // violation de contrainte unique (ref déjà utilisée dans cette agence)
            return res.status(409).json({ error: `La référence ${ref} existe déjà.` });
        }
        throw e;
    }
}));

export default router;
