// Copia de seguridad de Supabase en el PC (el plan gratis no hace copias). Entra como cada cuenta con la clave
// secreta de .supabase.local.json (como `recetas_ia.js --para`, sin sus contraseñas ni permisos nuevos en la base)
// y guarda sus tablas tal como están en la base. Las comunes (alimentos, recetas) se guardan una vez.
// Lleva datos personales: se guarda fuera del repo.
//
// Uso: npm run copia                → ~/Escritorio/claude/copias-mi-dieta/AAAA-MM-DD/
//      npm run copia -- <carpeta>   → en esa carpeta
//
// Resultado: cuentas.json (id, email, alta), comunes/<tabla>.json y <email>/<tabla>.json.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { leerArchivo, salir } = require('./cuenta_supabase.js');

const PAGINA = 1000; // Supabase devuelve como mucho 1.000 filas por petición
const COMUNES = ['alimentos', 'recetas'];
const PERSONALES = ['perfiles', 'config', 'valoraciones', 'preferencias', 'planes', 'plan_comidas', 'pesos', 'ajustes_historial'];

async function pedirJson(url, cabeceras) {
  const r = await fetch(url, { headers: cabeceras });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 200)}`);
  return JSON.parse(texto);
}

async function cuentas(c) {
  const lista = [];
  for (let pagina = 1; ; pagina++) {
    const d = await pedirJson(`${c.url}/auth/v1/admin/users?page=${pagina}&per_page=100`,
      { apikey: c.clave_secreta, Authorization: 'Bearer ' + c.clave_secreta });
    lista.push(...d.users.map(u => ({ id: u.id, email: u.email, alta: u.created_at })));
    if (d.users.length < 100) return lista;
  }
}

async function leerTabla(c, token, tabla) {
  const filas = [];
  for (let desde = 0; ; desde += PAGINA) {
    const pagina = await pedirJson(`${c.url}/rest/v1/${tabla}?select=*&offset=${desde}&limit=${PAGINA}`,
      { apikey: c.clave, Authorization: 'Bearer ' + token });
    filas.push(...pagina);
    if (pagina.length < PAGINA) return filas;
  }
}

function guardar(carpeta, nombre, datos) {
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, nombre + '.json'), JSON.stringify(datos, null, 1));
}

async function main() {
  const c = leerArchivo();
  if (!c.clave_secreta) salir('.supabase.local.json necesita "clave_secreta" (ver docs/SUPABASE.md §9).');
  c.url = c.url.replace(/\/+$/, '');
  const hoy = new Date().toISOString().slice(0, 10);
  const destino = path.resolve(process.argv[2] || path.join(os.homedir(), 'Escritorio', 'claude', 'copias-mi-dieta', hoy));
  const sb = await import('../web/supabase.js');
  const con = { url: c.url, clave: c.clave, fetch };

  const todas = await cuentas(c).catch(err => salir('No se pueden leer las cuentas: ' + err.message));
  guardar(destino, 'cuentas', todas);
  let comunesHechas = false;
  for (const cuenta of todas) {
    const sesion = await sb.entrarComo(con, c.clave_secreta, cuenta.email)
      .catch(err => salir(`No se puede entrar como ${cuenta.email}: ${err.message}`));
    const resumen = [];
    for (const tabla of PERSONALES) {
      const filas = await leerTabla(c, sesion.access_token, tabla);
      guardar(path.join(destino, cuenta.email), tabla, filas);
      resumen.push(`${tabla} ${filas.length}`);
    }
    console.log(`${cuenta.email}: ${resumen.join(' · ')}`);
    if (!comunesHechas) {
      for (const tabla of COMUNES) {
        const filas = await leerTabla(c, sesion.access_token, tabla);
        guardar(path.join(destino, 'comunes'), tabla, filas);
        console.log(`comunes: ${tabla} ${filas.length}`);
      }
      comunesHechas = true;
    }
  }
  console.log(`\nCopia guardada en ${destino}`);
}

if (require.main === module) main();
