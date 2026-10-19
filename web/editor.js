// Pantalla para crear recetas: «Crear receta» (#nueva), «Mi versión» de una receta de la biblioteca
// (#nueva/<id>, sale de ella para cambiar lo que se quiera) y «Editar receta» (#editar/<id>, solo las propias).
// Se ponen los gramos de una ración como se haría; el motor (MisRecetas.js) decide qué se ajusta, la calcula
// para el objetivo de quien la crea y la guarda en la biblioteca común.
// Sin diseño propio en design/: usa los campos, selectores y tarjetas del perfil y de «Receta».

import { llamar, leerLocal } from './api.js';
import { h, icono, numero, avisar, COMIDAS } from './comun.js';
import { leerRecetas, guardarRecetas, guardarPlan, olvidarHoy, actualizarPropias } from './datos.js';
import { vacio } from './hoy.js';
import { elegirAlimento } from './ajustes.js';
import { cajaMacro, ingredientePesado, ingredienteFijo } from './receta.js';

const OPCIONALES = ['Desayuno', 'Merienda'];

let datos = null; // lo que se está escribiendo: {ruta, id, version_de, comida, nombre, preparacion, ingredientes}

const ruta = () => location.hash.slice(1).split('/').map(decodeURIComponent); // ['nueva'] · ['nueva', id] · ['editar', id]

// Comidas que hace la persona (las que tienen objetivo en su configuración).
function comidasPropias() {
  const config = leerLocal('dieta.config') || {};
  return COMIDAS.filter(c => !OPCIONALES.includes(c) || config['objetivo_' + c.toLowerCase()]);
}

// Datos de partida: vacía, o los de la receta (con los gramos que le salen a quien la abre).
function partida(recetas) {
  const [modo, id] = ruta();
  if (!id) return { ruta: location.hash, comida: null, nombre: '', preparacion: '', ingredientes: [] };
  const r = recetas.find(x => x.id === id);
  if (!r || !r.ajuste) return null;
  return {
    ruta: location.hash,
    id: modo === 'editar' ? r.id : null,
    version_de: modo === 'nueva' ? r.id : null,
    comida: r.comida,
    nombre: modo === 'editar' ? r.nombre : `${r.nombre} (mi versión)`,
    preparacion: r.preparacion || '',
    // Como en «Receta»: primero los que se pesan para los macros y después los fijos.
    ingredientes: r.ajuste.ingredientes.filter(i => i.escalable).concat(r.ajuste.ingredientes.filter(i => !i.escalable))
      .map(i => ({ alimento: i.alimento, nombre: i.nombre, estado: i.estado, gramos: i.gramos })),
  };
}

const seccion = (id, iconoTitulo, titulo, ...contenido) => h('section', { class: 'ajustes-seccion', 'aria-labelledby': id },
  h('div', { class: 'seccion-cabecera' }, h('div', { class: 'seccion-titulo seccion-titulo-sm' }, icono(iconoTitulo, 'texto-primario'), h('h2', { id }, titulo))),
  ...contenido);

