#!/usr/bin/env node
/**
 * create-invitation.mjs
 *
 * Crea una nueva invitación reutilizando el InvitationTemplateComponent.
 *
 * USO:
 *   node scripts/create-invitation.mjs <slug> <partner1Name> <partner2Name>
 *
 * EJEMPLO:
 *   node scripts/create-invitation.mjs maria-pedro "María" "Pedro"
 *
 * LO QUE HACE:
 *   1. Crea `src/app/components/invitations/<slug>/<slug>.component.ts`
 *      con un wrapper que pasa los datos al InvitationTemplateComponent.
 *   2. Crea `src/assets/<slug>/{covery,gallery,history,music}/`
 *      con un `.gitkeep` en cada subcarpeta para que git las respete.
 *   3. Añade una entrada `path: '<slug>'` al `src/app/app.routes.ts`
 *      apuntando al wrapper.
 *
 * El resultado es una invitación nueva visible en `/<slug>` con su
 * web inicial lista para personalizar (subir fotos, cambiar textos, etc.).
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

// --- Args ---
const [, , rawSlug, rawP1, rawP2] = process.argv;

if (!rawSlug || !rawP1 || !rawP2) {
  console.error(
    '\n❌ Faltan argumentos.\n' +
      '   Uso: node scripts/create-invitation.mjs <slug> <partner1Name> <partner2Name>\n' +
      '   Ej:  node scripts/create-invitation.mjs maria-pedro "María" "Pedro"\n',
  );
  process.exit(1);
}

// --- Normalización ---
const slug = rawSlug
  .toString()
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

if (!slug) {
  console.error(`❌ El slug "${rawSlug}" no produce un identificador válido.`);
  process.exit(1);
}

if (slug !== rawSlug) {
  console.log(`ℹ️  Slug normalizado: "${rawSlug}" → "${slug}"`);
}

const partner1Name = rawP1.trim();
const partner2Name = rawP2.trim();

if (!partner1Name || !partner2Name) {
  console.error('❌ Los nombres no pueden estar vacíos.');
  process.exit(1);
}

// --- Derivados ---
// kebab-case → PascalCase para el nombre de la clase
const pascal = slug
  .split('-')
  .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
  .join('');

const ComponentClass = `${pascal}Component`;
const ComponentFileName = `${slug}.component.ts`;
const componentDir = path.join(
  ROOT,
  'src/app/components/invitations',
  slug,
);
const componentFile = path.join(componentDir, ComponentFileName);

// --- Guards ---
if (existsSync(componentFile)) {
  console.error(`❌ Ya existe el componente: ${componentFile}`);
  process.exit(1);
}

const routesFile = path.join(ROOT, 'src/app/app.routes.ts');
const routesContent = await readFile(routesFile, 'utf8');

if (routesContent.includes(`path: '${slug}'`)) {
  console.error(`❌ Ya existe una ruta para "${slug}" en app.routes.ts.`);
  process.exit(1);
}

// --- 1. Crear wrapper component ---
await mkdir(componentDir, { recursive: true });

const componentTs = `import { ChangeDetectionStrategy, Component } from '@angular/core';
import { InvitationTemplateComponent } from '../invitation-template/invitation-template.component';

/**
 * Wrapper para la invitación de ${partner1Name} & ${partner2Name}.
 *
 * Toda la lógica y el layout viven en \`InvitationTemplateComponent\`.
 * Este componente solo aporta los datos concretos de esta boda
 * (slug + nombres) y se mantiene para enrutar \`/${slug}\` desde
 * \`app.routes.ts\`.
 */
@Component({
  selector: 'app-${slug}-invitation',
  standalone: true,
  imports: [InvitationTemplateComponent],
  template: \`
    <app-invitation-template
      slug="${slug}"
      partner1Name="${partner1Name}"
      partner2Name="${partner2Name}"
    />
  \`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ${ComponentClass} {}
`;

await writeFile(componentFile, componentTs, 'utf8');
console.log(`✅ Componente wrapper: src/app/components/invitations/${slug}/${ComponentFileName}`);

// --- 2. Crear estructura de assets ---
const assetsRoot = path.join(ROOT, 'src/assets', slug);
const assetSubs = ['covery', 'gallery', 'history', 'music'];
for (const sub of assetSubs) {
  const subDir = path.join(assetsRoot, sub);
  await mkdir(subDir, { recursive: true });
  // .gitkeep para que git respete las carpetas aunque estén vacías
  const gitkeep = path.join(subDir, '.gitkeep');
  if (!existsSync(gitkeep)) {
    await writeFile(gitkeep, '', 'utf8');
  }
}
console.log(`✅ Assets: src/assets/${slug}/{${assetSubs.join(',')}}/  (.gitkeep en cada una)`);

// --- 3. Añadir ruta al app.routes.ts ---
// Insertamos antes del bloque `path: ':tenant'` para mantener orden
// (rutas específicas antes que la genérica).
//
// Importante: detectamos el line-ending del archivo (LF vs CRLF) para que
// el marker funcione tanto en Linux/macOS como en Windows.
const EOL = routesContent.includes('\r\n') ? '\r\n' : '\n';

const routeEntry =
  `  {${EOL}` +
  `    path: '${slug}',${EOL}` +
  `    loadComponent: () =>${EOL}` +
  `      import('./components/invitations/${slug}/${ComponentFileName.replace('.ts', '')}').then(${EOL}` +
  `        (m) => m.${ComponentClass},${EOL}` +
  `      ),${EOL}` +
  `  },${EOL}`;

const tenantMarker = `  {${EOL}    path: ':tenant',`;
if (!routesContent.includes("path: ':tenant'")) {
  console.warn(
    '⚠️  No se encontró la ruta ":tenant" en app.routes.ts; añado la nueva al final del array.',
  );
  const closingPattern = new RegExp(
    `}\\s*;\\s*${EOL}\\s*$`,
    'g',
  );
  const updated = routesContent.replace(
    closingPattern,
    `${routeEntry}};${EOL}`,
  );
  await writeFile(routesFile, updated, 'utf8');
} else {
  const updated = routesContent.replace(
    tenantMarker,
    `${routeEntry}${tenantMarker}`,
  );
  await writeFile(routesFile, updated, 'utf8');
}
console.log(`✅ Ruta añadida en src/app/app.routes.ts:  /${slug}`);

console.log(`\n🎉 Invitación "${slug}" lista.`);
console.log(`   URL pública una vez hecho build:  /${slug}`);
console.log(
  `   Próximos pasos:\n` +
    `     1. Sube la foto de portada a  src/assets/${slug}/covery/hero.jpeg\n` +
    `     2. Sube la canción a           src/assets/${slug}/music/background-music.mp3\n` +
    `     3. Sube las fotos de history/  y gallery/\n` +
    `     4. Personaliza el dashboard de la pareja si quieres más control.\n`,
);
