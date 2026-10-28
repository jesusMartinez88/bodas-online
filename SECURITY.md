# Modelo de seguridad — Tu Boda Online

Documento de referencia del estado de las cabeceras y reglas de despliegue tras
la revisión de seguridad de octubre de 2026. Describe **lo que está desplegado
en producción y por qué**, para que nadie tenga que volver a descubrirlo a base
de `curl`.

- **Frontend (sitio público):** `https://tubodaonline.onrender.com` — Render **Static Site**, CDN de Render + Cloudflare.
- **Backend (API):** `https://boda-backend-4e6z.onrender.com` — Render Web Service (Node + Express).
- **Config declarativa de infraestructura:** [`render.yaml`](./render.yaml) (frontend). Valida contra el schema oficial de Render.

---

## 1. Cabeceras de seguridad del frontend

Definidas en `render.yaml` → `services[0].headers` y aplicadas en el Dashboard
de Render (*Settings → Headers*). Verificadas en producción con `curl -I`.

| Cabecera | Valor | Estado |
|---|---|---|
| `Content-Security-Policy` | `default-src 'self'` + `frame-ancestors 'none'` + allowlist de Stripe / Google Fonts / YouTube / backend | ✅ aplicada |
| `X-Frame-Options` | `DENY` | ✅ aplicada |
| `X-Content-Type-Options` | `nosniff` | ✅ aplicada |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | ✅ aplicada |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self), browsing-topics=()` | ✅ aplicada |
| `Cache-Control` (`/index.html`) | `no-cache, no-store, must-revalidate` | ✅ aplicada |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | ⚠️ ver §3 |

### Origenes permitidos por la CSP

| Origen | Para qué | Directiva |
|---|---|---|
| `js.stripe.com` | Payment Element (script) | `script-src`, `frame-src` |
| `*.js.stripe.com` | Stripe.js arrancando frames en otros orígenes (recomendado por Stripe) | `script-src`, `frame-src` |
| `api.stripe.com` | API de Stripe (confirmación de pago) | `connect-src` |
| `q.stripe.com` | XHR que hace Stripe.js | `connect-src` |
| `hooks.stripe.com` | 3-D Secure | `frame-src` |
| `fonts.googleapis.com` | Material Symbols + tipografías | `style-src` |
| `fonts.gstatic.com` | ficheros de fuente | `font-src` |
| `www.youtube.com`, `s.ytimg.com` | reproductor de música (YouTube IFrame API) | `script-src`, `frame-src` |
| `www.googleapis.com` | YouTube Data API | `connect-src` |
| `boda-backend-4e6z.onrender.com` | API propia | `connect-src` |
| `https:` (wildcard) | tiles de OpenStreetMap, thumbnails de YouTube, imágenes del usuario | `img-src` |

> Al añadir un dominio externo nuevo hay que tocar **las dos copias** de la CSP:
> `render.yaml` (lo que sirve el CDN) y `src/app/services/security-headers.ts`
> (lo que sirve el SSR). Mantenerlas en sync evita que la app se rompa al
> cambiar de tipo de despliegue. **Ahora la sincronía se comprueba
> automáticamente**: `src/app/services/security-headers.spec.ts` compara ambas
> CSP y falla si divergen.

---

## 2. Reglas de reescritura y el "soft 404" de Render

### Qué hace el sitio

`render.yaml` declara 38 reglas de reescritura (19 extensiones × raíz + anidados)
y un catch-all final:

```yaml
routes:
  - type: rewrite
    source: "/*.map"          # (y .json, .xml, .svg, .webp, .avif, .ico,
    destination: "/__asset_not_found__.png"   #  .webm, .woff, .woff2, .ttf,
  ...                                             #  .eot, .js, .css, .txt,
  - type: rewrite                                #  .jpg, .gif, .zip, .mp4)
    source: "/*/*.map"                           # (variante anidada)
    destination: "/__asset_not_found__.png"
  - type: rewrite
    source: "/*"
    destination: "/index.html"   # fallback SPA
