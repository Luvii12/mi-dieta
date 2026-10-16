// Arranque y navegación entre pantallas (#hoy, #plan, #recetas, #receta/…, #progreso, #ajustes).

import { leerConexion } from './api.js';
import { $ } from './comun.js';
import { cargarHoy, pintarHoy, vacio } from './hoy.js';
import { cargarPlan, pintarPlan } from './plan.js';
import { cargarReceta, pintarReceta, recordarAnterior } from './receta.js';
import { cargarRecetas, pintarRecetas } from './recetas.js';
import { cargarAjustes, prepararAjustes } from './ajustes.js';
import { cargarProgreso, prepararProgreso } from './progreso.js';
import { prepararPanel } from './cambiar.js';

const VISTAS = ['hoy', 'plan', 'recetas', 'receta', 'progreso', 'ajustes'];
// Pantallas que necesitan la conexión con la hoja configurada.
const NECESITAN_CONEXION = { hoy: 'Conecta la app con tu hoja de Google para empezar.', plan: 'Conecta la app con tu hoja de Google para ver tu plan.',
  recetas: 'Conecta la app con tu hoja de Google para ver tus recetas.',
  progreso: 'Conecta la app con tu hoja de Google para registrar tu peso.' };

const vistaActual = () => {
  const nombre = location.hash.slice(1).split('/')[0];
  return VISTAS.includes(nombre) ? nombre : 'hoy';
};

let hashAnterior = null;

function mostrarVista() {
  const vista = vistaActual();
  recordarAnterior(hashAnterior);
  hashAnterior = location.hash;
  VISTAS.forEach(nombre => { $('vista-' + nombre).hidden = nombre !== vista; });
  document.body.dataset.vista = vista;
  // Pestaña activa de la barra inferior (la receta no tiene: tapa la barra con su botón).
  document.querySelectorAll('.navegacion a').forEach(a => {
    if (a.dataset.vista === vista) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);

  const { url, token } = leerConexion();
  if (NECESITAN_CONEXION[vista] && (!url || !token)) {
    $('vista-' + vista).replaceChildren(vacio(NECESITAN_CONEXION[vista], 'Ir a Ajustes', '#ajustes'));
    return;
  }
  if (vista === 'hoy') cargarHoy($('vista-hoy'));
  if (vista === 'plan') cargarPlan($('vista-plan'));
  if (vista === 'recetas') cargarRecetas($('vista-recetas'));
  if (vista === 'receta') cargarReceta($('vista-receta'));
  if (vista === 'progreso') cargarProgreso($('vista-progreso'));
  if (vista === 'ajustes') cargarAjustes();
}

// Tras marcar, valorar o cambiar un plato, la pantalla abierta se vuelve a pintar con los datos guardados
// y el foco vuelve al mismo botón.
function repintar() {
  const foco = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.foco : null;
  const vista = vistaActual();
  if (vista === 'hoy') pintarHoy($('vista-hoy'));
  if (vista === 'plan') pintarPlan($('vista-plan'));
  if (vista === 'recetas') pintarRecetas($('vista-recetas'));
  if (vista === 'receta') pintarReceta($('vista-receta'));
  if (foco) {
    const elemento = document.querySelector(`#vista-${vista} [data-foco="${foco}"]`);
    if (elemento) elemento.focus();
  }
}

function actualizarRed() {
  $('estado-red').hidden = navigator.onLine;
}

prepararAjustes();
prepararProgreso();
prepararPanel();
document.addEventListener('datos-cambiados', repintar);
window.addEventListener('hashchange', mostrarVista);
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);
actualizarRed();
mostrarVista();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app funciona igual, solo que no sin conexión.
  });
}
