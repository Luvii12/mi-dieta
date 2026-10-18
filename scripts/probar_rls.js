// Comprueba en el proyecto real de Supabase que las reglas por fila (RLS) de supabase/esquema.sql funcionan:
// sin sesión no se ve nada, cada usuario solo ve y cambia lo suyo, y los dos ven las tablas comunes.
// Usa dos usuarios de prueba (nunca la cuenta de Fran) y deja todo como estaba al acabar.
//
// La conexión se lee de .supabase.local.json, que no se sube al repo:
//   {"url": "https://<proyecto>.supabase.co", "clave": "<clave publishable o anon>",
//    "pruebas": [{"email": "...", "password": "..."}, {"email": "...", "password": "..."}]}
//
// Uso: npm run probar-rls
const fs = require('fs');
const path = require('path');

const ARCHIVO = process.env.SUPABASE || path.join(__dirname, '..', '.supabase.local.json');
const FECHA_PRUEBA = '2000-01-01';
const PLAN_PRUEBA = 'prueba_rls';
const ALIMENTO_PRUEBA = 'prueba_rls_alimento';

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function conexion() {
  if (!fs.existsSync(ARCHIVO)) salir('Falta .supabase.local.json (ver docs/SUPABASE.md).');
  const c = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  if (!c.url || !c.clave || !Array.isArray(c.pruebas) || c.pruebas.length < 2) {
    salir('.supabase.local.json necesita "url", "clave" y dos usuarios en "pruebas".');
  }
  c.url = c.url.replace(/\/+$/, '');
  return c;
}

const c = conexion();

