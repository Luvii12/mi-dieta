// Panel «Cambiar cantidades» (desde «Receta», en las comidas que se pueden cambiar): la persona pone los gramos
// que quiere de algún ingrediente (p. ej. su bollo de pan pesa 50 g) y el optimizador recalcula el resto.
// Mientras escribe se ve cómo quedaría; «Siempre en esta receta» lo guarda también para sus próximas comidas
// con ese plato y para los planes nuevos.

import { leerLocal } from './api.js';
import { $, h, icono, numero, avisar, pastillasMacros } from './comun.js';
import { ajustarGramos } from './datos.js';

const ESPERA_MS = 400; // tras dejar de escribir, se calcula cómo quedaría

let estado = null; // {planId, fecha, comida, siempre, elegidos: Set de alimentos, filas: {alimento: {ing, input, fila, texto, accion}}}
let temporizador = null;
let ultimaPrueba = 0;

const unidad = ing => (ing.alimento.endsWith('_ml') ? 'ml' : 'g');
const aTexto = g => String(g).replace('.', ',');

function detalle(ing) {
  if (estado.elegidos.has(ing.alimento)) return 'Elegido por ti';
  const crudo = ing.estado === 'cocinado' ? 'cocinado' : 'en crudo';
  return ing.escalable ? `${crudo} · lo calcula la app` : `${crudo} · cantidad fija`;
}

// Una fila por ingrediente: nombre, gramos y, si lo ha elegido la persona, botón para que vuelva a calcularlo la app.
function pintarFila(alimento) {
  const datos = estado.filas[alimento];
  datos.texto = h('span', { class: 'fila-alimento-detalle' });
  datos.accion = h('span');
  datos.fila = h('li', { class: 'ingrediente-editor' },
    h('span', { class: 'fila-alimento-texto' }, h('span', { class: 'fila-alimento-nombre' }, datos.ing.nombre), datos.texto),
    h('span', { class: 'campo-caja campo-gramos' }, datos.input, h('span', { class: 'campo-unidad' }, unidad(datos.ing))),
    datos.accion);
  repintarFila(alimento);
  return datos.fila;
}

// Pone al día la fila (elegido o no) sin tocar su campo, para no perder el foco mientras se escribe.
function repintarFila(alimento) {
  const datos = estado.filas[alimento];
  const elegido = estado.elegidos.has(alimento);
  datos.fila.classList.toggle('ingrediente-elegido', elegido);
  datos.texto.textContent = detalle(datos.ing);
  const accion = elegido
    ? h('button', { type: 'button', class: 'boton-icono', 'aria-label': `Que la app calcule ${datos.ing.nombre}`,
      onclick: () => {
        estado.elegidos.delete(alimento);
        repintarFila(alimento);
        datos.input.focus();
        probar();
      } }, icono('undo'))
    : h('span', { class: 'hueco-boton', 'aria-hidden': 'true' });
  datos.accion.replaceWith(accion);
  datos.accion = accion;
}

// {alimento: g} de los ingredientes elegidos; null (y el aviso) si alguno no es un número válido.
function leerElegidos() {
  const gramos = {};
  for (const alimento of estado.elegidos) {
    const { ing, input } = estado.filas[alimento];
    const g = Number(input.value.trim().replace(',', '.'));
    if (input.value.trim() === '' || !(g >= 0 && g <= 2000)) {
      $('cantidades-estado').textContent = `Revisa los gramos de ${ing.nombre} (de 0 a 2.000).`;
      return null;
    }
    gramos[alimento] = g;
  }
  $('cantidades-estado').textContent = '';
  return gramos;
}

function pintarResumen(macros, dia, objetivoDia) {
  const resumen = $('cantidades-resumen');
  if (!macros) return resumen.replaceChildren();
  resumen.replaceChildren(pastillasMacros(macros), !dia ? '' : dia.evaluacion && dia.evaluacion.ok
    ? h('span', { class: 'alternativa-nota texto-secundario' }, icono('check_circle', 'relleno'), 'El día sigue cuadrando')
    : h('span', { class: 'alternativa-nota texto-terciario' }, icono('error'),
      `El día quedaría en ${numero(dia.macros.kcal)} kcal (objetivo ${numero(objetivoDia.kcal)})`));
}

