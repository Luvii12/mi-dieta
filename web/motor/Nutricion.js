// Motor nutricional: macros, optimizador de gramos, redondeo y tolerancias.
// Funciones puras (sin SpreadsheetApp): se prueban en Node con los mismos archivos.
// Referencia: prototipo/semana.py (solve, round_g, fit) y docs/NUTRICION.md.

const NUTRIENTES = ['kcal', 'P', 'C', 'G'];
const PASO_G = 5; // redondeo a 5 g (y 5 ml de aceite)

// Objetivo de cada comida en el plan de Fran («Ajustes Fran. Déficit», docs/NUTRICION.md). Las cantidades
// de las recetas (fijas, mínimas y máximas) están pensadas para estas raciones; para otros objetivos se
// escalan (racionesReceta_). Perfil.js reparte los macros de una persona nueva con estas proporciones.
const REFERENCIA_COMIDAS = {
  Desayuno: { kcal: 405, P: 24.9, C: 48.3, G: 11.6 },
  Almuerzo: { kcal: 542, P: 41.1, C: 48.0, G: 20.0 },
  Merienda: { kcal: 335, P: 30.9, C: 33.8, G: 8.7 },
  Cena: { kcal: 373, P: 34.9, C: 29.1, G: 12.3 },
};
// Qué macro decide la ración de cada grupo de alimentos.
const MACRO_DEL_GRUPO = { proteina: 'P', lacteo: 'P', carbohidrato: 'C', fruta: 'C', grasa: 'G', verdura_condimento: 'kcal' };
const ESCALA_MINIMA = 0.4;
const ESCALA_MAXIMA = 3;

// Filas de la pestaña `alimentos` → {id: {kcal, P, C, G, gramos_unidad, estado, grupo, nombre}} (por 100 g).
function indexarAlimentos_(filas) {
  const indice = {};
  filas.forEach(f => {
    indice[f.id] = {
      kcal: Number(f.kcal_100),
      P: Number(f.proteina_100),
      C: Number(f.carbohidratos_100),
      G: Number(f.grasa_100),
      gramos_unidad: f.gramos_por_unidad === '' || f.gramos_por_unidad == null ? null : Number(f.gramos_por_unidad),
      estado: f.estado,
      grupo: f.grupo,
      nombre: f.nombre || f.id,
    };
  });
  return indice;
}

function alimento_(id, alimentos) {
  const a = alimentos[id];
  if (!a) throw new Error('El alimento «' + id + '» no está en la pestaña alimentos.');
  return a;
}

// {alimento: gramos} → {kcal, P, C, G}. Las kcal salen de la tabla, no de los macros.
function calcularMacros_(gramos, alimentos) {
  const total = { kcal: 0, P: 0, C: 0, G: 0 };
  Object.keys(gramos).forEach(id => {
    const a = alimento_(id, alimentos);
    NUTRIENTES.forEach(n => { total[n] += a[n] * gramos[id] / 100; });
  });
  return total;
}

// Macros con 1 decimal: así se guardan en `plan_comidas`, y así se validan los días para que
// lo comprobado sea exactamente lo guardado.
function redondearMacros_(m) {
  const r = {};
  NUTRIENTES.forEach(n => { r[n] = Math.round(m[n] * 10) / 10; });
  return r;
}

function sumarMacros_(lista) {
  const total = { kcal: 0, P: 0, C: 0, G: 0 };
  lista.forEach(m => NUTRIENTES.forEach(n => { total[n] += m[n]; }));
  return total;
}

// Mínimos cuadrados acotados: minimiza |A·x − b|² con lo ≤ x ≤ hi.
// Descenso por coordenadas sobre las ecuaciones normales: con 2–5 variables converge en
// pocas iteraciones al mínimo exacto (el problema es convexo).
function minimosCuadradosAcotados_(A, b, lo, hi) {
  const n = lo.length;
  const Q = [];
  const c = [];
  for (let i = 0; i < n; i++) {
    Q.push([]);
    for (let j = 0; j < n; j++) Q[i].push(A.reduce((s, fila) => s + fila[i] * fila[j], 0));
    c.push(A.reduce((s, fila, k) => s + fila[i] * b[k], 0));
  }
  const x = lo.map((l, i) => Math.min(Math.max((l + hi[i]) / 2, l), hi[i]));
  for (let iter = 0; iter < 20000; iter++) {
    let cambio = 0;
    for (let i = 0; i < n; i++) {
      if (Q[i][i] <= 0) { x[i] = lo[i]; continue; }
      let resto = c[i];
      for (let j = 0; j < n; j++) if (j !== i) resto -= Q[i][j] * x[j];
      const nuevo = Math.min(Math.max(resto / Q[i][i], lo[i]), hi[i]);
      cambio = Math.max(cambio, Math.abs(nuevo - x[i]));
      x[i] = nuevo;
    }
    if (cambio < 1e-9) break;
  }
  return x;
}

