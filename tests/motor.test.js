// Motor en el navegador (fase M1): las acciones de web/motor/ se cargan sin ninguna API de Google, con el
// almacén en memoria (Memoria.js), y tienen que dar exactamente lo mismo que en Apps Script sobre Sheets.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { jsDe } = require('./simulador_gas.js');
const { cargarMotor, cargarGas, todasLasTablas } = require('./motor_navegador.js');

const VIERNES = '2026-10-16T09:00:00+02:00';
const MIERCOLES = '2026-10-21T13:00:00+02:00';

test('el motor no usa ninguna API de Google', () => {
  const prohibidas = /\b(SpreadsheetApp|PropertiesService|LockService|Utilities|Logger|ContentService|ScriptApp|UrlFetchApp)\b/;
  jsDe('web/motor').forEach(archivo => {
    const codigo = fs.readFileSync(archivo, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(codigo, prohibidas, path.basename(archivo));
  });
});

test('fechaHora_ da lo mismo que Utilities.formatDate', () => {
  const { contexto } = cargarMotor(VIERNES, {});
  const gas = cargarGas(VIERNES);
  const fecha = new Date('2026-03-29T00:30:00Z'); // cambio de hora en Madrid
  ["yyyyMMdd-HHmmss", "yyyy-MM-dd'T'HH:mm"].forEach(f => {
    assert.equal(contexto.fechaHora_(fecha, f), gas.contexto.Utilities.formatDate(fecha, 'Europe/Madrid', f));
  });
});

test('las acciones dan lo mismo en memoria que en Apps Script, y dejan las mismas tablas', () => {
  // Viernes: generar el plan de 14 días (empieza el lunes) y activarlo.
  const gas = cargarGas(VIERNES);
  const motor = cargarMotor(VIERNES, todasLasTablas(gas.contexto));
  const iguales = (accion, extra) => {
    const a = gas.llamar(accion, extra);
    const b = motor.llamar(accion, extra);
    assert.deepEqual(b, a, accion);
    if (!(extra && extra.plan_id === 'no_existe')) assert.equal(a.ok, true, accion + ': ' + a.error);
    return a;
  };
  const generado = iguales('generarPlan');
  assert.equal(generado.ok, true, generado.error);
  assert.equal(generado.datos.dias.length, 14);
  iguales('plan');
  iguales('activarPlan', { plan_id: generado.datos.plan_id });
  iguales('activarPlan', { plan_id: 'no_existe' }); // los errores también coinciden
  assert.deepEqual(todasLasTablas(motor.contexto), todasLasTablas(gas.contexto));

  // Miércoles: uso diario sobre lo que quedó guardado.
  const gas2 = cargarGas(MIERCOLES, gas);
  const motor2 = cargarMotor(MIERCOLES, todasLasTablas(motor.contexto));
  const iguales2 = (accion, extra) => {
    const a = gas2.llamar(accion, extra);
    const b = motor2.llamar(accion, extra);
    assert.deepEqual(b, a, accion);
    if (!(extra && extra.plan_id === 'no_existe')) assert.equal(a.ok, true, accion + ': ' + a.error);
    return a;
  };
  const hoy = iguales2('hoy');
  assert.equal(hoy.datos.comidas.length, 4);
  const dia = { plan_id: hoy.datos.plan_id, fecha: hoy.datos.fecha };
  iguales2('marcarComida', { ...dia, comida: 'Desayuno', hecha: 'si' });
  iguales2('marcarComida', { ...dia, comida: 'Almuerzo', hecha: 'libre' });
  const alternativas = iguales2('alternativas', { ...dia, comida: 'Cena' });
  assert.ok(alternativas.datos.length > 0);
  iguales2('cambiarPlato', { ...dia, comida: 'Cena', receta_id: alternativas.datos[0].receta_id || alternativas.datos[0].id });
  iguales2('valorar', { receta_id: hoy.datos.comidas[0].receta_id, valor: 'me_encanta' });
  iguales2('registrarPeso', { peso_kg: '82,4', fecha: '2026-10-20' });
  iguales2('registrarPeso', { peso_kg: 82.1 });
  iguales2('config', { cambios: { peso_objetivo: 78 } });
  iguales2('progreso');
  iguales2('recetas');
  iguales2('alimentos');
  iguales2('guardarExcluidos', { alimentos: ['salmon'] });
  iguales2('renombrarAlimento', { id: 'aceite_oliva', nombre: 'Aceite de oliva virgen extra' });
  iguales2('plan');
  iguales2('pedidoRecetas', { comida: 'Cena', cantidad: 2, idea: 'mexicana' });
  iguales2('propuestas');
  assert.deepEqual(todasLasTablas(motor2.contexto), todasLasTablas(gas2.contexto));
});

test('tablasCambiadas_ devuelve solo las tablas tocadas y se vacía al leerla', () => {
  const gas = cargarGas(MIERCOLES);
  const motor = cargarMotor(MIERCOLES, todasLasTablas(gas.contexto));
  motor.llamar('registrarPeso', { peso_kg: 80 });
  const cambiadas = motor.contexto.tablasCambiadas_();
  assert.deepEqual(Object.keys(cambiadas), ['pesos']);
  assert.deepEqual(JSON.parse(JSON.stringify(cambiadas.pesos)), [{ fecha: '2026-10-21', peso_kg: 80, cintura_cm: '' }]);
  assert.deepEqual(Object.keys(motor.contexto.tablasCambiadas_()), []);
  motor.llamar('progreso'); // solo lee
  assert.deepEqual(Object.keys(motor.contexto.tablasCambiadas_()), []);
});
