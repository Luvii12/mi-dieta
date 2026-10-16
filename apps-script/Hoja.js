// Acceso a Google Sheets. Único sitio que usa SpreadsheetApp.

function libro_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function hoja_(nombre) {
  const hoja = libro_().getSheetByName(nombre);
  if (!hoja) throw new Error('Falta la pestaña «' + nombre + '». Ejecuta configurarHoja() en el editor.');
  return hoja;
}

// Toda la pestaña como lista de objetos {cabecera: valor}.
function leerTabla_(nombre) {
  return filasAObjetos_(hoja_(nombre).getDataRange().getValues());
}

// Añade objetos al final de la pestaña, en el orden de sus cabeceras.
function anadirFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const hoja = hoja_(nombre);
  const filas = objetos.map(obj => objetoAFila_(obj, PESTANAS[nombre]));
  const primeraLibre = hoja.getLastRow() + 1;
  const faltan = primeraLibre + filas.length - 1 - hoja.getMaxRows();
  if (faltan > 0) hoja.insertRowsAfter(hoja.getMaxRows(), faltan);
  hoja.getRange(primeraLibre, 1, filas.length, filas[0].length).setValues(filas);
}

// Sustituye todo el contenido de una pestaña (menos las cabeceras). Mantiene el formato de las columnas.
function reescribirTabla_(nombre, objetos) {
  const hoja = hoja_(nombre);
  if (hoja.getLastRow() > 1) hoja.getRange(2, 1, hoja.getLastRow() - 1, hoja.getLastColumn()).clearContent();
  anadirFilas_(nombre, objetos);
}

// Todas las recetas (activas o no) con los ingredientes ya convertidos: {id: receta}.
function leerRecetasPorId_() {
  const porId = {};
  leerTabla_('recetas').forEach(fila => {
    try {
      porId[fila.id] = filaAReceta_(fila);
    } catch (err) {
      porId[fila.id] = Object.assign({}, fila, { error: err.message });
    }
  });
  return porId;
}

function leerConfig_() {
  return configAObjeto_(leerTabla_('config'));
}

// Crea o actualiza una fila de `config`. Usa un bloqueo para que dos peticiones no pisen la misma fila.
function guardarConfig_(clave, valor) {
  const bloqueo = LockService.getScriptLock();
  bloqueo.waitLock(10000);
  try {
    const hoja = hoja_('config');
    const claves = hoja.getRange(1, 1, Math.max(hoja.getLastRow(), 1), 1).getValues().map(f => f[0]);
    const indice = claves.indexOf(clave);
    const fila = indice > 0 ? indice + 1 : hoja.getLastRow() + 1;
    hoja.getRange(fila, 1, 1, 2).setNumberFormat('@').setValues([[clave, serializarValor_(valor)]]);
  } finally {
    bloqueo.releaseLock();
  }
}
