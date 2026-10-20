// Pantalla «Ajustes»: mi objetivo (perfil.js), objetivos por comida, alimentos que no como, comida libre
// semanal, peso objetivo, nombres de alimentos (solo quien creó la biblioteca) y cuenta (design/mi_dieta_ajustes).

import { llamar, leerLocal, guardarLocal, leerSesion, cerrarSesion, cambiarContrasena, puedoEditarAlimentos } from './api.js';
import { $, h, icono, numero, avisar, abrirFormulario, COMIDAS, ICONO_COMIDA } from './comun.js';
import { METAS, ENTRENOS, EJERCICIOS } from './perfil.js';
import { abrirAlimentoNuevo } from './recetas.js';

const CACHE_CONFIG = 'dieta.config';
const CACHE_ALIMENTOS = 'dieta.alimentos';
const CACHE_EDITA = 'dieta.editaAlimentos';
const COLOR_COMIDA = { Desayuno: 'texto-primario', Almuerzo: 'texto-secundario', Merienda: 'texto-terciario', Cena: 'texto-primario-contenedor' };
const KCAL_MINIMAS = 1400;

let config = null;
let alimentos = null;

export function kcalDia(cfg) {
  return COMIDAS.reduce((s, c) => s + (Number((cfg['objetivo_' + c.toLowerCase()] || {}).kcal) || 0), 0);
}

// ---------- Objetivos y preferencias ----------

function pintarPerfil() {
  const p = config.perfil;
  $('perfil-icono').textContent = p ? METAS[p.meta].icono : 'person';
  $('perfil-meta').textContent = p ? METAS[p.meta].nombre : 'Completa tu perfil';
  const ejercicio = p && (p.entreno === 'no' ? 'Sin ejercicio' : `${EJERCICIOS[p.ejercicio || 'fuerza'].nombre} ${ENTRENOS[p.entreno]}`);
  const detalle = p && [ejercicio, p.andar ? 'andas a diario' : '', `${numero(p.peso_kg, 1)} kg`].filter(Boolean).join(' · ');
  $('perfil-detalle').textContent = p ? detalle : 'La app calcula tus objetivos según tu meta';
}

function pintarObjetivos() {
  pintarPerfil();
  const total = kcalDia(config);
  $('objetivos-total').textContent = `Total: ${numero(total)} kcal`;
  $('objetivos-total').hidden = !total;
  $('marca-sub-kcal').textContent = `${numero(total)} kcal/día`;
  $('lista-objetivos').replaceChildren(...COMIDAS.map(comida => {
    const o = config['objetivo_' + comida.toLowerCase()];
    if (!o) return '';
    const pct = total ? Math.round(o.kcal / total * 100) : 0;
    return h('li', null, h('button', { type: 'button', class: 'objetivo objetivo-boton', 'data-foco': 'objetivo-' + comida,
      'aria-label': `${comida}: ${numero(o.kcal)} kcal, proteína ${numero(o.P, 1)}, carbohidratos ${numero(o.C, 1)}, grasa ${numero(o.G, 1)} gramos. Editar`,
      onclick: () => editarObjetivo(comida) },
    h('span', { class: 'objetivo-icono ' + COLOR_COMIDA[comida], 'aria-hidden': 'true' }, icono(ICONO_COMIDA[comida])),
    h('span', { class: 'objetivo-texto' },
      h('span', { class: 'objetivo-nombre' }, comida),
      h('span', { class: 'objetivo-macros' }, `P ${numero(o.P, 1)} · C ${numero(o.C, 1)} · G ${numero(o.G, 1)} g`)),
    h('span', { class: 'objetivo-kcal' },
      h('span', null, h('span', { class: 'objetivo-cifra' }, numero(o.kcal)), h('span', { class: 'objetivo-unidad' }, ' kcal')),
      h('span', { class: 'objetivo-pct' }, `~${pct}%`)),
    icono('chevron_right', 'objetivo-flecha')));
  }));

  const libre = config.comida_libre_semanal !== false;
  $('interruptor-libre').setAttribute('aria-checked', String(libre));
  $('meta-cifra').textContent = config.peso_objetivo ? numero(config.peso_objetivo, 1) : '—';
}

// Guarda claves de config y repinta. Devuelve la config nueva.
async function guardarConfig(cambios) {
  const nueva = await llamar('config', { cambios });
  config = nueva;
  guardarLocal(CACHE_CONFIG, nueva);
  pintarObjetivos();
  return nueva;
}

