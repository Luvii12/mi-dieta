// Perfil de cada persona (fase M4, docs/NUTRICION.md › «Objetivos según el perfil»): con sus datos (sexo,
// edad, altura, peso, trabajo, ejercicio (días y tipo), si anda a diario y objetivo) calcula sus kcal y macros del día y los
// reparte entre sus comidas (las 4, o sin desayuno o sin merienda) con las proporciones del plan de Fran
// (REFERENCIA_COMIDAS, Nutricion.js). Se usa al darse de alta y cada vez que alguien cambia de objetivo.
// Funciones puras.

// Tolerancias en % (docs/NUTRICION.md). P_margen_g: el día nunca puede quedar más de 10 g de
// proteína por debajo del objetivo.
const TOLERANCIAS_INICIALES = {
  dia: { kcal: 5, P: 5, C: 10, G: 10, P_margen_g: 10 },
  comida: { kcal: 12, P: 15, C: 15, G: 20 },
};

// Factor de actividad (PAL, FAO/OMS/UNU 2004: una vida sedentaria es 1,40–1,69) = el del trabajo + lo que suma
// el ejercicio (unos 0,2 por una hora diaria de ejercicio moderado o intenso: se reparte por los días que se
// hace) + andar a diario (≈ 1 hora o 10.000 pasos). De 1,4 a 1,95.
const TRABAJOS = {
  sentado: { factor: 1.4, nombre: 'Sentado', nota: 'Oficina, estudios, conducir' },
  de_pie: { factor: 1.55, nombre: 'De pie', nota: 'Tienda, hostelería, enseñanza' },
  fisico: { factor: 1.7, nombre: 'Físico', nota: 'Obra, almacén, campo' },
};
const ENTRENOS = {
  no: { factor: 0, nombre: 'No hago ejercicio' },
  '1_2': { factor: 0.05, nombre: '1–2 días' },
  '3_4': { factor: 0.1, nombre: '3–4 días' },
  '5_mas': { factor: 0.15, nombre: '5 o más' },
};
const EJERCICIOS = {
  fuerza: { nombre: 'Fuerza', nota: 'Pesas, máquinas, calistenia (aunque también hagas cardio)' },
  cardio: { nombre: 'Cardio o deporte', nota: 'Correr, bici, nadar, pádel, fútbol…' },
};
const FACTOR_ANDAR = 0.1;

// kcal sobre el gasto: perder −20 % (como mucho −500), ganar +10 % (como mucho +300).
// `proteina_minima`: la del ajuste quincenal (no se bajan kcal si la proteína queda por debajo).
const METAS = {
  perder: { nombre: 'Perder grasa', pct: -20, tope: 500, proteina_minima: 1.6, proteina_minima_sin_fuerza: 1.2 },
  mantener: { nombre: 'Mantener', pct: 0, tope: 0, proteina_minima: 1.2 },
  ganar: { nombre: 'Ganar músculo', pct: 10, tope: 300, proteina_minima: 1.2 },
};
// Proteína (g por kg) según el objetivo y el ejercicio: sin ejercicio (o solo andar), y con cardio o con fuerza
// [1–2 días, 3 o más]. Perder grasa sin fuerza: 1,2–1,6 g/kg basta para el apetito y el control del peso
// (Leidy 2015); con fuerza, más para no perder músculo (ISSN 2017). Mantener y ganar, como antes de separar
// el tipo de ejercicio (la biblioteca de recetas lleva mucha proteína: con menos, los planes no cuadran).
const PROTEINA_G_KG = {
  perder: { no: 1.4, cardio: [1.4, 1.6], fuerza: [2.0, 2.2] },
  mantener: { no: 1.4, cardio: [1.6, 1.8], fuerza: [1.6, 1.8] },
  ganar: { no: 1.6, cardio: [1.8, 2.0], fuerza: [1.8, 2.0] },
};
const PROTEINA_MAXIMA_G_KG = 2.2;

const KCAL_MINIMAS_SEXO = { mujer: 1200, hombre: 1500 };
const COMIDAS_OPCIONALES = ['Desayuno', 'Merienda']; // el almuerzo y la cena van siempre
const GRASA_PCT = 25;        // de las kcal (EFSA: 20–35 %); baja hasta el 20 % si los hidratos no llegan a 100 g
const GRASA_PCT_MINIMA = 20;
const HIDRATOS_MINIMOS_G = 100;
const IMC_REFERENCIA = 25;   // con IMC > 30, la proteína se calcula sobre el peso que daría un IMC de 25