// Gramos de los escalables libres que mejor cuadran el objetivo. Error relativo (pesos 1/objetivo)
// en P, C, G y kcal. `fijados` son escalables ya decididos (p. ej. piezas enteras).
function optimizarGramos_(fijos, escalables, objetivo, alimentos, fijados) {
  fijados = fijados || {};
  const base = calcularMacros_(Object.assign({}, fijos, fijados), alimentos);
  const libres = escalables.filter(e => !(e.alimento in fijados));
  const resultado = Object.assign({}, fijados);
  if (!libres.length) return resultado;

  const A = NUTRIENTES.map(n => libres.map(e => alimento_(e.alimento, alimentos)[n] / 100 / objetivo[n]));
  const b = NUTRIENTES.map(n => (objetivo[n] - base[n]) / objetivo[n]);
  const lo = libres.map(e => e.min_g);
  const hi = libres.map(e => Math.max(e.max_g, e.min_g));
  const x = minimosCuadradosAcotados_(A, b, lo, hi);
  libres.forEach((e, i) => { resultado[e.alimento] = x[i]; });
  return resultado;
}

// Redondeo realista: piezas enteras para los alimentos por unidad; múltiplos de 5 g para el resto.
// Siempre dentro de [min_g, max_g]; si min_g es 0 el ingrediente puede desaparecer.
function redondearGramos_(gramos, escalable, alimentos) {
  const lo = escalable.min_g;
  const hi = escalable.max_g;
  if (escalable.unidad) {
    const u = alimento_(escalable.alimento, alimentos).gramos_unidad;
    if (!u) throw new Error('«' + escalable.alimento + '» se usa por piezas pero no tiene gramos_por_unidad.');
    let piezas = Math.max(Math.round(gramos / u), Math.ceil(lo / u - 1e-9));
    piezas = Math.min(piezas, Math.floor(hi / u + 1e-9));
    return piezas * u;
  }
  const v = Math.round(gramos / PASO_G) * PASO_G;
  return Math.min(Math.max(v, lo > 0 ? lo : 0), hi);
}

function evaluarNutriente_(valor, objetivo, tolerancia) {
  const desvio = (valor / objetivo - 1) * 100;
  return { valor: valor, objetivo: objetivo, desvio_pct: desvio, ok: Math.abs(desvio) <= tolerancia + 1e-9 };
}

// ¿Cumple una comida su tolerancia? tol = {kcal: 12, P: 15, C: 15, G: 20} (en %).
function evaluarComida_(macros, objetivo, tol) {
  const detalle = {};
  NUTRIENTES.forEach(n => { detalle[n] = evaluarNutriente_(macros[n], objetivo[n], tol[n]); });
  return { ok: NUTRIENTES.every(n => detalle[n].ok), detalle: detalle };
}

// ¿Cumple un día su tolerancia? Además, la proteína nunca puede quedar más de P_margen_g por debajo.
function evaluarDia_(macros, objetivo, tol) {
  const evaluacion = evaluarComida_(macros, objetivo, tol);
  if (tol.P_margen_g != null && macros.P < objetivo.P - tol.P_margen_g) {
    evaluacion.detalle.P.ok = false;
    evaluacion.ok = false;
  }
  return evaluacion;
}

// Cuánto se escala un alimento de una receta de `comida` para `objetivo` frente al plan de Fran (1 = nada),
// según el macro de su grupo; entre ESCALA_MINIMA y ESCALA_MAXIMA.
function factorRacion_(id, comida, objetivo, alimentos) {
  const ref = REFERENCIA_COMIDAS[comida];
  if (!ref || !objetivo) return 1;
  const n = MACRO_DEL_GRUPO[alimento_(id, alimentos).grupo] || 'kcal';
  const f = Number(objetivo[n]) / ref[n];
  return f > 0 ? Math.min(ESCALA_MAXIMA, Math.max(ESCALA_MINIMA, f)) : 1;
}

