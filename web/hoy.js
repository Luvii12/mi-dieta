// Pantalla «Hoy»: resumen de lo comido frente al objetivo y las comidas del día
// (design/mi_dieta_hoy_modo_claro y _oscuro).

import { llamar } from './api.js';
import { h, icono, numero, fechaTitulo, fechaCorta, diasEntre, tesela, enlaceReceta, estaHecha, avisar, pastillasMacros } from './comun.js';
import { leerHoy, guardarHoy, marcarComida } from './datos.js';
import { abrirCambiarPlato } from './cambiar.js';

const MACROS = [
  { clave: 'P', nombre: 'Proteína', clase: 'proteina' },
  { clave: 'C', nombre: 'Carbohidratos', clase: 'carbo' },
  { clave: 'G', nombre: 'Grasa', clase: 'grasa' },
];

// Anillo de kcal: lo comido frente al objetivo del día.
function anillo(comido, objetivo) {
  const circunferencia = 2 * Math.PI * 40;
  const fraccion = Math.min(comido / objetivo, 1);
  const svg = `<svg viewBox="0 0 100 100" aria-hidden="true">
    <circle class="anillo-fondo" cx="50" cy="50" r="40" fill="none" stroke-width="8"/>
    <circle class="anillo-progreso" cx="50" cy="50" r="40" fill="none" stroke-width="8" stroke-linecap="round"
      stroke-dasharray="${circunferencia.toFixed(1)}" stroke-dashoffset="${(circunferencia * (1 - fraccion)).toFixed(1)}"
      ${fraccion === 0 ? 'stroke-opacity="0"' : ''}/>
  </svg>`;
  const caja = h('div', { class: 'anillo' });
  caja.innerHTML = svg;
  caja.append(h('div', { class: 'anillo-centro' },
    h('span', { class: 'anillo-valor' }, numero(comido)),
    h('span', { class: 'anillo-objetivo' }, `/ ${numero(objetivo)}`),
    h('span', { class: 'anillo-unidad' }, 'kcal')));
  return caja;
}

function barraMacro(macro, comido, objetivo) {
  const porcentaje = objetivo > 0 ? Math.min(comido / objetivo, 1) * 100 : 0;
  return h('div', { class: 'macro-fila' },
    h('div', { class: 'macro-linea' },
      h('span', { class: 'macro-nombre' }, h('span', { class: `punto punto-${macro.clase}` }), macro.nombre),
      h('span', { class: `macro-cifra texto-${macro.clase}` }, numero(comido),
        h('span', { class: 'macro-objetivo' }, ` / ${numero(objetivo)} g`))),
    h('div', { class: 'barra', role: 'img', 'aria-label': `${macro.nombre}: ${numero(comido)} de ${numero(objetivo)} g` },
      h('div', { class: `barra-relleno relleno-${macro.clase}`, style: `width: ${porcentaje.toFixed(1)}%` })));
}

function resumen(hoy) {
  const hechas = hoy.comidas.filter(estaHecha);
  const comido = { kcal: 0, P: 0, C: 0, G: 0 };
  hechas.forEach(c => ['kcal', 'P', 'C', 'G'].forEach(n => { comido[n] += c.macros[n]; }));
  const objetivo = hoy.objetivoDia;
  const restantes = objetivo.kcal - comido.kcal;
  const ok = !hoy.evaluacion || hoy.evaluacion.ok;

  return h('section', { class: 'tarjeta resumen', 'aria-labelledby': 'resumen-titulo' },
    h('div', { class: 'resumen-cabecera' },
      h('div', { class: 'resumen-titulo' }, icono('pie_chart', 'texto-primario'), h('h2', { id: 'resumen-titulo' }, 'Resumen de hoy')),
      ok ? h('span', { class: 'insignia insignia-ok' }, 'Dentro del objetivo')
        : h('span', { class: 'insignia insignia-error' }, 'Fuera de margen')),
    h('div', { class: 'resumen-cuerpo' },
      h('div', { class: 'resumen-kcal' },
        anillo(comido.kcal, objetivo.kcal),
        h('p', { class: 'resumen-restantes' },
          restantes >= 0 ? `${numero(restantes)} kcal restantes` : `${numero(-restantes)} kcal de más`)),
      h('div', { class: 'resumen-macros' }, MACROS.map(m => barraMacro(m, comido[m.clave], objetivo[m.clave])))));
}

