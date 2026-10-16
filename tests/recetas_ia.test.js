// Recetas con IA (Fase 5): validación de lo que propone Claude y flujo completo con la API simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { cargarAppsScript } = require('./simulador_gas.js');

const VIERNES = '2026-10-16T09:00:00+02:00';

function preparar(conClave = true) {
  const gas = cargarAppsScript(VIERNES);
  gas.contexto.configurarHoja();
  gas.contexto.crearToken();
  if (conClave) gas.propiedades.ANTHROPIC_API_KEY = 'sk-ant-prueba';
  return gas;
}

const filas = (gas, nombre) => gas.contexto.leerTabla_(nombre);

// Recetas de cena como las devolvería Claude.
const TACOS = {
  nombre: 'Tacos de pollo al pastor con piña',
  preparacion: 'Marina el pollo con pimentón y comino; dóralo a fuego fuerte con la piña; sirve en las tortillas con cebolla',
  ingredientes_fijos: [{ alimento: 'pimiento_cebolla', gramos: 60 }, { alimento: 'pina', gramos: 20 }],
  ingredientes_escalables: [
    { alimento: 'pechuga_pollo', min_g: 100, max_g: 200, unidad: false },
    { alimento: 'fajita_pequena', min_g: 25, max_g: 100, unidad: true },
    { alimento: 'aceite_oliva', min_g: 3, max_g: 15, unidad: false },
    { alimento: 'mozzarella_light', min_g: 0, max_g: 40, unidad: false },
  ],
  alimentos_nuevos: [],
};
const SOLO_POLLO = Object.assign({}, TACOS, {
  nombre: 'Pollo a la plancha',
  ingredientes_fijos: [],
  ingredientes_escalables: [{ alimento: 'pechuga_pollo', min_g: 100, max_g: 110, unidad: false }],
});
const CON_NUEVO = Object.assign({}, TACOS, {
  nombre: 'Tacos de cochinita pibil',
  ingredientes_fijos: [{ alimento: 'achiote', gramos: 10 }],
  alimentos_nuevos: [{ id: 'achiote', nombre: 'Pasta de achiote', grupo: 'verdura_condimento', estado: 'crudo' }],
});

const respuestaClaude = recetas => ({
  codigo: 200,
  cuerpo: { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ recetas }) }] },
});

test('evaluar: una receta buena cuadra con el objetivo de la comida', () => {
  const gas = preparar();
  const c = gas.contexto;
  const ctx = c.contextoIA_();
  const receta = c.normalizarRecetaIA_(TACOS, 'Cena', ctx.alimentos);
  const r = c.evaluarRecetaIA_(receta, Object.assign({ objetivo: ctx.objetivos.Cena }, ctx));
  assert.equal(r.estado, 'valida', r.motivo);
  assert.equal(r.ajuste.evaluacion.ok, true);
  assert.equal(r.ajuste.gramos.fajita_pequena % 25, 0, 'tortillas enteras');
});

test('evaluar: descarta lo que no cuadra, lo excluido, lo desconocido y los límites absurdos', () => {
  const gas = preparar();
  const c = gas.contexto;
  const ctx = c.contextoIA_();
  const evaluar = (r, extra = {}) => c.evaluarRecetaIA_(c.normalizarRecetaIA_(r, 'Cena', ctx.alimentos),
    Object.assign({ objetivo: ctx.objetivos.Cena }, ctx, extra));

  const noCuadra = evaluar(SOLO_POLLO);
  assert.equal(noCuadra.estado, 'descartada');
  assert.match(noCuadra.motivo, /No cuadra con el objetivo: .*hidratos −/);

  const excluido = evaluar(TACOS, { excluidos: new Set(['pina']) });
  assert.equal(excluido.estado, 'descartada');
  assert.match(excluido.motivo, /excluido/);

  const inventado = evaluar(Object.assign({}, TACOS, { ingredientes_fijos: [{ alimento: 'salsa_rara', gramos: 10 }] }));
  assert.equal(inventado.estado, 'descartada', 'un id desconocido sin declarar en alimentos_nuevos no vale');
  assert.match(inventado.motivo, /salsa_rara/);

  const limites = evaluar(Object.assign({}, TACOS, { ingredientes_escalables: [{ alimento: 'pechuga_pollo', min_g: 200, max_g: 100, unidad: false }] }));
  assert.match(limites.motivo, /Límites no válidos/);

  const sinEscalables = evaluar(Object.assign({}, TACOS, { ingredientes_escalables: [] }));
  assert.match(sinEscalables.motivo, /ajustar/);

  // `unidad` en un alimento sin gramos por unidad se corrige en vez de romper el redondeo.
  const r = c.normalizarRecetaIA_(Object.assign({}, TACOS, { ingredientes_escalables: [{ alimento: 'arroz', min_g: 40, max_g: 90, unidad: true }] }), 'Cena', ctx.alimentos);
  assert.equal(r.ingredientes_escalables[0].unidad, false);
});

