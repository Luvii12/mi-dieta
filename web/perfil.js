// Pantalla del perfil: objetivo, entrenamiento y datos de la persona → sus kcal y macros (motor/Perfil.js).
// Dos usos: el alta (#alta, sale sola mientras la cuenta no tenga objetivos, sin barra de navegación) y
// «Mi objetivo» (#perfil, desde Ajustes) para cambiar de objetivo cuando se quiera.
// Sin diseño propio en design/: usa las tarjetas, filas y selectores de Ajustes y Plan.

import { llamar, leerLocal, guardarLocal } from './api.js';
import { h, icono, numero, avisar, COMIDAS, ICONO_COMIDA } from './comun.js';

export const CLAVE_ALTA = 'dieta.alta'; // true: la cuenta aún no tiene objetivos
const CACHE_CONFIG = 'dieta.config';
const COLOR_COMIDA = { Desayuno: 'texto-primario', Almuerzo: 'texto-secundario', Merienda: 'texto-terciario', Cena: 'texto-primario-contenedor' };

export const METAS = {
  perder: { nombre: 'Perder grasa', nota: 'Comes algo menos de lo que gastas, con mucha proteína para no perder músculo.', icono: 'trending_down' },
  mantener: { nombre: 'Mantener', nota: 'Comes lo que gastas para quedarte en tu peso.', icono: 'trending_flat' },
  ganar: { nombre: 'Ganar músculo', nota: 'Comes un poco más de lo que gastas. Hace falta entrenar fuerza.', icono: 'trending_up' },
};
export const ENTRENOS = { no: 'No entreno', '1_2': '1–2 días', '3_4': '3–4 días', '5_mas': '5 o más días' };
const BOTONES_ENTRENO = { no: 'No', '1_2': '1–2', '3_4': '3–4', '5_mas': '5 o más' };
const TRABAJOS = {
  sentado: { nombre: 'Sentado', nota: 'Oficina, estudios, conducir…' },
  de_pie: { nombre: 'De pie', nota: 'Tienda, hostelería, enseñanza…' },
  fisico: { nombre: 'Físico', nota: 'Obra, almacén, campo…' },
};
const SEXOS = { hombre: 'Hombre', mujer: 'Mujer' };

let datos = {};

// Botones de una sola elección (aria-pressed). Al pulsar uno se guarda en `datos` y se avisa con alCambiar.
function selector(clave, opciones, etiqueta, alCambiar) {
  const grupo = h('div', { class: 'selector', role: 'group', 'aria-label': etiqueta,
    style: `grid-template-columns: repeat(${Object.keys(opciones).length}, 1fr)` });
  Object.entries(opciones).forEach(([valor, texto]) => {
    const boton = h('button', { type: 'button', class: 'selector-opcion', 'aria-pressed': String(datos[clave] === valor),
      onclick: () => {
        datos[clave] = valor;
        grupo.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === boton)));
        alCambiar();
      } }, texto);
    grupo.append(boton);
  });
  return grupo;
}

function opcionesMeta(alCambiar) {
  const lista = h('ul', { class: 'tarjeta lista-objetivos', role: 'group', 'aria-label': 'Objetivo' });
  const pintar = () => lista.replaceChildren(...Object.entries(METAS).map(([valor, m]) => {
    const elegida = datos.meta === valor;
    return h('li', null, h('button', { type: 'button', class: 'objetivo objetivo-boton opcion-meta', 'aria-pressed': String(elegida),
      'data-foco': 'meta-' + valor,
      onclick: () => {
        datos.meta = valor;
        pintar();
        lista.querySelector(`[data-foco="meta-${valor}"]`).focus();
        alCambiar();
      } },
    h('span', { class: 'objetivo-icono texto-primario', 'aria-hidden': 'true' }, icono(m.icono)),
    h('span', { class: 'objetivo-texto' },
      h('span', { class: 'objetivo-nombre' }, m.nombre),
      h('span', { class: 'texto-ayuda' }, m.nota)),
    h('span', { class: 'circulo' + (elegida ? ' lleno' : ''), 'aria-hidden': 'true' }, elegida ? icono('check') : null)));
  }));
  pintar();
  return lista;
}

const campo = (etiqueta, control, unidad) => h('label', { class: 'campo' },
  h('span', { class: 'campo-etiqueta' }, etiqueta),
  h('span', { class: 'campo-caja' }, control, unidad ? h('span', { class: 'campo-unidad' }, unidad) : null));

const seccion = (id, iconoTitulo, titulo, ...contenido) => h('section', { class: 'ajustes-seccion', 'aria-labelledby': id },
  h('div', { class: 'seccion-cabecera' }, h('div', { class: 'seccion-titulo seccion-titulo-sm' }, icono(iconoTitulo, 'texto-primario'), h('h2', { id }, titulo))),
  ...contenido);