function pintar(contenedor) {
  const [modo] = ruta();
  const resultado = h('div', { class: 'perfil-resultado' });
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const olvidar = () => {
    resultado.replaceChildren();
    estado.textContent = '';
  };

  const nombre = h('input', { type: 'text', name: 'nombre', autocomplete: 'off', maxlength: 80, value: datos.nombre,
    oninput: () => { datos.nombre = nombre.value; olvidar(); } });
  const preparacion = h('textarea', { name: 'preparacion', rows: 5, maxlength: 2000,
    oninput: () => { datos.preparacion = preparacion.value; olvidar(); } });
  preparacion.value = datos.preparacion;

  // Comida: se elige al crearla; al editar no cambia.
  const comidas = modo === 'editar' ? [datos.comida] : comidasPropias();
  const selector = h('div', { class: 'selector', role: 'group', 'aria-label': 'Comida', style: `grid-template-columns: repeat(${comidas.length}, 1fr)` },
    comidas.map(c => h('button', { type: 'button', class: 'selector-opcion', 'aria-pressed': String(datos.comida === c), disabled: modo === 'editar',
      onclick: evento => {
        datos.comida = c;
        selector.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === evento.currentTarget)));
        olvidar();
      } }, c)));

  const lista = h('ul', { class: 'lista-editor' });
  const pintarIngredientes = () => {
    lista.replaceChildren(...datos.ingredientes.map((ing, i) => {
      const gramos = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', value: ing.gramos ? String(ing.gramos).replace('.', ',') : '',
        'aria-label': `Gramos de ${ing.nombre}`, 'data-foco': 'gramos-' + ing.alimento,
        oninput: () => { ing.gramos = gramos.value; olvidar(); } });
      return h('li', { class: 'ingrediente-editor' },
        h('span', { class: 'fila-alimento-texto' },
          h('span', { class: 'fila-alimento-nombre' }, ing.nombre),
          h('span', { class: 'fila-alimento-detalle' }, ing.estado === 'cocinado' ? 'cocinado' : 'en crudo')),
        h('span', { class: 'campo-caja campo-gramos' }, gramos, h('span', { class: 'campo-unidad' }, ing.alimento.endsWith('_ml') ? 'ml' : 'g')),
        h('button', { type: 'button', class: 'boton-icono', 'aria-label': `Quitar ${ing.nombre}`,
          onclick: () => {
            datos.ingredientes.splice(i, 1);
            pintarIngredientes();
            olvidar();
            anadir.focus();
          } }, icono('close')));
    }));
    if (!datos.ingredientes.length) lista.append(h('li', { class: 'texto-ayuda' }, 'Todavía no hay ingredientes.'));
  };
  const anadir = h('button', { type: 'button', class: 'boton boton-discontinuo', 'data-foco': 'anadir-ingrediente',
    onclick: () => elegirAlimento(a => {
      if (datos.ingredientes.some(i => i.alimento === a.id)) {
        avisar(`${a.nombre} ya está en la receta.`);
        return;
      }
      datos.ingredientes.push({ alimento: a.id, nombre: a.nombre, estado: a.estado, gramos: '' });
      pintarIngredientes();
      olvidar();
      lista.querySelector(`[data-foco="gramos-${a.id}"]`).focus();
    }) }, icono('add'), 'Añadir ingrediente');
  pintarIngredientes();

  const textoCalcular = h('span', null, 'Calcular para mi objetivo');
  const calcular = h('button', { type: 'submit', class: 'boton boton-primario' }, icono('local_fire_department'), textoCalcular);
  const formulario = h('form', { class: 'form-perfil', novalidate: true,
    onsubmit: async evento => {
      evento.preventDefault();
      olvidar();
      calcular.disabled = true;
      textoCalcular.textContent = 'Calculando…';
      try {
        const r = await llamar('guardarReceta', { receta: peticion(), version_de: datos.version_de, probar: true });
        pintarResultado(resultado, r);
        resultado.querySelector('h2').focus();
      } catch (err) {
        estado.textContent = err.message;
      } finally {
        calcular.disabled = false;
        textoCalcular.textContent = 'Calcular para mi objetivo';
      }
    } },
  seccion('editor-titulo-receta', 'restaurant_menu', 'La receta',
    h('div', { class: 'tarjeta tarjeta-ajuste' },
      h('label', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Nombre'), h('span', { class: 'campo-caja' }, nombre)),
      h('div', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Comida'), selector,
        modo === 'editar' ? h('p', { class: 'texto-ayuda' }, 'La comida no se cambia al editar: para otra comida, crea una receta nueva.') : null))),
  seccion('editor-titulo-ingredientes', 'kitchen', 'Ingredientes',
    h('p', { class: 'texto-ayuda' }, 'Pon los gramos de una ración como la harías, pesados como dice cada alimento. La app ajusta la proteína, los hidratos y la grasa a tu objetivo; las verduras y los condimentos se quedan como los pongas.'),
    h('div', { class: 'tarjeta tarjeta-ajuste' }, lista, anadir)),
  seccion('editor-titulo-preparacion', 'outdoor_grill', 'Preparación',
    h('label', { class: 'campo' }, h('span', { class: 'campo-etiqueta' }, 'Un paso por línea'), preparacion)),
  estado,
  calcular);

  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' }, h('div', null,
      h('h1', { class: 'titulo-pantalla' }, modo === 'editar' ? 'Editar receta' : datos.version_de ? 'Mi versión' : 'Crear receta'),
      h('p', { class: 'subtitulo' }, modo === 'editar'
        ? 'Los cambios llegan a todos los que la tengan en sus planes nuevos.'
        : datos.version_de ? 'Cambia lo que quieras. La original dejará de salirte en los planes.'
          : 'Se añade a la biblioteca de recetas: os puede salir a todos en los planes.'))),
    formulario,
    resultado);
}

