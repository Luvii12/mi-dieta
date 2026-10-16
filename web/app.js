import { llamar, leerConexion, guardarConexion, leerLocal, guardarLocal } from './api.js';

const TITULOS = { hoy: 'Hoy', plan: 'Plan', recetas: 'Recetas', progreso: 'Progreso', ajustes: 'Ajustes' };
const COMIDAS = ['desayuno', 'almuerzo', 'merienda', 'cena'];
const CACHE_HOY = 'dieta.ultimoHoy';
const CACHE_RECETAS = 'dieta.recetas';
const CACHE_PLAN = 'dieta.plan';

const $ = id => document.getElementById(id);

// ---------- Navegación ----------

function mostrarVista() {
  const vista = TITULOS[location.hash.slice(1)] ? location.hash.slice(1) : 'hoy';
  Object.keys(TITULOS).forEach(nombre => { $('vista-' + nombre).hidden = nombre !== vista; });
  document.querySelectorAll('.pestanas a').forEach(a => {
    a.toggleAttribute('aria-current', a.dataset.vista === vista);
  });
  $('titulo').textContent = TITULOS[vista];
  if (vista === 'hoy') cargarHoy();
  if (vista === 'plan') cargarPlan();
  if (vista === 'recetas') cargarRecetas();
  if (vista === 'ajustes') cargarAjustes();
}

// ---------- Hoy ----------

function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

const NOMBRE_COMIDA = { Desayuno: 'Desayuno', Almuerzo: 'Almuerzo', Merienda: 'Merienda', Cena: 'Cena' };

function fechaCorta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
}

function hoyIso() {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
}

const resumenMacros = m =>
  `${numero(m.kcal, 0)} kcal · P ${numero(m.P, 0)} · C ${numero(m.C, 0)} · G ${numero(m.G, 0)}`;

// Tarjeta de una comida del plan: nombre, macros, ingredientes y preparación.
function tarjetaComida(c) {
  const tarjeta = el('article', 'comida');
  const cabecera = el('div', 'comida-cabecera');
  cabecera.append(el('span', 'comida-tipo', NOMBRE_COMIDA[c.comida] || c.comida), el('span', 'comida-kcal', numero(c.macros.kcal, 0) + ' kcal'));
  tarjeta.append(cabecera, el('h3', 'comida-nombre', c.nombre),
    el('p', 'receta-macros', `P ${numero(c.macros.P)} g · C ${numero(c.macros.C)} g · G ${numero(c.macros.G)} g`));
  const escalables = c.ingredientes.filter(i => i.escalable);
  const fijos = c.ingredientes.filter(i => !i.escalable);
  if (escalables.length) tarjeta.append(listaIngredientes('Ajustados a tu objetivo', escalables, true));
  if (fijos.length) tarjeta.append(listaIngredientes('Fijos', fijos, false));
  if (c.preparacion) {
    const prep = el('details', 'preparacion-plegable');
    prep.append(el('summary', null, 'Cómo se prepara'), el('p', 'preparacion', c.preparacion));
    tarjeta.append(prep);
  }
  return tarjeta;
}

// Resumen del día frente al objetivo (tabla) y aviso si queda fuera de tolerancia.
function resumenDia(dia, objetivoDia) {
  const caja = el('div', 'resumen-dia');
  caja.append(tablaMacros({ macros: dia.macros, objetivo: objetivoDia, evaluacion: dia.evaluacion }, 'Total'));
  if (dia.revisar) caja.append(el('p', 'resultado error', 'Este día no cumple la tolerancia: revísalo o genera otro plan.'));
  return caja;
}

function pintarHoy(hoy) {
  $('hoy-fecha').textContent = fechaLarga(hoy.fecha);
  const contenido = $('hoy-contenido');
  contenido.innerHTML = '';
  if (!hoy.comidas.length) {
    const vacio = el('div', 'vacio');
    vacio.append(el('p', null, hoy.inicio ? `Tu plan empieza el ${fechaCorta(hoy.inicio)}.` : hoy.mensaje));
    const a = el('a', 'boton-enlace', 'Ir a Plan');
    a.href = '#plan';
    vacio.append(a);
    contenido.append(vacio);
    return;
  }
  const total = el('div', 'tarjeta');
  total.append(el('h2', null, 'Total del día'), resumenDia(hoy, hoy.objetivoDia));
  contenido.append(total);
  hoy.comidas.forEach(c => contenido.append(tarjetaComida(c)));
}

