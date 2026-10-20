// Pantalla «Receta»: macros, ingredientes pesados para tus objetivos, preparación, valoración y, si es una
// comida del plan activo, «Marcar como hecha» y, hasta hoy, «No la he hecho»; «Cambiar cantidades» y «Cambiar
// plato» en el plan activo de hoy en adelante y en el siguiente y el borrador (design/mi_dieta_receta_pollo_al_curry).
// Rutas: #receta/<plan_id>/<fecha>/<comida> (comida de un plan) y #receta/<id> (biblioteca de recetas, con
// «Hacer mi versión» y, en las propias, «Editar» y «Borrar»; o propuesta de la IA: en lugar de valorar,
// «Añadir a la biblioteca» o «Descartar»).

import { llamar } from './api.js';
import { h, icono, numero, fechaTitulo, hoyIso, ICONO_COMIDA, avisar, abrirFormulario } from './comun.js';
import { buscarComida, buscarReceta, guardarPlan, guardarRecetas, guardarPropuestas, marcarComida, valorar,
  aceptarPropuesta, descartarPropuesta, esPropia, actualizarPropias } from './datos.js';
import { vacio } from './hoy.js';
import { abrirAlimentoNuevo, estadoPropuesta } from './recetas.js';
import { abrirCambiarPlato } from './cambiar.js';
import { abrirCantidades } from './cantidades.js';

const VALORACIONES = [
  { valor: 'me_encanta', emoji: '😍', texto: 'Me encanta' },
  { valor: 'normal', emoji: '👌', texto: 'Normal' },
  { valor: 'no_repetir', emoji: '🤔', texto: 'No repetiría' },
];

// Color del punto de cada ingrediente pesado según su grupo de alimentos.
const COLOR_GRUPO = { proteina: 'primario', carbohidrato: 'carbo', grasa: 'secundario', lacteo: 'proteina', fruta: 'grasa' };

const esMl = ing => ing.alimento.endsWith('_ml');

// «Revuelve…; sirve…» → ['Revuelve…', 'Sirve…'] (también un paso por línea, como se escriben en la app)
function pasos(texto) {
  return String(texto || '').split(/;\s*|\.\s+|\n+/).map(p => p.trim().replace(/\.$/, '')).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1) + '.');
}

export function cajaMacro(clase, titulo, valor, unidad) {
  return h('div', { class: 'macro-caja macro-caja-' + clase },
    h('span', { class: 'macro-caja-titulo' }, titulo),
    h('span', { class: 'macro-caja-valor' }, valor, h('span', { class: 'macro-caja-unidad' }, ' ' + unidad)));
}

export function ingredientePesado(ing) {
  if (ing.gramos == null) return ingredienteConLimites(ing);
  const detalle = [ing.estado === 'crudo' ? 'en crudo' : ing.estado === 'cocinado' ? 'cocinado' : '', ing.piezas ? `${numero(ing.gramos)} g` : '',
    ing.fijado ? 'elegido por ti' : ''].filter(Boolean).join(' · ');
  return h('li', { class: 'pesado' },
    h('span', { class: 'pesado-nombre' },
      h('span', { class: 'punto punto-' + (COLOR_GRUPO[ing.grupo] || 'contorno') }),
      h('span', null, h('span', { class: 'pesado-texto' }, ing.nombre), detalle ? h('span', { class: 'pesado-detalle' }, detalle) : null)),
    ing.piezas
      ? h('span', { class: 'pesado-cantidad' }, numero(ing.piezas), h('span', { class: 'pesado-unidad' }, ' ud.'))
      : h('span', { class: 'pesado-cantidad' }, numero(ing.gramos), h('span', { class: 'pesado-unidad' }, esMl(ing) ? ' ml' : ' g')));
}

// Propuesta sin gramos todavía: entre qué límites los elegirá el optimizador.
function ingredienteConLimites(ing) {
  return h('li', { class: 'pesado' },
    h('span', { class: 'pesado-nombre' },
      h('span', { class: 'punto punto-contorno' }),
      h('span', null, h('span', { class: 'pesado-texto' }, ing.nombre), ing.nuevo ? h('span', { class: 'pesado-detalle texto-terciario' }, 'alimento nuevo') : null)),
    h('span', { class: 'pesado-cantidad' }, `${numero(ing.min_g)}–${numero(ing.max_g)}`, h('span', { class: 'pesado-unidad' }, esMl(ing) ? ' ml' : ' g')));
}

