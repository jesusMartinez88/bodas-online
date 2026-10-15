#!/usr/bin/env node

/**
 * Script para sincronizar la versión del package.json con:
 * - package-lock.json
 * - public/sw.js
 *
 * Nota: version.service.ts ya no necesita sincronización porque
 * importa directamente el package.json
 */

const fs = require('fs');
const path = require('path');

// Leer versión del package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

console.log(`📦 Versión actual: ${version}`);

// Actualizar package-lock.json
const packageLockPath = path.join(__dirname, '..', 'package-lock.json');
if (fs.existsSync(packageLockPath)) {
  const packageLock = JSON.parse(fs.readFileSync(packageLockPath, 'utf8'));
  packageLock.version = version;

  // También actualizar la versión en packages[""]
  if (packageLock.packages && packageLock.packages['']) {
    packageLock.packages[''].version = version;
  }

  fs.writeFileSync(packageLockPath, JSON.stringify(packageLock, null, 2) + '\n');
  console.log('✅ package-lock.json actualizado');
} else {
  console.log('⚠️  package-lock.json no encontrado');
}

// Actualizar sw.js
const swPath = path.join(__dirname, '..', 'public', 'sw.js');
let swContent = fs.readFileSync(swPath, 'utf8');
swContent = swContent.replace(
  /const CACHE_NAME = 'tu-boda-online-v[^']*';/,
  `const CACHE_NAME = 'tu-boda-online-v${version}';`,
);
fs.writeFileSync(swPath, swContent);
console.log('✅ sw.js actualizado');

console.log('✅ version.service.ts lee directamente de package.json (no requiere sincronización)');
console.log('🎉 Versión sincronizada correctamente');