```

El destino `/__asset_not_found__.png` **no debe existir nunca** y la extensión
`.png` **no aparece entre los `source`** a propósito: si existiera una regla
`/*.png`, el destino volvería a evaluarse contra la lista (bucle).

### Comportamiento medido en producción (2026-10-26)

Barrido de 52 extensiones contra el sitio desplegado:

| Respuesta | Extensiones |
|---|---|
| **404 real** (página 404 de Render) | `js` `css` `txt` `png` `jpg` `gif` `zip` `mp4` `pdf` `doc` `mp3` `mov` `rar` `tiff` |
| **200 con cuerpo vacío** (`Content-Length: 0`) | `map` `json` `xml` `svg` `webp` `avif` `ico` `webm` `woff` `woff2` `ttf` `eot` |
| **200 index.html** (catch-all SPA) | rutas sin punto y extensiones no estándar (`csv`, `wasm`, `docx`, …) |

### Por qué el 200 con cuerpo vacío no se puede eliminar

Ese 200 vacío depende **solo de la extensión de la ruta**, no del `destination`:
todas las reglas comparten destination y el resultado cambia igualmente según la
extensión. Es el "soft 404" nativo de Render para esos MIME types.

**Aun así, el objetivo real del hallazgo está cumplido.** Antes de las reglas:

```
GET /main-inexistente.js.map  →  200  text/html   (83 KB de index.html)
```

Es decir, el CDN cacheaba **HTML** donde el cliente esperaba JS/JSON. Eso
envenenaba la caché, rompía la detección de enlaces rotos y hacía que las
herramientas vieran HTML válido. Ahora:

```
GET /main-inexistente.js.map  →  200  Content-Length: 0   (nunca HTML)
GET /foo.js                    →  404  (404 real de Render)
```

Ninguna ruta de asset inexistente devuelve HTML. El riesgo residual es
prácticamente nulo: 0 bytes, sin `Content-Type`, sin HTML, sin contenido que
pueda inyectarse.

### Ruta alternativa: Web Service con SSR

Si en algún momento se quiere un 404 **estricto** para todas las extensiones,
la vía es dejar de usar Static Site y desplegar el servidor SSR que ya existe
en el repo (`server.ts`, `outputMode: server` en `angular.json`). Ese servidor
ya tiene:

- `src/app/services/security-headers.ts` → las mismas cabeceras que el CDN.
- Un middleware que devuelve **404 real** para cualquier ruta con extensión de
  asset que no exista, en lugar de caer en el fallback SPA.

Coste: un servicio siempre activo (en lugar de un CDN estático gratuito) y
cold starts. Por eso la vía por defecto sigue siendo el Static Site.

---

## 3. HSTS: 10 años en el frontend, 1 año en el backend

**Decisión consciente, documentada aquí.** No es un descuido.

| Host | HSTS | Quién lo pone |
|---|---|---|
| `boda-backend-4e6z.onrender.com` | `max-age=31536000; includeSubDomains` (1 año) | Helmet, en `src/app.js` |
| `tubodaonline.onrender.com` | `max-age=315360000; includeSubdomains; preload` (10 años) | **Default de Render**, no se puede sobrescribir |

### Por qué no se puede cambiar el del frontend

Render aplica un `Strict-Transport-Security` propio a todos los Static Sites. Al
añadir una regla de usuario con ese mismo nombre, **Render ignora la regla del
usuario**: la respuesta sigue bringendo únicamente el default de 10 años. No
hay ningún knob en el dashboard ni en el Blueprint para desactivarlo.

Medido el **2026-10-28** sobre `https://tubodaonline.onrender.com/`: la
respuesta trae **una sola** cabecera `strict-transport-security`, la de Render
(`max-age=315360000; includeSubdomains; preload`). Si arrive a servirse la
regla de usuario junto con el default, el navegador se quedaría con la más
restrictiva (10 años) y el valor de 1 año no serviría de nada.

### Por qué no es un problema real

1. **`preload` es un no-op aquí.** El `preload` de HSTS solo es efectivo si el
   dominio está registrado en `hstspreload.org`, y `onrender.com` no lo está
   (ni podría estarlo: no es un dominio que controlemos). El token `preload`
   viaja en la cabecera pero no preload-ea nada.
2. **El riesgo de HSTS es un subdominio hijackado.** `*.onrender.com` es un
   dominio compartido de Render: si alguien squatara un subdominio de Render y
   sirviera un certificado válido, el `includeSubDomains` de 10 años sí podría
   importar a un visitante de `tubodaonline.onrender.com`… **pero ese visitante
   ya estaba en un host de Render, con lo que el riesgo es idéntico con 1 año
   que con 10.** El `includeSubDomains` no amplifica nada aquí: los subdominios
   de `tubodaonline.onrender.com` no existen.
3. **El que sí importa, el tuyo, está en 1 año.** El backend, donde vive la
   API con datos personales, tiene HSTS de 1 año (`includeSubDomains: true`,
   `preload: false`), alineado con la recomendación de la revisión.

### Cómo revisarlo

```bash
curl -I https://tubodaonline.onrender.com/ | grep -i strict-transport
curl -I https://boda-backend-4e6z.onrender.com/health | grep -i strict-transport
```

Si en el futuro Render permite sobrescribir el default, la regla ya está
preparada en `render.yaml` (`max-age=31536000; includeSubDomains`) y basta con
aplicarla — en el Dashboard (el servicio actual se creó desde ahí, no desde el
Blueprint) y comprobar con el `curl` de arriba que el valor efectivo pasa a ser
`31536000`.

---

## 4. Canal de reporte de vulnerabilidades

`public/.well-known/security.txt` (RFC 9116), servido en:

```
https://tubodaonline.onrender.com/.well-known/security.txt
```

```
Contact: mailto:jesusmartinezsanchez9@gmail.com
Expires: 2027-10-23T00:00:00.000Z
Preferred-Languages: es, en
Canonical: https://tubodaonline.onrender.com/.well-known/security.txt
```

Se sirve desde `public/.well-known/`, y `angular.json` declara ese directorio
como asset explícito para que el build no lo descarte por ser un directorio
oculto.

---

## 5. Aislamiento entre tenants (BOLA / IDOR)

> Afecta al **backend** (`bodas-online-backend`), no al frontend. Cerrado en octubre de 2026.

### 5.1 Cómo se resuelve el tenant

Cada petición autenticada atraviesa esta cadena, y **ninguna** de las dos etapas
depende del frontend:

| Etapa | Fichero | Qué hace |
|---|---|---|
| `authenticateJWT` | `src/middleware/auth.js` | Verifica la firma con `JWT_SECRET` y monta `req.user` con el payload `{ id, username, role, slug, paidAt }` |
| `resolveUserContext` | `src/middleware/resolveUserContext.js` | Resuelve el `slug` → `findBySlug(slug)` y monta `req.userContext = { userId, slug }` |

`resolveUserContext` prioriza `req.params.userSlug` (rutas públicas con slug en la
URL) y, si no existe, `req.user.slug` (rutas privadas). El JWT se firma con el
`slug` leído de la base de datos, así que **el tenant lo decide el servidor, no
el cliente**.

A partir de ahí, **todos** los controladores privados pasan `req.userContext.userId`
a la capa de modelo, y las consultas SQL filtran por `userId`. Los modelos con
`userId` opcional (`guest`, `table`, `todo`, `contact`, `finance`, `category`)
reciben el `userId` explícito desde el controlador, nunca desde el body.

### 5.2 El fallo que se corrigió: código de borrado masivo compartido

`guestController.js` y `tableController.js` guardaban el código de confirmación
del borrado masivo en **variables de módulo**:

```js
let pendingDeleteCode = null;   // ← compartido por TODOS los tenants
let pendingDeleteExpiry = null;
```

Consecuencias reales:

1. **El código de un tenant habilitaba la operación de otro.** El borrado estaba
   acotado a `req.userContext.userId`, así que no se alcanzaban datos ajenos, pero
   el secreto se compartía: el código emitido a A servía para la operación de B.
2. **Pedir un código invalidaba el del otro tenant** (sobrescritura del global).
3. Los códigos de invitados y de mesas **compartían el mismo espacio de nombres**,
   de modo que pedir uno inutilizaba el otro.

**Corrección:** `src/services/deleteCodeService.js` sustituye las variables globales
por un almacén en memoria indexado por `<purpose>:<userId>`:

| Propósito | `DELETE_PURPOSE` | Endpoint |
|---|---|---|
| Borrado masivo de invitados | `GUESTS` | `DELETE /api/guests?code=…` (y `/api/guests/bulk?code=…`) |
| Borrado masivo de mesas | `TABLES` | `DELETE /api/tables?code=…` |

Además, el servicio añade: código de un solo uso, 15 minutos de validez, 5
intentos fallidos antes de invalidarlo, comparación en tiempo constante
(`crypto.timingSafeEqual`) y no se vuelve a enviar el email si el código ya está
vigente y se acaba de enviar (cooldown de 60 s).

### 5.3 Fallo secundario: el borrado masivo de invitados no existía

Al escribir la prueba de aislamiento se descubrió que **la ruta que usa el
frontend nunca llegaba al controlador**:

- El frontend llama `DELETE /api/guests?code=…` (`guest.service.ts`).
- `routes/guests.js` solo declaraba `router.delete("/bulk")`, **después** de
  `router.delete("/:id")` → Express interpretaba `"bulk"` como un id de invitado
  y respondía `404 Guest not found`.
- Y `DELETE /api/guests` (sin `/bulk`) no correspondía a ninguna ruta → 404.

Es decir: la operación de borrar todos los invitados **fallaba siempre**, con
independencia de la seguridad. Se ha añadido `router.delete("/")` y movido
`/bulk` por delante de `/:id`. `/bulk` se mantiene por compatibilidad.

> Regla aprendida: en Express el **orden** de las rutas es parte de la seguridad.
> Una ruta literal (`/bulk`, `/request-delete`) debe declararse antes que una
> paramétrica (`/:id`).

### 5.4 Cobertura de pruebas

`bodas-online-backend/test/tenant-isolation.integration.test.js` — 16 pruebas que
levantan dos tenants reales (A y B) contra la API y comprueban:

- El código de borrado de A **no** habilita el borrado de B (ni al revés).
- Pedir un código en un tenant **no** invalida el del otro.
- El borrado masivo con el código propio **solo** borra datos del propio tenant.
- Los códigos de invitados y de mesas son independientes.
- Un código es de un solo uso y sin código no se borra nada.
- IDOR sobre invitados, mesas, tareas, contactos, finanzas, categorías, playlist
  y ajustes: B no puede leer, editar ni borrar nada de A (403/404).
- B tampoco puede **listar** lo de A (invitados, mesas, contactos, tareas,
  finanzas, categorías, playlist).
- Los listados de cada tenant no mezclan datos.
- Las rutas públicas solo exponen los datos del slug indicado.

Para ejecutarlas:

```bash
cd bodas-online-backend
node --test test/tenant-isolation.integration.test.js
```

Las pruebas se validaron contra el bug: reintroduciendo el estado global en
`deleteCodeService`, los cuatro tests de códigos fallan con `200` donde debe
ser `400`. Es decir, **fallan si el aislamiento se rompe**.

### 5.5 Hallazgo colateral: el limitador general acoplaba los contadores

Al escribir la suite de aislamiento, un test que recibió `429 Too Many Requests`
destapó un defecto en el `generalLimiter` de `src/app.js`:

```js
max: (req) => tieneTokenVálido(req) ? 500 : 100,
keyGenerator: (req) => ipKeyGenerator(req.ip),   // ← un único contador por IP
```

El umbral dependía de si la petición llevaba un JWT válido, pero **el contador
era único por IP**. Consecuencias:

1. **Acoplamiento:** el tráfico público de una IP consumía la cuota del tráfico
   autenticado de esa misma IP (y al revés). Bastaba con que una IP superase las
   100 peticiones públicas para que su siguiente petición *autenticada* se
   aceptara pero cualquier petición *pública* recibiera 429.
2. **CGNAT:** con móviles y redes corporativas, miles de invitados de una boda
   comparten IP pública. Un límite de 100/15 min bloqueaba la web de
   invitaciones en eventos grandes.

**Corrección:** dos contadores independientes por IP, elegidos por la **validez**
del token (no por la presencia de la cabecera):

| Bucket | Peticiones | Límite |
|---|---|---|
| `auth:<ip>` | Con JWT válido | 500 / 15 min |
| `pub:<ip>` | Sin token válido (incluido caducado o manipulado) | 300 / 15 min |

El bucket público subió de 100 a 300 por el motivo de CGNAT descrito. Los
limitadores específicos (`authLimiter` 10/hora en login y registro,
`checkUsernameLimiter`, `contactFormLimiter` 5/15 min) no se han tocado.

### 5.6 Riesgo residual aceptado

Cuando un recurso existe pero pertenece a otro tenant, los controladores
responden **403** (no 404). Eso revela que el recurso existe. Es una fuga de
información menor —no hay acceso al contenido— y el frontend depende del 403.
Si algún día se quiere cerrar del todo, la respuesta correcta es **404
uniforme** para "no existe" y "no es tuyo".

---

## 6. Lo que aún no está resuelto

Estos puntos requieren sesión/credenciales o cambios de arquitectura; **no** son
cabeceras y no se pueden cerrar desde el dashboard de Render.

| # | Asunto | Riesgo | Dónde |
|---|---|---|---|
| 1 | ~~**BOLA / IDOR por tenant**~~ — **cerrado**: los recursos ya filtraban por `userId`; lo que fallaba era el código de borrado masivo compartido. Ver §5 | — | `src/services/deleteCodeService.js`, `test/tenant-isolation.integration.test.js` |
| 2 | ~~**JWT en `localStorage`**~~ — **cerrado**: la sesión viaja en una cookie `httpOnly`; el token ya no se guarda en el navegador ni se devuelve al navegador. Ver §8 | — | `src/services/sessionCookie.js`, `src/app/services/auth.service.ts` |
| 3 | ~~**Verificación de firma del webhook de Stripe**~~ — **cerrado**: la verificación de firma ya existía (`constructEvent` sobre el cuerpo crudo); lo que faltaba era la **idempotencia** (cada reintento de Stripe reenviaba el email de pago), el **500 en los fallos de procesamiento** y las **pruebas**. Ver §11 | — | `src/models/webhookEvent.js`, `src/controllers/paymentController.js`, `test/stripe-webhook.integration.test.js` |
| 4 | **Reset de contraseña por código** — comprobar expiración, uso único y rate limit | Medio | `src/controllers/authController.js` |
| 5 | ~~**Subida de archivos**~~ — **cerrado**: el contenido ya se validaba con `sharp`/magic bytes; lo que faltaba era el filtro de MIME, el rollback atómico y los status correctos. Ver §7.1 | — | `src/middleware/uploadPolicy.js`, `test/upload-security.integration.test.js` |
| 6 | ~~**Enumeración en registro**~~ — **cerrado**: el mensaje ya no confirma el conflicto y la latencia es constante. Ver §7.2 | — | `src/controllers/authController.js`, `test/register-enumeration.integration.test.js` |
| 7 | ~~**CSP en el backend**~~ — **cerrado**: se habían perdido los defaults de Helmet al sobreescribir `directives`, y la allowlist de Stripe estaba incompleta. Ver §7.3 | — | `src/app.js`, `test/csp.integration.test.js` |
| 8 | **Rate limit por `slug` en las rutas públicas de invitación** — hoy el límite es por IP (300/15 min); con CGNAT en un evento con miles de invitados puede saltar | Bajo | `src/routes/guests.js` |
| 9 | **Dominio de envío sin verificar en Resend** — el remitente por defecto es `onboarding@resend.dev`, que **solo permite enviar al email del titular de la cuenta**. Para cualquier otro tenant, los emails (confirmación de invitado, invitaciones, código de borrado) **no salen**. Ver §6, punto 9 | **Alto** | `src/services/emailService.js` |

Los puntos 1, 5, 6 y 7 se cerraron con pruebas de regresión. El detalle está en §5
(aislamiento) y §7 (subidas, enumeración y CSP).

### Punto 9 en detalle: por qué el email no llega en producción

El remitente actual es `Wedding API <onboarding@resend.dev>`. Ese es el dominio
de prueba de Resend y tiene una regla dura:

> *You can only send testing emails to your own email address. To send emails to
> other recipients, please verify a domain at resend.com/domains.*

Consecuencia en producción: **todo el correo saliente falla con 403** para
cualquier tenant cuyo email no sea el del titular de la cuenta Resend. Afecta a:

- Email de confirmación del invitado (`sendGuestConfirmationEmail`).
- Invitación a contactos por email.
- Código de borrado masivo (`sendDeleteCodeEmail`).

Peor: Resend **no lanza** en ese error, devuelve `{ data: null, error: {...} }`.
El servicio lo registraba como "✉️ Email enviado" y el endpoint respondía `200
"Confirmation code sent via email"`. Es decir: **se prometía un envío que nunca
había ocurrido**.

**Lo que ya está corregido en el código:**

1. `src/services/emailService.js` — el remitente ahora sale de la variable de entorno `RESEND_FROM_EMAIL`, con `Tu Boda Online <onboarding@resend.dev>` como valor por defecto. **Basta con definir esa variable en Render** (sin tocar código ni desplegar) para que todos los envíos usen el dominio verificado.
2. `src/services/emailService.js` — un helper `sendEmail()` centraliza el envío y detecta el `result.error` que Resend devuelve **sin lanzar**. Antes, un 403 se reportaba como "✉️ Email enviado" y la función devolvía un valor *truthy*: quien la llamaba daba el envío por hecho. Ahora devuelve `null` y registra el error real.
3. `guestController.js` / `tableController.js` — si el email del código de borrado no se puede enviar, en producción se responde `503` con un mensaje explícito (y se invalida el código emitido), en vez de un `200` que promete un envío que no ocurrió.

**Efecto secundario a tener en cuenta:** el formulario público de contacto
(`POST /api/contact-message`) ya comprobaba el retorno del envío, así que ahora
responde `503` cuando el email no se pudo enviar. Antes mentía con un `200`.

**Lo que falta y hay que hacer a mano** (requiere tu cuenta de Resend):

1. En <https://resend.com/domains>, añadir un dominio propio (p. ej. `mail.tubodaonline.onrender.com` o un dominio que controles) y añadir los registros DNS que indique.
2. En el panel de Render del backend, añadir la variable de entorno:
   `RESEND_FROM_EMAIL="Tu Boda Online <codigo@tu-dominio>"`.
3. Verificar que las plantillas de Resend (si las hay) usan el mismo remitente.

Mientras tanto, conviene revisar si los correos de confirmación e invitaciones
**están saliendo** en producción, porque el síntoma es silencioso.

---

## 7. Subidas de archivos, enumeración y CSP

> Cerrados en octubre de 2026. Afectan al **backend** (`bodas-online-backend`) y,
> en el caso de la CSP, también al **frontend**.

### 7.1 Subida de archivos: el MIME declarado no es una garantía

Lo que ya estaba bien (y se ha mantenido):

| Control | Dónde | Qué hace |
|---|---|---|
| Validación de contenido de imágenes | `invitationMediaController.saveAsWebp` | `sharp` lee la cabecera real y exige JPEG/PNG/WebP; además re-codifica a WebP, así que lo que se sirve **nunca** es el archivo original |
| Límite de píxeles | `saveAsWebp` | `limitInputPixels: 20M` y `failOn: "error"` (corta las imágenes-"bomba") |
| Magic bytes del audio | `invitationMediaController.isMp3` | Exige cabecera `ID3` o frame header MPEG, además del MIME declarado |
| Límites de tamaño y cantidad | `uploadPolicy.js` | 10 MB por imagen, 20 MB de audio, 12 archivos por lote |
| Nombres de archivo del servidor | `uploadController` | UUID + `.webp`; el nombre que envía el cliente se ignora |
| Sin interpretación de HTML | `express.static` + Helmet | `X-Content-Type-Options: nosniff` y `Content-Type` deducido del nombre controlado |

Lo que **faltaba** y se ha corregido:

1. **Filtro de MIME en la ruta** (`src/middleware/uploadPolicy.js`). Ahora un
   `text/html` o un `application/octet-stream` se rechaza con `415` **antes** de
   cargarse en memoria. Es la primera puerta, no la definitiva: la que decide
   sigue siendo la validación de contenido.
2. **Rollback atómico** (`saveAllAsWebp`). Antes, si el tercer archivo de un
   lote de galería fallaba, los dos primeros se quedaban en disco: archivos
   huérfanos que el cliente no conocía y que ocupaban sitio del límite de 12.
   Ahora, si un archivo falla, se borra todo lo guardado en esa petición.
3. **Status correctos.** Los errores de multer (tamaño, número de archivos) se
   atendían solo en la ruta de medios, así que una subida de música que
   excedía el límite devolvía `500` en vez de `413`. Ahora el manejador global
   los traduce a `413`/`400`, y los errores de validación de contenido
   (`415`) llegan al cliente con su mensaje real en vez de "Internal server
   error".

### 7.2 Enumeración en el registro

`POST /api/auth/register` respondía `409 "Username already taken"`: un oráculo
directo de qué cuentas existen (y los usernames son públicos, se derivan del
slug que aparece en las URLs).

Correcciones en `src/controllers/authController.js`:

1. **Mensaje genérico**: `"Registration could not be completed. Please review
   your details and try again."` No confirma que el username exista ni insinúa
   cuál es el problema.
2. **Latencia constante**: el camino "conflicto" hace ahora un `bcrypt.hash`
   descartable (el mismo coste, 10 rondas, que el camino exitoso) y ambas
   respuestas respetan un mínimo de 250 ms. Antes el conflicto se respondía en
   ~1 ms y el registro nuevo en ~100 ms: la diferencia bastaba para enumerar
   midiendo el tiempo.
3. **El frontend da el feedback útil** sin que el backend confirme nada:
   `register.component.ts` re-consulta `check-username` (que ya tiene su propio
   rate limit de 60/15 min por IP y 20/15 min por usuario, más latencia
   constante) y, si el nombre no está disponible, lo dice y marca el campo.

**Riesgo residual aceptado**: el status HTTP sigue distinguiendo `201` de
`409`. Es inevitable (crear o no crear la cuenta) y queda acotado por el
`authLimiter` de 10 peticiones/hora por IP. El endpoint pensado para consultar
disponibilidad es `check-username`, con sus propios límites.

### 7.3 CSP: los defaults de Helmet que se habían perdido

Al pasar `directives` a Helmet, los valores por defecto **se reemplazan**, no
se fusionan. La CSP del backend había perdido así:

| Directiva | Para qué |
|---|---|
| `base-uri 'self'` | Evita la inyección de `<base>` que cambia la ruta base de todas las URLs relativas |
| `form-action 'self'` | Evita que un formulario envíe los datos a otro origen |
| `frame-ancestors 'none'` | Evita el clickjacking sobre las respuestas del backend |
| `script-src-attr 'none'` | Bloquea los scripts en atributos (`onclick=…`) |
| `upgrade-insecure-requests` | Fuerza https en los recursos |

Y la allowlist de Stripe, siguiendo la
[guía oficial de Stripe](https://docs.stripe.com/security/guide), se completa
con:

| Origen | Directiva | Por qué |
|---|---|---|
| `https://*.js.stripe.com` | `script-src`, `frame-src` | Stripe lo recomienda para poder arrancar frames en orígenes distintos |
| `https://q.stripe.com` | `connect-src` | Es el origen al que Stripe.js hace XHR; sin él el navegador bloquea la conexión |
| `https://*.3dsecure.io` | `frame-src` | Cubre el caso de un challenge 3-D Secure embebido en un iframe propio |

**La CSP del frontend también se corrigió** (`render.yaml` y
`src/app/services/security-headers.ts`, que deben quedar idénticas): es la que
gobierna de verdad el checkout de Stripe, porque el backend solo sirve JSON y
medios. Se añadieron `https://*.js.stripe.com` (script-src y frame-src) y
`https://q.stripe.com` (connect-src).

> Nota: con `redirect: 'if_required'` (ver `payment.service.ts`) el challenge
> 3-D Secure se renderiza dentro de la propia página de Stripe, así que
> `https://*.3dsecure.io` no es estrictamente necesario en el frontend. Se
> documenta por si algún día el 3DS se embebe en un modal propio.

### 7.4 Cobertura de pruebas

| Fichero | Qué cubre |
|---|---|
| `test/upload-security.integration.test.js` (8) | MIME declarado ≠ contenido real, SVG con script, MIME no admitido, imagen válida → WebP, atomicidad del lote, magic bytes del MP3, audio válido |
| `test/register-enumeration.integration.test.js` (7) | Mensaje genérico en el conflicto, latencia constante en registro y en `check-username`, login indistinguible entre usuario inexistente y contraseña incorrecta |
| `test/csp.integration.test.js` (4) | Defaults de Helmet presentes, allowlist de Stripe completa, ninguna directiva abierta a `https:`, resto de cabeceras intactas |
| `src/app/services/security-headers.spec.ts` (4) | Cabeceras del frontend, allowlist de Stripe, política no abierta **y sincronía automática con `render.yaml`** |

```bash
cd bodas-online-backend
node --test test/upload-security.integration.test.js
node --test test/register-enumeration.integration.test.js
node --test test/csp.integration.test.js

cd bodas-online
npx vitest run src/app/services/security-headers.spec.ts
```

---

## 8. Sesión en cookie `httpOnly` (sin JWT en `localStorage`)

> Cerrado en octubre de 2026. Afecta al backend y al frontend.

### 8.1 Qué cambió

Antes, el frontend guardaba el JWT en `localStorage` y lo mandaba en
`Authorization: Bearer` en cada petición. Cualquier XSS que se colara en la
página podía **leer el token de `localStorage` y exfiltrarlo**: un token válido
24 h que servía para suplantar al usuario desde cualquier sitio, y que además
sobrevivía a cerrar sesión.

Ahora la sesión vive en una **cookie `httpOnly`** que el JavaScript de la página
no puede leer:

| Pieza | Fichero | Qué hace |
|---|---|---|
| Cookie de sesión | `src/services/sessionCookie.js` | `tb_session` = el JWT, con `httpOnly`, `secure` (en producción), `sameSite=lax`, `path=/`, 24 h |
| Lectura de la cookie | `src/middleware/auth.js` | `authenticateJWT` acepta la cookie **o** la cabecera `Bearer` (esta última para clientes no navegador) |
| Parser de cookies | `src/middleware/cookies.js` | Parser mínimo propio (la API solo lee su propia cookie; no hace falta `cookie-parser`) |
| Cierre de sesión | `POST /api/auth/logout` | Borra la cookie |
| Frontend | `src/app/services/auth.service.ts` | Sin token en memoria ni en `localStorage`; solo el estado del usuario |
| Frontend | `src/app/services/auth.interceptor.ts` | `withCredentials: true` en la API propia, sin cabecera `Authorization` |
| Frontend | `src/app/services/auth.guard.ts` | Guards asíncronos: esperan a `ensureSession()` antes de decidir |
| Frontend | `src/app/app.ts` | Al arrancar, `ensureSession()` rehidrata la sesión desde `/api/auth/me` |

**El token ya no se devuelve al navegador.** La respuesta de login y de registro
solo incluye el campo `token` si la petición **no** trae cabecera `Origin`
(apps móviles, CLI, tests). Un navegador siempre la trae, así que un XSS ya no
puede copiar un token de larga duración reutilizable fuera del navegador.

### 8.2 Por qué no hace falta un token CSRF (y qué lo cubre)

Una cookie que se envía automáticamente **sí** es susceptible de CSRF, a
diferencia de una cabecera `Authorization`. Aquí la cobertura es doble:

1. **`SameSite=Lax`.** El frontend (`tubodaonline.onrender.com`) y el backend
   (`boda-backend-4e6z.onrender.com`) comparten sitio: su dominio registrable
   es `onrender.com`, así que la cookie viaja en las peticiones XHR
   cross-origin pero **no** en las peticiones cross-site de otro sitio. Es lo
   que el navegador confirma con `sec-fetch-site: same-site`.
2. **Verificación de `Origin`** (`src/middleware/csrf.js`): las peticiones que
   mutan estado (POST/PUT/PATCH/DELETE) deben venir de un origen permitido.
   Los navegadores **siempre** mandan `Origin` en esas peticiones; las que no
   lo llevan (CLI, app móvil, webhook de Stripe) se permiten, porque en ese
   caso no hay cookie de sesión implicada.

> **Si el frontend pasa a un dominio propio**, `SameSite=Lax` dejaría de
> funcionar (los sitios serían distintos) y la cookie tendría que ir en
> `SameSite=None`. En ese caso la verificación de `Origin` es la que protege
> y hay que poner `COOKIE_SAME_SITE=none` en el entorno del backend.

### 8.3 Una sola allowlist de orígenes

El CORS y el control CSRF usan **la misma** lista (`src/config/origins.js`):

- `ORIGIN_URL` → el origen principal del frontend.
- `ALLOWED_ORIGINS` → orígenes adicionales separados por comas (por ejemplo,
  un dominio propio o un panel de admin).

Antes, el CORS aceptaba un único origen y el CSRF una lista: podían
contradecirse (el CORS dejaba pasar una petición que el CSRF bloqueaba, o al
revés). Ahora los dos leen la misma fuente.

> Con `credentials: true`, `Access-Control-Allow-Origin` tiene que ser el
> origen **exacto** de la petición, nunca `*`. Por eso el CORS se configura
> con una función que consulta la allowlist.

### 8.4 Verificación en navegador real

Probado con Chrome contra el backend y el frontend en local:

| Comprobación | Resultado |
|---|---|
| `Set-Cookie` del login | `tb_session=…; Max-Age=86400; Path=/; HttpOnly; SameSite=Lax` |
| Cuerpo de la respuesta del login | **Sin token** (es una petición de navegador) |
| `localStorage` tras login y tras recargar | **Vacío** |
| `document.cookie` | La cookie de sesión **no** es visible (es `httpOnly`) |
| Peticiones posteriores | Llevan `cookie: tb_session=…`, sin cabecera `Authorization` |
| `sec-fetch-site` | `same-site` (la cookie cruza el origen sin problema) |
| Rate limit | Las peticiones con cookie caen en el bucket autenticado (500/15 min) |
| Recargar la página | La sesión persiste (rehidratación con `GET /api/auth/me`) |
| Mutación con `Origin` ajeno | `403 Origin not allowed` |
| Mutación sin `Origin` (CLI) | Permitida |

### 8.5 Cobertura de pruebas

| Fichero | Qué cubre |
|---|---|
| `test/session-cookie.integration.test.js` (12) | Atributos de la cookie, autenticación por cookie, rechazo de cookies manipuladas, logout, token solo a clientes no navegador, CSRF (origen permitido / ajeno / ausente) |
| `src/app/services/auth.service.spec.ts` (4) | Que el frontend no escribe nada en `localStorage`, que el interceptor pone `withCredentials`, y que la rehidratación funciona o deja al usuario sin sesión |

---

## 9. Comandos de verificación

```bash
# Cabeceras del frontend
curl -I https://tubodaonline.onrender.com/

# Cabeceras del backend
curl -I https://boda-backend-4e6z.onrender.com/health

# 404 de assets (deben dar 404 o 0 bytes, NUNCA index.html)
curl -I https://tubodaonline.onrender.com/main-inexistente.js.map
curl -I https://tubodaonline.onrender.com/inexistente.json
curl -I https://tubodaonline.onrender.com/assets/inexistente.js

# Navegación (debe dar 200)
curl -I https://tubodaonline.onrender.com/judith-jesus

# security.txt y robots
curl -I https://tubodaonline.onrender.com/.well-known/security.txt
curl -I https://tubodaonline.onrender.com/robots.txt
```

### Aislamiento entre tenants (backend)

```bash
cd bodas-online-backend

# Suite de aislamiento: dos tenants reales, JWT de A contra recursos de B
node --test test/tenant-isolation.integration.test.js

# Suite del webhook de Stripe: firma, idempotencia y reintentos
node --test test/stripe-webhook.integration.test.js

# El resto de la suite, fichero a fichero
# (settings.integration.test.js se cuelga: fallo preexistente, sin relación)
node --test test/auth-validation.test.js
node --test test/multiuser.integration.test.js
node --test test/resolveUserContext.test.js
```

---

## 10. Regenerar o validar `render.yaml`

```bash
# Validar contra el schema oficial de Render
npx ajv-cli -s https://render.com/schema/render.yaml.json -d render.yaml --spec=draft2020

# Aplicar la config al servicio existente (Dashboard > New > Blueprint,
# repo jesusMartinez88/bodas-online, rama main).
# El `name: tubodaonline` del YAML hace que Render aplique la config AL
# servicio existente en vez de crear uno nuevo, conservando la URL.
```

> Al aplicar un Blueprint, Render **conserva** las reglas de headers y de
> routing que ya existían y **no** están en el YAML. Revisa las pantallas
> *Headers* y *Redirects/Rewrites* después de aplicar, y borra cualquier
> regla huérfana.

---

## 11. Webhook de Stripe: firma, idempotencia y reintentos

> Cerrado en octubre de 2026. Afecta al **backend** (`bodas-online-backend`).

### 11.1 Qué había y qué faltaba

Al auditar el hallazgo, la **verificación de firma ya estaba implementada**
desde el commit `b86f928` ("feature: pay stripe and send email for new
users"). El endpoint hacía:

```js
event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
// 400 si la firma no valida · 500 si falta STRIPE_WEBHOOK_SECRET
```

Y el cuerpo crudo llega intacto porque `app.js` captura el buffer en el
`verify` del parser de JSON global:

```js
app.use(express.json({
  limit: "10mb",
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
```

Lo que **faltaba** eran las tres cosas que Hacen que un webhook sea fiable:

| # | Hueco | Consecuencia real |
|---|---|---|
| 1 | **Ninguna prueba** de la verificación de firma | Un cambio de una línea en el middleware de JSON (por ejemplo, añadir `express.text()` delante) habría roto el webhook **sin que ninguna prueba se enterara** |
| 2 | **Sin idempotencia** | Stripe reintenta la entrega hasta 3 días después, y el panel permite reenviar eventos a mano. Cada reintento reprocesaba el evento y **reenviaba el email de "pago recibido"** al cliente |
| 3 | **El `catch` devolvía `200`** | Si el procesamiento fallaba (error de BD, usuario inexistente…), el backend respondía `200` y el pago se perdía **en silencio**: Stripe no reintentaba porque la entrega fue "correcta" |

### 11.2 Idempotencia: la tabla `webhook_events`

Nueva tabla en el backend (`src/db.js`):

```sql
CREATE TABLE IF NOT EXISTS webhook_events (
  eventId   TEXT PRIMARY KEY,   -- id único e inmutable del evento (evt_...)
  type      TEXT NOT NULL,
  status    TEXT NOT NULL DEFAULT 'processing',  -- processing | processed
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

El modelo (`src/models/webhookEvent.js`) hace el reclamo con un `INSERT OR
IGNORE`, que es la operación atómica que decide qué worker procesa el evento:

| Situación | Resultado | Respuesta HTTP |
|---|---|---|
| Evento nuevo | `claimed: true` (reason `new`) | se procesa → `200` |
| Evento ya procesado | `claimed: false` (reason `duplicate`) | `200 {"received":true,"duplicate":true}` |
| Evento en curso en otro worker | `claimed: false` (reason `in-flight`) | `200 {"received":true,"duplicate":true}` |
| Claim huérfano (> 10 min, el proceso murió) | `claimed: true` (reason `takeover`) | se reprocesa → `200` |

El `duplicate: true` es **intencional**: un `4xx` haría que Stripe reintentara
un evento que ya está correctamente procesado, y un `5xx` parece un fallo
nuestro cuando en realidad es una entrega repetida. Stripe solo necesita un
`2xx` para dar el evento por entregado.

### 11.3 Los fallos de procesamiento devuelven 500

Antes el `catch` exterior terminaba con `res.json({ received: true })`. Ahora:

1. Se **libera el claim** (se borra la fila) para que el reintento pueda
   procesar el evento desde cero. Si el claim se conservara, el reintento de
   Stripe vería el evento como "ya reclamado" y **el pago se perdería**.
2. Se responde `500` con `{"received": false}`, que es la señal que hace que
   Stripe reintente la entrega.

Con la idempotencia activa, reintentar es seguro: el email no se duplica
porque el evento solo se procesa una vez.

> El email de "pago recibido" se envía *dentro* de su propio `try/catch`
> (fire-and-forget): si Resend falla, el pago **no** se reintenta. Es lo
> correcto — el pago ya está registrado y confirmado; reenviar el email por
> un fallo del proveedor de correo sí generaría duplicados.

### 11.4 Cobertura de pruebas

`bodas-online-backend/test/stripe-webhook.integration.test.js` — **9 pruebas**
que firman payloads reales con `stripe.webhooks.generateTestHeaderString`:

| Prueba | Qué comprueba |
|---|---|
| Firma válida | `200`, el usuario queda marcado como pagado y el evento queda `processed` |
| Firma inválida (secret ajeno) | `400` y el pago **no** se marca; el evento no se registra |
| Sin cabecera `stripe-signature` | `400` |
| Cuerpo alterado después de firmarlo | `400` (la firma cubre los bytes exactos) |
| Sin `STRIPE_WEBHOOK_SECRET` | `500` y el evento no se acepta |
| Entrega duplicada | La segunda responde `duplicate: true` y **no** vuelve a tocar el pago (se comprueba con un valor centinela en `paidAt`) |
| Fallo de procesamiento | `500` y el claim se libera (la fila desaparece) |
| Reintento tras el fallo | El mismo `eventId` con payload válido **sí** se procesa → el pago se marca |
| Evento con otro id | Se procesa con normalidad (no es un duplicado) |

Las pruebas se validaron por **mutación**: desactivando el reclamo, la prueba
del duplicado falla; degradando el `500` a `200`, falla la del fallo de
procesamiento.

```bash
cd bodas-online-backend
node --test test/stripe-webhook.integration.test.js
```

### 11.5 Configuración manual (obligatoria, solo la puede hacer el titular)

El código está listo, pero **mientras no se configure esto en el panel de
Stripe, los pagos no se activan solos**:

1. En <https://dashboard.stripe.com/webhooks> → *Add endpoint*:
   - **URL**: `https://boda-backend-4e6z.onrender.com/api/payments/webhook`
   - **Events**: `payment_intent.succeeded`, `payment_intent.processing`,
     `payment_intent.payment_failed`, `payment_intent.canceled`
   - **Signing secret**: el `whsec_…` que genera Stripe.
2. En el panel de Render del backend, definir la variable de entorno
   `STRIPE_WEBHOOK_SECRET` con ese `whsec_…` y **redespiar**. El `.env`
   local **no** es el de Render: sin esta variable el webhook responde `500`
   a propósito (no se acepta ningún evento sin secreto configurado).
3. Comprobar en el panel de Stripe que las entregas llegan con `200` y que
   aparecen en *Event deliveries*.

### 11.6 Probarlo en local con la CLI de Stripe

```bash
# 1. Arrancar el backend con STRIPE_WEBHOOK_SECRET=<el whsec_ del endpoint local>
node src/index.js

# 2. En otra terminal, reenviar eventos al backend local
stripe listen --forward-to localhost:3000/api/payments/webhook
stripe trigger payment_intent.succeeded
```

La CLI imprime su propio `whsec_…` (distinto del de producción): ese es el
que debe estar en `STRIPE_WEBHOOK_SECRET` mientras se prueba en local.

### 11.7 Lo que queda fuera del alcance

- La tabla `webhook_events` crece un evento por pago. El modelo trae
  `purgeOldEvents(days = 30)` para borrarlos, pero **no se llama automáticamente**:
  con el volumen actual (un evento por pago) el crecimiento es irrelevante y
  prefiero no añadir un job programado que pueda fallar en silencio.
- El endpoint responde `503` si Stripe está deshabilitado (`STRIPE_SECRET_KEY`
  ausente). Es el comportamiento correcto para un despliegue sin pagos.

