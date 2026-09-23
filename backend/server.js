import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db/pool.js';
import authRouter from './routes/auth.js';
import transactionsRouter from './routes/transactions.js';
import kycRouter from './routes/kyc.js';
import vaultRouter from './routes/vault.js';
import ratesRouter from './routes/rates.js';
import configRouter from './routes/config.js';
import adminRouter from './routes/admin.js';

/* ── Vérification des variables d'environnement requises ─────
   Échec rapide et explicite au démarrage plutôt qu'une erreur
   obscure au premier appel (ex : DATABASE_URL absente → pool.query
   échouerait silencieusement sur chaque requête). */
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_SECRET'];
const missingEnvVars = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
if (missingEnvVars.length) {
    console.error(`[S.A.C ERP] Variables d'environnement manquantes : ${missingEnvVars.join(', ')}`);
    console.error('[S.A.C ERP] Voir .env.example pour la liste complète.');
    process.exit(1);
}

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(__dirname, '..'); // racine du projet (index.html, css/, js/, img/)

const app = express();

/* Pas de middleware CORS : le frontend est servi par ce même serveur
   (même origine http://localhost:3000), aucun appel cross-origin n'est
   nécessaire — autant ne pas ouvrir cette surface. */
app.use(express.json({ limit: '5mb' })); // limite relevée pour les photos KYC en base64

/* ── Vérification de l'état du serveur + de la connexion DB ─── */
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', dbConnected: true });
    } catch (e) {
        /* Route publique (sans authentification) : ne jamais exposer le détail
           de l'erreur PostgreSQL à un appelant non identifié. */
        console.error('[health] base de données inaccessible :', e.message);
        res.status(500).json({ status: 'error', dbConnected: false });
    }
});

app.use('/api/auth', authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/kyc-clients', kycRouter);
app.use('/api/vault', vaultRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/config', configRouter);
app.use('/api/admin', adminRouter);

/* ── Fichiers statiques du frontend existant ────────────────── */
app.use(express.static(FRONTEND_DIR));

/* ── Gestionnaire d'erreurs global : toujours répondre en JSON ── */
app.use((err, req, res, next) => {
    console.error('[api] erreur non gérée :', err);
    res.status(500).json({ error: 'Erreur serveur inattendue.' });
});

/* ── Filet de sécurité : une erreur async non interceptée (route qui
   oublierait asyncHandler) ne doit jamais arrêter le serveur pour tous
   les guichets — elle est journalisée, le process continue de tourner. */
process.on('unhandledRejection', (err) => {
    console.error('[api] Rejet de promesse non géré (le serveur continue de tourner) :', err);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[S.A.C ERP] Serveur démarré sur http://localhost:${PORT}`);
});