// Botón de la izquierda del pie de cada comida: marca, desmarca o deshace la comida libre o «No la he hecho».
function botonEstado(hoy, c) {
  const marcar = hecha => () => marcarComida(hoy.plan_id, hoy.fecha, c.comida, hecha).catch(err => avisar(err.message));
  const foco = `estado-${c.comida}`;
  if (c.hecha === 'si') {
    return h('button', { type: 'button', class: 'boton-estado hecha', 'data-foco': foco, onclick: marcar('no'),
      'aria-label': `${c.comida} completada. Tocar para desmarcar` },
    h('span', { class: 'circulo lleno' }, icono('check')), h('span', null, 'Completada con éxito'));
  }
  if (c.hecha === 'libre') {
    return h('button', { type: 'button', class: 'boton-estado libre', 'data-foco': foco, onclick: marcar('no'),
      'aria-label': `${c.comida}: comida libre. Tocar para deshacer` },
    h('span', { class: 'circulo libre' }, icono('celebration')), h('span', null, 'Comida libre'));
  }
  if (c.hecha === 'saltada') {
    return h('button', { type: 'button', class: 'boton-estado saltada', 'data-foco': foco, onclick: marcar('no'),
      'aria-label': `${c.comida}: no la has hecho. Tocar para deshacer` },
    h('span', { class: 'circulo saltada' }, icono('remove')), h('span', null, 'No la has hecho'));
  }
  return h('button', { type: 'button', class: 'boton-estado', 'data-foco': foco, onclick: marcar('si') },
    h('span', { class: 'circulo' }), h('span', null, 'Marcar hecha'));
}

function etiquetaEstado(c) {
  if (c.hecha === 'si') return h('span', { class: 'estado estado-hecha' }, icono('check_circle', 'relleno'), 'Hecha');
  if (c.hecha === 'libre') return h('span', { class: 'estado estado-libre' }, 'Libre');
  if (c.hecha === 'saltada') return h('span', { class: 'estado estado-saltada' }, 'No hecha');
  return h('span', { class: 'estado' }, 'Pendiente');
}

function tarjetaComida(hoy, c) {
  const enlace = enlaceReceta(hoy.plan_id, hoy.fecha, c.comida);
  return h('article', { class: 'tarjeta comida' + (estaHecha(c) ? ' comida-hecha' : '') },
    h('div', { class: 'comida-fila' },
      h('a', { href: enlace, tabindex: '-1', 'aria-hidden': 'true', class: 'comida-tesela' }, tesela(c.comida)),
      h('div', { class: 'comida-info' },
        h('div', { class: 'comida-linea' }, h('span', { class: 'etiqueta-comida' }, c.comida), etiquetaEstado(c)),
        h('h3', { class: 'comida-nombre' }, h('a', { href: enlace }, c.nombre)),
        pastillasMacros(c.macros))),
    h('div', { class: 'comida-pie' },
      botonEstado(hoy, c),
      h('button', { type: 'button', class: 'boton-texto', 'data-foco': `cambiar-${c.comida}`,
        onclick: () => abrirCambiarPlato(hoy.plan_id, hoy.fecha, c, { libre: true, saltar: true }) }, 'Cambiar plato')));
}

function pintar(contenedor, hoy) {
  contenedor.replaceChildren();
  if (!hoy.comidas.length) {
    contenedor.append(cabecera(hoy.fecha, null), vacio(hoy.inicio ? `Tu plan empieza el ${fechaTitulo(hoy.inicio).toLowerCase()}.` : hoy.mensaje,
      'Ir a Plan', '#plan'));
    return;
  }
  const hechas = hoy.comidas.filter(estaHecha).length;
  contenedor.append(
    cabecera(hoy.fecha, hoy),
    hoy.nuevo_plan ? h('a', { class: 'tarjeta aviso-plan', href: '#plan' },
      icono('event_available', 'texto-secundario'),
      h('span', { class: 'aviso-plan-texto' }, h('strong', null, 'Tu nuevo plan está listo'), h('span', null, 'Revísalo en Plan o se activará solo al empezar')),
      icono('chevron_right', 'comida-plan-flecha')) : '', // '' y no null: append() escribiría «null»
    resumen(hoy),
    h('div', { class: 'titulo-seccion' },
      h('h2', null, 'Comidas previstas'), h('span', null, `${hechas} de ${hoy.comidas.length} completadas`)),
    h('div', { class: 'lista-comidas' }, hoy.comidas.map(c => tarjetaComida(hoy, c))));
}

function cabecera(fecha, hoy) {
  const dias = hoy && hoy.inicio ? diasEntre(hoy.inicio, hoy.fin) + 1 : 0;
  return h('div', { class: 'cabecera-vista' },
    h('div', null,
      h('h1', { class: 'titulo-pantalla' }, fechaTitulo(fecha)),
      hoy && hoy.inicio ? h('p', { class: 'subtitulo' }, `Plan del ${fechaCorta(hoy.inicio)} al ${fechaCorta(hoy.fin)}`) : null),
    dias ? h('span', { class: 'insignia insignia-primaria' }, `Día ${diasEntre(hoy.inicio, fecha) + 1} de ${dias}`) : null);
}

export function vacio(texto, boton, destino) {
  return h('div', { class: 'tarjeta vacio' },
    icono('restaurant', 'vacio-icono'),
    h('p', null, texto),
    boton ? h('a', { class: 'boton boton-primario', href: destino }, boton) : null);
}

export function pintarHoy(contenedor) {
  const hoy = leerHoy();
  if (hoy) pintar(contenedor, hoy);
  return Boolean(hoy);
}

export async function cargarHoy(contenedor) {
  const habia = pintarHoy(contenedor);
  if (!habia) contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando…'));
  try {
    const hoy = await llamar('hoy');
    guardarHoy(hoy);
    pintar(contenedor, hoy);
  } catch (err) {
    if (!habia) contenedor.replaceChildren(vacio(err.message));
  }
}
