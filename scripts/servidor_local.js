// Servidor local para probar la PWA sin Google: sirve web/ y responde a /api con el código real de
// Apps Script sobre una hoja en memoria (se pierde al cerrar). Crea un plan activo generado como si hoy
// fuera hace una semana, así «hoy» siempre cae dentro del plan.
// Uso: npm run servidor  (o `node scripts/servidor_local.js borrador` para tener además un borrador).
const http = require('http');
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const { cargarAppsScript } = require('../tests/simulador_gas.js');

const haceUnaSemana = new Date(Date.now() - 7 * 86400000).toISOString();
const prep = cargarAppsScript(haceUnaSemana);
prep.contexto.configurarHoja();
prep.contexto.crearToken();
const p = prep.llamar('generarPlan').datos;
prep.llamar('activarPlan', { plan_id: p.plan_id });
if (process.argv[2] === 'borrador') {
  const p2 = cargarAppsScript(new Date().toISOString());
  p2.libro.hojas.splice(0, p2.libro.hojas.length, ...prep.libro.hojas);
  Object.assign(p2.propiedades, prep.propiedades);
  p2.llamar('generarPlan');
}
const gas = cargarAppsScript(); // fecha real
gas.libro.hojas.splice(0, gas.libro.hojas.length, ...prep.libro.hojas);
Object.assign(gas.propiedades, prep.propiedades);
const PUERTO = Number(process.env.PUERTO || 8099);

const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/api')) {
    let cuerpo = '';
    req.on('data', d => { cuerpo += d; });
    req.on('end', () => {
      const salida = gas.contexto.doPost({ postData: { contents: cuerpo } });
      setTimeout(() => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(salida.texto); }, 150);
    });
    return;
  }
  const archivo = path.join(RAIZ, 'web', decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(archivo, (err, datos) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(archivo)] || 'application/octet-stream' });
    res.end(datos);
  });
}).listen(PUERTO, () => {
  console.log('App: http://localhost:' + PUERTO + '/');
  console.log('En Ajustes → URL: http://localhost:' + PUERTO + '/api  ·  Token: ' + gas.propiedades.APP_TOKEN);
});
