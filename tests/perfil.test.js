// Perfil y objetivos de cada persona (fase M4, docs/NUTRICION.md › «Objetivos según el perfil») y raciones
// de las recetas escaladas a sus objetivos.
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(globalThis, require('../web/motor/Util.js'), require('../web/motor/Nutricion.js'), require('../web/motor/Generador.js'));
const P = require('../web/motor/Perfil.js');
const Pr = require('../web/motor/Progreso.js');
const { SEMILLA } = require('../data/semilla.js');
const { cargarMotor } = require('./motor_navegador.js');

const HOY = '2026-10-18';
const alimentos = indexarAlimentos_(SEMILLA.alimentos);
const perfil = extra => P.validarPerfil_(Object.assign({ nombre: 'Prueba', sexo: 'hombre', nacimiento: '1996-10-18', altura_cm: 180,
  peso_kg: 80, trabajo: 'sentado', entreno: 'no', meta: 'perder' }, extra), HOY);
const kcalDeMacros = m => m.P * 4 + m.C * 4 + m.G * 9;

// ---------- Datos del perfil ----------

test('perfil: edad en años cumplidos', () => {
  assert.equal(P.edad_('1996-10-18', HOY), 30);
  assert.equal(P.edad_('1996-10-19', HOY), 29);
  assert.equal(P.edad_('2000-02-29', '2026-02-28'), 25);
});

test('perfil: valida y limpia los datos', () => {
  const p = perfil({ nombre: '  Ana ', altura_cm: '165', peso_kg: '58,46' });
  assert.equal(p.nombre, 'Ana');
  assert.equal(p.altura_cm, 165);
  assert.equal(p.peso_kg, 58.5);
  assert.throws(() => perfil({ nacimiento: '2010-01-01' }), /mayores de 18/);
  assert.throws(() => perfil({ altura_cm: 90 }), /altura/);
  assert.throws(() => perfil({ peso_kg: '' }), /peso/);
  assert.throws(() => perfil({ sexo: 'otro' }), /hombre o mujer/);
  assert.throws(() => perfil({ trabajo: 'x' }), /trabajo/);
  assert.throws(() => perfil({ entreno: 'x' }), /entrenas/);
  assert.throws(() => perfil({ meta: 'x' }), /objetivo/);
});

// ---------- Cálculo ----------

test('objetivos: Mifflin-St Jeor, actividad y déficit del 20 % al perder grasa', () => {
  // TMB = 10·80 + 6,25·180 − 5·30 + 5 = 1.780; sentado y sin entrenar ×1,2 = 2.136; −20 % → 1.709 → 1.710.
  const o = P.calcularObjetivos_(perfil(), HOY);
  assert.equal(o.tmb, 1780);
  assert.equal(o.gasto, 2136);
  assert.equal(o.kcal, 1710);
  assert.equal(o.proteina_g_kg, 1.8);
  assert.deepEqual(o.dia, { kcal: 1710, P: 144, C: 176, G: 48 }); // grasa 25 %, hidratos el resto
  assert.ok(Math.abs(kcalDeMacros(o.dia) - o.kcal) <= 4);
  assert.equal(o.aviso, null);
});

test('objetivos: mujer que entrena y quiere ganar músculo (+10 %, más proteína)', () => {
  // TMB = 600 + 1.031,25 − 125 − 161 = 1.345,25; sentada + 3–4 días ×1,5 = 2.017,9; +10 % → 2.220.
  const o = P.calcularObjetivos_(perfil({ sexo: 'mujer', nacimiento: '2001-10-18', altura_cm: 165, peso_kg: 60, entreno: '3_4', meta: 'ganar' }), HOY);
  assert.equal(o.kcal, 2220);
  assert.equal(o.proteina_g_kg, 2);
  assert.equal(o.dia.P, 120);
  assert.equal(o.kcal_minimas, 1200);
});

test('objetivos: mantener no cambia las kcal; el trabajo y el entrenamiento suben el gasto', () => {
  const sentado = P.calcularObjetivos_(perfil({ meta: 'mantener' }), HOY);
  assert.equal(sentado.kcal, 2140);
  assert.equal(sentado.proteina_g_kg, 1.4);
  const fisico = P.calcularObjetivos_(perfil({ meta: 'mantener', trabajo: 'fisico', entreno: '5_mas' }), HOY);
  assert.equal(fisico.gasto, Math.round(1780 * 1.9));
  assert.equal(fisico.proteina_g_kg, 1.8);
});