// La receta con sus cantidades escaladas a las raciones de `objetivo`: cada ingrediente según el macro de
// su grupo (la proteína escala con P, los hidratos y la fruta con C, la grasa con G y la verdura con las
// kcal), en proporción al objetivo de esa comida en el plan de Fran. Con sus objetivos, la receta no cambia.
// Las piezas (huevos, panes…) siguen siendo enteras.
function racionesReceta_(receta, objetivo, alimentos) {
  if (!REFERENCIA_COMIDAS[receta.comida] || !objetivo) return receta;
  const factor = id => factorRacion_(id, receta.comida, objetivo, alimentos);
  const ids = receta.ingredientes_fijos.concat(receta.ingredientes_escalables).map(i => i.alimento);
  if (ids.every(id => factor(id) === 1)) return receta;
  const piezas = (g, u) => Math.max(1, Math.round(g / u)) * u;
  const fijos = receta.ingredientes_fijos.map(i => {
    const u = alimentos[i.alimento].gramos_unidad;
    const g = i.gramos * factor(i.alimento);
    const gramos = u ? piezas(g, u) : g < 2 * PASO_G ? Math.max(1, Math.round(g)) : Math.round(g / PASO_G) * PASO_G;
    return Object.assign({}, i, { gramos: gramos });
  });
  const escalables = receta.ingredientes_escalables.map(e => {
    const f = factor(e.alimento);
    const u = e.unidad ? alimentos[e.alimento].gramos_unidad : null;
    if (!u) return Object.assign({}, e, { min_g: e.min_g * f, max_g: e.max_g * f });
    const min = e.min_g > 0 ? piezas(e.min_g * f, u) : 0;
    return Object.assign({}, e, { min_g: min, max_g: Math.max(min, piezas(e.max_g * f, u)) });
  });
  return Object.assign({}, receta, { ingredientes_fijos: fijos, ingredientes_escalables: escalables });
}

// Ajusta una receta a un objetivo: escala sus raciones, optimiza, redondea piezas y las fija, reoptimiza el resto,
// redondea todo y recalcula los macros con los gramos finales.
// receta: {id, nombre, comida, ingredientes_fijos: [{alimento, gramos}], ingredientes_escalables: [...]}
function ajustarReceta_(original, objetivo, alimentos, tolComida) {
  const receta = racionesReceta_(original, objetivo, alimentos);
  const fijos = {};
  receta.ingredientes_fijos.forEach(f => { fijos[f.alimento] = f.gramos; });
  const escalables = receta.ingredientes_escalables;

  let gramos = optimizarGramos_(fijos, escalables, objetivo, alimentos);
  const piezas = {};
  escalables.filter(e => e.unidad).forEach(e => { piezas[e.alimento] = redondearGramos_(gramos[e.alimento], e, alimentos); });
  gramos = optimizarGramos_(fijos, escalables, objetivo, alimentos, piezas);

  const ingredientes = receta.ingredientes_fijos.map(f => ({ alimento: f.alimento, gramos: f.gramos, escalable: false }));
  escalables.forEach(e => {
    const g = redondearGramos_(gramos[e.alimento], e, alimentos);
    if (g <= 0) return;
    const ingrediente = { alimento: e.alimento, gramos: g, escalable: true };
    if (e.unidad) ingrediente.piezas = Math.round(g / alimentos[e.alimento].gramos_unidad);
    ingredientes.push(ingrediente);
  });
  ingredientes.forEach(i => {
    const a = alimento_(i.alimento, alimentos);
    i.nombre = a.nombre;
    i.estado = a.estado;
    i.grupo = a.grupo;
  });

  const gramosFinales = {};
  ingredientes.forEach(i => { gramosFinales[i.alimento] = (gramosFinales[i.alimento] || 0) + i.gramos; });
  const macros = calcularMacros_(gramosFinales, alimentos);
  return {
    receta_id: receta.id,
    gramos: gramosFinales,
    ingredientes: ingredientes,
    macros: macros,
    objetivo: objetivo,
    evaluacion: tolComida ? evaluarComida_(macros, objetivo, tolComida) : null,
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    NUTRIENTES, REFERENCIA_COMIDAS, indexarAlimentos_, calcularMacros_, redondearMacros_, sumarMacros_, minimosCuadradosAcotados_, optimizarGramos_,
    redondearGramos_, evaluarComida_, evaluarDia_, factorRacion_, racionesReceta_, ajustarReceta_,
  };
}
