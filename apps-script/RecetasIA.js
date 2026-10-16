// Recetas propuestas por la IA (Fase 5). Claude propone platos en JSON usando los alimentos de la hoja;
// el código los valida y calcula los gramos. La IA nunca da valores nutricionales.
// Las escribe Claude Code con la suscripción del usuario (sin API de pago): pide `pedidoRecetas`, escribe las
// recetas y las manda con `importarPropuestas` (scripts/recetas_ia.js). La versión que llamaba a la API desde
// Apps Script está en el historial de git (commit 3fb63e7); se quitó para no pedir permiso de servicios externos.
//
// Una receta propuesta se guarda en `recetas` con origen = ia y activa = propuesta hasta que el usuario la
// añade a la biblioteca (activa = si) o la descarta (activa = descartada). Si necesita un alimento que no
// está en la hoja, el ingrediente lleva `nuevo: {nombre, grupo, estado}` y la receta espera a que el
// usuario añada ese alimento con los valores de la etiqueta o de BEDCA.

const RECETAS_POR_PETICION = 3;
const MAX_ALIMENTOS_NUEVOS = 2;
const GRUPOS_ALIMENTO = ['proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura_condimento'];
const ESTADOS_ALIMENTO = ['crudo', 'cocinado'];
const PATRON_ID_ALIMENTO = /^[a-z][a-z0-9_]{1,40}$/;

// Formato de las recetas que escribe Claude (JSON Schema).
const ESQUEMA_RECETAS_IA = {
  type: 'object',
  additionalProperties: false,
  required: ['recetas'],
  properties: {
    recetas: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nombre', 'preparacion', 'ingredientes_fijos', 'ingredientes_escalables', 'alimentos_nuevos'],
        properties: {
          nombre: { type: 'string' },
          preparacion: { type: 'string' },
          ingredientes_fijos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['alimento', 'gramos'],
            properties: { alimento: { type: 'string' }, gramos: { type: 'number' } } } },
          ingredientes_escalables: { type: 'array', items: { type: 'object', additionalProperties: false,
            required: ['alimento', 'min_g', 'max_g', 'unidad'],
            properties: { alimento: { type: 'string' }, min_g: { type: 'number' }, max_g: { type: 'number' }, unidad: { type: 'boolean' } } } },
          alimentos_nuevos: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'nombre', 'grupo', 'estado'],
            properties: { id: { type: 'string' }, nombre: { type: 'string' }, grupo: { type: 'string', enum: GRUPOS_ALIMENTO },
              estado: { type: 'string', enum: ESTADOS_ALIMENTO } } } },
        },
      },
    },
  },
};

const SISTEMA_RECETAS_IA = [
  'Eres un cocinero que diseña recetas para la app de dieta personal de Fran (España). Los gramos los calcula',
  'después un optimizador a partir de una tabla de alimentos: tú eliges los platos, los ingredientes y sus límites,',
  'nunca valores nutricionales.',
  '',
  'Cómo es una buena receta:',
  '- Que apetezca: platos reconocibles de cocina española o de otros países (fajitas, poke, boloñesa, pulpo a la',
  '  gallega, pizza, tacos, curry…), no «pechuga con brócoli».',
  '- Ingredientes de supermercado español (Mercadona). Preparación de 25 minutos o menos.',
  '- Versiones ligeras: yogur o queso batido en lugar de nata, carne picada 5 %, freidora de aire, mozzarella light.',
  '',
  'Cómo se escribe:',
  '- `ingredientes_escalables`: los 2 a 4 ingredientes que ponen los macros (proteína, hidrato, grasa). El optimizador',
  '  elige sus gramos entre `min_g` y `max_g`, así que pon límites realistas para una ración y lo bastante amplios para',
  '  llegar al objetivo de la comida. El aceite siempre va aquí, medido (por ejemplo 3–15 ml).',
  '- `unidad: true` solo para alimentos que se cuentan por piezas y tienen gramos por unidad en la tabla (huevos,',
  '  rebanadas…); entonces `min_g` y `max_g` son múltiplos de esos gramos.',
  '- `ingredientes_fijos`: lo que da sabor y textura (tomate triturado, cebolla, salsa…), en gramos fijos.',
  '- Especias, hierbas, ajo, limón, vinagre, sal y café no van en ingredientes: solo en la preparación.',
  '- Los gramos son en el estado que indica la tabla (crudo o cocinado).',
  '- `preparacion`: 2 a 5 pasos breves en español de España, separados por punto y coma.',
  '- Usa solo los `id` de la tabla de alimentos. Si un plato de verdad necesita un alimento que no está, usa un `id`',
  '  nuevo en minúsculas con guiones bajos (por ejemplo `salmon_ahumado`) y descríbelo en `alimentos_nuevos` (nombre,',
  '  grupo y si se pesa crudo o cocinado). Como mucho uno por receta, y solo si aporta mucho al plato; si no, deja',
  '  `alimentos_nuevos` vacío.',
  '- Nunca uses los alimentos excluidos, ni como nuevos.',
  '- No repitas platos de la lista de recetas existentes ni hagas variaciones casi iguales entre sí.',
].join('\n');

