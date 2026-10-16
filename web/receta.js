// Pantalla «Receta» de una comida del plan: macros, ingredientes pesados para tus objetivos, preparación,
// valoración y «Marcar como hecha» (design/mi_dieta_receta_pollo_al_curry).
// Ruta: #receta/<plan_id>/<fecha>/<comida>

import { llamar } from './api.js';
import { h, icono, numero, fechaTitulo, ICONO_COMIDA, avisar } from './comun.js';
import { buscarComida, guardarPlan, marcarComida, valorar } from './datos.js';
import { vacio } from './hoy.js';

const VALORACIONES = [
  { valor: 'me_encanta', emoji: '😍', texto: 'Me encanta' },
  { valor: 'normal', emoji: '👌', texto: 'Normal' },
  { valor: 'no_repetir', emoji: '🤔', texto: 'No repetiría' },
];

// Color del punto de cada ingrediente pesado según su grupo de alimentos.
const COLOR_GRUPO = { proteina: 'primario', carbohidrato: 'carbo', grasa: 'secundario', lacteo: 'proteina', fruta: 'grasa' };

const esMl = ing => ing.alimento.endsWith('_ml');

// «Revuelve…; sirve…» → ['Revuelve…', 'Sirve…']
function pasos(texto) {
  return String(texto || '').split(/;\s*|\.\s+/).map(p => p.trim().replace(/\.$/, '')).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1) + '.');
}

function cajaMacro(clase, titulo, valor, unidad) {
  return h('div', { class: 'macro-caja macro-caja-' + clase },
    h('span', { class: 'macro-caja-titulo' }, titulo),
    h('span', { class: 'macro-caja-valor' }, valor, h('span', { class: 'macro-caja-unidad' }, ' ' + unidad)));
}

function ingredientePesado(ing) {
  const detalle = [ing.estado === 'crudo' ? 'en crudo' : ing.estado === 'cocinado' ? 'cocinado' : '', ing.piezas ? `${numero(ing.gramos)} g` : '']
    .filter(Boolean).join(' · ');
  return h('li', { class: 'pesado' },
    h('span', { class: 'pesado-nombre' },
      h('span', { class: 'punto punto-' + (COLOR_GRUPO[ing.grupo] || 'contorno') }),
      h('span', null, h('span', { class: 'pesado-texto' }, ing.nombre), detalle ? h('span', { class: 'pesado-detalle' }, detalle) : null)),
    ing.piezas
      ? h('span', { class: 'pesado-cantidad' }, numero(ing.piezas), h('span', { class: 'pesado-unidad' }, ' ud.'))
      : h('span', { class: 'pesado-cantidad' }, numero(ing.gramos), h('span', { class: 'pesado-unidad' }, esMl(ing) ? ' ml' : ' g')));
}

function ingredienteFijo(ing) {
  return h('li', { class: 'fijo' },
    h('span', null, ing.nombre),
    h('span', { class: 'fijo-cantidad' }, `${numero(ing.gramos)} ${esMl(ing) ? 'ml' : 'g'}`));
}

