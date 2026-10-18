// Punto de entrada del web app. La PWA envía POST con cuerpo JSON (text/plain para evitar CORS):
//   {"accion": "config", "token": "...", ...}
// Respuesta siempre JSON: {"ok": true, "datos": ...} o {"ok": false, "error": "..."}.
// Las acciones están en web/motor/Acciones.js (se suben a Apps Script con clasp junto a este archivo).

// Lo ejecuta el activador diario (ver instalarActivador en Setup.js): si al plan activo le quedan 2 días
// o menos y aún no hay siguiente plan, genera el borrador. La propuesta de ajuste se calcula al abrirlo.
function revisarFinDePlan() {
  const hoy = fechaIso_(new Date());
  const planes = planesAlDia_();
  const activo = planes.find(p => p.estado === 'activo');
  if (!activo || planes.some(p => p.estado === 'borrador' || p.estado === 'siguiente')) return;
  if (diasEntre_(hoy, activo.fin) > 2) return;
  const borrador = ACCIONES.generarPlan();
  Logger.log('Borrador %s generado (%s a %s).', borrador.plan_id, borrador.inicio, borrador.fin);
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
