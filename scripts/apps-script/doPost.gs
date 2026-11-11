/**
 * Apps Script — backup de invitados (Google Sheets)
 * ===================================================
 * 
 * se añade `doPost`. Antes el frontend usaba JSONP (un `<script>` con
 * `callback=`), pero la CSP del frontend es estricta y `script-src` no incluye
 * `script.google.com`: el navegador bloqueaba el script, así que el backup
 * NUNCA se guardaba y la promesa quedaba colgada. Ahora el backup viaja con
 * `fetch(..., { mode: 'no-cors' })`, es decir un POST con cuerpo
 * `application/x-www-form-urlencoded` → lo recibe `doPost`.
 *
 */

// ─── Puntos de entrada ─────────────────────────────────────────────

/**
 * POST desde el frontend (`fetch` con `mode: 'no-cors'`).
 * En `doPost`, `e.parameter` ya incluye los campos del body, y el cuerpo
 * crudo está en `e.postData.contents`.
 */
function doPost(e) {
  return procesarInvitado(e);
}

/**
 * GET: se mantiene para clientes antiguos (o pruebas manuales con
 * `?name=...&callback=...`).
 */
function doGet(e) {
  return procesarInvitado(e);
}

// ─── Lógica compartida ────────────────────────────────────────────

/**
 * Escribe la fila del invitado y devuelve la respuesta.
 * Si viene `callback`, responde en JSONP, si no en JSON.
 */
function procesarInvitado(e) {
  try {
    const params = obtenerParametros(e);
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    sheet.appendRow([
      params.name || '',
      params.slug || '',
      params.email || '',
      params.phone || '',
      params.attending || '',
      params.adults || '',
      params.children || '',
      params.mealType || '',
      params.needsTransport || '',
      params.allergies || '',
      params.notes || '',
      params.isSavedInBbdd || '',
      new Date(),
    ]);

    // Condición para avisar por email
    if (params.isSavedInBbdd === false || params.isSavedInBbdd === 'false') {
      MailApp.sendEmail({
        to: 'jesusmartinezsanchez9@gmail.com',
        subject: '⚠️ Alerta: Valor FALSE detectado',
        body:
          'Se ha insertado un nuevo registro con valor FALSE en la hoja de cálculo. ' +
          'Con lo que quiere decir que el backend esta caido, revisar datos: del invitado:' +
          params.name,
      });
    }

    const data = { success: true };
    const callback = params.callback;
    const payload = JSON.stringify(data);
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + payload + ');').setMimeType(
        ContentService.MimeType.JAVASCRIPT,
      );
    } else {
      return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (err) {
    const data = { success: false, error: err.toString() };
    const callback = (e && e.parameter && e.parameter.callback) || null;
    const payload = JSON.stringify(data);
    if (callback) {
      return ContentService.createTextOutput(callback + '(' + payload + ');').setMimeType(
        ContentService.MimeType.JAVASCRIPT,
      );
    }
    return ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Reúne los parámetros del POST.
 *
 * `e.parameter` es la vía normal, pero Apps Script puede devolver las claves
 * en minúsculas (conserva el camelCase exacto con el que lo envía el
 * frontend).
 */
function obtenerParametros(e) {
  const params = {};

  if (e && e.parameter) {
    Object.keys(e.parameter).forEach(function (key) {
      params[key] = e.parameter[key];
    });
  }

  const cuerpo =
    e && e.postData && typeof e.postData.contents === 'string' ? e.postData.contents : '';
  if (cuerpo) {
    const parseado = parsearFormUrl(cuerpo);
    Object.keys(parseado).forEach(function (key) {
      params[key] = parseado[key];
    });
  }

  return params;
}

/**
 * Parsea un cuerpo `application/x-www-form-urlencoded`.
 * Los espacios llegan como `+` (URLSearchParams), no como %20.
 */
function parsearFormUrl(cuerpo) {
  const salida = {};
  cuerpo.split('&').forEach(function (par) {
    if (!par) return;
    const separador = par.indexOf('=');
    const claveBruta = separador === -1 ? par : par.slice(0, separador);
    const valorBruto = separador === -1 ? '' : par.slice(separador + 1);
    const clave = decodeURIComponent(claveBruta.replace(/\+/g, ' '));
    const valor = decodeURIComponent(valorBruto.replace(/\+/g, ' '));
    salida[clave] = valor;
  });
  return salida;
}

// ─── Utilidades ──────────────────────────────────────

function probarCorreo() {
  MailApp.sendEmail(
    'jesusmartinezsanchez9@gmail.com',
    'Prueba de Apps Script',
    'Si lees esto, el script funciona sin configurar nada.',
  );
}

function consultarBackEnd() {
  var url = 'https://boda-backend-4e6z.onrender.com/health';
  var response = UrlFetchApp.fetch(url);
  var data = response.getContentText();
}
