// Utilidades de pantalla compartidas: crear elementos, números, fechas, iconos y avisos.

export const $ = id => document.getElementById(id);

// h('div', {class: 'x', onclick: fn}, 'texto', otroElemento) → elemento. El texto nunca se interpreta como HTML.
export function h(etiqueta, atributos, ...hijos) {
  const e = document.createElement(etiqueta);
  Object.entries(atributos || {}).forEach(([clave, valor]) => {
    if (valor == null || valor === false) return;
    if (clave === 'class') e.className = valor;
    else if (clave.startsWith('on')) e.addEventListener(clave.slice(2), valor);
    else e.setAttribute(clave, valor === true ? '' : valor);
  });
  hijos.flat().forEach(hijo => { if (hijo != null && hijo !== false) e.append(hijo); });
  return e;
}

// Icono de Material Symbols (decorativo: los lectores de pantalla lo ignoran).
export const icono = (nombre, clase) => h('span', { class: 'icono' + (clase ? ' ' + clase : ''), 'aria-hidden': 'true' }, nombre);

// 24.9 → '24,9'; 1655 → '1.655' (formato de España)
export const numero = (n, decimales = 0) =>
  Number(n).toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales, useGrouping: 'always' });

// ---------- Fechas (ISO 'AAAA-MM-DD') ----------

const aFecha = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
};
const mayuscula = texto => texto.charAt(0).toUpperCase() + texto.slice(1);
const mes = f => f.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');

// '2026-10-20' → 'Lunes, 20 oct'
export function fechaTitulo(iso) {
  const f = aFecha(iso);
  return `${mayuscula(f.toLocaleDateString('es-ES', { weekday: 'long' }))}, ${f.getDate()} ${mes(f)}`;
}

// '2026-10-24' → 'Sábado, 24 de octubre'
export function fechaLarga(iso) {
  const f = aFecha(iso);
  return mayuscula(f.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
}

// '2026-10-20' → '20 oct'
export const fechaCorta = iso => `${aFecha(iso).getDate()} ${mes(aFecha(iso))}`;

// '2026-10-20' → {letra: 'L', dia: 20}
export function diaDeSemana(iso) {
  const f = aFecha(iso);
  return { letra: 'DLMXJVS'[f.getDay()], dia: f.getDate() };
}

export function hoyIso() {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

// Días entre dos fechas ISO (b − a).
export const diasEntre = (a, b) => Math.round((aFecha(b) - aFecha(a)) / 86400000);

// ---------- Comidas ----------

export const COMIDAS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];
export const ICONO_COMIDA = { Desayuno: 'bakery_dining', Almuerzo: 'skillet', Merienda: 'nutrition', Cena: 'soup_kitchen' };

// Tesela de color con el icono de la comida (ocupa el sitio de la foto del plato hasta la Fase 6).
export const tesela = (comida, clase) =>
  h('span', { class: `tesela tesela-${comida.toLowerCase()}${clase ? ' ' + clase : ''}`, 'aria-hidden': 'true' },
    icono(ICONO_COMIDA[comida] || 'restaurant'));

// Pastillas «398 kcal · P 25g · C 48g · G 11g» de una comida.
export const pastillasMacros = m => h('div', { class: 'pastillas' },
  h('span', { class: 'pastilla pastilla-kcal' }, `${numero(m.kcal)} kcal`),
  h('span', { class: 'pastilla pastilla-proteina' }, `P ${numero(m.P)}g`),
  h('span', { class: 'pastilla pastilla-carbo' }, `C ${numero(m.C)}g`),
  h('span', { class: 'pastilla pastilla-grasa' }, `G ${numero(m.G)}g`));

export const enlaceReceta = (planId, fecha, comida) => `#receta/${encodeURIComponent(planId)}/${fecha}/${comida}`;

// ¿Cuenta como hecha? La comida libre también (se sale del plan, pero no queda pendiente).
export const estaHecha = comida => comida.hecha === 'si' || comida.hecha === 'libre';

// ---------- Formulario en panel inferior ----------

// '78,4' → 78.4; vacío o no numérico → NaN
const leerNumero = texto => (String(texto).trim() === '' ? NaN : Number(String(texto).replace(',', '.')));

function controlFormulario(c) {
  if (c.tipo === 'opciones') {
    return h('select', { name: c.clave }, c.opciones.map(([valor, texto]) => h('option', { value: valor, selected: valor === c.valor }, texto)));
  }
  if (c.tipo === 'texto') return h('input', { type: 'text', autocomplete: 'off', maxlength: 60, name: c.clave, value: c.valor || '' });
  return h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', name: c.clave,
    value: c.valor === null || c.valor === undefined ? '' : numero(c.valor, c.decimales || 0).replace(/\./g, '') });
}

// Panel con campos. campos: [{clave, etiqueta, unidad, valor, decimales, tipo ('numero' | 'texto' | 'opciones'),
// opciones: [[valor, texto]], ancho (ocupa toda la fila)}]. Los números llegan como número (NaN si están vacíos).
// guardar(valores) lanza un Error con el mensaje si algo no vale. foco: data-foco o id al que volver al cerrar.
export function abrirFormulario({ titulo, nota, campos, guardar, foco, textoGuardar }) {
  const panel = $('panel-formulario');
  $('formulario-titulo').textContent = titulo;
  $('formulario-nota').textContent = nota || '';
  $('formulario-estado').textContent = '';
  $('formulario-guardar').textContent = textoGuardar || 'Guardar';
  $('formulario-campos').replaceChildren(...campos.map(c => h('label', { class: 'campo' + (c.ancho ? ' campo-ancho' : '') },
    h('span', { class: 'campo-etiqueta' }, c.etiqueta),
    h('span', { class: 'campo-caja' }, controlFormulario(c), c.unidad ? h('span', { class: 'campo-unidad' }, c.unidad) : null))));
  $('form-formulario').onsubmit = async evento => {
    evento.preventDefault();
    const valores = {};
    campos.forEach(c => {
      const valor = panel.querySelector(`[name="${c.clave}"]`).value;
      valores[c.clave] = c.tipo === 'texto' || c.tipo === 'opciones' ? valor.trim() : leerNumero(valor);
    });
    const boton = $('formulario-guardar');
    boton.disabled = true;
    $('formulario-estado').textContent = 'Guardando…';
    try {
      await guardar(valores);
      panel.close();
      const volver = document.querySelector(`[data-foco="${foco}"]`) || $(foco);
      if (volver) volver.focus();
    } catch (err) {
      $('formulario-estado').textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  };
  panel.showModal();
}

// ---------- Aviso flotante ----------

let temporizador = null;
export function avisar(texto) {
  const aviso = $('aviso');
  aviso.textContent = texto;
  aviso.hidden = false;
  clearTimeout(temporizador);
  temporizador = setTimeout(() => { aviso.hidden = true; }, 5000);
}
