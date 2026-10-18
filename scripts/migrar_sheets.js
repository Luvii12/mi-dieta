// Fase M3: pasa los datos de la hoja de Google (a través del Apps Script, acción `exportar`) a la cuenta real
// de Fran en Supabase, y comprueba que la app da lo mismo con los dos.
//   · Comunes (alimentos, recetas): añade lo que falta y actualiza lo que ha cambiado en la hoja (nombres,
//     propuestas de la IA…). No borra nada.
//   · Personales (config, planes, comidas, pesos, valoraciones, excluidos, historial): quedan igual que en
//     la hoja. Si la cuenta ya tenía datos que no están en la hoja, no sigue sin --sustituir.
//   · Al acabar compara tabla a tabla y ejecuta las acciones de lectura (hoy, plan, progreso…) en la hoja y
//     en Supabase: las respuestas tienen que ser iguales. Solo comprobar, sin migrar: --comprobar.
// La hoja no cambia (solo se lee). Conexiones: .conexion.local.json (Apps Script) y "cuenta" en
// .supabase.local.json.
//
// Uso: npm run migrar -- [--probar | --comprobar] [--sustituir]
//   --probar     enseña qué se cambiaría en Supabase, sin escribir nada
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { conectar, salir } = require('./cuenta_supabase.js');

const ARCHIVO_HOJA = process.env.CONEXION || path.join(__dirname, '..', '.conexion.local.json');
const COMUNES = ['alimentos', 'recetas'];
const PERSONALES = ['config', 'planes', 'plan_comidas', 'pesos', 'valoraciones', 'preferencias', 'ajustes_historial'];
const ACCIONES_LECTURA = ['hoy', 'plan', 'progreso', 'recetas', 'propuestas', 'alimentos', 'config'];

// Las cabeceras Sec-Fetch-* las pone el navegador; sin ellas Google a veces no entrega la respuesta.
const CABECERAS = { 'Content-Type': 'text/plain;charset=utf-8', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'empty' };

// Acción en el Apps Script de la hoja. Devuelve {ok, datos|error}; repite si Google no da el resultado.
async function llamarHoja(accion) {
  if (!fs.existsSync(ARCHIVO_HOJA)) salir('Falta .conexion.local.json con {"url": "<URL /exec>", "token": "<APP_TOKEN>"}.');
  const { url, token } = JSON.parse(fs.readFileSync(ARCHIVO_HOJA, 'utf8'));
  for (let intento = 1; intento <= 3; intento++) {
    const respuesta = await fetch(url, { method: 'POST', headers: CABECERAS, body: JSON.stringify({ accion, token }) });
    try {
      return JSON.parse(await respuesta.text());
    } catch (err) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  salir(`Google no ha devuelto el resultado de «${accion}» tras 3 intentos.`);
}

// Para comparar: los textos JSON como objetos, las claves ordenadas y las filas ordenadas.
const canonico = v => {
  if (typeof v === 'string' && /^[[{]/.test(v)) return canonico(JSON.parse(v));
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])]));
  return v;
};
const comparables = filas => filas.map(canonico).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const copia = v => JSON.parse(JSON.stringify(v));

// 'AAAA-MM-DDTHH:mm' en hora de Madrid (como escribe el motor `creado`) → instante ISO para la base.
function madridAIso(texto, motor) {
  const comoUtc = Date.parse(texto + ':00Z');
  const desfase = Date.parse(motor.fechaHora_(new Date(comoUtc), "yyyy-MM-dd'T'HH:mm:ss") + 'Z') - comoUtc;
  return new Date(comoUtc - desfase).toISOString();
}

