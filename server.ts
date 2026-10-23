import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { securityHeaders } from './src/app/services/security-headers';

const serverDistFolder = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app = express();
app.use(securityHeaders);

// `AngularNodeAppEngine` valida el host de cada petición contra una lista
// de hosts permitidos para prevenir SSRF. Por defecto, en producción
// la lista es estricta; en dev localhost/127.0.0.1 deben ir explícitos.
// `NG_ALLOWED_HOSTS` lo inyecta el builder desde `angular.json`
// (`projects.*.architect.build.options.security.allowedHosts`),
// o se puede pasar por env en el deploy.
const allowedHosts = (process.env['NG_ALLOWED_HOSTS'] ?? 'localhost,127.0.0.1')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const angularApp = new AngularNodeAppEngine({ allowedHosts });

// Servir los assets estáticos del cliente (JS, CSS, imágenes, etc.)
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index: false,
    redirect: false,
  }),
);

// Cualquier request que no sea un asset estático pasa al motor de Angular SSR.
// El motor decide si la ruta es SSR, CSR o SSG según la config de serverRoutes.
const reqHandler = createNodeRequestHandler((req, res, next) => {
  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

const ASSET_PATH = /\.(?:js|mjs|cjs|css|map|json|txt|xml|ico|png|jpe?g|gif|svg|webp|avif|woff2?|ttf|eot)$/i;

app.use((req, res, next) => {
  if (ASSET_PATH.test(req.path)) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }
  next();
});

app.use(reqHandler);

if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export { reqHandler };
export default app;
