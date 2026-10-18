// Progreso y regla de ajuste quincenal (docs/NUTRICION.md).
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(globalThis, require('../web/motor/Util.js'), require('../web/motor/Nutricion.js'), require('../web/motor/Generador.js'));
const P = require('../web/motor/Progreso.js');
const { promoverPlanes_, numeroBloque_ } = require('../web/motor/Planes.js');
const { SEMILLA } = require('../data/semilla.js');

const OBJ = SEMILLA.objetivos;
const HOY = '2026-11-01';

// Un pesaje diario durante `dias` días hasta HOY, bajando `porDia` kg cada día desde `inicial`.
function serie(dias, inicial, porDia) {
  return Array.from({ length: dias }, (_, i) => ({ fecha: sumarDias_(HOY, i - dias + 1), peso: Math.round((inicial - porDia * i) * 100) / 100 }));
}

test('normalizarPesos: ordena, ignora vacíos y deja uno por fecha', () => {
  const r = P.normalizarPesos_([
    { fecha: '2026-10-20', peso_kg: 80 }, { fecha: '2026-10-19', peso_kg: '80,5' }, { fecha: '2026-10-18', peso_kg: 81 },
    { fecha: '2026-10-20', peso_kg: 79.8 }, { fecha: '', peso_kg: 70 },
  ]);
  assert.deepEqual(r.map(p => p.fecha), ['2026-10-18', '2026-10-20']);
  assert.equal(r[1].peso, 79.8);
});

test('mediaMovil: media de ese día y los 6 anteriores', () => {
  const m = P.mediaMovil_([{ fecha: '2026-10-01', peso: 80 }, { fecha: '2026-10-05', peso: 79 }, { fecha: '2026-10-10', peso: 78 }]);
  assert.deepEqual(m.map(x => x.media), [80, 79.5, 78.5]);
});

test('ritmoSemanal: pesaje diario, bajando 0,1 kg/día ≈ −0,88 %/semana', () => {
  const r = P.ritmoSemanal_(serie(21, 80, 0.1), HOY);
  assert.equal(r.semanas, 2);
  assert.equal(r.cambio_kg, -1.4);
  assert.ok(Math.abs(r.ritmo_pct - (-1.4 / 2 / 79.7 * 100)) < 0.01, String(r.ritmo_pct));
});

test('ritmoSemanal: primer bloque (sin pesajes 14 días antes) usa la primera semana con pesajes', () => {
  const r = P.ritmoSemanal_(serie(14, 80, 0.1), HOY);
  assert.equal(r.semanas, 1);
  assert.equal(r.cambio_kg, -0.7);
});

test('ritmoSemanal: sin dos semanas de pesajes no hay ritmo', () => {
  assert.equal(P.ritmoSemanal_(serie(7, 80, 0.1), HOY), null);
  assert.equal(P.ritmoSemanal_([], HOY), null);
});

test('cambioSemana: media de 7 días frente a la de la semana anterior', () => {
  assert.equal(P.cambioSemana_(serie(14, 80, 0.1), HOY), -0.7);
  assert.equal(P.cambioSemana_(serie(3, 80, 0.1), HOY), null);
});

const comida = (fecha, hecha) => ({ fecha, hecha });

test('adherencia: días pasados cuentan todos; de hoy, solo las marcadas', () => {
  const comidas = [comida('2026-10-30', 'si'), comida('2026-10-30', 'no'), comida('2026-10-31', 'si'), comida('2026-10-31', 'si'),
    comida(HOY, 'si'), comida(HOY, 'no'), comida('2026-11-02', 'si')];
  const a = P.adherencia_(comidas, '2026-10-19', HOY, true);
  assert.deepEqual(a, { hechas: 4, planificadas: 5, sin_marcar: 1, pct: 80 });
});

test('adherencia: con comida libre semanal, la primera libre de cada semana no cuenta', () => {
  const comidas = [comida('2026-10-19', 'libre'), comida('2026-10-20', 'libre'), comida('2026-10-21', 'si'), comida('2026-10-26', 'libre')];
  assert.deepEqual(P.adherencia_(comidas, '2026-10-19', HOY, true), { hechas: 1, planificadas: 2, sin_marcar: 0, pct: 50 });
  assert.deepEqual(P.adherencia_(comidas, '2026-10-19', HOY, false), { hechas: 1, planificadas: 4, sin_marcar: 0, pct: 25 });
  assert.equal(P.adherencia_([], '2026-10-19', HOY, true).pct, null);
});

test('racha: días seguidos completos; hoy solo si está completo', () => {
  const dia = (fecha, ...estados) => estados.map(e => comida(fecha, e));
  const base = [...dia('2026-10-29', 'si', 'no'), ...dia('2026-10-30', 'si', 'libre'), ...dia('2026-10-31', 'si', 'si')];
  assert.equal(P.racha_(base.concat(dia(HOY, 'si', 'no')), HOY), 2);
  assert.equal(P.racha_(base.concat(dia(HOY, 'si', 'si')), HOY), 3);
  assert.equal(P.racha_([], HOY), 0);
});

