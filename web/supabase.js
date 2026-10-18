// Supabase por fetch, sin librerías: la sesión (API de Auth) y las tablas (API REST).
// Las acciones del motor (web/motor/) se ejecutan aquí, en el navegador: se bajan las tablas del usuario y
// las comunes, se pasan al almacén en memoria (Memoria.js) con el mismo formato que las celdas de Sheets, se
// ejecuta la acción y se guardan en la base solo las filas que han cambiado.
// No usa nada del navegador: la conexión ({url, clave, fetch}) y el motor llegan como parámetros, así los
// tests lo ejecutan en Node contra una base falsa (tests/supabase_falso.js).

// Tablas que usa el motor (las de docs/DATOS.md). `clave`: columnas que identifican una fila (sin user_id);
// sin clave, cada fila se identifica por el `id` que le pone la base. `json`: columnas jsonb, que en el motor
// son texto JSON. `orden`: el de las filas al leerlas (en Sheets era el orden en que se añadieron).
export const TABLAS = {
  alimentos: { comun: true, clave: ['id'], orden: 'creado,id' },
  recetas: { comun: true, clave: ['id'], json: ['ingredientes_fijos', 'ingredientes_escalables'], orden: 'creado,id' },
  config: { clave: ['clave'], json: ['valor'], orden: 'clave' },
  valoraciones: { orden: 'id' },
  preferencias: { orden: 'id' },
  planes: { clave: ['plan_id'], json: ['objetivos'], orden: 'plan_id' },
  plan_comidas: { clave: ['plan_id', 'fecha', 'comida'], json: ['gramos'], orden: 'plan_id,fecha' },
  pesos: { clave: ['fecha'], orden: 'fecha' },
  ajustes_historial: { orden: 'id' },
};

// Orden al guardar: primero lo que otras filas necesitan (recetas antes que valoraciones, planes antes que
// sus comidas). Los borrados de tablas con clave van al final y al revés (comidas antes que su plan).
const ORDEN_GUARDAR = ['alimentos', 'recetas', 'config', 'planes', 'plan_comidas', 'pesos', 'valoraciones',
  'preferencias', 'ajustes_historial'];

const PAGINA = 1000; // Supabase devuelve como mucho 1.000 filas por petición
const LOTE_BORRAR = 50; // filas por petición al borrar (van en la URL)
const TOKEN_MOTOR = 'navegador'; // manejar_ pide un token; aquí la seguridad la pone la sesión

// La sesión ya no vale (o no hay): hay que volver a entrar.
export class ErrorSesion extends Error {}
// La API ha rechazado el token de acceso: se renueva la sesión y se repite.
export class ErrorToken extends ErrorSesion {}

const SIN_CONEXION = 'No se puede conectar con el servidor. Revisa la conexión a internet.';

