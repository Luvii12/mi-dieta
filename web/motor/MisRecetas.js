// Recetas que crea cada persona en la app (pestaña Recetas › «Crear receta», «Mi versión» y «Editar»).
// Quien la crea pone los gramos de una ración como la haría; la app decide qué ingredientes se ajustan
// (proteína, lácteos, hidratos y grasas, entre la mitad y 1,6 veces lo que puso) y cuáles quedan fijos
// (verduras y condimentos). Se guardan en la biblioteca común a la escala del plan de Fran
// (REFERENCIA_COMIDAS), como todas, para que a cada persona le salgan sus raciones.

const GRUPOS_ESCALABLES = ['proteina', 'lacteo', 'carbohidrato', 'grasa'];
const MARGEN_ESCALABLE = { min: 0.5, max: 1.6 };
const MAX_INGREDIENTES = 15;
const MAX_PREPARACION = 2000;
// Para el consejo cuando no cuadra: qué grupos ponen cada macro y ejemplos para añadir.
const GRUPOS_DEL_MACRO = { P: ['proteina', 'lacteo'], C: ['carbohidrato', 'fruta'], G: ['grasa'] };
const EJEMPLOS_MACRO = { P: 'claras, pollo o queso batido', C: 'pan, arroz o patata', G: 'aceite, aguacate o frutos secos' };

// Datos del formulario → receta con fijos y escalables a la escala de referencia. Lanza un Error con el
// primer problema. datos: {comida, nombre, preparacion, ingredientes: [{alimento, gramos}]};
// objetivo: el de esa comida de quien la crea; prohibidos: Set de alimentos que tiene excluidos.
function recetaManual_(datos, objetivo, alimentos, prohibidos) {
  const nombre = String(datos.nombre || '').trim().replace(/\s+/g, ' ');
  if (!nombre || nombre.length > 80) throw new Error('Escribe el nombre de la receta (hasta 80 letras).');
  const preparacion = String(datos.preparacion || '').trim();
  if (preparacion.length > MAX_PREPARACION) throw new Error('La preparación es demasiado larga (hasta 2.000 letras).');
  const lista = Array.isArray(datos.ingredientes) ? datos.ingredientes : [];
  if (!lista.length) throw new Error('Añade los ingredientes.');
  if (lista.length > MAX_INGREDIENTES) throw new Error(`Como mucho ${MAX_INGREDIENTES} ingredientes.`);

  const vistos = new Set();
  const fijos = [];
  const escalables = [];
  lista.forEach(i => {
    const a = alimentos[i.alimento];
    if (!a) throw new Error('No existe el alimento «' + i.alimento + '».');
    if (vistos.has(i.alimento)) throw new Error(a.nombre + ' está repetido.');
    vistos.add(i.alimento);
    if (prohibidos.has(i.alimento)) throw new Error(`Lleva ${a.nombre}, que tienes excluido en Ajustes.`);
    const gramos = Number(String(i.gramos).replace(',', '.'));
    if (!(gramos >= 1 && gramos <= 1000)) throw new Error(`Pon los gramos de ${a.nombre} (de 1 a 1.000).`);
    // A la escala del plan de Fran: quien tiene raciones más pequeñas pone menos gramos.
    const g = gramos / factorRacion_(i.alimento, datos.comida, objetivo, alimentos);
    if (GRUPOS_ESCALABLES.indexOf(a.grupo) < 0) {
      fijos.push({ alimento: i.alimento, gramos: Math.max(1, Math.round(g)) });
    } else if (a.gramos_unidad) {
      const piezas = Math.max(1, Math.round(g / a.gramos_unidad));
      const min = Math.max(1, Math.round(piezas * MARGEN_ESCALABLE.min));
      escalables.push({ alimento: i.alimento, min_g: min * a.gramos_unidad,
        max_g: Math.max(min, Math.round(piezas * MARGEN_ESCALABLE.max)) * a.gramos_unidad, unidad: true });
    } else {
      escalables.push({ alimento: i.alimento, min_g: Math.round(g * MARGEN_ESCALABLE.min),
        max_g: Math.max(1, Math.round(g * MARGEN_ESCALABLE.max)), unidad: false });
    }
  });
  if (!escalables.length) throw new Error('Añade al menos un ingrediente con proteína, hidratos o grasa: son los que se ajustan a tu objetivo.');
  return { comida: datos.comida, nombre: nombre, preparacion: preparacion, ingredientes_fijos: fijos, ingredientes_escalables: escalables };
}

// Qué cambiar si la receta no cuadra con el objetivo de su comida (evaluación de ajustarReceta_).
function consejoReceta_(ajuste, alimentos) {
  const detalle = ajuste.evaluacion.detalle;
  const principal = macro => {
    const delGrupo = ajuste.ingredientes.filter(i => GRUPOS_DEL_MACRO[macro].indexOf(alimento_(i.alimento, alimentos).grupo) >= 0);
    delGrupo.sort((a, b) => b.gramos - a.gramos);
    return delGrupo.length ? delGrupo[0].nombre : null;
  };
  const consejos = ['P', 'C', 'G'].filter(n => !detalle[n].ok).map(n => {
    const nombre = principal(n);
    const que = NOMBRE_NUTRIENTE[n];
    if (detalle[n].desvio_pct < 0) {
      return `le ${n === 'C' ? 'faltan' : 'falta'} ${que}: ${nombre ? 'pon más ' + nombre.toLowerCase() : 'añade ' + EJEMPLOS_MACRO[n]}`;
    }
    return `le ${n === 'C' ? 'sobran' : 'sobra'} ${que}${nombre ? ': pon menos ' + nombre.toLowerCase() : ''}`;
  });
  if (!consejos.length && !detalle.kcal.ok) {
    consejos.push(detalle.kcal.desvio_pct < 0 ? 'se queda corta de calorías: pon algo más de cantidad' : 'se pasa de calorías: pon algo menos de cantidad');
  }
  const texto = consejos.join('; ');
  return texto.charAt(0).toUpperCase() + texto.slice(1) + '.';
}

