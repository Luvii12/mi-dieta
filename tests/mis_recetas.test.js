// Recetas que crea cada persona en la app (web/motor/MisRecetas.js): de los gramos que pone a una receta con
// fijos y escalables, cálculo para su objetivo, guardar, «Mi versión», editar y borrar.
const test = require('node:test');
const assert = require('node:assert/strict');
const { nuevoMotor, enFecha, cargarMotor } = require('./motor_navegador.js');
const { SEMILLA } = require('../data/semilla.js');

const VIERNES = '2026-10-16T09:00:00+02:00';
const filas = (m, nombre) => JSON.parse(JSON.stringify(m.contexto.leerTabla_(nombre)));

// Arroz con pollo para cenar, con los gramos de una ración de Fran.
const ARROZ = { comida: 'Cena', nombre: 'Arroz con pollo al limón', preparacion: 'Dora el pollo.\nAñade el arroz cocido y el limón.',
  ingredientes: [{ alimento: 'pechuga_pollo', gramos: 150 }, { alimento: 'arroz', gramos: 50 }, { alimento: 'aceite_oliva', gramos: 8 },
    { alimento: 'pimiento_cebolla', gramos: 100 }] };

test('recetaManual_: proteína, hidratos y grasa se ajustan; verduras fijas; piezas enteras', () => {
  const m = nuevoMotor(VIERNES);
  const r = m.contexto.recetaManual_(Object.assign({}, ARROZ, { ingredientes: ARROZ.ingredientes.concat([{ alimento: 'huevo', gramos: 106 }]) }),
    SEMILLA.objetivos.Cena, m.contexto.indexarAlimentos_(SEMILLA.alimentos), new Set());
  assert.deepEqual(JSON.parse(JSON.stringify(r.ingredientes_fijos)), [{ alimento: 'pimiento_cebolla', gramos: 100 }]);
  const esc = Object.fromEntries(r.ingredientes_escalables.map(e => [e.alimento, e]));
  assert.deepEqual([esc.pechuga_pollo.min_g, esc.pechuga_pollo.max_g, esc.pechuga_pollo.unidad], [75, 240, false]);
  assert.deepEqual([esc.huevo.min_g, esc.huevo.max_g, esc.huevo.unidad], [53, 159, true], '2 huevos: de 1 a 3');
  assert.equal(esc.aceite_oliva.max_g, 13);
});

test('recetaManual_: errores claros', () => {
  const m = nuevoMotor(VIERNES);
  const alimentos = m.contexto.indexarAlimentos_(SEMILLA.alimentos);
  const probar = (cambios, prohibidos = new Set()) => assert.throws(() => m.contexto.recetaManual_(Object.assign({}, ARROZ, cambios), SEMILLA.objetivos.Cena, alimentos, prohibidos));
  probar({ nombre: '  ' });
  probar({ ingredientes: [] });
  probar({ ingredientes: [{ alimento: 'xx', gramos: 10 }] });
  probar({ ingredientes: [{ alimento: 'arroz', gramos: 50 }, { alimento: 'arroz', gramos: 20 }] });
  probar({ ingredientes: [{ alimento: 'arroz', gramos: 0 }] });
  probar({ ingredientes: [{ alimento: 'pimiento_cebolla', gramos: 200 }] }); // nada que ajustar
  probar({}, new Set(['arroz']));
});

test('guardarReceta: probar calcula sin guardar; guardar la añade a la biblioteca y entra en los planes', () => {
  const m = nuevoMotor(VIERNES);
  const probar = m.llamar('guardarReceta', { receta: ARROZ, probar: true });
  assert.equal(probar.ok, true, probar.error);
  assert.equal(probar.datos.id, 'R1');
  assert.equal(probar.datos.aviso, null, 'cuadra con la cena');
  assert.ok(Math.abs(probar.datos.ajuste.macros.kcal - SEMILLA.objetivos.Cena.kcal) < 40);
  assert.equal(filas(m, 'recetas').length, 22);

  const r = m.llamar('guardarReceta', { receta: ARROZ });
  assert.equal(r.ok, true, r.error);
  const fila = filas(m, 'recetas').find(f => f.id === 'R1');
  assert.equal(fila.origen, 'manual');
  assert.equal(fila.activa, 'si');
  assert.ok(m.llamar('recetas').datos.some(x => x.id === 'R1' && x.ajuste));
  assert.match(m.llamar('guardarReceta', { receta: Object.assign({}, ARROZ, { nombre: 'arroz con POLLO al limón' }) }).error, /Ya hay una receta/);
  assert.equal(m.llamar('guardarReceta', { receta: Object.assign({}, ARROZ, { nombre: 'Otro arroz' }), probar: true }).datos.id, 'R2');

  const plan = m.llamar('generarPlan').datos;
  assert.ok(!plan.descartadas.some(d => d.id === 'R1'));
});

test('guardarReceta: si no cuadra avisa de qué cambiar, pero se puede guardar', () => {
  const m = nuevoMotor(VIERNES);
  const pasta = { comida: 'Cena', nombre: 'Pasta con tomate', preparacion: '',
    ingredientes: [{ alimento: 'pasta', gramos: 80 }, { alimento: 'aceite_oliva', gramos: 10 }, { alimento: 'tomate', gramos: 150 }] };
  const r = m.llamar('guardarReceta', { receta: pasta });
  assert.equal(r.ok, true, r.error);
  assert.match(r.datos.aviso, /^Le falta proteína: añade claras/);
  assert.equal(filas(m, 'recetas').find(f => f.id === 'R1').activa, 'si');
});

