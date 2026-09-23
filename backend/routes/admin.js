import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

/** Provisioning uniquement : protégé par un secret partagé indépendant du JWT
 *  guichetier, jamais exposé au frontend de connexion. Réservé à un usage
 *  d'administration interne (script, outil back-office futur). */
function requireAdminSecret(req, res, next) {
    const header = req.headers['x-admin-secret'];
    if (!process.env.ADMIN_SECRET || header !== process.env.ADMIN_SECRET) {
        return res.status(401).json({ error: 'Non autorisé.' });
    }
    next();
}
router.use(requireAdminSecret);

/* Mêmes valeurs de départ que l'agence de démonstration (001_init.sql) —
   une agence nouvellement créée doit démarrer avec un jeu de taux et de
   réglages utilisables, sinon elle est cassée dès la première connexion. */
const DEFAULT_RATES = [
    ['EUR', 'Euro',             '€',  650.00, 657.50, 655.957, true],
    ['USD', 'Dollar Américain', '$',  604.50, 614.00, 604.50,  false],
    ['GBP', 'Livre Sterling',   '£',  775.00, 790.00, 782.10,  false],
    ['MAD', 'Dirham Marocain',  'DH', 60.30,  61.90,  61.00,   false],
];

const DEFAULT_CONFIG = {
    'vault.minThreshold':   '500000',
    'vault.openingBalance': '2000000',
    exchangeFee:            '500',
    transferFeeRate:        '0.01',
    maxLoginAttempts:       '5',
    loginLockoutMs:         '30000',
};

const SLUG_RE = /^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])?$/;

/** POST /api/admin/agencies — provisionne une nouvelle agence, isolée dès sa création
 *  Body : { name, slug, city?, phone?, email, plan?, cashier: { name, counter, pin } } */
router.post('/agencies', asyncHandler(async (req, res) => {
    const { name, slug, city, phone, email, plan, cashier } = req.body ?? {};

    if (!name || !slug || !email) {
        return res.status(400).json({ error: 'Nom, code agence (slug) et email sont requis.' });
    }
    if (!SLUG_RE.test(slug)) {
        return res.status(400).json({ error: 'Code agence invalide (minuscules, chiffres, tirets, 3 à 50 caractères).' });
    }
    if (!cashier?.name || !cashier?.counter || !cashier?.pin) {
        return res.status(400).json({ error: 'Un premier guichetier (nom, comptoir, PIN) est requis pour pouvoir se connecter.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let agency;
        try {
            ({ rows: [agency] } = await client.query(
                `INSERT INTO agencies (name, slug, city, country, phone, email, plan)
                 VALUES ($1,$2,$3,'Burkina Faso',$4,$5,$6)
                 RETURNING *`,
                [name, slug, city ?? null, phone ?? null, email, plan ?? 'starter']
            ));
        } catch (e) {
            if (e.code === '23505') {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: 'Ce code agence ou cet email est déjà utilisé.' });
            }
            throw e;
        }

        const pinHash = await bcrypt.hash(String(cashier.pin), 10);
        await client.query(
            `INSERT INTO cashiers (agency_id, name, counter, pin_hash) VALUES ($1,$2,$3,$4)`,
            [agency.id, cashier.name, cashier.counter, pinHash]
        );

        for (const [code, rname, symbol, buy, sell, official, fixed] of DEFAULT_RATES) {
            await client.query(
                `INSERT INTO currency_rates (agency_id, code, name, symbol, buy, sell, official, trend, trend_label, fixed)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,'fixed','Fixe',$8)`,
                [agency.id, code, rname, symbol, buy, sell, official, fixed]
            );
        }

        for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
            await client.query(
                `INSERT INTO app_config (agency_id, key, value) VALUES ($1,$2,$3)`,
                [agency.id, key, value]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            agency: {
                id: agency.id, name: agency.name, slug: agency.slug,
                city: agency.city, email: agency.email, plan: agency.plan,
            },
        });
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}));

export default router;
