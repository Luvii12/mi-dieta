// Motor nutricional: macros, optimizador de gramos, redondeo y tolerancias.
// Funciones puras (sin SpreadsheetApp): se prueban en Node con los mismos archivos.
// Referencia: prototipo/semana.py (solve, round_g, fit) y docs/NUTRICION.md.

const NUTRIENTES = ['kcal', 'P', 'C', 'G'];
const PASO_G = 5; // redondeo a 5 g
// El aceite, de 1 en 1 ml (2026-10-19): con 5 ml (~4,5 g de grasa) las raciones pequeñas no cuadraban la grasa.
const PASO_ACEITE = 1;
const pasoDe_ = id => (/^aceite/.test(id) ? PASO_ACEITE : PASO_G);

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

// Ración máxima de un alimento en una comida (g, o ml el aceite), aunque el objetivo pida más: raciones de la
// SENC (2004) y tablas de raciones estándar de la UCM (Aparicio y Perea, 2015; ración grande = estándar + 15 %).
// Decidido por Fran (2026-11-16): con 2.720 kcal salían 130 g de pasta o 580 g de patata en un plato. Lo que
// falte lo ponen el pan y la fruta de postre (acompanamientos_). Los alimentos que no están aquí, según su grupo
// (racionMaxima_).
const RACION_MAXIMA = {
  avena: 80, harina_avena: 80, crema_arroz: 80, corn_flakes: 50, tortita_arroz: 50, harina_trigo: 30,
  boniato: 300, noquis: 250, fideua_marisco: 300, masa_pizza_fina: 150,
  garbanzos_cocidos: 250, lentejas_cocidas: 250, alubias_cocidas: 250,
  fajita_trigo: 160, fajita_pequena: 160, tortillas_maiz: 160,
  proteina_whey: 40, jamon_serrano: 100, lomo_embuchado: 100, chorizo: 25,
  mozzarella: 125, parmesano: 30, chocolate_70: 25, sesamo: 10,
};
const RACION_MAXIMA_ACEITE = 20; // 2 cucharadas (la ración de la SENC es 10 ml)
const RACION_MAXIMA_PAN = 120;   // 3 raciones de la SENC (40–60 g)
// Pasta, arroz, quinoa o cuscús del almuerzo (el plato principal): al menos una ración pequeña (UCM: 60 g).
const RACION_MINIMA_PRINCIPAL = 60;
const PRINCIPAL = /^(arroz|pasta|quinoa|cuscus)/;
const PANES = /^(pan_|bagel|fajita|tortilla|masa_pizza|tortita_arroz)/;

function racionMaxima_(id, a) {
  if (id in RACION_MAXIMA) return RACION_MAXIMA[id];
  if (/^aceite/.test(id)) return RACION_MAXIMA_ACEITE;
  if (/^(pan_|bagel)/.test(id)) return RACION_MAXIMA_PAN;
  switch (a.grupo) {
    case 'carbohidrato': return a.kcal >= 300 ? 100 : 350; // en seco (arroz, pasta: UCM 90–100 g) · patata (UCM 250–400 g)
    case 'fruta': return 250;                               // 1–2 piezas (SENC 120–200 g)
    case 'proteina': return 250;                            // carne y pescado (SENC 100–150 g; UCM, pescado entero 200–300 g)
    case 'lacteo': return a.kcal >= 250 ? 60 : 350;         // queso curado (SENC 40–60 g) · yogur y queso fresco
    case 'grasa': return a.kcal >= 500 ? 30 : 100;          // frutos secos y cremas (SENC 20–30 g) · aguacate, hummus
    default: return Infinity;                               // verdura y condimentos: sin tope
  }
}

// Pan y fruta de postre que se añaden cuando, con los topes, el plato no llega a los hidratos de su comida
// (decidido por Fran, 2026-11-16). El pan, solo en el almuerzo y la cena y si el plato no lleva ya pan.
const FALTA_HIDRATOS = 0.05; // se añaden si faltan más del 5 % de los hidratos
const PAN_ACOMPANAMIENTO = { alimento: 'pan_blanco', minimo: 20, maximo: 80, paso: 10 };
const FRUTAS_POSTRE = [{ alimento: 'manzana', gramos: 180 }, { alimento: 'platano', gramos: 120 }, { alimento: 'kiwi', gramos: 100 }];
const HIDRATOS_MINIMOS_FRUTA = 10; // g que tienen que faltar aún para poner una pieza de fruta

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

// Redondeo realista: piezas enteras para los alimentos por unidad; ml enteros de aceite; múltiplos de 5 g para el resto.
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
  const paso = pasoDe_(escalable.alimento);
  const v = Math.round(gramos / paso) * paso;
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

// ¿Cumple un día su tolerancia? La proteína puede pasarse hasta P_exceso % (por defecto 15: las recetas llevan
// mucha y pasarse un poco no es un problema), pero nunca quedar más de P_margen_g por debajo.
function evaluarDia_(macros, objetivo, tol) {
  const evaluacion = evaluarComida_(macros, objetivo, tol);
  const P = evaluacion.detalle.P;
  if (P.desvio_pct > 0) P.ok = P.desvio_pct <= excesoProteinaDia_(tol) + 1e-9;
  if (tol.P_margen_g != null && macros.P < objetivo.P - tol.P_margen_g) P.ok = false;
  evaluacion.ok = NUTRIENTES.every(n => evaluacion.detalle[n].ok);
  return evaluacion;
}

