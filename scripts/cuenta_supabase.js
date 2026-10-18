// Conexión con el Supabase de verdad para los scripts, con la cuenta real de Fran: "cuenta" en
// .supabase.local.json ({"url", "clave", "cuenta": {"email", "password"}, "clave_secreta", "pruebas": [...]}).
// Con `para` (el email de otra persona) se entra como ella sin su contraseña, con la clave secreta del proyecto
// (service_role; solo en este archivo, que no se sube al repo): ve sus datos y lo que guarda es suyo.
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

// Entra con la cuenta real o, con `para`, como esa persona. Devuelve {sb, con, sesion, motor, ejecutar(accion, extra)}.
async function conectar({ para } = {}) {
  return conectarCon(leerArchivo(), { para, fetch });
}

// Lo mismo con la configuración y el fetch que se le pasen (los tests usan una Supabase falsa).
async function conectarCon(c, { para, fetch: fetchUsado }) {
  if (!c.cuenta || !c.cuenta.email || !c.cuenta.password) salir('.supabase.local.json necesita "cuenta": {"email", "password"} (tu cuenta de verdad).');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch: fetchUsado };
  const otra = para && para.trim().toLowerCase() !== c.cuenta.email.toLowerCase();
  if (otra && !c.clave_secreta) salir('Para entrar como otra persona, .supabase.local.json necesita "clave_secreta" (ver docs/SUPABASE.md).');
  let sesion;
  try {
    sesion = otra ? await sb.entrarComo(con, c.clave_secreta, para) : await sb.entrar(con, c.cuenta.email, c.cuenta.password);
  } catch (err) {
    salir(`No se puede entrar como ${otra ? para : c.cuenta.email}: ${err.message}`);
  }
  const { motor } = cargarMotor(new Date().toISOString(), {});
  const ejecutar = (accion, extra = {}) => sb.ejecutar(con, sesion, motor, Object.assign({}, extra, { accion }));
  return { sb, con, sesion, motor, ejecutar };
}

module.exports = { ARCHIVO, leerArchivo, conectar, conectarCon, salir };
