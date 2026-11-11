// Pantalla «Lista de la compra» (#compra, se abre desde Plan): suma los gramos de cada alimento de los platos
// de una semana del plan (días 1–7 u 8–14 del activo o del siguiente), agrupados por tipo de alimento. Cuenta
// la semana entera (también los días pasados) y los platos cambiados; la comida libre no lleva ingredientes.
// Lo tachado se recuerda en este móvil por semana. Se puede compartir o copiar lo que falta por comprar.
// Sin diseño propio en design/: usa las filas de ingredientes de Receta y el selector de Plan.

import { llamar, leerLocal, guardarLocal } from './api.js';
import { h, icono, numero, fechaCorta, hoyIso, avisar, copiar } from './comun.js';
import { leerPlan, guardarPlan } from './datos.js';
import { vacio } from './hoy.js';

const CLAVE_TACHADOS = 'dieta.compra';
// Orden de las secciones, como se recorre un súper: fresco primero.
const SECCIONES = [
  ['verdura_condimento', 'Verduras y condimentos'],
  ['fruta', 'Fruta'],
  ['proteina', 'Proteínas'],
  ['lacteo', 'Lácteos'],
  ['carbohidrato', 'Hidratos'],
  ['grasa', 'Grasas'],
];
const COLOR_GRUPO = { proteina: 'primario', carbohidrato: 'carbo', grasa: 'secundario', lacteo: 'proteina', fruta: 'grasa' };

let elegida = null; // clave de la semana que se está viendo

// Semanas de 7 días del plan activo y del siguiente: [{clave, titulo, dias}].
function semanas(datos) {
  const lista = [];
  [datos.activo, datos.siguiente].filter(Boolean).forEach(plan => {
    for (let k = 0; k * 7 < plan.dias.length; k++) {
      const dias = plan.dias.slice(k * 7, k * 7 + 7);
      lista.push({ clave: `${plan.plan_id}:${k}`, titulo: `Semana ${k + 1}`, desde: dias[0].fecha, hasta: dias[dias.length - 1].fecha,
        siguiente: plan === datos.siguiente, dias });
    }
  });
  return lista;
}