// Mensaje para Claude con todo lo que necesita: comida, objetivo, tabla de alimentos y recetas que ya hay.
// ctx: {comida, cantidad, idea, objetivo, alimentosFilas, excluidos: Set, recetas: [{comida, nombre}],
//       favoritas: [nombres], noGustan: [nombres], descartadas: [{nombre, motivo}] (del intento anterior)}
function mensajeRecetasIA_(ctx) {
  const tabla = ctx.alimentosFilas
    .filter(a => !ctx.excluidos.has(a.id))
    .map(a => [a.id, a.nombre || a.id, a.grupo, a.estado, a.gramos_por_unidad ? a.gramos_por_unidad + ' g/ud' : ''].join(' | '))
    .join('\n');
  const excluidos = ctx.alimentosFilas.filter(a => ctx.excluidos.has(a.id)).map(a => a.nombre || a.id);
  const deLaComida = ctx.recetas.filter(r => r.comida === ctx.comida).map(r => r.nombre);
  const o = ctx.objetivo;
  const partes = [
    `Propón ${ctx.cantidad} ${ctx.cantidad === 1 ? 'receta' : 'recetas'} de ${ctx.comida.toLowerCase()}, distintas entre sí.`,
    ctx.idea ? `Idea de Fran para esta tanda: ${ctx.idea}` : '',
    `Objetivo de una ración: ${o.kcal} kcal, ${o.P} g de proteína, ${o.C} g de hidratos y ${o.G} g de grasa. Los límites de los escalables tienen que permitir llegar a él.`,
    `Tabla de alimentos (id | nombre | grupo | estado | gramos por unidad):\n${tabla}`,
    excluidos.length ? `Alimentos excluidos (no los uses nunca): ${excluidos.join(', ')}.` : '',
    deLaComida.length ? `Recetas de ${ctx.comida.toLowerCase()} que ya existen (no las repitas):\n- ${deLaComida.join('\n- ')}` : '',
    ctx.favoritas.length ? `Platos que le encantan (para inspirarte, sin copiarlos): ${ctx.favoritas.join('; ')}.` : '',
    ctx.noGustan.length ? `Platos que no repetiría (evita ese estilo): ${ctx.noGustan.join('; ')}.` : '',
    ctx.descartadas && ctx.descartadas.length
      ? `En el intento anterior se descartaron estas recetas; evita esos fallos:\n- ${ctx.descartadas.map(d => `${d.nombre}: ${d.motivo}`).join('\n- ')}`
      : '',
  ];
  return partes.filter(Boolean).join('\n\n');
}

// Receta tal como la devuelve Claude → receta con el formato de la hoja. Los ingredientes con un alimento
// que no está en la tabla llevan `nuevo` con lo que Claude dijo de él.
function normalizarRecetaIA_(r, comida, alimentos) {
  const nuevos = {};
  (r.alimentos_nuevos || []).forEach(n => { nuevos[n.id] = { nombre: String(n.nombre || n.id).trim(), grupo: n.grupo, estado: n.estado }; });
  const marcar = ing => (alimentos[ing.alimento] || !nuevos[ing.alimento] ? ing : Object.assign(ing, { nuevo: nuevos[ing.alimento] }));
  return {
    comida: comida,
    nombre: String(r.nombre || '').trim(),
    preparacion: String(r.preparacion || '').trim(),
    ingredientes_fijos: (r.ingredientes_fijos || []).map(f => marcar({ alimento: String(f.alimento), gramos: Number(f.gramos) })),
    ingredientes_escalables: (r.ingredientes_escalables || []).map(e => {
      const a = alimentos[e.alimento];
      // `unidad` solo si el alimento tiene gramos por unidad; si no, el redondeo fallaría.
      const unidad = Boolean(e.unidad) && (!a || Boolean(a.gramos_unidad));
      return marcar({ alimento: String(e.alimento), min_g: Number(e.min_g), max_g: Number(e.max_g), unidad: unidad });
    }),
  };
}

