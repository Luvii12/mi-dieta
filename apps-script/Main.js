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

  // Las comidas de hoy del plan activo. Si hoy no hay plan, un mensaje que lo explica.
  hoy: function () {
    const hoy = fechaIso_(new Date());
    const planes = leerTabla_('planes');
    const activo = planes.find(p => p.estado === 'activo');
    const vacio = mensaje => ({ fecha: hoy, plan_id: null, comidas: [], mensaje: mensaje });
    if (!activo) {
      const borrador = planes.find(p => p.estado === 'borrador');
      return vacio(borrador ? 'Tienes un plan en borrador: actívalo en la pestaña Plan.' : 'Todavía no hay un plan activo. Genera uno en la pestaña Plan.');
    }
    if (hoy < activo.inicio) return Object.assign(vacio('Tu plan empieza el ' + activo.inicio + '.'), { inicio: activo.inicio });
    if (hoy > activo.fin) return vacio('El plan activo terminó el ' + activo.fin + '. Genera uno nuevo en la pestaña Plan.');
    const comidas = leerTabla_('plan_comidas').filter(f => f.plan_id === activo.plan_id && f.fecha === hoy);
    const vista = vistaPlan_(activo, comidas, leerRecetasPorId_(), indexarAlimentos_(leerTabla_('alimentos')));
    const dia = vista.dias[0];
    if (!dia) return vacio('El plan activo no tiene comidas para hoy.');
    return { fecha: hoy, plan_id: activo.plan_id, comidas: dia.comidas, macros: dia.macros, objetivoDia: vista.objetivoDia,
      evaluacion: dia.evaluacion };
  },

  // El plan activo y el borrador (si existen), por días.
  plan: function () {
    const planes = leerTabla_('planes');
    const comidas = leerTabla_('plan_comidas');
    const recetas = leerRecetasPorId_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const vista = estado => {
      const p = planes.find(x => x.estado === estado);
      return p ? vistaPlan_(p, comidas.filter(f => f.plan_id === p.plan_id), recetas, alimentos) : null;
    };
    return { activo: vista('activo'), borrador: vista('borrador') };
  },

  // Genera un plan de 14 días que empieza el lunes siguiente (o al acabar el activo) y lo guarda como
  // borrador, sustituyendo al borrador anterior si lo había.
  generarPlan: function () {
    const bloqueo = LockService.getScriptLock();
    bloqueo.waitLock(30000);
    try {
      const config = leerConfig_();
      const objetivos = objetivosDeConfig_(config);
      if (!config.tolerancias || !config.tolerancias.dia) throw new Error('Faltan las tolerancias en config.');
      const planes = leerTabla_('planes');
      const comidas = leerTabla_('plan_comidas');
      const activo = planes.find(p => p.estado === 'activo');
      const referencia = planDeReferencia_(planes);
      const recetasPorId = leerRecetasPorId_();

      const generado = generarPlan_({
        inicio: fechaInicioPlan_(fechaIso_(new Date()), activo ? activo.fin : null),
        recetas: Object.keys(recetasPorId).map(id => recetasPorId[id]).filter(r => r.activa === 'si' && !r.error),
        alimentos: indexarAlimentos_(leerTabla_('alimentos')),
        objetivos: objetivos,
        tolerancias: config.tolerancias,
        config: config,
        valoraciones: leerTabla_('valoraciones'),
        preferencias: leerTabla_('preferencias'),
        recetasPlanAnterior: referencia ? comidas.filter(f => f.plan_id === referencia.plan_id).map(f => f.receta_id) : [],
      });

      const ahora = Utilities.formatDate(new Date(), ZONA_HORARIA, "yyyy-MM-dd'T'HH:mm");
      const planId = idUnico_('P' + Utilities.formatDate(new Date(), ZONA_HORARIA, 'yyyyMMdd-HHmmss'),
        planes.map(p => p.plan_id));
      const filas = filasDesdePlan_(generado, planId, objetivos, config.tolerancias, ahora);
      const borradores = planes.filter(p => p.estado === 'borrador').map(p => p.plan_id);
      reescribirTabla_('planes', planes.filter(p => p.estado !== 'borrador').concat([filas.plan]));
      reescribirTabla_('plan_comidas', comidas.filter(f => borradores.indexOf(f.plan_id) < 0).concat(filas.comidas));

      const vista = vistaPlan_(filas.plan, filas.comidas, recetasPorId, indexarAlimentos_(leerTabla_('alimentos')));
      vista.descartadas = generado.descartadas;
      return vista;
    } finally {
      bloqueo.releaseLock();
    }
  },

  // Activa el borrador indicado; el plan activo anterior pasa a archivado.
  activarPlan: function (peticion) {
    const bloqueo = LockService.getScriptLock();
    bloqueo.waitLock(30000);
    try {
      const planes = leerTabla_('planes');
      const plan = planes.find(p => p.plan_id === peticion.plan_id);
      if (!plan) throw new Error('No existe el plan ' + peticion.plan_id + '.');
      if (plan.estado !== 'borrador') throw new Error('Solo se puede activar un plan en borrador.');
      planes.forEach(p => {
        if (p.estado === 'activo') p.estado = 'archivado';
      });
      plan.estado = 'activo';
      reescribirTabla_('planes', planes);
      return { plan_id: plan.plan_id, inicio: plan.inicio, fin: plan.fin };
    } finally {
      bloqueo.releaseLock();
    }
  },
};

// {objetivo_desayuno: {...}, ...} de config → {Desayuno: {...}, ...}
function objetivosDeConfig_(config) {
  const objetivos = {};
  COMIDAS.forEach(c => {
    objetivos[c] = config['objetivo_' + c.toLowerCase()];
    if (!objetivos[c]) throw new Error('No hay objetivo para «' + c + '» en config.');
  });
  return objetivos;
}

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
