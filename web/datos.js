// Datos guardados en el móvil (última respuesta de «hoy» y del plan) y cambios que se envían a Apps Script.
// Los cambios se aplican primero en la copia local (la pantalla responde al momento) y, si el servidor
// falla, se deshacen.

import { llamar, leerLocal, guardarLocal } from './api.js';
import { hoyIso } from './comun.js';

const CACHE_HOY = 'dieta.ultimoHoy';
const CACHE_PLAN = 'dieta.plan';

export const leerPlan = () => leerLocal(CACHE_PLAN);
export const guardarPlan = datos => guardarLocal(CACHE_PLAN, datos);
export const guardarHoy = hoy => guardarLocal(CACHE_HOY, hoy);
export const olvidarHoy = () => guardarLocal(CACHE_HOY, null);

// Avisa a la pantalla abierta de que los datos guardados han cambiado.
const avisarCambio = () => document.dispatchEvent(new Event('datos-cambiados'));

// Sin conexión: la última respuesta de «hoy» si es de hoy; si no, el día de hoy del plan activo guardado.
export function leerHoy() {
  const fecha = hoyIso();
  const guardado = leerLocal(CACHE_HOY);
  if (guardado && guardado.fecha === fecha) return guardado;
  const activo = (leerPlan() || {}).activo;
  const dia = activo && activo.dias.find(d => d.fecha === fecha);
  if (dia) return Object.assign({ plan_id: activo.plan_id, inicio: activo.inicio, fin: activo.fin, objetivoDia: activo.objetivoDia }, dia);
  return null;
}

// Recorre los días guardados (el de «hoy» y los de los planes) para cambiarlos todos a la vez.
function modificarDias(cambiar) {
  const hoy = leerLocal(CACHE_HOY);
  if (hoy && hoy.plan_id) {
    cambiar(hoy.plan_id, hoy);
    guardarLocal(CACHE_HOY, hoy);
  }
  const plan = leerPlan();
  if (plan) {
    [plan.activo, plan.borrador].filter(Boolean).forEach(p => p.dias.forEach(dia => cambiar(p.plan_id, dia)));
    guardarPlan(plan);
  }
  avisarCambio();
}

function parchearComida(planId, fecha, comida, cambios) {
  modificarDias((id, dia) => {
    if (id !== planId || dia.fecha !== fecha) return;
    dia.comidas.filter(c => c.comida === comida).forEach(c => Object.assign(c, cambios));
  });
}

// Una comida guardada, con su día y su plan. null si no está en el móvil.
export function buscarComida(planId, fecha, comida) {
  const plan = leerPlan() || {};
  for (const p of [plan.activo, plan.borrador]) {
    if (!p || p.plan_id !== planId) continue;
    const dia = p.dias.find(d => d.fecha === fecha);
    const c = dia && dia.comidas.find(x => x.comida === comida);
    if (c) return { comida: c, dia: dia, plan: p, activo: p === plan.activo };
  }
  const hoy = leerHoy();
  if (hoy && hoy.plan_id === planId && hoy.fecha === fecha) {
    const c = hoy.comidas.find(x => x.comida === comida);
    if (c) return { comida: c, dia: hoy, plan: { plan_id: planId, inicio: hoy.inicio, fin: hoy.fin }, activo: true };
  }
  return null;
}

// hecha: 'si', 'no' o 'libre'.
export async function marcarComida(planId, fecha, comida, hecha) {
  const encontrada = buscarComida(planId, fecha, comida);
  const antes = encontrada ? encontrada.comida.hecha : 'no';
  parchearComida(planId, fecha, comida, { hecha });
  try {
    await llamar('marcarComida', { plan_id: planId, fecha, comida, hecha });
  } catch (err) {
    parchearComida(planId, fecha, comida, { hecha: antes });
    throw err;
  }
}

export async function valorar(recetaId, valor) {
  const cambiar = v => modificarDias((id, dia) => dia.comidas.forEach(c => {
    if (c.receta_id === recetaId) c.valoracion = v;
  }));
  let antes = null;
  modificarDias((id, dia) => dia.comidas.forEach(c => {
    if (c.receta_id === recetaId) antes = c.valoracion;
  }));
  cambiar(valor);
  try {
    await llamar('valorar', { receta_id: recetaId, valor });
  } catch (err) {
    cambiar(antes);
    throw err;
  }
}

export const alternativas = (planId, fecha, comida) => llamar('alternativas', { plan_id: planId, fecha, comida });

// Cambia el plato en el servidor y sustituye el día guardado por el que devuelve (gramos y macros nuevos).
export async function cambiarPlato(planId, fecha, comida, recetaId) {
  const nuevo = await llamar('cambiarPlato', { plan_id: planId, fecha, comida, receta_id: recetaId });
  modificarDias((id, dia) => {
    if (id !== planId || dia.fecha !== fecha) return;
    dia.comidas = nuevo.comidas;
    dia.macros = nuevo.macros;
    dia.evaluacion = nuevo.evaluacion;
    dia.revisar = nuevo.revisar;
  });
}
