// Prueba la capa de datos (web/supabase.js) contra el Supabase de verdad con un usuario de pruebas: genera y
// activa un plan, sigue su primer día (marcar, cambiar plato, valorar, peso, excluidos…) y comprueba que cada
// respuesta y las filas que quedan en la base son las mismas que da el motor solo, en memoria.
// Necesita la biblioteca y la configuración del usuario (npm run supabase-semilla). Al empezar y al acabar
// borra los datos personales del usuario de pruebas menos su configuración (con --dejar, al acabar no).
// Conexión en .supabase.local.json (ver docs/SUPABASE.md).
//
// Uso: npm run probar-supabase [-- <nº de usuario de pruebas: 1 o 2, por defecto 2>] [--dejar]
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { cargarMotor } = require('../tests/motor_navegador.js');

const ARCHIVO = process.env.SUPABASE || path.join(__dirname, '..', '.supabase.local.json');
const ORDEN = ['alimentos', 'recetas', 'config', 'planes', 'plan_comidas', 'pesos', 'valoraciones', 'preferencias', 'ajustes_historial'];
const PERSONALES_SIN_CONFIG = ['ajustes_historial', 'preferencias', 'valoraciones', 'pesos', 'plan_comidas', 'planes'];

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

// Para comparar: los textos JSON como objetos con las claves ordenadas y las filas ordenadas. Sin `creado`
// de los planes: la base pone la hora de verdad y aquí el motor va con la fecha simulada del primer día.
const canonico = v => {
  if (typeof v === 'string' && /^[[{]/.test(v)) return canonico(JSON.parse(v));
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).filter(k => k !== 'creado').sort().map(k => [k, canonico(v[k])]));
  return v;
};
const comparables = filas => filas.map(canonico).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