function editarObjetivo(comida) {
  const clave = 'objetivo_' + comida.toLowerCase();
  const o = config[clave];
  abrirFormulario({
    titulo: `Objetivo de ${comida.toLowerCase()}`,
    nota: 'Se aplica a los próximos planes y al cambiar un plato. Los gramos del plan activo no cambian.',
    foco: 'objetivo-' + comida,
    campos: [
      { clave: 'kcal', etiqueta: 'Calorías', unidad: 'kcal', valor: o.kcal },
      { clave: 'P', etiqueta: 'Proteína', unidad: 'g', valor: o.P, decimales: 1 },
      { clave: 'C', etiqueta: 'Carbohidratos', unidad: 'g', valor: o.C, decimales: 1 },
      { clave: 'G', etiqueta: 'Grasa', unidad: 'g', valor: o.G, decimales: 1 },
    ],
    guardar: async v => {
      if (!(v.kcal >= 50 && v.kcal <= 2000)) throw new Error('Las calorías deben estar entre 50 y 2.000.');
      if (['P', 'C', 'G'].some(m => !(v[m] >= 0 && v[m] <= 300))) throw new Error('Los gramos deben estar entre 0 y 300.');
      const nuevo = { kcal: Math.round(v.kcal), P: Math.round(v.P * 10) / 10, C: Math.round(v.C * 10) / 10, G: Math.round(v.G * 10) / 10 };
      const kcalMacros = nuevo.P * 4 + nuevo.C * 4 + nuevo.G * 9;
      if (Math.abs(kcalMacros - nuevo.kcal) > nuevo.kcal * 0.15) {
        throw new Error(`Los macros suman ${numero(kcalMacros)} kcal (P y C × 4, G × 9): no cuadran con ${numero(nuevo.kcal)} kcal.`);
      }
      const total = kcalDia(config) - o.kcal + nuevo.kcal;
      const minimas = Number(config.kcal_minimas) || KCAL_MINIMAS;
      if (total < minimas && !confirm(`El día quedaría en ${numero(total)} kcal, por debajo del mínimo de ${numero(minimas)}. ¿Guardar de todos modos?`)) {
        throw new Error('No se ha guardado.');
      }
      await guardarConfig({ [clave]: nuevo });
    },
  });
}

function editarMeta() {
  abrirFormulario({
    titulo: 'Peso objetivo',
    nota: 'Solo se muestra como meta en Progreso; no cambia el plan. Déjalo vacío para quitarlo.',
    foco: 'fila-meta',
    campos: [{ clave: 'peso', etiqueta: 'Peso objetivo', unidad: 'kg', valor: config.peso_objetivo || null, decimales: 1 }],
    guardar: async v => {
      if (!Number.isNaN(v.peso) && !(v.peso >= 30 && v.peso <= 300)) throw new Error('Escribe un peso entre 30 y 300 kg.');
      await guardarConfig({ peso_objetivo: Number.isNaN(v.peso) ? null : Math.round(v.peso * 10) / 10 });
    },
  });
}

async function alternarLibre() {
  const boton = $('interruptor-libre');
  const nuevo = boton.getAttribute('aria-checked') !== 'true';
  boton.setAttribute('aria-checked', String(nuevo));
  boton.disabled = true;
  try {
    await guardarConfig({ comida_libre_semanal: nuevo });
  } catch (err) {
    boton.setAttribute('aria-checked', String(!nuevo));
    avisar(err.message);
  } finally {
    boton.disabled = false;
  }
}

// ---------- Alimentos que no como ----------

function pintarExcluidos() {
  if (!alimentos) return;
  const excluidos = alimentos.filter(a => a.excluido);
  $('excluidos-total').textContent = `${excluidos.length} ${excluidos.length === 1 ? 'excluido' : 'excluidos'}`;
  $('lista-excluidos').replaceChildren(...(excluidos.length
    ? excluidos.map(a => h('li', { class: 'chip' },
      h('span', null, a.nombre),
      h('button', { type: 'button', class: 'chip-quitar', 'aria-label': `Quitar ${a.nombre}`, 'data-foco': 'quitar-' + a.id,
        onclick: () => guardarExcluidos(excluidos.filter(x => x !== a).map(x => x.id), `${a.nombre} vuelve a poder salir en el plan.`) },
      icono('close'))))
    : [h('li', { class: 'texto-ayuda' }, 'Ninguno por ahora.')]));
}

async function guardarExcluidos(ids, texto) {
  const estado = $('excluidos-estado');
  estado.classList.remove('mensaje-error');
  estado.textContent = 'Guardando…';
  try {
    await llamar('guardarExcluidos', { alimentos: ids });
    alimentos.forEach(a => { a.excluido = ids.includes(a.id); });
    guardarLocal(CACHE_ALIMENTOS, alimentos);
    pintarExcluidos();
    estado.textContent = texto;
    $('boton-anadir-excluido').focus();
  } catch (err) {
    estado.textContent = err.message;
    estado.classList.add('mensaje-error');
  }
}

// ---------- Panel de alimentos (añadir excluido, cambiar nombres o elegir un ingrediente) ----------

let modoAlimentos = 'excluir';
let alElegir = null; // modo 'elegir': qué hacer con el alimento elegido