test('objetivos: topes de −500 / +300 kcal y de 2,2 g/kg de proteína', () => {
  const grande = perfil({ peso_kg: 100, altura_cm: 190, trabajo: 'fisico', entreno: '5_mas' });
  const perder = P.calcularObjetivos_(grande, HOY);
  assert.equal(perder.kcal, Math.round((perder.gasto - 500) / 10) * 10);
  assert.equal(perder.proteina_g_kg, 2.2);
  const ganar = P.calcularObjetivos_(Object.assign({}, grande, { meta: 'ganar' }), HOY);
  assert.ok(Math.abs(ganar.kcal - (ganar.gasto + 300)) <= 5);
});

test('objetivos: nunca por debajo del mínimo (1.200 mujeres, 1.500 hombres o el que ya tenga)', () => {
  const pequena = perfil({ sexo: 'mujer', nacimiento: '1966-01-01', altura_cm: 150, peso_kg: 45 });
  const o = P.calcularObjetivos_(pequena, HOY);
  assert.equal(o.kcal, 1200);
  assert.match(o.aviso, /mínimo de 1\.200 kcal/);
  assert.ok(o.dia.C >= 100, 'hidratos al menos 100 g');
  assert.equal(P.calcularObjetivos_(pequena, HOY, 1400).kcal, 1400);
  const hombre = P.calcularObjetivos_(perfil({ nacimiento: '1956-01-01', altura_cm: 160, peso_kg: 55 }), HOY);
  assert.equal(hombre.kcal, 1500);
});

test('objetivos: con IMC > 30 la proteína va sobre el peso de un IMC de 25', () => {
  assert.equal(P.pesoReferencia_(120, 175), 76.6);
  assert.equal(P.pesoReferencia_(80, 175), 80);
  const o = P.calcularObjetivos_(perfil({ peso_kg: 120, altura_cm: 175 }), HOY);
  assert.equal(o.peso_referencia, 76.6);
  assert.equal(o.dia.P, Math.round(1.8 * 76.6));
});

test('objetivos: ganar músculo sin entrenar lleva aviso', () => {
  assert.match(P.calcularObjetivos_(perfil({ meta: 'ganar' }), HOY).aviso, /entrenar fuerza/);
});

test('reparto: cada macro entre las comidas como en el plan de Fran', () => {
  const o = P.calcularObjetivos_(perfil({ entreno: '3_4' }), HOY);
  ['P', 'C', 'G'].forEach(n => {
    const suma = COMIDAS.reduce((s, c) => s + o.comidas[c][n], 0);
    assert.ok(Math.abs(suma - o.dia[n]) <= 0.2, n);
  });
  const ref = REFERENCIA_COMIDAS;
  const parte = (c, n) => ref[c][n] / COMIDAS.reduce((s, x) => s + ref[x][n], 0);
  assert.ok(Math.abs(o.comidas.Merienda.P / o.dia.P - parte('Merienda', 'P')) < 0.002);
  COMIDAS.forEach(c => assert.equal(o.comidas[c].kcal, Math.round(kcalDeMacros(o.comidas[c]))));
});

// ---------- Raciones ----------

test('raciones: con los objetivos de Fran la receta no cambia', () => {
  SEMILLA.recetas.forEach(r => assert.equal(racionesReceta_(r, SEMILLA.objetivos[r.comida], alimentos), r));
});

test('raciones: cada ingrediente escala con el macro de su grupo y las piezas siguen enteras', () => {
  const a1 = SEMILLA.recetas.find(r => r.id === 'A1'); // pollo al curry: pechuga, arroz, aceite + fijos
  const ref = REFERENCIA_COMIDAS.Almuerzo;
  const doble = racionesReceta_(a1, { kcal: ref.kcal * 2, P: ref.P * 1.5, C: ref.C * 2, G: ref.G }, alimentos);
  const escalable = id => doble.ingredientes_escalables.find(e => e.alimento === id);
  assert.deepEqual([escalable('pechuga_pollo').min_g, escalable('pechuga_pollo').max_g], [180, 300]);
  assert.deepEqual([escalable('arroz_basmati').min_g, escalable('arroz_basmati').max_g], [100, 180]);
  assert.deepEqual([escalable('aceite_ml').min_g, escalable('aceite_ml').max_g], [3, 15]);
  assert.equal(doble.ingredientes_fijos.find(f => f.alimento === 'cebolla').gramos, 120); // verdura: con las kcal
  const c4 = SEMILLA.recetas.find(r => r.id === 'C4'); // tortilla: huevos por piezas
  const huevo = racionesReceta_(c4, { kcal: 300, P: 25, C: 25, G: 10 }, alimentos).ingredientes_escalables.find(e => e.alimento === 'huevo');
  assert.equal(huevo.min_g % 53, 0);
  assert.equal(huevo.max_g % 53, 0);
  assert.ok(huevo.min_g >= 53);
});

