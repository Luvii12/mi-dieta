// Pantalla «Recetas»: la biblioteca completa, agrupada por comida, con los gramos ajustados al objetivo
// de cada comida. Sin diseño propio en design/: sigue el estilo de las tarjetas de «Plan».
// Al tocar una receta se abre #receta/<id>.
// Arriba, las recetas propuestas por la IA pendientes de revisar (las escribe Claude Code con
// scripts/recetas_ia.js; la app solo las enseña, las añade o las descarta).

import { llamar } from './api.js';
import { h, icono, numero, tesela, avisar, abrirFormulario, COMIDAS } from './comun.js';
import { leerRecetas, guardarRecetas, leerPropuestas, guardarPropuestas, anadirAlimento } from './datos.js';
import { vacio } from './hoy.js';

const EMOJI_VALORACION = { me_encanta: ['😍', 'Me encanta'], no_repetir: ['🤔', 'No repetiría'] };

const pastillasPlan = m => h('span', { class: 'pastillas' },
  h('span', { class: 'pastilla pastilla-proteina' }, `${numero(m.P)}g Prot`),
  h('span', { class: 'pastilla pastilla-carbo' }, `${numero(m.C)}g Carb`),
  h('span', { class: 'pastilla pastilla-grasa' }, `${numero(m.G)}g Gra`));

function tarjeta(r) {
  if (!r.ajuste) {
    return h('div', { class: 'tarjeta comida-plan' },
      tesela(r.comida, 'tesela-sm'),
      h('span', { class: 'comida-plan-info' },
        h('span', { class: 'comida-plan-nombre' }, r.nombre),
        h('span', { class: 'mensaje mensaje-error' }, r.error)));
  }
  const m = r.ajuste.macros;
  const valoracion = EMOJI_VALORACION[r.valoracion];
  return h('a', { class: 'tarjeta comida-plan', href: '#receta/' + encodeURIComponent(r.id) },
    tesela(r.comida, 'tesela-sm'),
    h('span', { class: 'comida-plan-info' },
      h('span', { class: 'comida-linea' },
        h('span', { class: 'etiqueta-comida etiqueta-suave' }, r.comida),
        h('span', { class: 'pastilla-kcal-plan' }, `${numero(m.kcal)} kcal`)),
      h('span', { class: 'comida-plan-nombre' }, r.nombre),
      pastillasPlan(m)),
    valoracion
      ? h('span', { class: 'receta-valoracion', role: 'img', 'aria-label': valoracion[1] }, valoracion[0])
      : icono('chevron_right', 'comida-plan-flecha'));
}

// Estado de una propuesta: insignia y, si no está lista, la línea que lo explica.
export function estadoPropuesta(p) {
  if (p.estado === 'valida') return { insignia: h('span', { class: 'insignia insignia-ok-fuerte' }, 'Lista') };
  if (p.estado === 'falta_alimento') {
    return { insignia: h('span', { class: 'insignia insignia-borrador' }, 'Falta alimento'),
      nota: 'Falta: ' + p.faltan.map(f => f.nombre).join(', ') };
  }
  return { insignia: h('span', { class: 'insignia insignia-error' }, 'No vale'), nota: p.motivo, error: true };
}

function tarjetaPropuesta(p) {
  const estado = estadoPropuesta(p);
  const m = p.ajuste && p.ajuste.macros;
  return h('a', { class: 'tarjeta comida-plan', href: '#receta/' + encodeURIComponent(p.id) },
    tesela(p.comida, 'tesela-sm'),
    h('span', { class: 'comida-plan-info' },
      h('span', { class: 'comida-linea' },
        h('span', { class: 'etiqueta-comida etiqueta-suave' }, p.comida),
        m ? h('span', { class: 'pastilla-kcal-plan' }, `${numero(m.kcal)} kcal`) : estado.insignia),
      h('span', { class: 'comida-plan-nombre' }, p.nombre),
      m ? pastillasPlan(m) : h('span', { class: 'mensaje' + (estado.error ? ' mensaje-error' : '') }, estado.nota)),
    icono('chevron_right', 'comida-plan-flecha'));
}

function seccionPropuestas(propuestas) {
  if (!propuestas.length) return '';
  return h('section', { class: 'grupo-recetas', 'aria-labelledby': 'recetas-propuestas' },
    h('div', { class: 'titulo-seccion' },
      h('h2', { id: 'recetas-propuestas' }, 'Propuestas de la IA'),
      h('span', null, propuestas.length === 1 ? '1 por revisar' : `${propuestas.length} por revisar`)),
    h('p', { class: 'texto-ayuda' }, 'Ábrelas para ver ingredientes y preparación, y decide si se quedan.'),
    h('div', { class: 'lista-comidas lista-plan' }, propuestas.map(tarjetaPropuesta)));
}

