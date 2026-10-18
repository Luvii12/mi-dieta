// Vista «Nuevo plan» del borrador, dentro de la pestaña Plan: balance del bloque que termina, propuesta
// de ajuste (2 opciones) y los días del menú para revisar y activar (design/mi_dieta_nuevo_plan_fin_de_bloque).

import { h, icono, numero, fechaTitulo, fechaCorta, enlaceReceta } from './comun.js';

const DIAS_VISIBLES = 3;
// Opción elegida por plan (kcal de ajuste) y si se ven todos los días.
const eleccion = {};
const todos = {};

const TITULOS = {
  en_ritmo: 'Mantener calorías: vas al ritmo objetivo',
  lento: 'Bajar calorías: el ritmo se ha frenado',
  rapido: 'Subir calorías: pierdes demasiado rápido',
  adherencia: 'Mantener calorías: primero, constancia',
  sin_datos: 'Mantener calorías: faltan pesajes',
  bajando: 'Subir calorías: estás perdiendo peso',
  subiendo: 'Bajar calorías: el peso tiende a subir',
  ganar_lento: 'Subir calorías: el peso no sube',
  ganar_rapido: 'Bajar calorías: ganas peso demasiado rápido',
};

const signo = n => (n > 0 ? '+' : '') + numero(n, 1);

function banner(balance) {
  const a = balance.adherencia;
  if (a.pct === null || a.pct < 80) return null;
  return h('section', { class: 'banner-logro' },
    h('span', { class: 'banner-icono', 'aria-hidden': 'true' }, icono('workspace_premium', 'relleno')),
    h('div', null,
      h('p', { class: 'banner-titulo' }, `¡Bloque ${balance.bloque} completado con éxito!`),
      h('p', { class: 'banner-texto' }, `Has seguido el ${a.pct} % de las comidas del plan.`)));
}

function tarjetaBalance(balance) {
  const a = balance.adherencia;
  const r = balance.ritmo;
  const tendencia = !r ? null : r.cambio_kg < -0.05 ? 'trending_down' : r.cambio_kg > 0.05 ? 'trending_up' : 'trending_flat';
  const nota = a.sin_marcar
    ? h('div', { class: 'nota-balance' }, icono('error', 'texto-terciario'),
      h('p', null, `Quedan ${a.sin_marcar} comidas sin marcar. Si las hiciste, márcalas en el plan activo: cuentan para la adherencia.`))
    : h('div', { class: 'nota-balance' }, icono('check_circle', 'texto-secundario'),
      h('p', null, `Has marcado todas las comidas del bloque y te has pesado ${balance.pesajes} ${balance.pesajes === 1 ? 'vez' : 'veces'}.`));
  return h('section', { class: 'tarjeta tarjeta-bloque', 'aria-labelledby': 'balance-titulo' },
    h('div', { class: 'bloque-cabecera' },
      h('div', { class: 'seccion-titulo' }, icono('insights', 'texto-primario'), h('h2', { id: 'balance-titulo' }, 'Balance de los últimos 14 días')),
      h('span', { class: 'insignia insignia-neutra' }, `Bloque ${balance.bloque}`)),
    h('div', { class: 'cajas-balance' },
      h('div', { class: 'caja-balance' },
        h('span', { class: 'caja-etiqueta' }, 'Tendencia de peso'),
        r ? h('div', { class: 'caja-cifra' }, h('span', { class: 'caja-valor' }, `${signo(r.ritmo_pct)}%`), h('span', { class: 'caja-unidad' }, '/semana'))
          : h('div', { class: 'caja-cifra' }, h('span', { class: 'caja-valor' }, '—')),
        r ? h('span', { class: 'caja-pie' + (r.cambio_kg > 0.05 ? ' texto-terciario' : ' texto-secundario') }, icono(tendencia), `${signo(r.cambio_kg)} kg netos`)
          : h('span', { class: 'caja-pie' }, `${balance.pesajes} ${balance.pesajes === 1 ? 'pesaje' : 'pesajes'}`)),
      h('div', { class: 'caja-balance' },
        h('div', { class: 'caja-linea' }, h('span', { class: 'caja-etiqueta' }, 'Adherencia'),
          h('span', { class: 'caja-pct' }, a.pct === null ? '—' : `${a.pct}%`)),
        h('div', { class: 'barra', role: 'img', 'aria-label': `Adherencia: ${a.pct === null ? 'sin datos' : a.pct + ' %'}` },
          h('div', { class: 'barra-relleno relleno-secundario', style: `width: ${a.pct || 0}%` })),
        h('span', { class: 'caja-pie caja-pie-suave' }, `${a.hechas} de ${a.planificadas} comidas`))),
    nota);
}