test('ajustarObjetivos: −120 kcal repartidas entre comidas, solo de C y G, proteína igual', () => {
  const n = P.ajustarObjetivos_(OBJ, -120);
  const total = o => COMIDAS.reduce((s, c) => s + o[c].kcal, 0);
  assert.ok(Math.abs(total(n) - (total(OBJ) - 120)) <= 2);
  COMIDAS.forEach(c => {
    assert.equal(n[c].P, OBJ[c].P);
    assert.ok(n[c].C < OBJ[c].C && n[c].G < OBJ[c].G);
    const kcalMacros = (n[c].C - OBJ[c].C) * 4 + (n[c].G - OBJ[c].G) * 9;
    assert.ok(Math.abs(kcalMacros - (n[c].kcal - OBJ[c].kcal)) < 2, c);
  });
  const mas = P.ajustarObjetivos_(OBJ, 120);
  assert.ok(Math.abs(total(mas) - (total(OBJ) + 120)) <= 2);
});

const datos = (extra) => Object.assign({ ritmo: { ritmo_pct: -0.6 }, adherencia: 90, pesajes: 10, objetivos: OBJ, kcalMinimas: 1400, peso: 80 }, extra);
const deltas = p => p.opciones.map(o => o.delta);

test('regla: ritmo entre 0,25 y 1 % → mantener (alternativa: −120)', () => {
  const p = P.proponerAjuste_(datos());
  assert.equal(p.motivo, 'en_ritmo');
  assert.deepEqual(deltas(p), [0, -120]);
  assert.equal(p.opciones[0].recomendada, true);
  assert.equal(p.opciones[0].kcal, 1655);
  assert.equal(p.opciones[1].bloqueada, null);
});

test('regla: ritmo < 0,25 % con adherencia ≥ 80 % → −120 kcal (alternativa: mantener)', () => {
  const p = P.proponerAjuste_(datos({ ritmo: { ritmo_pct: -0.1 } }));
  assert.equal(p.motivo, 'lento');
  assert.deepEqual(deltas(p), [-120, 0]);
  assert.equal(p.opciones[0].P, p.opciones[1].P, 'la proteína no baja');
  assert.ok(Math.abs(p.opciones[0].kcal - 1535) <= 2);
  // Si sube de peso también es «lento».
  assert.equal(P.proponerAjuste_(datos({ ritmo: { ritmo_pct: 0.3 } })).motivo, 'lento');
});

test('regla: pérdida > 1 %/semana → +120 kcal', () => {
  const p = P.proponerAjuste_(datos({ ritmo: { ritmo_pct: -1.3 } }));
  assert.equal(p.motivo, 'rapido');
  assert.deepEqual(deltas(p), [120, 0]);
});

test('regla: adherencia < 80 % → no tocar calorías', () => {
  const p = P.proponerAjuste_(datos({ ritmo: { ritmo_pct: -0.1 }, adherencia: 70 }));
  assert.equal(p.motivo, 'adherencia');
  assert.deepEqual(deltas(p), [0, -120]);
});

test('regla: menos de 4 pesajes o sin ritmo → no proponer ajuste', () => {
  assert.equal(P.proponerAjuste_(datos({ pesajes: 3, ritmo: { ritmo_pct: -0.1 } })).motivo, 'sin_datos');
  const p = P.proponerAjuste_(datos({ ritmo: null }));
  assert.equal(p.motivo, 'sin_datos');
  assert.deepEqual(deltas(p), [0, -120]);
});

test('límites de seguridad: no bajar de las kcal mínimas ni de 1,6 g/kg de proteína', () => {
  const minimas = P.proponerAjuste_(datos({ ritmo: { ritmo_pct: -0.1 }, kcalMinimas: 1600 }));
  assert.deepEqual(deltas(minimas), [0, -120], 'la recomendada pasa a mantener');
  assert.match(minimas.opciones[1].bloqueada, /1\.600 kcal/);
  const proteina = P.proponerAjuste_(datos({ peso: 90 }));
  assert.match(proteina.opciones[1].bloqueada, /proteína/);
  const rapido = P.proponerAjuste_(datos({ ritmo: { ritmo_pct: -1.0 } }));
  assert.ok(rapido.opciones.find(o => o.delta === -120).bloqueada);
});

test('promoverPlanes: el siguiente pasa a activo el día que empieza', () => {
  const planes = () => [{ plan_id: 'A', inicio: '2026-10-19', fin: '2026-11-01', estado: 'activo' },
    { plan_id: 'B', inicio: '2026-11-02', fin: '2026-11-15', estado: 'siguiente' }];
  const antes = planes();
  assert.equal(promoverPlanes_(antes, '2026-11-01'), false);
  const despues = planes();
  assert.equal(promoverPlanes_(despues, '2026-11-02'), true);
  assert.deepEqual(despues.map(p => p.estado), ['archivado', 'activo']);
  assert.equal(numeroBloque_(despues, despues[1]), 2);
});
