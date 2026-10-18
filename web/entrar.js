// Pantalla de entrada: email y contraseña de la cuenta de Supabase (sin diseño propio en design/: usa los
// componentes de la tarjeta de conexión de Ajustes). El registro está cerrado: las cuentas las crea Fran.

import { entrar } from './api.js';
import { h, icono } from './comun.js';

// alEntrar: qué hacer cuando la sesión ya está guardada.
export function pintarEntrar(contenedor, alEntrar) {
  const email = h('input', { id: 'entrar-email', type: 'email', name: 'email', autocomplete: 'username', inputmode: 'email',
    spellcheck: 'false', autocapitalize: 'none', required: true, placeholder: 'tu@email.com' });
  const clave = h('input', { id: 'entrar-clave', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const ver = h('button', { type: 'button', class: 'campo-boton', 'aria-label': 'Mostrar contraseña', 'aria-pressed': 'false',
    onclick: () => {
      const mostrar = clave.type === 'password';
      clave.type = mostrar ? 'text' : 'password';
      ver.setAttribute('aria-pressed', String(mostrar));
      ver.querySelector('.icono').textContent = mostrar ? 'visibility_off' : 'visibility';
    } }, icono('visibility'));
  const estado = h('p', { class: 'mensaje mensaje-error', role: 'status' });
  const texto = h('span', null, 'Entrar');
  const boton = h('button', { type: 'submit', class: 'boton boton-primario' }, icono('login'), texto);

  const formulario = h('form', { class: 'tarjeta conexion form-entrar', novalidate: true,
    onsubmit: async evento => {
      evento.preventDefault();
      if (!email.value.trim() || !clave.value) {
        estado.textContent = 'Escribe tu email y tu contraseña.';
        (email.value.trim() ? clave : email).focus();
        return;
      }
      boton.disabled = true;
      texto.textContent = 'Entrando…';
      estado.textContent = '';
      try {
        await entrar(email.value, clave.value);
        await alEntrar();
      } catch (err) {
        estado.textContent = err.message;
        clave.focus();
      } finally {
        boton.disabled = false;
        texto.textContent = 'Entrar';
      }
    } },
  h('label', { class: 'campo' },
    h('span', { class: 'campo-etiqueta' }, 'Email'),
    h('span', { class: 'campo-caja' }, icono('mail', 'campo-icono'), email)),
  h('label', { class: 'campo' },
    h('span', { class: 'campo-etiqueta' }, 'Contraseña'),
    h('span', { class: 'campo-caja' }, icono('key', 'campo-icono'), clave, ver)),
  estado,
  boton);

  contenedor.replaceChildren(
    h('div', { class: 'cabecera-vista' }, h('div', null,
      h('h1', { class: 'titulo-pantalla' }, 'Entrar'),
      h('p', { class: 'subtitulo' }, 'Con el email y la contraseña de tu cuenta de Mi Dieta.'))),
    formulario);
}