const normalizar = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function pintarListaAlimentos() {
  const busqueda = normalizar($('alimentos-buscar').value.trim());
  const lista = alimentos.filter(a => (modoAlimentos === 'nombres' || !a.excluido) &&
    (!busqueda || normalizar(a.nombre).includes(busqueda) || normalizar(a.id).includes(busqueda)));
  const filas = lista.slice(0, 60).map(a => {
    const detalle = [a.estado, a.recetas ? `en ${a.recetas} ${a.recetas === 1 ? 'receta' : 'recetas'}` : 'sin recetas'].filter(Boolean).join(' · ');
    if (modoAlimentos === 'elegir') {
      return h('li', null, h('button', { type: 'button', class: 'fila-alimento',
        onclick: () => {
          $('panel-alimentos').close();
          alElegir(a);
        } },
      h('span', { class: 'fila-alimento-texto' }, h('span', { class: 'fila-alimento-nombre' }, a.nombre),
        h('span', { class: 'fila-alimento-detalle' }, [a.estado, a.unidad ? `1 ud = ${numero(a.unidad)} g` : ''].filter(Boolean).join(' · '))),
      icono('add', 'texto-primario')));
    }
    if (modoAlimentos === 'excluir') {
      return h('li', null, h('button', { type: 'button', class: 'fila-alimento',
        onclick: () => {
          $('panel-alimentos').close();
          const ids = alimentos.filter(x => x.excluido).map(x => x.id).concat(a.id);
          guardarExcluidos(ids, `${a.nombre} no saldrá en los próximos planes${a.recetas ? ` (${a.recetas} ${a.recetas === 1 ? 'receta' : 'recetas'} lo usan)` : ''}.`);
        } },
      h('span', { class: 'fila-alimento-texto' }, h('span', { class: 'fila-alimento-nombre' }, a.nombre), h('span', { class: 'fila-alimento-detalle' }, detalle)),
      icono('add', 'texto-primario')));
    }
    const entrada = h('input', { type: 'text', value: a.nombre, maxlength: '60', autocomplete: 'off', 'aria-label': `Nombre de ${a.id}` });
    const guardar = async () => {
      const nombre = entrada.value.trim();
      if (nombre === a.nombre) return;
      $('alimentos-estado').textContent = 'Guardando…';
      try {
        await llamar('renombrarAlimento', { id: a.id, nombre });
        a.nombre = nombre;
        guardarLocal(CACHE_ALIMENTOS, alimentos);
        pintarExcluidos();
        $('alimentos-estado').textContent = `Guardado: ${nombre}. Se verá en los platos al recargar.`;
      } catch (err) {
        entrada.value = a.nombre;
        $('alimentos-estado').textContent = err.message;
      }
    };
    entrada.addEventListener('change', guardar);
    entrada.addEventListener('keydown', e => { if (e.key === 'Enter') entrada.blur(); });
    return h('li', { class: 'fila-alimento fila-nombre' },
      h('span', { class: 'campo-caja' }, entrada),
      h('span', { class: 'fila-alimento-detalle' }, `${a.id}${a.estado ? ' · ' + a.estado : ''}`));
  });
  if (lista.length > 60) filas.push(h('li', { class: 'texto-ayuda' }, `Y ${lista.length - 60} más: escribe para buscar.`));
  if (!lista.length) filas.push(h('li', { class: 'texto-ayuda' }, 'Ningún alimento coincide.'));
  const buscado = $('alimentos-buscar').value.trim();
  if (modoAlimentos === 'elegir' && buscado) {
    filas.push(h('li', null, h('button', { type: 'button', class: 'boton boton-discontinuo', onclick: () => anadirNuevo(buscado) },
      icono('add'), h('span', null, `Añadir «${buscado}» como alimento nuevo`))));
  }
  $('alimentos-lista').replaceChildren(...filas);
}

// Alimento que no está en la tabla: se añade con los valores de su etiqueta y se elige.
function anadirNuevo(nombre) {
  const base = normalizar(nombre).replace(/[^a-z0-9]+/g, '_').replace(/^[^a-z]+|_+$/g, '').slice(0, 36) || 'alimento';
  let id = base;
  for (let n = 2; alimentos.some(a => a.id === id); n++) id = `${base}_${n}`;
  $('panel-alimentos').close();
  const elegir = alElegir;
  // Al cerrar el formulario, el foco va a los gramos del ingrediente recién añadido.
  abrirAlimentoNuevo({ id, nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), grupo: 'proteina', estado: 'crudo' }, 'gramos-' + id, async nuevo => {
    await cargarAlimentos();
    const a = alimentos.find(x => x.id === nuevo);
    if (a) elegir(a);
  });
}

