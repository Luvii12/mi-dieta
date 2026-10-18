// Convierte data/alimentos.csv y data/recetas_semilla.json en apps-script/Semilla.js,
// que Setup.js usa para cargar la hoja la primera vez.
// Uso: node scripts/generar_semilla.js

const fs = require('fs');
const path = require('path');
const { PESTANAS } = require('../web/motor/Util.js');

const NUMERICAS = ['kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100', 'gramos_por_unidad'];

// 'pechuga_fiambre_90' → 'Pechuga fiambre 90'
function nombreDesdeId(id) {
  const texto = id.replace(/_/g, ' ');
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function leerCsv(texto) {
  const lineas = texto.trim().split(/\r?\n/);
  const cabeceras = lineas[0].split(',');
  return lineas.slice(1).map((linea, i) => {
    const celdas = linea.split(',');
    if (celdas.length !== cabeceras.length) {
      throw new Error(`alimentos.csv línea ${i + 2}: ${celdas.length} columnas, se esperaban ${cabeceras.length}`);
    }
    const fila = {};
    cabeceras.forEach((cab, j) => { fila[cab] = celdas[j]; });
    return fila;
  });
}

// Devuelve {objetivos, alimentos, recetas} con las columnas de docs/DATOS.md.
// Lanza un error si una receta usa un alimento que no existe (regla: nada de macros inventados).
function construirSemilla(csvTexto, recetasJson) {
  const alimentos = leerCsv(csvTexto).map(fila => {
    const alimento = {};
    PESTANAS.alimentos.forEach(col => { alimento[col] = fila[col] !== undefined ? fila[col] : ''; });
    if (!alimento.nombre) alimento.nombre = nombreDesdeId(alimento.id);
    NUMERICAS.forEach(col => {
      if (alimento[col] === '') return;
      const n = Number(alimento[col]);
      if (Number.isNaN(n)) throw new Error(`Alimento ${alimento.id}: ${col} no es un número`);
      alimento[col] = n;
    });
    return alimento;
  });

  const ids = new Set(alimentos.map(a => a.id));
  const recetas = recetasJson.recetas.map(r => {
    [...r.ingredientes_fijos, ...r.ingredientes_escalables].forEach(ing => {
      if (!ids.has(ing.alimento)) throw new Error(`Receta ${r.id}: el alimento «${ing.alimento}» no está en alimentos.csv`);
    });
    return {
      id: r.id,
      comida: r.comida,
      nombre: r.nombre,
      preparacion: r.preparacion,
      ingredientes_fijos: r.ingredientes_fijos,
      ingredientes_escalables: r.ingredientes_escalables,
      origen: 'semilla',
      activa: 'si',
    };
  });

  return { objetivos: recetasJson.objetivo_por_comida, alimentos, recetas };
}

function main() {
  const raiz = path.join(__dirname, '..');
  const csv = fs.readFileSync(path.join(raiz, 'data/alimentos.csv'), 'utf8');
  const recetas = JSON.parse(fs.readFileSync(path.join(raiz, 'data/recetas_semilla.json'), 'utf8'));
  const semilla = construirSemilla(csv, recetas);
  const salida =
    '// GENERADO por scripts/generar_semilla.js a partir de data/. No editar a mano.\n\n' +
    'const SEMILLA = ' + JSON.stringify(semilla, null, 1) + ';\n\n' +
    "if (typeof module !== 'undefined') module.exports = { SEMILLA };\n";
  fs.writeFileSync(path.join(raiz, 'apps-script/Semilla.js'), salida);
  console.log(`Semilla.js: ${semilla.alimentos.length} alimentos, ${semilla.recetas.length} recetas`);
}

if (require.main === module) main();

module.exports = { construirSemilla, leerCsv, nombreDesdeId };
