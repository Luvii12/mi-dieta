// Recetas con IA (Fase 5): validación de lo que propone Claude y flujo completo con la API simulada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { nuevoMotor } = require('./motor_navegador.js');

const VIERNES = '2026-10-16T09:00:00+02:00';

const preparar = () => nuevoMotor(VIERNES);

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
  assert.match(texto, /Ración de referencia: 373 kcal, 34.9 g de proteína/);
  assert.doesNotMatch(texto, /no escribas las cantidades para ella/, 'con los objetivos de Fran no hace falta aclararlo');
});

test('recetas para otra persona: se piden para la ración de referencia y a ella le salen a su escala', () => {
  const gas = preparar();
  const cena = { kcal: 317, P: 29.7, C: 24.7, G: 10.5 }; // 0,85 de la cena de Fran
  gas.contexto.escribirConfig_('objetivo_cena', cena);
  gas.contexto.escribirConfig_('perfil', { nombre: 'Ana' });
  const pedido = gas.llamar('pedidoRecetas', { comida: 'Cena' }).datos;
  assert.match(pedido.mensaje, /Ración de referencia: 373 kcal, 34.9 g de proteína/);
  assert.match(pedido.mensaje, /A Ana la app le escala después cada ingrediente a su ración \(317 kcal, 29.7 g de proteína/);
  assert.match(pedido.sistema, /Todas las cantidades son para la ración de referencia/);

  // Escrita para la ración de referencia, cuadra con su cena con algo menos de pollo que la de Fran.
  const arroz = { nombre: 'Arroz con pollo al limón', preparacion: 'Dora el pollo; añade el arroz y el limón',
    ingredientes_fijos: [{ alimento: 'pimiento_cebolla', gramos: 80 }], alimentos_nuevos: [],
    ingredientes_escalables: [{ alimento: 'pechuga_pollo', min_g: 100, max_g: 200, unidad: false },
      { alimento: 'arroz', min_g: 25, max_g: 70, unidad: false }, { alimento: 'aceite_oliva', min_g: 3, max_g: 15, unidad: false }] };
  const suya = gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [arroz], probar: true }).datos.validas[0];
  const deFran = preparar().llamar('importarPropuestas', { comida: 'Cena', recetas: [arroz], probar: true }).datos.validas[0];
  assert.equal(suya && suya.estado, 'valida');
  const proporcion = suya.gramos.pechuga_pollo / deFran.gramos.pechuga_pollo;
  assert.ok(proporcion > 0.75 && proporcion < 0.95, 'pollo: ' + suya.gramos.pechuga_pollo + ' frente a ' + deFran.gramos.pechuga_pollo);
});

test('pedir desde la app: encargo para pegar en un chat y respuesta pegada tal cual', () => {
  const gas = preparar();
  const pedido = gas.llamar('pedidoRecetas', { comida: 'Cena', cantidad: 2, idea: 'con salmón' }).datos;
  assert.ok(pedido.encargo.startsWith(pedido.sistema), 'empieza por las instrucciones');
  assert.ok(pedido.encargo.includes(pedido.mensaje));
  assert.match(pedido.encargo, /Responde solo con un bloque JSON/);
  assert.match(pedido.encargo, /"ingredientes_escalables"/);

  // Como lo pegaría alguien: con texto alrededor y en un bloque de código; una vale y otra no cuadra.
  const respuesta = 'Aquí tienes:\n```json\n' + JSON.stringify({ recetas: [TACOS, SOLO_POLLO] }, null, 2) + '\n```\n¡Que aproveche!';
  const r = gas.llamar('importarPropuestas', { comida: 'Cena', texto: respuesta });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.datos.nuevas, ['IA1']);
  assert.equal(r.datos.descartadas[0].nombre, 'Pollo a la plancha');
  assert.match(r.datos.correccion, /^Estas recetas no valen:\n- Pollo a la plancha: No cuadra/);
  assert.match(r.datos.correccion, /devuélveme solo el bloque JSON/);
  assert.equal(r.datos.propuestas.length, 1);
});

test('leerRespuestaIA_: acepta lista, objeto o una receta suelta; si no hay JSON, lo dice', () => {
  const c = preparar().contexto;
  assert.equal(c.leerRespuestaIA_(JSON.stringify([TACOS])).length, 1);
  assert.equal(c.leerRespuestaIA_('Claro: ' + JSON.stringify(TACOS)).length, 1);
  assert.equal(c.leerRespuestaIA_(JSON.stringify({ recetas: [TACOS, SOLO_POLLO] })).length, 2);
  assert.throws(() => c.leerRespuestaIA_('Lo siento, no puedo'), /No encuentro las recetas/);
  assert.throws(() => c.leerRespuestaIA_('{"recetas": [{"nombre": "a"'), /No encuentro las recetas/);
  assert.throws(() => c.leerRespuestaIA_('{"recetas": []}'), /No encuentro las recetas/);
});

test('aceptar, descartar y añadir el alimento que falta', () => {
  const gas = preparar();
  gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [TACOS, CON_NUEVO] });

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
  const gas = preparar();
  assert.match(gas.llamar('pedidoRecetas', { comida: 'Brunch' }).error, /Comida no válida/);
  const r = gas.llamar('pedidoRecetas', { comida: 'Merienda', cantidad: 2, idea: 'dulce' });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(JSON.parse(JSON.stringify(r.datos.pedido)), { comida: 'Merienda', cantidad: 2, idea: 'dulce' });
  assert.match(r.datos.sistema, /nunca valores nutricionales/);
  assert.match(r.datos.mensaje, /Propón 2 recetas de merienda/);
  assert.equal(r.datos.esquema.required[0], 'recetas');
});

test('importarPropuestas: probar no guarda; sin probar guarda como propuestas', () => {
  const gas = preparar();
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

test('importarPropuestas: guarda la que necesita un alimento nuevo con lo que falta, y no repite nombres', () => {
  const gas = preparar();
  const salmon = Object.assign({}, TACOS, { nombre: 'salmón al horno con costra de mostaza y miel, patatas asadas y salsa de eneldo ' });
  const r = gas.llamar('importarPropuestas', { comida: 'Cena', recetas: [TACOS, TACOS, salmon, CON_NUEVO] }).datos;
  assert.deepEqual(r.nuevas, ['IA1', 'IA2']);
  assert.deepEqual(r.descartadas.map(d => d.motivo), ['Ya hay una receta con ese nombre.', 'Ya hay una receta con ese nombre.']);
  const recetas = filas(gas, 'recetas').filter(f => f.origen === 'ia');
  assert.deepEqual(recetas.map(f => f.activa), ['propuesta', 'propuesta']);
  const conNuevo = r.propuestas.find(p => p.id === 'IA2');
  assert.equal(conNuevo.estado, 'falta_alimento');
  assert.equal(conNuevo.faltan[0].id, 'achiote');
  assert.ok(conNuevo.ingredientes.some(i => i.alimento === 'achiote' && i.nuevo && i.nombre === 'Pasta de achiote'));
  // Las propuestas no salen en la biblioteca ni en los planes hasta aceptarlas.
  assert.equal(gas.llamar('recetas').datos.some(x => x.origen === 'ia'), false);
});