// Panel para elegir un ingrediente al crear una receta (sin los alimentos excluidos). elegir(alimento).
export function elegirAlimento(elegir) {
  alElegir = elegir;
  abrirAlimentos('elegir');
}

async function abrirAlimentos(modo) {
  modoAlimentos = modo;
  $('alimentos-titulo').textContent = { excluir: 'Añadir alimento que no como', nombres: 'Nombres de alimentos', elegir: 'Añadir ingrediente' }[modo];
  $('alimentos-buscar').value = '';
  $('alimentos-estado').textContent = modo === 'nombres' ? 'Cambia un nombre y sal del campo para guardarlo.' : '';
  $('alimentos-lista').replaceChildren();
  $('panel-alimentos').showModal();
  if (!alimentos) {
    $('alimentos-estado').textContent = 'Cargando alimentos…';
    try {
      await cargarAlimentos();
    } catch (err) {
      $('alimentos-estado').textContent = err.message;
      return;
    }
    $('alimentos-estado').textContent = '';
  }
  pintarListaAlimentos();
}

async function cargarAlimentos() {
  alimentos = await llamar('alimentos');
  guardarLocal(CACHE_ALIMENTOS, alimentos);
  pintarExcluidos();
}

// ---------- Cuenta ----------

function pintarCuenta(error) {
  const sesion = leerSesion();
  $('estado-conexion').classList.toggle('estado-error', Boolean(error));
  $('estado-icono').textContent = error ? 'cloud_off' : 'cloud_done';
  $('estado-titulo').textContent = error || 'Sesión iniciada';
  $('estado-detalle').textContent = sesion ? sesion.usuario.email : '';
}

export async function cargarAjustes() {
  config = leerLocal(CACHE_CONFIG);
  alimentos = leerLocal(CACHE_ALIMENTOS);
  if (config) pintarObjetivos();
  pintarExcluidos();
  pintarCuenta();
  $('seccion-nombres').hidden = leerLocal(CACHE_EDITA) !== true;
  try {
    config = await llamar('config');
    guardarLocal(CACHE_CONFIG, config);
    pintarObjetivos();
    await cargarAlimentos();
    const edita = await puedoEditarAlimentos();
    guardarLocal(CACHE_EDITA, edita);
    $('seccion-nombres').hidden = !edita;
  } catch (err) {
    pintarCuenta(err.message);
  }
}

function editarContrasena() {
  abrirFormulario({
    titulo: 'Cambiar contraseña',
    nota: 'Al menos 8 caracteres. La sesión de este móvil sigue abierta.',
    campos: [
      { clave: 'nueva', etiqueta: 'Contraseña nueva', tipo: 'clave', ancho: true },
      { clave: 'repetida', etiqueta: 'Repítela', tipo: 'clave', ancho: true },
    ],
    foco: 'boton-contrasena',
    guardar: async ({ nueva, repetida }) => {
      if (nueva.length < 8) throw new Error('La contraseña tiene que tener al menos 8 caracteres.');
      if (nueva !== repetida) throw new Error('Las dos contraseñas no coinciden.');
      await cambiarContrasena(nueva);
      avisar('Contraseña cambiada.');
    },
  });
}

async function salirDeLaCuenta() {
  if (!confirm('¿Cerrar sesión? Se borrará la copia de tus datos guardada en este móvil. Tu plan y tu progreso siguen en tu cuenta.')) return;
  $('boton-salir').disabled = true;
  await cerrarSesion();
  location.hash = '#hoy';
  location.reload();
}

// Estos botones necesitan la configuración, que se baja al abrir Ajustes.
const conConfig = accion => () => {
  if (!config) {
    avisar('Aún no se han cargado tus datos. Comprueba la conexión a internet.');
    return;
  }
  accion();
};

export function prepararAjustes() {
  $('boton-contrasena').addEventListener('click', editarContrasena);
  $('boton-salir').addEventListener('click', salirDeLaCuenta);
  $('interruptor-libre').addEventListener('click', conConfig(alternarLibre));
  $('fila-meta').addEventListener('click', conConfig(editarMeta));
  $('boton-anadir-excluido').addEventListener('click', conConfig(() => abrirAlimentos('excluir')));
  $('boton-nombres').addEventListener('click', conConfig(() => abrirAlimentos('nombres')));
  $('alimentos-buscar').addEventListener('input', () => { if (alimentos) pintarListaAlimentos(); });
  [['panel-formulario', 'formulario-cerrar'], ['panel-alimentos', 'alimentos-cerrar']].forEach(([panel, cerrar]) => {
    $(cerrar).addEventListener('click', () => $(panel).close());
    $(panel).addEventListener('click', e => { if (e.target === $(panel)) $(panel).close(); });
  });
  const guardada = leerLocal(CACHE_CONFIG);
  if (guardada) $('marca-sub-kcal').textContent = `${numero(kcalDia(guardada))} kcal/día`;
}
