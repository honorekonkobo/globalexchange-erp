import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(requireAuth);

/** Transforme les lignes DB en objet { CODE: {...} } — même forme que CONFIG.rates côté frontend */
function serializeAll(rows) {
    const out = {};
    for (const r of rows) {
        out[r.code] = {
            name:       r.name,
            symbol:     r.symbol,
            buy:        Number(r.buy),
            sell:       Number(r.sell),
            official:   Number(r.official),
            trend:      r.trend,
            trendLabel: r.trend_label,
            fixed:      r.fixed,
            updatedAt:  r.updated_at,
        };
    }
    return out;
}

/** GET /api/rates — scopé à l'agence du caissier */
router.get('/', asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 ORDER BY code',
        [req.cashier.agencyId]
    );
    res.json(serializeAll(rows));
}));

/** PUT /api/rates — mise à jour groupée des taux du jour (devises flottantes uniquement), pour l'agence du caissier
 *  Body : { CODE: { official, buy, sell }, ... }
 *  La tendance est recalculée automatiquement par rapport au taux officiel précédent. */
router.put('/', asyncHandler(async (req, res) => {
    const updates = req.body ?? {};
    const codes = Object.keys(updates);
    if (!codes.length) return res.status(400).json({ error: 'Aucun taux à mettre à jour.' });

    const { rows: current } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 AND code = ANY($2)',
        [req.cashier.agencyId, codes]
    );
    const byCode = Object.fromEntries(current.map(r => [r.code, r]));

    for (const code of codes) {
        const existing = byCode[code];
        if (!existing) return res.status(404).json({ error: `Devise ${code} introuvable.` });
        if (existing.fixed) return res.status(400).json({ error: `${code} est une devise fixe, non modifiable.` });

        const { official, buy, sell } = updates[code];
        if (!official || official <= 0 || !buy || buy <= 0 || !sell || sell <= 0) {
            return res.status(400).json({ error: `Taux invalides pour ${code}.` });
        }
        if (sell < buy) {
            return res.status(400).json({ error: `Le taux de vente doit être ≥ au taux d'achat pour ${code}.` });
        }
    }

    for (const code of codes) {
        const existing = byCode[code];
        const { official, buy, sell } = updates[code];
        const previousOfficial = Number(existing.official);
        const changePct = previousOfficial ? ((official - previousOfficial) / previousOfficial) * 100 : 0;
        const trend = Math.abs(changePct) < 0.05 ? 'fixed' : (changePct > 0 ? '+' : '') + changePct.toFixed(1) + '%';
        const trendLabel = trend === 'fixed' ? 'Fixe' : trend;

        await pool.query(
            `UPDATE currency_rates SET official=$3, buy=$4, sell=$5, trend=$6, trend_label=$7, updated_at=now()
             WHERE agency_id = $1 AND code = $2`,
            [req.cashier.agencyId, code, official, buy, sell, trend, trendLabel]
        );
    }

    const { rows } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 ORDER BY code',
        [req.cashier.agencyId]
    );
    res.json(serializeAll(rows));
}));

/** POST /api/rates — ajout d'une nouvelle devise (toujours flottante), pour l'agence du caissier */
router.post('/', asyncHandler(async (req, res) => {
    const { code, name, symbol, official, buy, sell } = req.body ?? {};

    if (!/^[A-Z]{2,4}$/.test(code ?? '')) {
        return res.status(400).json({ error: 'Le code devise doit comporter 2 à 4 lettres (ex : MAD).' });
    }
    if (!symbol) return res.status(400).json({ error: 'Le symbole est requis.' });
    if (!name)   return res.status(400).json({ error: 'Le nom de la devise est requis.' });
    if (!official || official <= 0 || !buy || buy <= 0 || !sell || sell <= 0) {
        return res.status(400).json({ error: 'Taux invalides.' });
    }
    if (sell < buy) {
        return res.status(400).json({ error: "Le taux de vente doit être ≥ au taux d'achat." });
    }

    try {
        await pool.query(
            `INSERT INTO currency_rates (agency_id, code, name, symbol, buy, sell, official, trend, trend_label, fixed)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'fixed','Fixe',false)`,
            [req.cashier.agencyId, code, name, symbol, buy, sell, official]
        );
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: `La devise ${code} existe déjà.` });
        throw e;
    }

    const { rows } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 ORDER BY code',
        [req.cashier.agencyId]
    );
    res.status(201).json(serializeAll(rows));
}));

/** DELETE /api/rates/:code — supprime une devise flottante, dans l'agence du caissier */
router.delete('/:code', asyncHandler(async (req, res) => {
    const code = req.params.code.toUpperCase();
    const agencyId = req.cashier.agencyId;

    const { rows: existingRows } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 AND code = $2',
        [agencyId, code]
    );
    if (!existingRows.length) return res.status(404).json({ error: `Devise ${code} introuvable.` });
    if (existingRows[0].fixed) return res.status(400).json({ error: 'Cette devise ne peut pas être supprimée.' });

    const { rows: countRows } = await pool.query(
        'SELECT COUNT(*) FROM currency_rates WHERE agency_id = $1',
        [agencyId]
    );
    if (Number(countRows[0].count) <= 1) {
        return res.status(400).json({ error: 'Impossible de supprimer la dernière devise disponible.' });
    }

    await pool.query('DELETE FROM currency_rates WHERE agency_id = $1 AND code = $2', [agencyId, code]);
    const { rows } = await pool.query(
        'SELECT * FROM currency_rates WHERE agency_id = $1 ORDER BY code',
        [agencyId]
    );
    res.json(serializeAll(rows));
}));

export default router;
