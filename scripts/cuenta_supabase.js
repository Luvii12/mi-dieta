// Conexión con el Supabase de verdad para los scripts, con la cuenta real de Fran: "cuenta" en
// .supabase.local.json ({"url", "clave", "cuenta": {"email", "password"}, "pruebas": [...]}).
// Las acciones se ejecutan con el motor de web/motor/ y web/supabase.js, igual que en el móvil.
const fs = require('fs');
const path = require('path');
const { cargarMotor } = require('../tests/motor_navegador.js');

const ARCHIVO = process.env.SUPABASE || path.join(__dirname, '..', '.supabase.local.json');

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function leerArchivo() {
  if (!fs.existsSync(ARCHIVO)) salir('Falta .supabase.local.json (ver docs/SUPABASE.md).');
  const c = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  if (!c.url || !c.clave) salir('.supabase.local.json necesita "url" y "clave".');
  return c;
}

// Entra con la cuenta real. Devuelve {sb, con, sesion, motor, ejecutar(accion, extra)}.
async function conectar() {
  const c = leerArchivo();
  if (!c.cuenta || !c.cuenta.email || !c.cuenta.password) salir('.supabase.local.json necesita "cuenta": {"email", "password"} (tu cuenta de verdad).');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch };
  let sesion;
  try {
    sesion = await sb.entrar(con, c.cuenta.email, c.cuenta.password);
  } catch (err) {
    salir(`No se puede entrar con ${c.cuenta.email}: ${err.message}`);
  }
  const { motor } = cargarMotor(new Date().toISOString(), {});
  const ejecutar = (accion, extra = {}) => sb.ejecutar(con, sesion, motor, Object.assign({}, extra, { accion }));
  return { sb, con, sesion, motor, ejecutar };
}

module.exports = { ARCHIVO, leerArchivo, conectar, salir };