async function main() {
  if (!fs.existsSync(ARCHIVO)) salir('Falta .supabase.local.json (ver docs/SUPABASE.md).');
  const c = JSON.parse(fs.readFileSync(ARCHIVO, 'utf8'));
  const n = Number(process.argv.slice(2).find(a => /^\d$/.test(a)) || 2);
  const dejar = process.argv.includes('--dejar');
  const prueba = (c.pruebas || [])[n - 1];
  if (!prueba) salir('.supabase.local.json no tiene ese usuario en "pruebas".');
  if (c.cuenta && c.cuenta.email === prueba.email) salir(`${prueba.email} es tu cuenta de verdad: esta prueba borra sus datos. Usa el otro usuario de pruebas.`);
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch };
  const sesion = await sb.entrar(con, prueba.email, prueba.password);
  console.log(`Usuario de pruebas: ${sesion.usuario.email}`);

  const borrarPersonales = async () => {
    for (const nombre of PERSONALES_SIN_CONFIG) {
      const r = await fetch(`${con.url}/rest/v1/${nombre}?user_id=eq.${sesion.usuario.id}`, {
        method: 'DELETE', headers: { apikey: con.clave, Authorization: 'Bearer ' + sesion.access_token } });
      if (!r.ok) salir(`No se pudo vaciar ${nombre}: ${r.status} ${await r.text()}`);
    }
  };
  await borrarPersonales();

  let fallos = 0;
  let referencia = null;
  let navegador = null;
  const paso = async (accion, extra = {}, comprobar) => {
    const esperado = referencia.llamar(accion, extra);
    const t0 = Date.now();
    let obtenido;
    try {
      obtenido = JSON.parse(JSON.stringify({ ok: true, datos: await sb.ejecutar(con, sesion, navegador.motor, { ...extra, accion }) }));
    } catch (err) {
      obtenido = { ok: false, error: err.message };
    }
    const ms = Date.now() - t0;
    try {
      assert.deepEqual(canonico(obtenido), canonico(esperado));
      if (comprobar) comprobar(obtenido);
      console.log(`✔ ${accion} (${ms} ms)${obtenido.ok ? '' : ` → error esperado: ${obtenido.error}`}`);
    } catch (err) {
      fallos++;
      console.log(`✘ ${accion} (${ms} ms)\n${err.message.split('\n').slice(0, 30).join('\n')}`);
    }
    return obtenido;
  };
  const celdasDeBase = async motor => {
    const filas = await sb.leerTablas(con, sesion);
    return Object.fromEntries(ORDEN.map(nombre => [nombre, filas[nombre].map(f => sb.deBase(nombre, f, motor))]));
  };

  // Hoy: generar el plan (empieza el lunes) y activarlo.
  const ahora = new Date().toISOString();
  navegador = cargarMotor(ahora, {});
  const inicial = await celdasDeBase(navegador.motor);
  if (!inicial.config.length) salir('El usuario no tiene configuración: ejecuta antes npm run supabase-semilla.');
  if (!inicial.recetas.length) salir('No hay recetas en la base: ejecuta antes npm run supabase-semilla.');
  referencia = cargarMotor(ahora, inicial);
  const generado = await paso('generarPlan', {}, r => assert.equal(r.datos.dias.length, 14));
  if (!generado.ok) salir('No se pudo generar el plan: ' + generado.error);
  await paso('activarPlan', { plan_id: generado.datos.plan_id });

  // El primer día del plan, a mediodía.
  const dia1 = generado.datos.inicio + 'T12:00:00Z';
  navegador = cargarMotor(dia1, {});
  referencia = cargarMotor(dia1, Object.fromEntries(ORDEN.map(t => [t, referencia.contexto.leerTabla_(t)])));
  const hoy = await paso('hoy', {}, r => assert.equal(r.datos.comidas.length, 4));
  const dia = { plan_id: hoy.datos.plan_id, fecha: hoy.datos.fecha };
  await paso('marcarComida', { ...dia, comida: 'Desayuno', hecha: 'si' });
  await paso('marcarComida', { ...dia, comida: 'Almuerzo', hecha: 'libre' });
  const alternativas = await paso('alternativas', { ...dia, comida: 'Cena' });
  if (alternativas.ok && alternativas.datos.length) await paso('cambiarPlato', { ...dia, comida: 'Cena', receta_id: alternativas.datos[0].receta_id });
  await paso('valorar', { receta_id: hoy.datos.comidas[0].receta_id, valor: 'me_encanta' });
  await paso('valorar', { receta_id: hoy.datos.comidas[0].receta_id, valor: 'normal' });
  await paso('registrarPeso', { peso_kg: '82,4' });
  await paso('registrarPeso', { peso_kg: 82.1 }); // sustituye al de hoy
  await paso('config', { cambios: { peso_objetivo: 78 } });
  await paso('config', { cambios: { peso_objetivo: null } });
  await paso('guardarExcluidos', { alimentos: ['salmon', 'atun_natural'] });
  await paso('guardarExcluidos', { alimentos: ['salmon'] });
  await paso('progreso');
  await paso('recetas');
  await paso('alimentos');
  await paso('generarPlan'); // borrador del siguiente
  await paso('generarPlan'); // lo sustituye: se borran las filas del anterior
  await paso('plan');
  await paso('hoy');

  // Solo el administrador o quien añadió el alimento puede cambiarlo (la referencia no tiene esa regla).
  try {
    await sb.ejecutar(con, sesion, navegador.motor, { accion: 'renombrarAlimento', id: 'aceite_oliva', nombre: 'Prueba' });
    const comun = (await sb.leerTablas(con, sesion)).alimentos.find(a => a.id === 'aceite_oliva');
    if (comun.creado_por === sesion.usuario.id) console.log('· renombrarAlimento: este usuario creó el alimento, así que puede.');
    else { fallos++; console.log('✘ renombrarAlimento debía fallar: el alimento es de otro usuario'); }
  } catch (err) {
    console.log(`✔ renombrarAlimento de otro usuario → ${err.message}`);
  }

  const enBase = await celdasDeBase(navegador.motor);
  const enMemoria = Object.fromEntries(ORDEN.map(t => [t, referencia.contexto.leerTabla_(t)]));
  enMemoria.alimentos = enBase.alimentos; // el renombrado anterior no está en la referencia
  ORDEN.forEach(t => {
    try {
      assert.deepEqual(comparables(JSON.parse(JSON.stringify(enBase[t]))), comparables(JSON.parse(JSON.stringify(enMemoria[t]))));
    } catch (err) {
      fallos++;
      console.log(`✘ la tabla ${t} no coincide\n${err.message.split('\n').slice(0, 30).join('\n')}`);
    }
  });
  console.log(`Filas en la base: ${ORDEN.map(t => `${t} ${enBase[t].length}`).join(' · ')}`);

  if (!dejar) await borrarPersonales();
  console.log(fallos ? `\n${fallos} comprobaciones fallidas.` : `\nTodo correcto: Supabase da lo mismo que el motor solo.${dejar ? ' Los datos se quedan en la base.' : ''}`);
  process.exit(fallos ? 1 : 0);
}

main().catch(e => salir(e.stack || String(e)));