function pintar(contenedor, recetas, propuestas) {
  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' },
      h('div', null,
        h('h1', { class: 'titulo-pantalla' }, 'Recetas'),
        h('p', { class: 'subtitulo' }, 'Gramos calculados para el objetivo de cada comida.')),
      h('span', { class: 'insignia insignia-primaria' }, `${recetas.length} recetas`)),
    seccionPropuestas(propuestas || []),
    ...COMIDAS.map(comida => {
      const deComida = recetas.filter(r => r.comida === comida);
      if (!deComida.length) return '';
      return h('section', { class: 'grupo-recetas', 'aria-labelledby': 'recetas-' + comida },
        h('div', { class: 'titulo-seccion' },
          h('h2', { id: 'recetas-' + comida }, comida),
          h('span', null, deComida.length === 1 ? '1 receta' : `${deComida.length} recetas`)),
        h('div', { class: 'lista-comidas lista-plan' }, deComida.map(tarjeta)));
    }));
}

export function pintarRecetas(contenedor) {
  const recetas = leerRecetas();
  if (recetas) pintar(contenedor, recetas, leerPropuestas());
  return Boolean(recetas);
}

// Descarga la biblioteca y las propuestas en segundo plano (al abrir la app), para que la pestaña se vea
// al momento y ya actualizada. Si falla, no pasa nada: se pedirán al abrir la pestaña.
export async function precargarRecetas() {
  try {
    const [recetas, propuestas] = await Promise.all([llamar('recetas'), llamar('propuestas')]);
    guardarRecetas(recetas);
    guardarPropuestas(propuestas);
  } catch (err) {
    // Sin conexión o servidor lento: se reintenta al abrir Recetas.
  }
}

export async function cargarRecetas(contenedor) {
  const habia = pintarRecetas(contenedor);
  if (!habia) contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Calculando recetas…'));
  try {
    const [recetas, propuestas] = await Promise.all([llamar('recetas'), llamar('propuestas').catch(() => leerPropuestas())]);
    guardarRecetas(recetas);
    guardarPropuestas(propuestas);
    pintar(contenedor, recetas, propuestas);
  } catch (err) {
    if (!habia) contenedor.replaceChildren(vacio(err.message));
  }
}

// ---------- Alimento nuevo que pide una propuesta ----------

const GRUPOS = [['proteina', 'Proteína'], ['carbohidrato', 'Hidratos'], ['grasa', 'Grasa'], ['lacteo', 'Lácteo'], ['fruta', 'Fruta'],
  ['verdura_condimento', 'Verdura o condimento']];

// falta: {id, nombre, grupo, estado} (lo que dijo la IA; los valores por 100 g los pone el usuario).
export function abrirAlimentoNuevo(falta, foco) {
  abrirFormulario({
    titulo: 'Añadir alimento',
    nota: 'Valores por 100 g, de la etiqueta o de BEDCA, en el estado que indiques (crudo o cocinado). La IA no da valores nutricionales.',
    foco: foco,
    textoGuardar: 'Añadir alimento',
    campos: [
      { clave: 'nombre', etiqueta: 'Nombre', tipo: 'texto', valor: falta.nombre, ancho: true },
      { clave: 'grupo', etiqueta: 'Grupo', tipo: 'opciones', opciones: GRUPOS, valor: falta.grupo, ancho: true },
      { clave: 'estado', etiqueta: 'Se pesa', tipo: 'opciones', opciones: [['crudo', 'En crudo'], ['cocinado', 'Cocinado']], valor: falta.estado },
      { clave: 'gramos_por_unidad', etiqueta: 'Por unidad (opcional)', unidad: 'g' },
      { clave: 'kcal_100', etiqueta: 'Calorías', unidad: 'kcal' },
      { clave: 'proteina_100', etiqueta: 'Proteína', unidad: 'g' },
      { clave: 'carbohidratos_100', etiqueta: 'Hidratos', unidad: 'g' },
      { clave: 'grasa_100', etiqueta: 'Grasa', unidad: 'g' },
    ],
    guardar: async v => {
      if (['kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100'].some(c => Number.isNaN(v[c]))) {
        throw new Error('Rellena calorías, proteína, hidratos y grasa.');
      }
      await anadirAlimento(Object.assign({ id: falta.id }, v, { gramos_por_unidad: Number.isNaN(v.gramos_por_unidad) ? '' : v.gramos_por_unidad }));
      avisar(`${v.nombre} añadido a tus alimentos.`);
    },
  });
}