test('raciones: los platos se ajustan a objetivos muy distintos de los de Fran', () => {
  // Mujer que quiere perder grasa (1.200 kcal) y hombre que entrena y pierde grasa (2.700 kcal).
  [perfil({ sexo: 'mujer', nacimiento: '1966-01-01', altura_cm: 150, peso_kg: 45 }), perfil({ peso_kg: 95, altura_cm: 188, entreno: '5_mas' })]
    .forEach(p => {
      const o = P.calcularObjetivos_(p, HOY);
      const plan = generarPlan_({ inicio: '2026-10-19', recetas: SEMILLA.recetas, alimentos, objetivos: o.comidas,
        tolerancias: P.TOLERANCIAS_INICIALES, config: {}, azar: azarConSemilla_(1) });
      assert.ok(plan.dias.filter(d => d.revisar).length <= 2, `${o.kcal} kcal: ${plan.dias.filter(d => d.revisar).length} días a revisar`);
    });
});

// ---------- Ajuste quincenal según el objetivo ----------

const datos = extra => Object.assign({ ritmo: { ritmo_pct: -0.6 }, adherencia: 90, pesajes: 10, objetivos: SEMILLA.objetivos,
  kcalMinimas: 1400, peso: 80 }, extra);
const deltas = p => p.opciones.map(o => o.delta);

test('ajuste al mantener: estable → igual; bajando → +120; subiendo → −120', () => {
  const estable = Pr.proponerAjuste_(datos({ meta: 'mantener', ritmo: { ritmo_pct: -0.1 }, peso: 70 }));
  assert.equal(estable.motivo, 'en_ritmo');
  assert.deepEqual(deltas(estable), [0, -120]);
  const bajando = Pr.proponerAjuste_(datos({ meta: 'mantener', ritmo: { ritmo_pct: -0.4 } }));
  assert.equal(bajando.motivo, 'bajando');
  assert.deepEqual(deltas(bajando), [120, 0]);
  const subiendo = Pr.proponerAjuste_(datos({ meta: 'mantener', ritmo: { ritmo_pct: 0.4 }, peso: 70 }));
  assert.equal(subiendo.motivo, 'subiendo');
  assert.deepEqual(deltas(subiendo), [-120, 0]);
});

test('ajuste al ganar músculo: lento → +120; en ventana → igual (alternativa +120); rápido → −120', () => {
  const lento = Pr.proponerAjuste_(datos({ meta: 'ganar', ritmo: { ritmo_pct: 0.05 } }));
  assert.equal(lento.motivo, 'ganar_lento');
  assert.deepEqual(deltas(lento), [120, 0]);
  assert.equal(lento.opciones[0].P, lento.opciones[1].P, 'la proteína no cambia');
  const bien = Pr.proponerAjuste_(datos({ meta: 'ganar', ritmo: { ritmo_pct: 0.3 } }));
  assert.equal(bien.motivo, 'en_ritmo');
  assert.deepEqual(deltas(bien), [0, 120]);
  assert.match(bien.opciones[1].titulo, /Acelerar ganancia/);
  const rapido = Pr.proponerAjuste_(datos({ meta: 'ganar', ritmo: { ritmo_pct: 0.8 }, proteinaMinima: 1.2 }));
  assert.equal(rapido.motivo, 'ganar_rapido');
  assert.deepEqual(deltas(rapido), [-120, 0]);
  assert.equal(rapido.opciones[0].bloqueada, null);
});

