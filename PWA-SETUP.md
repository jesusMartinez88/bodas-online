# Configuración PWA - Boda Judith & Jesús

## ✅ Implementado

1. **Service Worker** (`public/sw.js`)
   - Caché de recursos estáticos
   - Estrategia Network First con fallback a caché
   - Actualización automática de versiones

2. **Manifest** (`public/manifest.json`)
   - Configuración de la app instalable
   - Iconos y colores del tema
   - Modo standalone

3. **Servicio PWA** (`src/app/services/pwa.service.ts`)
   - Detección de instalación
   - Prompt de instalación automático
   - Detección de actualizaciones
   - Verificación cada hora de nuevas versiones

4. **Componente de Prompts** (`src/app/components/pwa-prompt/`)
   - UI para instalación
   - UI para actualizaciones
   - Diseño responsive y acorde con la app

## 🎯 Funcionalidades

### Instalación

- Solo se muestra en dispositivos móviles o pantallas pequeñas (< 1024px)
- Solo se activa después de un login exitoso
- Detecta automáticamente si la app no está instalada
- Muestra un prompt elegante 3 segundos después del login
- El usuario puede instalar o rechazar
- Si rechaza, no se vuelve a mostrar por 24 horas

### Actualizaciones

- Verifica actualizaciones cada hora
- Cuando hay nueva versión, muestra un prompt
- El usuario puede actualizar inmediatamente o más tarde
- Al actualizar, recarga la página con la nueva versión

## 🔄 Cómo actualizar la versión

Para lanzar una nueva versión:

1. Edita `public/sw.js`
2. Cambia `CACHE_NAME` a una nueva versión:
   ```javascript
   const CACHE_NAME = 'bodas-online-v2.0.0'; // Incrementar versión
   ```
3. Haz build y deploy
4. Los usuarios verán automáticamente el prompt de actualización

## 📱 Iconos recomendados

Para mejor compatibilidad, se recomienda añadir iconos PNG:

```bash
# Crear iconos en diferentes tamaños
public/icons/
  - icon-72x72.png
  - icon-96x96.png
  - icon-128x128.png
  - icon-144x144.png
  - icon-152x152.png
  - icon-192x192.png
  - icon-384x384.png
  - icon-512x512.png
```

Luego actualizar `public/manifest.json` con estos iconos.

## 🧪 Probar la PWA

### En desarrollo:

```bash
npm run build
npx http-server dist/bodas-online/browser -p 8080
```

### En Chrome DevTools:

1. Abre DevTools (F12)
2. Ve a Application > Service Workers
3. Ve a Application > Manifest
4. Prueba "Add to Home Screen"

### En móvil:

1. Abre la app en Chrome/Safari
2. Espera 3 segundos
3. Verás el prompt de instalación
4. Instala y prueba

## 🚀 Deploy

El service worker solo funciona en:

- HTTPS (producción)
- localhost (desarrollo)

Asegúrate de que tu servidor sirva los archivos con HTTPS.