const conComa = n => (n === null || n === undefined || n === '' ? '' : String(n).replace('.', ','));

// Último peso conocido: el de Progreso si lo hay; si no, el del perfil.
function pesoConocido(perfil) {
  const progreso = leerLocal('dieta.progreso');
  return progreso && progreso.ultimo ? progreso.ultimo.peso : perfil.peso_kg;
}

// alta: true en el alta. terminar(hash): adónde ir al acabar.
export function pintarPerfil(contenedor, alta, terminar) {
  const config = leerLocal(CACHE_CONFIG) || {};
  const perfil = config.perfil || {};
  datos = { meta: perfil.meta, entreno: perfil.entreno, trabajo: perfil.trabajo || 'sentado', sexo: perfil.sexo };

  const resultado = h('div', { class: 'perfil-resultado' });
  const olvidar = () => resultado.replaceChildren();

  const nombre = h('input', { type: 'text', name: 'nombre', autocomplete: 'given-name', maxlength: 40, value: perfil.nombre || '' });
  const nacimiento = h('input', { type: 'date', name: 'nacimiento', autocomplete: 'bday', value: perfil.nacimiento || '', max: new Date().toISOString().slice(0, 10) });
  const altura = h('input', { type: 'text', inputmode: 'numeric', name: 'altura', autocomplete: 'off', value: perfil.altura_cm || '' });
  const peso = h('input', { type: 'text', inputmode: 'decimal', name: 'peso', autocomplete: 'off', value: conComa(pesoConocido(perfil)) });
  [nombre, nacimiento, altura, peso].forEach(i => i.addEventListener('input', olvidar));

  const notaTrabajo = h('p', { class: 'texto-ayuda' }, TRABAJOS[datos.trabajo].nota);
  const alCambiarTrabajo = () => {
    notaTrabajo.textContent = TRABAJOS[datos.trabajo].nota;
    olvidar();
  };
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const textoCalcular = h('span', null, 'Calcular mis objetivos');
  const calcular = h('button', { type: 'submit', class: 'boton boton-primario' }, icono('local_fire_department'), textoCalcular);

  const leerPerfil = () => ({ nombre: nombre.value, sexo: datos.sexo, nacimiento: nacimiento.value, altura_cm: altura.value,
    peso_kg: peso.value, trabajo: datos.trabajo, entreno: datos.entreno, meta: datos.meta });

  const formulario = h('form', { class: 'form-perfil', novalidate: true,
    onsubmit: async evento => {
      evento.preventDefault();
      estado.textContent = '';
      const p = leerPerfil();
      if (!p.meta) return mostrarError('Elige tu objetivo.');
      if (!p.entreno) return mostrarError('Elige cuántos días entrenas.');
      if (!p.sexo) return mostrarError('Elige hombre o mujer.');
      calcular.disabled = true;
      textoCalcular.textContent = 'Calculando…';
      try {
        const r = await llamar('guardarPerfil', { perfil: p, probar: true });
        pintarResultado(resultado, r, alta, terminar);
        resultado.querySelector('h2').focus();
      } catch (err) {
        mostrarError(err.message);
      } finally {
        calcular.disabled = false;
        textoCalcular.textContent = 'Calcular mis objetivos';
      }
    } },
  seccion('perfil-titulo-meta', 'flag', '¿Cuál es tu objetivo?', opcionesMeta(olvidar)),
  seccion('perfil-titulo-actividad', 'fitness_center', 'Tu actividad',
    h('div', { class: 'tarjeta tarjeta-ajuste' },
      h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta', id: 'etiqueta-entreno' }, 'Días de entrenamiento por semana'),
        selector('entreno', BOTONES_ENTRENO, 'Días de entrenamiento por semana', olvidar)),
      h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Tu trabajo'),
        selector('trabajo', Object.fromEntries(Object.entries(TRABAJOS).map(([k, t]) => [k, t.nombre])), 'Tu trabajo', alCambiarTrabajo),
        notaTrabajo))),
  seccion('perfil-titulo-datos', 'person', 'Tus datos',
    h('div', { class: 'tarjeta tarjeta-ajuste' },
      campo('Nombre', nombre),
      h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Sexo'), selector('sexo', SEXOS, 'Sexo', olvidar)),
      campo('Fecha de nacimiento', nacimiento),
      h('div', { class: 'formulario-campos' }, campo('Altura', altura, 'cm'), campo('Peso de hoy', peso, 'kg')))),
  estado,
  calcular);

  function mostrarError(texto) {
    estado.textContent = texto;
  }

  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' }, h('div', null,
      h('h1', { class: 'titulo-pantalla' }, alta ? 'Tu perfil' : 'Mi objetivo'),
      h('p', { class: 'subtitulo' }, alta
        ? 'Con estos datos la app calcula tus calorías y tus macros. Podrás cambiarlos cuando quieras en Ajustes.'
        : 'Cambia tu objetivo o tus datos y la app recalcula tus calorías y tus macros.'))),
    formulario,
    resultado);
}

