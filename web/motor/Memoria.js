// Almacén en memoria para ejecutar las acciones en el navegador: leerTabla_, anadirFilas_, reescribirTabla_,
// actualizarFilas_, escribirConfig_ y conBloqueo_. Guarda los valores como las celdas de la antigua hoja de
// Google (con la que empezó la app): '' si no hay valor y los objetos como JSON.
// La PWA carga aquí las tablas del usuario (cargarTablas_), ejecuta la acción y después guarda en la base
// de datos las tablas que han cambiado (tablasCambiadas_).

let TABLAS_ = {};
let CAMBIADAS_ = new Set();

// {nombre: [filas]} → sustituye todo lo que hubiera. Las tablas que falten quedan vacías.
function cargarTablas_(tablas) {
  TABLAS_ = {};
  CAMBIADAS_ = new Set();
  Object.keys(PESTANAS).forEach(nombre => {
    TABLAS_[nombre] = ((tablas || {})[nombre] || []).map(f => aCeldas_(nombre, f)).filter(f => !filaVacia_(f));
  });
}

// Tablas que ha cambiado alguna acción desde la última llamada, con todas sus filas: {nombre: [filas]}.
function tablasCambiadas_() {
  const cambiadas = {};
  CAMBIADAS_.forEach(nombre => { cambiadas[nombre] = leerTabla_(nombre); });
  CAMBIADAS_ = new Set();
  return cambiadas;
}

function leerTabla_(nombre) {
  return tablaMemoria_(nombre).map(f => Object.assign({}, f));
}

function anadirFilas_(nombre, objetos) {
  if (!objetos.length) return;
  const tabla = tablaMemoria_(nombre);
  objetos.forEach(o => tabla.push(aCeldas_(nombre, o)));
  CAMBIADAS_.add(nombre);
}

function reescribirTabla_(nombre, objetos) {
  tablaMemoria_(nombre);
  TABLAS_[nombre] = objetos.map(o => aCeldas_(nombre, o)).filter(f => !filaVacia_(f));
  CAMBIADAS_.add(nombre);
}

// Cambia, en las filas que cumplan `coincide`, los valores de `cambios`. Devuelve cuántas cambió.
function actualizarFilas_(nombre, coincide, cambios) {
  const tabla = tablaMemoria_(nombre);
  let cambiadas = 0;
  tabla.forEach((fila, i) => {
    if (!coincide(Object.assign({}, fila))) return;
    tabla[i] = aCeldas_(nombre, Object.assign({}, fila, cambios));
    cambiadas++;
  });
  if (cambiadas) CAMBIADAS_.add(nombre);
  return cambiadas;
}

function escribirConfig_(clave, valor) {
  const fila = { clave: clave, valor: serializarValor_(valor) };
  if (!actualizarFilas_('config', f => f.clave === clave, fila)) anadirFilas_('config', [fila]);
}

// En el navegador cada acción se ejecuta entera de una vez: no hace falta bloqueo.
function conBloqueo_(fn) {
  return fn();
}

function tablaMemoria_(nombre) {
  if (!PESTANAS[nombre]) throw new Error('No existe la tabla «' + nombre + '».');
  if (!TABLAS_[nombre]) TABLAS_[nombre] = [];
  return TABLAS_[nombre];
}

// Objeto → fila con solo las columnas de la tabla, como quedaría en una celda de Sheets.
function aCeldas_(nombre, objeto) {
  const valores = objetoAFila_(objeto, PESTANAS[nombre]);
  const fila = {};
  PESTANAS[nombre].forEach((cab, i) => { fila[cab] = valores[i]; });
  return fila;
}

function filaVacia_(fila) {
  return Object.keys(fila).every(k => fila[k] === '' || fila[k] === null);
}