const EXCESO_PROTEINA_DIA = 15;
const excesoProteinaDia_ = tol => (tol.P_exceso != null ? Number(tol.P_exceso) : EXCESO_PROTEINA_DIA);

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
    if (!u) {
      // Límites redondeados como los gramos (5 g; el aceite, 1 ml): si no, un plato que llega al límite sale
      // con decimales («61,02 g de langostinos»).
      const paso = pasoDe_(e.alimento);
      const min = Math.round(e.min_g * f / paso) * paso;
      return Object.assign({}, e, { min_g: min, max_g: Math.max(min, Math.round(e.max_g * f / paso) * paso) });
    }
    const min = e.min_g > 0 ? piezas(e.min_g * f, u) : 0;
    return Object.assign({}, e, { min_g: min, max_g: Math.max(min, piezas(e.max_g * f, u)) });
  });
  return Object.assign({}, receta, { ingredientes_fijos: fijos, ingredientes_escalables: escalables });
}

// La receta (ya escalada) con las raciones dentro de lo normal: nada por encima de racionMaxima_ (las piezas,
// en piezas enteras y al menos una) y la pasta o el arroz del almuerzo con al menos RACION_MINIMA_PRINCIPAL.
// `topada` = algún hidrato se ha quedado en su tope (entonces puede hacer falta pan o fruta). Si no cambia
// nada, devuelve la misma receta.
function topesRacion_(receta, alimentos) {
  let cambia = false;
  let topada = false;
  const tope = (id, u) => {
    const t = racionMaxima_(id, alimento_(id, alimentos));
    return u && isFinite(t) ? Math.max(1, Math.floor(t / u + 1e-9)) * u : t;
  };
  const hidrato = id => alimento_(id, alimentos).grupo === 'carbohidrato';
  const fijos = receta.ingredientes_fijos.map(f => {
    const t = tope(f.alimento, alimentos[f.alimento].gramos_unidad);
    if (f.gramos <= t + 1e-9) return f;
    cambia = true;
    if (hidrato(f.alimento)) topada = true;
    return Object.assign({}, f, { gramos: t });
  });
  const escalables = receta.ingredientes_escalables.map(e => {
    let max = Math.min(e.max_g, tope(e.alimento, e.unidad ? alimentos[e.alimento].gramos_unidad : null));
    let min = Math.min(e.min_g, max);
    if (max < e.max_g && hidrato(e.alimento)) topada = true;
    if (receta.comida === 'Almuerzo' && !e.unidad && PRINCIPAL.test(e.alimento) && hidrato(e.alimento)) {
      min = Math.max(min, RACION_MINIMA_PRINCIPAL);
      max = Math.max(max, min);
    }
    if (min === e.min_g && max === e.max_g) return e;
    cambia = true;
    return Object.assign({}, e, { min_g: min, max_g: max });
  });
  if (!cambia) return receta;
  return Object.assign({}, receta, { ingredientes_fijos: fijos, ingredientes_escalables: escalables, topada: topada });
}