// ¿Se puede usar esta receta? Devuelve una de estas:
//   {estado: 'valida', ajuste}                  — pasa el optimizador dentro de la tolerancia de la comida
//   {estado: 'falta_alimento', faltan: [...]}   — necesita alimentos que aún no están en la hoja
//   {estado: 'descartada', motivo}              — no se puede usar (y se dice por qué)
// ctx: {alimentos (índice), excluidos: Set, objetivo, tolComida}
function evaluarRecetaIA_(receta, ctx) {
  const descartar = motivo => ({ estado: 'descartada', motivo: motivo });
  const todos = receta.ingredientes_fijos.concat(receta.ingredientes_escalables);
  if (!receta.nombre || receta.nombre.length > 120) return descartar('No tiene un nombre válido.');
  if (!receta.preparacion) return descartar('No tiene preparación.');
  if (!receta.ingredientes_escalables.length) return descartar('No tiene ingredientes que se puedan ajustar.');
  const malFijo = receta.ingredientes_fijos.find(f => !(f.gramos > 0 && f.gramos <= 1000));
  if (malFijo) return descartar(`Cantidad no válida de ${malFijo.alimento}.`);
  const malEscalable = receta.ingredientes_escalables.find(e => !(e.min_g >= 0 && e.max_g > 0 && e.max_g >= e.min_g && e.max_g <= 1000));
  if (malEscalable) return descartar(`Límites no válidos de ${malEscalable.alimento}.`);
  const ids = receta.ingredientes_escalables.map(e => e.alimento);
  if (new Set(ids).size !== ids.length) return descartar('Repite un ingrediente ajustable.');

  const excluido = todos.find(i => ctx.excluidos.has(i.alimento));
  if (excluido) return descartar(`Lleva ${nombreIngrediente_(excluido, ctx.alimentos)}, que está excluido.`);

  const faltan = [];
  todos.filter(i => !ctx.alimentos[i.alimento]).forEach(i => {
    if (faltan.some(f => f.id === i.alimento)) return;
    if (!i.nuevo || !PATRON_ID_ALIMENTO.test(i.alimento)) faltan.push({ id: i.alimento, desconocido: true });
    else faltan.push(Object.assign({ id: i.alimento }, i.nuevo));
  });
  const desconocido = faltan.find(f => f.desconocido);
  if (desconocido) return descartar(`Usa «${desconocido.id}», que no está en la tabla de alimentos.`);
  if (faltan.length > MAX_ALIMENTOS_NUEVOS) return descartar('Necesita demasiados alimentos nuevos.');
  if (faltan.length) return { estado: 'falta_alimento', faltan: faltan };

  let ajuste;
  try {
    ajuste = ajustarReceta_(receta, ctx.objetivo, ctx.alimentos, ctx.tolComida);
  } catch (err) {
    return descartar(err.message);
  }
  if (!ajuste.evaluacion.ok) return descartar('No cuadra con el objetivo: ' + desviaciones_(ajuste.evaluacion) + '.');
  return { estado: 'valida', ajuste: ajuste };
}

const NOMBRE_NUTRIENTE = { kcal: 'calorías', P: 'proteína', C: 'hidratos', G: 'grasa' };

// Evaluación de una comida → 'proteína −22 %, grasa +30 %' (solo lo que se sale).
function desviaciones_(evaluacion) {
  return NUTRIENTES.filter(n => !evaluacion.detalle[n].ok).map(n => {
    const d = Math.round(evaluacion.detalle[n].desvio_pct);
    return `${NOMBRE_NUTRIENTE[n]} ${d > 0 ? '+' : '−'}${Math.abs(d)} %`;
  }).join(', ');
}

function nombreIngrediente_(ing, alimentos) {
  return (alimentos[ing.alimento] && alimentos[ing.alimento].nombre) || (ing.nuevo && ing.nuevo.nombre) || ing.alimento;
}

