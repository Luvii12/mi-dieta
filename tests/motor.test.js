// Motor en el navegador: las acciones de web/motor/ se cargan solo con JavaScript estándar y el almacén en
// memoria (Memoria.js), que dice qué tablas ha cambiado cada acción para guardar solo esas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { jsDe, cargarMotor, nuevoMotor } = require('./motor_navegador.js');

const MIERCOLES = '2026-10-21T13:00:00+02:00';

test('el motor no usa ninguna API de Google', () => {
  const prohibidas = /\b(SpreadsheetApp|PropertiesService|LockService|Utilities|Logger|ContentService|ScriptApp|UrlFetchApp)\b/;
  jsDe('web/motor').forEach(archivo => {
    const codigo = fs.readFileSync(archivo, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(codigo, prohibidas, path.basename(archivo));
  });
});

test('fechaHora_: hora de Madrid, también en los cambios de hora', () => {
  const { contexto } = cargarMotor(MIERCOLES, {});
  const f = (iso, formato) => contexto.fechaHora_(new Date(iso), formato);
  assert.equal(f('2026-10-16T07:05:09Z', 'yyyyMMdd-HHmmss'), '20261016-090509');
  assert.equal(f('2026-10-16T07:05:09Z', "yyyy-MM-dd'T'HH:mm"), '2026-10-16T09:05');
  assert.equal(f('2026-03-29T00:30:00Z', 'yyyyMMdd-HHmmss'), '20260329-013000');
  assert.equal(f('2026-03-29T01:30:00Z', 'yyyyMMdd-HHmmss'), '20260329-033000');
  assert.equal(f('2026-10-25T00:30:00Z', "yyyy-MM-dd'T'HH:mm"), '2026-10-25T02:30');
  assert.equal(f('2026-10-25T01:30:00Z', "yyyy-MM-dd'T'HH:mm"), '2026-10-25T02:30');
});

test('tablasCambiadas_ devuelve solo las tablas tocadas y se vacía al leerla', () => {
  const motor = nuevoMotor(MIERCOLES);
  motor.contexto.tablasCambiadas_(); // las de partida no cuentan
  motor.llamar('registrarPeso', { peso_kg: 80 });
  const cambiadas = motor.contexto.tablasCambiadas_();
  assert.deepEqual(Object.keys(cambiadas), ['pesos']);
  assert.deepEqual(JSON.parse(JSON.stringify(cambiadas.pesos)), [{ fecha: '2026-10-21', peso_kg: 80, cintura_cm: '' }]);
  assert.deepEqual(Object.keys(motor.contexto.tablasCambiadas_()), []);
  motor.llamar('progreso'); // solo lee
  assert.deepEqual(Object.keys(motor.contexto.tablasCambiadas_()), []);
});
