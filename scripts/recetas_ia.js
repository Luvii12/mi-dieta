// Recetas nuevas escritas por Claude Code (con la suscripción, sin API de pago) y validadas por el motor.
// Van a Supabase con la cuenta real de Fran ("cuenta" en .supabase.local.json, que no se sube al repo) o, con
// `--para <email>`, como otra persona: su objetivo, sus excluidos y sus valoraciones, y las propuestas salen
// en su pestaña Recetas (necesita "clave_secreta" en el mismo archivo).
//
// Uso (--para <email> es opcional y va en cualquier sitio):
//   node scripts/recetas_ia.js pedido <Comida> [cantidad] [idea…]   → instrucciones y datos para escribirlas
//   node scripts/recetas_ia.js probar <Comida> <recetas.json>        → valida sin guardar (gramos y macros)
//   node scripts/recetas_ia.js enviar <Comida> <recetas.json>        → las guarda como propuestas para revisar en el móvil
// <recetas.json>: {"recetas": [...]} con el formato del esquema (nombre, preparacion, ingredientes_fijos,
// ingredientes_escalables, alimentos_nuevos).
const fs = require('fs');
const { conectar, salir } = require('./cuenta_supabase.js');

const COMIDAS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];

// Ejecuta la acción con el motor, igual que el móvil. Pedir y probar no cambian nada; al enviar, el motor
// descarta las recetas cuyo nombre ya existe (no se duplican).
let cuenta = null;
let para = null;
async function llamar(accion, extra) {
  if (!cuenta) cuenta = await conectar({ para });
  try {
    return await cuenta.ejecutar(accion, extra);
  } catch (err) {
    salir('Error: ' + err.message);
  }
}

function leerRecetas(archivo) {
  if (!archivo) salir('Falta el archivo con las recetas.');
  const datos = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  return Array.isArray(datos) ? datos : datos.recetas;
}

function comidaValida(comida) {
  const c = COMIDAS.find(x => x.toLowerCase() === String(comida || '').toLowerCase());
  if (!c) salir('Comida no válida: ' + comida + '. Usa ' + COMIDAS.join(', ') + '.');
  return c;
}

function informe(r) {
  (r.validas || []).forEach(v => {
    if (v.estado === 'valida') {
      const m = v.macros;
      console.log(`✔ ${v.nombre}\n    ${m.kcal} kcal · P ${m.P} · C ${m.C} · G ${m.G}  —  ${JSON.stringify(v.gramos)}`);
    } else {
      console.log(`… ${v.nombre}\n    falta alimento: ${v.faltan.map(f => `${f.nombre} (${f.id})`).join(', ')}`);
    }
  });
  (r.descartadas || []).forEach(d => console.log(`✘ ${d.nombre}\n    ${d.motivo}`));
}

// Quita `--para <email>` de los argumentos y lo guarda en `para`.
function leerArgumentos() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--para');
  if (i >= 0) {
    para = args[i + 1];
    if (!para || !para.includes('@')) salir('Después de --para va el email de la persona.');
    args.splice(i, 2);
  }
  return args;
}

async function main() {
  const [orden, comida, ...resto] = leerArgumentos();
  if (orden === 'pedido') {
    const cantidad = Number(resto[0]) || 3;
    const idea = (Number(resto[0]) ? resto.slice(1) : resto).join(' ');
    const p = await llamar('pedidoRecetas', { comida: comidaValida(comida), cantidad, idea });
    const email = cuenta.sesion.usuario.email;
    console.log(`Para: ${p.para ? `${p.para} (${email})` : email}\n`);
    console.log('=== INSTRUCCIONES ===\n' + p.sistema + '\n\n=== PEDIDO ===\n' + p.mensaje);
  } else if (orden === 'probar' || orden === 'enviar') {
    const r = await llamar('importarPropuestas', { comida: comidaValida(comida), recetas: leerRecetas(resto[0]), probar: orden === 'probar' });
    console.log(`Para: ${cuenta.sesion.usuario.email}\n`);
    informe(r);
    if (orden === 'enviar') console.log(r.nuevas.length ? `\nGuardadas como propuestas: ${r.nuevas.join(', ')}. Se revisan en la pestaña Recetas de ${cuenta.sesion.usuario.email}.` : '\nNo se ha guardado ninguna.');
  } else {
    salir('Uso: node scripts/recetas_ia.js pedido|probar|enviar <Comida> … [--para <email>]');
  }
}

main().catch(err => salir(err.message));
