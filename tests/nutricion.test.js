const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../web/motor/Nutricion.js');
const { SEMILLA } = require('../data/semilla.js');
const recetasJson = require('../data/recetas_semilla.json');

const alimentos = N.indexarAlimentos_(SEMILLA.alimentos);
const TOL_COMIDA = { kcal: 12, P: 15, C: 15, G: 20 };
const TOL_DIA = { kcal: 5, P: 5, C: 10, G: 10, P_margen_g: 10 };
const cerca = (a, b, margen = 1e-6) => assert.ok(Math.abs(a - b) <= margen, `${a} no está cerca de ${b}`);

// Alimentos de juguete para cuentas fáciles de comprobar a mano.
const juguete = N.indexarAlimentos_([
  { id: 'pollo', kcal_100: 110, proteina_100: 23, carbohidratos_100: 0, grasa_100: 1.5, gramos_por_unidad: '' },
  { id: 'arroz', kcal_100: 350, proteina_100: 7, carbohidratos_100: 78, grasa_100: 0.6, gramos_por_unidad: '' },
  { id: 'aceite', kcal_100: 828, proteina_100: 0, carbohidratos_100: 0, grasa_100: 92, gramos_por_unidad: '' },
  { id: 'huevo', kcal_100: 140, proteina_100: 12.5, carbohidratos_100: 0.5, grasa_100: 10, gramos_por_unidad: 53 },
]);

// ---------- Macros ----------

test('macros: suma por 100 g', () => {
  const m = N.calcularMacros_({ pollo: 150, arroz: 70 }, juguete);
  cerca(m.kcal, 165 + 245);
  cerca(m.P, 34.5 + 4.9);
  cerca(m.C, 54.6);
  cerca(m.G, 2.25 + 0.42);
});

test('macros: las kcal salen de la tabla, no de 4/4/9', () => {
  // aceite: 92 g de grasa × 9 = 828; la tabla manda aunque no cuadre con los macros.
  const raro = N.indexarAlimentos_([{ id: 'x', kcal_100: 100, proteina_100: 10, carbohidratos_100: 10, grasa_100: 10 }]);
  cerca(N.calcularMacros_({ x: 100 }, raro).kcal, 100);
});

test('macros: un alimento desconocido para el cálculo y avisa', () => {
  assert.throws(() => N.calcularMacros_({ unicornio: 10 }, juguete), /unicornio.*no está/);
});

test('macros: sumar varias comidas', () => {
  const s = N.sumarMacros_([{ kcal: 1, P: 2, C: 3, G: 4 }, { kcal: 10, P: 20, C: 30, G: 40 }]);
  assert.deepEqual(s, { kcal: 11, P: 22, C: 33, G: 44 });
});

// ---------- Optimizador ----------

test('optimizador: sin límites activos encuentra la solución exacta', () => {
  // 2x + y = 5, x + 3y = 10 → x = 1, y = 3
  const x = N.minimosCuadradosAcotados_([[2, 1], [1, 3]], [5, 10], [0, 0], [100, 100]);
  cerca(x[0], 1, 1e-6);
  cerca(x[1], 3, 1e-6);
});

test('optimizador: respeta los límites', () => {
  // El óptimo libre es x = 10, pero el máximo es 4.
  const x = N.minimosCuadradosAcotados_([[1]], [10], [0], [4]);
  assert.equal(x[0], 4);
  const y = N.minimosCuadradosAcotados_([[1]], [-3], [2], [8]);
  assert.equal(y[0], 2);
});

test('optimizador: cuadra un objetivo alcanzable', () => {
  // Objetivo fabricado con 150 g de pollo, 70 g de arroz y 8 g de aceite: debe recuperarlo.
  const objetivo = N.calcularMacros_({ pollo: 150, arroz: 70, aceite: 8 }, juguete);
  const escalables = [
    { alimento: 'pollo', min_g: 100, max_g: 200 },
    { alimento: 'arroz', min_g: 40, max_g: 100 },
    { alimento: 'aceite', min_g: 0, max_g: 15 },
  ];
  const g = N.optimizarGramos_({}, escalables, objetivo, juguete);
  cerca(g.pollo, 150, 0.01);
  cerca(g.arroz, 70, 0.01);
  cerca(g.aceite, 8, 0.01);
});

test('optimizador: los gramos fijados no se tocan', () => {
  const objetivo = { kcal: 500, P: 40, C: 50, G: 15 };
  const escalables = [{ alimento: 'huevo', min_g: 53, max_g: 159, unidad: true }, { alimento: 'arroz', min_g: 0, max_g: 100 }];
  const g = N.optimizarGramos_({}, escalables, objetivo, juguete, { huevo: 106 });
  assert.equal(g.huevo, 106);
  assert.ok(g.arroz >= 0 && g.arroz <= 100);
});

// ---------- Redondeos ----------

