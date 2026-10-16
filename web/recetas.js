// Pantalla «Recetas»: la biblioteca completa, agrupada por comida, con los gramos ajustados al objetivo
// de cada comida. Sin diseño propio en design/: sigue el estilo de las tarjetas de «Plan».
// Al tocar una receta se abre #receta/<id>.

import { llamar } from './api.js';
import { h, icono, numero, tesela, COMIDAS } from './comun.js';
import { leerRecetas, guardarRecetas } from './datos.js';
import { vacio } from './hoy.js';

const EMOJI_VALORACION = { me_encanta: ['😍', 'Me encanta'], no_repetir: ['🤔', 'No repetiría'] };

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
      h('span', { class: 'pastillas' },
        h('span', { class: 'pastilla pastilla-proteina' }, `${numero(m.P)}g Prot`),
        h('span', { class: 'pastilla pastilla-carbo' }, `${numero(m.C)}g Carb`),
        h('span', { class: 'pastilla pastilla-grasa' }, `${numero(m.G)}g Gra`))),
    valoracion
      ? h('span', { class: 'receta-valoracion', role: 'img', 'aria-label': valoracion[1] }, valoracion[0])
      : icono('chevron_right', 'comida-plan-flecha'));
}

function pintar(contenedor, recetas) {
  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' },
      h('div', null,
        h('h1', { class: 'titulo-pantalla' }, 'Recetas'),
        h('p', { class: 'subtitulo' }, 'Gramos calculados para el objetivo de cada comida.')),
      h('span', { class: 'insignia insignia-primaria' }, `${recetas.length} recetas`)),
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
  if (recetas) pintar(contenedor, recetas);
  return Boolean(recetas);
}

export async function cargarRecetas(contenedor) {
  const habia = pintarRecetas(contenedor);
  if (!habia) contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Calculando recetas…'));
  try {
    const recetas = await llamar('recetas');
    guardarRecetas(recetas);
    pintar(contenedor, recetas);
  } catch (err) {
    if (!habia) contenedor.replaceChildren(vacio(err.message));
  }
}
