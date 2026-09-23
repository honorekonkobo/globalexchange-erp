import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();
router.use(requireAuth);

/** Convertit une ligne DB vers la forme attendue par le frontend (KycState.clients) */
function serialize(row) {
    return {
        id:          row.ref,
        name:        row.name,
        idType:      row.id_type,
        idNumber:    row.id_number,
        phone:       row.phone,
        nationality: row.nationality,
        birthDate:   row.birth_date ? row.birth_date.toISOString().slice(0, 10) : null,
        photo:       row.photo,
        verified:    row.verified,
    };
}

/** Prochain numéro de fiche (KYC-0001, KYC-0002, ...) — la numérotation redémarre par agence */
async function nextRef(agencyId) {
    const { rows } = await pool.query(
        `SELECT ref FROM kyc_clients WHERE agency_id = $1 AND ref ~ '^KYC-[0-9]+$'`,
        [agencyId]
    );
    const max = rows.reduce((m, r) => Math.max(m, parseInt(r.ref.slice(4), 10)), 0);
    return 'KYC-' + String(max + 1).padStart(4, '0');
}

/** GET /api/kyc-clients?q=recherche — scopé à l'agence du caissier */
router.get('/', asyncHandler(async (req, res) => {
    const { q } = req.query;
    let rows;
    if (q) {
        ({ rows } = await pool.query(
            `SELECT * FROM kyc_clients
             WHERE agency_id = $1 AND (name ILIKE $2 OR id_number ILIKE $2 OR phone ILIKE $2)
             ORDER BY created_at DESC`,
            [req.cashier.agencyId, `%${q}%`]
        ));
    } else {
        ({ rows } = await pool.query(
            'SELECT * FROM kyc_clients WHERE agency_id = $1 ORDER BY created_at DESC',
            [req.cashier.agencyId]
        ));
    }
    res.json(rows.map(serialize));
}));

/** POST /api/kyc-clients — nouvelle fiche client, pour l'agence du caissier */
router.post('/', asyncHandler(async (req, res) => {
    const { name, idType, idNumber, phone, nationality, birthDate, photo, verified } = req.body ?? {};
    if (!name || !idType || !idNumber || !phone) {
        return res.status(400).json({ error: 'Nom, type de pièce, numéro et téléphone sont requis.' });
    }

    const ref = await nextRef(req.cashier.agencyId);
    const { rows } = await pool.query(
        `INSERT INTO kyc_clients (agency_id, ref, name, id_type, id_number, phone, nationality, birth_date, photo, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [req.cashier.agencyId, ref, name, idType, idNumber, phone, nationality ?? null, birthDate || null, photo ?? null, !!verified]
    );
    res.status(201).json(serialize(rows[0]));
}));

/** PUT /api/kyc-clients/:ref — modification d'une fiche existante, dans l'agence du caissier */
router.put('/:ref', asyncHandler(async (req, res) => {
    const { name, idType, idNumber, phone, nationality, birthDate, photo, verified } = req.body ?? {};
    const { rows } = await pool.query(
        `UPDATE kyc_clients SET
            name = COALESCE($3, name),
            id_type = COALESCE($4, id_type),
            id_number = COALESCE($5, id_number),
            phone = COALESCE($6, phone),
            nationality = COALESCE($7, nationality),
            birth_date = COALESCE($8, birth_date),
            photo = COALESCE($9, photo),
            verified = COALESCE($10, verified),
            updated_at = now()
         WHERE agency_id = $1 AND ref = $2
         RETURNING *`,
        [
            req.cashier.agencyId, req.params.ref,
            name ?? null, idType ?? null, idNumber ?? null, phone ?? null,
            nationality ?? null, birthDate || null, photo ?? null,
            verified === undefined ? null : verified,
        ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Client introuvable.' });
    res.json(serialize(rows[0]));
}));

export default router;