// Lo calculado: kcal y macros del día, reparto por comidas, avisos y el botón para guardar.
function pintarResultado(contenedor, r, alta, terminar) {
  const c = r.calculo;
  // Lo que se guarda son las comidas: su suma puede diferir del cálculo en 1–3 kcal por los redondeos.
  const kcal = COMIDAS.reduce((s, x) => s + c.comidas[x].kcal, 0);
  const actuales = COMIDAS.every(x => r.config['objetivo_' + x.toLowerCase()])
    ? COMIDAS.reduce((s, x) => s + Number(r.config['objetivo_' + x.toLowerCase()].kcal), 0) : null;
  const meta = METAS[r.perfil.meta];
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const texto = h('span', null, alta ? 'Empezar' : 'Guardar objetivos');
  const boton = h('button', { type: 'button', class: 'boton boton-primario boton-grande' }, icono(alta ? 'arrow_forward' : 'check'), texto);

  boton.addEventListener('click', async () => {
    boton.disabled = true;
    estado.textContent = '';
    texto.textContent = 'Guardando…';
    try {
      const guardado = await llamar('guardarPerfil', { perfil: r.perfil });
      guardarLocal(CACHE_CONFIG, guardado.config);
      document.getElementById('marca-sub-kcal').textContent = `${numero(kcal)} kcal/día`;
      if (!alta) {
        avisar(`Objetivos guardados: ${numero(kcal)} kcal al día.`);
        terminar('#ajustes');
        return;
      }
      guardarLocal(CLAVE_ALTA, false);
      texto.textContent = 'Preparando tu plan…';
      try {
        await llamar('generarPlan');
      } catch (err) {
        avisar(`No se ha podido generar el plan: ${err.message}`);
      }
      terminar('#plan');
    } catch (err) {
      estado.textContent = err.message;
      boton.disabled = false;
      texto.textContent = alta ? 'Empezar' : 'Guardar objetivos';
    }
  });

  const nota = (iconoNota, clase, textoNota) => h('div', { class: 'nota-balance' }, icono(iconoNota, clase), h('p', null, textoNota));
  contenedor.replaceChildren(h('section', { class: 'ajustes-seccion', 'aria-labelledby': 'perfil-titulo-resultado' },
    h('div', { class: 'seccion-cabecera' },
      h('div', { class: 'seccion-titulo seccion-titulo-sm' }, icono('local_fire_department', 'texto-primario'),
        h('h2', { id: 'perfil-titulo-resultado', tabindex: '-1' }, 'Tus objetivos')),
      h('span', { class: 'insignia insignia-primaria-borde' }, `${numero(kcal)} kcal/día`)),
    h('ul', { class: 'tarjeta lista-objetivos' }, COMIDAS.map(comida => {
      const o = c.comidas[comida];
      return h('li', { class: 'objetivo' },
        h('span', { class: 'objetivo-icono ' + COLOR_COMIDA[comida], 'aria-hidden': 'true' }, icono(ICONO_COMIDA[comida])),
        h('span', { class: 'objetivo-texto' },
          h('span', { class: 'objetivo-nombre' }, comida),
          h('span', { class: 'objetivo-macros' }, `P ${numero(o.P, 1)} · C ${numero(o.C, 1)} · G ${numero(o.G, 1)} g`)),
        h('span', { class: 'objetivo-kcal' }, h('span', { class: 'objetivo-cifra' }, numero(o.kcal)), h('span', { class: 'objetivo-unidad' }, ' kcal')));
    })),
    h('div', { class: 'tarjeta tarjeta-ajuste' },
      h('p', { class: 'texto-ayuda' },
        `Gastas unas ${numero(c.gasto)} kcal al día (${numero(c.tmb)} en reposo). Para ${meta.nombre.toLowerCase()}: ` +
        `${numero(kcal)} kcal, con ${numero(c.dia.P)} g de proteína (${numero(c.proteina_g_kg, 1)} g por kg), ` +
        `${numero(c.dia.C)} g de hidratos y ${numero(c.dia.G)} g de grasa.`),
      c.aviso ? nota('error', 'texto-terciario', c.aviso) : null,
      !alta && actuales ? nota('event_available', 'texto-secundario',
        `Sustituye a tus objetivos actuales (${numero(actuales)} kcal). El plan activo no cambia: se aplica al siguiente plan y al cambiar un plato.`) : null,
      nota('verified', 'texto-secundario', 'Es una estimación con fórmulas generales: la app no sustituye a un dietista-nutricionista. ' +
        'Si tienes alguna enfermedad, estás embarazada o tomas medicación, consulta antes con un profesional.')),
    estado,
    boton));
}
