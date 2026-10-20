// Conversión entre planes generados, filas de las tablas `planes` y `plan_comidas` y lo que ve la PWA.
// Funciones puras.

// Plan generado → {plan: fila de `planes`, comidas: filas de `plan_comidas`}.
function filasDesdePlan_(generado, planId, objetivos, tolerancias, creado) {
  const plan = {
    plan_id: planId,
    inicio: generado.inicio,
    fin: generado.fin,
    estado: 'borrador',
    objetivos: { comidas: objetivos, tolerancias: tolerancias },
    creado: creado,
  };
  const comidas = [];
  generado.dias.forEach(d => d.comidas.forEach(c => {
    const m = redondearMacros_(c.macros);
    comidas.push({
      plan_id: planId,
      fecha: d.fecha,
      comida: c.comida,
      receta_id: c.receta_id,
      gramos: c.gramos,
      kcal: m.kcal,
      P: m.P,
      C: m.C,
      G: m.G,
      hecha: 'no',
      cambiada_por: '',
      fijados: textoFijados_(c.fijados),
    });
  }));
  return { plan: plan, comidas: comidas };
}

// Gramos elegidos por la persona tal como se guardan en `plan_comidas.fijados`: vacío si no hay ninguno.
function textoFijados_(fijados) {
  return fijados && Object.keys(fijados).length ? fijados : '';
}

// Ingredientes de una comida guardada, con nombre, crudo/cocinado, grupo, si es escalable, piezas y si sus
// gramos los ha elegido la persona (`fijado`). Orden: el de la receta, primero los escalables (no el de las
// claves de `gramos`, que Postgres reordena).
function ingredientesDeComida_(gramos, receta, alimentos, fijados) {
  const escalables = {};
  ((receta && receta.ingredientes_escalables) || []).forEach(e => { escalables[e.alimento] = e; });
  const orden = Object.keys(escalables).concat(((receta && receta.ingredientes_fijos) || []).map(f => f.alimento));
  const posicion = id => (orden.indexOf(id) < 0 ? orden.length : orden.indexOf(id));
  return Object.keys(gramos).map(id => {
    const a = alimentos[id] || { nombre: id, estado: '', grupo: '' };
    const ing = { alimento: id, nombre: a.nombre, estado: a.estado, grupo: a.grupo, gramos: gramos[id], escalable: Boolean(escalables[id]) };
    if (escalables[id] && escalables[id].unidad && a.gramos_unidad) ing.piezas = Math.round(gramos[id] / a.gramos_unidad);
    if (fijados && id in fijados) ing.fijado = true;
    return ing;
  }).sort((x, y) => posicion(x.alimento) - posicion(y.alimento));
}

// Receta que se come en una fila de `plan_comidas`: la cambiada si se cambió el plato; si no, la original.
function recetaDeComida_(fila) {
  return fila.cambiada_por || fila.receta_id;
}

// Fila de `planes` + sus filas de `plan_comidas` → plan por días para la PWA, con totales y evaluación.
// valoraciones: {receta_id: valor} con la última valoración de cada receta (opcional).
function vistaPlan_(filaPlan, filasComidas, recetasPorId, alimentos, valoraciones) {
  const objetivos = parsearValor_(filaPlan.objetivos) || {};
  const objComidas = objetivos.comidas || {};
  const tolDia = (objetivos.tolerancias || {}).dia;
  const objetivoDia = sumarMacros_(COMIDAS.map(c => objComidas[c] || { kcal: 0, P: 0, C: 0, G: 0 }));

  const porFecha = {};
  filasComidas.forEach(f => {
    const recetaId = recetaDeComida_(f);
    const receta = recetasPorId[recetaId];
    const fijados = parsearValor_(f.fijados) || {};
    (porFecha[f.fecha] = porFecha[f.fecha] || []).push({
      comida: f.comida,
      receta_id: recetaId,
      cambiada: recetaId !== f.receta_id,
      nombre: receta ? receta.nombre : recetaId,
      preparacion: receta ? receta.preparacion : '',
      ingredientes: ingredientesDeComida_(parsearValor_(f.gramos) || {}, receta, alimentos, fijados),
      fijados: fijados,
      macros: { kcal: Number(f.kcal), P: Number(f.P), C: Number(f.C), G: Number(f.G) },
      objetivo: objComidas[f.comida] || null,
      hecha: f.hecha || 'no',
      valoracion: (valoraciones || {})[recetaId] || null,
    });
  });

  const dias = Object.keys(porFecha).sort().map(fecha => {
    const comidas = porFecha[fecha].sort((a, b) => COMIDAS.indexOf(a.comida) - COMIDAS.indexOf(b.comida));
    const macros = sumarMacros_(comidas.map(c => c.macros));
    const evaluacion = tolDia ? evaluarDia_(macros, objetivoDia, tolDia) : null;
    return { fecha: fecha, comidas: comidas, macros: macros, evaluacion: evaluacion, revisar: evaluacion ? !evaluacion.ok : false };
  });

  return {
    plan_id: filaPlan.plan_id,
    inicio: filaPlan.inicio,
    fin: filaPlan.fin,
    estado: filaPlan.estado,
    creado: filaPlan.creado,
    objetivoDia: objetivoDia,
    dias: dias,
  };
}

// Plan cuyas recetas se penalizan al generar: el activo o, si no hay, el último archivado.
function planDeReferencia_(planes) {
  const activo = planes.find(p => p.estado === 'activo');
  if (activo) return activo;
  const archivados = planes.filter(p => p.estado === 'archivado').sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  return archivados[0] || null;
}

// Si el plan «siguiente» ya ha empezado, pasa a activo y el activo a archivado. Cambia `planes` y
// devuelve si ha cambiado algo.
function promoverPlanes_(planes, hoy) {
  const siguiente = planes.find(p => p.estado === 'siguiente');
  if (!siguiente || siguiente.inicio > hoy) return false;
  planes.forEach(p => {
    if (p.estado === 'activo') p.estado = 'archivado';
  });
  siguiente.estado = 'activo';
  return true;
}

// Número de bloque de un plan: 1 para el primero que se usó, 2 para el siguiente… (los borradores
// descartados no cuentan).
function numeroBloque_(planes, plan) {
  return planes.filter(p => p.estado !== 'borrador' && p.plan_id !== plan.plan_id && String(p.inicio) < String(plan.inicio)).length + 1;
}

// Recalcula gramos y macros de unas filas de `plan_comidas` para otros objetivos, con los mismos platos y los
// gramos que haya elegido la persona (`fijados`). Cambia las filas.
function reoptimizarComidas_(filas, objetivos, recetasPorId, alimentos) {
  filas.forEach(f => {
    const receta = recetasPorId[recetaDeComida_(f)];
    if (!receta || receta.error) throw new Error('No se puede recalcular la receta ' + recetaDeComida_(f) + '.');
    const ajuste = ajustarReceta_(receta, objetivos[f.comida], alimentos, null, parsearValor_(f.fijados));
    const m = redondearMacros_(ajuste.macros);
    Object.assign(f, { gramos: ajuste.gramos, kcal: m.kcal, P: m.P, C: m.C, G: m.G, fijados: textoFijados_(ajuste.fijados) });
  });
  return filas;
}

if (typeof module !== 'undefined') {
  module.exports = { recetaDeComida_, textoFijados_, filasDesdePlan_, ingredientesDeComida_, vistaPlan_, planDeReferencia_, promoverPlanes_,
    numeroBloque_, reoptimizarComidas_ };
}
