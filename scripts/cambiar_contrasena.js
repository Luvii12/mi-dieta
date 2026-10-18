// Cambia la contraseña de la cuenta real ("cuenta" en .supabase.local.json) y la guarda en ese archivo (y en
// "pruebas", si la cuenta también está ahí), para que los scripts sigan entrando. La pide sin enseñarla.
// Hay que ejecutarlo en una terminal propia (no con «!» en Claude Code): necesita teclado.
//
// Uso: npm run cambiar-contrasena
const fs = require('fs');
const readline = require('readline');
const { ARCHIVO, leerArchivo, salir } = require('./cuenta_supabase.js');

// Pregunta sin mostrar lo que se escribe.
function preguntarOculto(texto) {
  return new Promise(resolver => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = s => { if (s.includes(texto)) rl.output.write(texto); };
    rl.question(texto, respuesta => {
      rl.close();
      process.stdout.write('\n');
      resolver(respuesta);
    });
  });
}

async function main() {
  if (!process.stdin.isTTY) salir('Ejecútalo en una terminal: npm run cambiar-contrasena');
  const c = leerArchivo();
  if (!c.cuenta) salir('.supabase.local.json necesita "cuenta": {"email", "password"}.');
  const sb = await import('../web/supabase.js');
  const con = { url: c.url.replace(/\/+$/, ''), clave: c.clave, fetch };
  const sesion = await sb.entrar(con, c.cuenta.email, c.cuenta.password).catch(err => salir(`No se puede entrar con ${c.cuenta.email}: ${err.message}`));

  console.log(`Nueva contraseña para ${c.cuenta.email} (mínimo 10 caracteres).`);
  const nueva = await preguntarOculto('Contraseña: ');
  if (nueva.length < 10) salir('Demasiado corta: no se ha cambiado.');
  if (nueva !== await preguntarOculto('Repítela: ')) salir('No coinciden: no se ha cambiado.');

  const r = await fetch(`${con.url}/auth/v1/user`, {
    method: 'PUT',
    headers: { apikey: con.clave, Authorization: 'Bearer ' + sesion.access_token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: nueva }),
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    salir(`Supabase no la ha aceptado: ${d.msg || d.message || d.error_description || r.status}`);
  }
  c.cuenta.password = nueva;
  (c.pruebas || []).filter(u => u.email === c.cuenta.email).forEach(u => { u.password = nueva; });
  fs.writeFileSync(ARCHIVO, JSON.stringify(c, null, 2) + '\n');
  console.log('Contraseña cambiada y guardada en .supabase.local.json. En el móvil entra con la nueva.');
}

main().catch(e => salir(e.stack || String(e)));
