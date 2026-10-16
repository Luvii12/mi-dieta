// Prueba el código de Apps Script completo (Main, Hoja, Setup…) sobre una hoja simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarAppsScript, formatDate } = require('./simulador_gas.js');
const SEMILLA_RECETAS = require('../apps-script/Semilla.js').SEMILLA.recetas;

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

// ---------- Fase 3: uso diario ----------

// Plan activo con «hoy» = miércoles 21 de octubre (tercer día del plan).
function planActivoEnMiercoles() {
  const gas = preparar();
  const plan = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: plan.plan_id });
  const miercoles = cargarAppsScript('2026-10-21T13:00:00+02:00');
  miercoles.libro.hojas.splice(0, miercoles.libro.hojas.length, ...gas.libro.hojas);
  Object.assign(miercoles.propiedades, gas.propiedades);
  return { gas: miercoles, plan };
}

test('marcarComida: si, libre y no se guardan y se ven en hoy y plan', () => {
  const { gas, plan } = planActivoEnMiercoles();
  const pide = hecha => gas.llamar('marcarComida', { plan_id: plan.plan_id, fecha: '2026-10-21', comida: 'Desayuno', hecha });
  assert.equal(pide('si').ok, true);
  assert.equal(pide('libre').ok, true);
  let hoy = gas.llamar('hoy').datos;
  assert.equal(hoy.comidas[0].hecha, 'libre');
  assert.equal(hoy.inicio, '2026-10-19');
  assert.equal(hoy.fin, '2026-11-01');
  assert.ok(hoy.comidas.slice(1).every(c => c.hecha === 'no'));
  pide('no');
  const dia = gas.llamar('plan').datos.activo.dias.find(d => d.fecha === '2026-10-21');
  assert.equal(dia.comidas[0].hecha, 'no');
  assert.match(pide('quizas').error, /no válido/);
});

test('marcarComida: solo en el plan activo y en comidas que existen', () => {
  const gas = preparar();
  const borrador = gas.llamar('generarPlan').datos;
  const base = { plan_id: borrador.plan_id, fecha: '2026-10-21', comida: 'Cena', hecha: 'si' };
  assert.match(gas.llamar('marcarComida', base).error, /plan activo/);
  gas.llamar('activarPlan', { plan_id: borrador.plan_id });
  assert.match(gas.llamar('marcarComida', { ...base, fecha: '2026-12-01' }).error, /no tiene cena/);
  assert.match(gas.llamar('marcarComida', { ...base, plan_id: 'X' }).error, /No existe/);
});

test('alternativas: misma comida, sin la actual, primero las que cuadran el día', () => {
  const { gas, plan } = planActivoEnMiercoles();
  const r = gas.llamar('alternativas', { plan_id: plan.plan_id, fecha: '2026-10-21', comida: 'Almuerzo' });
  assert.equal(r.ok, true, r.error);
  const actual = plan.dias[2].comidas.find(c => c.comida === 'Almuerzo').receta_id;
  const almuerzos = SEMILLA_RECETAS.filter(x => x.comida === 'Almuerzo').length;
  assert.equal(r.datos.length, almuerzos - 1);
  assert.ok(r.datos.every(a => a.receta_id !== actual && a.receta_id.startsWith('A')));
  const primeraMala = r.datos.findIndex(a => !a.diaOk);
  if (primeraMala >= 0) assert.ok(r.datos.slice(primeraMala).every(a => !a.diaOk));
  assert.ok(r.datos[0].macros.kcal > 0);
});

