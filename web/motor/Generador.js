// Generador de planes de 14 días (docs/SPEC.md, «Flujo de generación»). Funciones puras.

const COMIDAS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];
const DIAS_PLAN = 14;
const INTENTOS_POR_DIA = 20;
const REINICIOS_PLAN = 500;
const PLANES_CANDIDATOS = 50;
const INTENTOS_POR_GRUPO = 60;
const PESO_VALORACION = { me_encanta: 3, normal: 1 };
const PENALIZACION_PLAN_ANTERIOR = 0.4;

// ---------- Fechas (ISO 'AAAA-MM-DD', sin zonas horarias) ----------

function sumarDias_(iso, dias) {
  const f = new Date(iso + 'T00:00:00Z');
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

// 0 = lunes … 6 = domingo
function diaSemana_(iso) {
  return (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

// Sin plan activo, el plan empieza el lunes siguiente a hoy. Con uno, el día después de que acabe (aunque no
// sea lunes: el primero de quien se da de alta empieza cualquier día) o, si ya acabó, hoy mismo, para no
// quedarse días sin plan.
function fechaInicioPlan_(hoyIso, finPlanActivo) {
  if (finPlanActivo) return finPlanActivo < hoyIso ? hoyIso : sumarDias_(finPlanActivo, 1);
  return sumarDias_(hoyIso, 7 - diaSemana_(hoyIso));
}

// ---------- Azar reproducible ----------

// Generador pseudoaleatorio con semilla (mulberry32): la misma semilla da el mismo plan (tests).
function azarConSemilla_(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function elegirPonderado_(candidatos, azar) {
  const total = candidatos.reduce((s, c) => s + c.peso, 0);
  let r = azar() * total;
  for (const c of candidatos) {
    r -= c.peso;
    if (r < 0) return c;
  }
  return candidatos[candidatos.length - 1];
}

// ---------- Preparación ----------

// Última valoración de cada receta → {receta_id: valor}.
function ultimasValoraciones_(filas) {
  const ordenadas = filas.slice().sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const resultado = {};
  ordenadas.forEach(v => { resultado[v.receta_id] = v.valor; });
  return resultado;
}

function alimentosProhibidos_(preferencias) {
  return new Set(preferencias.filter(p => p.tipo === 'excluido' || p.tipo === 'alergia').map(p => p.alimento_id));
}

// Recetas que se pueden usar, ya ajustadas a su objetivo y con su peso de selección.
// Devuelve {porComida: {Desayuno: [...], ...}, descartadas: [{id, motivo}]}.
function prepararCandidatas_(recetas, datos) {
  const prohibidos = alimentosProhibidos_(datos.preferencias || []);
  const valoraciones = ultimasValoraciones_(datos.valoraciones || []);
  const anteriores = new Set(datos.recetasPlanAnterior || []);
  const porComida = {};
  const descartadas = [];
  COMIDAS.filter(c => datos.objetivos[c]).forEach(c => { porComida[c] = []; });

  recetas.forEach(r => {
    if (!porComida[r.comida]) return;
    const ingredientes = r.ingredientes_fijos.concat(r.ingredientes_escalables).map(i => i.alimento);
    const prohibido = ingredientes.find(id => prohibidos.has(id));
    if (prohibido) return descartadas.push({ id: r.id, motivo: 'contiene ' + prohibido });
    const valor = valoraciones[r.id] || 'normal';
    if (valor === 'no_repetir') return descartadas.push({ id: r.id, motivo: 'valorada «No lo repetiría»' });
    let ajuste;
    try {
      ajuste = ajustarReceta_(r, datos.objetivos[r.comida], datos.alimentos, null, (datos.gramosReceta || {})[r.id], { prohibidos: prohibidos });
    } catch (err) {
      return descartadas.push({ id: r.id, motivo: err.message });
    }
    let peso = PESO_VALORACION[valor] || 1;
    if (anteriores.has(r.id)) peso *= PENALIZACION_PLAN_ANTERIOR;
    porComida[r.comida].push({ id: r.id, nombre: r.nombre, peso: peso, ajuste: ajuste, macros: redondearMacros_(ajuste.macros) });
  });
  return { porComida: porComida, descartadas: descartadas };
}

// «Mi rotación» (config.rotacion: ids de receta): si la persona ha marcado recetas de una comida, en esa
// comida solo se usan esas (aunque se repitan); en las comidas sin ninguna marcada, toda la biblioteca.
// Devuelve {recetas, comidas: comidas que salen de la rotación}.
function filtrarRotacion_(recetas, rotacion) {
  const ids = new Set(rotacion || []);
  const comidas = new Set(recetas.filter(r => ids.has(r.id)).map(r => r.comida));
  return { recetas: recetas.filter(r => !comidas.has(r.comida) || ids.has(r.id)), comidas: comidas };
}

// «Cocinar para varios días» (config.cocinar_menos): lunes y martes comen lo mismo, miércoles y jueves también,
// y de viernes a domingo, también; todas las semanas del plan, igual.
const GRUPO_DIA = ['A', 'A', 'B', 'B', 'C', 'C', 'C'];
const grupoDia_ = iso => GRUPO_DIA[diaSemana_(iso)];

// Máximo de veces que puede salir cada receta de una comida en el plan, y si se permiten días seguidos
// (con una sola receta, a la fuerza). `dias`: días del plan (14 salvo al rehacer lo que queda de uno).
function reglasRepeticion_(comida, numRecetas, config, dias) {
  const totalDias = dias || DIAS_PLAN;
  const minimo = Math.ceil(totalDias / numRecetas);
  if (comida === 'Desayuno' || comida === 'Merienda') {
    const max = Number(config['max_rep_' + comida.toLowerCase()]) || 4;
    return { max: Math.max(max, minimo), consecutivos: true };
  }
  // Almuerzo y cena: sin repetir si hay recetas suficientes; si no, el mínimo posible y nunca en días seguidos.
  if (numRecetas < 2) return { max: totalDias, consecutivos: true };
  return { max: numRecetas >= totalDias ? 1 : Math.max(2, minimo), consecutivos: false };
}

// Suma de desvíos relativos frente a la tolerancia del día: 0 = perfecto; < 1 en todo = dentro.
// La proteína de más se mide con su propio margen (P_exceso).
function puntuacionDia_(evaluacion, tolDia) {
  return NUTRIENTES.reduce((s, n) => {
    const desvio = evaluacion.detalle[n].desvio_pct;
    return s + Math.abs(desvio) / (n === 'P' && desvio > 0 ? excesoProteinaDia_(tolDia) : tolDia[n]);
  }, 0);
}

// ---------- Generación ----------

// datos: {inicio, recetas, alimentos, objetivos: {Desayuno: {...}}, tolerancias: {dia, comida}, config,
//         valoraciones, preferencias, recetasPlanAnterior: [ids], gramosReceta, rotacion: [ids], agrupar, dias, azar}.
//         Las comidas del plan son las que tienen objetivo (quien no desayuna no tiene objetivo de desayuno).
//         `gramosReceta`: los gramos que la persona quiere siempre en una receta ({receta_id: {alimento: g}},
//         config.gramos_receta). `rotacion`: ver filtrarRotacion_. `agrupar`: cocinar para varios días (grupoDia_).
//         `dias`: cuántos días (14 si no se dice).
// Devuelve {inicio, fin, objetivoDia, dias: [{fecha, comidas, macros, evaluacion, revisar}], descartadas}.
function generarPlan_(datos) {
  const azar = datos.azar || Math.random;
  const numDias = datos.dias || DIAS_PLAN;
  const rotacion = filtrarRotacion_(datos.recetas, datos.rotacion);
  const { porComida, descartadas } = prepararCandidatas_(rotacion.recetas, datos);
  const comidas = Object.keys(porComida);
  comidas.forEach(c => {
    if (rotacion.comidas.has(c) && !porComida[c].length) {
      throw new Error('Ninguna receta de ' + c.toLowerCase() + ' de tu rotación se puede usar. Revisa exclusiones y valoraciones.');
    }
    if (!rotacion.comidas.has(c) && porComida[c].length < 2) {
      throw new Error('Hay muy pocas recetas de ' + c.toLowerCase() + ' que se puedan usar (' + porComida[c].length +
        '). Revisa exclusiones y valoraciones.');
    }
  });
  const reglas = {};
  comidas.forEach(c => { reglas[c] = reglasRepeticion_(c, porComida[c].length, datos.config || {}, numDias); });
  const objetivoDia = sumarMacros_(comidas.map(c => datos.objetivos[c]));
  const tolDia = datos.tolerancias.dia;

  // Se generan varios planes completos y se queda el primero sin días a revisar
  // (o, si ninguno lo consigue, el que tenga menos). Cada plan tarda ~1 ms.
  let mejor = null;
  let completos = 0;
  for (let reinicio = 0; reinicio < REINICIOS_PLAN && completos < PLANES_CANDIDATOS; reinicio++) {
    const dias = datos.agrupar ? intentarPlanAgrupado_(datos.inicio, numDias, comidas, porComida, objetivoDia, tolDia, azar)
      : intentarPlan_(datos.inicio, numDias, comidas, porComida, reglas, objetivoDia, tolDia, azar);
    if (!dias) continue;
    completos++;
    const aRevisar = dias.filter(d => d.revisar).length;
    const puntuacion = dias.reduce((s, d) => s + puntuacionDia_(d.evaluacion, tolDia), 0);
    if (!mejor || aRevisar < mejor.aRevisar || (aRevisar === mejor.aRevisar && puntuacion < mejor.puntuacion)) {
      mejor = { dias: dias, aRevisar: aRevisar, puntuacion: puntuacion };
    }
    if (aRevisar === 0) break;
  }
  if (!mejor) throw new Error('No se ha podido repartir las recetas en 14 días con las reglas de repetición.');
  return { inicio: datos.inicio, fin: sumarDias_(datos.inicio, numDias - 1), objetivoDia: objetivoDia,
    dias: mejor.dias, descartadas: descartadas };
}

// Un intento de plan completo. Devuelve null si se queda sin recetas posibles algún día (se reinicia).
function intentarPlan_(inicio, numDias, comidas, porComida, reglas, objetivoDia, tolDia, azar) {
  const usos = {};
  const dias = [];
  let ayer = {};
  for (let d = 0; d < numDias; d++) {
    const restantes = numDias - d;
    const posibles = {};
    for (const c of comidas) {
      posibles[c] = porComida[c].filter(r => (usos[r.id] || 0) < reglas[c].max && (reglas[c].consecutivos || ayer[c] !== r.id));
      // Sin días seguidos, a una receta con k usos pendientes le hacen falta 2k−1 días: si no sobran,
      // tiene que salir hoy. Los callejones sin salida que queden se resuelven reiniciando el plan.
      if (!reglas[c].consecutivos) {
        const obligadas = posibles[c].filter(r => 2 * (reglas[c].max - (usos[r.id] || 0)) - 1 >= restantes);
        if (obligadas.length) posibles[c] = obligadas;
      }
      if (!posibles[c].length) return null;
    }

    const mejor = elegirDia_(comidas, posibles, objetivoDia, tolDia, azar, INTENTOS_POR_DIA);
    dias.push(diaDesdeEleccion_(sumarDias_(inicio, d), comidas, mejor));
    comidas.forEach(c => { usos[mejor.eleccion[c].id] = (usos[mejor.eleccion[c].id] || 0) + 1; });
    ayer = {};
    comidas.forEach(c => { ayer[c] = mejor.eleccion[c].id; });
  }
  return dias;
}

// Con «cocinar para varios días»: un menú por grupo de días (grupoDia_), elegido entre las recetas menos usadas
// por los otros grupos (si hay bastantes, ninguna se repite), y cada día del plan con el de su grupo.
function intentarPlanAgrupado_(inicio, numDias, comidas, porComida, objetivoDia, tolDia, azar) {
  const fechas = [];
  for (let d = 0; d < numDias; d++) fechas.push(sumarDias_(inicio, d));
  const usos = {};
  const menus = {};
  fechas.map(grupoDia_).filter((g, i, todos) => todos.indexOf(g) === i).forEach(g => {
    const posibles = {};
    comidas.forEach(c => {
      const menosUsos = Math.min(...porComida[c].map(r => usos[r.id] || 0));
      posibles[c] = porComida[c].filter(r => (usos[r.id] || 0) === menosUsos);
    });
    menus[g] = elegirDia_(comidas, posibles, objetivoDia, tolDia, azar, INTENTOS_POR_GRUPO);
    comidas.forEach(c => { usos[menus[g].eleccion[c].id] = (usos[menus[g].eleccion[c].id] || 0) + 1; });
  });
  return fechas.map(f => diaDesdeEleccion_(f, comidas, menus[grupoDia_(f)]));
}

// La mejor de `intentos` combinaciones al azar de las recetas posibles de cada comida: la primera que cumple la
// tolerancia del día o, si ninguna, la que menos se aparta. {eleccion: {comida: candidata}, macros, evaluacion, puntuacion}.
function elegirDia_(comidas, posibles, objetivoDia, tolDia, azar, intentos) {
  let mejor = null;
  for (let intento = 0; intento < intentos; intento++) {
    const eleccion = {};
    comidas.forEach(c => { eleccion[c] = elegirPonderado_(posibles[c], azar); });
    const macros = sumarMacros_(comidas.map(c => eleccion[c].macros));
    const evaluacion = evaluarDia_(macros, objetivoDia, tolDia);
    const puntuacion = puntuacionDia_(evaluacion, tolDia);
    if (!mejor || (evaluacion.ok && !mejor.evaluacion.ok) ||
        (evaluacion.ok === mejor.evaluacion.ok && puntuacion < mejor.puntuacion)) {
      mejor = { eleccion: eleccion, macros: macros, evaluacion: evaluacion, puntuacion: puntuacion };
    }
    if (evaluacion.ok) break;
  }
  return mejor;
}

function diaDesdeEleccion_(fecha, comidas, mejor) {
  return {
    fecha: fecha,
    comidas: comidas.map(c => ({
      comida: c,
      receta_id: mejor.eleccion[c].id,
      nombre: mejor.eleccion[c].nombre,
      gramos: mejor.eleccion[c].ajuste.gramos,
      fijados: mejor.eleccion[c].ajuste.fijados,
      macros: mejor.eleccion[c].macros,
    })),
    macros: mejor.macros,
    evaluacion: mejor.evaluacion,
    revisar: !mejor.evaluacion.ok,
  };
}

// ---------- Cambiar plato ----------

// Alternativas para una comida de un día ya planificado: las recetas de esa comida que se pueden usar
// (sin la actual), ajustadas a su objetivo, con lo que sumaría el día y si seguiría cumpliendo la tolerancia.
// dia: {comidas: [{comida, receta_id, macros}]}; datos: como en prepararCandidatas_.
// Primero las que cuadran el día, de mejor a peor.
function alternativasComida_(dia, comida, recetas, datos, objetivoDia, tolDia) {
  const actual = dia.comidas.find(c => c.comida === comida);
  if (!actual) throw new Error('Ese día no tiene ' + String(comida).toLowerCase() + '.');
  const otras = dia.comidas.filter(c => c.comida !== comida).map(c => c.macros);
  const { porComida } = prepararCandidatas_(recetas.filter(r => r.comida === comida), datos);
  return porComida[comida]
    .filter(c => c.id !== actual.receta_id)
    .map(c => {
      const macrosDia = sumarMacros_(otras.concat([c.macros]));
      const evaluacion = evaluarDia_(macrosDia, objetivoDia, tolDia);
      return { receta_id: c.id, nombre: c.nombre, macros: c.macros, macrosDia: macrosDia, diaOk: evaluacion.ok,
        puntuacion: puntuacionDia_(evaluacion, tolDia) };
    })
    .sort((a, b) => Number(b.diaOk) - Number(a.diaOk) || a.puntuacion - b.puntuacion);
}

if (typeof module !== 'undefined') {
  module.exports = {
    COMIDAS, DIAS_PLAN, sumarDias_, diaSemana_, fechaInicioPlan_, azarConSemilla_, ultimasValoraciones_,
    prepararCandidatas_, reglasRepeticion_, generarPlan_, alimentosProhibidos_, alternativasComida_, filtrarRotacion_,
    grupoDia_,
  };
}