function pintar(contenedor, encontrada) {
  const { comida: c, dia, plan, activo } = encontrada;
  const pesados = c.ingredientes.filter(i => i.escalable);
  const fijos = c.ingredientes.filter(i => !i.escalable);
  const listaPasos = pasos(c.preparacion);
  const m = c.macros;

  const valorarCon = valor => () => valorar(c.receta_id, valor).catch(err => avisar(err.message));
  const marcar = () => marcarComida(plan.plan_id, dia.fecha, c.comida, c.hecha === 'si' ? 'no' : 'si').catch(err => avisar(err.message));

  contenedor.replaceChildren(
    h('div', { class: `receta-portada tesela-${c.comida.toLowerCase()}`, 'aria-hidden': 'true' }, icono(ICONO_COMIDA[c.comida])),
    h('div', { class: 'receta-barra' },
      h('button', { type: 'button', class: 'boton-flotante', 'aria-label': 'Volver', onclick: volver }, icono('arrow_back')),
      h('span', { class: 'receta-pastilla' }, h('span', { class: 'punto punto-secundario' }), 'Receta'),
      h('span', { class: 'hueco-boton' })),

    h('div', { class: 'receta-contenido' },
      h('section', { class: 'tarjeta receta-cabecera' },
        h('p', { class: 'receta-meta' },
          h('span', { class: 'texto-primario' }, c.comida), h('span', { class: 'separador' }, '•'), fechaTitulo(dia.fecha),
          c.cambiada ? [h('span', { class: 'separador' }, '•'), h('span', { class: 'texto-secundario' }, 'Plato cambiado')] : null),
        h('h1', null, c.nombre),
        h('div', { class: 'macro-cajas' },
          cajaMacro('kcal', 'Calorías', numero(m.kcal), 'kcal'),
          cajaMacro('proteina', 'Proteína', numero(m.P), 'g'),
          cajaMacro('carbo', 'Carbos', numero(m.C), 'g'),
          cajaMacro('grasa', 'Grasas', numero(m.G), 'g'))),

      h('section', { class: 'receta-seccion', 'aria-labelledby': 'titulo-ingredientes' },
        h('div', { class: 'seccion-cabecera' },
          h('div', { class: 'seccion-titulo' }, icono('kitchen', 'texto-primario'), h('h2', { id: 'titulo-ingredientes' }, 'Ingredientes')),
          h('span', { class: 'insignia insignia-neutra' }, '1 ración calculada')),
        pesados.length ? h('div', { class: 'tarjeta-pesados' },
          h('div', { class: 'grupo-cabecera' },
            h('span', { class: 'grupo-titulo texto-primario' }, icono('tune'), 'Pesados para tus macros'),
            h('span', { class: 'insignia insignia-primaria-suave' }, 'Exactos')),
          h('ul', { class: 'lista-pesados' }, pesados.map(ingredientePesado))) : null,
        fijos.length ? h('div', { class: 'tarjeta tarjeta-fijos' },
          h('div', { class: 'grupo-cabecera grupo-cabecera-linea' },
            h('span', { class: 'grupo-titulo' }, icono('soup_kitchen', 'texto-terciario'), 'Para el sabor y la base'),
            h('span', { class: 'grupo-nota' }, 'Cantidad fija')),
          h('ul', { class: 'lista-fijos' }, fijos.map(ingredienteFijo))) : null),

      listaPasos.length ? h('section', { class: 'receta-seccion', 'aria-labelledby': 'titulo-preparacion' },
        h('div', { class: 'seccion-cabecera' },
          h('div', { class: 'seccion-titulo' }, icono('outdoor_grill', 'texto-primario'), h('h2', { id: 'titulo-preparacion' }, 'Preparación')),
          h('span', { class: 'grupo-nota' }, listaPasos.length === 1 ? '1 paso' : `${listaPasos.length} pasos sencillos`)),
        h('ol', { class: 'pasos' }, listaPasos.map((texto, i) =>
          h('li', { class: 'tarjeta paso' }, h('span', { class: 'paso-numero', 'aria-hidden': 'true' }, String(i + 1)), h('p', null, texto))))) : null,

      h('section', { class: 'tarjeta valoracion', 'aria-labelledby': 'titulo-valoracion' },
        h('h2', { id: 'titulo-valoracion' }, '¿Qué te ha parecido el plato?'),
        h('p', { class: 'subtitulo' }, 'Nos ayuda a elegir mejores recetas para tus próximos planes.'),
        h('div', { class: 'valoracion-opciones' }, VALORACIONES.map(v =>
          h('button', { type: 'button', class: 'valoracion-opcion', 'aria-pressed': c.valoracion === v.valor ? 'true' : 'false',
            'data-foco': 'valorar-' + v.valor, onclick: valorarCon(v.valor) },
          h('span', { class: 'valoracion-emoji', 'aria-hidden': 'true' }, v.emoji), h('span', null, v.texto)))))),

    activo ? h('div', { class: 'barra-accion' },
      c.hecha === 'si'
        ? h('button', { type: 'button', class: 'boton boton-grande boton-hecho', 'data-foco': 'marcar', onclick: marcar },
          icono('task_alt'), '¡Registrada en tu día!')
        : h('button', { type: 'button', class: 'boton boton-grande boton-primario', 'data-foco': 'marcar', onclick: marcar },
          icono('check_circle'), 'Marcar como hecha')) : null);
  contenedor.classList.toggle('con-barra', activo);
}

// Vuelve a la pantalla anterior; si se abrió la receta directamente, al plan.
let anterior = null;
export const recordarAnterior = hash => { anterior = hash; };
function volver() {
  if (anterior && !anterior.startsWith('#receta')) history.back();
  else location.hash = '#plan';
}

function partesRuta() {
  const [, planId, fecha, comida] = location.hash.split('/');
  return [decodeURIComponent(planId || ''), fecha, comida];
}

export function pintarReceta(contenedor) {
  const encontrada = buscarComida(...partesRuta());
  if (encontrada) pintar(contenedor, encontrada);
  return Boolean(encontrada);
}

export async function cargarReceta(contenedor) {
  if (pintarReceta(contenedor)) return;
  contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando receta…'));
  try {
    guardarPlan(await llamar('plan'));
    if (!pintarReceta(contenedor)) contenedor.replaceChildren(vacio('Esta comida ya no está en tus planes.', 'Ir a Plan', '#plan'));
  } catch (err) {
    contenedor.replaceChildren(vacio(err.message, 'Ir a Plan', '#plan'));
  }
}