// Alimentos de los platos de esos días: [{alimento, nombre, grupo, estado, gramos, gramos_unidad, platos: {nombre: veces}}].
function sumar(dias) {
  const total = {};
  dias.forEach(d => d.comidas.forEach(c => {
    if (c.hecha === 'libre') return;
    (c.ingredientes || []).forEach(ing => {
      if (!(ing.gramos > 0)) return;
      const t = total[ing.alimento] = total[ing.alimento] ||
        { alimento: ing.alimento, nombre: ing.nombre, grupo: ing.grupo, estado: ing.estado, gramos_unidad: ing.gramos_unidad, gramos: 0, platos: {} };
      t.gramos += ing.gramos;
      t.platos[c.nombre] = (t.platos[c.nombre] || 0) + 1;
    });
  }));
  return Object.values(total).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const esMl = a => a.alimento.endsWith('_ml');

// Cantidad para comprar, [valor, unidad]: redondeada hacia arriba de 5 en 5; en kilos (o litros) desde 1.000.
function partesCantidad(a) {
  const g = Math.ceil(a.gramos / 5) * 5;
  if (g >= 1000) return [numero(g / 1000, 1), esMl(a) ? 'l' : 'kg'];
  return [numero(g), esMl(a) ? 'ml' : 'g'];
}
const cantidad = a => partesCantidad(a).join(' ');
const piezas = a => (a.gramos_unidad ? Math.ceil(a.gramos / a.gramos_unidad - 0.05) : null);

function leerTachados(clave) {
  return new Set((leerLocal(CLAVE_TACHADOS) || {})[clave] || []);
}

// Guarda lo tachado de esta semana; se olvidan las semanas que ya no están en ningún plan.
function guardarTachados(clave, tachados, claves) {
  const todos = leerLocal(CLAVE_TACHADOS) || {};
  const nuevos = {};
  claves.forEach(k => { if (todos[k]) nuevos[k] = todos[k]; });
  nuevos[clave] = [...tachados];
  guardarLocal(CLAVE_TACHADOS, nuevos);
}

const textoPlatos = platos => Object.entries(platos).map(([n, v]) => (v > 1 ? `${n} ×${v}` : n)).join(' · ');

function fila(a, tachado, alternar) {
  const n = piezas(a);
  const detalle = [a.estado === 'crudo' ? 'en crudo' : a.estado === 'cocinado' ? 'cocinado' : '', n ? cantidad(a) : ''].filter(Boolean).join(' · ');
  return h('li', null, h('button', {
    type: 'button', class: 'pesado compra-item', 'aria-pressed': String(tachado), 'data-foco': 'compra-' + a.alimento, onclick: alternar,
  },
  h('span', { class: 'pesado-nombre' },
    h('span', { class: 'circulo', 'aria-hidden': 'true' }, tachado ? icono('check') : null),
    h('span', null,
      h('span', { class: 'pesado-texto' }, h('span', { class: 'punto punto-' + (COLOR_GRUPO[a.grupo] || 'contorno') }), a.nombre),
      detalle ? h('span', { class: 'pesado-detalle' }, detalle) : null,
      h('span', { class: 'compra-platos' }, textoPlatos(a.platos)))),
  n
    ? h('span', { class: 'pesado-cantidad' }, numero(n), h('span', { class: 'pesado-unidad' }, n === 1 ? ' ud.' : ' uds.'))
    : h('span', { class: 'pesado-cantidad' }, partesCantidad(a)[0], h('span', { class: 'pesado-unidad' }, ' ' + partesCantidad(a)[1]))));
}

function textoLista(semana, alimentos, tachados) {
  const pendientes = alimentos.filter(a => !tachados.has(a.alimento));
  const lineas = [`Lista de la compra · ${fechaCorta(semana.desde)} – ${fechaCorta(semana.hasta)}`];
  porSeccion(pendientes).forEach(([titulo, lista]) => {
    lineas.push('', titulo);
    lista.forEach(a => { const n = piezas(a); lineas.push(`• ${a.nombre}: ${n ? `${n} ${n === 1 ? 'ud.' : 'uds.'} (${cantidad(a)})` : cantidad(a)}`); });
  });
  return lineas.join('\n');
}

function porSeccion(alimentos) {
  const conocidos = SECCIONES.map(s => s[0]);
  const secciones = SECCIONES.map(([grupo, titulo]) => [titulo, alimentos.filter(a => a.grupo === grupo)]);
  secciones.push(['Otros', alimentos.filter(a => !conocidos.includes(a.grupo))]);
  return secciones.filter(([, lista]) => lista.length);
}

function pintar(contenedor, datos) {
  const cabecera = h('div', { class: 'cabecera-vista cabecera-con-volver' },
    h('a', { class: 'boton-icono', href: '#plan', 'aria-label': 'Volver al plan' }, icono('arrow_back')),
    h('div', { class: 'cabecera-texto' },
      h('h1', { class: 'titulo-pantalla' }, 'Lista de la compra'),
      h('p', { class: 'subtitulo' }, 'Todo lo que llevan los platos de la semana.')));
  const lista = semanas(datos);
  if (!lista.length) {
    contenedor.replaceChildren(cabecera, vacio('Todavía no tienes un plan activo. Cuando lo tengas, aquí saldrá lo que hay que comprar.'));
    return;
  }
  const hoy = hoyIso();
  if (!lista.some(s => s.clave === elegida)) {
    elegida = (lista.find(s => s.desde <= hoy && hoy <= s.hasta) || lista.find(s => s.desde > hoy) || lista[0]).clave;
  }
  const semana = lista.find(s => s.clave === elegida);
  const alimentos = sumar(semana.dias);
  const tachados = leerTachados(semana.clave);
  const repintar = () => pintar(contenedor, datos);
  const alternar = id => () => {
    if (tachados.has(id)) tachados.delete(id); else tachados.add(id);
    guardarTachados(semana.clave, tachados, lista.map(s => s.clave));
    const foco = 'compra-' + id;
    repintar();
    const boton = contenedor.querySelector(`[data-foco="${foco}"]`);
    if (boton) boton.focus();
  };
  const faltan = alimentos.filter(a => !tachados.has(a.alimento)).length;

  const compartir = async () => {
    const texto = textoLista(semana, alimentos, tachados);
    if (navigator.share) {
      try {
        await navigator.share({ text: texto });
      } catch (err) {
        // Cancelado: no pasa nada.
      }
      return;
    }
    avisar((await copiar(texto)) ? 'Lista copiada.' : 'No se ha podido copiar.');
  };

  contenedor.replaceChildren(
    cabecera,
    h('div', { class: 'selector selector-semanas', role: 'group', 'aria-label': 'Semana de la lista' },
      lista.map(s => h('button', {
        type: 'button', class: 'selector-opcion', 'aria-pressed': String(s.clave === elegida), 'data-foco': 'semana-' + s.clave,
        onclick: () => { elegida = s.clave; repintar(); },
      },
      h('span', { class: 'selector-titulo' }, s.siguiente ? `${s.titulo} · siguiente` : s.titulo),
      h('span', { class: 'selector-fechas' }, `${fechaCorta(s.desde)} – ${fechaCorta(s.hasta)}`)))),
    h('p', { class: 'subtitulo compra-resumen', role: 'status' },
      alimentos.length ? (faltan ? `${faltan} de ${alimentos.length} alimentos por comprar · toca uno para tacharlo` : '¡Todo comprado!') : 'Esta semana no hay platos con ingredientes.'),
    ...porSeccion(alimentos).map(([titulo, deSeccion]) => h('section', { class: 'grupo-recetas', 'aria-label': titulo },
      h('div', { class: 'titulo-seccion' }, h('h2', null, titulo),
        h('span', null, deSeccion.length === 1 ? '1 alimento' : `${deSeccion.length} alimentos`)),
      h('ul', { class: 'lista-pesados' }, deSeccion.map(a => fila(a, tachados.has(a.alimento), alternar(a.alimento)))))),
    alimentos.length ? h('div', { class: 'acciones-recetas' },
      h('button', { type: 'button', class: 'boton boton-secundario', onclick: compartir, disabled: !faltan },
        icono('share'), navigator.share ? 'Compartir' : 'Copiar'),
      h('button', { type: 'button', class: 'boton boton-secundario', disabled: !tachados.size,
        onclick: () => { tachados.clear(); guardarTachados(semana.clave, tachados, lista.map(s => s.clave)); repintar(); } },
      icono('undo'), 'Quitar tachados')) : null);
}

export async function cargarCompra(contenedor) {
  const guardado = leerPlan();
  if (guardado) pintar(contenedor, guardado);
  else contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando plan…'));
  try {
    const datos = await llamar('plan');
    guardarPlan(datos);
    pintar(contenedor, datos);
  } catch (err) {
    if (!guardado) contenedor.replaceChildren(vacio(err.message));
  }
}
