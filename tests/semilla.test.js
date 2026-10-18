const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { construirSemilla, nombreDesdeId } = require('../scripts/generar_semilla.js');
const { PESTANAS } = require('../web/motor/Util.js');
const { SEMILLA } = require('../data/semilla.js');

const raiz = path.join(__dirname, '..');
const csv = fs.readFileSync(path.join(raiz, 'data/alimentos.csv'), 'utf8');
const recetasJson = JSON.parse(fs.readFileSync(path.join(raiz, 'data/recetas_semilla.json'), 'utf8'));

test('data/semilla.js está al día con data/ (si falla: node scripts/generar_semilla.js)', () => {
  assert.deepEqual(SEMILLA, construirSemilla(csv, recetasJson));
});

test('alimentos: columnas de DATOS.md, números y nombre', () => {
  const { alimentos } = construirSemilla(csv, recetasJson);
  assert.equal(alimentos.length, 95);
  alimentos.forEach(a => {
    assert.deepEqual(Object.keys(a), PESTANAS.alimentos);
    assert.equal(typeof a.kcal_100, 'number', a.id);
    assert.ok(['crudo', 'cocinado'].includes(a.estado), a.id);
    assert.ok(a.nombre, a.id);
  });
  assert.equal(nombreDesdeId('pechuga_fiambre_90'), 'Pechuga fiambre 90');
});

test('recetas: 4 desayunos, 7 almuerzos, 4 meriendas, 7 cenas', () => {
  const { recetas } = construirSemilla(csv, recetasJson);
  const cuenta = {};
  recetas.forEach(r => { cuenta[r.comida] = (cuenta[r.comida] || 0) + 1; });
  assert.deepEqual(cuenta, { Desayuno: 4, Almuerzo: 7, Merienda: 4, Cena: 7 });
  recetas.forEach(r => assert.deepEqual(Object.keys(r), PESTANAS.recetas));
});

test('una receta con un alimento desconocido no se carga', () => {
  const malo = structuredClone(recetasJson);
  malo.recetas[0].ingredientes_fijos.push({ alimento: 'unicornio', gramos: 10 });
  assert.throws(() => construirSemilla(csv, malo), /unicornio/);
});
