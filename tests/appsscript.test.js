// Prueba el código de Apps Script completo (Main, Hoja, Setup…) sobre una hoja simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarAppsScript, formatDate } = require('./simulador_gas.js');

// Viernes 16 de octubre de 2026 por la mañana (hora de Madrid).
const VIERNES = '2026-10-16T09:00:00+02:00';

function preparar(ahora = VIERNES) {
  const gas = cargarAppsScript(ahora);
  gas.contexto.configurarHoja();
  gas.contexto.crearToken();
  return gas;
}

const filas = (gas, nombre) => {
  const valores = gas.libro.getSheetByName(nombre).getDataRange().getValues();
  return valores.slice(1).filter(f => f.some(v => v !== '')).map(f => Object.fromEntries(valores[0].map((c, i) => [c, f[i]])));
};

test('simulador: formato de fechas tipo Apps Script', () => {
  const f = new Date('2026-10-16T07:05:09Z');
  assert.equal(formatDate(f, 'Europe/Madrid', "yyyy-MM-dd'T'HH:mm"), '2026-10-16T09:05');
  assert.equal(formatDate(f, 'Europe/Madrid', 'yyyyMMdd-HHmmss'), '20261016-090509');
});

test('configurarHoja: 9 pestañas, datos iniciales y es repetible', () => {
  const gas = preparar();
  assert.equal(gas.libro.getSheets().length, 9);
  assert.equal(filas(gas, 'alimentos').length, 95);
  assert.equal(filas(gas, 'recetas').length, 22);
  gas.contexto.configurarHoja();
  assert.equal(filas(gas, 'alimentos').length, 95, 'no duplica');
  assert.match(gas.propiedades.APP_TOKEN, /^[0-9a-f]{64}$/);
});

test('token: sin token correcto no se ejecuta nada', () => {
  const gas = preparar();
  const salida = gas.contexto.doPost({ postData: { contents: JSON.stringify({ accion: 'plan', token: 'malo' }) } });
  assert.deepEqual(JSON.parse(salida.texto), { ok: false, error: 'Token no válido' });
});

test('config: escribe y lee una fila sin convertir textos en fechas', () => {
  const gas = preparar();
  const r = gas.llamar('config', { cambios: { ultima_prueba: '16/10/2026, 10:22:04' } });
  assert.equal(r.ok, true);
  assert.equal(r.datos.ultima_prueba, '16/10/2026, 10:22:04');
  assert.equal(r.datos.objetivo_almuerzo.kcal, 542);
});

test('recetas: las 22 calculadas sin errores', () => {
  const r = preparar().llamar('recetas');
  assert.equal(r.ok, true);
  assert.equal(r.datos.length, 22);
  assert.ok(r.datos.every(x => x.ajuste && !x.error));
});

test('generarPlan: borrador de 14 días desde el lunes, guardado en la hoja', () => {
  const gas = preparar();
  const r = gas.llamar('generarPlan');
  assert.equal(r.ok, true, r.error);
  const p = r.datos;
  assert.equal(p.estado, 'borrador');
  assert.equal(p.inicio, '2026-10-19');
  assert.equal(p.fin, '2026-11-01');
  assert.equal(p.dias.length, 14);
  assert.ok(p.dias.every(d => d.comidas.length === 4 && !d.revisar));
  assert.ok(p.dias[0].comidas[0].ingredientes.length > 0);
  assert.equal(filas(gas, 'planes').length, 1);
  assert.equal(filas(gas, 'plan_comidas').length, 56);
});

test('generarPlan: un segundo borrador sustituye al primero', () => {
  const gas = preparar();
  gas.llamar('generarPlan');
  const segundo = gas.llamar('generarPlan').datos;
  const planes = filas(gas, 'planes');
  assert.equal(planes.length, 1);
  assert.equal(planes[0].plan_id, segundo.plan_id);
  assert.equal(filas(gas, 'plan_comidas').length, 56);
  assert.ok(filas(gas, 'plan_comidas').every(f => f.plan_id === segundo.plan_id));
});

test('plan → activar → hoy: el día a día del plan activo', () => {
  const gas = preparar();
  const borrador = gas.llamar('generarPlan').datos;

  let hoy = gas.llamar('hoy').datos;
  assert.match(hoy.mensaje, /borrador/);

  assert.equal(gas.llamar('activarPlan', { plan_id: borrador.plan_id }).ok, true);
  const vista = gas.llamar('plan').datos;
  assert.equal(vista.activo.plan_id, borrador.plan_id);
  assert.equal(vista.borrador, null);

  hoy = gas.llamar('hoy').datos;
  assert.match(hoy.mensaje, /empieza el 2026-10-19/);
  assert.equal(hoy.inicio, '2026-10-19');

  // El miércoles siguiente, con el mismo libro: hoy devuelve las 4 comidas de ese día.
  const miercoles = cargarAppsScript('2026-10-21T13:00:00+02:00');
  miercoles.libro.hojas.splice(0, miercoles.libro.hojas.length, ...gas.libro.hojas);
  Object.assign(miercoles.propiedades, gas.propiedades);
  hoy = miercoles.llamar('hoy').datos;
  assert.equal(hoy.fecha, '2026-10-21');
  assert.equal(hoy.comidas.length, 4);
  const delPlan = borrador.dias.find(d => d.fecha === '2026-10-21');
  assert.deepEqual(hoy.comidas.map(c => c.receta_id), delPlan.comidas.map(c => c.receta_id));
  assert.equal(hoy.evaluacion.ok, true);
});

test('activarPlan: el nuevo empieza al acabar el activo y el anterior se archiva', () => {
  const gas = preparar();
  const primero = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: primero.plan_id });
  const segundo = gas.llamar('generarPlan').datos;
  assert.equal(segundo.inicio, '2026-11-02');
  assert.equal(gas.llamar('activarPlan', { plan_id: segundo.plan_id }).ok, true);
  const estados = Object.fromEntries(filas(gas, 'planes').map(p => [p.plan_id, p.estado]));
  assert.equal(estados[primero.plan_id], 'archivado');
  assert.equal(estados[segundo.plan_id], 'activo');
  assert.equal(filas(gas, 'plan_comidas').length, 112, 'las comidas del archivado se conservan');
});

test('activarPlan: errores claros', () => {
  const gas = preparar();
  assert.match(gas.llamar('activarPlan', { plan_id: 'X' }).error, /No existe/);
  const p = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: p.plan_id });
  assert.match(gas.llamar('activarPlan', { plan_id: p.plan_id }).error, /borrador/);
});

test('generarPlan: respeta exclusiones de la pestaña preferencias', () => {
  const gas = preparar();
  gas.contexto.anadirFilas_('preferencias', [{ tipo: 'excluido', alimento_id: 'salmon', nota: '' }]);
  const p = gas.llamar('generarPlan').datos;
  p.dias.forEach(d => d.comidas.forEach(c => assert.ok(c.ingredientes.every(i => i.alimento !== 'salmon'), c.receta_id)));
  assert.ok(p.descartadas.length >= 2);
});