test('evaluar: un alimento nuevo declarado deja la receta esperando ese alimento', () => {
  const gas = preparar();
  const c = gas.contexto;
  const ctx = c.contextoIA_();
  const r = c.evaluarRecetaIA_(c.normalizarRecetaIA_(CON_NUEVO, 'Cena', ctx.alimentos), Object.assign({ objetivo: ctx.objetivos.Cena }, ctx));
  assert.equal(r.estado, 'falta_alimento');
  assert.deepEqual(JSON.parse(JSON.stringify(r.faltan)), [{ id: 'achiote', nombre: 'Pasta de achiote', grupo: 'verdura_condimento', estado: 'crudo' }]);
});

test('mensaje para Claude: objetivo, tabla sin excluidos, recetas existentes y valoraciones', () => {
  const gas = preparar();
  gas.llamar('guardarExcluidos', { alimentos: ['salmon'] });
  gas.llamar('valorar', { receta_id: 'C2', valor: 'me_encanta' });
  const c = gas.contexto;
  const ctx = c.contextoIA_();
  const texto = c.mensajeRecetasIA_({ comida: 'Cena', cantidad: 3, idea: 'algo mexicano', objetivo: ctx.objetivos.Cena,
    alimentosFilas: ctx.alimentosFilas, excluidos: ctx.excluidos, recetas: filas(gas, 'recetas'),
    favoritas: ['Plato favorito'], noGustan: [], descartadas: [{ nombre: 'X', motivo: 'No cuadra' }] });
  assert.match(texto, /Propón 3 recetas de cena/);
  assert.match(texto, /algo mexicano/);
  assert.match(texto, /373 kcal, 34.9 g de proteína/);
  assert.match(texto, /^pechuga_pollo \| /m);
  assert.doesNotMatch(texto, /^salmon \| /m, 'los excluidos no están en la tabla');
  assert.match(texto, /Alimentos excluidos .*Salmon/);
  assert.match(texto, /Salmón al horno/, 'lista las cenas que ya existen');
  assert.doesNotMatch(texto, /Huevos revueltos/, 'no lista recetas de otras comidas');
  assert.match(texto, /X: No cuadra/);
});

