// Pantalla «Pedir recetas a la IA» (#pedir): cada persona pide recetas a su propio chat de IA (Claude, ChatGPT,
// Gemini…), sin coste y sin pasar por Fran. ① La app prepara el encargo (pedidoRecetas: instrucciones, tabla de
// alimentos, ración de referencia, sus excluidos y sus gustos) para copiarlo o compartirlo; ② se pega en el
// chat; ③ se pega aquí la respuesta y la app la comprueba con el optimizador y la deja en «Propuestas de la IA»
// (importarPropuestas), donde se añade o descarta como siempre. La IA nunca da macros.
// Sin diseño propio en design/: usa los componentes de «Crear receta» (editor.js) y los pasos de «Receta».
// Lo escrito se guarda en el móvil: al volver del chat (aunque Android haya cerrado la app) sigue ahí.

import { llamar, leerLocal, guardarLocal } from './api.js';
import { h, icono, numero, avisar, COMIDAS } from './comun.js';
import { guardarPropuestas } from './datos.js';

const CLAVE = 'dieta.pedirIA';
const OPCIONALES = ['Desayuno', 'Merienda'];

let estado = null; // {comida, cantidad, idea, respuesta}
let encargo = null; // {clave, texto}: el último encargo preparado
let temporizador = null;

const comidasPropias = () => {
  const config = leerLocal('dieta.config') || {};
  return COMIDAS.filter(c => !OPCIONALES.includes(c) || config['objetivo_' + c.toLowerCase()]);
};
const guardar = () => guardarLocal(CLAVE, estado);
const claveEncargo = () => JSON.stringify([estado.comida, estado.cantidad, estado.idea.trim()]);

const paso = (id, numero, titulo, ...contenido) => h('section', { class: 'ajustes-seccion', 'aria-labelledby': id },
  h('div', { class: 'seccion-cabecera' }, h('div', { class: 'seccion-titulo seccion-titulo-sm' },
    h('span', { class: 'paso-numero paso-numero-sm', 'aria-hidden': 'true' }, String(numero)), h('h2', { id }, titulo))),
  ...contenido);

// Botones de una sola elección (como en el perfil).
function selector(etiqueta, opciones, valor, alElegir) {
  const grupo = h('div', { class: 'selector', role: 'group', 'aria-label': etiqueta, style: `grid-template-columns: repeat(${opciones.length}, 1fr)` });
  opciones.forEach(([v, texto]) => grupo.append(h('button', { type: 'button', class: 'selector-opcion', 'aria-pressed': String(valor === v),
    onclick: evento => {
      grupo.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === evento.currentTarget)));
      alElegir(v);
    } }, texto)));
  return grupo;
}

// Copia al portapapeles; si el navegador no deja, con un área de texto temporal.
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch (err) {
    const area = h('textarea', { class: 'copia-oculta', 'aria-hidden': 'true' });
    area.value = texto;
    document.body.append(area);
    area.select();
    const hecho = document.execCommand('copy');
    area.remove();
    return hecho;
  }
}

// El encargo para lo elegido (se pide al motor si ha cambiado algo desde el último).
async function textoEncargo() {
  const clave = claveEncargo();
  if (encargo && encargo.clave === clave) return encargo.texto;
  const p = await llamar('pedidoRecetas', { comida: estado.comida, cantidad: estado.cantidad, idea: estado.idea.trim() });
  encargo = { clave, texto: p.encargo };
  return p.encargo;
}