// Quita `nuevo` de los ingredientes (cuando el alimento ya está en la hoja).
function limpiarIngredientesIA_(receta) {
  const limpiar = ing => {
    const copia = Object.assign({}, ing);
    delete copia.nuevo;
    return copia;
  };
  return { ingredientes_fijos: receta.ingredientes_fijos.map(limpiar), ingredientes_escalables: receta.ingredientes_escalables.map(limpiar) };
}

// 'IA1', 'IA2'… el siguiente número libre.
function siguienteIdIA_(existentes) {
  const n = existentes.map(id => /^IA(\d+)$/.exec(id)).filter(Boolean).map(m => Number(m[1]));
  return 'IA' + (n.length ? Math.max.apply(null, n) + 1 : 1);
}

// Comprueba los datos de un alimento nuevo (por 100 g) y devuelve la fila para la pestaña `alimentos`.
function filaAlimentoNuevo_(datos, idsExistentes) {
  const id = String(datos.id || '').trim();
  if (!PATRON_ID_ALIMENTO.test(id)) throw new Error('Identificador de alimento no válido: «' + id + '».');
  if (idsExistentes.indexOf(id) >= 0) throw new Error('Ya existe el alimento ' + id + '.');
  const nombre = String(datos.nombre || '').trim();
  if (!nombre || nombre.length > 60) throw new Error('El nombre debe tener entre 1 y 60 letras.');
  if (GRUPOS_ALIMENTO.indexOf(datos.grupo) < 0) throw new Error('Grupo no válido.');
  if (ESTADOS_ALIMENTO.indexOf(datos.estado) < 0) throw new Error('Indica si se pesa crudo o cocinado.');
  const num = v => (v === '' || v === null || v === undefined ? NaN : Number(String(v).replace(',', '.')));
  const kcal = num(datos.kcal_100);
  const P = num(datos.proteina_100);
  const C = num(datos.carbohidratos_100);
  const G = num(datos.grasa_100);
  if (!(kcal >= 0 && kcal <= 900)) throw new Error('Las calorías por 100 g deben estar entre 0 y 900.');
  if ([P, C, G].some(v => !(v >= 0 && v <= 100))) throw new Error('Proteína, hidratos y grasa deben estar entre 0 y 100 g.');
  if (P + C + G > 100.5) throw new Error('Proteína, hidratos y grasa suman más de 100 g por cada 100 g.');
  // Las kcal de la etiqueta y las de los macros (4/4/9) deben parecerse; la fibra y el redondeo explican
  // diferencias pequeñas.
  const kcalMacros = P * 4 + C * 4 + G * 9;
  if (Math.abs(kcalMacros - kcal) > Math.max(25, kcal * 0.2)) {
    throw new Error(`Los macros suman ${Math.round(kcalMacros)} kcal (P y C × 4, G × 9) y has puesto ${Math.round(kcal)}. Revisa los valores.`);
  }
  let unidad = '';
  if (datos.gramos_por_unidad !== '' && datos.gramos_por_unidad !== null && datos.gramos_por_unidad !== undefined) {
    unidad = num(datos.gramos_por_unidad);
    if (!(unidad > 0 && unidad <= 1000)) throw new Error('Los gramos por unidad deben estar entre 1 y 1.000 (o vacíos).');
  }
  const redondear = v => Math.round(v * 10) / 10;
  return { id: id, nombre: nombre, grupo: datos.grupo, kcal_100: redondear(kcal), proteina_100: redondear(P),
    carbohidratos_100: redondear(C), grasa_100: redondear(G), gramos_por_unidad: unidad, estado: datos.estado,
    fuente: 'usuario (etiqueta/BEDCA)', verificado: 'si', codigo_barras: '' };
}

// ---------- Con Google (hoja) ----------

// Datos comunes para pedir y evaluar recetas de IA.
function contextoIA_() {
  const config = leerConfig_();
  const alimentosFilas = leerTabla_('alimentos');
  return {
    config: config,
    alimentosFilas: alimentosFilas,
    alimentos: indexarAlimentos_(alimentosFilas),
    excluidos: alimentosProhibidos_(leerTabla_('preferencias')),
    tolComida: (config.tolerancias || {}).comida,
    objetivos: objetivosDeConfig_(config),
  };
}