test('proponerRecetas: guarda las válidas como propuestas y repite solo las descartadas', () => {
  const gas = preparar();
  const respuestas = [respuestaClaude([TACOS, SOLO_POLLO, CON_NUEVO]), respuestaClaude([Object.assign({}, TACOS, { nombre: 'Tacos de ternera' })])];
  gas.red.responder = () => respuestas.shift();

  const r = gas.llamar('proponerRecetas', { comida: 'Cena', idea: 'mexicano' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.datos.nuevas, ['IA1', 'IA2', 'IA3']);
  assert.deepEqual(r.datos.descartadas.map(d => d.nombre), ['Pollo a la plancha']);
  assert.equal(gas.red.llamadas.length, 2);

  // La petición a la API: modelo, clave en cabecera, JSON con esquema; el segundo intento cuenta el fallo.
  const peticion = gas.red.llamadas[0];
  const cuerpo = JSON.parse(peticion.opciones.payload);
  assert.equal(peticion.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(peticion.opciones.headers['x-api-key'], 'sk-ant-prueba');
  assert.equal(cuerpo.model, 'claude-sonnet-5-5');
  assert.equal(cuerpo.output_config.format.type, 'json_schema');
  const segundo = JSON.parse(gas.red.llamadas[1].opciones.payload).messages[0].content;
  assert.match(segundo, /Propón 1 receta de cena/);
  assert.match(segundo, /Pollo a la plancha: No cuadra/);
  assert.match(segundo, /Tacos de pollo al pastor/, 'no repetir lo ya propuesto');

  const recetas = filas(gas, 'recetas').filter(f => f.origen === 'ia');
  assert.deepEqual(recetas.map(f => f.activa), ['propuesta', 'propuesta', 'propuesta']);
  const estados = r.datos.propuestas.map(p => [p.id, p.estado]);
  assert.deepEqual(estados, [['IA1', 'valida'], ['IA2', 'falta_alimento'], ['IA3', 'valida']]);
  assert.equal(r.datos.propuestas[1].faltan[0].id, 'achiote');
  assert.ok(r.datos.propuestas[1].ingredientes.some(i => i.alimento === 'achiote' && i.nuevo && i.nombre === 'Pasta de achiote'));

  // Las propuestas no salen en la biblioteca ni en los planes hasta aceptarlas.
  assert.equal(gas.llamar('recetas').datos.some(x => x.origen === 'ia'), false);
});

test('proponerRecetas: descarta platos con el nombre de una receta que ya existe', () => {
  const gas = preparar();
  const salmon = Object.assign({}, TACOS, { nombre: 'salmón al horno con costra de mostaza y miel, patatas asadas y salsa de eneldo ' });
  const respuestas = [respuestaClaude([TACOS, TACOS]), respuestaClaude([salmon])];
  gas.red.responder = () => respuestas.shift();
  const r = gas.llamar('proponerRecetas', { comida: 'Cena', cantidad: 2 }).datos;
  assert.deepEqual(r.nuevas, ['IA1']);
  assert.deepEqual(r.descartadas.map(d => d.motivo), ['Ya hay una receta con ese nombre.', 'Ya hay una receta con ese nombre.']);
});

test('aceptar, descartar y añadir el alimento que falta', () => {
  const gas = preparar();
  const respuestas = [respuestaClaude([TACOS, CON_NUEVO])];
  gas.red.responder = () => respuestas.shift();
  gas.llamar('proponerRecetas', { comida: 'Cena', cantidad: 2 });

  // Con el alimento aún sin añadir no se puede aceptar.
  assert.match(gas.llamar('aceptarPropuesta', { receta_id: 'IA2' }).error, /Antes añade Pasta de achiote/);

  const alimento = { id: 'achiote', nombre: 'Pasta de achiote', grupo: 'verdura_condimento', estado: 'crudo',
    kcal_100: '120', proteina_100: '3', carbohidratos_100: '18', grasa_100: '4', gramos_por_unidad: '' };
  assert.match(gas.llamar('anadirAlimento', { alimento: Object.assign({}, alimento, { kcal_100: '500' }) }).error, /Revisa los valores/);
  const anadido = gas.llamar('anadirAlimento', { alimento });
  assert.equal(anadido.ok, true, anadido.error);
  assert.equal(anadido.datos.propuestas.find(p => p.id === 'IA2').estado, 'valida');
  const fila = filas(gas, 'alimentos').find(a => a.id === 'achiote');
  assert.equal(fila.verificado, 'si');
  assert.equal(fila.kcal_100, 120);
  assert.match(gas.llamar('anadirAlimento', { alimento }).error, /Ya existe/);

  const aceptada = gas.llamar('aceptarPropuesta', { receta_id: 'IA2' });
  assert.equal(aceptada.ok, true, aceptada.error);
  const guardada = filas(gas, 'recetas').find(f => f.id === 'IA2');
  assert.equal(guardada.activa, 'si');
  assert.doesNotMatch(guardada.ingredientes_fijos, /nuevo/, 'sin restos de la propuesta');
  assert.ok(gas.llamar('recetas').datos.some(x => x.id === 'IA2' && x.ajuste), 'ya está en la biblioteca');

  assert.equal(gas.llamar('descartarPropuesta', { receta_id: 'IA1' }).datos.propuestas.length, 0);
  assert.equal(filas(gas, 'recetas').find(f => f.id === 'IA1').activa, 'descartada');
  assert.match(gas.llamar('descartarPropuesta', { receta_id: 'IA1' }).error, /No hay ninguna propuesta/);
});

test('proponerRecetas: errores claros (sin clave, clave mala, saturado, comida mala)', () => {
  const sinClave = preparar(false);
  assert.match(sinClave.llamar('proponerRecetas', { comida: 'Cena' }).error, /ANTHROPIC_API_KEY/);

  const gas = preparar();
  assert.match(gas.llamar('proponerRecetas', { comida: 'Brunch' }).error, /Comida no válida/);
  gas.red.responder = () => ({ codigo: 401, cuerpo: { error: { message: 'invalid x-api-key' } } });
  assert.match(gas.llamar('proponerRecetas', { comida: 'Cena' }).error, /clave .* no es válida/);
  gas.red.responder = () => ({ codigo: 529, cuerpo: { error: { message: 'Overloaded' } } });
  assert.match(gas.llamar('proponerRecetas', { comida: 'Cena' }).error, /saturado/);
  gas.red.responder = () => ({ codigo: 200, cuerpo: { stop_reason: 'refusal', content: [] } });
  assert.match(gas.llamar('proponerRecetas', { comida: 'Cena' }).error, /no ha querido/);
  assert.equal(filas(gas, 'recetas').length, 22, 'nada guardado');
});

test('alimento nuevo: validación de los valores por 100 g', () => {
  const gas = preparar();
  const fila = d => gas.contexto.filaAlimentoNuevo_(Object.assign({ id: 'kefir', nombre: 'Kéfir', grupo: 'lacteo', estado: 'crudo',
    kcal_100: '60', proteina_100: '3,5', carbohidratos_100: '4', grasa_100: '3.2', gramos_por_unidad: '' }, d), ['leche']);
  assert.equal(fila({}).proteina_100, 3.5);
  assert.equal(fila({ gramos_por_unidad: '125' }).gramos_por_unidad, 125);
  assert.throws(() => fila({ id: 'Kéfir!' }), /Identificador/);
  assert.throws(() => fila({ id: 'leche' }), /Ya existe/);
  assert.throws(() => fila({ grupo: 'otro' }), /Grupo/);
  assert.throws(() => fila({ proteina_100: '' }), /entre 0 y 100/);
  assert.throws(() => fila({ proteina_100: '60', carbohidratos_100: '50' }), /más de 100/);
  assert.throws(() => fila({ gramos_por_unidad: '0' }), /por unidad/);
});

test('ids de recetas IA: siguiente número libre', () => {
  const gas = preparar();
  assert.equal(gas.contexto.siguienteIdIA_(['D1', 'C7']), 'IA1');
  assert.equal(gas.contexto.siguienteIdIA_(['IA1', 'IA9', 'IA3']), 'IA10');
});

test('pedidoRecetas: instrucciones, mensaje y esquema para escribir recetas en Claude Code', () => {
  const gas = preparar(false);
  const r = gas.llamar('pedidoRecetas', { comida: 'Merienda', cantidad: 2, idea: 'dulce' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(JSON.parse(JSON.stringify(r.datos.pedido)), { comida: 'Merienda', cantidad: 2, idea: 'dulce' });
  assert.match(r.datos.sistema, /nunca valores nutricionales/);
  assert.match(r.datos.mensaje, /Propón 2 recetas de merienda/);
  assert.equal(r.datos.esquema.required[0], 'recetas');
  assert.equal(gas.red.llamadas.length, 0, 'no llama a la API');
});

test('importarPropuestas: probar no guarda; sin probar guarda como propuestas', () => {
  const gas = preparar(false);
  const prueba = gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [TACOS, SOLO_POLLO, CON_NUEVO], probar: true });
  assert.equal(prueba.ok, true, prueba.error);
  assert.deepEqual(prueba.datos.validas.map(v => v.estado), ['valida', 'falta_alimento']);
  assert.ok(prueba.datos.validas[0].macros.kcal > 300);
  assert.equal(prueba.datos.descartadas[0].nombre, 'Pollo a la plancha');
  assert.equal(filas(gas, 'recetas').length, 22, 'probar no guarda');

  const r = gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [TACOS, SOLO_POLLO, CON_NUEVO] });
  assert.deepEqual(r.datos.nuevas, ['IA1', 'IA2']);
  assert.equal(r.datos.propuestas.length, 2);
  const otra = gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [TACOS] });
  assert.match(otra.datos.descartadas[0].motivo, /Ya hay una receta/);
  assert.match(gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [] }).error, /No hay recetas/);
});
