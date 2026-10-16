// Comunicación con Apps Script y datos guardados en el móvil.

const CLAVE_CONEXION = 'dieta.conexion';

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

export function leerConexion() {
  return leerLocal(CLAVE_CONEXION) || { url: '', token: '' };
}

export function guardarConexion(url, token) {
  guardarLocal(CLAVE_CONEXION, { url: url.trim(), token: token.trim() });
}

// Llama a una acción del web app. Devuelve `datos` o lanza un Error con un mensaje en español.
// Se envía como text/plain para que el navegador no haga la comprobación CORS previa,
// que Apps Script no admite.
export async function llamar(accion, extra = {}) {
  const { url, token } = leerConexion();
  if (!url || !token) throw new Error('Falta configurar la URL y el token en Ajustes.');

  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...extra, accion, token }),
    });
  } catch (err) {
    throw new Error('No se puede conectar. Revisa la conexión a internet y la URL.');
  }

  let cuerpo;
  try {
    cuerpo = await respuesta.json();
  } catch (err) {
    throw new Error('La URL no responde como la API de la dieta. ¿Es la URL /exec del despliegue?');
  }
  if (!cuerpo.ok) throw new Error(cuerpo.error || 'Error desconocido del servidor.');
  return cuerpo.datos;
}
