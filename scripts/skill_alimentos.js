// Pone al día la copia de alimentos de la skill «dietista» (fuera del repo) con la tabla de Supabase y vuelve a
// crear dietista.zip (SKILL.md y references/ en la raíz del zip, o claude.ai lo rechaza). Solo lee la base.
//   npm run skill
// Después hay que subir el zip a claude.ai (Ajustes › Capacidades › Skills).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { conectar, salir } = require('./cuenta_supabase.js');

const SKILL = process.env.SKILL_DIETISTA || path.join(os.homedir(), 'Escritorio', 'claude', 'dietista', 'dietista');
const ZIP = path.join(SKILL, '..', 'dietista.zip');

async function main() {
  if (!fs.existsSync(path.join(SKILL, 'SKILL.md'))) salir(`No encuentro la skill en ${SKILL} (cámbialo con SKILL_DIETISTA=…).`);
  const cuenta = await conectar();
  const tablas = await cuenta.sb.leerTablas(cuenta.con, cuenta.sesion);
  const filas = tablas.alimentos.map(a => cuenta.sb.deBase('alimentos', a, cuenta.motor));
  const hoy = new Date().toISOString().slice(0, 10);
  const lineas = filas.map(a => '- ' + [a.id, a.nombre || a.id, a.grupo, a.estado, a.gramos_por_unidad ? a.gramos_por_unidad + ' g/ud' : ''].join(' | '));
  const texto = [
    `# Alimentos de la app (copia del ${hoy})`,
    '',
    'Copia de la tabla común `alimentos` de Supabase, **solo ids, sin macros** (la regenera `npm run skill` en el repo mi-dieta). ' +
      'La de la app manda: puede tener alimentos añadidos después. Formato: id | nombre | grupo | estado | gramos por unidad.',
    '',
    ...lineas,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(SKILL, 'references', 'alimentos.md'), texto);
  fs.rmSync(ZIP, { force: true });
  execFileSync('zip', ['-qr', ZIP, 'SKILL.md', 'references'], { cwd: SKILL });
  console.log(`${filas.length} alimentos copiados en references/alimentos.md y ${ZIP} regenerado.`);
  console.log('Súbelo a claude.ai para que la skill use la versión nueva.');
}

main().catch(err => salir('Error: ' + err.message));
