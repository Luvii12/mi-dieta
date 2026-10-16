const test = require('node:test');
const assert = require('node:assert/strict');
// En Apps Script todos los archivos comparten ámbito global; en Node se imita así.
Object.assign(globalThis, require('../apps-script/Nutricion.js'));
const G = require('../apps-script/Generador.js');
const { SEMILLA } = require('../apps-script/Semilla.js');

const alimentos = indexarAlimentos_(SEMILLA.alimentos);
const TOLERANCIAS = { dia: { kcal: 5, P: 5, C: 10, G: 10, P_margen_g: 10 }, comida: { kcal: 12, P: 15, C: 15, G: 20 } };

function plan(semilla, extra = {}) {
  return G.generarPlan_(Object.assign({
    inicio: '2026-10-19',
    recetas: SEMILLA.recetas,
    alimentos,
    objetivos: SEMILLA.objetivos,
    tolerancias: TOLERANCIAS,
    config: { max_rep_desayuno: 4, max_rep_merienda: 4 },
    azar: G.azarConSemilla_(semilla),
  }, extra));
}

const usosDe = (p, comida) => {
  const usos = {};
  p.dias.forEach(d => d.comidas.filter(c => c.comida === comida).forEach(c => { usos[c.receta_id] = (usos[c.receta_id] || 0) + 1; }));
  return usos;
};

// ---------- Fechas ----------

test('fechas: el plan empieza el lunes siguiente', () => {
  assert.equal(G.fechaInicioPlan_('2026-10-16'), '2026-10-19'); // viernes → lunes
  assert.equal(G.fechaInicioPlan_('2026-10-18'), '2026-10-19'); // domingo → lunes
  assert.equal(G.fechaInicioPlan_('2026-10-19'), '2026-10-26'); // lunes → el siguiente
});

test('fechas: con un plan activo, empieza el día después de que acabe', () => {
  assert.equal(G.fechaInicioPlan_('2026-10-16', '2026-11-01'), '2026-11-02');
  assert.equal(G.fechaInicioPlan_('2026-10-16', '2026-10-11'), '2026-10-19'); // plan ya acabado
});

test('fechas: sumar días cruza meses y el cambio de hora', () => {
  assert.equal(G.sumarDias_('2026-10-19', 13), '2026-11-01');
  assert.equal(G.diaSemana_('2026-10-19'), 0);
  assert.equal(G.diaSemana_('2026-10-25'), 6);
});

// ---------- Plan generado ----------

test('plan: 14 días seguidos con 4 comidas, de lunes a domingo', () => {
  const p = plan(1);
  assert.equal(p.dias.length, 14);
  assert.equal(p.inicio, '2026-10-19');
  assert.equal(p.fin, '2026-11-01');
  p.dias.forEach((d, i) => {
    assert.equal(d.fecha, G.sumarDias_('2026-10-19', i));
    assert.deepEqual(d.comidas.map(c => c.comida), ['Desayuno', 'Almuerzo', 'Merienda', 'Cena']);
  });
});

test('plan: todos los días cumplen la tolerancia (50 semillas)', () => {
  for (let s = 1; s <= 50; s++) {
    const p = plan(s);
    p.dias.forEach(d => {
      assert.equal(d.revisar, false, `semilla ${s} ${d.fecha}`);
      assert.equal(evaluarDia_(d.macros, p.objetivoDia, TOLERANCIAS.dia).ok, true);
    });
  }
});

test('plan: los macros del día son la suma de sus comidas', () => {
  const d = plan(3).dias[0];
  const suma = sumarMacros_(d.comidas.map(c => c.macros));
  ['kcal', 'P', 'C', 'G'].forEach(n => assert.ok(Math.abs(suma[n] - d.macros[n]) < 1e-9));
});

test('plan: almuerzos y cenas como mucho 2 veces y nunca en días seguidos', () => {
  for (let s = 1; s <= 30; s++) {
    const p = plan(s);
    ['Almuerzo', 'Cena'].forEach(comida => {
      Object.values(usosDe(p, comida)).forEach(n => assert.ok(n <= 2, `semilla ${s} ${comida}`));
      for (let i = 1; i < 14; i++) {
        const hoy = p.dias[i].comidas.find(c => c.comida === comida).receta_id;
        const ayer = p.dias[i - 1].comidas.find(c => c.comida === comida).receta_id;
        assert.notEqual(hoy, ayer, `semilla ${s} ${comida} ${p.dias[i].fecha}`);
      }
    });
  }
});

test('plan: desayunos y meriendas como mucho 4 veces', () => {
  for (let s = 1; s <= 30; s++) {
    const p = plan(s);
    ['Desayuno', 'Merienda'].forEach(comida => {
      Object.values(usosDe(p, comida)).forEach(n => assert.ok(n <= 4, `semilla ${s} ${comida}`));
    });
  }
});

test('plan: la misma semilla da el mismo plan', () => {
  assert.deepEqual(plan(42), plan(42));
});

// ---------- Exclusiones y valoraciones ----------