// Receta propuesta (fila de la hoja) → lo que ve la app: con gramos si es válida, o con lo que falta.
function vistaPropuesta_(fila, ctx) {
  const receta = filaAReceta_(fila);
  const evaluacion = evaluarRecetaIA_(receta, Object.assign({ objetivo: ctx.objetivos[receta.comida] }, ctx));
  const vista = { id: receta.id, comida: receta.comida, nombre: receta.nombre, preparacion: receta.preparacion, estado: evaluacion.estado };
  if (evaluacion.ajuste) vista.ajuste = evaluacion.ajuste;
  if (evaluacion.faltan) {
    vista.faltan = evaluacion.faltan;
    // Para enseñar la receta aunque aún no tenga gramos: ingredientes con sus límites.
    const con = (ing, datos) => Object.assign(datos, { alimento: ing.alimento, nombre: nombreIngrediente_(ing, ctx.alimentos),
      nuevo: !ctx.alimentos[ing.alimento] });
    vista.ingredientes = receta.ingredientes_fijos.map(f => con(f, { gramos: f.gramos, escalable: false }))
      .concat(receta.ingredientes_escalables.map(e => con(e, { min_g: e.min_g, max_g: e.max_g, escalable: true })));
  }
  if (evaluacion.motivo) vista.motivo = evaluacion.motivo;
  return vista;
}

function listarPropuestas_() {
  const ctx = contextoIA_();
  return leerTabla_('recetas').filter(f => f.activa === 'propuesta').map(f => vistaPropuesta_(f, ctx));
}

// Lo que necesita quien escriba las recetas: el comida/cantidad/idea pedidos, con la comida validada, y el
// mensaje con la tabla de alimentos, el objetivo, las recetas existentes y las valoraciones.
function datosPedidoIA_(peticion, extra) {
  const comida = peticion.comida;
  if (COMIDAS.indexOf(comida) < 0) throw new Error('Comida no válida: ' + comida + '.');
  const ctx = contextoIA_();
  const filasRecetas = leerTabla_('recetas');
  const valoraciones = ultimasValoraciones_(leerTabla_('valoraciones'));
  const nombre = id => (filasRecetas.find(f => f.id === id) || {}).nombre;
  const conValor = valor => Object.keys(valoraciones).filter(id => valoraciones[id] === valor).map(nombre).filter(Boolean);
  const pedido = {
    comida: comida,
    cantidad: Math.min(Math.max(Math.round(Number(peticion.cantidad) || RECETAS_POR_PETICION), 1), 5),
    idea: String(peticion.idea || '').trim().slice(0, 200),
  };
  const mensaje = otras => mensajeRecetasIA_(Object.assign({ objetivo: ctx.objetivos[comida], alimentosFilas: ctx.alimentosFilas,
    excluidos: ctx.excluidos, favoritas: conValor('me_encanta'), noGustan: conValor('no_repetir'), descartadas: [] }, pedido,
  { recetas: filasRecetas }, otras || {}));
  return { pedido: pedido, ctx: ctx, filasRecetas: filasRecetas, mensaje: mensaje };
}

// Revisa recetas con el formato de ESQUEMA_RECETAS_IA. Devuelve {validas: [receta normalizada], descartadas:
// [{nombre, motivo}]}. `yaElegidas`: recetas aceptadas antes en la misma tanda (para no repetir nombre).
function revisarRecetasIA_(recetasIA, comida, ctx, filasRecetas, yaElegidas) {
  const validas = [];
  const descartadas = [];
  (recetasIA || []).forEach(r => {
    const receta = normalizarRecetaIA_(r, comida, ctx.alimentos);
    const repetida = filasRecetas.concat(yaElegidas || [], validas).some(f => mismoNombre_(f.nombre, receta.nombre));
    const evaluacion = repetida ? { estado: 'descartada', motivo: 'Ya hay una receta con ese nombre.' }
      : evaluarRecetaIA_(receta, Object.assign({ objetivo: ctx.objetivos[comida] }, ctx));
    if (evaluacion.estado === 'descartada') descartadas.push({ nombre: receta.nombre || 'Sin nombre', motivo: evaluacion.motivo });
    else validas.push(Object.assign(receta, { evaluacion: evaluacion }));
  });
  return { validas: validas, descartadas: descartadas };
}

