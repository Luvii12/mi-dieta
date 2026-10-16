// Punto de entrada del web app. La PWA envía POST con cuerpo JSON (text/plain para evitar CORS):
//   {"accion": "config", "token": "...", ...}
// Respuesta siempre JSON: {"ok": true, "datos": ...} o {"ok": false, "error": "..."}.

const ACCIONES = {
  // Sin `cambios` lee toda la configuración; con `cambios` ({clave: valor}) la guarda y la devuelve.
  config: function (peticion) {
    const cambios = peticion.cambios || {};
    Object.keys(cambios).forEach(clave => guardarConfig_(clave, cambios[clave]));
    return leerConfig_();
  },

  // Fase 0: aún no hay planes. Devuelve el día vacío.
  hoy: function () {
    return { fecha: fechaIso_(new Date()), plan_id: null, comidas: [], mensaje: 'Todavía no hay un plan activo.' };
  },
};

function doPost(e) {
  let peticion;
  try {
    peticion = JSON.parse(e.postData.contents);
  } catch (err) {
    return responder_({ ok: false, error: 'Petición no válida' });
  }
  return responder_(manejar_(peticion, tokenGuardado_(), ACCIONES));
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