function repartoMacros(o) {
  const total = o.P * 4 + o.C * 4 + o.G * 9;
  const pct = k => total ? Math.round(k / total * 100) : 0;
  return h('div', { class: 'reparto' },
    h('div', { class: 'reparto-linea' },
      h('span', { class: 'reparto-kcal' }, `${numero(o.kcal)} kcal/día`),
      h('span', { class: 'reparto-nota' }, o.recomendada ? 'Base recomendada' : 'Opción elegida')),
    h('div', { class: 'barra-tres', 'aria-hidden': 'true' },
      h('span', { class: 'relleno-proteina', style: `width: ${pct(o.P * 4)}%` }),
      h('span', { class: 'relleno-carbo', style: `width: ${pct(o.C * 4)}%` }),
      h('span', { class: 'relleno-grasa', style: `width: ${pct(o.G * 9)}%` })),
    h('div', { class: 'pastillas' },
      h('span', { class: 'pastilla pastilla-proteina' }, `P ${numero(o.P)}g`),
      h('span', { class: 'pastilla pastilla-carbo' }, `C ${numero(o.C)}g`),
      h('span', { class: 'pastilla pastilla-grasa' }, `G ${numero(o.G)}g`)));
}

function tarjetaPropuesta(plan, repintar) {
  const propuesta = plan.balance.propuesta;
  const elegida = propuesta.opciones.find(o => o.delta === eleccion[plan.plan_id]) || propuesta.opciones[0];
  const aRevisar = plan.dias.filter(d => d.revisar).length;
  return h('section', { class: 'tarjeta tarjeta-propuesta', 'aria-labelledby': 'propuesta-titulo' },
    h('div', { class: 'bloque-cabecera' },
      h('span', { class: 'insignia insignia-recomendacion' }, icono('auto_awesome', 'relleno'), 'Recomendación'),
      aRevisar
        ? h('span', { class: 'validado texto-error' }, icono('error'), `${aRevisar} ${aRevisar === 1 ? 'día' : 'días'} a revisar`)
        : h('span', { class: 'validado texto-secundario' }, icono('verified'), 'Validado')),
    h('div', null,
      h('h2', { id: 'propuesta-titulo', class: 'propuesta-titulo' }, TITULOS[propuesta.motivo] || 'Propuesta para el siguiente bloque'),
      h('p', { class: 'texto-ayuda propuesta-texto' }, propuesta.explicacion)),
    repartoMacros(elegida),
    h('fieldset', { class: 'opciones' },
      h('legend', { class: 'solo-lectores' }, 'Calorías del nuevo plan'),
      propuesta.opciones.map(o => h('label', { class: 'opcion' + (o === elegida ? ' opcion-elegida' : '') + (o.bloqueada ? ' opcion-bloqueada' : '') },
        h('input', { type: 'radio', name: 'opcion-ajuste', value: String(o.delta), checked: o === elegida, disabled: Boolean(o.bloqueada),
          'data-foco': 'opcion-' + o.delta,
          onchange: () => { eleccion[plan.plan_id] = o.delta; repintar(); } }),
        h('span', { class: 'opcion-texto' },
          h('span', { class: 'opcion-linea' },
            h('span', { class: 'opcion-titulo' }, o.titulo),
            h('span', { class: 'opcion-etiqueta' + (o.recomendada ? ' texto-primario' : ' texto-terciario') }, o.recomendada ? 'Recomendado' : 'Alternativa')),
          h('span', { class: 'opcion-nota' }, o.bloqueada || `${numero(o.kcal)} kcal/día · ${o.nota}`))))),
    h('a', { class: 'enlace-suave', href: '#ajustes' }, icono('tune'), 'Personalizar macronutrientes manualmente'));
}

