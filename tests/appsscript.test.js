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

test('exportar: devuelve todas las pestañas sin cambiar nada', () => {
  const gas = preparar();
  gas.llamar('generarPlan');
  const r = gas.llamar('exportar');
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.datos).sort(), ['ajustes_historial', 'alimentos', 'config', 'pesos', 'plan_comidas', 'planes', 'preferencias', 'recetas', 'valoraciones']);
  assert.equal(r.datos.alimentos.length, 95);
  assert.equal(r.datos.planes.length, 1);
  assert.equal(r.datos.plan_comidas.length, 56);
  assert.deepEqual(r.datos.planes, JSON.parse(JSON.stringify(gas.contexto.leerTabla_('planes'))));
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

// Mismo libro y token, con otro «ahora».
function enFecha(gas, ahoraIso) {
  const otro = cargarAppsScript(ahoraIso);
  otro.libro.hojas.splice(0, otro.libro.hojas.length, ...gas.libro.hojas);
  Object.assign(otro.propiedades, gas.propiedades);
  return otro;
}

test('activarPlan: si el activo no ha acabado, el nuevo queda como siguiente y pasa a activo al empezar', () => {
  const gas = preparar();
  const primero = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: primero.plan_id });
  const segundo = gas.llamar('generarPlan').datos;
  assert.equal(segundo.inicio, '2026-11-02');
  const r = gas.llamar('activarPlan', { plan_id: segundo.plan_id });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.datos.estado, 'siguiente');
  const estados = () => Object.fromEntries(filas(gas, 'planes').map(p => [p.plan_id, p.estado]));
  assert.deepEqual(estados(), { [primero.plan_id]: 'activo', [segundo.plan_id]: 'siguiente' });
  const vista = gas.llamar('plan').datos;
  assert.equal(vista.activo.plan_id, primero.plan_id);
  assert.equal(vista.siguiente.plan_id, segundo.plan_id);
  // Un tercer borrador empieza después del siguiente.
  assert.equal(gas.llamar('generarPlan').datos.inicio, '2026-11-16');

  const lunes = enFecha(gas, '2026-11-02T08:00:00+01:00');
  assert.equal(lunes.llamar('hoy').datos.plan_id, segundo.plan_id);
  assert.deepEqual(estados(), { [primero.plan_id]: 'archivado', [segundo.plan_id]: 'activo', [filas(gas, 'planes')[2].plan_id]: 'borrador' });
  assert.equal(filas(gas, 'plan_comidas').length, 168, 'las comidas del archivado se conservan');
});

test('activarPlan: con el activo ya terminado, lo archiva', () => {
  const gas = preparar();
  const primero = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: primero.plan_id });
  const despues = enFecha(gas, '2026-11-03T08:00:00+01:00');
  const segundo = despues.llamar('generarPlan').datos;
  assert.equal(segundo.inicio, '2026-11-09');
  assert.equal(despues.llamar('activarPlan', { plan_id: segundo.plan_id }).datos.estado, 'activo');
  assert.equal(filas(gas, 'planes').find(p => p.plan_id === primero.plan_id).estado, 'archivado');
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

// ---------- Fase 4: progreso y ajuste quincenal ----------

