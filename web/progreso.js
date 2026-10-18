// Pantalla «Progreso»: peso con la media de 7 días, adherencia del bloque, racha y registro del peso
// (design/mi_dieta_progreso).

import { llamar, leerLocal, guardarLocal } from './api.js';
import { $, h, icono, numero, fechaLarga, diasEntre, hoyIso } from './comun.js';
import { vacio } from './hoy.js';

const CACHE_PROGRESO = 'dieta.progreso';
const PESO_INICIAL = 75;

const kg = n => numero(n, 1);

// ---------- Gráfica ----------

// Escala del eje: 3 líneas redondas (p. ej. 78, 79, 80 kg) que abarcan todos los valores.
function escala(valores) {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  for (const paso of [0.5, 1, 2, 5, 10]) {
    const bajo = Math.floor(min / paso) * paso;
    if (bajo + 2 * paso >= max) return { bajo, paso };
  }
  return { bajo: Math.floor(min), paso: Math.ceil((max - min) / 2) };
}

function grafica(pesos, hoy) {
  const ANCHO = 320;
  const ALTO = 120;
  let inicio = pesos[0].fecha;
  if (diasEntre(inicio, hoy) < 6) inicio = hoyMenos(hoy, 6);
  const dias = diasEntre(inicio, hoy);
  const x = fecha => 12 + diasEntre(inicio, fecha) / dias * (ANCHO - 24);
  const { bajo, paso } = escala(pesos.flatMap(p => [p.peso, p.media]));
  const alto = bajo + 2 * paso;
  const y = v => 14 + (alto - v) / (alto - bajo) * (ALTO - 28);

  const linea = pesos.map((p, i) => `${i ? 'L' : 'M'} ${x(p.fecha).toFixed(1)} ${y(p.media).toFixed(1)}`).join(' ');
  const ultimo = pesos[pesos.length - 1];
  const area = `${linea} L ${x(ultimo.fecha).toFixed(1)} ${ALTO} L ${x(pesos[0].fecha).toFixed(1)} ${ALTO} Z`;
  const svg = `<svg viewBox="0 0 ${ANCHO} ${ALTO}" aria-hidden="true">
    <defs><linearGradient id="degradado-peso" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" class="grafica-degradado" stop-opacity="0.22"/><stop offset="100%" class="grafica-degradado" stop-opacity="0"/>
    </linearGradient></defs>
    ${pesos.length > 1 ? `<path d="${area}" fill="url(#degradado-peso)"/>` : ''}
    ${pesos.length > 1 ? `<path d="${linea}" class="grafica-linea" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
    ${pesos.slice(0, -1).map(p => `<circle cx="${x(p.fecha).toFixed(1)}" cy="${y(p.peso).toFixed(1)}" r="2.5" class="grafica-punto"/>`).join('')}
    <circle cx="${x(ultimo.fecha).toFixed(1)}" cy="${y(ultimo.peso).toFixed(1)}" r="4.5" class="grafica-ultimo" stroke-width="1.5"/>
  </svg>`;

  const caja = h('div', { class: 'grafica', role: 'img',
    'aria-label': `Gráfica de peso: ${pesos.length} pesajes desde el ${fechaLarga(pesos[0].fecha).toLowerCase()}; media de 7 días actual ${kg(ultimo.media)} kg.` });
  [alto, bajo + paso, bajo].forEach(v => caja.append(
    // Sobre el dibujo, que deja 10 px de relleno arriba y abajo.
    h('div', { class: 'grafica-guia', style: `top: calc(10px + (100% - 20px) * ${(y(v) / ALTO).toFixed(3)})` }, h('span', null, `${kg(v)} kg`))));
  const dibujo = h('div', { class: 'grafica-dibujo' });
  dibujo.innerHTML = svg;
  caja.append(dibujo);

  const semanas = Math.max(1, Math.ceil((dias + 1) / 7));
  const ejes = h('div', { class: 'grafica-ejes', 'aria-hidden': 'true' },
    Array.from({ length: semanas }, (_, i) => i === semanas - 1
      ? h('span', { class: 'texto-primario' }, semanas === 1 ? 'Esta semana' : `S${i + 1} (Hoy)`)
      : h('span', null, `S${i + 1}`)));
  return { caja, ejes, semanas };
}

const hoyMenos = (iso, n) => {
  const [a, m, d] = iso.split('-').map(Number);
  const f = new Date(a, m - 1, d - n);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
};

// ---------- Tarjetas ----------

function tarjetaPeso(p) {
  const cambio = p.cambio_semana;
  let chip = null;
  if (cambio !== null && cambio !== undefined) {
    const tendencia = cambio < -0.05 ? 'trending_down' : cambio > 0.05 ? 'trending_up' : 'trending_flat';
    chip = h('span', { class: 'chip-cambio' + (cambio > 0.05 ? ' chip-cambio-sube' : ''),
      'aria-label': `Media de 7 días: ${cambio > 0 ? '+' : ''}${kg(cambio)} kg respecto a la semana anterior` },
    icono(tendencia), h('span', { 'aria-hidden': 'true' }, `${cambio > 0 ? '+' : ''}${kg(cambio)} kg`));
  }
  const partes = [
    h('div', { class: 'peso-cabecera' },
      h('div', null,
        h('span', { class: 'peso-etiqueta' }, 'Peso actual registrado'),
        h('div', { class: 'peso-cifra' },
          h('span', { class: 'peso-valor' }, p.ultimo ? kg(p.ultimo.peso) : '—'),
          h('span', { class: 'peso-unidad' }, 'kg'))),
      h('div', { class: 'peso-lateral' },
        chip,
        p.meta ? h('span', { class: 'peso-meta' }, 'Meta: ', h('strong', null, `${kg(p.meta)} kg`)) : null)),
  ];
  if (p.pesos.length) {
    const g = grafica(p.pesos, p.fecha);
    partes.push(h('div', { class: 'grafica-bloque' },
      h('div', { class: 'grafica-leyenda' },
        h('div', { class: 'grafica-claves' },
          h('span', { class: 'clave' }, h('span', { class: 'clave-linea' }), 'Media 7 días'),
          h('span', { class: 'clave' }, h('span', { class: 'clave-punto' }), 'Pesaje diario')),
        h('span', null, g.semanas === 1 ? 'Última semana' : `Últimas ${g.semanas} semanas`)),
      g.caja, g.ejes));
  } else {
    partes.push(h('p', { class: 'texto-ayuda' }, 'Todavía no hay pesajes. Pésate por la mañana, en ayunas, para que la media de 7 días sea fiable.'));
  }
  return h('section', { class: 'tarjeta tarjeta-peso', 'aria-label': 'Peso' }, partes);
}

function tarjetaAdherencia(p) {
  const a = p.bloque.adherencia;
  const pct = a.pct === null ? null : a.pct;
  return h('section', { class: 'tarjeta tarjeta-adherencia', 'aria-labelledby': 'adherencia-titulo' },
    h('div', { class: 'adherencia-cabecera' },
      h('div', null,
        h('h2', { id: 'adherencia-titulo' }, 'Adherencia del bloque'),
        h('p', { class: 'texto-ayuda' }, a.planificadas ? `${a.hechas} de ${a.planificadas} comidas completadas` : 'Aún no hay comidas que contar')),
      h('span', { class: 'adherencia-pct' }, pct === null ? '—' : `${pct}%`)),
    h('div', { class: 'barra barra-gruesa', role: 'img', 'aria-label': `Adherencia: ${pct === null ? 'sin datos' : pct + ' %'}` },
      h('div', { class: 'barra-relleno relleno-secundario', style: `width: ${pct || 0}%` })),
    h('div', { class: 'adherencia-pie' },
      h('span', { class: 'racha' }, icono('local_fire_department', 'relleno texto-secundario'),
        h('strong', null, `${p.racha} ${p.racha === 1 ? 'día' : 'días'}`), h('span', { class: 'racha-nota' }, 'racha activa')),
      a.sin_marcar ? h('span', { class: 'sin-marcar' }, `${a.sin_marcar} sin marcar`) : null));
}

function pintar(contenedor, p) {
  const b = p.bloque;
  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' },
      h('div', null,
        h('h1', { class: 'titulo-pantalla' }, 'Progreso'),
        h('p', { class: 'subtitulo' }, b ? `Bloque ${b.numero} · Semana ${b.dia > 7 ? 2 : 1} de ${Math.ceil(b.dias / 7)}` : 'Sin plan activo')),
      b ? h('span', { class: 'insignia insignia-activo-suave' }, h('span', { class: 'punto-activo' }), 'Activo') : null),
    tarjetaPeso(p),
    b ? tarjetaAdherencia(p) : null,
    h('button', { type: 'button', class: 'boton boton-primario boton-grande', 'data-foco': 'registrar-peso', onclick: () => abrirPeso(p) },
      icono('scale'), p.ultimo && p.ultimo.fecha === p.fecha ? 'Cambiar el peso de hoy' : 'Registrar peso de hoy'));
}

// Igual que precargarRecetas: progreso en segundo plano al abrir la app.
export async function precargarProgreso() {
  try {
    guardarLocal(CACHE_PROGRESO, await llamar('progreso'));
  } catch (err) {
    // Se reintenta al abrir Progreso.
  }
}

export async function cargarProgreso(contenedor) {
  const guardado = leerLocal(CACHE_PROGRESO);
  if (guardado) pintar(contenedor, guardado);
  else contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando…'));
  try {
    const p = await llamar('progreso');
    guardarLocal(CACHE_PROGRESO, p);
    pintar(contenedor, p);
  } catch (err) {
    if (!guardado) contenedor.replaceChildren(vacio(err.message));
  }
}

// ---------- Registrar peso ----------

const leerPeso = () => Number($('peso-valor').value.replace(',', '.'));

function abrirPeso(p) {
  const hoy = hoyIso();
  const deHoy = p.ultimo && p.ultimo.fecha === hoy;
  $('peso-titulo').textContent = deHoy ? 'Cambiar el peso de hoy' : 'Registrar peso de hoy';
  $('peso-fecha').textContent = fechaLarga(hoy);
  $('peso-valor').value = kg(p.ultimo ? p.ultimo.peso : PESO_INICIAL);
  $('peso-estado').textContent = '';
  $('panel-peso').showModal();
}

async function guardarPeso(evento) {
  evento.preventDefault();
  const peso = leerPeso();
  if (!(peso >= 25 && peso <= 350)) {
    $('peso-estado').textContent = 'Escribe un peso válido, por ejemplo 78,4.';
    return;
  }
  const boton = $('peso-guardar');
  boton.disabled = true;
  $('peso-estado').textContent = 'Guardando…';
  try {
    const p = await llamar('registrarPeso', { peso_kg: peso, fecha: hoyIso() });
    guardarLocal(CACHE_PROGRESO, p);
    $('panel-peso').close();
    pintar($('vista-progreso'), p);
    $('vista-progreso').querySelector('[data-foco="registrar-peso"]').focus();
  } catch (err) {
    $('peso-estado').textContent = err.message;
  } finally {
    boton.disabled = false;
  }
}

export function prepararProgreso() {
  const panel = $('panel-peso');
  $('peso-cerrar').addEventListener('click', () => panel.close());
  panel.addEventListener('click', e => { if (e.target === panel) panel.close(); });
  $('form-peso').addEventListener('submit', guardarPeso);
  panel.querySelectorAll('[data-paso]').forEach(b => b.addEventListener('click', () => {
    const actual = leerPeso() || PESO_INICIAL;
    $('peso-valor').value = kg(Math.round((actual + Number(b.dataset.paso)) * 10) / 10);
  }));
}
