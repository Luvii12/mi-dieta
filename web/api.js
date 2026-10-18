// Sesión con Supabase, acciones y datos guardados en el móvil.
// Las acciones son las mismas que tenía Apps Script, pero las ejecuta el motor (web/motor/, cargado con
// <script> en index.html) en el navegador, sobre los datos de Supabase (ver supabase.js).

import { SUPABASE } from './conexion.js';
import { entrar as entrarSupabase, renovar, salir, ejecutar, editaAlimentos, ErrorSesion, ErrorToken } from './supabase.js';

const CLAVE_SESION = 'dieta.sesion';
const RENOVAR_ANTES = 5 * 60000; // la sesión dura 1 hora: se renueva si le quedan menos de 5 minutos

// localStorage puede fallar (modo privado, datos borrados): nunca debe romper la app.
export function leerLocal(clave) {
  try {
    return JSON.parse(localStorage.getItem(clave));
  } catch (err) {
    return null;
  }
}

export function guardarLocal(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (err) {
    // Sin almacenamiento: la app sigue funcionando, solo no recuerda el dato.
  }
}

// Borra todo lo de la app guardado en el móvil (sesión y copia de los datos). Solo las claves «dieta.»:
// el dominio luvii12.github.io lo comparte con la app del gimnasio.
function borrarCopiaLocal() {
  try {
    Object.keys(localStorage).filter(k => k.startsWith('dieta.')).forEach(k => localStorage.removeItem(k));
  } catch (err) {
    // Nada guardado que borrar.
  }
}

const conexion = () => ({ url: SUPABASE.url, clave: SUPABASE.clave, fetch: (...args) => fetch(...args) });

// Lo que web/supabase.js necesita del motor (declarado por los <script> de web/motor/).
const motor = () => ({ PESTANAS, ACCIONES, cargarTablas_, tablasCambiadas_, aCeldas_, manejar_, fechaHora_ });

// ---------- Sesión ----------

export const leerSesion = () => leerLocal(CLAVE_SESION);
export const haySesion = () => Boolean(leerSesion());

export async function entrar(email, password) {
  const sesion = await entrarSupabase(conexion(), email.trim(), password);
  const anterior = leerSesion();
  if (!anterior || anterior.usuario.id !== sesion.usuario.id) borrarCopiaLocal();
  guardarLocal(CLAVE_SESION, sesion);
}

export async function cerrarSesion() {
  const sesion = leerSesion();
  borrarCopiaLocal();
  if (sesion) await salir(conexion(), sesion);
}

// La sesión ya no se puede renovar: se olvida y la app vuelve a la pantalla de entrada.
function sesionCaducada() {
  borrarCopiaLocal();
  document.dispatchEvent(new Event('sesion-cerrada'));
}

// Sesión con tiempo por delante: la renueva si va a caducar (o si `forzar`).
async function sesionValida(forzar) {
  const sesion = leerSesion();
  if (!sesion) {
    sesionCaducada();
    throw new ErrorSesion('Entra con tu email y tu contraseña.');
  }
  if (!forzar && sesion.expira - Date.now() > RENOVAR_ANTES) return sesion;
  try {
    const nueva = await renovar(conexion(), sesion);
    guardarLocal(CLAVE_SESION, nueva);
    return nueva;
  } catch (err) {
    if (err instanceof ErrorSesion) sesionCaducada();
    throw err;
  }
}

// ---------- Acciones ----------

// Llama a una acción (las de web/motor/Acciones.js). Devuelve sus datos o lanza un Error con un mensaje en
// español. Las llamadas van de una en una, para que ninguna lea datos que otra está guardando.
let cola = Promise.resolve();
export function llamar(accion, extra = {}) {
  const resultado = cola.then(() => llamarYa(Object.assign({}, extra, { accion })));
  cola = resultado.catch(() => {});
  return resultado;
}

async function llamarYa(peticion) {
  try {
    return await ejecutar(conexion(), await sesionValida(false), motor(), peticion);
  } catch (err) {
    if (!(err instanceof ErrorToken)) throw err;
    // La base no ha aceptado la sesión (p. ej. el móvil tiene mal la hora): se renueva y se repite una vez.
    try {
      return await ejecutar(conexion(), await sesionValida(true), motor(), peticion);
    } catch (otro) {
      if (otro instanceof ErrorToken) sesionCaducada();
      throw otro;
    }
  }
}

// ¿Puede esta cuenta cambiar los nombres de los alimentos comunes? (ver supabase.js)
export async function puedoEditarAlimentos() {
  return editaAlimentos(conexion(), await sesionValida(false));
}
