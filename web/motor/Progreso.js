// Progreso y ajuste quincenal (docs/NUTRICION.md › «Ajuste cada 2 semanas»). Funciones puras.
// Pesos: [{fecha: 'AAAA-MM-DD', peso_kg}]. Comidas: filas de `plan_comidas`.

const AJUSTE_KCAL = 120;          // tamaño del ajuste propuesto (la regla dice 100–150)
const ADHERENCIA_MINIMA = 80;     // % por debajo del cual no se tocan las calorías
const PESAJES_MINIMOS = 4;        // pesajes en el bloque para poder proponer
const PROTEINA_MINIMA_G_KG = 1.6; // límite de seguridad (sin perfil; con perfil, según el objetivo)
const RITMO_MANTENER = 0.25;      // % semanal que se tolera arriba o abajo al mantener
const GANAR_MINIMO = 0.1;         // ganar músculo: ventana de % semanal
const GANAR_MAXIMO = 0.5;

const redondear_ = (n, decimales) => Math.round(n * Math.pow(10, decimales)) / Math.pow(10, decimales);

// Días entre dos fechas ISO (b − a).
function diasEntre_(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

// Filas de `pesos` → [{fecha, peso}] ordenadas, una por fecha (la última escrita gana) y sin valores vacíos.
function normalizarPesos_(filas) {
  const porFecha = {};
  filas.forEach(f => {
    const peso = Number(f.peso_kg);
    if (f.fecha && peso > 0) porFecha[f.fecha] = peso;
  });
  return Object.keys(porFecha).sort().map(fecha => ({ fecha: fecha, peso: porFecha[fecha] }));
}

// Media de los pesajes entre dos fechas (incluidas) y su fecha central en días desde `desde`.
// null si no hay ninguno.
function mediaVentana_(pesos, desde, hasta) {
  const dentro = pesos.filter(p => p.fecha >= desde && p.fecha <= hasta);
  if (!dentro.length) return null;
  const suma = dentro.reduce((s, p) => s + p.peso, 0);
  const centro = dentro.reduce((s, p) => s + diasEntre_(desde, p.fecha), 0) / dentro.length;
  return { media: suma / dentro.length, n: dentro.length, desde: desde, centro: centro };
}

// Media móvil de 7 días en cada pesaje: media de los pesajes de ese día y los 6 anteriores.
function mediaMovil_(pesos) {
  return pesos.map(p => {
    const v = mediaVentana_(pesos, sumarDias_(p.fecha, -6), p.fecha);
    return { fecha: p.fecha, peso: p.peso, media: redondear_(v.media, 2) };
  });
}

// Ritmo de cambio de peso: media de los últimos 7 días frente a la de 7 días, 14 días antes. Si no hay
// pesajes entonces (p. ej. en el primer bloque), la primera semana con pesajes desde esa fecha.
// Devuelve {cambio_kg, ritmo_pct (por semana, negativo = pierdes), semanas} o null si no se puede comparar.
function ritmoSemanal_(pesos, hoy) {
  const reciente = mediaVentana_(pesos, sumarDias_(hoy, -6), hoy);
  const primera = pesos.find(p => p.fecha >= sumarDias_(hoy, -20) && p.fecha < sumarDias_(hoy, -6));
  if (!reciente || !primera) return null;
  const finAnterior = [sumarDias_(primera.fecha, 6), sumarDias_(hoy, -7)].sort()[0];
  const anterior = mediaVentana_(pesos, primera.fecha, finAnterior);
  const dias = diasEntre_(anterior.desde, reciente.desde) + reciente.centro - anterior.centro;
  if (dias < 5) return null;
  const semanas = dias / 7;
  const cambio = reciente.media - anterior.media;
  return { cambio_kg: redondear_(cambio, 2), ritmo_pct: redondear_(cambio / semanas / anterior.media * 100, 2), semanas: redondear_(semanas, 1) };
}

// Cambio de la media de 7 días en la última semana (para la pantalla Progreso). null sin datos.
function cambioSemana_(pesos, hoy) {
  const ahora = mediaVentana_(pesos, sumarDias_(hoy, -6), hoy);
  const antes = mediaVentana_(pesos, sumarDias_(hoy, -13), sumarDias_(hoy, -7));
  return ahora && antes ? redondear_(ahora.media - antes.media, 2) : null;
}

// Adherencia de un plan hasta hoy: comidas hechas / comidas planificadas. Cuentan los días pasados y,
// de hoy, solo las comidas ya marcadas. Con `libreSemanal`, la primera comida libre de cada semana
// del plan no cuenta (ni a favor ni en contra); el resto de comidas libres cuentan como no hechas. Las
// marcadas como no hechas («saltada») cuentan en contra, pero no como «sin marcar».
function adherencia_(comidas, inicio, hoy, libreSemanal) {
  const contadas = comidas.filter(c => c.fecha < hoy || (c.fecha === hoy && c.hecha !== 'no' && c.hecha !== ''))
    .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  const semanasConLibre = {};
  let planificadas = 0;
  let hechas = 0;
  let sinMarcar = 0;
  contadas.forEach(c => {
    if (c.hecha === 'libre' && libreSemanal) {
      const semana = Math.floor(diasEntre_(inicio, c.fecha) / 7);
      if (!semanasConLibre[semana]) {
        semanasConLibre[semana] = true;
        return;
      }
    }
    planificadas++;
    if (c.hecha === 'si') hechas++;
    if (['si', 'libre', 'saltada'].indexOf(c.hecha) < 0) sinMarcar++;
  });
  return { hechas: hechas, planificadas: planificadas, sin_marcar: sinMarcar,
    pct: planificadas ? Math.round(hechas / planificadas * 100) : null };
}

// Días seguidos, hasta hoy, con todas las comidas hechas (o libres). Hoy cuenta solo si ya está completo.
function racha_(comidas, hoy) {
  const porFecha = {};
  comidas.forEach(c => { (porFecha[c.fecha] = porFecha[c.fecha] || []).push(c); });
  const completo = fecha => (porFecha[fecha] || []).length > 0 && porFecha[fecha].every(c => c.hecha === 'si' || c.hecha === 'libre');
  let fecha = completo(hoy) ? hoy : sumarDias_(hoy, -1);
  let dias = 0;
  while (completo(fecha)) {
    dias++;
    fecha = sumarDias_(fecha, -1);
  }
  return dias;
}

// Objetivos por comida con `deltaKcal` repartido en proporción a las kcal de cada comida y, dentro de
// cada comida, entre carbohidratos y grasa según su peso en kcal. La proteína no se toca.
function ajustarObjetivos_(objetivos, deltaKcal) {
  const comidas = Object.keys(objetivos);
  const total = comidas.reduce((s, c) => s + objetivos[c].kcal, 0);
  const nuevos = {};
  comidas.forEach(c => {
    const o = objetivos[c];
    const dk = deltaKcal * o.kcal / total;
    const kcalC = o.C * 4;
    const kcalG = o.G * 9;
    const parteC = kcalC + kcalG > 0 ? kcalC / (kcalC + kcalG) : 0.5;
    nuevos[c] = {
      kcal: Math.round(o.kcal + dk),
      P: o.P,
      C: redondear_(Math.max(0, o.C + dk * parteC / 4), 1),
      G: redondear_(Math.max(0, o.G + dk * (1 - parteC) / 9), 1),
    };
  });
  return nuevos;
}

// Regla de ajuste quincenal según el objetivo de la persona (datos.meta; sin perfil, «perder»).
// datos: {ritmo (de ritmoSemanal_ o null), adherencia (%), pesajes (en el bloque), objetivos (por comida),
// kcalMinimas, peso (último, kg; con obesidad, el de referencia de pesoReferencia_), proteinaMinima (g/kg), meta}.
// Devuelve {motivo, explicacion, ritmo_pct, adherencia_pct, opciones: [2 opciones]}. Cada opción:
// {delta, kcal, P, C, G, titulo, nota, recomendada, bloqueada (texto o null)}.
function proponerAjuste_(datos) {
  const meta = datos.meta || 'perder';
  const ritmo = datos.ritmo ? datos.ritmo.ritmo_pct : null;
  const perdida = ritmo === null ? null : -ritmo;
  const proteinaMinima = datos.proteinaMinima || PROTEINA_MINIMA_G_KG;
  let delta = 0;
  let motivo;
  let explicacion;
  if (datos.pesajes < PESAJES_MINIMOS || perdida === null) {
    motivo = 'sin_datos';
    explicacion = datos.pesajes < PESAJES_MINIMOS
      ? `Solo hay ${datos.pesajes} pesaje${datos.pesajes === 1 ? '' : 's'} en el bloque (hacen falta ${PESAJES_MINIMOS}). Sin datos no se ajustan las calorías.`
      : 'Los pesajes no abarcan dos semanas, así que todavía no se puede medir el ritmo. Se mantienen las calorías.';
  } else if (datos.adherencia !== null && datos.adherencia < ADHERENCIA_MINIMA) {
    motivo = 'adherencia';
    explicacion = `Has seguido el ${datos.adherencia} % de las comidas. Por debajo del ${ADHERENCIA_MINIMA} % no se tocan las calorías: mejor platos más sencillos o una comida libre semanal.`;
  } else if (meta === 'mantener') {
    if (perdida > RITMO_MANTENER) {
      motivo = 'bajando';
      delta = AJUSTE_KCAL;
      explicacion = `Pierdes un ${fmt_(perdida)} % de tu peso por semana y tu objetivo es mantenerlo. Subir ${AJUSTE_KCAL} kcal frena la bajada.`;
    } else if (ritmo > RITMO_MANTENER) {
      motivo = 'subiendo';
      delta = -AJUSTE_KCAL;
      explicacion = `Ganas un ${fmt_(ritmo)} % de tu peso por semana y tu objetivo es mantenerlo. Bajar ${AJUSTE_KCAL} kcal (de carbohidratos y grasa) frena la subida.`;
    } else {
      motivo = 'en_ritmo';
      explicacion = `Tu peso se mantiene estable (${fmt_(ritmo)} % semanal). No hace falta cambiar las calorías.`;
    }
  } else if (meta === 'ganar') {
    if (ritmo < GANAR_MINIMO) {
      motivo = 'ganar_lento';
      delta = AJUSTE_KCAL;
      explicacion = `Tu peso cambia un ${fmt_(ritmo)} % semanal, por debajo del ${fmt_(GANAR_MINIMO)} % que hace falta para ganar músculo. Subir ${AJUSTE_KCAL} kcal (de carbohidratos y grasa) da el empujón.`;
    } else if (ritmo > GANAR_MAXIMO) {
      motivo = 'ganar_rapido';
      delta = -AJUSTE_KCAL;
      explicacion = `Ganas un ${fmt_(ritmo)} % de tu peso por semana, más del ${fmt_(GANAR_MAXIMO)} % recomendado: el resto sería grasa. Bajar ${AJUSTE_KCAL} kcal lo modera.`;
    } else {
      motivo = 'en_ritmo';
      explicacion = `Ganas un ${fmt_(ritmo)} % semanal, dentro de la ventana para ganar músculo (${fmt_(GANAR_MINIMO)}–${fmt_(GANAR_MAXIMO)} %). No hace falta cambiar las calorías.`;
    }
  } else if (perdida > 1) {
    motivo = 'rapido';
    delta = AJUSTE_KCAL;
    explicacion = `Pierdes un ${fmt_(perdida)} % de tu peso por semana, más del 1 % recomendado. Subir un poco las calorías protege el músculo y la energía.`;
  } else if (perdida < 0.25) {
    motivo = 'lento';
    delta = -AJUSTE_KCAL;
    explicacion = `Tu ritmo es del ${fmt_(ritmo)} % semanal, por debajo del 0,25 %. Bajar ${AJUSTE_KCAL} kcal (de carbohidratos y grasa, nunca de proteína) reactiva la pérdida.`;
  } else {
    motivo = 'en_ritmo';
    explicacion = `Tu ritmo semanal (${fmt_(ritmo)} %) está dentro de la ventana saludable (0,25–1 %). No hace falta cambiar las calorías.`;
  }

  const opcion = (d, recomendada) => {
    const nuevos = d ? ajustarObjetivos_(datos.objetivos, d) : datos.objetivos;
    const m = sumarMacros_(Object.keys(nuevos).map(c => nuevos[c]));
    let titulo = 'Mantener calorías actuales';
    let nota = 'Mismos objetivos que este bloque.';
    if (d < 0) {
      titulo = recomendada || meta !== 'perder' ? `Bajar ${AJUSTE_KCAL} kcal` : `Acelerar déficit (−${AJUSTE_KCAL} kcal)`;
      nota = recomendada ? 'Se quitan de carbohidratos y grasa; la proteína se mantiene.'
        : meta === 'perder' ? 'Para acelerar un poco la pérdida si notas estancamiento.' : 'Si notas que el peso tiende a subir.';
    }
    if (d > 0) {
      titulo = !recomendada && meta === 'ganar' ? `Acelerar ganancia (+${AJUSTE_KCAL} kcal)` : `Subir ${AJUSTE_KCAL} kcal`;
      nota = recomendada ? 'Se añaden a carbohidratos y grasa; la proteína se mantiene.' : 'Si te cuesta ganar peso o rindes peor al entrenar.';
    }
    let bloqueada = null;
    if (d < 0 && m.kcal < datos.kcalMinimas) bloqueada = `Quedaría por debajo de ${fmtEntero_(datos.kcalMinimas)} kcal/día.`;
    if (d < 0 && perdida !== null && perdida >= 1) bloqueada = 'Ya pierdes más del 1 % semanal.';
    if (d < 0 && datos.peso && m.P < proteinaMinima * datos.peso) {
      bloqueada = `La proteína quedaría por debajo de ${fmt_(proteinaMinima)} g por kg.`;
    }
    return { delta: d, kcal: Math.round(m.kcal), P: redondear_(m.P, 1), C: redondear_(m.C, 1), G: redondear_(m.G, 1),
      titulo: titulo, nota: nota, recomendada: recomendada, bloqueada: bloqueada };
  };
  // Si la recomendada es bajar y no se puede, se recomienda mantener.
  let recomendada = opcion(delta, true);
  if (recomendada.bloqueada) {
    explicacion += ' ' + recomendada.bloqueada + ' Se mantienen las calorías.';
    delta = 0;
    recomendada = opcion(0, true);
  }
  // Alternativa: mantener si la regla propone cambiar; si no, acelerar hacia el objetivo (ganar: subir).
  const alternativa = opcion(delta !== 0 ? 0 : meta === 'ganar' ? AJUSTE_KCAL : -AJUSTE_KCAL, false);
  return { motivo: motivo, explicacion: explicacion, ritmo_pct: ritmo, adherencia_pct: datos.adherencia,
    opciones: [recomendada, alternativa] };
}

const fmt_ = n => String(redondear_(n, 2)).replace('.', ',');
const fmtEntero_ = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

if (typeof module !== 'undefined') {
  module.exports = {
    AJUSTE_KCAL, diasEntre_, normalizarPesos_, mediaVentana_, mediaMovil_, ritmoSemanal_, cambioSemana_,
    adherencia_, racha_, ajustarObjetivos_, proponerAjuste_,
  };
}
