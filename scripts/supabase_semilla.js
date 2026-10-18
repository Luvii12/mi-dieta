// Carga en el Supabase de verdad la biblioteca común de partida (alimentos y recetas semilla de data/) y la
// configuración inicial (objetivos de «Ajustes Fran. Déficit», tolerancias…) de un usuario. No cambia nada
// que ya exista: solo añade lo que falta.
//   · La biblioteca se añade con el primer usuario de .supabase.local.json (queda como quien la creó).
//   · La configuración, con el usuario de pruebas que se indique (por defecto el segundo).
// Conexión en .supabase.local.json (ver docs/SUPABASE.md).
//
// Uso: npm run supabase-semilla [-- <nº de usuario de pruebas para la configuración: 1 o 2>]
const fs = require('fs');
const path = require('path');
const { cargarAppsScript } = require('../tests/simulador_gas.js');

const ARCHIVO = process.env.SUPABASE || path.join(__dirname, '..', '.supabase.local.json');

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

async function main() {
  if (!fs.existsSync(ARCHIVO)) salir('Falta .supabase.local.json (ver docs/SUPABASE.md).');
  const c = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const n = Number(process.argv[2] || 2);
  if (!c.pruebas || !c.pruebas[0] || !c.pruebas[n - 1]) salir('.supabase.local.json no tiene esos usuarios en "pruebas".');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch };

  // Las mismas filas que configurarHoja() pone en una hoja nueva.
  const gas = cargarAppsScript();
  gas.contexto.configurarHoja();
  const filas = nombre => gas.contexto.leerTabla_(nombre);

  async function anadir(sesion, nombre, lista) {
    const r = await con.fetch(`${con.url}/rest/v1/${nombre}`, {
      method: 'POST',
      headers: { apikey: con.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify(lista.map(f => sb.aBase(nombre, f, sesion.usuario.id))),
    });
    const datos = await r.json();
    if (!r.ok) salir(`No se pudo añadir ${nombre}: ${datos.message || r.status}`);
    console.log(`${nombre}: ${datos.length} añadidas (${lista.length - datos.length} ya estaban).`);
  }

  const creador = await sb.entrar(con, c.pruebas[0].email, c.pruebas[0].password);
  console.log(`Biblioteca como ${creador.usuario.email}:`);
  await anadir(creador, 'alimentos', filas('alimentos'));
  await anadir(creador, 'recetas', filas('recetas'));

  const usuario = n === 1 ? creador : await sb.entrar(con, c.pruebas[n - 1].email, c.pruebas[n - 1].password);
  console.log(`Configuración de ${usuario.usuario.email}:`);
  await anadir(usuario, 'config', filas('config'));
}

main().catch(e => salir(e.stack || String(e)));
