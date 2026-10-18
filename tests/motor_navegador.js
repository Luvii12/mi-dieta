// Ayudas para los tests: el motor de web/motor/ cargado como en el navegador (sin APIs de Google) y Apps
// Script con la misma fecha y el mismo azar, para comparar los dos.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { cargarAppsScript, jsDe, RAIZ } = require('./simulador_gas.js');

// Mismo azar en los dos lados para que el generador elija los mismos platos.
const AZAR_FIJO = `Math.random = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();`;

function conFecha(ahoraIso) {
  const DateReal = Date;
  return class DateFija extends DateReal {
    constructor(...args) { if (args.length) super(...args); else super(ahoraIso); }
    static now() { return new DateReal(ahoraIso).getTime(); }
  };
}

// Como en el navegador: solo lo estándar de JavaScript, nada de SpreadsheetApp, Utilities, Logger…
// `motor` es lo que web/supabase.js necesita del motor.
function cargarMotor(ahoraIso, tablas) {
  const contexto = vm.createContext({ console, Intl, Date: conFecha(ahoraIso) });
  jsDe('web/motor').concat([path.join(RAIZ, 'apps-script', 'Semilla.js')]).forEach(archivo => {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(RAIZ, archivo) });
  });
  vm.runInContext(AZAR_FIJO + ' this.__ACCIONES = ACCIONES; this.__PESTANAS = PESTANAS;', contexto);
  contexto.cargarTablas_(tablas);
  const llamar = (accion, extra = {}) => {
    const r = contexto.manejar_({ ...extra, accion, token: 't' }, 't', contexto.__ACCIONES);
    return JSON.parse(JSON.stringify(r));
  };
  const motor = {
    PESTANAS: contexto.__PESTANAS, ACCIONES: contexto.__ACCIONES, cargarTablas_: contexto.cargarTablas_,
    tablasCambiadas_: contexto.tablasCambiadas_, aCeldas_: contexto.aCeldas_, manejar_: contexto.manejar_, fechaHora_: contexto.fechaHora_,
  };
  return { contexto, llamar, motor };
}

// Apps Script sobre una hoja en memoria: nueva (con la semilla) o con las hojas de `anterior`.
function cargarGas(ahoraIso, anterior) {
  const gas = cargarAppsScript(ahoraIso);
  if (anterior) {
    gas.libro.hojas.splice(0, gas.libro.hojas.length, ...anterior.libro.hojas);
    Object.assign(gas.propiedades, anterior.propiedades);
  } else {
    gas.contexto.configurarHoja();
    gas.contexto.crearToken();
  }
  vm.runInContext(AZAR_FIJO, gas.contexto);
  return gas;
}

// {tabla: [filas como celdas]} de un contexto (Apps Script o motor).
function todasLasTablas(contexto) {
  const nombres = vm.runInContext('Object.keys(PESTANAS)', contexto);
  return Object.fromEntries(nombres.map(n => [n, JSON.parse(JSON.stringify(contexto.leerTabla_(n)))]));
}

module.exports = { AZAR_FIJO, conFecha, cargarMotor, cargarGas, todasLasTablas };