function pintarAviso(contenedor, texto, enlaceAjustes) {
  contenedor.innerHTML = '';
  const caja = document.createElement('div');
  caja.className = 'vacio';
  const p = document.createElement('p');
  p.textContent = texto;
  caja.append(p);
  if (enlaceAjustes) {
    const a = document.createElement('a');
    a.href = '#ajustes';
    a.className = 'boton-enlace';
    a.textContent = 'Ir a Ajustes';
    caja.append(a);
  }
  contenedor.append(caja);
}

async function cargarHoy() {
  const { url, token } = leerConexion();
  if (!url || !token) {
    $('hoy-fecha').textContent = '';
    pintarAviso($('hoy-contenido'), 'Conecta la app con tu hoja de Google para empezar.', true);
    return;
  }
  const guardado = hoyDesdeCache();
  if (guardado) pintarHoy(guardado);
  try {
    const hoy = await llamar('hoy');
    guardarLocal(CACHE_HOY, hoy);
    pintarHoy(hoy);
  } catch (err) {
    if (!guardado) pintarAviso($('hoy-contenido'), err.message, false);
  }
}

// Sin conexión: la última respuesta de «hoy» si es de hoy; si no, el día de hoy del plan activo guardado.
function hoyDesdeCache() {
  const fecha = hoyIso();
  const guardado = leerLocal(CACHE_HOY);
  if (guardado && guardado.fecha === fecha) return guardado;
  const plan = leerLocal(CACHE_PLAN);
  const dia = plan && plan.activo && plan.activo.dias.find(d => d.fecha === fecha);
  if (dia) return Object.assign({ objetivoDia: plan.activo.objetivoDia }, dia);
  return null;
}

// ---------- Plan ----------

function tarjetaDia(dia, objetivoDia) {
  const tarjeta = el('details', 'receta dia');
  tarjeta.dataset.id = dia.fecha;
  const resumen = el('summary');
  resumen.append(el('span', 'receta-nombre dia-fecha', fechaCorta(dia.fecha)), el('span', 'receta-macros', resumenMacros(dia.macros)));
  const platos = el('ul', 'dia-platos');
  dia.comidas.forEach(c => {
    const li = el('li');
    li.append(el('span', 'comida-tipo', NOMBRE_COMIDA[c.comida] || c.comida), el('span', null, c.nombre));
    platos.append(li);
  });
  resumen.append(platos);
  if (dia.revisar) resumen.append(el('span', 'etiqueta error', 'Para revisar'));
  tarjeta.append(resumen);
  const cuerpo = el('div', 'receta-cuerpo');
  cuerpo.append(resumenDia(dia, objetivoDia));
  dia.comidas.forEach(c => cuerpo.append(tarjetaComida(c)));
  tarjeta.append(cuerpo);
  return tarjeta;
}

function seccionPlan(plan, titulo, botones) {
  const seccion = el('section', 'bloque-plan');
  const cabecera = el('div', 'tarjeta');
  cabecera.append(el('h2', null, titulo),
    el('p', 'secundario', `Del ${fechaCorta(plan.inicio)} al ${fechaCorta(plan.fin)}`));
  const aRevisar = plan.dias.filter(d => d.revisar).length;
  cabecera.append(el('p', aRevisar ? 'resultado error' : 'resultado ok',
    aRevisar ? `${aRevisar} día(s) no cumplen la tolerancia.` : 'Los 14 días cumplen la tolerancia.'));
  botones.forEach(b => cabecera.append(b));
  seccion.append(cabecera);
  plan.dias.forEach(d => seccion.append(tarjetaDia(d, plan.objetivoDia)));
  return seccion;
}

function boton(texto, clase, accion) {
  const b = el('button', clase, texto);
  b.type = 'button';
  b.addEventListener('click', accion);
  return b;
}

let planActual = null;