const redondearPerfil_ = (n, decimales) => Math.round(n * Math.pow(10, decimales)) / Math.pow(10, decimales);

// Años cumplidos en `hoyIso` de alguien nacido en `nacimientoIso` (AAAA-MM-DD).
function edad_(nacimientoIso, hoyIso) {
  const [a, m, d] = nacimientoIso.split('-').map(Number);
  const [ha, hm, hd] = hoyIso.split('-').map(Number);
  return ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
}

// Peso sobre el que se calcula la proteína: el real o, con obesidad (IMC > 30), el de un IMC de 25.
function pesoReferencia_(pesoKg, alturaCm) {
  if (!alturaCm) return pesoKg;
  const metros = alturaCm / 100;
  return pesoKg / (metros * metros) > 30 ? redondearPerfil_(IMC_REFERENCIA * metros * metros, 1) : pesoKg;
}

// Comprueba los datos del perfil y los devuelve limpios. Lanza un Error con el primer problema.
// perfil: {nombre, sexo, nacimiento, altura_cm, peso_kg, trabajo, entreno (días de ejercicio), ejercicio (fuerza /
// cardio; sin él, fuerza), andar (sí/no), meta, comidas?}. Sin `comidas`, las 4.
function validarPerfil_(perfil, hoyIso) {
  const p = perfil || {};
  const numero = v => Number(String(v === undefined || v === null ? '' : v).replace(',', '.'));
  const nombre = String(p.nombre || '').trim();
  if (!nombre || nombre.length > 40) throw new Error('Escribe tu nombre (hasta 40 letras).');
  if (!KCAL_MINIMAS_SEXO[p.sexo]) throw new Error('Elige hombre o mujer.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.nacimiento || ''))) throw new Error('Escribe tu fecha de nacimiento.');
  const edad = edad_(p.nacimiento, hoyIso);
  if (edad < 18) throw new Error('La app es para mayores de 18 años.');
  if (edad > 100) throw new Error('Revisa la fecha de nacimiento.');
  const altura = Math.round(numero(p.altura_cm));
  if (!(altura >= 120 && altura <= 230)) throw new Error('La altura debe estar entre 120 y 230 cm.');
  const peso = redondearPerfil_(numero(p.peso_kg), 1);
  if (!(peso >= 35 && peso <= 250)) throw new Error('El peso debe estar entre 35 y 250 kg.');
  if (!TRABAJOS[p.trabajo]) throw new Error('Elige cómo es tu trabajo.');
  if (!ENTRENOS[p.entreno]) throw new Error('Elige cuántos días haces ejercicio.');
  if (p.entreno !== 'no' && p.ejercicio && !EJERCICIOS[p.ejercicio]) throw new Error('Elige qué tipo de ejercicio haces.');
  if (!METAS[p.meta]) throw new Error('Elige tu objetivo.');
  return { nombre: nombre, sexo: p.sexo, nacimiento: p.nacimiento, altura_cm: altura, peso_kg: peso,
    trabajo: p.trabajo, entreno: p.entreno, ejercicio: tipoEjercicio_(p), andar: p.andar === true, meta: p.meta,
    comidas: comidasValidas_(p.comidas) };
}

// 'no', 'fuerza' o 'cardio'. Los perfiles de antes de separar el tipo de ejercicio entrenaban fuerza.
function tipoEjercicio_(perfil) {
  if (!perfil || !ENTRENOS[perfil.entreno] || perfil.entreno === 'no') return 'no';
  return EJERCICIOS[perfil.ejercicio] ? perfil.ejercicio : 'fuerza';
}

// Proteína (g/kg) que le toca a un perfil según su objetivo y su ejercicio.
function proteinaGKg_(perfil) {
  const tabla = PROTEINA_G_KG[perfil.meta];
  const tipo = tipoEjercicio_(perfil);
  if (tipo === 'no') return tabla.no;
  return Math.min(PROTEINA_MAXIMA_G_KG, tabla[tipo][perfil.entreno === '1_2' ? 0 : 1]);
}

// Las comidas que hace la persona, en orden: el almuerzo y la cena siempre; el desayuno y la merienda, si
// los elige (sin lista, todas).
function comidasValidas_(lista) {
  if (lista === undefined || lista === null) return COMIDAS.slice();
  if (!Array.isArray(lista)) throw new Error('Elige qué comidas haces.');
  return COMIDAS.filter(c => COMIDAS_OPCIONALES.indexOf(c) < 0 || lista.indexOf(c) >= 0);
}

// Objetivos de una persona a partir de su perfil (ya validado). `kcalMinimas`: su mínimo si ya tiene uno
// (si no, el de su sexo). Devuelve {edad, tmb, gasto, kcal, kcal_minimas, proteina_g_kg, peso_referencia,
// dia: {kcal, P, C, G}, comidas: {Desayuno: {kcal, P, C, G}, ...}, aviso (texto o null)}.
function calcularObjetivos_(perfil, hoyIso, kcalMinimas) {
  const edad = edad_(perfil.nacimiento, hoyIso);
  // Mifflin-St Jeor: gasto en reposo.
  const tmb = 10 * perfil.peso_kg + 6.25 * perfil.altura_cm - 5 * edad + (perfil.sexo === 'hombre' ? 5 : -161);
  const gasto = tmb * (TRABAJOS[perfil.trabajo].factor + ENTRENOS[perfil.entreno].factor + (perfil.andar ? FACTOR_ANDAR : 0));
  const meta = METAS[perfil.meta];
  const cambio = Math.sign(meta.pct) * Math.min(Math.abs(gasto * meta.pct / 100), meta.tope);
  const minimas = Number(kcalMinimas) || KCAL_MINIMAS_SEXO[perfil.sexo];
  const kcal = Math.max(minimas, Math.round((gasto + cambio) / 10) * 10);

  const pesoRef = pesoReferencia_(perfil.peso_kg, perfil.altura_cm);
  const proteinaKg = proteinaGKg_(perfil);
  const P = Math.round(proteinaKg * pesoRef);
  const kcalGrasa = Math.max(kcal * GRASA_PCT_MINIMA / 100, Math.min(kcal * GRASA_PCT / 100, kcal - P * 4 - HIDRATOS_MINIMOS_G * 4));
  const G = Math.round(kcalGrasa / 9);
  const C = Math.round((kcal - P * 4 - G * 9) / 4);

  // Las comidas que no hace la persona no cuentan: el día se reparte entre las demás, en proporción.
  const suyas = perfil.comidas || COMIDAS;
  const total = n => suyas.reduce((s, c) => s + REFERENCIA_COMIDAS[c][n], 0);
  const dia = { P: P, C: C, G: G };
  const comidas = {};
  suyas.forEach(c => {
    const o = {};
    ['P', 'C', 'G'].forEach(n => { o[n] = redondearPerfil_(dia[n] * REFERENCIA_COMIDAS[c][n] / total(n), 1); });
    comidas[c] = { kcal: Math.round(o.P * 4 + o.C * 4 + o.G * 9), P: o.P, C: o.C, G: o.G };
  });
  let aviso = null;
  if (perfil.meta === 'ganar' && tipoEjercicio_(perfil) !== 'fuerza') {
    aviso = 'Para ganar músculo hace falta entrenar fuerza: sin ella, lo que subas será sobre todo grasa.';
  } else if (perfil.meta === 'perder' && gasto + cambio < minimas) {
    aviso = `Tu déficit queda limitado por el mínimo de ${String(minimas).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kcal al día: perderás algo más despacio.`;
  }
  return { edad: edad, tmb: Math.round(tmb), gasto: Math.round(gasto), kcal: kcal, kcal_minimas: minimas,
    proteina_g_kg: redondearPerfil_(proteinaKg, 1), peso_referencia: pesoRef, dia: { kcal: kcal, P: P, C: C, G: G },
    comidas: comidas, aviso: aviso };
}

// Proteína mínima (g/kg) para poder bajar calorías en el ajuste quincenal, según el objetivo y si hace fuerza
// (sin perfil: perder grasa con fuerza, como Fran).
function proteinaMinimaGKg_(perfil) {
  const meta = METAS[(perfil || {}).meta];
  if (!meta) return METAS.perder.proteina_minima;
  return tipoEjercicio_(perfil) !== 'fuerza' && meta.proteina_minima_sin_fuerza ? meta.proteina_minima_sin_fuerza : meta.proteina_minima;
}

if (typeof module !== 'undefined') {
  module.exports = {
    TOLERANCIAS_INICIALES, TRABAJOS, ENTRENOS, EJERCICIOS, FACTOR_ANDAR, METAS, PROTEINA_G_KG, KCAL_MINIMAS_SEXO,
    COMIDAS_OPCIONALES, edad_, pesoReferencia_, validarPerfil_, tipoEjercicio_, proteinaGKg_, comidasValidas_,
    calcularObjetivos_, proteinaMinimaGKg_,
  };
}