async function pedir(con, metodo, ruta, { token, cuerpo, prefer } = {}) {
  const cabeceras = { apikey: con.clave };
  if (token) cabeceras.Authorization = 'Bearer ' + token;
  if (cuerpo !== undefined) cabeceras['Content-Type'] = 'application/json';
  if (prefer) cabeceras.Prefer = prefer;
  let respuesta;
  try {
    respuesta = await con.fetch(con.url + ruta, {
      method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch (err) {
    throw new Error(SIN_CONEXION);
  }
  let texto = '';
  try {
    texto = await respuesta.text();
  } catch (err) {
    throw new Error(SIN_CONEXION);
  }
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch (err) {
    datos = texto;
  }
  return { estado: respuesta.status, ok: respuesta.ok, datos };
}

function mensajeDe(r) {
  const d = r.datos && typeof r.datos === 'object' ? r.datos : {};
  if (r.estado >= 500) return `El servidor de datos no responde (${r.estado}). Inténtalo dentro de un rato.`;
  return d.message || d.msg || d.error_description || d.error || `Error ${r.estado} del servidor de datos.`;
}

// ---------- Sesión ----------

// Respuesta de Auth → lo que se guarda en el móvil.
function aSesion(d) {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expira: d.expires_at ? d.expires_at * 1000 : Date.now() + d.expires_in * 1000,
    usuario: { id: d.user.id, email: d.user.email },
  };
}

export async function entrar(con, email, password) {
  const r = await pedir(con, 'POST', '/auth/v1/token?grant_type=password', { cuerpo: { email, password } });
  if (r.ok) return aSesion(r.datos);
  const codigo = r.datos && (r.datos.error_code || r.datos.code);
  if (r.estado === 429) throw new Error('Demasiados intentos. Espera un poco y vuelve a probar.');
  if (codigo === 'email_not_confirmed') throw new Error('Tu cuenta aún no está confirmada.');
  if (r.estado === 400 || r.estado === 401) throw new Error('Email o contraseña incorrectos.');
  throw new Error(mensajeDe(r));
}

// Sesión nueva a partir de la anterior. Lanza ErrorSesion si ya no se puede renovar.
export async function renovar(con, sesion) {
  const r = await pedir(con, 'POST', '/auth/v1/token?grant_type=refresh_token', { cuerpo: { refresh_token: sesion.refresh_token } });
  if (r.ok) return aSesion(r.datos);
  if (r.estado >= 400 && r.estado < 500 && r.estado !== 429) throw new ErrorSesion('Tu sesión ha caducado: vuelve a entrar.');
  throw new Error(mensajeDe(r));
}

// Cierra la sesión en el servidor. Si falla (sin conexión), da igual: el móvil la olvida de todos modos.
export async function salir(con, sesion) {
  try {
    await pedir(con, 'POST', '/auth/v1/logout', { token: sesion.access_token });
  } catch (err) {
    // Nada que hacer.
  }
}

// ---------- API REST ----------

async function rest(con, sesion, metodo, ruta, cuerpo, prefer) {
  const r = await pedir(con, metodo, '/rest/v1/' + ruta, { token: sesion.access_token, cuerpo, prefer });
  if (r.estado === 401) throw new ErrorToken('Tu sesión ha caducado: vuelve a entrar.');
  if (!r.ok) throw new Error(mensajeDe(r));
  return r.datos;
}

async function leerTabla(con, sesion, nombre) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const pagina = await rest(con, sesion, 'GET', `${nombre}?select=*&order=${TABLAS[nombre].orden}&offset=${desde}&limit=${PAGINA}`);
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
}

// Todas las tablas a la vez: {nombre: [filas de la base]}. Las personales solo traen las del usuario (RLS).
export async function leerTablas(con, sesion) {
  const nombres = Object.keys(TABLAS);
  const filas = await Promise.all(nombres.map(n => leerTabla(con, sesion, n)));
  return Object.fromEntries(nombres.map((n, i) => [n, filas[i]]));
}

// ---------- Filas de la base ↔ filas del motor ----------

// Fila de la base → fila del motor, como una celda de Sheets: '' si no hay valor y los jsonb como texto JSON.
// `creado` de los planes (fecha y hora de la base) vuelve al formato que escribe el motor, en hora de Madrid.
export function deBase(nombre, fila, motor) {
  const json = TABLAS[nombre].json || [];
  const celdas = {};
  motor.PESTANAS[nombre].forEach(col => {
    let v = fila[col];
    if (json.includes(col)) v = v === null || v === undefined ? (nombre === 'config' ? 'null' : '') : JSON.stringify(v);
    else if (nombre === 'planes' && col === 'creado' && v) v = motor.fechaHora_(new Date(v), "yyyy-MM-dd'T'HH:mm");
    celdas[col] = v === null || v === undefined ? '' : v;
  });
  return motor.aCeldas_(nombre, celdas);
}

// Fila del motor → fila para la base. Las personales llevan el user_id; `creado` lo pone la base.
export function aBase(nombre, celdas, userId) {
  const json = TABLAS[nombre].json || [];
  const fila = TABLAS[nombre].comun ? {} : { user_id: userId };
  Object.keys(celdas).forEach(col => {
    if (col === 'creado') return;
    const v = celdas[col];
    if (v === '' || v === null || v === undefined) fila[col] = null;
    else if (json.includes(col) && typeof v === 'string') fila[col] = leerJson(v);
    else fila[col] = v;
  });
  return fila;
}

function leerJson(texto) {
  try {
    return JSON.parse(texto);
  } catch (err) {
    return texto; // texto suelto en config (p. ej. escrito a mano en la hoja)
  }
}

// ---------- Qué ha cambiado ----------

const comoTexto = fila => JSON.stringify(fila);
const claveDe = (nombre, fila) => JSON.stringify(TABLAS[nombre].clave.map(c => String(fila[c])));

// antes: [{celdas, id}] (lo leído de la base); despues: [celdas] (lo que ha dejado la acción).
// Con clave → {nuevas, cambiadas, borradas} (filas). Sin clave se comparan filas enteras: las que ya no
// están se borran por su id y las nuevas se añaden → {nuevas, borrarIds}.
export function cambiosDeTabla(nombre, antes, despues) {
  if (!TABLAS[nombre].clave) {
    const sinTocar = new Map();
    antes.forEach(a => {
      const k = comoTexto(a.celdas);
      if (!sinTocar.has(k)) sinTocar.set(k, []);
      sinTocar.get(k).push(a.id);
    });
    const nuevas = despues.filter(f => {
      const ids = sinTocar.get(comoTexto(f));
      if (!ids || !ids.length) return true;
      ids.shift(); // esta fila ya estaba
      return false;
    });
    return { nuevas, borrarIds: [].concat(...sinTocar.values()) };
  }
  const previas = new Map(antes.map(a => [claveDe(nombre, a.celdas), a.celdas]));
  const vistas = new Set();
  const nuevas = [];
  const cambiadas = [];
  despues.forEach(f => {
    const k = claveDe(nombre, f);
    if (vistas.has(k)) throw new Error(`Fila repetida en ${nombre}: ${k}.`);
    vistas.add(k);
    if (!previas.has(k)) nuevas.push(f);
    else if (comoTexto(previas.get(k)) !== comoTexto(f)) cambiadas.push(f);
  });
  const borradas = antes.map(a => a.celdas).filter(f => !vistas.has(claveDe(nombre, f)));
  return { nuevas, cambiadas, borradas };
}

// ---------- Guardar ----------

// Valor para un filtro de PostgREST, entre comillas (las fechas y los ids llevan guiones).
const entreComillas = v => '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';

// Filtro de URL que selecciona estas filas por su clave.
function filtroFilas(nombre, filas) {
  const clave = TABLAS[nombre].clave;
  if (clave.length === 1) return `${clave[0]}=in.${encodeURIComponent('(' + filas.map(f => entreComillas(f[clave[0]])).join(',') + ')')}`;
  const una = f => 'and(' + clave.map(c => `${c}.eq.${entreComillas(f[c])}`).join(',') + ')';
  return 'or=' + encodeURIComponent('(' + filas.map(una).join(',') + ')');
}

const deUsuario = (nombre, userId) => (TABLAS[nombre].comun ? '' : `&user_id=eq.${userId}`);

// Borra por lotes: filtro(lote) da el filtro de URL de cada lote.
async function borrarPorLotes(con, sesion, nombre, lista, filtro) {
  for (let i = 0; i < lista.length; i += LOTE_BORRAR) {
    await rest(con, sesion, 'DELETE', `${nombre}?${filtro(lista.slice(i, i + LOTE_BORRAR))}`, undefined, 'return=minimal');
  }
}

// Guarda en la base lo que ha cambiado. antes: {nombre: [{celdas, id}]}; cambiadas: {nombre: [celdas]}
// (solo las tablas que ha tocado la acción, con todas sus filas).
export async function guardarCambios(con, sesion, antes, cambiadas) {
  const userId = sesion.usuario.id;
  const aBaseTodas = (nombre, filas) => filas.map(f => aBase(nombre, f, userId));
  const borradasConClave = [];
  for (const nombre of ORDEN_GUARDAR.filter(n => cambiadas[n])) {
    const c = cambiosDeTabla(nombre, antes[nombre] || [], cambiadas[nombre]);
    const t = TABLAS[nombre];
    if (!t.clave) {
      // Primero se borra (preferencias no admite dos filas iguales) y luego se añade.
      await borrarPorLotes(con, sesion, nombre, c.borrarIds, ids => `id=in.(${ids.join(',')})${deUsuario(nombre, userId)}`);
      if (c.nuevas.length) await rest(con, sesion, 'POST', nombre, aBaseTodas(nombre, c.nuevas), 'return=minimal');
      continue;
    }
    if (t.comun) {
      // Las comunes solo las puede cambiar quien las creó o un administrador (si no, la base no cambia nada).
      if (c.nuevas.length) await rest(con, sesion, 'POST', nombre, aBaseTodas(nombre, c.nuevas), 'return=minimal');
      for (const fila of c.cambiadas) {
        const hechas = await rest(con, sesion, 'PATCH', `${nombre}?${filtroFilas(nombre, [fila])}`, aBase(nombre, fila, userId), 'return=representation');
        if (!hechas || !hechas.length) throw new Error(`No tienes permiso para cambiar ${nombre === 'alimentos' ? 'el alimento' : 'la receta'} ${fila.id}: solo quien lo añadió o un administrador.`);
      }
    } else {
      const guardar = c.nuevas.concat(c.cambiadas);
      if (guardar.length) await rest(con, sesion, 'POST', nombre, aBaseTodas(nombre, guardar), 'resolution=merge-duplicates,return=minimal');
    }
    if (c.borradas.length) borradasConClave.push([nombre, c.borradas]);
  }
  for (const [nombre, filas] of borradasConClave.reverse()) {
    await borrarPorLotes(con, sesion, nombre, filas, lote => filtroFilas(nombre, lote) + deUsuario(nombre, userId));
  }
}

// ---------- Ejecutar una acción ----------

// motor: {PESTANAS, ACCIONES, cargarTablas_, tablasCambiadas_, aCeldas_, manejar_, fechaHora_} (web/motor/).
// peticion: {accion, ...} como las que recibía Apps Script. Devuelve los datos o lanza un Error.
// Si la acción falla no se guarda nada.
export async function ejecutar(con, sesion, motor, peticion) {
  const filas = await leerTablas(con, sesion);
  const antes = {};
  const celdas = {};
  Object.keys(TABLAS).forEach(nombre => {
    antes[nombre] = filas[nombre].map(f => ({ celdas: deBase(nombre, f, motor), id: f.id }));
    celdas[nombre] = antes[nombre].map(a => a.celdas);
  });
  motor.cargarTablas_(celdas);
  const respuesta = motor.manejar_(Object.assign({}, peticion, { token: TOKEN_MOTOR }), TOKEN_MOTOR, motor.ACCIONES);
  const cambiadas = motor.tablasCambiadas_();
  if (!respuesta.ok) throw new Error(respuesta.error);
  await guardarCambios(con, sesion, antes, cambiadas);
  return respuesta.datos;
}
