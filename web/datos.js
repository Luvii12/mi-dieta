// Datos guardados en el móvil (última respuesta de «hoy» y del plan) y cambios que se guardan en Supabase.
// Los cambios se aplican primero en la copia local (la pantalla responde al momento) y, si el servidor
// falla, se deshacen.

import { llamar, leerLocal, guardarLocal, idsRecetasPropias } from './api.js';
import { hoyIso } from './comun.js';

const CACHE_HOY = 'dieta.ultimoHoy';
const CACHE_PLAN = 'dieta.plan';
const CACHE_RECETAS = 'dieta.recetas';
const CACHE_PROPUESTAS = 'dieta.propuestas';
const CACHE_PROPIAS = 'dieta.recetasPropias';
const CACHE_CONFIG = 'dieta.config';

export const leerPlan = () => leerLocal(CACHE_PLAN);
export const guardarPlan = datos => guardarLocal(CACHE_PLAN, datos);
export const guardarHoy = hoy => guardarLocal(CACHE_HOY, hoy);
export const olvidarHoy = () => guardarLocal(CACHE_HOY, null);
export const leerRecetas = () => leerLocal(CACHE_RECETAS);
export const guardarRecetas = recetas => guardarLocal(CACHE_RECETAS, recetas);
export const leerPropuestas = () => leerLocal(CACHE_PROPUESTAS);
export const guardarPropuestas = propuestas => guardarLocal(CACHE_PROPUESTAS, propuestas);
export const esPropia = id => (leerLocal(CACHE_PROPIAS) || []).includes(id);

// Vuelve a pedir qué recetas son de esta cuenta. Sin conexión se queda con lo que había.
export async function actualizarPropias() {
  try {
    guardarLocal(CACHE_PROPIAS, await idsRecetasPropias());
  } catch (err) {
    // Se reintenta la próxima vez que se abra Recetas.
  }
}

// Receta de la biblioteca (o propuesta de la IA) con la misma forma que una comida del plan (para la
// pantalla «Receta»). Las propuestas llevan `propuesta` (estado, alimentos que faltan o motivo) y, si aún
// les falta un alimento, ingredientes con sus límites en vez de gramos y macros = null.
export function buscarReceta(id) {
  const r = (leerRecetas() || []).find(x => x.id === id);
  if (!r) {
    const p = (leerPropuestas() || []).find(x => x.id === id);
    if (!p) return null;
    return {
      comida: p.comida,
      receta_id: p.id,
      nombre: p.nombre,
      preparacion: p.preparacion,
      ingredientes: p.ajuste ? p.ajuste.ingredientes : (p.ingredientes || []),
      macros: p.ajuste ? p.ajuste.macros : null,
      propuesta: p,
    };
  }
  if (!r.ajuste) return null;
  return {
    comida: r.comida,
    receta_id: r.id,
    nombre: r.nombre,
    preparacion: r.preparacion,
    ingredientes: r.ajuste.ingredientes,
    macros: r.ajuste.macros,
    valoracion: r.valoracion,
    fueraDeMargen: Boolean(r.ajuste.evaluacion && !r.ajuste.evaluacion.ok),
  };
}

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
    [plan.activo, plan.siguiente, plan.borrador].filter(Boolean).forEach(p => p.dias.forEach(dia => cambiar(p.plan_id, dia)));
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
  for (const p of [plan.activo, plan.siguiente, plan.borrador]) {
    if (!p || p.plan_id !== planId) continue;
    const dia = p.dias.find(d => d.fecha === fecha);
    const c = dia && dia.comidas.find(x => x.comida === comida);
    if (c) return { comida: c, dia: dia, plan: p, activo: p === plan.activo, vista: ['activo', 'siguiente', 'borrador'].find(v => plan[v] === p) };
  }
  const hoy = leerHoy();
  if (hoy && hoy.plan_id === planId && hoy.fecha === fecha) {
    const c = hoy.comidas.find(x => x.comida === comida);
    if (c) return { comida: c, dia: hoy, plan: { plan_id: planId, inicio: hoy.inicio, fin: hoy.fin }, activo: true, vista: 'activo' };
  }
  return null;
}

// hecha: 'si', 'no', 'libre' o 'saltada' («No la hice»).
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
  const cambiar = v => {
    const recetas = leerRecetas();
    if (recetas) {
      recetas.filter(r => r.id === recetaId).forEach(r => { r.valoracion = v; });
      guardarRecetas(recetas);
    }
    modificarDias((id, dia) => dia.comidas.forEach(c => {
      if (c.receta_id === recetaId) c.valoracion = v;
    }));
  };
  const enBiblioteca = (leerRecetas() || []).find(r => r.id === recetaId);
  let antes = enBiblioteca ? enBiblioteca.valoracion : null;
  if (!enBiblioteca) {
    modificarDias((id, dia) => dia.comidas.forEach(c => {
      if (c.receta_id === recetaId) antes = c.valoracion;
    }));
  }
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

// Gramos elegidos de una comida ({alimento: g}; vacío = lo que calcula la app). Con `probar` solo dice cómo
// quedaría. Al guardar sustituye el día guardado; si cambia «Siempre en esta receta», también hay otras comidas
// del plan y otros gramos en la biblioteca: se vuelven a pedir.
export async function ajustarGramos(planId, fecha, comida, gramos, { siempre = false, probar = false } = {}) {
  const peticion = { plan_id: planId, fecha, comida, gramos, siempre, probar };
  if (probar) return llamar('ajustarGramos', peticion);
  const r = await llamar('ajustarGramos', peticion);
  modificarDias((id, dia) => {
    if (id !== planId || dia.fecha !== fecha) return;
    dia.comidas = r.dia.comidas;
    dia.macros = r.dia.macros;
    dia.evaluacion = r.dia.evaluacion;
    dia.revisar = r.dia.revisar;
  });
  const config = leerLocal(CACHE_CONFIG) || {};
  if (JSON.stringify(config.gramos_receta || {}) !== JSON.stringify(r.gramos_receta)) {
    guardarLocal(CACHE_CONFIG, Object.assign(config, { gramos_receta: r.gramos_receta }));
    guardarRecetas(null);
    try {
      guardarPlan(await llamar('plan'));
      avisarCambio();
    } catch (err) {
      // Se actualizará al abrir Plan.
    }
  }
  return r;
}

// ---------- Recetas propuestas por la IA ----------

// Llama a una acción que devuelve las propuestas actualizadas y las guarda.
async function conPropuestas(accion, extra) {
  const r = await llamar(accion, extra);
  guardarPropuestas(r.propuestas);
  avisarCambio();
  return r;
}

export const descartarPropuesta = id => conPropuestas('descartarPropuesta', { receta_id: id });
export const anadirAlimento = alimento => conPropuestas('anadirAlimento', { alimento });

// La receta pasa a la biblioteca: se vuelve a pedir la biblioteca para tenerla con sus gramos.
export async function aceptarPropuesta(id) {
  const r = await llamar('aceptarPropuesta', { receta_id: id });
  try {
    guardarRecetas(await llamar('recetas'));
  } catch (err) {
    // Se actualizará al abrir Recetas.
  }
  guardarPropuestas(r.propuestas);
  avisarCambio();
  return r;
}
