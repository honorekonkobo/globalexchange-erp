import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { pool } from '../pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Guichetiers de départ, PIN par défaut 1234 (à personnaliser ensuite par chacun) */
const SEED_CASHIERS = [
    { name: 'Aïcha Ouédraogo',    counter: '#02' },
    { name: 'Jean-Marc Sawadogo', counter: '#01' },
    { name: 'Mamadou Diallo',     counter: '#03' },
    { name: 'Fatou Kaboré',       counter: '#04' },
];
const DEFAULT_PIN = '1234';

async function ensureMigrationsTable() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
            filename    TEXT PRIMARY KEY,
            applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    `);
}

async function runSqlMigrations() {
    const dir = __dirname;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [file]);
        if (rows.length) {
            console.log(`[migrate] déjà appliquée : ${file}`);
            continue;
        }

        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        console.log(`[migrate] application de ${file}...`);
        await pool.query(sql);
        await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
        console.log(`[migrate] ${file} appliquée.`);
    }
}

/** Seed réservé à l'agence de démonstration (id 1, créée par 003_multi_tenancy.sql) ;
 *  les agences suivantes sont provisionnées via POST /api/admin/agencies, pas ici. */
async function seedCashiers() {
    const { rows } = await pool.query(`SELECT 1 FROM information_schema.columns
        WHERE table_name = 'cashiers' AND column_name = 'agency_id'`);
    if (!rows.length) {
        console.log('[migrate] table cashiers sans agency_id (migration 003 pas encore appliquée) — seed ignoré.');
        return;
    }

    const pinHash = await bcrypt.hash(DEFAULT_PIN, 10);

    for (const c of SEED_CASHIERS) {
        await pool.query(
            `INSERT INTO cashiers (agency_id, name, counter, pin_hash)
             VALUES (1, $1, $2, $3)
             ON CONFLICT (agency_id, counter) DO NOTHING`,
            [c.name, c.counter, pinHash]
        );
    }
    console.log(`[migrate] ${SEED_CASHIERS.length} guichetiers vérifiés/créés pour l'agence de démo (PIN par défaut : ${DEFAULT_PIN}).`);
}

async function main() {
    await ensureMigrationsTable();
    await runSqlMigrations();
    await seedCashiers();
    await pool.end();
    console.log('[migrate] terminé.');
}

main().catch((err) => {
    console.error('[migrate] échec :', err);
    process.exit(1);
});
