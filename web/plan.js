// Pantalla «Plan»: los 14 días del plan activo (o del borrador), navegables por día
// (design/mi_dieta_plan_14_d_as). Desde aquí se genera y se activa el plan.

import { llamar } from './api.js';
import { $, h, icono, numero, fechaTitulo, fechaCorta, diaDeSemana, hoyIso, diasEntre, tesela, enlaceReceta, estaHecha } from './comun.js';
import { leerPlan, guardarPlan, olvidarHoy } from './datos.js';
import { vacio } from './hoy.js';

// Qué plan se está viendo ('activo' o 'borrador') y qué día de cada uno.
let vista = null;
const diaElegido = {};

function planVisible(datos) {
  if (vista && datos[vista]) return vista;
  return datos.activo ? 'activo' : 'borrador';
}

function tiraDias(plan, elegido) {
  const hoy = hoyIso();
  const tira = h('div', { class: 'tira-dias', role: 'group', 'aria-label': 'Días del plan' },
    plan.dias.map(dia => {
      const { letra, dia: numeroDia } = diaDeSemana(dia.fecha);
      const completo = dia.comidas.length > 0 && dia.comidas.every(estaHecha);
      const esHoy = dia.fecha === hoy;
      let marca = h('span', { class: 'dia-punto' });
      if (dia.revisar) marca = h('span', { class: 'dia-punto dia-punto-error' });
      if (completo) marca = h('span', { class: 'dia-check' }, icono('check', 'relleno'));
      return h('button', {
        type: 'button',
        class: 'dia' + (dia.fecha === elegido ? ' dia-elegido' : '') + (completo ? ' dia-completo' : ''),
        'aria-pressed': dia.fecha === elegido ? 'true' : 'false',
        'aria-label': fechaTitulo(dia.fecha) + (esHoy ? ' (hoy)' : '') + (completo ? ', completado' : '') + (dia.revisar ? ', para revisar' : ''),
        'data-foco': 'dia-' + dia.fecha,
        onclick: () => { diaElegido[plan.plan_id] = dia.fecha; pintarPlan($('vista-plan')); },
      },
      esHoy ? h('span', { class: 'dia-hoy' }, 'HOY') : null,
      h('span', { class: 'dia-letra' }, letra),
      h('span', { class: 'dia-numero' }, numeroDia),
      marca);
    }));
  return tira;
}

function tarjetaComida(plan, dia, c) {
  return h('a', { class: 'tarjeta comida-plan', href: enlaceReceta(plan.plan_id, dia.fecha, c.comida) },
    tesela(c.comida, 'tesela-sm'),
    h('span', { class: 'comida-plan-info' },
      h('span', { class: 'comida-linea' },
        h('span', { class: 'etiqueta-comida etiqueta-suave' }, c.comida),
        h('span', { class: 'pastilla-kcal-plan' }, `${numero(c.macros.kcal)} kcal`)),
      h('span', { class: 'comida-plan-nombre' }, c.nombre),
      h('span', { class: 'pastillas' },
        h('span', { class: 'pastilla pastilla-proteina' }, `${numero(c.macros.P)}g Prot`),
        h('span', { class: 'pastilla pastilla-carbo' }, `${numero(c.macros.C)}g Carb`),
        h('span', { class: 'pastilla pastilla-grasa' }, `${numero(c.macros.G)}g Gra`))),
    estaHecha(c) ? icono('check_circle', 'relleno comida-plan-hecha') : icono('chevron_right', 'comida-plan-flecha'));
}

function totalDia(dia, objetivo) {
  const m = dia.macros;
  const kcalMacros = m.P * 4 + m.C * 4 + m.G * 9;
  const pct = g => kcalMacros > 0 ? Math.round(g / kcalMacros * 100) : 0;
  const reparto = [
    { clase: 'proteina', letra: 'P', g: m.P, pct: pct(m.P * 4) },
    { clase: 'carbo', letra: 'C', g: m.C, pct: pct(m.C * 4) },
    { clase: 'grasa', letra: 'G', g: m.G, pct: pct(m.G * 9) },
  ];
  return h('section', { class: 'total-dia', 'aria-label': 'Total del día' },
    h('div', { class: 'total-cabecera' },
      h('div', null,
        h('span', { class: 'total-kcal' }, `Total día: ${numero(m.kcal)} kcal`),
        h('span', { class: 'total-meta' }, ` / ${numero(objetivo.kcal)} meta`)),
      dia.revisar
        ? h('span', { class: 'insignia insignia-error' }, icono('error', 'relleno'), 'Fuera de margen')
        : h('span', { class: 'insignia insignia-ok-fuerte' }, icono('check_circle', 'relleno'), 'Dentro del objetivo')),
    h('div', { class: 'barra-segmentada', 'aria-hidden': 'true' },
      reparto.map(r => h('div', { class: 'segmento relleno-' + r.clase, style: `width: ${r.pct}%` }))),
    h('div', { class: 'leyenda' }, reparto.map(r =>
      h('span', { class: 'leyenda-item' },
        h('span', { class: 'punto-leyenda relleno-' + r.clase }),
        h('span', { class: 'leyenda-valor' }, `${r.letra} ${numero(r.g)}g`),
        h('span', { class: 'leyenda-pct' }, `(${r.pct}%)`)))));
}

function boton(texto, clase, accion) {
  return h('button', { type: 'button', class: 'boton ' + clase, onclick: accion }, texto);
}