function tarjetaDia(plan, dia, n) {
  return h('article', { class: 'tarjeta dia-menu' },
    h('div', { class: 'dia-menu-cabecera' },
      h('span', { class: 'dia-menu-titulo' }, h('span', { class: 'dia-menu-numero', 'aria-hidden': 'true' }, String(n)),
        `Día ${n} · ${fechaTitulo(dia.fecha)}`),
      h('span', { class: 'dia-menu-kcal' + (dia.revisar ? ' texto-error' : '') }, dia.revisar ? icono('error') : null, `${numero(dia.macros.kcal)} kcal`)),
    h('ul', { class: 'dia-menu-lista' }, dia.comidas.map(c => h('li', null,
      h('span', { class: 'dia-menu-comida' }, `${c.comida}:`),
      h('a', { href: enlaceReceta(plan.plan_id, dia.fecha, c.comida) }, c.nombre)))));
}

// Partes de la vista. acciones: {activar(ajusteKcal), regenerar(), repintar()}.
export function vistaNuevoPlan(plan, acciones) {
  const balance = plan.balance;
  if (balance && !(plan.plan_id in eleccion)) eleccion[plan.plan_id] = balance.propuesta.opciones[0].delta;
  const verTodos = todos[plan.plan_id];
  const dias = verTodos ? plan.dias : plan.dias.slice(0, DIAS_VISIBLES);
  const restantes = plan.dias.length - DIAS_VISIBLES;

  return [
    h('div', { class: 'cabecera-vista' },
      h('div', null,
        h('h1', { class: 'titulo-pantalla' }, 'Nuevo plan'),
        h('p', { class: 'subtitulo' }, `${plan.bloque ? `Bloque ${plan.bloque} · ` : ''}Del ${fechaCorta(plan.inicio)} al ${fechaCorta(plan.fin)}`)),
      h('span', { class: 'insignia insignia-borrador' }, 'Borrador')),
    balance ? banner(balance) : null,
    balance ? tarjetaBalance(balance) : null,
    balance ? tarjetaPropuesta(plan, acciones.repintar) : null,
    h('section', { class: 'menu-dias', 'aria-labelledby': 'menu-titulo' },
      h('div', { class: 'bloque-cabecera' },
        h('div', null,
          h('h2', { id: 'menu-titulo', class: 'propuesta-titulo' }, verTodos ? 'Días del menú' : 'Primeros días del menú'),
          h('p', { class: 'texto-ayuda' }, 'Toca un plato para ver la receta.')),
        h('span', { class: 'icono-redondo', 'aria-hidden': 'true' }, icono('restaurant_menu'))),
      h('div', { class: 'lista-dias-menu' }, dias.map(d => tarjetaDia(plan, d, plan.dias.indexOf(d) + 1))),
      restantes > 0 ? h('button', { type: 'button', class: 'boton-texto ver-mas', 'aria-expanded': verTodos ? 'true' : 'false', 'data-foco': 'ver-mas',
        onclick: () => { todos[plan.plan_id] = !verTodos; acciones.repintar(); } },
      verTodos ? 'Ver solo los primeros días' : `Ver los ${restantes} días restantes del plan`, icono('expand_more', verTodos ? 'girado' : '')) : null),
    h('div', { class: 'acciones-plan' },
      h('button', { type: 'button', class: 'boton boton-primario boton-grande', onclick: () => acciones.activar(balance ? eleccion[plan.plan_id] : 0) },
        icono('event_available'), 'Activar plan', icono('arrow_forward')),
      h('p', { class: 'nota-activar' }, `Empieza el ${fechaTitulo(plan.inicio).toLowerCase()} · Podrás cambiar cualquier plato cuando quieras`),
      h('button', { type: 'button', class: 'boton boton-secundario', onclick: acciones.regenerar }, 'Generar otro borrador')),
  ];
}
