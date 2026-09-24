import helmet from 'helmet';

/* En-têtes de sécurité HTTP. La CSP est contrainte par l'existant : le frontend
   utilise des attributs onclick="" partout et un <script> inline pour la config
   Tailwind — un 'unsafe-inline' sur script-src reste donc nécessaire (une refonte
   en nonces/handlers addEventListener est un chantier séparé, pas un correctif
   de sécurité ponctuel). La valeur réelle ici : bloquer le chargement de tout
   script/style venant d'un hôte hors liste blanche, et interdire le framing
   (clickjacking) via frame-ancestors 'none'.
   crossOriginEmbedderPolicy désactivé : cdn.tailwindcss.com ne renvoie pas
   d'en-tête CORS (déjà noté ailleurs dans le code, cf. SRI impossible sur ce
   CDN) — le COEP par défaut de helmet bloquerait son chargement. */
export const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdn.jsdelivr.net'],
            /* Directive distincte de script-src, prioritaire pour les attributs
               onclick="" — helmet la met à 'none' par défaut, ce qui casserait
               tous les boutons de l'app (elle en dépend partout). */
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            imgSrc: ["'self'", 'data:', 'https://images.unsplash.com'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            frameAncestors: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
});