// Guarda recetas revisadas como propuestas (IA1, IA2…). Devuelve sus ids.
function guardarPropuestasIA_(recetas) {
  const ids = [];
  conBloqueo_(() => {
    const existentes = leerTabla_('recetas').map(f => String(f.id));
    anadirFilas_('recetas', recetas.map(r => {
      const id = siguienteIdIA_(existentes);
      existentes.push(id);
      ids.push(id);
      return { id: id, comida: r.comida, nombre: r.nombre, preparacion: r.preparacion, ingredientes_fijos: r.ingredientes_fijos,
        ingredientes_escalables: r.ingredientes_escalables, origen: 'ia', activa: 'propuesta' };
    }));
  });
  return ids;
}

// Pedido para escribir recetas fuera de la app (Claude Code, con la suscripción): instrucciones, mensaje y esquema.
function pedidoRecetasIA_(peticion) {
  const datos = datosPedidoIA_(peticion);
  return { pedido: datos.pedido, sistema: SISTEMA_RECETAS_IA, mensaje: datos.mensaje(), esquema: ESQUEMA_RECETAS_IA };
}

// Recetas escritas fuera de la app (Claude Code). Petición: {comida, recetas: [formato ESQUEMA_RECETAS_IA], probar}.
// Con `probar` solo dice qué pasaría (y los macros de las válidas), sin guardar nada.
function importarPropuestasIA_(peticion) {
  const datos = datosPedidoIA_(peticion);
  if (!Array.isArray(peticion.recetas) || !peticion.recetas.length) throw new Error('No hay recetas que importar.');
  const revision = revisarRecetasIA_(peticion.recetas, datos.pedido.comida, datos.ctx, datos.filasRecetas);
  const resumen = revision.validas.map(r => {
    const e = r.evaluacion;
    return { nombre: r.nombre, estado: e.estado, macros: e.ajuste ? redondearMacros_(e.ajuste.macros) : null,
      gramos: e.ajuste ? e.ajuste.gramos : null, faltan: e.faltan || null };
  });
  if (peticion.probar) return { validas: resumen, descartadas: revision.descartadas };
  const ids = guardarPropuestasIA_(revision.validas);
  return { nuevas: ids, validas: resumen, descartadas: revision.descartadas, propuestas: listarPropuestas_() };
}

const mismoNombre_ = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Pasa una propuesta a la biblioteca. Solo si ya tiene todos sus alimentos y cuadra con el objetivo.
function aceptarPropuestaIA_(peticion) {
  return conBloqueo_(() => {
    const fila = leerTabla_('recetas').find(f => f.id === peticion.receta_id && f.activa === 'propuesta');
    if (!fila) throw new Error('No hay ninguna propuesta ' + peticion.receta_id + '.');
    const vista = vistaPropuesta_(fila, contextoIA_());
    if (vista.estado === 'falta_alimento') throw new Error('Antes añade ' + vista.faltan.map(f => f.nombre).join(' y ') + ' a tus alimentos.');
    if (vista.estado !== 'valida') throw new Error(vista.motivo);
    const limpios = limpiarIngredientesIA_(filaAReceta_(fila));
    actualizarFilas_('recetas', f => f.id === fila.id, Object.assign({ activa: 'si' }, limpios));
    return { id: fila.id, propuestas: listarPropuestas_() };
  });
}

function descartarPropuestaIA_(peticion) {
  const cambiadas = conBloqueo_(() =>
    actualizarFilas_('recetas', f => f.id === peticion.receta_id && f.activa === 'propuesta', { activa: 'descartada' }));
  if (!cambiadas) throw new Error('No hay ninguna propuesta ' + peticion.receta_id + '.');
  return { id: peticion.receta_id, propuestas: listarPropuestas_() };
}

// Añade a `alimentos` uno nuevo con los valores que mete el usuario. Devuelve las propuestas actualizadas.
function anadirAlimentoIA_(peticion) {
  conBloqueo_(() => {
    const fila = filaAlimentoNuevo_(peticion.alimento || {}, leerTabla_('alimentos').map(a => String(a.id)));
    anadirFilas_('alimentos', [fila]);
  });
  return { propuestas: listarPropuestas_() };
}

if (typeof module !== 'undefined') {
  module.exports = {
    ESQUEMA_RECETAS_IA, SISTEMA_RECETAS_IA, mensajeRecetasIA_, normalizarRecetaIA_, evaluarRecetaIA_, desviaciones_,
    limpiarIngredientesIA_, siguienteIdIA_, filaAlimentoNuevo_,
  };
}