function pintar(contenedor, datos) {
  contenedor.replaceChildren(h('p', { id: 'plan-mensaje', class: 'mensaje', role: 'status' }));
  if (!datos.activo && !datos.borrador) {
    const caja = vacio('Todavía no tienes ningún plan. Se generan 14 días a partir del lunes que viene, con tus recetas y tus objetivos.');
    caja.append(boton('Generar plan', 'boton-primario', () => generarPlan(datos)));
    contenedor.prepend(caja);
    return;
  }
  vista = planVisible(datos);
  const plan = datos[vista];
  const hoy = hoyIso();
  let elegido = diaElegido[plan.plan_id];
  if (!plan.dias.some(d => d.fecha === elegido)) elegido = plan.dias.some(d => d.fecha === hoy) ? hoy : plan.dias[0].fecha;
  diaElegido[plan.plan_id] = elegido;
  const dia = plan.dias.find(d => d.fecha === elegido);
  const indice = diasEntre(plan.inicio, elegido);

  const partes = [];
  if (datos.activo && datos.borrador) {
    partes.push(h('div', { class: 'selector', role: 'group', 'aria-label': 'Plan que se muestra' },
      ['activo', 'borrador'].map(v => h('button', {
        type: 'button', class: 'selector-opcion', 'aria-pressed': v === vista ? 'true' : 'false',
        onclick: () => { vista = v; pintar(contenedor, datos); },
      }, v === 'activo' ? 'Plan activo' : 'Borrador'))));
  }
  partes.push(
    h('div', { class: 'plan-cabecera' },
      h('div', { class: 'plan-titulo' },
        h('h1', null, `Plan del ${fechaCorta(plan.inicio)} al ${fechaCorta(plan.fin)}`),
        vista === 'activo'
          ? h('span', { class: 'insignia insignia-activo' }, h('span', { class: 'punto-activo' }), 'Activo')
          : h('span', { class: 'insignia insignia-borrador' }, 'Borrador')),
      h('p', { class: 'subtitulo' }, `Semana ${indice < 7 ? 1 : 2} de 2 · ${plan.dias.length} días personalizados`)),
    tiraDias(plan, elegido),
    h('div', { class: 'dia-cabecera' },
      h('h2', null, fechaTitulo(dia.fecha)),
      h('p', { class: 'subtitulo' }, `${dia.comidas.length} comidas planificadas`)),
    h('div', { class: 'lista-comidas lista-plan' }, dia.comidas.map(c => tarjetaComida(plan, dia, c))),
    totalDia(dia, plan.objetivoDia));

  const aRevisar = plan.dias.filter(d => d.revisar).length;
  const acciones = h('div', { class: 'acciones-plan' });
  if (vista === 'borrador') {
    acciones.append(
      h('p', { class: 'subtitulo' }, aRevisar ? `${aRevisar} día(s) no cumplen la tolerancia.` : 'Los 14 días cumplen la tolerancia.'),
      boton('Activar plan', 'boton-primario', () => activarPlan(datos, plan.plan_id)),
      boton('Generar otro borrador', 'boton-secundario', () => generarPlan(datos)));
  } else if (!datos.borrador) {
    acciones.append(boton('Generar el siguiente plan', 'boton-secundario', () => generarPlan(datos)));
  }
  partes.push(acciones);
  contenedor.prepend(...partes);

  // La tira empieza en el día elegido (sin mover la página).
  const tira = contenedor.querySelector('.tira-dias');
  const activo = tira.querySelector('.dia-elegido');
  if (activo) tira.scrollLeft = activo.offsetLeft - tira.clientWidth / 2 + activo.clientWidth / 2;
}

function mensaje(texto, esError) {
  const m = $('plan-mensaje');
  if (!m) return;
  m.textContent = texto;
  m.classList.toggle('mensaje-error', Boolean(esError));
}

function bloquear(si) {
  $('vista-plan').querySelectorAll('button').forEach(b => { b.disabled = si; });
}

async function generarPlan(datos) {
  if (datos.borrador && !confirm('Se sustituirá el borrador actual por uno nuevo. ¿Seguir?')) return;
  bloquear(true);
  mensaje('Generando 14 días… puede tardar unos segundos.');
  try {
    const borrador = await llamar('generarPlan');
    const nuevos = Object.assign({}, datos, { borrador });
    guardarPlan(nuevos);
    vista = 'borrador';
    pintar($('vista-plan'), nuevos);
    if (borrador.descartadas && borrador.descartadas.length) {
      mensaje(`Recetas no usadas: ${borrador.descartadas.map(d => `${d.id} (${d.motivo})`).join(', ')}.`);
    }
  } catch (err) {
    bloquear(false);
    mensaje(err.message, true);
  }
}

async function activarPlan(datos, planId) {
  bloquear(true);
  mensaje('Activando…');
  try {
    await llamar('activarPlan', { plan_id: planId });
    olvidarHoy();
    const nuevos = await llamar('plan');
    guardarPlan(nuevos);
    vista = 'activo';
    pintar($('vista-plan'), nuevos);
    mensaje(`Plan activado. Lo verás en «Hoy» desde el ${fechaTitulo(nuevos.activo.inicio).toLowerCase()}.`);
  } catch (err) {
    bloquear(false);
    mensaje(err.message, true);
  }
}

export function pintarPlan(contenedor) {
  const datos = leerPlan();
  if (datos) pintar(contenedor, datos);
  return Boolean(datos);
}

export async function cargarPlan(contenedor) {
  const habia = pintarPlan(contenedor);
  if (!habia) contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando plan…'));
  try {
    const datos = await llamar('plan');
    guardarPlan(datos);
    pintar(contenedor, datos);
  } catch (err) {
    if (!habia) contenedor.replaceChildren(vacio(err.message));
  }
}
