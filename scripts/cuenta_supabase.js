// Conexión con el Supabase de verdad para los scripts, con la cuenta real de Fran: "cuenta" en
// .supabase.local.json ({"url", "clave", "cuenta": {"email", "password"}, "clave_secreta"}).
// Con `para` (el email de otra persona) se entra como ella sin su contraseña, con la clave secreta del proyecto
// (service_role; solo en este archivo, que no se sube al repo): ve sus datos y lo que guarda es suyo.
// Las acciones se ejecutan con el motor de web/motor/ y web/supabase.js, igual que en el móvil.
const crypto = require('crypto');
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

// Cuentas temporales para probar contra el Supabase de verdad (probar-rls, probar-supabase), para no tocar
// nunca las de las personas: se crean con la clave secreta (sin código de invitación) y `borrar()` las quita
// con todos sus datos personales. Devuelve {sb, con, sesiones, borrar}.
async function cuentasTemporales(c, cuantas) {
  if (!c.clave_secreta) salir('Las pruebas necesitan "clave_secreta" en .supabase.local.json (ver docs/SUPABASE.md §9).');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch };
  const emails = [];
  const borrar = async () => {
    for (const email of emails) {
      await sb.borrarCuenta(con, c.clave_secreta, email).catch(err => console.error(`No se pudo borrar ${email}: ${err.message}`));
    }
  };
  const sesiones = [];
  try {
    for (let i = 0; i < cuantas; i++) {
      const email = `prueba-${crypto.randomBytes(4).toString('hex')}@mi-dieta.test`;
      const password = crypto.randomBytes(18).toString('base64url');
      await sb.crearCuenta(con, c.clave_secreta, email, password);
      emails.push(email);
      sesiones.push(await sb.entrar(con, email, password));
    }
  } catch (err) {
    await borrar();
    salir('No se pudieron crear las cuentas de prueba: ' + err.message);
  }
  return { sb, con, sesiones, borrar };
}

module.exports = { ARCHIVO, leerArchivo, conectar, conectarCon, cuentasTemporales, salir };
