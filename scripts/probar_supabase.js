// Prueba la capa de datos (web/supabase.js) contra el Supabase de verdad con una cuenta temporal: genera y
// activa un plan, sigue su primer día (marcar, cambiar plato, valorar, peso, excluidos…) y comprueba que cada
// respuesta y las filas que quedan en la base son las mismas que da el motor solo, en memoria.
// La cuenta se crea con la configuración de partida (objetivos de «Ajustes Fran. Déficit»), usa la biblioteca
// común y se borra al acabar con todos sus datos. Conexión en .supabase.local.json (ver docs/SUPABASE.md).
//
// Uso: npm run probar-supabase
const assert = require('node:assert/strict');
const { cargarMotor, tablasIniciales } = require('../tests/motor_navegador.js');
const { leerArchivo, cuentasTemporales } = require('./cuenta_supabase.js');

const ORDEN = ['alimentos', 'recetas', 'config', 'planes', 'plan_comidas', 'pesos', 'valoraciones', 'preferencias', 'ajustes_historial'];

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
  const temporal = await cuentasTemporales(leerArchivo(), 1);
  let fallos = 0;
  try {
    fallos = await probar(temporal.sb, temporal.con, temporal.sesiones[0]);
  } catch (err) {
    console.error(err.stack || String(err));
    fallos++;
  } finally {
    await temporal.borrar();
  }
  console.log(fallos ? `\n${fallos} comprobaciones fallidas.` : '\nTodo correcto: Supabase da lo mismo que el motor solo.');
  process.exit(fallos ? 1 : 0);
}

// Configuración de partida para la cuenta temporal, como la de una cuenta sin perfil.
async function anadirConfig(sb, con, sesion) {
  const r = await fetch(`${con.url}/rest/v1/config`, {
    method: 'POST',
    headers: { apikey: con.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify(tablasIniciales().config.map(f => sb.aBase('config', f, sesion.usuario.id))),
  });
  if (!r.ok) throw new Error(`No se pudo guardar la configuración: ${r.status} ${await r.text()}`);
}

// Devuelve el número de comprobaciones fallidas.
async function probar(sb, con, sesion) {
  console.log(`Cuenta temporal: ${sesion.usuario.email}`);
  await anadirConfig(sb, con, sesion);
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
  if (!inicial.recetas.length) throw new Error('No hay recetas en la base.');
  referencia = cargarMotor(ahora, inicial);
  const generado = await paso('generarPlan', {}, r => assert.equal(r.datos.dias.length, 14));
  if (!generado.ok) throw new Error('No se pudo generar el plan: ' + generado.error);
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

  return fallos;
}

main();
