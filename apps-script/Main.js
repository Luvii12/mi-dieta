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

  // Todas las recetas activas con los gramos ajustados al objetivo de su comida.
  // Si una receta no se puede calcular (p. ej. alimento desconocido) lleva `error` en vez de `ajuste`.
  recetas: function () {
    const config = leerConfig_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const tolComida = (config.tolerancias || {}).comida;
    return leerTabla_('recetas')
      .filter(fila => fila.activa === 'si')
      .map(fila => {
        const resultado = { id: fila.id, comida: fila.comida, nombre: fila.nombre, preparacion: fila.preparacion, origen: fila.origen };
        try {
          const objetivo = config['objetivo_' + String(fila.comida).toLowerCase()];
          if (!objetivo) throw new Error('No hay objetivo para «' + fila.comida + '» en config.');
          resultado.ajuste = ajustarReceta_(filaAReceta_(fila), objetivo, alimentos, tolComida);
        } catch (err) {
          resultado.error = err.message;
        }
        return resultado;
      });
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
