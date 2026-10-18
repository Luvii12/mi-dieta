// Capa de datos de Supabase (fase M2, web/supabase.js) contra una base falsa en memoria: las acciones
// ejecutadas en el navegador y guardadas en Supabase dan lo mismo que el motor solo, y la base queda con
// las mismas filas. Además: sesión, reglas por fila y casos raros del guardado.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearSupabaseFalso } = require('./supabase_falso.js');
const { cargarMotor, cargarGas, todasLasTablas } = require('./motor_navegador.js');

const VIERNES = '2026-10-16T09:00:00+02:00';
const MIERCOLES = '2026-10-21T13:00:00+02:00';
const ORDEN = ['alimentos', 'recetas', 'config', 'planes', 'plan_comidas', 'pesos', 'valoraciones', 'preferencias', 'ajustes_historial'];
const USUARIOS = [
  { id: 'u1', email: 'prueba1@mi-dieta.test', password: 'secreta1' },
  { id: 'u2', email: 'prueba2@mi-dieta.test', password: 'secreta2' },
];

const cargarSb = () => import('../web/supabase.js');

// Plan generado el viernes y activado; la base falsa tiene esas tablas como datos de u1.
async function preparar() {
  const sb = await cargarSb();
  const gas = cargarGas(VIERNES);
  const p = gas.llamar('generarPlan').datos;
  gas.llamar('activarPlan', { plan_id: p.plan_id });
  const tablas = todasLasTablas(gas.contexto);
  const falso = crearSupabaseFalso({ usuarios: USUARIOS, ahora: () => new Date(MIERCOLES) });
  ORDEN.forEach(nombre => {
    falso.cargar(nombre, tablas[nombre].map(f => {
      const fila = sb.aBase(nombre, f, 'u1');
      if (nombre === 'planes') fila.creado = f.creado + ':00+02:00';
      return fila;
    }), 'u1');
  });
  const con = { url: 'http://supabase.falso', clave: 'clave-falsa', fetch: falso.fetch };
  return { sb, falso, con, tablas };
}