export function ingredienteFijo(ing) {
  return h('li', { class: 'fijo' },
    h('span', null, ing.nombre, ing.nuevo ? h('span', { class: 'pesado-detalle texto-terciario' }, 'alimento nuevo') : null,
      ing.fijado ? h('span', { class: 'pesado-detalle' }, 'elegido por ti') : null),
    h('span', { class: 'fijo-cantidad' }, `${numero(ing.gramos)} ${esMl(ing) ? 'ml' : 'g'}`));
}

function pintar(contenedor, encontrada) {
  const { comida: c, dia, plan, activo, vista, biblioteca } = encontrada;
  const hoy = hoyIso();
  const pesados = c.ingredientes.filter(i => i.escalable);
  const fijos = c.ingredientes.filter(i => !i.escalable);
  const listaPasos = pasos(c.preparacion);
  const m = c.macros;

  const valorarCon = valor => () => valorar(c.receta_id, valor).catch(err => avisar(err.message));
  const marcarCon = hecha => () => marcarComida(plan.plan_id, dia.fecha, c.comida, hecha).catch(err => avisar(err.message));
  const propuesta = c.propuesta;
  const cambiable = vista === 'siguiente' || vista === 'borrador' || (vista === 'activo' && dia.fecha >= hoy);

  contenedor.replaceChildren(
    h('div', { class: `receta-portada tesela-${c.comida.toLowerCase()}`, 'aria-hidden': 'true' }, icono(ICONO_COMIDA[c.comida])),
    h('div', { class: 'receta-barra' },
      h('button', { type: 'button', class: 'boton-flotante', 'aria-label': 'Volver', onclick: volver }, icono('arrow_back')),
      h('span', { class: 'receta-pastilla' }, h('span', { class: 'punto punto-secundario' }), 'Receta'),
      h('span', { class: 'hueco-boton' })),

    h('div', { class: 'receta-contenido' },
      h('section', { class: 'tarjeta receta-cabecera' },
        h('p', { class: 'receta-meta' },
          h('span', { class: 'texto-primario' }, c.comida), h('span', { class: 'separador' }, '•'),
          propuesta ? h('span', { class: 'texto-secundario' }, 'Propuesta de la IA')
            : biblioteca ? (c.fueraDeMargen ? h('span', { class: 'texto-terciario' }, 'Fuera de margen en esta comida') : 'Ajustada a tu objetivo')
              : fechaTitulo(dia.fecha),
          c.cambiada ? [h('span', { class: 'separador' }, '•'), h('span', { class: 'texto-secundario' }, 'Plato cambiado')] : null),
        h('h1', null, c.nombre),
        m ? h('div', { class: 'macro-cajas' },
          cajaMacro('kcal', 'Calorías', numero(m.kcal), 'kcal'),
          cajaMacro('proteina', 'Proteína', numero(m.P), 'g'),
          cajaMacro('carbo', 'Carbos', numero(m.C), 'g'),
          cajaMacro('grasa', 'Grasas', numero(m.G), 'g'))
          : h('p', { class: 'texto-ayuda' }, 'Los gramos y los macros se calculan cuando añadas el alimento que falta.')),

      propuesta ? avisoPropuesta(propuesta) : null,

      h('section', { class: 'receta-seccion', 'aria-labelledby': 'titulo-ingredientes' },
        h('div', { class: 'seccion-cabecera' },
          h('div', { class: 'seccion-titulo' }, icono('kitchen', 'texto-primario'), h('h2', { id: 'titulo-ingredientes' }, 'Ingredientes')),
          h('span', { class: 'insignia insignia-neutra' }, m ? '1 ración calculada' : '1 ración')),
        pesados.length ? h('div', { class: 'tarjeta-pesados' },
          h('div', { class: 'grupo-cabecera' },
            h('span', { class: 'grupo-titulo texto-primario' }, icono('tune'), 'Pesados para tus macros'),
            h('span', { class: 'insignia insignia-primaria-suave' }, m ? 'Exactos' : 'Por calcular')),
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

      propuesta ? null : h('section', { class: 'tarjeta valoracion', 'aria-labelledby': 'titulo-valoracion' },
        h('h2', { id: 'titulo-valoracion' }, '¿Qué te ha parecido el plato?'),
        h('p', { class: 'subtitulo' }, 'Nos ayuda a elegir mejores recetas para tus próximos planes.'),
        h('div', { class: 'valoracion-opciones' }, VALORACIONES.map(v =>
          h('button', { type: 'button', class: 'valoracion-opcion', 'aria-pressed': c.valoracion === v.valor ? 'true' : 'false',
            'data-foco': 'valorar-' + v.valor, onclick: valorarCon(v.valor) },
          h('span', { class: 'valoracion-emoji', 'aria-hidden': 'true' }, v.emoji), h('span', null, v.texto))))),

      biblioteca && !propuesta ? accionesReceta(c) : null,
      cambiable ? h('section', { class: 'acciones-receta', 'aria-label': 'Cambiar el plato' },
        h('button', { type: 'button', class: 'boton boton-secundario', 'data-foco': 'cambiar-cantidades',
          onclick: () => abrirCantidades(plan.plan_id, dia.fecha, c) },
        icono('scale'), 'Cambiar cantidades'),
        h('button', { type: 'button', class: 'boton boton-secundario', 'data-foco': 'cambiar-plato',
          onclick: () => abrirCambiarPlato(plan.plan_id, dia.fecha, c, { libre: activo && dia.fecha === hoy }) },
        icono('restaurant_menu'), 'Cambiar plato')) : null),

    propuesta ? barraPropuesta(propuesta) : '',
    activo ? barraMarcar(c, dia.fecha <= hoy, marcarCon) : '');
  contenedor.classList.toggle('con-barra', Boolean(activo || propuesta));
}

// Barra de una comida del plan activo: hecha (se desmarca), no hecha (se deshace) o pendiente; hasta hoy,
// la pendiente también se puede marcar como no hecha.
function barraMarcar(c, hastaHoy, marcarCon) {
  if (c.hecha === 'si') {
    return h('div', { class: 'barra-accion' },
      h('button', { type: 'button', class: 'boton boton-grande boton-hecho', 'data-foco': 'marcar', onclick: marcarCon('no') },
        icono('task_alt'), '¡Registrada en tu día!'));
  }
  if (c.hecha === 'saltada') {
    return h('div', { class: 'barra-accion' },
      h('button', { type: 'button', class: 'boton boton-grande boton-secundario', 'data-foco': 'marcar', onclick: marcarCon('no'),
        'aria-label': 'No la has hecho. Tocar para deshacer' }, icono('remove'), 'No la has hecho · Deshacer'));
  }
  const hecha = h('button', { type: 'button', class: 'boton boton-grande boton-primario', 'data-foco': 'marcar', onclick: marcarCon('si') },
    icono('check_circle'), 'Marcar como hecha');
  if (!hastaHoy) return h('div', { class: 'barra-accion' }, hecha);
  return h('div', { class: 'barra-accion barra-accion-doble' },
    h('button', { type: 'button', class: 'boton boton-grande boton-secundario', 'data-foco': 'saltar', onclick: marcarCon('saltada') },
      'No la hice'),
    hecha);
}

// Recetas de la biblioteca: hacer una versión propia y, en las que añadió esta cuenta, editar o borrar.
function accionesReceta(c) {
  const id = encodeURIComponent(c.receta_id);
  const borrar = () => abrirFormulario({
    titulo: `¿Borrar «${c.nombre}»?`,
    nota: 'Dejará de salir en los planes nuevos de todos. Los platos que ya estén en un plan se quedan.',
    campos: [],
    textoGuardar: 'Borrar receta',
    foco: 'borrar-receta',
    guardar: async () => {
      await llamar('borrarReceta', { receta_id: c.receta_id });
      guardarRecetas(await llamar('recetas'));
      await actualizarPropias();
      avisar('Receta borrada.');
      location.hash = '#recetas';
    },
  });
  return h('section', { class: 'acciones-receta', 'aria-label': 'Cambiar la receta' },
    h('a', { class: 'boton boton-secundario', href: '#nueva/' + id }, icono('edit_note'), 'Hacer mi versión'),
    esPropia(c.receta_id) ? [
      h('a', { class: 'boton boton-secundario', href: '#editar/' + id }, icono('edit'), 'Editar'),
      h('button', { type: 'button', class: 'boton boton-texto boton-peligro', 'data-foco': 'borrar-receta', onclick: borrar }, icono('delete'), 'Borrar receta'),
    ] : null);
}

// Qué le pasa a una propuesta que aún no se puede añadir: el alimento que falta (con botón para añadirlo)
// o por qué no vale.
function avisoPropuesta(p) {
  if (p.estado === 'valida') return null;
  const estado = estadoPropuesta(p);
  if (p.estado !== 'falta_alimento') {
    return h('section', { class: 'tarjeta tarjeta-ajuste', role: 'status' },
      h('span', { class: 'grupo-titulo' }, estado.insignia),
      h('p', { class: 'mensaje mensaje-error' }, estado.nota));
  }
  return h('section', { class: 'tarjeta tarjeta-ajuste', 'aria-labelledby': 'titulo-falta' },
    h('span', { class: 'grupo-titulo texto-terciario' }, icono('error'),
      h('span', { id: 'titulo-falta' }, p.faltan.length === 1 ? 'Falta un alimento en tu tabla' : 'Faltan alimentos en tu tabla')),
    h('p', { class: 'texto-ayuda' }, 'Añádelo con sus valores por 100 g (de la etiqueta o de BEDCA) y la receta se calculará. Si no te compensa, descártala.'),
    p.faltan.map(f => h('button', { type: 'button', class: 'boton boton-discontinuo', 'data-foco': 'falta-' + f.id,
      onclick: () => abrirAlimentoNuevo(f, 'falta-' + f.id) }, icono('add'), h('span', null, `Añadir «${f.nombre}»`))));
}

function barraPropuesta(p) {
  const conBloqueo = accion => async evento => {
    const botones = evento.currentTarget.parentElement.querySelectorAll('button');
    botones.forEach(b => { b.disabled = true; });
    try {
      await accion();
    } catch (err) {
      avisar(err.message);
      botones.forEach(b => { b.disabled = false; });
    }
  };
  const descartar = conBloqueo(async () => {
    await descartarPropuesta(p.id);
    avisar('Propuesta descartada.');
    location.hash = '#recetas';
  });
  const aceptar = conBloqueo(async () => {
    await aceptarPropuesta(p.id);
    avisar('Receta añadida a tu biblioteca. Entrará en los próximos planes.');
  });
  return h('div', { class: 'barra-accion barra-accion-doble' },
    h('button', { type: 'button', class: 'boton boton-grande boton-secundario', onclick: descartar }, icono('close'), 'Descartar'),
    h('button', { type: 'button', class: 'boton boton-grande boton-primario', disabled: p.estado !== 'valida', onclick: aceptar },
      icono('check'), 'Añadir a mis recetas'));
}

// Vuelve a la pantalla anterior; si se abrió la receta directamente, al plan.
let anterior = null;
export const recordarAnterior = hash => { anterior = hash; };
function volver() {
  if (anterior && !anterior.startsWith('#receta')) history.back();
  else location.hash = esDeBiblioteca() ? '#recetas' : '#plan';
}

const partesRuta = () => location.hash.split('/').slice(1).map(decodeURIComponent);
const esDeBiblioteca = () => partesRuta().length === 1;

function buscar() {
  if (esDeBiblioteca()) {
    const comida = buscarReceta(partesRuta()[0]);
    return comida && { comida: comida, biblioteca: true, activo: false };
  }
  return buscarComida(...partesRuta());
}

export function pintarReceta(contenedor) {
  const encontrada = buscar();
  if (encontrada) pintar(contenedor, encontrada);
  return Boolean(encontrada);
}

export async function cargarReceta(contenedor) {
  if (pintarReceta(contenedor)) return;
  const [volverA, texto] = esDeBiblioteca() ? ['#recetas', 'Ir a Recetas'] : ['#plan', 'Ir a Plan'];
  contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando receta…'));
  try {
    if (esDeBiblioteca()) {
      const [recetas, propuestas] = await Promise.all([llamar('recetas'), llamar('propuestas'), actualizarPropias()]);
      guardarRecetas(recetas);
      guardarPropuestas(propuestas);
    }
    else guardarPlan(await llamar('plan'));
    if (!pintarReceta(contenedor)) contenedor.replaceChildren(vacio('Esta receta ya no está disponible.', texto, volverA));
  } catch (err) {
    contenedor.replaceChildren(vacio(err.message, texto, volverA));
  }
}