test('redondeo: múltiplos de 5 g dentro de los límites', () => {
  const e = { alimento: 'arroz', min_g: 50, max_g: 90 };
  assert.equal(N.redondearGramos_(67.4, e, juguete), 65);
  assert.equal(N.redondearGramos_(67.6, e, juguete), 70);
  assert.equal(N.redondearGramos_(41, e, juguete), 50);
  assert.equal(N.redondearGramos_(93, e, juguete), 90);
});

test('redondeo: con mínimo 0 el ingrediente puede desaparecer; con mínimo > 0 no', () => {
  assert.equal(N.redondearGramos_(2, { alimento: 'arroz', min_g: 0, max_g: 90 }, juguete), 0);
  assert.equal(N.redondearGramos_(2, { alimento: 'arroz', min_g: 30, max_g: 90 }, juguete), 30);
  assert.equal(N.redondearGramos_(0.4, { alimento: 'aceite', min_g: 0, max_g: 15 }, juguete), 0);
  assert.equal(N.redondearGramos_(2, { alimento: 'aceite', min_g: 3, max_g: 15 }, juguete), 3);
});

test('redondeo: 5 g en general y el aceite de 1 en 1 ml', () => {
  assert.equal(N.redondearGramos_(143, { alimento: 'pollo', min_g: 100, max_g: 200 }, juguete), 145);
  assert.equal(N.redondearGramos_(7.4, { alimento: 'aceite', min_g: 3, max_g: 15 }, juguete), 7);
  assert.equal(N.redondearGramos_(7.6, { alimento: 'aceite', min_g: 3, max_g: 15 }, juguete), 8);
});

test('redondeo: piezas enteras dentro de los límites', () => {
  const e = { alimento: 'huevo', min_g: 53, max_g: 159, unidad: true };
  assert.equal(N.redondearGramos_(80, e, juguete), 106); // 1,5 huevos → 2
  assert.equal(N.redondearGramos_(70, e, juguete), 53); // 1,3 → 1
  assert.equal(N.redondearGramos_(10, e, juguete), 53); // nunca menos del mínimo
  assert.equal(N.redondearGramos_(300, e, juguete), 159); // nunca más del máximo
});

test('redondeo: un alimento por piezas sin gramos_por_unidad es un error', () => {
  assert.throws(() => N.redondearGramos_(80, { alimento: 'arroz', min_g: 0, max_g: 100, unidad: true }, juguete),
    /gramos_por_unidad/);
});

// ---------- Tolerancias ----------

test('tolerancia de comida: dentro y fuera', () => {
  const obj = { kcal: 500, P: 40, C: 50, G: 20 };
  assert.equal(N.evaluarComida_({ kcal: 560, P: 46, C: 57.5, G: 24 }, obj, TOL_COMIDA).ok, true); // justo en el borde
  const fuera = N.evaluarComida_({ kcal: 500, P: 40, C: 50, G: 25 }, obj, TOL_COMIDA);
  assert.equal(fuera.ok, false);
  assert.equal(fuera.detalle.G.ok, false);
  cerca(fuera.detalle.G.desvio_pct, 25);
});

test('tolerancia de día: kcal ±5 %', () => {
  const obj = { kcal: 1655, P: 131.8, C: 159.2, G: 52.6 };
  assert.equal(N.evaluarDia_({ kcal: 1700, P: 131.8, C: 159.2, G: 52.6 }, obj, TOL_DIA).ok, true);
  assert.equal(N.evaluarDia_({ kcal: 1750, P: 131.8, C: 159.2, G: 52.6 }, obj, TOL_DIA).ok, false);
});

test('tolerancia de día: la proteína nunca más de 10 g por debajo', () => {
  // Con un objetivo de 300 g, −5 % son 15 g: el porcentaje lo permitiría, el margen en gramos no.
  const obj = { kcal: 2500, P: 300, C: 200, G: 70 };
  const r = N.evaluarDia_({ kcal: 2500, P: 288, C: 200, G: 70 }, obj, TOL_DIA);
  assert.equal(r.ok, false);
  assert.equal(r.detalle.P.ok, false);
  assert.equal(N.evaluarDia_({ kcal: 2500, P: 291, C: 200, G: 70 }, obj, TOL_DIA).ok, true);
});

test('tolerancia de día: la proteína puede pasarse hasta un 15 % (o lo que diga P_exceso)', () => {
  const obj = { kcal: 1655, P: 100, C: 159.2, G: 52.6 };
  assert.equal(N.evaluarDia_({ kcal: 1655, P: 94, C: 159.2, G: 52.6 }, obj, TOL_DIA).ok, false); // −6 %
  assert.equal(N.evaluarDia_({ kcal: 1655, P: 115, C: 159.2, G: 52.6 }, obj, TOL_DIA).ok, true); // +15 %
  assert.equal(N.evaluarDia_({ kcal: 1655, P: 116, C: 159.2, G: 52.6 }, obj, TOL_DIA).ok, false);
  assert.equal(N.evaluarDia_({ kcal: 1655, P: 108, C: 159.2, G: 52.6 }, obj, Object.assign({ P_exceso: 5 }, TOL_DIA)).ok, false);
});

