// Pantalla «Ajustes»: objetivos por comida (solo lectura hasta la Fase 4) y conexión con la hoja de Google
// (design/mi_dieta_ajustes).

import { llamar, leerConexion, guardarConexion, leerLocal, guardarLocal } from './api.js';
import { $, h, icono, numero, COMIDAS, ICONO_COMIDA } from './comun.js';

const CACHE_CONFIG = 'dieta.config';
const ULTIMA_CONEXION = 'dieta.ultimaConexion';
const COLOR_COMIDA = { Desayuno: 'texto-primario', Almuerzo: 'texto-secundario', Merienda: 'texto-terciario', Cena: 'texto-primario-contenedor' };

export function kcalDia(config) {
  return COMIDAS.reduce((s, c) => s + (Number((config['objetivo_' + c.toLowerCase()] || {}).kcal) || 0), 0);
}

function pintarObjetivos(config) {
  const total = kcalDia(config);
  $('objetivos-total').textContent = `Total: ${numero(total)} kcal`;
  $('objetivos-total').hidden = !total;
  $('marca-sub-kcal').textContent = `${numero(total)} kcal/día`;
  $('lista-objetivos').replaceChildren(...COMIDAS.map(comida => {
    const o = config['objetivo_' + comida.toLowerCase()];
    if (!o) return '';
    const pct = total ? Math.round(o.kcal / total * 100) : 0;
    return h('li', { class: 'objetivo' },
      h('span', { class: 'objetivo-icono ' + COLOR_COMIDA[comida], 'aria-hidden': 'true' }, icono(ICONO_COMIDA[comida])),
      h('span', { class: 'objetivo-texto' },
        h('span', { class: 'objetivo-nombre' }, comida),
        h('span', { class: 'objetivo-macros' }, `P ${numero(o.P, 1)} · C ${numero(o.C, 1)} · G ${numero(o.G, 1)} g`)),
      h('span', { class: 'objetivo-kcal' },
        h('span', { class: 'objetivo-cifra' }, numero(o.kcal)), h('span', { class: 'objetivo-unidad' }, ' kcal'),
        h('span', { class: 'objetivo-pct' }, `~${pct}%`)));
  }));
}

function pintarEstado(ok, texto) {
  const ultima = leerLocal(ULTIMA_CONEXION);
  $('estado-conexion').classList.toggle('estado-error', !ok);
  $('estado-icono').textContent = ok ? 'cloud_done' : 'cloud_off';
  $('estado-titulo').textContent = texto || (ultima ? 'Conectado con Google Sheets' : 'Sin conectar');
  $('estado-detalle').textContent = ultima ? `Última comprobación: ${ultima}` : 'Escribe la URL y el token y pulsa «Probar conexión».';
}

function cuandoConecta(config) {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  guardarLocal(ULTIMA_CONEXION, `${ahora.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '')}, ${hora}`);
  guardarLocal(CACHE_CONFIG, config);
  pintarObjetivos(config);
  pintarEstado(true);
}

export async function cargarAjustes() {
  const { url, token } = leerConexion();
  $('campo-url').value = url;
  $('campo-token').value = token;
  const guardada = leerLocal(CACHE_CONFIG);
  if (guardada) pintarObjetivos(guardada);
  pintarEstado(Boolean(url && token && leerLocal(ULTIMA_CONEXION)));
  if (!url || !token) return;
  try {
    cuandoConecta(await llamar('config'));
  } catch (err) {
    pintarEstado(false, err.message);
  }
}

async function probarConexion(evento) {
  evento.preventDefault();
  const boton = $('boton-probar');
  guardarConexion($('campo-url').value, $('campo-token').value);
  boton.disabled = true;
  $('boton-probar-texto').textContent = 'Comprobando…';
  try {
    cuandoConecta(await llamar('config'));
  } catch (err) {
    pintarEstado(false, err.message);
  } finally {
    boton.disabled = false;
    $('boton-probar-texto').textContent = 'Probar conexión';
  }
}

function alternarToken() {
  const campo = $('campo-token');
  const mostrar = campo.type === 'password';
  campo.type = mostrar ? 'text' : 'password';
  $('boton-ver-token').setAttribute('aria-label', mostrar ? 'Ocultar token' : 'Mostrar token');
  $('boton-ver-token').querySelector('.icono').textContent = mostrar ? 'visibility_off' : 'visibility';
}

export function prepararAjustes() {
  $('form-conexion').addEventListener('submit', probarConexion);
  $('boton-ver-token').addEventListener('click', alternarToken);
  const guardada = leerLocal(CACHE_CONFIG);
  if (guardada) $('marca-sub-kcal').textContent = `${numero(kcalDia(guardada))} kcal/día`;
}
