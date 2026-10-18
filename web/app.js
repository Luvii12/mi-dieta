// Arranque y navegación entre pantallas (#hoy, #plan, #recetas, #receta/…, #progreso, #ajustes). Sin sesión,
// solo la pantalla de entrada.

import { haySesion } from './api.js';
import { $ } from './comun.js';
import { cargarHoy, pintarHoy } from './hoy.js';
import { cargarPlan, pintarPlan } from './plan.js';
import { cargarReceta, pintarReceta, recordarAnterior } from './receta.js';
import { cargarRecetas, pintarRecetas, precargarRecetas } from './recetas.js';
import { cargarAjustes, prepararAjustes } from './ajustes.js';
import { cargarProgreso, prepararProgreso, precargarProgreso } from './progreso.js';
import { prepararPanel } from './cambiar.js';
import { pintarEntrar } from './entrar.js';

const VISTAS = ['hoy', 'plan', 'recetas', 'receta', 'progreso', 'ajustes', 'entrar'];

const vistaActual = () => {
  if (!haySesion()) return 'entrar';
  const nombre = location.hash.slice(1).split('/')[0];
  return VISTAS.includes(nombre) && nombre !== 'entrar' ? nombre : 'hoy';
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

  if (vista === 'entrar') {
    pintarEntrar($('vista-entrar'), alEntrar);
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

// Tras entrar: a Hoy, y después se precarga lo demás.
function alEntrar() {
  if (location.hash && location.hash !== '#hoy') location.hash = '#hoy';
  else mostrarVista();
  setTimeout(precargar, 2500);
}

prepararAjustes();
prepararProgreso();
prepararPanel();
document.addEventListener('datos-cambiados', repintar);
document.addEventListener('sesion-cerrada', mostrarVista);
window.addEventListener('hashchange', mostrarVista);
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);
actualizarRed();
mostrarVista();

// Al abrir la app, después de la pantalla actual, se descargan Recetas y Progreso en segundo plano para que
// esas pestañas se vean al momento y ya actualizadas.
function precargar() {
  if (!haySesion() || !navigator.onLine) return;
  if (vistaActual() !== 'recetas') precargarRecetas();
  if (vistaActual() !== 'progreso') precargarProgreso();
}
setTimeout(precargar, 2500);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app funciona igual, solo que no sin conexión.
  });
}
