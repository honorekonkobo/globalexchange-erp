/** Évite de répéter try/catch dans chaque route asynchrone : transmet les erreurs à Express */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