async function main() {
  const probar = process.argv.includes('--probar');
  const soloComprobar = process.argv.includes('--comprobar');
  const sustituir = process.argv.includes('--sustituir');

  const exportado = await llamarHoja('exportar');
  if (!exportado.ok) salir('La hoja no se ha podido leer: ' + exportado.error);
  const { sb, con, sesion, motor, ejecutar } = await conectar();
  console.log(`Cuenta de Supabase: ${sesion.usuario.email}`);
  const hoja = {};
  Object.keys(sb.TABLAS).forEach(n => { hoja[n] = copia((exportado.datos[n] || []).map(f => motor.aCeldas_(n, f))); });
  console.log('En la hoja: ' + Object.keys(sb.TABLAS).map(n => `${n} ${hoja[n].length}`).join(' · '));

  const leerBase = async () => {
    const filas = await sb.leerTablas(con, sesion);
    const antes = {};
    Object.keys(sb.TABLAS).forEach(n => { antes[n] = filas[n].map(f => ({ celdas: copia(sb.deBase(n, f, motor)), id: f.id, creado_por: f.creado_por })); });
    return antes;
  };

  if (!soloComprobar) {
    const antes = await leerBase();
    const despues = {};
    COMUNES.forEach(n => {
      const deHoja = new Map(hoja[n].map(f => [f.id, f]));
      const enBase = new Set(antes[n].map(a => a.celdas.id));
      // Iguales salvo el orden de las claves dentro de los JSON (Postgres las reordena): no se tocan.
      const igual = (a, b) => JSON.stringify(canonico(a)) === JSON.stringify(canonico(b));
      despues[n] = antes[n].map(a => {
        const f = deHoja.get(a.celdas.id);
        return f && !igual(f, a.celdas) ? f : a.celdas;
      }).concat(hoja[n].filter(f => !enBase.has(f.id)));
    });
    PERSONALES.forEach(n => { despues[n] = hoja[n]; });

    let sobran = 0;
    console.log(`\nCambios en Supabase${probar ? ' (solo se enseñan)' : ''}:`);
    Object.keys(sb.TABLAS).forEach(n => {
      const c = sb.cambiosDeTabla(n, antes[n], despues[n]);
      const borrar = (c.borradas || c.borrarIds).length;
      if (!COMUNES.includes(n)) sobran += borrar;
      const ajenas = !COMUNES.includes(n) ? [] : c.cambiadas.filter(f => antes[n].find(a => a.celdas.id === f.id).creado_por !== sesion.usuario.id);
      console.log(`  ${n}: ${c.nuevas.length} nuevas · ${(c.cambiadas || []).length} cambiadas · ${borrar} borradas` +
        (ajenas.length ? `  ⚠ ${ajenas.length} añadidas por otro usuario: solo las puede cambiar un administrador` : ''));
      (c.cambiadas || []).forEach(f => console.log(`      ~ ${f.id}${f.nombre ? ' (' + f.nombre + ')' : ''}`));
    });
    if (sobran && !sustituir) salir(`\nLa cuenta ya tiene ${sobran} filas personales que no están en la hoja. Repite con --sustituir para borrarlas.`);
    if (probar) return;

    await sb.guardarCambios(con, sesion, antes, despues);
    // `creado` de los planes lo pone la base al añadirlos: se deja el de la hoja.
    for (const p of hoja.planes.filter(x => x.creado)) {
      await fetch(`${con.url}/rest/v1/planes?user_id=eq.${sesion.usuario.id}&plan_id=eq.${encodeURIComponent(p.plan_id)}`, {
        method: 'PATCH',
        headers: { apikey: con.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ creado: madridAIso(p.creado, motor) }),
      }).then(r => { if (!r.ok) salir(`No se pudo poner la fecha de creación del plan ${p.plan_id}: ${r.status}`); });
    }
    console.log('Datos guardados en Supabase.');
  }

  let fallos = 0;
  const comprobar = (texto, fn) => {
    try {
      fn();
      console.log(`✔ ${texto}`);
    } catch (err) {
      fallos++;
      console.log(`✘ ${texto}\n${err.message.split('\n').slice(0, 30).join('\n')}`);
    }
  };

  console.log('\nTablas:');
  const base = await leerBase();
  const celdas = n => base[n].map(a => a.celdas);
  // En config la hoja puede tener números (0) donde la base tiene su texto JSON ('0'): para la app es igual.
  const sinTipo = (n, filas) => (n === 'config' ? filas.map(f => Object.assign({}, f, { valor: String(f.valor) })) : filas);
  PERSONALES.forEach(n => comprobar(`${n}: ${base[n].length} filas, iguales que en la hoja`,
    () => assert.deepEqual(comparables(sinTipo(n, celdas(n))), comparables(sinTipo(n, hoja[n])))));
  COMUNES.forEach(n => comprobar(`${n}: las ${hoja[n].length} de la hoja están igual (${base[n].length} en Supabase)`, () => {
    const porId = new Map(celdas(n).map(f => [f.id, f]));
    assert.deepEqual(comparables(hoja[n].map(f => porId.get(f.id) || { falta: f.id })), comparables(hoja[n]));
  }));

  console.log('\nLo que enseña la app (hoja frente a Supabase):');
  for (const accion of ACCIONES_LECTURA) {
    const esperado = await llamarHoja(accion);
    let obtenido;
    try {
      obtenido = { ok: true, datos: copia(await ejecutar(accion)) };
    } catch (err) {
      obtenido = { ok: false, error: err.message };
    }
    // Las listas (recetas, alimentos…) pueden venir en otro orden: la base ordena por fecha de alta y las
    // recetas semilla se añadieron a la vez. La app las agrupa por comida, así que se ven igual.
    const lista = r => (r.ok && Array.isArray(r.datos) ? Object.assign({}, r, { datos: comparables(r.datos) }) : canonico(r));
    comprobar(accion, () => assert.deepEqual(lista(obtenido), lista(esperado)));
  }

  console.log(fallos ? `\n${fallos} comprobaciones fallidas.` : '\nTodo correcto: Supabase tiene lo mismo que la hoja.');
  process.exit(fallos ? 1 : 0);
}

main().catch(e => salir(e.stack || String(e)));