test('registrarPeso + progreso: uno por día, media de 7 días, meta, adherencia y racha', () => {
  const { gas, plan } = planActivoEnMiercoles();
  gas.llamar('config', { cambios: { peso_objetivo: 75 } });
  let r = gas.llamar('registrarPeso', { peso_kg: '80,4' });
  assert.equal(r.ok, true, r.error);
  r = gas.llamar('registrarPeso', { peso_kg: 80.2 });
  assert.equal(filas(gas, 'pesos').length, 1, 'el mismo día se sustituye');
  gas.llamar('registrarPeso', { peso_kg: 81, fecha: '2026-10-19' });
  const p = gas.llamar('progreso').datos;
  assert.deepEqual(p.ultimo, { fecha: '2026-10-21', peso: 80.2 });
  assert.equal(p.pesos.length, 2);
  assert.equal(p.pesos[1].media, 80.6);
  assert.equal(p.meta, 75);
  assert.equal(p.bloque.numero, 1);
  assert.equal(p.bloque.dia, 3);
  assert.equal(p.bloque.adherencia.planificadas, 8, 'lunes y martes');
  assert.equal(p.racha, 0);
  ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].forEach(c => {
    gas.llamar('marcarComida', { plan_id: plan.plan_id, fecha: '2026-10-21', comida: c, hecha: 'si' });
  });
  const despues = gas.llamar('progreso').datos;
  assert.equal(despues.racha, 1);
  assert.deepEqual(despues.bloque.adherencia, { hechas: 4, planificadas: 12, sin_marcar: 8, pct: 33 });
  assert.match(gas.llamar('registrarPeso', { peso_kg: 'mucho' }).error, /no válido/);
  assert.match(gas.llamar('registrarPeso', { peso_kg: 80, fecha: '2027-01-01' }).error, /Fecha no válida/);
});

test('alimentos, renombrarAlimento y guardarExcluidos', () => {
  const gas = preparar();
  const lista = gas.llamar('alimentos').datos;
  assert.equal(lista.length, 95);
  const salmon = lista.find(a => a.id === 'salmon');
  assert.ok(salmon.recetas >= 2);
  assert.equal(salmon.excluido, false);
  assert.equal(gas.llamar('renombrarAlimento', { id: 'salmon', nombre: '  Salmón fresco ' }).datos.nombre, 'Salmón fresco');
  assert.equal(filas(gas, 'alimentos').find(a => a.id === 'salmon').nombre, 'Salmón fresco');
  assert.match(gas.llamar('renombrarAlimento', { id: 'salmon', nombre: ' ' }).error, /entre 1 y 60/);
  assert.match(gas.llamar('renombrarAlimento', { id: 'xx', nombre: 'X' }).error, /No existe/);

  gas.contexto.anadirFilas_('preferencias', [{ tipo: 'alergia', alimento_id: 'nueces', nota: '' }]);
  assert.deepEqual(gas.llamar('guardarExcluidos', { alimentos: ['salmon', 'salmon'] }).datos, ['salmon']);
  assert.equal(gas.llamar('alimentos').datos.find(a => a.id === 'salmon').excluido, true);
  gas.llamar('guardarExcluidos', { alimentos: [] });
  assert.deepEqual(filas(gas, 'preferencias').map(p => p.tipo), ['alergia'], 'las alergias no se tocan');
  assert.match(gas.llamar('guardarExcluidos', { alimentos: ['xx'] }).error, /No existe/);
});

// Plan activo del 19 oct al 1 nov con pesajes diarios y todas las comidas hechas hasta el día indicado.
function bloqueCompleto(ahoraIso, porDia) {
  const gas = preparar();
  const plan = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: plan.plan_id });
  const hoy = ahoraIso.slice(0, 10);
  const pesos = [];
  for (let i = 0; i <= 13; i++) {
    const fecha = new Date(Date.UTC(2026, 9, 19 + i)).toISOString().slice(0, 10);
    if (fecha <= hoy) pesos.push({ fecha, peso_kg: Math.round((80 - porDia * i) * 100) / 100, cintura_cm: '' });
  }
  gas.contexto.anadirFilas_('pesos', pesos);
  const comidas = filas(gas, 'plan_comidas').map(f => Object.assign(f, { hecha: f.fecha < hoy ? 'si' : f.hecha }));
  gas.contexto.reescribirTabla_('plan_comidas', comidas);
  return { gas: enFecha(gas, ahoraIso), plan };
}

