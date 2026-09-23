/**
 * api/index.js — Point d'entrée Vercel Serverless pour l'API Express
 * Ce fichier est le seul différence vs. backend/server.js :
 * - Pas de app.listen() (Vercel gère le cycle de vie)
 * - Pas de import 'dotenv/config' (les env vars sont dans le dashboard Vercel)
 * - Pas de middleware pour les fichiers statiques (Vercel les sert nativement)
 */

import express from 'express';
import { pool } from '../backend/db/pool.js';
import authRouter from '../backend/routes/auth.js';
import transactionsRouter from '../backend/routes/transactions.js';
import kycRouter from '../backend/routes/kyc.js';
import vaultRouter from '../backend/routes/vault.js';
import ratesRouter from '../backend/routes/rates.js';
import configRouter from '../backend/routes/config.js';
import adminRouter from '../backend/routes/admin.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

/* ── Health check ─── */
app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', dbConnected: true, env: 'vercel' });
    } catch (e) {
        console.error('[health]', e.message);
        res.status(500).json({ status: 'error', dbConnected: false });
    }
});

app.use('/api/auth',         authRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/kyc-clients',  kycRouter);
app.use('/api/vault',        vaultRouter);
app.use('/api/rates',        ratesRouter);
app.use('/api/config',       configRouter);
app.use('/api/admin',        adminRouter);

/* ── Gestionnaire d'erreurs global ── */
app.use((err, req, res, next) => {
    console.error('[api]', err);
    res.status(500).json({ error: 'Erreur serveur inattendue.' });
});

export default app;
