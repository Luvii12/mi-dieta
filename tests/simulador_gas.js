// Simulador mínimo de Apps Script para tests: carga los archivos de apps-script/ en un mismo ámbito
// global (como hace Google) con una hoja de cálculo en memoria. Solo implementa lo que usa el código.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function crearHoja(nombre) {
  const filas = []; // filas[r][c], base 0
  let maxRows = 1000;
  const ancho = () => filas.reduce((m, f) => Math.max(m, f.length), 0);
  const hoja = {
    filas,
    getName: () => nombre,
    getLastRow: () => {
      for (let r = filas.length - 1; r >= 0; r--) if ((filas[r] || []).some(v => v !== '' && v != null)) return r + 1;
      return 0;
    },
    getLastColumn: () => ancho(),
    getMaxRows: () => maxRows,
    insertRowsAfter: (despues, n) => { maxRows += n; },
    setFrozenRows: () => {},
    appendRow: valores => { filas[hoja.getLastRow()] = valores.slice(); },
    getDataRange: () => hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 1), Math.max(ancho(), 1)),
    getRange: (fila, col, numFilas = 1, numCols = 1) => {
      if (fila + numFilas - 1 > maxRows) throw new Error('Rango fuera de la hoja');
      const rango = {
        getValues: () => Array.from({ length: numFilas }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => {
            const v = (filas[fila - 1 + r] || [])[col - 1 + c];
            return v == null ? '' : v;
          })),
        setValues: valores => {
          valores.forEach((v, r) => {
            const i = fila - 1 + r;
            filas[i] = filas[i] || [];
            v.forEach((x, c) => { filas[i][col - 1 + c] = x; });
          });
          return rango;
        },
        setValue: v => rango.setValues([[v]]),
        clearContent: () => rango.setValues(Array.from({ length: numFilas }, () => Array(numCols).fill(''))),
        setNumberFormat: () => rango,
        setFontWeight: () => rango,
      };
      return rango;
    },
  };
  return hoja;
}

function crearLibro() {
  const hojas = [crearHoja('Hoja 1')];
  return {
    hojas,
    getSheetByName: n => hojas.find(h => h.getName() === n) || null,
    insertSheet: n => { const h = crearHoja(n); hojas.push(h); return h; },
    getSheets: () => hojas.slice(),
    deleteSheet: h => hojas.splice(hojas.indexOf(h), 1),
  };
}

// Fecha con formato tipo Java (yyyy, MM, dd, HH, mm, ss, 'literal') en la zona indicada.
function formatDate(fecha, zona, formato) {
  const partes = {};
  new Intl.DateTimeFormat('en-GB', {
    timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(fecha).forEach(p => { partes[p.type] = p.value; });
  return formato.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, literal) => {
    if (literal !== undefined) return literal;
    return { yyyy: partes.year, MM: partes.month, dd: partes.day, HH: partes.hour, mm: partes.minute, ss: partes.second }[m];
  });
}

const RAIZ = path.join(__dirname, '..');
const jsDe = dir => fs.readdirSync(path.join(RAIZ, dir)).filter(f => f.endsWith('.js')).sort().map(f => path.join(RAIZ, dir, f));

// Lo mismo que sube clasp (ver .claspignore): apps-script/ y el motor, sin el almacén del navegador.
function archivosAppsScript() {
  return jsDe('apps-script').concat(jsDe('web/motor').filter(f => path.basename(f) !== 'Memoria.js'));
}

// ahoraIso: momento fijo para `new Date()` dentro del script (p. ej. '2026-10-21T09:00:00+02:00').
function cargarAppsScript(ahoraIso) {
  const libro = crearLibro();
  const propiedades = {};
  const registro = [];
  const DateReal = Date;
  class DateFija extends DateReal {
    constructor(...args) { if (args.length) super(...args); else super(ahoraIso); }
    static now() { return new DateReal(ahoraIso).getTime(); }
  }
  let uuid = 0;
  const contexto = vm.createContext({
    console,
    Intl,
    Date: ahoraIso ? DateFija : DateReal,
    SpreadsheetApp: { getActiveSpreadsheet: () => libro },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: k => (k in propiedades ? propiedades[k] : null),
        setProperty: (k, v) => { propiedades[k] = v; },
        deleteProperty: k => { delete propiedades[k]; },
      }),
    },
    Utilities: {
      formatDate,
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
    },
    Logger: { log: (...a) => registro.push(a.join(' ')) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: texto => ({ texto, setMimeType() { return this; } }),
    },
  });
  archivosAppsScript().forEach(archivo => {
    vm.runInContext(fs.readFileSync(archivo, 'utf8'), contexto, { filename: path.relative(RAIZ, archivo) });
  });
  // Las declaraciones `const` de nivel superior no son propiedades del contexto: se exponen aquí.
  vm.runInContext('this.__ACCIONES = ACCIONES;', contexto);

  const llamar = (accion, extra = {}) => {
    const salida = contexto.doPost({ postData: { contents: JSON.stringify({ ...extra, accion, token: propiedades.APP_TOKEN }) } });
    return JSON.parse(salida.texto);
  };
  return { contexto, libro, propiedades, registro, llamar };
}

module.exports = { cargarAppsScript, formatDate, archivosAppsScript, jsDe, RAIZ };
