// Motor nutricional: macros, optimizador de gramos, redondeo y tolerancias.
// Funciones puras (sin SpreadsheetApp): se prueban en Node con los mismos archivos.
// Referencia: prototipo/semana.py (solve, round_g, fit) y docs/NUTRICION.md.

const NUTRIENTES = ['kcal', 'P', 'C', 'G'];
const PASO_G = 5; // redondeo a 5 g (y 5 ml de aceite)

// Filas de la pestaña `alimentos` → {id: {kcal, P, C, G, gramos_unidad, estado, nombre}} (por 100 g).
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

// Ajusta una receta a un objetivo: optimiza, redondea piezas y las fija, reoptimiza el resto,
// redondea todo y recalcula los macros con los gramos finales.
// receta: {id, nombre, comida, ingredientes_fijos: [{alimento, gramos}], ingredientes_escalables: [...]}
function ajustarReceta_(receta, objetivo, alimentos, tolComida) {
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
    NUTRIENTES, indexarAlimentos_, calcularMacros_, sumarMacros_, minimosCuadradosAcotados_, optimizarGramos_,
    redondearGramos_, evaluarComida_, evaluarDia_, ajustarReceta_,
  };
}
