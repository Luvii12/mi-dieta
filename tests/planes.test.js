const test = require('node:test');
const assert = require('node:assert/strict');
// En Apps Script todos los archivos comparten ámbito global; en Node se imita así.
Object.assign(globalThis, require('../web/motor/Util.js'), require('../web/motor/Nutricion.js'), require('../web/motor/Generador.js'));
const P = require('../web/motor/Planes.js');
const { SEMILLA } = require('../apps-script/Semilla.js');

const alimentos = indexarAlimentos_(SEMILLA.alimentos);
const TOL = { dia: { kcal: 5, P: 5, C: 10, G: 10, P_margen_g: 10 }, comida: { kcal: 12, P: 15, C: 15, G: 20 } };
const recetasPorId = Object.fromEntries(SEMILLA.recetas.map(r => [r.id, r]));
const generar = semilla => generarPlan_({
  inicio: '2026-10-19', recetas: SEMILLA.recetas, alimentos, objetivos: SEMILLA.objetivos, tolerancias: TOL, config: {},
  azar: azarConSemilla_(semilla),
});

test('filas: 1 plan en borrador y 56 comidas con macros a 1 decimal', () => {
  const f = P.filasDesdePlan_(generar(1), 'P1', SEMILLA.objetivos, TOL, '2026-10-16T09:00');
  assert.equal(f.plan.estado, 'borrador');
  assert.deepEqual(f.plan.objetivos.tolerancias, TOL);
  assert.equal(f.comidas.length, 56);
  f.comidas.forEach(c => {
    assert.equal(c.hecha, 'no');
    ['kcal', 'P', 'C', 'G'].forEach(n => assert.equal(Math.round(c[n] * 10) / 10, c[n]));
  });
});

test('guardar y volver a leer no cambia la evaluación de ningún día (300 planes)', () => {
  // Antes el generador validaba sin redondear y el 14 % de los planes guardados mostraba un día
  // «para revisar» por una centésima. Ahora valida con los mismos valores que guarda.
  for (let s = 1; s <= 300; s++) {
    const g = generar(s * 7919);
    const f = P.filasDesdePlan_(g, 'X', SEMILLA.objetivos, TOL, '');
    // Como en Sheets: lo leído son textos/números sueltos, no los objetos originales.
    const leidas = f.comidas.map(c => Object.assign({}, c, { gramos: JSON.stringify(c.gramos) }));
    const v = P.vistaPlan_(Object.assign({}, f.plan, { objetivos: JSON.stringify(f.plan.objetivos) }), leidas, recetasPorId, alimentos);
    v.dias.forEach((d, i) => {
      assert.equal(d.revisar, g.dias[i].revisar, `semilla ${s} ${d.fecha}`);
      ['kcal', 'P', 'C', 'G'].forEach(n => assert.equal(d.macros[n], g.dias[i].macros[n]));
    });
  }
});

test('vista: días ordenados, comidas en orden e ingredientes con nombre y piezas', () => {
  const f = P.filasDesdePlan_(generar(2), 'P1', SEMILLA.objetivos, TOL, '');
  const desordenadas = f.comidas.slice().reverse();
  const v = P.vistaPlan_(f.plan, desordenadas, recetasPorId, alimentos);
  assert.equal(v.dias.length, 14);
  assert.equal(v.dias[0].fecha, '2026-10-19');
  v.dias.forEach(d => assert.deepEqual(d.comidas.map(c => c.comida), ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']));
  const comida = v.dias[0].comidas[0];
  assert.ok(comida.nombre && comida.preparacion);
  assert.ok(comida.ingredientes.every(i => i.nombre && i.gramos > 0));
  // Los escalables van primero.
  const primeraFija = comida.ingredientes.findIndex(i => !i.escalable);
  if (primeraFija >= 0) assert.ok(comida.ingredientes.slice(primeraFija).every(i => !i.escalable));
});

test('ingredientes: piezas para los alimentos por unidad', () => {
  const receta = recetasPorId.D1; // huevo por unidad (53 g)
  const ing = P.ingredientesDeComida_({ huevo: 106, pan_masa_madre: 90, tomate: 60 }, receta, alimentos);
  assert.equal(ing.find(i => i.alimento === 'huevo').piezas, 2);
  assert.equal(ing.find(i => i.alimento === 'pan_masa_madre').piezas, undefined);
  assert.equal(ing.find(i => i.alimento === 'tomate').escalable, false);
});

test('plan de referencia: el activo; si no, el último archivado', () => {
  const planes = [
    { plan_id: 'A', estado: 'archivado', inicio: '2026-09-07' },
    { plan_id: 'B', estado: 'archivado', inicio: '2026-09-21' },
    { plan_id: 'C', estado: 'borrador', inicio: '2026-10-19' },
  ];
  assert.equal(P.planDeReferencia_(planes).plan_id, 'B');
  assert.equal(P.planDeReferencia_(planes.concat([{ plan_id: 'D', estado: 'activo', inicio: '2026-10-05' }])).plan_id, 'D');
  assert.equal(P.planDeReferencia_([]), null);
});
