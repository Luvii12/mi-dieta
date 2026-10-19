// Perfil de cada persona (fase M4, docs/NUTRICION.md › «Objetivos según el perfil»): con sus datos (sexo,
// edad, altura, peso, trabajo, días de entrenamiento y objetivo) calcula sus kcal y macros del día y los
// reparte entre sus comidas (las 4, o sin desayuno o sin merienda) con las proporciones del plan de Fran
// (REFERENCIA_COMIDAS, Nutricion.js). Se usa al darse de alta y cada vez que alguien cambia de objetivo.
// Funciones puras.

// Tolerancias en % (docs/NUTRICION.md). P_margen_g: el día nunca puede quedar más de 10 g de
// proteína por debajo del objetivo.
const TOLERANCIAS_INICIALES = {
  dia: { kcal: 5, P: 5, C: 10, G: 10, P_margen_g: 10 },
  comida: { kcal: 12, P: 15, C: 15, G: 20 },
};

// Factor de actividad = el del trabajo + lo que suma el entrenamiento (de 1,2 a 1,9).
const TRABAJOS = {
  sentado: { factor: 1.2, nombre: 'Sentado', nota: 'Oficina, estudios, conducir' },
  de_pie: { factor: 1.3, nombre: 'De pie', nota: 'Tienda, hostelería, enseñanza' },
  fisico: { factor: 1.45, nombre: 'Físico', nota: 'Obra, almacén, campo' },
};
const ENTRENOS = {
  no: { factor: 0, proteina: 0, nombre: 'No entreno' },
  '1_2': { factor: 0.15, proteina: 0.2, nombre: '1–2 días' },
  '3_4': { factor: 0.3, proteina: 0.4, nombre: '3–4 días' },
  '5_mas': { factor: 0.45, proteina: 0.4, nombre: '5 o más' },
};

// kcal sobre el gasto: perder −20 % (como mucho −500), ganar +10 % (como mucho +300).
// Proteína (g por kg) de partida según el objetivo; el entrenamiento suma (ENTRENOS) hasta 2,2 g/kg.
const METAS = {
  perder: { nombre: 'Perder grasa', pct: -20, tope: 500, proteina: 1.8, proteina_minima: 1.6 },
  mantener: { nombre: 'Mantener', pct: 0, tope: 0, proteina: 1.4, proteina_minima: 1.2 },
  ganar: { nombre: 'Ganar músculo', pct: 10, tope: 300, proteina: 1.6, proteina_minima: 1.2 },
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
// perfil: {nombre, sexo, nacimiento, altura_cm, peso_kg, trabajo, entreno, meta, comidas?}. Sin `comidas`, las 4.
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
  if (!ENTRENOS[p.entreno]) throw new Error('Elige cuántos días entrenas.');
  if (!METAS[p.meta]) throw new Error('Elige tu objetivo.');
  return { nombre: nombre, sexo: p.sexo, nacimiento: p.nacimiento, altura_cm: altura, peso_kg: peso,
    trabajo: p.trabajo, entreno: p.entreno, meta: p.meta, comidas: comidasValidas_(p.comidas) };
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
  const gasto = tmb * (TRABAJOS[perfil.trabajo].factor + ENTRENOS[perfil.entreno].factor);
  const meta = METAS[perfil.meta];
  const cambio = Math.sign(meta.pct) * Math.min(Math.abs(gasto * meta.pct / 100), meta.tope);
  const minimas = Number(kcalMinimas) || KCAL_MINIMAS_SEXO[perfil.sexo];
  const kcal = Math.max(minimas, Math.round((gasto + cambio) / 10) * 10);

  const pesoRef = pesoReferencia_(perfil.peso_kg, perfil.altura_cm);
  const proteinaKg = Math.min(PROTEINA_MAXIMA_G_KG, meta.proteina + ENTRENOS[perfil.entreno].proteina);
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
  if (perfil.meta === 'ganar' && perfil.entreno === 'no') {
    aviso = 'Para ganar músculo hace falta entrenar fuerza: sin entrenar, lo que subas será sobre todo grasa.';
  } else if (perfil.meta === 'perder' && gasto + cambio < minimas) {
    aviso = `Tu déficit queda limitado por el mínimo de ${String(minimas).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} kcal al día: perderás algo más despacio.`;
  }
  return { edad: edad, tmb: Math.round(tmb), gasto: Math.round(gasto), kcal: kcal, kcal_minimas: minimas,
    proteina_g_kg: redondearPerfil_(proteinaKg, 1), peso_referencia: pesoRef, dia: { kcal: kcal, P: P, C: C, G: G },
    comidas: comidas, aviso: aviso };
}

// Proteína mínima (g/kg) para poder bajar calorías en el ajuste quincenal, según el objetivo (sin perfil: perder).
function proteinaMinimaGKg_(meta) {
  return (METAS[meta] || METAS.perder).proteina_minima;
}

if (typeof module !== 'undefined') {
  module.exports = {
    TOLERANCIAS_INICIALES, TRABAJOS, ENTRENOS, METAS, KCAL_MINIMAS_SEXO, COMIDAS_OPCIONALES, edad_, pesoReferencia_,
    validarPerfil_, comidasValidas_, calcularObjetivos_, proteinaMinimaGKg_,
  };
}
