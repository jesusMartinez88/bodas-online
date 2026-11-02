# Configuración PWA - Tu Boda Online

## ✅ Implementado

1. **Service Worker** (`public/sw.js`)
   - Caché de recursos estáticos (incluye manifest e iconos)
   - Estrategia Network First con fallback a caché
   - Actualización automática de versiones

2. **Manifest** (`public/manifest.json`)
   - Configuración de la app instalable
   - Iconos PNG de 192 y 512 px + icono `maskable` para Android
   - Modo standalone

3. **Servicio PWA** (`src/app/services/pwa.service.ts`)
   - Detección de instalación (standalone / fullscreen / minimal-ui)
   - Aviso de instalación automático
   - Detección de actualizaciones
   - Verificación cada hora de nuevas versiones
   - Guía manual de instalación para iOS

4. **Componente de Prompts** (`src/app/components/pwa-prompt/`)
   - UI para instalación (Chromium) y guía manual (iOS)
   - UI para actualizaciones
   - Diseño responsive y acorde con la app

5. **Banner de instalación** (`src/app/shared/components/install-banner/`)
   - Recordatorio permanente sobre el título de la sección del panel
   - Con X para cerrarlo durante la sesión
   - Se inserta en el dashboard y en el panel de administración

## 🎯 Funcionalidades

### Cuándo se ofrece la instalación

El aviso aparece cuando se cumplen **las dos** condiciones:

1. El usuario **está autenticado** (no solo cuando escribe su contraseña).
2. El navegador puede instalar la app:
   - **Chromium** (Chrome, Edge, Samsung Internet): el evento
     `beforeinstallprompt` ha llegado.
   - **iOS / iPadOS**: se muestra la guía manual, porque en WebKit ese
     evento no existe y no hay diálogo de instalación.

Da igual el orden en que lleguen: el servicio se queda esperando el
evento del navegador y el estado de sesión, y en cuanto tiene ambos,
enseña el aviso (3 segundos después).

> Antes el aviso solo se disparaba tras un login manual **y** el
> componente lo pintaba únicamente en rutas `/dashboard`, que no existen
> (el panel cuelga de `/:tenant/dashboard` y el admin de
> `/admin/users`). Por eso no se veía nunca.

### Dónde se muestra

Solo dentro de las zonas de la app:

- `/:tenant/dashboard` — panel de la pareja
- `/admin/users` — panel de administración

En la landing, las invitaciones públicas y el resto de páginas no se
muestra: son páginas de visita, no de uso de la app.

### El modal y el banner

Hay **dos** avisos, con papeles distintos:

| | Modal | Banner |
|---|---|---|
| Cuándo | Una vez, 3 s después del login | Siempre, hasta que la app se instale |
| Dónde | Por encima de toda la pantalla | Sobre el título de la sección del panel |
| Al pulsarlo | «Ahora no» → no vuelve en **24 h** | La **X** → se oculta **solo en esta sesión** |
| Al recargar | No vuelve (durante 24 h) | **Vuelve a aparecer** |

El banner es el recordatorio permanente: el modal pregunta una vez y se
calla, pero el banner se queda en su sitio hasta que la app queda
instalada. Cerrarlo con la X **no** se guarda en `localStorage`, así que
al recargar la página vuelve a aparecer.

Los dos nunca se muestran a la vez: cuando el modal está visible (o
esperando sus 3 segundos), el banner se aparta.

> En el dashboard, por debajo de 1024 px hay un botón de menú flotante en
> la esquina superior derecha. El banner reserva ese hueco para que no
> tape su X de cerrar.

### Otras reglas

- Se muestra en **móvil y escritorio** (Chrome y Edge ya soportan
  instalar en escritorio).
- Si el usuario lo rechaza, no se vuelve a mostrar durante **24 horas**.
- Si la app ya está instalada, no se ofrece.
- Se cierra con `Escape` y el foco entra en el diálogo al abrirlo.

### En iOS

Safari en iPhone/iPad no implementa `beforeinstallprompt` (WebKit cerró
la petición en 2019), así que no hay forma de abrir el diálogo de
instalación desde la web. La app lo explica con los pasos:

1. Pulsa el botón **Compartir** de la barra del navegador.
2. Elige **Añadir a pantalla de inicio**.
3. Confirma pulsando **Añadir**.

## 🔄 Cómo actualizar la versión

Para lanzar una nueva versión:

1. Edita `public/sw.js`
2. Cambia `CACHE_NAME` a una nueva versión:
   ```javascript
   const CACHE_NAME = 'tu-boda-online-v2.0.0'; // Incrementar versión
   ```
3. Haz build y deploy
4. Los usuarios verán automáticamente el prompt de actualización

El `CACHE_NAME` se sincroniza con la versión de `package.json`:
```bash
npm run version:sync
```

## 📱 Iconos

Los iconos PNG viven en `public/icons/` y se generan a partir de
`public/favicon.svg`:

| Archivo | Tamaño | Uso |
|---|---|---|
| `icon-192.png` | 192×192 | Instalación (Chromium) |
| `icon-512.png` | 512×512 | Instalación (Chromium) |
| `icon-maskable-512.png` | 512×512 | Lanzador Android (recorte adaptativo) |
| `apple-touch-icon-180.png` | 180×180 | iOS (no admite SVG) |

## 🧪 Probar la PWA

### En desarrollo:

```bash
npm run build
npx http-server dist/tu-boda-online/browser -p 8080
```

> El service worker **no** se registra en el servidor de desarrollo de
> Angular (`ng serve` en el puerto 4200) para no cachear lo que se está
> recompilando. En cualquier otro puerto sí se registra, así que el
> flujo de instalación se puede probar en local.

### En Chrome DevTools:

1. Abre DevTools (F12)
2. Ve a Application > Service Workers
3. Ve a Application > Manifest
4. Prueba "Add to Home Screen"

### En móvil:

1. Abre la app en Chrome/Safari
2. Inicia sesión
3. Entra a tu panel
4. Verás el aviso de instalación

> Chrome exige "engagement" antes de disparar `beforeinstallprompt`:
> si no ocurre nada a la primera visita, haz un clic en la página y
> recarga. En el panel de Application > Manifest, Chrome indica los
> errores de instalabilidad que queden.

## 🚀 Deploy

El service worker solo funciona en:

- HTTPS (producción)
- localhost (desarrollo)

Asegúrate de que tu servidor sirva los archivos con HTTPS.