test('guardarReceta: quien tiene raciones más pequeñas la guarda a la escala de Fran y le sale con sus gramos', () => {
  const m = nuevoMotor(VIERNES);
  m.contexto.escribirConfig_('objetivo_cena', { kcal: 290, P: 26, C: 23, G: 9.5 }); // ~3/4 de la cena de Fran
  const r = m.llamar('guardarReceta', { receta: Object.assign({}, ARROZ, { ingredientes: [
    { alimento: 'pechuga_pollo', gramos: 115 }, { alimento: 'arroz', gramos: 40 }, { alimento: 'aceite_oliva', gramos: 6 }] }) });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.datos.aviso, null);
  const pollo = JSON.parse(filas(m, 'recetas').find(f => f.id === 'R1').ingredientes_escalables).find(e => e.alimento === 'pechuga_pollo');
  assert.ok(pollo.max_g > 115 * 1.6 * 1.2, 'guardada más grande que la ración de quien la crea');
  const suyo = r.datos.ajuste.gramos.pechuga_pollo;
  assert.ok(suyo >= 90 && suyo <= 140, 'a ella le sale una ración parecida a la que puso: ' + suyo);
});

test('guardarReceta: «Mi versión» oculta la original para quien la hace', () => {
  const m = nuevoMotor(VIERNES);
  const original = SEMILLA.recetas.find(r => r.comida === 'Cena');
  const r = m.llamar('guardarReceta', { receta: ARROZ, version_de: original.id });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(filas(m, 'valoraciones').map(v => [v.receta_id, v.valor]), [[original.id, 'no_repetir']]);
  assert.ok(m.llamar('generarPlan').datos.descartadas.some(d => d.id === original.id));
  assert.match(m.llamar('guardarReceta', { receta: Object.assign({}, ARROZ, { nombre: 'X' }), version_de: 'ZZ' }).error, /No existe/);
});

test('guardarReceta: editar cambia la receta y recalcula lo que queda del plan; la comida no cambia', () => {
  const m = nuevoMotor(VIERNES);
  m.llamar('guardarReceta', { receta: ARROZ });
  const plan = m.llamar('generarPlan').datos;
  m.llamar('activarPlan', { plan_id: plan.plan_id });
  // El arroz con pollo, en dos cenas: la del primer día (ya comida) y la del segundo.
  const comidas = filas(m, 'plan_comidas').map(f => Object.assign(f, f.comida === 'Cena' && (f.fecha === '2026-10-19' || f.fecha === '2026-10-20')
    ? { receta_id: 'R1', hecha: f.fecha === '2026-10-19' ? 'si' : 'no' } : {}));
  m.contexto.reescribirTabla_('plan_comidas', comidas);
  const martes = enFecha(m, '2026-10-20T09:00:00+02:00');

  const conQueso = Object.assign({}, ARROZ, { id: 'R1', ingredientes: ARROZ.ingredientes.concat([{ alimento: 'queso_curado', gramos: 15 }]) });
  const r = martes.llamar('guardarReceta', { receta: conQueso });
  assert.equal(r.ok, true, r.error);
  assert.equal(filas(martes, 'recetas').length, 23, 'no añade otra');
  const cena = dia => JSON.parse(filas(martes, 'plan_comidas').find(f => f.fecha === dia && f.comida === 'Cena').gramos);
  assert.ok('queso_curado' in cena('2026-10-20'), 'la de hoy, sin comer, se recalcula');
  assert.ok(!('queso_curado' in cena('2026-10-19')), 'la de ayer no se toca');
  assert.match(martes.llamar('guardarReceta', { receta: Object.assign({}, conQueso, { comida: 'Almuerzo' }) }).error, /no se puede cambiar la comida/);
});

test('borrarReceta: deja de salir en Recetas y en los planes nuevos; las comidas ya planificadas siguen', () => {
  const m = nuevoMotor(VIERNES);
  m.llamar('guardarReceta', { receta: ARROZ });
  assert.equal(m.llamar('borrarReceta', { receta_id: 'R1' }).ok, true);
  assert.equal(filas(m, 'recetas').find(f => f.id === 'R1').activa, 'no');
  assert.ok(!m.llamar('recetas').datos.some(x => x.id === 'R1'));
  assert.match(m.llamar('borrarReceta', { receta_id: 'R1' }).error, /No existe/);
  assert.equal(m.llamar('guardarReceta', { receta: ARROZ, probar: true }).datos.id, 'R2', 'el id no se reutiliza');
});

test('guardarReceta: solo comidas que hace la persona', () => {
  const m = cargarMotor(VIERNES, Object.assign({}, require('./motor_navegador.js').tablasIniciales()));
  m.contexto.reescribirTabla_('config', filas(m, 'config').filter(f => f.clave !== 'objetivo_merienda'));
  assert.match(m.llamar('guardarReceta', { receta: Object.assign({}, ARROZ, { comida: 'Merienda' }) }).error, /Elige la comida/);
});