function pintar(contenedor) {
  const comidas = comidasPropias();
  if (!comidas.includes(estado.comida)) estado.comida = comidas.includes('Cena') ? 'Cena' : comidas[0];
  const avisoEncargo = h('p', { class: 'mensaje', role: 'status' });
  const avisoRespuesta = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const resultado = h('div', { class: 'perfil-resultado' });
  // Al cambiar algo se prepara el encargo nuevo poco después, para tenerlo listo al pulsar.
  const olvidarEncargo = () => {
    avisoEncargo.textContent = '';
    clearTimeout(temporizador);
    temporizador = setTimeout(() => textoEncargo().catch(() => {}), 800);
  };

  const idea = h('input', { type: 'text', name: 'idea', autocomplete: 'off', maxlength: 200, value: estado.idea,
    placeholder: 'con salmón, rápidas, mexicanas…',
    oninput: () => { estado.idea = idea.value; guardar(); olvidarEncargo(); } });

  // Copiar o compartir: con el encargo ya preparado si no ha cambiado nada (el navegador pide que sea al momento).
  const conEncargo = accion => async evento => {
    const boton = evento.currentTarget;
    boton.disabled = true;
    avisoEncargo.classList.remove('mensaje-error');
    avisoEncargo.textContent = 'Preparando el encargo…';
    try {
      avisoEncargo.textContent = await accion(await textoEncargo());
    } catch (err) {
      if (err.name === 'AbortError') avisoEncargo.textContent = '';
      else {
        avisoEncargo.textContent = err.message;
        avisoEncargo.classList.add('mensaje-error');
      }
    } finally {
      boton.disabled = false;
    }
  };
  const botonCopiar = h('button', { type: 'button', class: 'boton boton-primario',
    onclick: conEncargo(async texto => {
      if (!(await copiar(texto))) throw new Error('No se ha podido copiar. Prueba con «Compartir con…».');
      return 'Encargo copiado. Ahora pégalo en tu chat de IA.';
    }) }, icono('content_copy'), 'Copiar encargo');
  const botonCompartir = navigator.share ? h('button', { type: 'button', class: 'boton boton-secundario',
    onclick: conEncargo(async texto => {
      await navigator.share({ text: texto });
      return 'Cuando te conteste, copia su respuesta y vuelve aquí.';
    }) }, icono('share'), 'Compartir con…') : null;

  const respuesta = h('textarea', { name: 'respuesta', rows: 6, 'aria-labelledby': 'pedir-titulo-respuesta',
    placeholder: 'Pega aquí la respuesta del chat',
    oninput: () => { estado.respuesta = respuesta.value; guardar(); avisoRespuesta.textContent = ''; } });
  respuesta.value = estado.respuesta;

  const textoAnadir = h('span', null, 'Añadir a mis propuestas');
  const botonAnadir = h('button', { type: 'button', class: 'boton boton-primario boton-grande',
    onclick: async () => {
      avisoRespuesta.textContent = '';
      resultado.replaceChildren();
      if (!estado.respuesta.trim()) {
        avisoRespuesta.textContent = 'Pega primero la respuesta del chat.';
        return;
      }
      botonAnadir.disabled = true;
      textoAnadir.textContent = 'Comprobando recetas…';
      try {
        const r = await llamar('importarPropuestas', { comida: estado.comida, texto: estado.respuesta });
        guardarPropuestas(r.propuestas);
        if (r.nuevas.length) {
          estado.respuesta = '';
          respuesta.value = '';
          guardar();
        }
        pintarResultado(resultado, r);
        resultado.querySelector('h2').focus();
      } catch (err) {
        avisoRespuesta.textContent = err.message;
      } finally {
        botonAnadir.disabled = false;
        textoAnadir.textContent = 'Añadir a mis propuestas';
      }
    } }, icono('check'), textoAnadir);

  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' }, h('div', null,
      h('h1', { class: 'titulo-pantalla' }, 'Pedir recetas a la IA'),
      h('p', { class: 'subtitulo' }, 'Tu chat de IA propone los platos; la app calcula los gramos para tu objetivo.'))),
    h('div', { class: 'form-perfil' },
      paso('pedir-titulo-que', 1, 'Qué te apetece',
        h('div', { class: 'tarjeta tarjeta-ajuste' },
          h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Comida'),
            selector('Comida', comidas.map(c => [c, c]), estado.comida, v => { estado.comida = v; guardar(); olvidarEncargo(); })),
          h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Cuántas'),
            selector('Cuántas', [[1, '1'], [2, '2'], [3, '3']], estado.cantidad, v => { estado.cantidad = v; guardar(); olvidarEncargo(); })),
          h('label', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Idea (opcional)'), h('span', { class: 'campo-caja' }, idea))),
        botonCopiar, botonCompartir, avisoEncargo),
      paso('pedir-titulo-chat', 2, 'Pégalo en tu chat',
        h('div', { class: 'tarjeta tarjeta-ajuste' },
          h('p', { class: 'texto-ayuda' }, 'Abre Claude, ChatGPT o Gemini, pega el encargo y envíalo. Te contestará con un bloque de texto que empieza por «{». Cópialo entero.'))),
      paso('pedir-titulo-respuesta', 3, 'Pega la respuesta', respuesta, avisoRespuesta, botonAnadir)),
    resultado);
}

