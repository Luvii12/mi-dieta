// Servidor local para probar la PWA: sirve web/ y, en el puerto siguiente, una Supabase falsa en memoria
// (tests/supabase_falso.js; se pierde al cerrar) con la biblioteca de recetas y un usuario de prueba que
// tiene un plan activo generado como si hoy fuera hace una semana, así «hoy» siempre cae dentro del plan,
// y otro sin datos propios para probar el alta.
// La base va en otro origen, como la de verdad (el service worker solo intercepta los archivos de la app).
// Uso: npm run servidor
//   node scripts/servidor_local.js borrador  → además pesajes de 3 semanas, las comidas pasadas marcadas y un
//                                              borrador con su propuesta de ajuste.
//   node scripts/servidor_local.js fin       → el plan activo acaba mañana y no hay borrador: al abrir la app
//                                              se genera el siguiente (generación automática, fase M5).
//   node scripts/servidor_local.js real      → sin base falsa: la PWA habla con el Supabase de verdad
//                                              (web/conexion.js), con las cuentas de verdad.
const http = require('http');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const { cargarAppsScript } = require('../tests/simulador_gas.js');
const { crearSupabaseFalso } = require('../tests/supabase_falso.js');

const MODO = process.argv[2] || '';
const PUERTO = Number(process.env.PUERTO || 8099);
const USUARIO = { id: '00000000-0000-4000-8000-000000000001', email: 'prueba@mi-dieta.test', password: 'prueba' };
// Cuenta sin nada propio: al entrar sale el alta (fase M4).
const NUEVO = { id: '00000000-0000-4000-8000-000000000002', email: 'nuevo@mi-dieta.test', password: 'prueba' };
const CLAVE = 'clave-local';
const ORDEN = ['alimentos', 'recetas', 'config', 'planes', 'plan_comidas', 'pesos', 'valoraciones', 'preferencias', 'ajustes_historial'];

// Las tablas de prueba se preparan con el Apps Script de siempre (sobre una hoja en memoria).
function tablasDePrueba() {
  const haceUnaSemana = new Date(Date.now() - 7 * 86400000).toISOString();
  const prep = cargarAppsScript(haceUnaSemana);
  prep.contexto.configurarHoja();
  prep.contexto.crearToken();
  const p = prep.llamar('generarPlan').datos;
  prep.llamar('activarPlan', { plan_id: p.plan_id });
  if (MODO === 'borrador') {
    const dia = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
    prep.contexto.anadirFilas_('pesos', Array.from({ length: 20 }, (_, i) => ({
      fecha: dia(20 - i), peso_kg: Math.round((81 - i * 0.07 + Math.sin(i) * 0.3) * 10) / 10, cintura_cm: '' })));
    const hoy = dia(0);
    const comidas = prep.contexto.leerTabla_('plan_comidas')
      .map((f, i) => Object.assign(f, { hecha: f.fecha < hoy ? (i % 9 === 0 ? 'no' : 'si') : f.hecha }));
    prep.contexto.reescribirTabla_('plan_comidas', comidas);
    const p2 = cargarAppsScript(new Date().toISOString());
    p2.libro.hojas.splice(0, p2.libro.hojas.length, ...prep.libro.hojas);
    Object.assign(p2.propiedades, prep.propiedades);
    p2.llamar('generarPlan');
  }
  if (MODO === 'fin') {
    const c = prep.contexto;
    const [plan] = c.leerTabla_('planes');
    const mover = fecha => c.sumarDias_(fecha, c.diasEntre_(plan.fin, c.sumarDias_(c.fechaIso_(new Date()), 1)));
    c.reescribirTabla_('planes', [Object.assign(plan, { inicio: mover(plan.inicio), fin: mover(plan.fin) })]);
    c.reescribirTabla_('plan_comidas', c.leerTabla_('plan_comidas').map(f => Object.assign(f, { fecha: mover(f.fecha) })));
  }
  return Object.fromEntries(ORDEN.map(n => [n, prep.contexto.leerTabla_(n)]));
}

async function crearBase() {
  const { aBase } = await import('../web/supabase.js');
  const falso = crearSupabaseFalso({ clave: CLAVE, usuarios: [USUARIO, NUEVO] });
  const tablas = tablasDePrueba();
  ORDEN.forEach(n => falso.cargar(n, tablas[n].map(f => aBase(n, f, USUARIO.id)), USUARIO.id));
  return falso;
}

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer',
};

// La Supabase falsa, en su propio puerto (otro origen), con CORS como la de verdad.
function servirBase(falso, puerto) {
  http.createServer((req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      const [estado, datos] = falso.responder(req.method, req.url, req.headers, cuerpo);
      setTimeout(() => {
        res.writeHead(estado, Object.assign({}, CORS, datos === null ? {} : { 'Content-Type': 'application/json' }));
        res.end(datos === null ? undefined : JSON.stringify(datos));
      }, 80);
    });
  }).listen(puerto);
}

async function main() {
  const falso = MODO === 'real' ? null : await crearBase();
  if (falso) servirBase(falso, PUERTO + 1);
  http.createServer((req, res) => {
    const ruta = decodeURIComponent(req.url.split('?')[0]);
    if (falso && ruta === '/conexion.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(`export const SUPABASE = { url: 'http://' + location.hostname + ':${PUERTO + 1}', clave: ${JSON.stringify(CLAVE)} };\n`);
      return;
    }
    const archivo = path.join(RAIZ, 'web', ruta.replace(/\/$/, '/index.html'));
    if (!archivo.startsWith(path.join(RAIZ, 'web'))) { res.writeHead(404); res.end(); return; }
    fs.readFile(archivo, (err, datos) => {
      if (err) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
      res.end(datos);
    });
  }).listen(PUERTO, () => {
    console.log('App: http://localhost:' + PUERTO + '/');
    if (falso) console.log(`Base falsa en memoria. Entra con ${USUARIO.email} / ${USUARIO.password} (o, para el alta, ${NUEVO.email} / ${NUEVO.password})`);
    else console.log('Con el Supabase de verdad (web/conexion.js): entra con tu cuenta.');
  });
}

main().catch(err => { console.error(err); process.exit(1); });