function pintarPlan(datos) {
  planActual = datos;
  const contenido = $('plan-contenido');
  const abiertas = new Set([...contenido.querySelectorAll('details[open]')].map(d => d.dataset.id));
  contenido.innerHTML = '';
  const mensaje = el('p', 'resultado', '');
  mensaje.id = 'plan-mensaje';
  contenido.append(mensaje);

  if (datos.borrador) {
    contenido.append(seccionPlan(datos.borrador, 'Borrador sin activar', [
      boton('Activar plan', 'boton-principal', () => activarPlan(datos.borrador.plan_id)),
      boton('Generar otro borrador', 'secundario-boton', generarPlan),
    ]));
  }
  if (datos.activo) {
    const botones = datos.borrador ? [] : [boton('Generar el siguiente plan', 'secundario-boton', generarPlan)];
    contenido.append(seccionPlan(datos.activo, 'Plan activo', botones));
  }
  if (!datos.borrador && !datos.activo) {
    const vacio = el('div', 'vacio');
    vacio.append(el('p', null, 'Todavía no tienes ningún plan.'),
      el('p', 'secundario', 'Se generan 14 días a partir del lunes que viene, con tus recetas y tus objetivos.'),
      boton('Generar plan', 'boton-principal', generarPlan));
    contenido.append(vacio);
  }
  contenido.querySelectorAll('details.dia').forEach(d => { d.open = abiertas.has(d.dataset.id); });
}

function mensajePlan(texto, esError) {
  const m = $('plan-mensaje');
  if (m) mostrarResultado(m, texto, esError);
}

function bloquearBotonesPlan(bloquear) {
  $('plan-contenido').querySelectorAll('button').forEach(b => { b.disabled = bloquear; });
}

async function cargarPlan() {
  const { url, token } = leerConexion();
  if (!url || !token) {
    pintarAviso($('plan-contenido'), 'Conecta la app con tu hoja de Google para ver tu plan.', true);
    return;
  }
  const guardado = leerLocal(CACHE_PLAN);
  if (guardado) pintarPlan(guardado);
  else pintarAviso($('plan-contenido'), 'Cargando plan…', false);
  try {
    const datos = await llamar('plan');
    guardarLocal(CACHE_PLAN, datos);
    pintarPlan(datos);
  } catch (err) {
    if (!guardado) pintarAviso($('plan-contenido'), err.message, false);
  }
}

async function generarPlan() {
  if (planActual && planActual.borrador && !confirm('Se sustituirá el borrador actual por uno nuevo. ¿Seguir?')) return;
  bloquearBotonesPlan(true);
  mensajePlan('Generando 14 días… puede tardar unos segundos.', false);
  try {
    const borrador = await llamar('generarPlan');
    const datos = Object.assign({}, planActual || {}, { borrador: borrador });
    guardarLocal(CACHE_PLAN, datos);
    pintarPlan(datos);
    if (borrador.descartadas && borrador.descartadas.length) {
      mensajePlan(`Recetas no usadas: ${borrador.descartadas.map(d => `${d.id} (${d.motivo})`).join(', ')}.`, false);
    }
  } catch (err) {
    bloquearBotonesPlan(false);
    mensajePlan(err.message, true);
  }
}

async function activarPlan(planId) {
  bloquearBotonesPlan(true);
  mensajePlan('Activando…', false);
  try {
    await llamar('activarPlan', { plan_id: planId });
    guardarLocal(CACHE_HOY, null);
    const datos = await llamar('plan');
    guardarLocal(CACHE_PLAN, datos);
    pintarPlan(datos);
    mensajePlan('Plan activado. Lo verás en «Hoy» desde el ' + fechaCorta(datos.activo.inicio) + '.', false);
  } catch (err) {
    bloquearBotonesPlan(false);
    mensajePlan(err.message, true);
  }
}

// ---------- Recetas ----------

const NOMBRES_NUTRIENTE = { kcal: 'Energía', P: 'Proteína', C: 'Carbohidratos', G: 'Grasa' };

// Crea un elemento con clase y texto (el texto nunca se interpreta como HTML).
function el(etiqueta, clase, texto) {
  const e = document.createElement(etiqueta);
  if (clase) e.className = clase;
  if (texto != null) e.textContent = texto;
  return e;
}

function cantidad(ing) {
  const unidad = ing.alimento.endsWith('_ml') ? ' ml' : ' g';
  const texto = numero(ing.gramos, 0) + unidad;
  return ing.piezas ? `${ing.piezas} ud. (${texto})` : texto;
}