// ---------- Con el almacén ----------

// Petición: {receta: {id?, comida, nombre, preparacion, ingredientes}, version_de?, probar?}.
// Calcula la receta para quien la crea y, sin `probar`, la guarda: nueva (id R1, R2…, origen manual) o
// cambiando la suya (`id`; la comida no cambia). Con `version_de` (receta en la que se basa), esa deja de
// salirle en los planes («No repetiría»). Si no cuadra con su comida se puede guardar igualmente: lleva
// `aviso`. Al editar, sus planes recalculan los gramos de esa receta desde hoy (lo no comido).
// Devuelve {id, nombre, comida, ajuste, aviso}.
function guardarRecetaManual_(peticion) {
  const datos = peticion.receta || {};
  const config = leerConfig_();
  const objetivo = objetivosDeConfig_(config)[datos.comida];
  if (!objetivo) throw new Error('Elige la comida.');
  const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
  const filas = leerTabla_('recetas');
  const editada = datos.id ? filas.find(f => f.id === datos.id && f.activa === 'si') : null;
  if (datos.id && !editada) throw new Error('No existe la receta ' + datos.id + '.');
  if (editada && editada.comida !== datos.comida) throw new Error('Al editar no se puede cambiar la comida: crea una receta nueva.');
  const base = peticion.version_de ? filas.find(f => f.id === peticion.version_de && f.activa === 'si') : null;
  if (peticion.version_de && !base) throw new Error('No existe la receta ' + peticion.version_de + '.');

  const receta = recetaManual_(datos, objetivo, alimentos, alimentosProhibidos_(leerTabla_('preferencias')));
  const mismoNombre = filas.find(f => (f.activa === 'si' || f.activa === 'propuesta') && f.id !== datos.id &&
    String(f.nombre).trim().toLowerCase() === receta.nombre.toLowerCase());
  if (mismoNombre) throw new Error('Ya hay una receta que se llama «' + mismoNombre.nombre + '».');

  const id = editada ? editada.id : siguienteIdManual_(filas);
  receta.id = id;
  const ajuste = ajustarReceta_(receta, objetivo, alimentos, (config.tolerancias || {}).comida);
  const resultado = { id: id, nombre: receta.nombre, comida: receta.comida, ajuste: ajuste,
    aviso: ajuste.evaluacion && !ajuste.evaluacion.ok ? consejoReceta_(ajuste, alimentos) : null };
  if (peticion.probar) return resultado;

  conBloqueo_(() => {
    const fila = { id: id, comida: receta.comida, nombre: receta.nombre, preparacion: receta.preparacion,
      ingredientes_fijos: receta.ingredientes_fijos, ingredientes_escalables: receta.ingredientes_escalables };
    if (editada) {
      actualizarFilas_('recetas', f => f.id === id, fila);
      recalcularPlanesConReceta_(id);
    } else {
      anadirFilas_('recetas', [Object.assign(fila, { origen: 'manual', activa: 'si' })]);
    }
    if (base && base.id !== id) {
      anadirFilas_('valoraciones', [{ receta_id: base.id, valor: 'no_repetir', fecha: fechaIso_(new Date()) }]);
    }
  });
  return resultado;
}

// Quita una receta de la biblioteca: deja de salir en los planes nuevos (activa = no); las comidas ya
// planificadas con ella se quedan como están. Petición: {receta_id}.
function borrarRecetaManual_(peticion) {
  const fila = leerTabla_('recetas').find(f => f.id === peticion.receta_id && f.activa === 'si');
  if (!fila) throw new Error('No existe la receta ' + peticion.receta_id + '.');
  conBloqueo_(() => actualizarFilas_('recetas', f => f.id === fila.id, { activa: 'no' }));
  return { id: fila.id };
}

function siguienteIdManual_(filas) {
  const n = filas.map(f => /^R(\d+)$/.exec(String(f.id))).filter(Boolean).map(m => Number(m[1]));
  return 'R' + (n.length ? Math.max.apply(null, n) + 1 : 1);
}

// Tras editar una receta: las comidas con ella de hoy en adelante, sin comer, de los planes de quien la
// edita (activo, siguiente y borrador) se recalculan con los ingredientes nuevos.
function recalcularPlanesConReceta_(recetaId) {
  const hoy = fechaIso_(new Date());
  const planes = planesAlDia_().filter(p => ['activo', 'siguiente', 'borrador'].indexOf(p.estado) >= 0);
  const comidas = leerTabla_('plan_comidas');
  const recetasPorId = leerRecetasPorId_();
  const alimentos = indexarAlimentos_(leerTabla_('alimentos'));
  let cambia = false;
  planes.forEach(p => {
    const objetivos = (parsearValor_(p.objetivos) || {}).comidas || {};
    const filas = comidas.filter(f => f.plan_id === p.plan_id && f.fecha >= hoy && f.hecha === 'no' &&
      recetaDeComida_(f) === recetaId && objetivos[f.comida]);
    if (!filas.length) return;
    reoptimizarComidas_(filas, objetivos, recetasPorId, alimentos);
    cambia = true;
  });
  if (cambia) reescribirTabla_('plan_comidas', comidas);
}

if (typeof module !== 'undefined') {
  module.exports = { GRUPOS_ESCALABLES, recetaManual_, consejoReceta_, siguienteIdManual_ };
}
