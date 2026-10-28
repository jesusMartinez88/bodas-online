import type { NextFunction, Request, Response } from 'express';

/**
 * Cabeceras de seguridad del frontend.
 *
 * Este middleware corre en el servidor SSR (`server.ts`). En producción el
 * sitio se sirve como Render **Static Site**, así que el CDN no ejecuta este
 * código: las mismas cabeceras se definen en `render.yaml` (bloque
 * `headers:`). Mantener ambos ficheros en sync evita que la CSP se rompa si
 * algún día se despliega como Web Service.
 *
 * La CSP incluye exactamente los orígenes que la app usa de verdad:
 * Stripe (script/connect/frame), Google Fonts (style/font), YouTube
 * (script/frame/connect/img), el backend propio (connect) y los tiles de
 * OpenStreetMap vía `img-src https:`.
 *
 * `script-src` va SIN `'unsafe-inline'` y `script-src-attr` va en `'none'`,
 * así que ni los scripts inline ni los handlers en atributos (`onclick=…`,
 * `onerror=…`) se ejecutan. Dos consecuencias que el build DEBE respetar:
 *
 *   1. `optimization.styles.inlineCritical` tiene que seguir en `false` en
 *      `angular.json`. Con el inlining de CSS crítico activo, Beasties emite
 *      un `<script>` inline que es el que activa (`media="all"`) la hoja de
 *      estilos global diferida. La CSP lo bloqueaba y el CSS global (leaflet,
 *      drag & drop de CDK, utilidades de Tailwind) no se aplicaba NUNCA: el
 *      mapa salía roto. Sin critical CSS no hay script inline y la CSP
 *      puede seguir siendo estricta.
 *   2. Los handlers en atributos se expresan con bindings de Angular
 *      (`(error)="…"`), nunca con `onerror="…"` en la plantilla.
 *
 * Stripe (https://docs.stripe.com/security/guide):
 *   · `https://*.js.stripe.com` en script-src y frame-src permite que
 *     Stripe.js arranque frames en orígenes distintos (lo recomienda la
 *     propia documentación de Stripe).
 *   · `https://q.stripe.com` en connect-src es el origen al que Stripe.js
 *     hace XHR; sin él el navegador bloquea la conexión.
 *   · `hooks.stripe.com` es el frame del Payment Element y del challenge
 *     3-D Secure. Con `redirect: 'if_required'` (ver payment.service.ts) el
 *     challenge se renderiza dentro de la propia página de Stripe, así que
 *     no hace falta `https://*.3dsecure.io`. Si algún día el 3DS se
 *     embebiera en un modal propio, habría que añadirlo a frame-src.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://js.stripe.com https://*.js.stripe.com https://www.youtube.com https://s.ytimg.com",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://boda-backend-4e6z.onrender.com https://api.stripe.com https://q.stripe.com https://www.googleapis.com",
  "frame-src 'self' https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://www.youtube.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self), browsing-topics=()',
  );
  response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
