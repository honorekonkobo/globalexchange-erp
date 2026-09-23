import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

async function getConfigNumber(agencyId, key, fallback) {
    const { rows } = await pool.query(
        'SELECT value FROM app_config WHERE agency_id = $1 AND key = $2',
        [agencyId, key]
    );
    return rows.length ? Number(rows[0].value) : fallback;
}

/** Résout une agence active à partir de son code (slug) ; renvoie null si introuvable/inactive.
 *  Ne distingue jamais "slug inconnu" de "agence désactivée" dans la réponse HTTP — un attaquant
 *  ne doit pas pouvoir énumérer les codes d'agence valides par ce biais. */
async function findActiveAgency(slug) {
    const { rows } = await pool.query(
        'SELECT id, slug, name FROM agencies WHERE slug = $1 AND active = true',
        [slug]
    );
    return rows[0] ?? null;
}

/** Liste publique des guichetiers d'UNE agence (nom + compteur), pour peupler le menu de connexion.
 *  L'agence est identifiée par son code (slug) — pas de sous-domaine, "même URL" pour tous. */
router.get('/cashiers', asyncHandler(async (req, res) => {
    const { agencySlug } = req.query;
    if (!agencySlug) {
        return res.status(400).json({ error: 'Code agence requis.' });
    }

    const agency = await findActiveAgency(agencySlug);
    if (!agency) {
        return res.status(404).json({ error: 'Agence introuvable.' });
    }

    const { rows } = await pool.query(
        'SELECT id, name, counter FROM cashiers WHERE agency_id = $1 ORDER BY counter',
        [agency.id]
    );
    res.json({ agency: { name: agency.name, slug: agency.slug }, cashiers: rows });
}));

/** Connexion : { agencySlug, cashierId, pin } → { token, cashier, agency } */
router.post('/login', asyncHandler(async (req, res) => {
    const { agencySlug, cashierId, pin } = req.body ?? {};
    if (!agencySlug || !cashierId || typeof cashierId !== 'number' || !pin) {
        return res.status(400).json({ error: 'Code agence, guichetier et code PIN requis.' });
    }

    const agency = await findActiveAgency(agencySlug);
    if (!agency) {
        return res.status(401).json({ error: 'Agence introuvable.' });
    }

    /* cashierId est scopé à l'agence résolue : impossible de se connecter au
       compte d'un guichetier d'une autre agence même en devinant son id. */
    const { rows } = await pool.query(
        'SELECT * FROM cashiers WHERE id = $1 AND agency_id = $2',
        [cashierId, agency.id]
    );
    const cashier = rows[0];
    if (!cashier) {
        return res.status(401).json({ error: 'Guichetier introuvable.' });
    }

    const now = new Date();
    if (cashier.locked_until && new Date(cashier.locked_until) > now) {
        const remaining = Math.ceil((new Date(cashier.locked_until) - now) / 1000);
        return res.status(429).json({ error: `Trop de tentatives incorrectes. Réessayez dans ${remaining}s.` });
    }

    const validPin = await bcrypt.compare(String(pin), cashier.pin_hash);

    if (!validPin) {
        const maxAttempts = await getConfigNumber(agency.id, 'maxLoginAttempts', 5);
        const lockoutMs    = await getConfigNumber(agency.id, 'loginLockoutMs', 30000);
        const attempts     = cashier.failed_attempts + 1;

        if (attempts >= maxAttempts) {
            await pool.query(
                'UPDATE cashiers SET failed_attempts = 0, locked_until = $2 WHERE id = $1',
                [cashier.id, new Date(Date.now() + lockoutMs)]
            );
            return res.status(429).json({ error: `Trop de tentatives incorrectes. Accès bloqué ${lockoutMs / 1000}s.` });
        }

        await pool.query('UPDATE cashiers SET failed_attempts = $2 WHERE id = $1', [cashier.id, attempts]);
        return res.status(401).json({ error: 'Code PIN incorrect.' });
    }

    await pool.query('UPDATE cashiers SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [cashier.id]);

    const token = jwt.sign(
        { sub: cashier.id, agencyId: agency.id, name: cashier.name, counter: cashier.counter },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '12h' }
    );

    res.json({
        token,
        cashier: { id: cashier.id, name: cashier.name, counter: cashier.counter },
        agency: { name: agency.name, slug: agency.slug },
    });
}));

/** JWT sans état : la déconnexion est gérée côté client (suppression du token) */
router.post('/logout', (req, res) => {
    res.json({ ok: true });
});

/** Vérifie/retourne la session courante — utile pour valider un token au chargement */
router.get('/me', requireAuth, (req, res) => {
    res.json({ cashier: req.cashier });
});

export default router;
