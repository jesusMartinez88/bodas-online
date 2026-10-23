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
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' https://js.stripe.com https://www.youtube.com https://s.ytimg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://boda-backend-4e6z.onrender.com https://api.stripe.com https://www.googleapis.com",
  "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://www.youtube.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  'upgrade-insecure-requests',
].join('; ');

export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.setHeader('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self)');
  response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
}
