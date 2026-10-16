const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../apps-script/Util.js');

test('token: sin token guardado se rechaza todo', () => {
  assert.equal(U.tokenValido_('abc', null), false);
  assert.equal(U.tokenValido_('', ''), false);
});

test('token: solo acepta el token exacto', () => {
  assert.equal(U.tokenValido_('abc123', 'abc123'), true);
  assert.equal(U.tokenValido_('abc124', 'abc123'), false);
  assert.equal(U.tokenValido_('abc12', 'abc123'), false);
  assert.equal(U.tokenValido_(undefined, 'abc123'), false);
});

test('manejar_: rechaza token incorrecto sin ejecutar la acción', () => {
  let ejecutada = false;
  const r = U.manejar_({ accion: 'hoy', token: 'malo' }, 'bueno', { hoy: () => { ejecutada = true; } });
  assert.deepEqual(r, { ok: false, error: 'Token no válido' });
  assert.equal(ejecutada, false);
});

test('manejar_: acción desconocida y errores se devuelven como ok:false', () => {
  const acciones = { falla: () => { throw new Error('se rompió'); } };
  assert.equal(U.manejar_({ accion: 'nada', token: 't' }, 't', acciones).ok, false);
  assert.deepEqual(U.manejar_({ accion: 'falla', token: 't' }, 't', acciones), { ok: false, error: 'se rompió' });
});

test('manejar_: acción correcta devuelve sus datos', () => {
  const r = U.manejar_({ accion: 'eco', token: 't', x: 2 }, 't', { eco: p => p.x * 2 });
  assert.deepEqual(r, { ok: true, datos: 4 });
});

test('filasAObjetos_: usa cabeceras, ignora filas vacías y pasa fechas a ISO', () => {
  const valores = [
    ['fecha', 'peso_kg'],
    [new Date('2026-10-16T10:00:00+02:00'), 80.5],
    ['', ''],
    ['2026-10-17', 80.1],
  ];
  assert.deepEqual(U.filasAObjetos_(valores), [
    { fecha: '2026-10-16', peso_kg: 80.5 },
    { fecha: '2026-10-17', peso_kg: 80.1 },
  ]);
  assert.deepEqual(U.filasAObjetos_([]), []);
});

test('fechaIso_: usa la hora de Madrid', () => {
  // 23:30 UTC del 15 es ya día 16 en Madrid (UTC+2 en octubre).
  assert.equal(U.fechaIso_(new Date('2026-10-15T23:30:00Z')), '2026-10-16');
});

test('objetoAFila_: respeta el orden y guarda objetos como JSON', () => {
  const fila = U.objetoAFila_({ G: 3, plan_id: 'p1', gramos: { arroz: 70 } }, ['plan_id', 'gramos', 'kcal', 'G']);
  assert.deepEqual(fila, ['p1', '{"arroz":70}', '', 3]);
});

test('config: ida y vuelta de valores', () => {
  const obj = { kcal: 405, P: 24.9 };
  assert.deepEqual(U.parsearValor_(U.serializarValor_(obj)), obj);
  assert.equal(U.parsearValor_(U.serializarValor_(4)), 4);
  assert.equal(U.parsearValor_('hola'), 'hola');
  assert.deepEqual(U.configAObjeto_([{ clave: 'a', valor: '1' }, { clave: 'b', valor: 'texto' }]), { a: 1, b: 'texto' });
});

test('cada pestaña tiene cabeceras únicas', () => {
  Object.entries(U.PESTANAS).forEach(([nombre, cabs]) => {
    assert.equal(new Set(cabs).size, cabs.length, nombre);
  });
  assert.equal(Object.keys(U.PESTANAS).length, 9);
});
