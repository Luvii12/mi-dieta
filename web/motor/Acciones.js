// Acciones de la app: lo que hace cada petición de la PWA. Sin APIs de Google: trabajan con las funciones
// de almacén leerTabla_, anadirFilas_, reescribirTabla_, actualizarFilas_, escribirConfig_ y conBloqueo_,
// que pone Apps Script (apps-script/Hoja.js, sobre Google Sheets) o el navegador (Memoria.js, en memoria).
// Cada acción recibe la petición ({accion, ...}) y devuelve sus datos o lanza un Error con el mensaje.

const ACCIONES = {
  // Sin `cambios` lee toda la configuración; con `cambios` ({clave: valor}) la guarda y la devuelve.
  config: function (peticion) {
    const cambios = peticion.cambios || {};
    Object.keys(cambios).forEach(clave => guardarConfig_(clave, cambios[clave]));
    return leerConfig_();
  },

  // Todas las recetas activas con los gramos ajustados al objetivo de su comida y su última valoración.
  // Si una receta no se puede calcular (p. ej. alimento desconocido) lleva `error` en vez de `ajuste`.
  recetas: function () {
    const config = leerConfig_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const tolComida = (config.tolerancias || {}).comida;
    const valoraciones = valoracionesActuales_();
    return leerTabla_('recetas')
      .filter(fila => fila.activa === 'si')
      .map(fila => {
        const resultado = { id: fila.id, comida: fila.comida, nombre: fila.nombre, preparacion: fila.preparacion, origen: fila.origen,
          valoracion: valoraciones[fila.id] || null };
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
    const planes = planesAlDia_();
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
      objetivoDia: vista.objetivoDia, evaluacion: dia.evaluacion, nuevo_plan: planes.some(p => p.estado === 'borrador') };
  },

  // El plan activo, el siguiente (ya activado, empieza al acabar el activo) y el borrador, por días.
  // El borrador lleva `bloque` (su número) y `balance`: cómo fue el bloque que termina y la propuesta de ajuste.
  plan: function () {
    const planes = planesAlDia_();
    const comidas = leerTabla_('plan_comidas');
    const recetas = leerRecetasPorId_();
    const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
    const valoraciones = valoracionesActuales_();
    const vista = estado => {
      const p = planes.find(x => x.estado === estado);
      return p ? vistaPlan_(p, comidas.filter(f => f.plan_id === p.plan_id), recetas, alimentos, valoraciones) : null;
    };
    const resultado = { activo: vista('activo'), siguiente: vista('siguiente'), borrador: vista('borrador') };
    if (resultado.borrador) {
      const filaBorrador = planes.find(p => p.estado === 'borrador');
      resultado.borrador.bloque = numeroBloque_(planes, filaBorrador);
      resultado.borrador.balance = balanceBloque_(planes, comidas, leerConfig_(), fechaIso_(new Date()));
    }
    return resultado;
  },

  // Genera un plan de 14 días que empieza el lunes siguiente (o al acabar el activo; el primero, mañana)
  // y lo guarda como borrador, sustituyendo al borrador anterior si lo había.
  generarPlan: function () {
    return conBloqueo_(() => {
      const config = leerConfig_();
      const objetivos = objetivosDeConfig_(config);
      if (!config.tolerancias || !config.tolerancias.dia) throw new Error('Faltan las tolerancias en config.');
      const planes = planesAlDia_();
      const comidas = leerTabla_('plan_comidas');
      const ultimoFin = planes.filter(p => p.estado === 'activo' || p.estado === 'siguiente').map(p => p.fin).sort().pop() || null;
      const referencia = planDeReferencia_(planes);
      const recetasPorId = leerRecetasPorId_();

      const generado = generarPlan_({
        // El primer plan de quien se acaba de dar de alta (tiene perfil y aún no tiene planes) empieza mañana.
        inicio: config.perfil && !planes.some(p => p.estado !== 'borrador') ? sumarDias_(fechaIso_(new Date()), 1)
          : fechaInicioPlan_(fechaIso_(new Date()), ultimoFin),
        recetas: recetasActivas_(recetasPorId),
        alimentos: indexarAlimentos_(leerTabla_('alimentos')),
        objetivos: objetivos,
        tolerancias: config.tolerancias,
        config: config,
        valoraciones: leerTabla_('valoraciones'),
        preferencias: leerTabla_('preferencias'),
        recetasPlanAnterior: referencia ? comidas.filter(f => f.plan_id === referencia.plan_id).map(recetaDeComida_) : [],
      });

      const ahora = fechaHora_(new Date(), "yyyy-MM-dd'T'HH:mm");
      const planId = idUnico_('P' + fechaHora_(new Date(), 'yyyyMMdd-HHmmss'),
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

  // Guarda el perfil (alta o cambio de objetivo) y los objetivos que salen de él (Perfil.js), y el peso
  // como pesaje de hoy. Petición: {perfil: {nombre, sexo, nacimiento, altura_cm, peso_kg, trabajo, entreno,
  // meta}, probar?}. Con `probar` solo calcula. Los planes ya hechos no cambian; el borrador se recalcula al
  // activarlo. A quien se da de alta se le pone también la configuración inicial (tolerancias…).
  // Devuelve {perfil, calculo, config}.
  guardarPerfil: function (peticion) {
    const hoy = fechaIso_(new Date());
    const perfil = validarPerfil_(peticion.perfil, hoy);
    const config = leerConfig_();
    const calculo = calcularObjetivos_(perfil, hoy, config.kcal_minimas);
    if (peticion.probar) return { perfil: perfil, calculo: calculo, config: config };
    conBloqueo_(() => {
      escribirConfig_('perfil', perfil);
      COMIDAS.forEach(c => escribirConfig_('objetivo_' + c.toLowerCase(), calculo.comidas[c]));
      const iniciales = { kcal_minimas: calculo.kcal_minimas, tolerancias: TOLERANCIAS_INICIALES, max_rep_desayuno: 4,
        max_rep_merienda: 4, dias_flexibles: 0, comida_libre_semanal: true };
      Object.keys(iniciales).filter(k => config[k] === undefined).forEach(k => escribirConfig_(k, iniciales[k]));
      if (!actualizarFilas_('pesos', f => f.fecha === hoy, { peso_kg: perfil.peso_kg })) anadirFilas_('pesos', [{ fecha: hoy, peso_kg: perfil.peso_kg }]);
    });
    return { perfil: perfil, calculo: calculo, config: leerConfig_() };
  },

  // Activa el borrador indicado. Si el plan activo aún no ha terminado, el borrador queda como «siguiente»
  // y pasa a activo el día que empieza; si no, el activo anterior pasa a archivado.
  // `ajuste_kcal` (opcional): una de las opciones de la propuesta de ajuste (0 = mantener). Los objetivos
  // de config se cambian según la opción y, si no coinciden con los del borrador, se recalculan sus
  // gramos (mismos platos). La decisión queda en `ajustes_historial`.
  activarPlan: function (peticion) {
    return conBloqueo_(() => {
      const hoy = fechaIso_(new Date());
      const planes = planesAlDia_();
      const plan = planes.find(p => p.plan_id === peticion.plan_id);
      if (!plan) throw new Error('No existe el plan ' + peticion.plan_id + '.');
      if (plan.estado !== 'borrador') throw new Error('Solo se puede activar un plan en borrador.');
      const config = leerConfig_();
      const comidas = leerTabla_('plan_comidas');

      const balance = balanceBloque_(planes, comidas, config, hoy);
      const delta = Number(peticion.ajuste_kcal) || 0;
      let objetivos = objetivosDeConfig_(config);
      if (balance) {
        const elegida = balance.propuesta.opciones.find(o => o.delta === delta);
        if (!elegida) throw new Error('Ajuste no válido: ' + delta + ' kcal.');
        if (elegida.bloqueada) throw new Error(elegida.bloqueada);
      } else if (delta !== 0) {
        throw new Error('No hay propuesta de ajuste para este plan.');
      }
      if (delta) {
        objetivos = ajustarObjetivos_(objetivos, delta);
        COMIDAS.forEach(c => escribirConfig_('objetivo_' + c.toLowerCase(), objetivos[c]));
      }

      const guardados = parsearValor_(plan.objetivos) || {};
      if (!mismosObjetivos_(guardados.comidas, objetivos)) {
        const delPlan = comidas.filter(f => f.plan_id === plan.plan_id);
        reoptimizarComidas_(delPlan, objetivos, leerRecetasPorId_(), indexarAlimentos_(leerTabla_('alimentos')));
        reescribirTabla_('plan_comidas', comidas);
        plan.objetivos = { comidas: objetivos, tolerancias: guardados.tolerancias || config.tolerancias };
      }

      const activo = planes.find(p => p.estado === 'activo');
      if (activo && activo.fin >= hoy && plan.inicio > activo.fin) {
        if (planes.some(p => p.estado === 'siguiente')) throw new Error('Ya hay un plan programado para cuando acabe el activo.');
        plan.estado = 'siguiente';
      } else {
        planes.forEach(p => {
          if (p.estado === 'activo') p.estado = 'archivado';
        });
        plan.estado = 'activo';
      }
      reescribirTabla_('planes', planes);
      if (balance) {
        anadirFilas_('ajustes_historial', [{ fecha: hoy, plan_id: balance.plan_id,
          ritmo_semanal_pct: balance.ritmo ? balance.ritmo.ritmo_pct : '', adherencia_pct: balance.adherencia.pct === null ? '' : balance.adherencia.pct,
          propuesta_kcal: balance.propuesta.opciones[0].delta, aceptada: delta === balance.propuesta.opciones[0].delta ? 'si' : 'no' }]);
      }
      return { plan_id: plan.plan_id, inicio: plan.inicio, fin: plan.fin, estado: plan.estado };
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

  // Peso, media de 7 días de las últimas 6 semanas, adherencia del bloque activo y racha.
  progreso: function () {
    const hoy = fechaIso_(new Date());
    const planes = planesAlDia_();
    const config = leerConfig_();
    const comidas = leerTabla_('plan_comidas');
    const pesos = normalizarPesos_(leerTabla_('pesos'));
    const desde = sumarDias_(hoy, -41);
    const activo = planes.find(p => p.estado === 'activo');
    const usados = planes.filter(p => p.estado !== 'borrador').map(p => p.plan_id);
    const resultado = {
      fecha: hoy,
      pesos: mediaMovil_(pesos).filter(p => p.fecha >= desde),
      ultimo: pesos.length ? pesos[pesos.length - 1] : null,
      cambio_semana: cambioSemana_(pesos, hoy),
      meta: Number(config.peso_objetivo) || null,
      racha: racha_(comidas.filter(c => usados.indexOf(c.plan_id) >= 0), hoy),
      bloque: null,
    };
    if (activo) {
      const delPlan = comidas.filter(c => c.plan_id === activo.plan_id);
      resultado.bloque = { numero: numeroBloque_(planes, activo), inicio: activo.inicio, fin: activo.fin,
        dias: diasEntre_(activo.inicio, activo.fin) + 1, dia: Math.min(diasEntre_(activo.inicio, hoy) + 1, diasEntre_(activo.inicio, activo.fin) + 1),
        adherencia: adherencia_(delPlan, activo.inicio, hoy, config.comida_libre_semanal !== false) };
    }
    return resultado;
  },

  // Guarda el peso de un día (uno por día: si ya había, lo sustituye). Petición: {peso_kg, fecha?}.
  // Devuelve el progreso actualizado.
  registrarPeso: function (peticion) {
    const peso = Math.round(Number(String(peticion.peso_kg).replace(',', '.')) * 10) / 10;
    if (!(peso >= 25 && peso <= 350)) throw new Error('Peso no válido: ' + peticion.peso_kg + '.');
    const fecha = peticion.fecha || fechaIso_(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || fecha > fechaIso_(new Date())) throw new Error('Fecha no válida: ' + fecha + '.');
    conBloqueo_(() => {
      if (!actualizarFilas_('pesos', f => f.fecha === fecha, { peso_kg: peso })) anadirFilas_('pesos', [{ fecha: fecha, peso_kg: peso }]);
    });
    return ACCIONES.progreso();
  },

  // Todos los alimentos (para Ajustes), con cuántas recetas activas los usan y si están excluidos.
  alimentos: function () {
    const usos = {};
    recetasActivas_(leerRecetasPorId_()).forEach(r => r.ingredientes_fijos.concat(r.ingredientes_escalables).forEach(i => {
      usos[i.alimento] = (usos[i.alimento] || 0) + 1;
    }));
    const excluidos = new Set(leerTabla_('preferencias').filter(p => p.tipo === 'excluido').map(p => p.alimento_id));
    return leerTabla_('alimentos').map(a => ({ id: a.id, nombre: a.nombre || a.id, grupo: a.grupo, estado: a.estado,
      recetas: usos[a.id] || 0, excluido: excluidos.has(a.id) }))
      .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  },

  // Cambia el nombre que se muestra de un alimento (el id no cambia). Petición: {id, nombre}.
  renombrarAlimento: function (peticion) {
    const nombre = String(peticion.nombre || '').trim();
    if (!nombre || nombre.length > 60) throw new Error('El nombre debe tener entre 1 y 60 letras.');
    const cambiadas = conBloqueo_(() => actualizarFilas_('alimentos', f => f.id === peticion.id, { nombre: nombre }));
    if (!cambiadas) throw new Error('No existe el alimento ' + peticion.id + '.');
    return { id: peticion.id, nombre: nombre };
  },

  // Sustituye la lista de alimentos excluidos (las alergias y favoritos no se tocan). Petición: {alimentos: [ids]}.
  guardarExcluidos: function (peticion) {
    const ids = Array.from(new Set(peticion.alimentos || []));
    const existentes = new Set(leerTabla_('alimentos').map(a => a.id));
    const desconocido = ids.find(id => !existentes.has(id));
    if (desconocido) throw new Error('No existe el alimento ' + desconocido + '.');
    conBloqueo_(() => {
      const otras = leerTabla_('preferencias').filter(p => p.tipo !== 'excluido');
      reescribirTabla_('preferencias', otras.concat(ids.map(id => ({ tipo: 'excluido', alimento_id: id, nota: '' }))));
    });
    return ids;
  },

  // ---------- Recetas con IA (RecetasIA.js) ----------

  // Recetas propuestas por la IA pendientes de revisar, con sus gramos o con los alimentos que les faltan.
  propuestas: function () {
    return listarPropuestas_();
  },

  // Instrucciones y datos para escribir recetas en Claude Code. Petición: {comida, cantidad?, idea?}.
  pedidoRecetas: function (peticion) {
    return pedidoRecetasIA_(peticion);
  },

  // Recetas escritas en Claude Code. Petición: {comida, recetas, probar?}. Con `probar` no guarda nada.
  importarPropuestas: function (peticion) {
    return importarPropuestasIA_(peticion);
  },

  // Petición: {receta_id}. La propuesta pasa a la biblioteca.
  aceptarPropuesta: function (peticion) {
    return aceptarPropuestaIA_(peticion);
  },

  // Petición: {receta_id}.
  descartarPropuesta: function (peticion) {
    return descartarPropuestaIA_(peticion);
  },

  // Alimento nuevo que pide una propuesta, con los valores por 100 g que mete el usuario.
  // Petición: {alimento: {id, nombre, grupo, estado, kcal_100, proteina_100, carbohidratos_100, grasa_100, gramos_por_unidad}}.
  anadirAlimento: function (peticion) {
    return anadirAlimentoIA_(peticion);
  },
};

// Lee `planes` y, si el plan «siguiente» ya ha empezado, lo pasa a activo (y el activo a archivado).
function planesAlDia_() {
  const planes = leerTabla_('planes');
  // Sin bloqueo propio: se llama también desde dentro de otros bloqueos (y escribir lo mismo dos veces no hace daño).
  if (promoverPlanes_(planes, fechaIso_(new Date()))) reescribirTabla_('planes', planes);
  return planes;
}

// Cómo fue el bloque que termina (el activo o, si no hay, el último archivado) y la propuesta de ajuste
// para el siguiente. null si no hay bloque anterior.
function balanceBloque_(planes, comidas, config, hoy) {
  const ref = planes.find(p => p.estado === 'activo') ||
    planes.filter(p => p.estado === 'archivado').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)))[0];
  if (!ref) return null;
  const pesos = normalizarPesos_(leerTabla_('pesos'));
  const pesajes = pesos.filter(p => p.fecha >= ref.inicio && p.fecha <= hoy).length;
  const ritmo = ritmoSemanal_(pesos, hoy);
  const adherencia = adherencia_(comidas.filter(c => c.plan_id === ref.plan_id), ref.inicio, hoy, config.comida_libre_semanal !== false);
  const perfil = config.perfil || {};
  const propuesta = proponerAjuste_({
    ritmo: ritmo, adherencia: adherencia.pct, pesajes: pesajes, objetivos: objetivosDeConfig_(config),
    kcalMinimas: Number(config.kcal_minimas) || 1400,
    peso: pesos.length ? pesoReferencia_(pesos[pesos.length - 1].peso, perfil.altura_cm) : null,
    meta: perfil.meta, proteinaMinima: proteinaMinimaGKg_(perfil.meta),
  });
  return { plan_id: ref.plan_id, bloque: numeroBloque_(planes, ref), inicio: ref.inicio, fin: ref.fin,
    pesajes: pesajes, ritmo: ritmo, adherencia: adherencia, propuesta: propuesta };
}

const ESTADOS_COMIDA = ['si', 'no', 'libre'];

function mismosObjetivos_(a, b) {
  return Boolean(a) && COMIDAS.every(c => a[c] && ['kcal', 'P', 'C', 'G'].every(n => Number(a[c][n]) === Number(b[c][n])));
}
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

// Todas las recetas (activas o no) con los ingredientes ya convertidos: {id: receta}.
function leerRecetasPorId_() {
  const porId = {};
  leerTabla_('recetas').forEach(fila => {
    try {
      porId[fila.id] = filaAReceta_(fila);
    } catch (err) {
      porId[fila.id] = Object.assign({}, fila, { error: err.message });
    }
  });
  return porId;
}

function leerConfig_() {
  return configAObjeto_(leerTabla_('config'));
}

// Crea o actualiza una fila de `config`. Usa un bloqueo para que dos peticiones no pisen la misma fila.
function guardarConfig_(clave, valor) {
  conBloqueo_(() => escribirConfig_(clave, valor));
}
