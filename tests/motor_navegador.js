// Ayudas para los tests y los scripts: el motor de web/motor/ cargado como en el navegador, con una fecha y
// un azar fijos, y las tablas de partida de un usuario nuevo (biblioteca semilla y su configuración).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');
const jsDe = dir => fs.readdirSync(path.join(RAIZ, dir)).filter(f => f.endsWith('.js')).sort().map(f => path.join(RAIZ, dir, f));

// Azar fijo para que el generador elija siempre los mismos platos.
const AZAR_FIJO = `Math.random = (() => { let s = 12345; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; })();`;

function conFecha(ahoraIso) {
  const DateReal = Date;
  return class DateFija extends DateReal {
    constructor(...args) { if (args.length) super(...args); else super(ahoraIso); }
    static now() { return new DateReal(ahoraIso).getTime(); }
  };
}

// Como en el navegador: solo lo estándar de JavaScript. Además carga data/semilla.js (SEMILLA).
// `motor` es lo que web/supabase.js necesita del motor.
function cargarMotor(ahoraIso, tablas) {
  const contexto = vm.createContext({ console, Intl, Date: conFecha(ahoraIso) });
  jsDe('web/motor').concat([path.join(RAIZ, 'data', 'semilla.js')]).forEach(archivo => {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(RAIZ, archivo) });
  });
  vm.runInContext(AZAR_FIJO + ' this.__ACCIONES = ACCIONES; this.__PESTANAS = PESTANAS;', contexto);
  contexto.cargarTablas_(tablas);
  const llamar = (accion, extra = {}) => JSON.parse(JSON.stringify(contexto.manejar_({ ...extra, accion }, contexto.__ACCIONES)));
  const motor = {
    PESTANAS: contexto.__PESTANAS, ACCIONES: contexto.__ACCIONES, cargarTablas_: contexto.cargarTablas_,
    tablasCambiadas_: contexto.tablasCambiadas_, aCeldas_: contexto.aCeldas_, manejar_: contexto.manejar_, fechaHora_: contexto.fechaHora_,
  };
  return { contexto, llamar, motor };
}

// Biblioteca semilla (95 alimentos, 22 recetas) y la configuración de partida: los objetivos de «Ajustes Fran.
// Déficit», tolerancias y límites. Es lo que tenía la hoja de Google recién creada.
function tablasIniciales() {
  const { contexto } = cargarMotor(new Date().toISOString(), {});
  vm.runInContext(`
    anadirFilas_('alimentos', SEMILLA.alimentos);
    anadirFilas_('recetas', SEMILLA.recetas);
    ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].forEach(comida => {
      guardarConfig_('objetivo_' + comida.toLowerCase(), SEMILLA.objetivos[comida]);
    });
    guardarConfig_('tolerancias', TOLERANCIAS_INICIALES);
    guardarConfig_('max_rep_desayuno', 4);
    guardarConfig_('max_rep_merienda', 4);
    guardarConfig_('dias_flexibles', 0);
    guardarConfig_('comida_libre_semanal', true);
    guardarConfig_('kcal_minimas', 1400);
  `, contexto);
  return todasLasTablas(contexto);
}

// Motor con las tablas de partida.
const nuevoMotor = ahoraIso => cargarMotor(ahoraIso, tablasIniciales());

// Otro motor con las tablas que dejó `m`, en otra fecha (p. ej. el miércoles siguiente).
const enFecha = (m, ahoraIso) => cargarMotor(ahoraIso, todasLasTablas(m.contexto));

// {tabla: [filas como celdas]} de un contexto del motor.
function todasLasTablas(contexto) {
  const nombres = vm.runInContext('Object.keys(PESTANAS)', contexto);
  return Object.fromEntries(nombres.map(n => [n, JSON.parse(JSON.stringify(contexto.leerTabla_(n)))]));
}

module.exports = { RAIZ, jsDe, AZAR_FIJO, conFecha, cargarMotor, tablasIniciales, nuevoMotor, enFecha, todasLasTablas };