function listaIngredientes(titulo, ingredientes, destacar) {
  const bloque = el('div', 'ingredientes');
  bloque.append(el('h3', null, titulo));
  const lista = el('ul');
  ingredientes.forEach(ing => {
    const li = el('li');
    const nombre = el(destacar ? 'strong' : 'span', null, ing.nombre);
    li.append(nombre, el('span', 'estado', ing.estado), el('span', 'cantidad', cantidad(ing)));
    lista.append(li);
  });
  bloque.append(lista);
  return bloque;
}

function tablaMacros(ajuste, etiqueta = 'Receta') {
  const tabla = el('table', 'macros');
  tabla.innerHTML = `<thead><tr><th></th><th>${etiqueta}</th><th>Objetivo</th><th>Desvío</th></tr></thead>`;
  const cuerpo = el('tbody');
  ['kcal', 'P', 'C', 'G'].forEach(n => {
    const d = ajuste.evaluacion ? ajuste.evaluacion.detalle[n] : null;
    const fila = el('tr', d && !d.ok ? 'fuera' : '');
    const decimales = n === 'kcal' ? 0 : 1;
    const unidad = n === 'kcal' ? '' : ' g';
    fila.append(
      el('th', null, NOMBRES_NUTRIENTE[n]),
      el('td', null, numero(ajuste.macros[n], decimales) + unidad),
      el('td', null, numero(ajuste.objetivo[n], decimales) + unidad),
      el('td', null, d ? (d.desvio_pct >= 0 ? '+' : '') + numero(d.desvio_pct, 0) + ' %' : '—'),
    );
    cuerpo.append(fila);
  });
  tabla.append(cuerpo);
  return tabla;
}

function tarjetaReceta(receta) {
  const tarjeta = el('details', 'receta');
  tarjeta.dataset.id = receta.id;
  const resumen = el('summary');
  resumen.append(el('span', 'receta-nombre', receta.nombre));
  if (receta.error) {
    resumen.append(el('span', 'etiqueta error', 'No se puede calcular'));
    tarjeta.append(resumen, el('p', 'resultado error', receta.error));
    return tarjeta;
  }
  const a = receta.ajuste;
  resumen.append(el('span', 'receta-macros',
    `${numero(a.macros.kcal, 0)} kcal · P ${numero(a.macros.P, 0)} · C ${numero(a.macros.C, 0)} · G ${numero(a.macros.G, 0)}`));
  if (a.evaluacion && !a.evaluacion.ok) {
    const fuera = ['kcal', 'P', 'C', 'G'].filter(n => !a.evaluacion.detalle[n].ok).map(n => NOMBRES_NUTRIENTE[n].toLowerCase());
    resumen.append(el('span', 'etiqueta aviso-etiqueta', 'Fuera de margen: ' + fuera.join(', ')));
  }
  tarjeta.append(resumen);

  const cuerpo = el('div', 'receta-cuerpo');
  cuerpo.append(listaIngredientes('Ajustados a tu objetivo', a.ingredientes.filter(i => i.escalable), true));
  const fijos = a.ingredientes.filter(i => !i.escalable);
  if (fijos.length) cuerpo.append(listaIngredientes('Fijos', fijos, false));
  cuerpo.append(tablaMacros(a));
  if (receta.preparacion) {
    cuerpo.append(el('h3', null, 'Preparación'), el('p', 'preparacion', receta.preparacion));
  }
  tarjeta.append(cuerpo);
  return tarjeta;
}

function pintarRecetas(recetas) {
  const contenido = $('recetas-contenido');
  // Al refrescar con datos nuevos, las recetas abiertas siguen abiertas.
  const abiertas = new Set([...contenido.querySelectorAll('details[open]')].map(d => d.dataset.id));
  contenido.innerHTML = '';
  ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].forEach(comida => {
    const deComida = recetas.filter(r => r.comida === comida);
    if (!deComida.length) return;
    contenido.append(el('h2', 'grupo-comida', `${comida} · ${deComida.length}`));
    deComida.forEach(r => {
      const tarjeta = tarjetaReceta(r);
      tarjeta.open = abiertas.has(r.id);
      contenido.append(tarjeta);
    });
  });
}

