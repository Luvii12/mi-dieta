// Pantalla de entrada: email y contraseña de la cuenta de Supabase (sin diseño propio en design/: usa los
// componentes de la tarjeta de conexión de Ajustes). También crea cuentas nuevas con el código de invitación
// que reparte Fran; sin código válido la base no crea la cuenta.

import { entrar, registrarse } from './api.js';
import { h, icono } from './comun.js';

const TEXTOS = {
  entrar: { titulo: 'Entrar', subtitulo: 'Con el email y la contraseña de tu cuenta de Mi Dieta.', boton: 'Entrar',
    ocupado: 'Entrando…', icono: 'login', pregunta: '¿Aún no tienes cuenta?', cambio: 'Crear cuenta' },
  registro: { titulo: 'Crear cuenta', subtitulo: 'Con el código de invitación que te han pasado.', boton: 'Crear cuenta',
    ocupado: 'Creando la cuenta…', icono: 'person_add', pregunta: '¿Ya tienes cuenta?', cambio: 'Entrar' },
};

// alEntrar: qué hacer cuando la sesión ya está guardada. modo: 'entrar' o 'registro'.
export function pintarEntrar(contenedor, alEntrar, modo = 'entrar') {
  const registro = modo === 'registro';
  const t = TEXTOS[registro ? 'registro' : 'entrar'];
  const email = h('input', { id: 'entrar-email', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email',
    spellcheck: 'false', autocapitalize: 'none', required: true, placeholder: 'tu@email.com' });
  const clave = h('input', { id: 'entrar-clave', type: 'password', name: 'password', required: true,
    autocomplete: registro ? 'new-password' : 'current-password', 'aria-describedby': registro ? 'entrar-clave-nota' : null });
  const ver = h('button', { type: 'button', class: 'campo-boton', 'aria-label': 'Mostrar contraseña', 'aria-pressed': 'false',
    onclick: () => {
      const mostrar = clave.type === 'password';
      clave.type = mostrar ? 'text' : 'password';
      ver.setAttribute('aria-pressed', String(mostrar));
      ver.querySelector('.icono').textContent = mostrar ? 'visibility_off' : 'visibility';
    } }, icono('visibility'));
  const codigo = registro ? h('input', { id: 'entrar-codigo', type: 'text', name: 'codigo', autocomplete: 'off',
    spellcheck: 'false', autocapitalize: 'characters', required: true }) : null;
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const texto = h('span', null, t.boton);
  const boton = h('button', { type: 'submit', class: 'boton boton-primario' }, icono(t.icono), texto);

  // Lo que falta o no vale, con el campo al que hay que ir; null si está todo.
  const falta = () => {
    if (!email.value.trim()) return ['Escribe tu email.', email];
    if (!clave.value) return ['Escribe tu contraseña.', clave];
    if (registro && clave.value.length < 8) return ['La contraseña tiene que tener al menos 8 caracteres.', clave];
    if (registro && !codigo.value.trim()) return ['Escribe el código de invitación.', codigo];
    return null;
  };

  const formulario = h('form', { class: 'tarjeta conexion form-entrar', novalidate: true,
    onsubmit: async evento => {
      evento.preventDefault();
      const problema = falta();
      if (problema) {
        estado.textContent = problema[0];
        problema[1].focus();
        return;
      }
      boton.disabled = true;
      texto.textContent = t.ocupado;
      estado.textContent = '';
      try {
        if (registro) await registrarse(email.value, clave.value, codigo.value);
        else await entrar(email.value, clave.value);
        await alEntrar();
      } catch (err) {
        estado.textContent = err.message;
        (registro && /código/i.test(err.message) ? codigo : registro && /email/i.test(err.message) ? email : clave).focus();
      } finally {
        boton.disabled = false;
        texto.textContent = t.boton;
      }
    } },
  h('label', { class: 'campo' },
    h('span', { class: 'campo-etiqueta' }, 'Email'),
    h('span', { class: 'campo-caja' }, icono('mail', 'campo-icono'), email)),
  h('label', { class: 'campo' },
    h('span', { class: 'campo-etiqueta' }, 'Contraseña'),
    h('span', { class: 'campo-caja' }, icono('key', 'campo-icono'), clave, ver),
    registro ? h('span', { id: 'entrar-clave-nota', class: 'mensaje' }, 'Al menos 8 caracteres.') : null),
  registro ? h('label', { class: 'campo' },
    h('span', { class: 'campo-etiqueta' }, 'Código de invitación'),
    h('span', { class: 'campo-caja' }, icono('confirmation_number', 'campo-icono'), codigo)) : null,
  estado,
  boton);

  const cambiar = h('p', { class: 'entrar-cambio' }, t.pregunta, ' ',
    h('button', { type: 'button', class: 'boton-texto', onclick: () => {
      pintarEntrar(contenedor, alEntrar, registro ? 'entrar' : 'registro');
      contenedor.querySelector('#entrar-email').focus();
    } }, t.cambio));

  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' }, h('div', null,
      h('h1', { class: 'titulo-pantalla' }, t.titulo),
      h('p', { class: 'subtitulo' }, t.subtitulo))),
    formulario,
    cambiar);
}
