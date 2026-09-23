import pg from 'pg';
import 'dotenv/config';

/* En production (Supabase, Railway, ...), la base est distante et présente
   un certificat non vérifiable par la chaîne de confiance par défaut de Node —
   ssl est requis pour s'y connecter, mais inutile/absent en local. */
const ssl = process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false;

/** Pool de connexions PostgreSQL partagé par toute l'application */
export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
});

pool.on('error', (err) => {
    console.error('[db] Erreur inattendue sur une connexion inactive du pool :', err);
});