// {alimento: gramos} de pan y fruta de postre para los `faltan` g de hidratos de un plato de `comida` que lleva
// `ids`. Sin alimentos prohibidos ni los que no estén en la tabla. Vacío si no hace falta nada. La fruta cambia
// de un plato a otro (según `recetaId`), siempre la misma con el mismo plato.
function acompanamientos_(comida, faltan, ids, alimentos, prohibidos, recetaId) {
  const extra = {};
  const usable = id => alimentos[id] && !prohibidos.has(id) && ids.indexOf(id) < 0;
  const pan = PAN_ACOMPANAMIENTO;
  if ((comida === 'Almuerzo' || comida === 'Cena') && usable(pan.alimento) && !ids.some(id => PANES.test(id))) {
    const g = Math.min(pan.maximo, Math.round(faltan / (alimentos[pan.alimento].C / 100) / pan.paso) * pan.paso);
    if (g >= pan.minimo) {
      extra[pan.alimento] = g;
      faltan -= g * alimentos[pan.alimento].C / 100;
    }
  }
  const frutas = FRUTAS_POSTRE.filter(f => usable(f.alimento));
  const n = String(recetaId || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  const fruta = frutas[n % (frutas.length || 1)];
  if (fruta && faltan >= HIDRATOS_MINIMOS_FRUTA) extra[fruta.alimento] = fruta.gramos;
  return extra;
}

// Ajusta una receta a un objetivo: escala sus raciones, optimiza, redondea piezas y las fija, reoptimiza el resto,
// redondea todo y recalcula los macros con los gramos finales.
// receta: {id, nombre, comida, ingredientes_fijos: [{alimento, gramos}], ingredientes_escalables: [...]}
// fijados: {alimento: gramos} que ha elegido la persona (p. ej. su bollo de pan pesa 50 g). Se usan tal cual,
// fuera de límites y sin redondear (0 = sin ese ingrediente), y el optimizador cuadra el resto. Los que no
// están en la receta se ignoran. El resultado lleva `fijados`: los que se han usado.
// Las raciones nunca pasan de los topes (topesRacion_). Si por eso el plato no llega a sus hidratos, se añaden
// pan o fruta de postre (ingredientes con `acompanamiento`), salvo con opciones.acompanamientos === false (al
// comprobar una receta nueva: tiene que cuadrar sola). opciones.prohibidos: alimentos excluidos (Set o lista).
function ajustarReceta_(original, objetivo, alimentos, tolComida, fijados, opciones) {
  opciones = opciones || {};
  const receta = topesRacion_(racionesReceta_(original, objetivo, alimentos), alimentos);
  const propios = fijadosDeReceta_(receta, fijados);
  let ajuste = ajustarGramos_(receta, objetivo, alimentos, propios, {});
  const faltan = objetivo.C - ajuste.macros.C;
  if (receta.topada && opciones.acompanamientos !== false && faltan > objetivo.C * FALTA_HIDRATOS) {
    const ids = receta.ingredientes_fijos.concat(receta.ingredientes_escalables).map(i => i.alimento);
    const extra = acompanamientos_(receta.comida, faltan, ids, alimentos, new Set(opciones.prohibidos || []), receta.id);
    if (Object.keys(extra).length) ajuste = ajustarGramos_(receta, objetivo, alimentos, propios, extra);
  }
  ajuste.evaluacion = tolComida ? evaluarComida_(ajuste.macros, objetivo, tolComida) : null;
  return ajuste;
}

// ajustarReceta_ con la receta ya escalada y topada, los gramos elegidos por la persona (`propios`) y los
// acompañamientos (`extra`, {alimento: gramos}), que cuentan como ingredientes fijos.
function ajustarGramos_(receta, objetivo, alimentos, propios, extra) {
  const fijos = {};
  receta.ingredientes_fijos.forEach(f => { fijos[f.alimento] = f.alimento in propios ? propios[f.alimento] : f.gramos; });
  Object.keys(extra).forEach(id => { fijos[id] = extra[id]; });
  const escalables = receta.ingredientes_escalables;
  const elegidos = {};
  escalables.forEach(e => { if (e.alimento in propios) elegidos[e.alimento] = propios[e.alimento]; });

  let gramos = optimizarGramos_(fijos, escalables, objetivo, alimentos, elegidos);
  const piezas = Object.assign({}, elegidos);
  escalables.filter(e => e.unidad && !(e.alimento in elegidos)).forEach(e => { piezas[e.alimento] = redondearGramos_(gramos[e.alimento], e, alimentos); });
  gramos = optimizarGramos_(fijos, escalables, objetivo, alimentos, piezas);

  const ingredientes = receta.ingredientes_fijos.filter(f => fijos[f.alimento] > 0)
    .map(f => ({ alimento: f.alimento, gramos: fijos[f.alimento], escalable: false }));
  escalables.forEach(e => {
    const g = e.alimento in elegidos ? elegidos[e.alimento] : redondearGramos_(gramos[e.alimento], e, alimentos);
    if (g <= 0) return;
    const ingrediente = { alimento: e.alimento, gramos: g, escalable: true };
    if (e.unidad) ingrediente.piezas = Math.round(g / alimentos[e.alimento].gramos_unidad);
    ingredientes.push(ingrediente);
  });
  Object.keys(extra).forEach(id => {
    const ingrediente = { alimento: id, gramos: extra[id], escalable: true, acompanamiento: true };
    if (alimentos[id].gramos_unidad) ingrediente.piezas = Math.round(extra[id] / alimentos[id].gramos_unidad);
    ingredientes.push(ingrediente);
  });
  ingredientes.forEach(i => {
    const a = alimento_(i.alimento, alimentos);
    i.nombre = a.nombre;
    i.estado = a.estado;
    i.grupo = a.grupo;
    if (i.alimento in propios) i.fijado = true;
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
    fijados: propios,
  };
}

// Los gramos elegidos por la persona que son de esta receta, como números ≥ 0.
function fijadosDeReceta_(receta, fijados) {
  const ids = receta.ingredientes_fijos.concat(receta.ingredientes_escalables).map(i => i.alimento);
  const propios = {};
  Object.keys(fijados || {}).forEach(id => {
    const g = Number(fijados[id]);
    if (ids.indexOf(id) >= 0 && g >= 0) propios[id] = g;
  });
  return propios;
}

if (typeof module !== 'undefined') {
  module.exports = {
    NUTRIENTES, REFERENCIA_COMIDAS, indexarAlimentos_, calcularMacros_, redondearMacros_, sumarMacros_, minimosCuadradosAcotados_, optimizarGramos_,
    redondearGramos_, evaluarComida_, evaluarDia_, excesoProteinaDia_, factorRacion_, racionesReceta_, ajustarReceta_, fijadosDeReceta_,
    racionMaxima_, topesRacion_, acompanamientos_, RACION_MINIMA_PRINCIPAL,
  };
}