// ---------- Regresión contra el prototipo en Python ----------
// Única diferencia buscada (2026-10-19): el prototipo redondea el aceite a 5 ml y la app a 1 ml. El resto de
// gramos tiene que ser idéntico, y los macros, los del prototipo más lo que suma o resta ese aceite.

const esAceite = id => id.startsWith('aceite');

// Gramos del prototipo con el aceite que ha dado la app (comprobando que solo cambia por el redondeo).
function gramosPrototipo(r, a) {
  const esperados = Object.fromEntries(Object.entries(r.gramos_resueltos_prueba).filter(([, g]) => g > 0));
  Object.keys(a.gramos).filter(esAceite).forEach(id => {
    assert.ok(Math.abs(a.gramos[id] - (esperados[id] || 0)) <= 2.5, `${r.id} ${id}: ${a.gramos[id]} frente a ${esperados[id]}`);
    esperados[id] = a.gramos[id];
  });
  return esperados;
}

test('regresión: las 22 recetas semilla dan las kcal del prototipo (≤ 2 %)', () => {
  recetasJson.recetas.forEach(r => {
    const a = N.ajustarReceta_(r, recetasJson.objetivo_por_comida[r.comida], alimentos);
    const aceite = {};
    Object.keys(a.gramos).filter(esAceite).forEach(id => { aceite[id] = a.gramos[id] - (r.gramos_resueltos_prueba[id] || 0); });
    const extra = N.calcularMacros_(aceite, alimentos);
    const esperado = n => r.macros_prueba[n] + extra[n];
    const desvio = Math.abs(a.macros.kcal / esperado('kcal') - 1) * 100;
    assert.ok(desvio <= 2, `${r.id}: ${a.macros.kcal.toFixed(0)} kcal vs ${esperado('kcal').toFixed(0)} (${desvio.toFixed(1)} %)`);
    ['P', 'C', 'G'].forEach(n => cerca(a.macros[n], esperado(n), 0.5));
  });
});

test('regresión: mismos gramos que el prototipo (salvo el redondeo del aceite)', () => {
  recetasJson.recetas.forEach(r => {
    const a = N.ajustarReceta_(r, recetasJson.objetivo_por_comida[r.comida], alimentos);
    assert.deepEqual(a.gramos, gramosPrototipo(r, a), r.id);
  });
});

test('recetas ajustadas: límites, piezas enteras y múltiplos de 5 (el aceite, ml enteros)', () => {
  recetasJson.recetas.forEach(r => {
    const a = N.ajustarReceta_(r, recetasJson.objetivo_por_comida[r.comida], alimentos, TOL_COMIDA);
    r.ingredientes_escalables.forEach(e => {
      const g = a.gramos[e.alimento] || 0;
      assert.ok(g === 0 ? e.min_g === 0 : g >= e.min_g && g <= e.max_g, `${r.id} ${e.alimento} ${g}`);
      if (e.unidad) assert.equal(g % alimentos[e.alimento].gramos_unidad, 0, `${r.id} ${e.alimento}`);
      // El límite manda sobre el redondeo: aceite 0–8 ml puede quedar en 8.
      else if (g !== e.min_g && g !== e.max_g) assert.equal(g % (esAceite(e.alimento) ? 1 : 5), 0, `${r.id} ${e.alimento} ${g}`);
    });
    assert.ok(a.evaluacion && typeof a.evaluacion.ok === 'boolean');
    a.ingredientes.forEach(i => assert.ok(['crudo', 'cocinado'].includes(i.estado), `${r.id} ${i.alimento}`));
  });
});

test('regresión: la semana de prueba del prototipo cumple ±3 % kcal y ±4 % proteína', () => {
  const semana = [['D1', 'A1', 'M1', 'C1'], ['D2', 'A2', 'M2', 'C2'], ['D3', 'A3', 'M3', 'C3'], ['D4', 'A4', 'M4', 'C4'],
    ['D1', 'A5', 'M2', 'C5'], ['D2', 'A6', 'M1', 'C6'], ['D3', 'A7', 'M3', 'C7']];
  const porId = Object.fromEntries(recetasJson.recetas.map(r => [r.id, r]));
  const objDia = N.sumarMacros_(Object.values(recetasJson.objetivo_por_comida));
  semana.forEach(dia => {
    const macros = N.sumarMacros_(dia.map(id => {
      const r = porId[id];
      return N.ajustarReceta_(r, recetasJson.objetivo_por_comida[r.comida], alimentos).macros;
    }));
    assert.ok(Math.abs(macros.kcal / objDia.kcal - 1) <= 0.03, dia.join(' '));
    assert.ok(Math.abs(macros.P / objDia.P - 1) <= 0.04, dia.join(' '));
    assert.equal(N.evaluarDia_(macros, objDia, TOL_DIA).ok, true, dia.join(' '));
  });
});