// Qué ha pasado con cada receta: las que quedan en propuestas y las que no valen (con el texto para corregirlas).
function pintarResultado(contenedor, r) {
  const fila = (nombre, insignia, nota) => h('li', { class: 'resultado-receta' },
    h('span', { class: 'fila-alimento-texto' }, h('span', { class: 'fila-alimento-nombre' }, nombre),
      nota ? h('span', { class: 'fila-alimento-detalle' }, nota) : null),
    insignia);
  const validas = r.validas.map(v => v.estado === 'valida'
    ? fila(v.nombre, h('span', { class: 'insignia insignia-ok-fuerte' }, 'Lista'), `${numero(v.macros.kcal)} kcal · P ${numero(v.macros.P)} · C ${numero(v.macros.C)} · G ${numero(v.macros.G)} g`)
    : fila(v.nombre, h('span', { class: 'insignia insignia-borrador' }, 'Falta alimento'), 'Falta: ' + v.faltan.map(f => f.nombre).join(', ')));
  const n = r.nuevas.length;
  contenedor.replaceChildren(h('section', { class: 'ajustes-seccion', 'aria-labelledby': 'pedir-titulo-resultado' },
    h('div', { class: 'seccion-cabecera' },
      h('div', { class: 'seccion-titulo seccion-titulo-sm' }, icono(n ? 'task_alt' : 'error', n ? 'texto-secundario' : 'texto-terciario'),
        h('h2', { id: 'pedir-titulo-resultado', tabindex: '-1' },
          n ? (n === 1 ? '1 receta en tus propuestas' : `${n} recetas en tus propuestas`) : 'Ninguna receta vale'))),
    n ? h('ul', { class: 'tarjeta tarjeta-ajuste lista-resultado' }, validas) : null,
    r.descartadas.length ? [
      h('p', { class: 'texto-ayuda' }, r.descartadas.length === 1 ? 'Esta no vale:' : `Estas ${r.descartadas.length} no valen:`),
      h('ul', { class: 'tarjeta tarjeta-ajuste lista-resultado' }, r.descartadas.map(d =>
        fila(d.nombre, h('span', { class: 'insignia insignia-error' }, 'No vale'), d.motivo))),
      h('button', { type: 'button', class: 'boton boton-secundario',
        onclick: async () => avisar((await copiar(r.correccion)) ? 'Corrección copiada: pégala en el mismo chat y trae aquí su respuesta.' : 'No se ha podido copiar.') },
      icono('content_copy'), 'Copiar corrección para la IA'),
    ] : null,
    n ? h('a', { class: 'boton boton-primario', href: '#recetas' }, 'Ver mis propuestas', icono('arrow_forward')) : null));
}

export function cargarPedir(contenedor) {
  if (!estado) estado = Object.assign({ comida: null, cantidad: 3, idea: '', respuesta: '' }, leerLocal(CLAVE) || {});
  pintar(contenedor);
  // Se prepara el encargo ya: así copiar y compartir van al momento (el navegador lo exige para compartir).
  textoEncargo().catch(() => {});
}