test('exclusiones: ningún plato con un alimento excluido o alérgeno', () => {
  const preferencias = [{ tipo: 'excluido', alimento_id: 'salmon' }, { tipo: 'alergia', alimento_id: 'langostinos' }];
  const conProhibidos = new Set(SEMILLA.recetas
    .filter(r => r.ingredientes_fijos.concat(r.ingredientes_escalables).some(i => ['salmon', 'langostinos'].includes(i.alimento)))
    .map(r => r.id));
  assert.ok(conProhibidos.size >= 2); // A3, C1, A5
  for (let s = 1; s <= 20; s++) {
    const p = plan(s, { preferencias });
    p.dias.forEach(d => d.comidas.forEach(c => {
      assert.ok(!conProhibidos.has(c.receta_id), `${c.receta_id}`);
      assert.ok(!('salmon' in c.gramos) && !('langostinos' in c.gramos));
    }));
    assert.ok(p.descartadas.some(x => x.motivo === 'contiene salmon'));
  }
});

test('exclusiones: un favorito no excluye nada', () => {
  const p = plan(1, { preferencias: [{ tipo: 'favorito', alimento_id: 'salmon' }] });
  assert.equal(p.descartadas.length, 0);
});

test('valoraciones: «No lo repetiría» no sale nunca', () => {
  const valoraciones = [{ receta_id: 'D1', valor: 'no_repetir', fecha: '2026-10-10' }];
  for (let s = 1; s <= 20; s++) {
    plan(s, { valoraciones }).dias.forEach(d => assert.ok(d.comidas.every(c => c.receta_id !== 'D1')));
  }
});

test('valoraciones: cuenta la última; «Me encanta» sale más que «Normal»', () => {
  const v = G.ultimasValoraciones_([
    { receta_id: 'D1', valor: 'no_repetir', fecha: '2026-10-01' },
    { receta_id: 'D1', valor: 'me_encanta', fecha: '2026-10-12' },
  ]);
  assert.equal(v.D1, 'me_encanta');

  const valoraciones = [{ receta_id: 'M2', valor: 'me_encanta', fecha: '2026-10-12' }];
  let favorita = 0;
  let otra = 0;
  for (let s = 1; s <= 40; s++) {
    const usos = usosDe(plan(s, { valoraciones }), 'Merienda');
    favorita += usos.M2 || 0;
    otra += usos.M3 || 0;
  }
  assert.ok(favorita > otra, `M2 ${favorita} vs M3 ${otra}`);
});

test('plan anterior: sus recetas salen menos', () => {
  let anteriores = 0;
  let resto = 0;
  for (let s = 1; s <= 40; s++) {
    const usos = usosDe(plan(s, { recetasPlanAnterior: ['D1', 'D2'] }), 'Desayuno');
    anteriores += (usos.D1 || 0) + (usos.D2 || 0);
    resto += (usos.D3 || 0) + (usos.D4 || 0);
  }
  assert.ok(anteriores < resto, `${anteriores} vs ${resto}`);
});

test('pocas recetas: avisa en vez de generar un plan imposible', () => {
  const soloUnaCena = SEMILLA.recetas.filter(r => r.comida !== 'Cena' || r.id === 'C1');
  assert.throws(() => plan(1, { recetas: soloUnaCena }), /pocas recetas de cena/);
});

test('reglas: con recetas de sobra, almuerzos y cenas no se repiten', () => {
  assert.deepEqual(G.reglasRepeticion_('Almuerzo', 14, {}), { max: 1, consecutivos: false });
  assert.deepEqual(G.reglasRepeticion_('Almuerzo', 7, {}), { max: 2, consecutivos: false });
  assert.deepEqual(G.reglasRepeticion_('Cena', 5, {}), { max: 3, consecutivos: false });
  assert.deepEqual(G.reglasRepeticion_('Desayuno', 4, { max_rep_desayuno: 4 }), { max: 4, consecutivos: true });
  assert.deepEqual(G.reglasRepeticion_('Merienda', 2, { max_rep_merienda: 4 }), { max: 7, consecutivos: true });
});

// ---------- Cambiar plato ----------

test('alternativasComida_: suma el día con la nueva receta y ordena las que cuadran primero', () => {
  const p = plan(3);
  const dia = p.dias[0];
  const tol = TOLERANCIAS.dia;
  const alt = G.alternativasComida_(dia, 'Merienda', SEMILLA.recetas, { objetivos: SEMILLA.objetivos, alimentos }, p.objetivoDia, tol);
  const actual = dia.comidas.find(c => c.comida === 'Merienda');
  assert.ok(alt.length > 0);
  assert.ok(alt.every(a => a.receta_id !== actual.receta_id));
  const otras = sumarMacros_(dia.comidas.filter(c => c.comida !== 'Merienda').map(c => c.macros));
  alt.forEach(a => {
    assert.ok(Math.abs(a.macrosDia.kcal - (otras.kcal + a.macros.kcal)) < 1e-9);
    assert.equal(a.diaOk, evaluarDia_(a.macrosDia, p.objetivoDia, tol).ok);
  });
  for (let i = 1; i < alt.length; i++) {
    assert.ok(Number(alt[i - 1].diaOk) > Number(alt[i].diaOk) ||
      (alt[i - 1].diaOk === alt[i].diaOk && alt[i - 1].puntuacion <= alt[i].puntuacion));
  }
  assert.throws(() => G.alternativasComida_({ comidas: [] }, 'Cena', SEMILLA.recetas, { objetivos: SEMILLA.objetivos, alimentos }, p.objetivoDia, tol), /no tiene cena/);
});
