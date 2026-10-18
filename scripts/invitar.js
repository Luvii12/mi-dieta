// Fase M6: da de alta a una persona nueva con una contraseña temporal (el registro libre está cerrado), o le
// pone otra temporal si ha olvidado la suya. Entra en la app con ella y la cambia en Ajustes › Cuenta ›
// Cambiar contraseña. Usa la clave secreta de .supabase.local.json (docs/SUPABASE.md §9).
// La contraseña solo sale en esta terminal: mándasela a la persona por un canal privado.
//
// Uso: npm run invitar -- <email>                → cuenta nueva
//      npm run invitar -- <email> --nueva-clave  → otra contraseña temporal para una cuenta que ya existe
const crypto = require('crypto');
const { leerArchivo, salir } = require('./cuenta_supabase.js');

const URL_APP = 'https://luvii12.github.io/mi-dieta/';
const URL_GUIA = 'https://github.com/Luvii12/mi-dieta/blob/main/docs/INSTALAR.md';
// Sin letras ni números que se confundan al copiarlos a mano (l, 1, I, o, 0, O).
const LETRAS = 'abcdefghjkmnpqrstuvwxyz23456789';

// Tres grupos de 4, p. ej. «k7mp-3xqa-tz9e».
function claveTemporal() {
  const grupo = () => Array.from({ length: 4 }, () => LETRAS[crypto.randomInt(LETRAS.length)]).join('');
  return [grupo(), grupo(), grupo()].join('-');
}

// c: el contenido de .supabase.local.json. Devuelve {email, password, nueva} o lanza un Error.
async function invitar(c, email, { nuevaClave = false, fetch: fetchUsado = fetch } = {}) {
  if (!c.clave_secreta) throw new Error('.supabase.local.json necesita "clave_secreta" (ver docs/SUPABASE.md §9).');
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Escribe un email válido: npm run invitar -- email@ejemplo.com');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch: fetchUsado };
  const password = claveTemporal();
  if (nuevaClave) await sb.cambiarClaveDe(con, c.clave_secreta, email, password);
  else await sb.crearCuenta(con, c.clave_secreta, email, password);
  return { email, password, nueva: !nuevaClave };
}

async function main() {
  const args = process.argv.slice(2);
  const nuevaClave = args.includes('--nueva-clave');
  const email = args.find(a => !a.startsWith('--'));
  const r = await invitar(leerArchivo(), email, { nuevaClave }).catch(err => salir(err.message));
  console.log(r.nueva ? `Cuenta creada para ${r.email}.` : `Contraseña temporal nueva para ${r.email}.`);
  console.log('\nMensaje para enviarle (por un canal privado):\n');
  console.log(`Ya tienes cuenta en Mi Dieta: ${URL_APP}`);
  console.log(`Email: ${r.email}`);
  console.log(`Contraseña temporal: ${r.password}`);
  console.log('Al entrar, cámbiala en Ajustes › Cuenta › Cambiar contraseña.');
  if (r.nueva) console.log(`Cómo instalarla en el móvil: ${URL_GUIA}`);
}

if (require.main === module) main();

module.exports = { invitar, claveTemporal };