// Calcula cómo quedaría (sin guardar) y pone los gramos nuevos en los ingredientes que calcula la app.
async function probar() {
  clearTimeout(temporizador);
  const gramos = leerElegidos();
  if (!gramos) return;
  const numeroPrueba = ++ultimaPrueba;
  const { planId, fecha, comida } = estado;
  try {
    const r = await ajustarGramos(planId, fecha, comida, gramos, { probar: true });
    if (!estado || numeroPrueba !== ultimaPrueba) return;
    Object.keys(estado.filas).forEach(alimento => {
      if (estado.elegidos.has(alimento)) return;
      const nuevo = r.comida.ingredientes.find(i => i.alimento === alimento);
      estado.filas[alimento].input.value = aTexto(nuevo ? nuevo.gramos : 0);
    });
    pintarResumen(r.comida.macros, r.dia, r.objetivoDia);
  } catch (err) {
    if (numeroPrueba === ultimaPrueba) $('cantidades-estado').textContent = err.message;
  }
}

function ponerSiempre(valor) {
  estado.siempre = valor;
  $('cantidades-siempre').setAttribute('aria-checked', String(valor));
}

async function guardar(gramos, siempre, mensaje) {
  const botones = $('form-cantidades').querySelectorAll('button');
  botones.forEach(b => { b.disabled = true; });
  $('cantidades-estado').textContent = '';
  try {
    await ajustarGramos(estado.planId, estado.fecha, estado.comida, gramos, { siempre });
    $('panel-cantidades').close();
    avisar(mensaje);
  } catch (err) {
    $('cantidades-estado').textContent = err.message;
  } finally {
    botones.forEach(b => { b.disabled = false; });
  }
}

// comida: la del plan (con ingredientes, macros, receta_id y fijados).
export function abrirCantidades(planId, fecha, comida) {
  const gramosReceta = (leerLocal('dieta.config') || {}).gramos_receta || {};
  estado = { planId, fecha, comida: comida.comida, siempre: false, elegidos: new Set(Object.keys(comida.fijados || {})), filas: {} };
  ponerSiempre(Boolean(gramosReceta[comida.receta_id]));
  comida.ingredientes.forEach(ing => {
    const input = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: aTexto(ing.gramos),
      'aria-label': `${unidad(ing) === 'ml' ? 'Mililitros' : 'Gramos'} de ${ing.nombre}`,
      oninput: () => {
        if (!estado.elegidos.has(ing.alimento)) {
          estado.elegidos.add(ing.alimento);
          repintarFila(ing.alimento);
        }
        clearTimeout(temporizador);
        temporizador = setTimeout(probar, ESPERA_MS);
      } });
    estado.filas[ing.alimento] = { ing, input };
  });
  $('cantidades-lista').replaceChildren(...comida.ingredientes.map(ing => pintarFila(ing.alimento)));
  $('cantidades-estado').textContent = '';
  pintarResumen(comida.macros, null);
  $('panel-cantidades').showModal();
}

export function prepararCantidades() {
  const panel = $('panel-cantidades');
  $('cantidades-cerrar').addEventListener('click', () => panel.close());
  panel.addEventListener('click', e => { if (e.target === panel) panel.close(); });
  panel.addEventListener('close', () => {
    clearTimeout(temporizador);
    estado = null;
    const volver = document.querySelector('[data-foco="cambiar-cantidades"]');
    if (volver) volver.focus();
  });
  $('cantidades-siempre').addEventListener('click', () => ponerSiempre(!estado.siempre));
  $('cantidades-restablecer').addEventListener('click', () =>
    guardar({}, false, 'Cantidades calculadas de nuevo por la app.'));
  $('form-cantidades').addEventListener('submit', evento => {
    evento.preventDefault();
    const gramos = leerElegidos();
    if (!gramos) return;
    guardar(gramos, estado.siempre, estado.siempre && Object.keys(gramos).length
      ? 'Cantidades guardadas, también para tus próximas comidas con este plato.' : 'Cantidades guardadas.');
  });
}
