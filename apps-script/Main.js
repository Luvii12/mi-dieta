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
    const vista = vistaPlan_(activo, comidas, leerRecetasPorId_(), indexarAlimentos_(leerTabla_('alimentos')), valoracionesActuales_());
    const dia = vista.dias[0];
    if (!dia) return vacio('El plan activo no tiene comidas para hoy.');
    return { fecha: hoy, plan_id: activo.plan_id, inicio: activo.inicio, fin: activo.fin, comidas: dia.comidas, macros: dia.macros,
      objetivoDia: vista.objetivoDia, evaluacion: dia.evaluacion };
  },

  // El plan activo y el borrador (si existen), por días.
  plan: function () {
    const planes = leerTabla_('planes');
    const comidas = leerTabla_('plan_comidas');
    const recetas = leerRecetasPorId_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const valoraciones = valoracionesActuales_();
    const vista = estado => {
      const p = planes.find(x => x.estado === estado);
      return p ? vistaPlan_(p, comidas.filter(f => f.plan_id === p.plan_id), recetas, alimentos, valoraciones) : null;
    };
    return { activo: vista('activo'), borrador: vista('borrador') };
  },

  // Genera un plan de 14 días que empieza el lunes siguiente (o al acabar el activo) y lo guarda como
  // borrador, sustituyendo al borrador anterior si lo había.
  generarPlan: function () {
    return conBloqueo_(() => {
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
        recetas: recetasActivas_(recetasPorId),
        alimentos: indexarAlimentos_(leerTabla_('alimentos')),
        objetivos: objetivos,
        tolerancias: config.tolerancias,
        config: config,
        valoraciones: leerTabla_('valoraciones'),
        preferencias: leerTabla_('preferencias'),
        recetasPlanAnterior: referencia ? comidas.filter(f => f.plan_id === referencia.plan_id).map(recetaDeComida_) : [],
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
    });
  },

  // Activa el borrador indicado; el plan activo anterior pasa a archivado.
  activarPlan: function (peticion) {
    return conBloqueo_(() => {
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
    });
  },

  // Marca una comida del plan activo: hecha = 'si', 'no' o 'libre' (comida libre: se sale del plan).
  // Petición: {plan_id, fecha, comida, hecha}.
  marcarComida: function (peticion) {
    if (ESTADOS_COMIDA.indexOf(peticion.hecha) < 0) throw new Error('Estado de comida no válido: ' + peticion.hecha + '.');
    return conBloqueo_(() => {
      diaDelPlanActivo_(peticion);
      actualizarFilas_('plan_comidas', esLaComida_(peticion), { hecha: peticion.hecha });
      return { plan_id: peticion.plan_id, fecha: peticion.fecha, comida: peticion.comida, hecha: peticion.hecha };
    });
  },

  // Recetas por las que se puede cambiar una comida del plan activo, ajustadas a su objetivo y con lo que
  // sumaría el día. Petición: {plan_id, fecha, comida}.
  alternativas: function (peticion) {
    const { plan, filas } = diaDelPlanActivo_(peticion);
    const objetivos = parsearValor_(plan.objetivos) || {};
    const recetasPorId = leerRecetasPorId_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const vista = vistaPlan_(plan, filas, recetasPorId, alimentos);
    return alternativasComida_(vista.dias[0], peticion.comida, recetasActivas_(recetasPorId), {
      objetivos: objetivos.comidas,
      alimentos: alimentos,
      valoraciones: leerTabla_('valoraciones'),
      preferencias: leerTabla_('preferencias'),
    }, vista.objetivoDia, objetivos.tolerancias.dia);
  },

  // Cambia el plato de una comida del plan activo por otra receta de la misma comida, con los gramos
  // recalculados para su objetivo. La comida vuelve a «pendiente». Devuelve el día actualizado.
  // Petición: {plan_id, fecha, comida, receta_id}.
  cambiarPlato: function (peticion) {
    return conBloqueo_(() => {
      const { plan, filas } = diaDelPlanActivo_(peticion);
      const recetasPorId = leerRecetasPorId_();
      const receta = recetasPorId[peticion.receta_id];
      if (!receta || receta.error) throw new Error('No se puede usar la receta ' + peticion.receta_id + '.');
      if (receta.comida !== peticion.comida) throw new Error('La receta ' + receta.id + ' no es de ' + String(peticion.comida).toLowerCase() + '.');
      const prohibidos = alimentosProhibidos_(leerTabla_('preferencias'));
      const prohibido = receta.ingredientes_fijos.concat(receta.ingredientes_escalables).find(i => prohibidos.has(i.alimento));
      if (prohibido) throw new Error('La receta ' + receta.id + ' lleva ' + prohibido.alimento + ', que está excluido.');

      const objetivos = parsearValor_(plan.objetivos) || {};
      const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
      const ajuste = ajustarReceta_(receta, objetivos.comidas[peticion.comida], alimentos);
      const m = redondearMacros_(ajuste.macros);
      const fila = filas.find(f => f.comida === peticion.comida);
      const cambios = { cambiada_por: receta.id === fila.receta_id ? '' : receta.id, gramos: ajuste.gramos,
        kcal: m.kcal, P: m.P, C: m.C, G: m.G, hecha: 'no' };
      actualizarFilas_('plan_comidas', esLaComida_(peticion), cambios);
      Object.assign(fila, cambios);
      return vistaPlan_(plan, filas, recetasPorId, alimentos, valoracionesActuales_()).dias[0];
    });
  },

  // Guarda la valoración de una receta (la última es la que cuenta). Petición: {receta_id, valor}.
  valorar: function (peticion) {
    if (VALORES_VALORACION.indexOf(peticion.valor) < 0) throw new Error('Valoración no válida: ' + peticion.valor + '.');
    if (!leerRecetasPorId_()[peticion.receta_id]) throw new Error('No existe la receta ' + peticion.receta_id + '.');
    const fila = { receta_id: peticion.receta_id, valor: peticion.valor, fecha: fechaIso_(new Date()) };
    conBloqueo_(() => anadirFilas_('valoraciones', [fila]));
    return fila;
  },
};

const ESTADOS_COMIDA = ['si', 'no', 'libre'];
const VALORES_VALORACION = ['me_encanta', 'normal', 'no_repetir'];

function recetasActivas_(recetasPorId) {
  return Object.keys(recetasPorId).map(id => recetasPorId[id]).filter(r => r.activa === 'si' && !r.error);
}

function valoracionesActuales_() {
  return ultimasValoraciones_(leerTabla_('valoraciones'));
}

const esLaComida_ = peticion => f => f.plan_id === peticion.plan_id && f.fecha === peticion.fecha && f.comida === peticion.comida;

// Plan activo y filas del día pedido. Solo se cambian comidas del plan activo.
function diaDelPlanActivo_(peticion) {
  const plan = leerTabla_('planes').find(p => p.plan_id === peticion.plan_id);
  if (!plan) throw new Error('No existe el plan ' + peticion.plan_id + '.');
  if (plan.estado !== 'activo') throw new Error('Solo se pueden cambiar comidas del plan activo.');
  const filas = leerTabla_('plan_comidas').filter(f => f.plan_id === plan.plan_id && f.fecha === peticion.fecha);
  if (!filas.some(f => f.comida === peticion.comida)) {
    throw new Error('El plan no tiene ' + String(peticion.comida).toLowerCase() + ' el ' + peticion.fecha + '.');
  }
  return { plan: plan, filas: filas };
}

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
