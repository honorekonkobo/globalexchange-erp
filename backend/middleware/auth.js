import jwt from 'jsonwebtoken';

/** Vérifie le JWT (en-tête Authorization: Bearer ...) et attache req.cashier */
export function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
        return res.status(401).json({ error: 'Authentification requise.' });
    }

    try {
        /* Algorithme fixé explicitement (défense en profondeur contre une
           éventuelle attaque par confusion d'algorithme sur le jeton) */
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.cashier = { id: payload.sub, agencyId: payload.agencyId, name: payload.name, counter: payload.counter };
        next();
    } catch {
        return res.status(401).json({ error: 'Session invalide ou expirée.' });
    }
}