test('revisarFinDePlan: genera el borrador 2 días antes del fin, con balance y propuesta', () => {
  const { gas: antes } = bloqueCompleto('2026-10-29T07:00:00+01:00', 0.01);
  antes.contexto.revisarFinDePlan();
  assert.equal(filas(antes, 'planes').length, 1, '3 días antes todavía no');

  const { gas, plan } = bloqueCompleto('2026-10-30T07:00:00+01:00', 0.01);
  gas.contexto.revisarFinDePlan();
  assert.equal(filas(gas, 'planes').length, 2);
  gas.contexto.revisarFinDePlan();
  assert.equal(filas(gas, 'planes').length, 2, 'no genera otro si ya hay borrador');

  const vista = gas.llamar('plan').datos;
  assert.equal(vista.borrador.inicio, '2026-11-02');
  assert.equal(vista.borrador.bloque, 2);
  const b = vista.borrador.balance;
  assert.equal(b.plan_id, plan.plan_id);
  assert.equal(b.bloque, 1);
  assert.equal(b.pesajes, 12);
  assert.equal(b.adherencia.pct, 100);
  assert.ok(b.ritmo.ritmo_pct > -0.25, 'pierde poco');
  assert.equal(b.propuesta.motivo, 'lento');
  assert.deepEqual(b.propuesta.opciones.map(o => o.delta), [-120, 0]);
  assert.equal(gas.llamar('hoy').datos.nuevo_plan, true);
});

test('activarPlan con ajuste: cambia objetivos, recalcula gramos del borrador y lo apunta en el historial', () => {
  const { gas } = bloqueCompleto('2026-10-31T09:00:00+01:00', 0.01);
  const borrador = gas.llamar('generarPlan').datos;
  const antes = filas(gas, 'plan_comidas').filter(f => f.plan_id === borrador.plan_id);
  assert.match(gas.llamar('activarPlan', { plan_id: borrador.plan_id, ajuste_kcal: 50 }).error, /no válido/);

  const r = gas.llamar('activarPlan', { plan_id: borrador.plan_id, ajuste_kcal: -120 });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.datos.estado, 'siguiente');
  const config = gas.llamar('config').datos;
  const total = ['desayuno', 'almuerzo', 'merienda', 'cena'].reduce((s, c) => s + config['objetivo_' + c].kcal, 0);
  assert.ok(Math.abs(total - 1535) <= 2, String(total));
  assert.equal(config.objetivo_almuerzo.P, 41.1);

  const despues = filas(gas, 'plan_comidas').filter(f => f.plan_id === borrador.plan_id);
  assert.deepEqual(despues.map(f => f.receta_id), antes.map(f => f.receta_id), 'mismos platos');
  const kcal = lista => lista.reduce((s, f) => s + Number(f.kcal), 0) / 14;
  assert.ok(kcal(despues) < kcal(antes) - 60, `${kcal(antes)} → ${kcal(despues)}`);
  const siguiente = gas.llamar('plan').datos.siguiente;
  assert.ok(Math.abs(siguiente.objetivoDia.kcal - 1535) <= 2);

  const historial = filas(gas, 'ajustes_historial');
  assert.equal(historial.length, 1);
  assert.equal(historial[0].propuesta_kcal, -120);
  assert.equal(historial[0].aceptada, 'si');
});

test('activarPlan manteniendo: no cambia objetivos, pero aplica los editados en Ajustes', () => {
  const { gas } = bloqueCompleto('2026-10-31T09:00:00+01:00', 0.1);
  const borrador = gas.llamar('generarPlan').datos;
  assert.equal(gas.llamar('plan').datos.borrador.balance.propuesta.motivo, 'en_ritmo');
  gas.llamar('config', { cambios: { objetivo_cena: { kcal: 400, P: 36, C: 33, G: 13 } } });
  const r = gas.llamar('activarPlan', { plan_id: borrador.plan_id, ajuste_kcal: 0 });
  assert.equal(r.ok, true, r.error);
  const siguiente = gas.llamar('plan').datos.siguiente;
  assert.deepEqual(siguiente.dias[0].comidas[3].objetivo, { kcal: 400, P: 36, C: 33, G: 13 });
  assert.equal(filas(gas, 'ajustes_historial')[0].aceptada, 'si');
});