async function entrar(usuario) {
  const r = await fetch(`${c.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: c.clave, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: usuario.email, password: usuario.password }),
  });
  const datos = await r.json();
  if (!r.ok) salir(`No se pudo entrar como ${usuario.email}: ${datos.error_description || datos.msg || r.status}`);
  return { email: usuario.email, id: datos.user.id, token: datos.access_token };
}

// Llamada a la API REST. Devuelve {estado, datos}; sin sesión si `quien` es null.
async function api(quien, metodo, ruta, cuerpo) {
  const cabeceras = { apikey: c.clave, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  if (quien) cabeceras.Authorization = `Bearer ${quien.token}`;
  const r = await fetch(`${c.url}/rest/v1/${ruta}`, {
    method: metodo, headers: cabeceras, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await r.text();
  let datos = null;
  try { datos = texto ? JSON.parse(texto) : null; } catch (e) { datos = texto; }
  return { estado: r.status, datos: datos };
}

let fallos = 0;
function comprobar(descripcion, bien, detalle) {
  console.log(`${bien ? '✔' : '✘'} ${descripcion}${bien || detalle === undefined ? '' : ` → ${JSON.stringify(detalle)}`}`);
  if (!bien) fallos++;
}
const ok = r => r.estado >= 200 && r.estado < 300;
const vacio = r => ok(r) && Array.isArray(r.datos) && r.datos.length === 0;

async function limpiar(quien) {
  await api(quien, 'DELETE', `config?clave=eq.${PLAN_PRUEBA}`);
  await api(quien, 'DELETE', `pesos?fecha=eq.${FECHA_PRUEBA}`);
  await api(quien, 'DELETE', `planes?plan_id=eq.${PLAN_PRUEBA}`);
  await api(quien, 'DELETE', `alimentos?id=eq.${ALIMENTO_PRUEBA}`);
}

async function main() {
  const [a, b] = [await entrar(c.pruebas[0]), await entrar(c.pruebas[1])];
  if (a.id === b.id) salir('Los dos usuarios de prueba son el mismo.');
  await limpiar(a);
  await limpiar(b);

  console.log('— Sin sesión');
  for (const tabla of ['alimentos', 'recetas', 'config', 'pesos', 'planes']) {
    const r = await api(null, 'GET', `${tabla}?select=*&limit=1`);
    comprobar(`no se puede leer ${tabla}`, !ok(r) || vacio(r), r);
  }
  const anonimo = await api(null, 'POST', 'pesos', { user_id: a.id, fecha: FECHA_PRUEBA, peso_kg: 70 });
  comprobar('no se puede escribir', !ok(anonimo), anonimo);

  console.log('— Datos personales');
  for (const [quien, kg] of [[a, 70], [b, 80]]) {
    const r1 = await api(quien, 'POST', 'config', { clave: PLAN_PRUEBA, valor: { de: quien.email } });
    const r2 = await api(quien, 'POST', 'pesos', { fecha: FECHA_PRUEBA, peso_kg: kg });
    const r3 = await api(quien, 'POST', 'planes', { plan_id: PLAN_PRUEBA, inicio: FECHA_PRUEBA, fin: FECHA_PRUEBA, estado: 'borrador' });
    const r4 = await api(quien, 'POST', 'plan_comidas', { plan_id: PLAN_PRUEBA, fecha: FECHA_PRUEBA, comida: 'Cena', receta_id: 'X', gramos: {} });
    comprobar(`${quien.email} guarda config, peso, plan y comida`, [r1, r2, r3, r4].every(ok), [r1, r2, r3, r4].find(r => !ok(r)));
  }
  for (const [quien, otro] of [[a, b], [b, a]]) {
    for (const tabla of ['config', 'pesos', 'planes', 'plan_comidas']) {
      const r = await api(quien, 'GET', `${tabla}?select=user_id`);
      comprobar(`${quien.email} solo ve sus filas de ${tabla}`,
        ok(r) && r.datos.length > 0 && r.datos.every(f => f.user_id === quien.id), r);
    }
    const ajeno = await api(quien, 'POST', 'pesos', { user_id: otro.id, fecha: '2000-01-02', peso_kg: 50 });
    comprobar(`${quien.email} no puede escribir a nombre del otro`, !ok(ajeno), ajeno);
    const cambio = await api(quien, 'PATCH', `pesos?user_id=eq.${otro.id}&fecha=eq.${FECHA_PRUEBA}`, { peso_kg: 99 });
    comprobar(`${quien.email} no puede cambiar el peso del otro`, vacio(cambio), cambio);
    const borrado = await api(quien, 'DELETE', `planes?user_id=eq.${otro.id}`);
    comprobar(`${quien.email} no puede borrar planes del otro`, vacio(borrado), borrado);
  }
  const pesoB = await api(b, 'GET', `pesos?fecha=eq.${FECHA_PRUEBA}&select=peso_kg`);
  comprobar('el peso del segundo usuario sigue intacto', ok(pesoB) && pesoB.datos[0] && Number(pesoB.datos[0].peso_kg) === 80, pesoB);

  console.log('— Tablas comunes');
  const nuevo = await api(a, 'POST', 'alimentos', {
    id: ALIMENTO_PRUEBA, nombre: 'Prueba RLS', grupo: 'proteina', kcal_100: 100, proteina_100: 20,
    carbohidratos_100: 0, grasa_100: 2, estado: 'crudo', fuente: 'prueba',
  });
  comprobar(`${a.email} añade un alimento`, ok(nuevo), nuevo);
  const visto = await api(b, 'GET', `alimentos?id=eq.${ALIMENTO_PRUEBA}&select=id`);
  comprobar(`${b.email} lo ve`, ok(visto) && visto.datos.length === 1, visto);
  const cambiado = await api(b, 'PATCH', `alimentos?id=eq.${ALIMENTO_PRUEBA}`, { kcal_100: 999 });
  comprobar(`${b.email} no puede cambiarlo (no es suyo ni es administrador)`, vacio(cambiado), cambiado);
  const recetas = await api(b, 'GET', 'recetas?select=id&limit=1');
  comprobar('las recetas se pueden leer con sesión', ok(recetas), recetas);

  console.log('— Administradores');
  const admin = await api(a, 'POST', 'rpc/es_admin', {});
  comprobar(`${a.email} no es administrador`, ok(admin) && admin.datos === false, admin);
  const hacerse = await api(a, 'POST', 'administradores', { user_id: a.id });
  comprobar('nadie puede hacerse administrador desde la app', !ok(hacerse), hacerse);

  await limpiar(a);
  await limpiar(b);
  const resto = await api(a, 'GET', `alimentos?id=eq.${ALIMENTO_PRUEBA}&select=id`);
  comprobar('datos de prueba borrados', vacio(resto), resto);

  console.log(fallos ? `\n${fallos} comprobaciones fallidas.` : '\nTodo correcto: cada usuario solo ve lo suyo.');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => salir(e.stack || String(e)));
