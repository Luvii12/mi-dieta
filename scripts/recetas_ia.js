// Recetas nuevas escritas por Claude Code (con la suscripción, sin API de pago) y validadas por el motor.
// Van a Supabase con la cuenta real de Fran ("cuenta" en .supabase.local.json, que no se sube al repo).
//
// Uso:
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
async function llamar(accion, extra) {
  if (!cuenta) cuenta = await conectar();
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

async function main() {
  const [orden, comida, ...resto] = process.argv.slice(2);
  if (orden === 'pedido') {
    const cantidad = Number(resto[0]) || 3;
    const idea = (Number(resto[0]) ? resto.slice(1) : resto).join(' ');
    const p = await llamar('pedidoRecetas', { comida: comidaValida(comida), cantidad, idea });
    console.log('=== INSTRUCCIONES ===\n' + p.sistema + '\n\n=== PEDIDO ===\n' + p.mensaje);
  } else if (orden === 'probar' || orden === 'enviar') {
    const r = await llamar('importarPropuestas', { comida: comidaValida(comida), recetas: leerRecetas(resto[0]), probar: orden === 'probar' });
    informe(r);
    if (orden === 'enviar') console.log(r.nuevas.length ? `\nGuardadas como propuestas: ${r.nuevas.join(', ')}. Revísalas en Recetas.` : '\nNo se ha guardado ninguna.');
  } else {
    salir('Uso: node scripts/recetas_ia.js pedido|probar|enviar <Comida> …');
  }
}

main().catch(err => salir(err.message));
