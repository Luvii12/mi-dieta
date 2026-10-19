// Arranque y navegación entre pantallas (#hoy, #plan, #recetas, #receta/…, #nueva, #editar/…, #pedir, #progreso,
// #ajustes, #perfil). Sin
// sesión, solo la pantalla de entrada; con una cuenta que aún no tiene objetivos, solo el alta.

import { haySesion, llamar, leerLocal, guardarLocal } from './api.js';
import { $, hoyIso } from './comun.js';
import { olvidarHoy } from './datos.js';
import { cargarHoy, pintarHoy } from './hoy.js';
import { cargarPlan, pintarPlan } from './plan.js';
import { cargarReceta, pintarReceta, recordarAnterior } from './receta.js';
import { cargarRecetas, pintarRecetas, precargarRecetas } from './recetas.js';
import { cargarEditor } from './editor.js';
import { cargarPedir } from './pedir.js';
import { cargarAjustes, prepararAjustes } from './ajustes.js';
import { cargarProgreso, prepararProgreso, precargarProgreso } from './progreso.js';
import { prepararPanel } from './cambiar.js';
import { pintarEntrar } from './entrar.js';
import { pintarPerfil, CLAVE_ALTA } from './perfil.js';

const VISTAS = ['hoy', 'plan', 'recetas', 'receta', 'editor', 'pedir', 'progreso', 'ajustes', 'perfil', 'entrar', 'alta'];
// Rutas que no se llaman como su pantalla: el editor de recetas (crear, mi versión y editar).
const RUTAS = { nueva: 'editor', editar: 'editor' };

const vistaActual = () => {
  if (!haySesion()) return 'entrar';
  if (leerLocal(CLAVE_ALTA) === true) return 'alta';
  const parte = location.hash.slice(1).split('/')[0];
  const nombre = RUTAS[parte] || parte;
  return VISTAS.includes(nombre) && nombre !== 'entrar' && nombre !== 'alta' ? nombre : 'hoy';
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
    if (a.dataset.vista === (vista === 'editor' || vista === 'pedir' ? 'recetas' : vista)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);

  if (vista === 'entrar') {
    pintarEntrar($('vista-entrar'), alEntrar);
    return;
  }
  if (vista === 'alta' || vista === 'perfil') {
    pintarPerfil($('vista-' + vista), vista === 'alta', irA);
    return;
  }
  if (vista === 'hoy') cargarHoy($('vista-hoy'));
  if (vista === 'plan') cargarPlan($('vista-plan'));
  if (vista === 'recetas') cargarRecetas($('vista-recetas'));
  if (vista === 'receta') cargarReceta($('vista-receta'));
  if (vista === 'editor') cargarEditor($('vista-editor'));
  if (vista === 'pedir') cargarPedir($('vista-pedir'));
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

// A otra pantalla (también si ya se estaba en ella: tras el alta, #plan se vuelve a pintar).
function irA(hash) {
  if (location.hash === hash) mostrarVista();
  else location.hash = hash;
}

// ¿Tiene la cuenta objetivos? Si no, toca el alta. Sin conexión no se sabe: se deja como estaba.
async function comprobarAlta() {
  try {
    const config = await llamar('config');
    guardarLocal('dieta.config', config);
    guardarLocal(CLAVE_ALTA, !config.objetivo_desayuno);
  } catch (err) {
    // Se comprobará la próxima vez.
  }
}

// Tras entrar: al alta si la cuenta es nueva; si no, a Hoy, y después se precarga lo demás.
async function alEntrar() {
  await comprobarAlta();
  irA('#hoy');
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
// Sesión abierta pero sin la configuración guardada (p. ej. entró antes de que existiera el alta).
if (haySesion() && !leerLocal('dieta.config')) comprobarAlta().then(() => { if (vistaActual() === 'alta') mostrarVista(); });

// Generación automática: una vez al día, al abrir la app, el motor
// genera el borrador del siguiente plan si al activo le quedan 2 días o menos. Hoy enseña entonces su aviso.
const CLAVE_REVISADO = 'dieta.planRevisado';
async function revisarPlan() {
  if (leerLocal(CLAVE_REVISADO) === hoyIso()) return;
  try {
    const r = await llamar('revisarFinDePlan');
    guardarLocal(CLAVE_REVISADO, hoyIso());
    if (!r.generado) return;
    olvidarHoy();
    if (vistaActual() === 'hoy') cargarHoy($('vista-hoy'));
    if (vistaActual() === 'plan') cargarPlan($('vista-plan'));
  } catch (err) {
    // Sin conexión o con un error: se vuelve a intentar la próxima vez que se abra.
  }
}

// Al abrir la app, después de la pantalla actual, se revisa si toca generar el siguiente plan y se descargan
// Recetas y Progreso en segundo plano para que esas pestañas se vean al momento y ya actualizadas.
function precargar() {
  if (!haySesion() || !navigator.onLine || vistaActual() === 'alta') return;
  revisarPlan();
  if (vistaActual() !== 'recetas') precargarRecetas();
  if (vistaActual() !== 'progreso') precargarProgreso();
}
setTimeout(precargar, 2500);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app funciona igual, solo que no sin conexión.
  });
}
