import rateLimit from 'express-rate-limit';

/* Limite en mémoire par instance de fonction — sur Vercel serverless, chaque instance
   a son propre compteur (pas de store partagé), donc ce n'est pas une protection
   distribuée parfaite. Elle reste utile en défense en profondeur : elle relève la
   barre contre un client qui martèle une même instance chaude, en complément du
   verrou anti-bruteforce déjà en base (par guichetier, voir routes/auth.js). */

const jsonRateLimitHandler = (req, res) => {
    res.status(429).json({ error: 'Trop de requêtes. Réessayez dans quelques instants.' });
};

/** Routes publiques d'authentification : limite l'énumération de guichetiers/agences
 *  et le bourrage de tentatives de connexion au niveau de l'endpoint lui-même. */
export const authRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler,
});

/** Provisioning d'agence : déjà protégé par ADMIN_SECRET, limite additionnelle
 *  pour ralentir un secret compromis ou une erreur de script. */
export const adminRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler,
});

/** Routes métier authentifiées (transactions, KYC, caisse, taux, config) : limite
 *  généreuse pour ne jamais gêner un usage normal (rafraîchissement 20s inclus). */
export const businessRateLimit = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: jsonRateLimitHandler,
});