async function cargarRecetas() {
  const { url, token } = leerConexion();
  if (!url || !token) {
    pintarAviso($('recetas-contenido'), 'Conecta la app con tu hoja de Google para ver las recetas.', true);
    return;
  }
  const guardadas = leerLocal(CACHE_RECETAS);
  if (guardadas) pintarRecetas(guardadas);
  else pintarAviso($('recetas-contenido'), 'Calculando recetas…', false);
  try {
    const recetas = await llamar('recetas');
    guardarLocal(CACHE_RECETAS, recetas);
    pintarRecetas(recetas);
  } catch (err) {
    if (!guardadas) pintarAviso($('recetas-contenido'), err.message, false);
  }
}

// ---------- Ajustes ----------

function mostrarResultado(elemento, texto, esError) {
  elemento.textContent = texto;
  elemento.classList.toggle('error', Boolean(esError));
  elemento.classList.toggle('ok', !esError);
}

// 24.9 → '24,9' (formato de España)
const numero = (n, decimales = 1) =>
  Number(n).toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

function pintarObjetivos(config) {
  const filas = COMIDAS.map(comida => {
    const o = config['objetivo_' + comida];
    if (!o) return '';
    return `<tr><th>${comida[0].toUpperCase() + comida.slice(1)}</th>` +
      `<td>${numero(o.kcal, 0)}</td><td>${numero(o.P)}</td><td>${numero(o.C)}</td><td>${numero(o.G)}</td></tr>`;
  }).join('');
  const total = COMIDAS.reduce((suma, comida) => {
    const o = config['objetivo_' + comida] || {};
    ['kcal', 'P', 'C', 'G'].forEach(k => { suma[k] += Number(o[k]) || 0; });
    return suma;
  }, { kcal: 0, P: 0, C: 0, G: 0 });
  $('tabla-objetivos').innerHTML =
    '<table><thead><tr><th></th><th>kcal</th><th>P (g)</th><th>C (g)</th><th>G (g)</th></tr></thead>' +
    `<tbody>${filas}</tbody><tfoot><tr><th>Día</th><td>${numero(total.kcal, 0)}</td>` +
    `<td>${numero(total.P)}</td><td>${numero(total.C)}</td><td>${numero(total.G)}</td></tr></tfoot></table>`;
}

async function cargarAjustes() {
  const { url, token } = leerConexion();
  $('campo-url').value = url;
  $('campo-token').value = token;
  if (!url || !token) return;
  try {
    pintarObjetivos(await llamar('config'));
  } catch (err) {
    mostrarResultado($('resultado-conexion'), err.message, true);
  }
}

async function guardarYProbar(evento) {
  evento.preventDefault();
  const resultado = $('resultado-conexion');
  guardarConexion($('campo-url').value, $('campo-token').value);
  mostrarResultado(resultado, 'Probando…', false);
  try {
    const config = await llamar('config');
    pintarObjetivos(config);
    mostrarResultado(resultado, `Conectado. La hoja tiene ${Object.keys(config).length} valores de configuración.`, false);
  } catch (err) {
    mostrarResultado(resultado, err.message, true);
  }
}

async function escribirPrueba() {
  const resultado = $('resultado-escritura');
  const ahora = new Date().toLocaleString('es-ES');
  mostrarResultado(resultado, 'Escribiendo…', false);
  try {
    const config = await llamar('config', { cambios: { ultima_prueba: ahora } });
    const leido = config.ultima_prueba;
    if (leido === ahora) {
      mostrarResultado(resultado, `Escrito y leído: «${leido}». Míralo en la pestaña config.`, false);
    } else {
      mostrarResultado(resultado, `Se escribió «${ahora}» pero se leyó «${leido}».`, true);
    }
  } catch (err) {
    mostrarResultado(resultado, err.message, true);
  }
}

// ---------- Arranque ----------

function actualizarRed() {
  $('estado-red').hidden = navigator.onLine;
}

$('form-conexion').addEventListener('submit', guardarYProbar);
$('boton-escribir').addEventListener('click', escribirPrueba);
window.addEventListener('hashchange', mostrarVista);
window.addEventListener('online', actualizarRed);
window.addEventListener('offline', actualizarRed);
actualizarRed();
mostrarVista();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {
    // Sin service worker la app funciona igual, solo que no sin conexión.
  });
}