test('cambiarPlato: guarda la nueva receta, recalcula y deja la comida pendiente', () => {
  const { gas, plan } = planActivoEnMiercoles();
  const base = { plan_id: plan.plan_id, fecha: '2026-10-21', comida: 'Cena' };
  gas.llamar('marcarComida', { ...base, hecha: 'si' });
  const alternativa = gas.llamar('alternativas', base).datos[0];
  const r = gas.llamar('cambiarPlato', { ...base, receta_id: alternativa.receta_id });
  assert.equal(r.ok, true, r.error);
  const cena = r.datos.comidas.find(c => c.comida === 'Cena');
  assert.equal(cena.receta_id, alternativa.receta_id);
  assert.equal(cena.cambiada, true);
  assert.equal(cena.hecha, 'no');
  assert.deepEqual(cena.macros, alternativa.macros);
  assert.ok(Math.abs(r.datos.macros.kcal - alternativa.macrosDia.kcal) < 1e-6);

  const fila = filas(gas, 'plan_comidas').find(f => f.plan_id === plan.plan_id && f.fecha === '2026-10-21' && f.comida === 'Cena');
  const original = plan.dias[2].comidas.find(c => c.comida === 'Cena').receta_id;
  assert.equal(fila.receta_id, original, 'la receta original se conserva');
  assert.equal(fila.cambiada_por, alternativa.receta_id);
  assert.equal(filas(gas, 'plan_comidas').length, 56);

  // Volver a la receta original deja cambiada_por vacío.
  gas.llamar('cambiarPlato', { ...base, receta_id: original });
  const vuelta = filas(gas, 'plan_comidas').find(f => f.plan_id === plan.plan_id && f.fecha === '2026-10-21' && f.comida === 'Cena');
  assert.equal(vuelta.cambiada_por, '');
});

test('cambiarPlato: rechaza recetas de otra comida o con alimentos excluidos', () => {
  const { gas, plan } = planActivoEnMiercoles();
  const base = { plan_id: plan.plan_id, fecha: '2026-10-21', comida: 'Cena' };
  assert.match(gas.llamar('cambiarPlato', { ...base, receta_id: 'D1' }).error, /no es de cena/);
  assert.match(gas.llamar('cambiarPlato', { ...base, receta_id: 'ZZ' }).error, /No se puede usar/);
  const conSalmon = SEMILLA_RECETAS.find(x => x.comida === 'Cena' &&
    x.ingredientes_escalables.concat(x.ingredientes_fijos).some(i => i.alimento === 'salmon'));
  gas.contexto.anadirFilas_('preferencias', [{ tipo: 'excluido', alimento_id: 'salmon', nota: '' }]);
  assert.match(gas.llamar('cambiarPlato', { ...base, receta_id: conSalmon.id }).error, /excluido/);
  const alternativas = gas.llamar('alternativas', base).datos;
  assert.ok(alternativas.every(a => a.receta_id !== conSalmon.id));
});

test('valorar: la última valoración cuenta y «No lo repetiría» la quita de las alternativas', () => {
  const { gas, plan } = planActivoEnMiercoles();
  const base = { plan_id: plan.plan_id, fecha: '2026-10-21', comida: 'Desayuno' };
  const otra = gas.llamar('alternativas', base).datos[0].receta_id;
  const actual = plan.dias[2].comidas[0].receta_id;
  assert.equal(gas.llamar('valorar', { receta_id: actual, valor: 'normal' }).ok, true);
  assert.equal(gas.llamar('valorar', { receta_id: actual, valor: 'me_encanta' }).datos.fecha, '2026-10-21');
  assert.equal(gas.llamar('hoy').datos.comidas[0].valoracion, 'me_encanta');
  gas.llamar('valorar', { receta_id: otra, valor: 'no_repetir' });
  assert.ok(gas.llamar('alternativas', base).datos.every(a => a.receta_id !== otra));
  assert.match(gas.llamar('valorar', { receta_id: actual, valor: 'regular' }).error, /no válida/);
  assert.match(gas.llamar('valorar', { receta_id: 'ZZ', valor: 'normal' }).error, /No existe/);
  assert.equal(filas(gas, 'valoraciones').length, 3);
  const recetas = gas.llamar('recetas').datos;
  assert.equal(recetas.find(x => x.id === actual).valoracion, 'me_encanta');
  assert.equal(recetas.find(x => x.id === otra).valoracion, 'no_repetir');
  assert.ok(recetas.find(x => x.id === actual).ajuste.ingredientes.every(i => i.grupo));
});