// Lo que se manda al motor.
function peticion() {
  return { id: datos.id || undefined, comida: datos.comida, nombre: datos.nombre, preparacion: datos.preparacion,
    ingredientes: datos.ingredientes.map(i => ({ alimento: i.alimento, gramos: String(i.gramos).replace(',', '.') })) };
}

// Gramos y macros para el objetivo de quien la crea, aviso si no cuadra y el botón para guardarla.
function pintarResultado(contenedor, r) {
  const a = r.ajuste;
  const m = a.macros;
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const texto = h('span', null, 'Guardar receta');
  const boton = h('button', { type: 'button', class: 'boton boton-primario boton-grande' }, icono('check'), texto);
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    texto.textContent = 'Guardando…';
    try {
      const guardada = await llamar('guardarReceta', { receta: peticion(), version_de: datos.version_de });
      guardarRecetas(await llamar('recetas'));
      await actualizarPropias();
      if (datos.id) {
        // Sus comidas del plan con esta receta se han recalculado.
        guardarPlan(null);
        olvidarHoy();
      }
      avisar(datos.id ? 'Receta guardada.' : datos.version_de ? 'Tu versión está en Recetas. La original ya no te saldrá en los planes.'
        : 'Receta añadida. Entrará en los próximos planes.');
      datos = null;
      location.hash = '#receta/' + encodeURIComponent(guardada.id);
    } catch (err) {
      estado.textContent = err.message;
      boton.disabled = false;
      texto.textContent = 'Guardar receta';
    }
  });

  const pesados = a.ingredientes.filter(i => i.escalable);
  const fijos = a.ingredientes.filter(i => !i.escalable);
  contenedor.replaceChildren(h('section', { class: 'ajustes-seccion', 'aria-labelledby': 'editor-titulo-resultado' },
    h('div', { class: 'seccion-cabecera' },
      h('div', { class: 'seccion-titulo seccion-titulo-sm' }, icono('local_fire_department', 'texto-primario'),
        h('h2', { id: 'editor-titulo-resultado', tabindex: '-1' }, 'Para tu objetivo')),
      h('span', { class: r.aviso ? 'insignia insignia-borrador' : 'insignia insignia-ok-fuerte' }, r.aviso ? 'Fuera de margen' : 'Cuadra')),
    h('div', { class: 'tarjeta tarjeta-ajuste' },
      h('div', { class: 'macro-cajas macro-cajas-sin-linea' },
        cajaMacro('kcal', 'Calorías', numero(m.kcal), 'kcal'),
        cajaMacro('proteina', 'Proteína', numero(m.P), 'g'),
        cajaMacro('carbo', 'Carbos', numero(m.C), 'g'),
        cajaMacro('grasa', 'Grasas', numero(m.G), 'g')),
      r.aviso ? h('div', { class: 'nota-balance' }, icono('error', 'texto-terciario'),
        h('p', null, `${r.aviso} Puedes guardarla igualmente: el resto del día la compensa, aunque algún día puede quedar «a revisar».`)) : null),
    pesados.length ? h('div', { class: 'tarjeta-pesados' },
      h('div', { class: 'grupo-cabecera' },
        h('span', { class: 'grupo-titulo texto-primario' }, icono('tune'), 'Pesados para tus macros')),
      h('ul', { class: 'lista-pesados' }, pesados.map(ingredientePesado))) : null,
    fijos.length ? h('div', { class: 'tarjeta tarjeta-fijos' },
      h('div', { class: 'grupo-cabecera grupo-cabecera-linea' },
        h('span', { class: 'grupo-titulo' }, icono('soup_kitchen', 'texto-terciario'), 'Para el sabor y la base'),
        h('span', { class: 'grupo-nota' }, 'Cantidad fija')),
      h('ul', { class: 'lista-fijos' }, fijos.map(ingredienteFijo))) : null,
    estado,
    boton));
}

export async function cargarEditor(contenedor) {
  if (datos && datos.ruta === location.hash) return pintar(contenedor);
  const [, id] = ruta();
  let recetas = leerRecetas();
  if (id && !(recetas || []).some(r => r.id === id)) {
    contenedor.replaceChildren(h('p', { class: 'cargando' }, 'Cargando receta…'));
    try {
      recetas = await llamar('recetas');
      guardarRecetas(recetas);
    } catch (err) {
      contenedor.replaceChildren(vacio(err.message, 'Ir a Recetas', '#recetas'));
      return;
    }
  }
  datos = partida(recetas || []);
  if (!datos) {
    contenedor.replaceChildren(vacio('Esta receta ya no está disponible.', 'Ir a Recetas', '#recetas'));
    return;
  }
  pintar(contenedor);
}