test('ajuste: perder grasa sigue la regla de siempre; la proteína mínima depende del objetivo', () => {
  assert.equal(Pr.proponerAjuste_(datos({ meta: 'perder', ritmo: { ritmo_pct: -0.1 } })).motivo, 'lento');
  assert.equal(P.proteinaMinimaGKg_('perder'), 1.6);
  assert.equal(P.proteinaMinimaGKg_(undefined), 1.6);
  assert.equal(P.proteinaMinimaGKg_('ganar'), 1.2);
  // 131,8 g de proteína son 1,46 g/kg con 90 kg: bloquea bajar al perder, no al mantener.
  assert.ok(Pr.proponerAjuste_(datos({ peso: 90, proteinaMinima: 1.6 })).opciones[1].bloqueada);
  assert.equal(Pr.proponerAjuste_(datos({ meta: 'mantener', ritmo: { ritmo_pct: 0.4 }, peso: 90, proteinaMinima: 1.2 })).opciones[0].bloqueada, null);
});

// ---------- Acción guardarPerfil ----------

const COMUNES = () => ({ alimentos: SEMILLA.alimentos, recetas: SEMILLA.recetas.map(r => Object.assign({}, r, {
  ingredientes_fijos: JSON.stringify(r.ingredientes_fijos), ingredientes_escalables: JSON.stringify(r.ingredientes_escalables) })) });
const DATOS_ALTA = { nombre: 'Ana', sexo: 'mujer', nacimiento: '1997-02-01', altura_cm: 165, peso_kg: 62, trabajo: 'de_pie', entreno: '3_4', meta: 'perder' };

test('guardarPerfil: alta de una persona nueva, con su configuración, su peso y su primer plan mañana', () => {
  const m = cargarMotor('2026-10-21T10:00:00+02:00', COMUNES()); // miércoles
  const probar = m.llamar('guardarPerfil', { perfil: DATOS_ALTA, probar: true });
  assert.equal(probar.ok, true, probar.error);
  assert.equal(m.llamar('config').datos.perfil, undefined, 'probar no guarda nada');

  const r = m.llamar('guardarPerfil', { perfil: DATOS_ALTA });
  assert.equal(r.ok, true, r.error);
  const config = r.datos.config;
  assert.deepEqual(config.objetivo_cena, r.datos.calculo.comidas.Cena);
  assert.equal(config.perfil.meta, 'perder');
  assert.equal(config.kcal_minimas, 1200);
  assert.deepEqual(config.tolerancias, P.TOLERANCIAS_INICIALES);
  assert.equal(config.comida_libre_semanal, true);
  assert.equal(JSON.stringify(m.contexto.leerTabla_('pesos').map(f => [f.fecha, Number(f.peso_kg)])), '[["2026-10-21",62]]');

  const plan = m.llamar('generarPlan');
  assert.equal(plan.ok, true, plan.error);
  assert.equal(plan.datos.inicio, '2026-10-22', 'el primer plan empieza mañana');
  assert.ok(plan.datos.dias.filter(d => d.revisar).length <= 2);
});

test('guardarPerfil: cambiar de objetivo recalcula los objetivos sin tocar el resto de la configuración', () => {
  const m = cargarMotor('2026-10-21T10:00:00+02:00', Object.assign(COMUNES(), { config: [
    { clave: 'kcal_minimas', valor: '1400' }, { clave: 'comida_libre_semanal', valor: 'false' },
    { clave: 'objetivo_desayuno', valor: JSON.stringify(SEMILLA.objetivos.Desayuno) },
  ] }));
  const perder = m.llamar('guardarPerfil', { perfil: Object.assign({}, DATOS_ALTA, { sexo: 'hombre', altura_cm: 178, peso_kg: 80 }) }).datos;
  const ganar = m.llamar('guardarPerfil', { perfil: Object.assign({}, perder.perfil, { meta: 'ganar', peso_kg: 78 }) }).datos;
  assert.ok(ganar.calculo.kcal > perder.calculo.kcal + 500);
  assert.equal(ganar.config.kcal_minimas, 1400, 'se respeta el mínimo que ya tenía');
  assert.equal(ganar.config.comida_libre_semanal, false);
  assert.deepEqual(ganar.config.objetivo_desayuno, ganar.calculo.comidas.Desayuno);
  assert.equal(m.contexto.leerTabla_('pesos').length, 1, 'un pesaje por día');
  assert.equal(Number(m.contexto.leerTabla_('pesos')[0].peso_kg), 78);
  assert.match(m.llamar('guardarPerfil', { perfil: Object.assign({}, DATOS_ALTA, { meta: 'x' }) }).error, /objetivo/);
});
