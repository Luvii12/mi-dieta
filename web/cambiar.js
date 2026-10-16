// Panel «Cambiar plato»: otras recetas de la misma comida con los gramos recalculados, y «Comida libre».

import { leerLocal } from './api.js';
import { $, h, icono, numero, tesela, pastillasMacros } from './comun.js';
import { alternativas, cambiarPlato, marcarComida } from './datos.js';

function opcion(contenido, accion) {
  return h('li', null, h('button', { type: 'button', class: 'alternativa', onclick: accion }, contenido));
}

// Ejecuta un cambio con el panel bloqueado; si sale bien lo cierra, si falla lo dice dentro del panel.
async function aplicar(accion) {
  const panel = $('panel-cambiar');
  panel.querySelectorAll('button.alternativa').forEach(b => { b.disabled = true; });
  $('panel-estado').textContent = 'Guardando…';
  try {
    await accion();
    panel.close();
  } catch (err) {
    $('panel-estado').textContent = err.message;
    panel.querySelectorAll('button.alternativa').forEach(b => { b.disabled = false; });
  }
}

export async function abrirCambiarPlato(planId, fecha, comida) {
  const panel = $('panel-cambiar');
  const lista = $('panel-lista');
  $('panel-titulo').textContent = `Cambiar ${comida.comida.toLowerCase()}`;
  $('panel-estado').textContent = 'Buscando recetas…';
  lista.replaceChildren();
  panel.showModal();

  // Con «Comida libre semanal» apagada en Ajustes no se ofrece.
  const libre = (leerLocal('dieta.config') || {}).comida_libre_semanal === false ? null : opcion([
    h('span', { class: 'tesela tesela-libre', 'aria-hidden': 'true' }, icono('celebration')),
    h('span', { class: 'alternativa-texto' },
      h('span', { class: 'alternativa-nombre' }, 'Comida libre'),
      h('span', { class: 'alternativa-nota' }, 'Comes fuera del plan. Cuenta como hecha.')),
  ], () => aplicar(() => marcarComida(planId, fecha, comida.comida, 'libre')));

  let opciones;
  try {
    opciones = await alternativas(planId, fecha, comida.comida);
  } catch (err) {
    if (!panel.open) return;
    $('panel-estado').textContent = err.message;
    if (libre) lista.replaceChildren(libre);
    return;
  }
  if (!panel.open) return;
  $('panel-estado').textContent = opciones.length ? 'Gramos recalculados para tu objetivo.' : 'No hay otras recetas para esta comida.';
  lista.replaceChildren(
    ...opciones.map(o => opcion([
      tesela(comida.comida),
      h('span', { class: 'alternativa-texto' },
        h('span', { class: 'alternativa-nombre' }, o.nombre),
        pastillasMacros(o.macros),
        o.diaOk ? h('span', { class: 'alternativa-nota texto-secundario' }, icono('check_circle', 'relleno'), 'El día sigue cuadrando')
          : h('span', { class: 'alternativa-nota texto-terciario' }, icono('error'), `El día quedaría en ${numero(o.macrosDia.kcal)} kcal`)),
    ], () => aplicar(() => cambiarPlato(planId, fecha, comida.comida, o.receta_id)))),
    libre || '');
}

export function prepararPanel() {
  const panel = $('panel-cambiar');
  $('panel-cerrar').addEventListener('click', () => panel.close());
  // Tocar fuera del panel lo cierra.
  panel.addEventListener('click', e => { if (e.target === panel) panel.close(); });
}
