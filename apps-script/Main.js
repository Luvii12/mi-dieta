// Punto de entrada del web app. La PWA envía POST con cuerpo JSON (text/plain para evitar CORS):
//   {"accion": "config", "token": "...", ...}
// Respuesta siempre JSON: {"ok": true, "datos": ...} o {"ok": false, "error": "..."}.
// Las acciones están en web/motor/Acciones.js (se suben a Apps Script con clasp junto a este archivo).

// Lo ejecuta el activador diario (ver instalarActivador en Setup.js), hasta que se retire Apps Script (M6):
// si al plan activo le quedan 2 días o menos y aún no hay siguiente plan, genera el borrador.
function revisarFinDePlan() {
  const r = ACCIONES.revisarFinDePlan();
  if (r.generado) Logger.log('Borrador %s generado (%s a %s).', r.generado.plan_id, r.generado.inicio, r.generado.fin);
}

function doPost(e) {
  let peticion;
  try {
    peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder_({ ok: false, error: 'Petición no válida' });
  }
  return responder_(manejar_(peticion, tokenGuardado_(), Object.assign({ exportar: exportar_ }, ACCIONES)));
}

// Todas las pestañas tal cual, para migrarlas a Supabase (scripts/migrar_sheets.js). Solo lee. No está en
// el motor compartido: en el navegador no tiene sentido.
function exportar_() {
  const tablas = {};
  Object.keys(PESTANAS).forEach(nombre => { tablas[nombre] = leerTabla_(nombre); });
  return tablas;
}

// Solo para comprobar desde el navegador que el despliegue responde. No devuelve datos:
// el token nunca viaja en la URL.
function doGet() {
  return responder_({ ok: true, datos: 'API de la app de dieta funcionando. Usa la app para conectarte.' });
}

function tokenGuardado_() {
  return PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
}

function responder_(respuesta) {
  return ContentService.createTextOutput(JSON.stringify(respuesta)).setMimeType(ContentService.MimeType.JSON);
}
