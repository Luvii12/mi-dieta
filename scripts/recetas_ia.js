// Recetas nuevas escritas por Claude Code (con la suscripción, sin API de pago) y validadas por Apps Script.
// La conexión se lee de .conexion.local.json ({"url": ".../exec", "token": "..."}), que no se sube al repo.
//
// Uso:
//   node scripts/recetas_ia.js pedido <Comida> [cantidad] [idea…]   → instrucciones y datos para escribirlas
//   node scripts/recetas_ia.js probar <Comida> <recetas.json>        → valida sin guardar (gramos y macros)
//   node scripts/recetas_ia.js enviar <Comida> <recetas.json>        → las guarda como propuestas para revisar en el móvil
// <recetas.json>: {"recetas": [...]} con el formato del esquema (nombre, preparacion, ingredientes_fijos,
// ingredientes_escalables, alimentos_nuevos).
const fs = require('fs');
const path = require('path');

const ARCHIVO_CONEXION = process.env.CONEXION || path.join(__dirname, '..', '.conexion.local.json');
const COMIDAS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'];

function salir(mensaje) {
  console.error(mensaje);
  process.exit(1);
}

function conexion() {
  if (!fs.existsSync(ARCHIVO_CONEXION)) {
    salir('Falta .conexion.local.json con {"url": "<URL /exec del despliegue>", "token": "<APP_TOKEN>"}.');
  }
  const c = JSON.parse(fs.readFileSync(ARCHIVO_CONEXION, 'utf8'));
  if (!c.url || !c.token) salir('.conexion.local.json necesita "url" y "token".');
  return c;
}

// Igual que la PWA: POST text/plain con el token en el cuerpo. Apps Script responde con una redirección
// que fetch sigue sola. Las cabeceras Sec-Fetch-* las pone el navegador; sin ellas Google no entrega la
// respuesta (la redirección vuelve a /exec y acaba en una página HTML).
async function llamar(accion, extra) {
  const { url, token } = conexion();
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Dest': 'empty' },
    body: JSON.stringify(Object.assign({}, extra, { accion, token })),
  });
  const texto = await respuesta.text();
  let cuerpo;
  try {
    cuerpo = JSON.parse(texto);
  } catch (err) {
    salir('Respuesta inesperada del servidor (¿URL /exec correcta?):\n' + texto.slice(0, 300));
  }
  if (!cuerpo.ok) salir('Error del servidor: ' + cuerpo.error);
  return cuerpo.datos;
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