// Ejecuta como la PWA y devuelve lo mismo que manejar_ ({ok, datos} o {ok: false, error}).
function enNube(sb, con, sesion, motor) {
  return async (accion, extra = {}) => {
    try {
      return JSON.parse(JSON.stringify({ ok: true, datos: await sb.ejecutar(con, sesion, motor, { ...extra, accion }) }));
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };
}

// Para comparar tablas: los textos JSON como objetos con las claves ordenadas (jsonb las reordena) y las
// filas ordenadas (el orden de las filas tampoco importa).
const canonico = v => {
  if (typeof v === 'string' && /^[[{]/.test(v)) return canonico(JSON.parse(v));
  if (Array.isArray(v)) return v.map(canonico);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])]));
  return v;
};
const comparables = tablas => Object.fromEntries(ORDEN.map(n => [n, tablas[n].map(canonico)
  .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));

// Tablas de un usuario en la base, como celdas del motor.
function tablasDeBase(sb, falso, userId, motor) {
  return Object.fromEntries(ORDEN.map(nombre => [nombre, falso.tablas[nombre]
    .filter(f => !('user_id' in f) || f.user_id === userId)
    .map(f => JSON.parse(JSON.stringify(sb.deBase(nombre, f, motor))))]));
}

test('un día completo da lo mismo con Supabase que con el motor solo, y deja las mismas filas', async () => {
  const { sb, falso, con, tablas } = await preparar();
  const referencia = cargarMotor(MIERCOLES, tablas);
  const navegador = cargarMotor(MIERCOLES, {});
  const sesion = await sb.entrar(con, 'prueba1@mi-dieta.test', 'secreta1');
  assert.equal(sesion.usuario.id, 'u1');
  const nube = enNube(sb, con, sesion, navegador.motor);
  const iguales = async (accion, extra) => {
    const esperado = referencia.llamar(accion, extra);
    assert.deepEqual(await nube(accion, extra), esperado, accion);
    return esperado;
  };

  const hoy = await iguales('hoy');
  assert.equal(hoy.ok, true, hoy.error);
  assert.equal(hoy.datos.comidas.length, 4);
  const dia = { plan_id: hoy.datos.plan_id, fecha: hoy.datos.fecha };
  await iguales('marcarComida', { ...dia, comida: 'Desayuno', hecha: 'si' });
  await iguales('marcarComida', { ...dia, comida: 'Almuerzo', hecha: 'libre' });
  const alternativas = await iguales('alternativas', { ...dia, comida: 'Cena' });
  assert.ok(alternativas.datos.length > 0);
  await iguales('cambiarPlato', { ...dia, comida: 'Cena', receta_id: alternativas.datos[0].receta_id || alternativas.datos[0].id });
  await iguales('valorar', { receta_id: hoy.datos.comidas[0].receta_id, valor: 'me_encanta' });
  await iguales('valorar', { receta_id: hoy.datos.comidas[0].receta_id, valor: 'normal' });
  await iguales('registrarPeso', { peso_kg: '82,4', fecha: '2026-10-20' });
  await iguales('registrarPeso', { peso_kg: 82.1 });
  await iguales('registrarPeso', { peso_kg: 81.9 }); // sustituye al de hoy
  await iguales('config', { cambios: { peso_objetivo: 78 } });
  await iguales('config', { cambios: { peso_objetivo: null, comida_libre_semanal: false } });
  await iguales('progreso');
  await iguales('recetas');
  await iguales('alimentos');
  await iguales('guardarExcluidos', { alimentos: ['salmon', 'atun_natural'] });
  await iguales('guardarExcluidos', { alimentos: ['salmon'] });
  await iguales('renombrarAlimento', { id: 'aceite_oliva', nombre: 'Aceite de oliva virgen extra' });
  await iguales('marcarComida', { ...dia, comida: 'Cena', hecha: 'quizas' }); // los errores también coinciden
  const borrador = await iguales('generarPlan');
  assert.equal(borrador.ok, true, borrador.error);
  await iguales('generarPlan'); // sustituye al borrador anterior (se borran sus filas)
  const plan = await iguales('plan');
  await iguales('activarPlan', { plan_id: plan.datos.borrador.plan_id });
  await iguales('plan');
  await iguales('hoy');

  assert.deepEqual(comparables(tablasDeBase(sb, falso, 'u1', navegador.motor)), comparables(todasLasTablas(referencia.contexto)));
});

test('cada usuario solo ve y cambia lo suyo', async () => {
  const { sb, falso, con } = await preparar();
  const navegador = cargarMotor(MIERCOLES, {});
  const sesion = await sb.entrar(con, 'prueba2@mi-dieta.test', 'secreta2');
  const tablas = await sb.leerTablas(con, sesion);
  assert.ok(tablas.recetas.length > 0, 've las recetas comunes');
  ['config', 'planes', 'plan_comidas', 'pesos'].forEach(n => assert.equal(tablas[n].length, 0, n));

  const nube = enNube(sb, con, sesion, navegador.motor);
  assert.match((await nube('hoy')).datos.mensaje, /no hay un plan activo/);
  await nube('registrarPeso', { peso_kg: 70 });
  assert.deepEqual(falso.tablas.pesos.filter(p => p.user_id === 'u2').map(p => p.peso_kg), [70]);
  assert.ok(falso.tablas.pesos.filter(p => p.user_id === 'u1').length === 0, 'u1 no tenía pesos y sigue sin ellos');

  // El alimento lo añadió u1: u2 no puede cambiarlo.
  const r = await nube('renombrarAlimento', { id: 'aceite_oliva', nombre: 'Otro nombre' });
  assert.equal(r.ok, false);
  assert.match(r.error, /No tienes permiso para cambiar el alimento aceite_oliva/);
  assert.notEqual(falso.tablas.alimentos.find(a => a.id === 'aceite_oliva').nombre, 'Otro nombre');
});

test('sesión: contraseña mala, token caducado y renovación de un solo uso', async () => {
  const { sb, falso, con } = await preparar();
  await assert.rejects(sb.entrar(con, 'prueba1@mi-dieta.test', 'mala'), /Email o contraseña incorrectos/);
  const sesion = await sb.entrar(con, 'prueba1@mi-dieta.test', 'secreta1');
  assert.ok(sesion.expira > Date.now());
  assert.deepEqual(sesion.usuario, { id: 'u1', email: 'prueba1@mi-dieta.test' });

  falso.caducarAccesos();
  const navegador = cargarMotor(MIERCOLES, {});
  await assert.rejects(sb.ejecutar(con, sesion, navegador.motor, { accion: 'hoy' }), sb.ErrorToken);
  const nueva = await sb.renovar(con, sesion);
  assert.equal((await sb.ejecutar(con, nueva, navegador.motor, { accion: 'hoy' })).comidas.length, 4);
  await assert.rejects(sb.renovar(con, sesion), sb.ErrorSesion); // la renovación ya se usó

  await sb.salir(con, nueva);
  await assert.rejects(sb.renovar(con, nueva), sb.ErrorSesion);
  await assert.rejects(sb.entrar({ ...con, fetch: async () => { throw new TypeError('Failed to fetch'); } }, 'a', 'b'), /No se puede conectar/);
});

test('una acción que falla no guarda nada', async () => {
  const { sb, falso, con } = await preparar();
  const antes = JSON.stringify(falso.tablas);
  const sesion = await sb.entrar(con, 'prueba1@mi-dieta.test', 'secreta1');
  const navegador = cargarMotor(MIERCOLES, {});
  await assert.rejects(sb.ejecutar(con, sesion, navegador.motor, { accion: 'registrarPeso', peso_kg: 'mucho' }), /Peso no válido/);
  await assert.rejects(sb.ejecutar(con, sesion, navegador.motor, { accion: 'noExiste' }), /Acción desconocida/);
  assert.equal(JSON.stringify(falso.tablas), antes);
});

test('lee las tablas grandes por páginas de 1.000 filas', async () => {
  const { sb, falso, con } = await preparar();
  const dia = n => new Date(Date.UTC(2020, 0, 1) + n * 86400000).toISOString().slice(0, 10);
  falso.cargar('pesos', Array.from({ length: 2345 }, (_, i) => ({ user_id: 'u1', fecha: dia(i), peso_kg: 80 })), 'u1');
  const sesion = await sb.entrar(con, 'prueba1@mi-dieta.test', 'secreta1');
  const tablas = await sb.leerTablas(con, sesion);
  assert.equal(tablas.pesos.length, 2345);
  assert.equal(tablas.pesos[2344].fecha, dia(2344));
});

test('cambiosDeTabla: con clave por fila; sin clave, filas repetidas una a una', async () => {
  const sb = await cargarSb();
  const c = sb.cambiosDeTabla('pesos',
    [{ celdas: { fecha: '2026-10-01', peso_kg: 80, cintura_cm: '' } }, { celdas: { fecha: '2026-10-02', peso_kg: 79, cintura_cm: '' } }],
    [{ fecha: '2026-10-02', peso_kg: 78.5, cintura_cm: '' }, { fecha: '2026-10-03', peso_kg: 78, cintura_cm: '' }]);
  assert.deepEqual(c.nuevas.map(f => f.fecha), ['2026-10-03']);
  assert.deepEqual(c.cambiadas.map(f => f.fecha), ['2026-10-02']);
  assert.deepEqual(c.borradas.map(f => f.fecha), ['2026-10-01']);

  const v = { receta_id: 'A1', valor: 'normal', fecha: '2026-10-20' };
  const s = sb.cambiosDeTabla('valoraciones', [{ celdas: v, id: 7 }, { celdas: v, id: 8 }, { celdas: { ...v, receta_id: 'A2' }, id: 9 }],
    [v, { ...v, receta_id: 'A2' }, { ...v, receta_id: 'A2' }]);
  assert.deepEqual(s.borrarIds, [8]);
  assert.deepEqual(s.nuevas, [{ ...v, receta_id: 'A2' }]);

  assert.throws(() => sb.cambiosDeTabla('pesos', [], [{ fecha: '2026-10-01' }, { fecha: '2026-10-01' }]), /Fila repetida/);
});
