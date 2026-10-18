// Funciones para ejecutar a mano desde el editor de Apps Script (menú «Ejecutar»).
// No son accesibles desde la PWA.

// TOLERANCIAS_INICIALES está en web/motor/Perfil.js (también las usa el alta de la PWA).

// 1) Crea las pestañas que falten con sus cabeceras y carga los datos iniciales si están vacías.
//    Se puede ejecutar varias veces: nunca borra ni duplica datos.
function configurarHoja() {
  const libro = libro_();
  Object.keys(PESTANAS).forEach(nombre => {
    let hoja = libro.getSheetByName(nombre);
    if (!hoja) hoja = libro.insertSheet(nombre);
    const cabeceras = PESTANAS[nombre];
    hoja.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras]).setFontWeight('bold');
    hoja.setFrozenRows(1);
    // Fechas y config como texto, para que Sheets no cambie '2026-10-16' ni los JSON.
    cabeceras.forEach((cab, i) => {
      if (COLUMNAS_FECHA.indexOf(cab) >= 0 || nombre === 'config') {
        hoja.getRange(1, i + 1, hoja.getMaxRows(), 1).setNumberFormat('@');
      }
    });
  });
  borrarHojaInicial_(libro);

  cargarSiVacia_('alimentos', SEMILLA.alimentos);
  cargarSiVacia_('recetas', SEMILLA.recetas);
  if (hoja_('config').getLastRow() <= 1) {
    ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'].forEach(comida => {
      guardarConfig_('objetivo_' + comida.toLowerCase(), SEMILLA.objetivos[comida]);
    });
    guardarConfig_('tolerancias', TOLERANCIAS_INICIALES);
    guardarConfig_('max_rep_desayuno', 4);
    guardarConfig_('max_rep_merienda', 4);
    guardarConfig_('dias_flexibles', 0);
    guardarConfig_('comida_libre_semanal', true);
    guardarConfig_('kcal_minimas', 1400);
  }
  Logger.log('Hoja lista: %s alimentos, %s recetas.',
    hoja_('alimentos').getLastRow() - 1, hoja_('recetas').getLastRow() - 1);
}

// 2) Crea el token de acceso si no existe y lo muestra en el registro de ejecución.
//    Cópialo en la pantalla Ajustes de la app.
function crearToken() {
  const propiedades = PropertiesService.getScriptProperties();
  let token = propiedades.getProperty('APP_TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    propiedades.setProperty('APP_TOKEN', token);
    Logger.log('Token nuevo creado.');
  }
  Logger.log('APP_TOKEN: %s', token);
}

// 3) Activador diario (hacia las 7:00): 2 días antes de que acabe el plan activo genera el borrador del
//    siguiente. Ejecútalo una vez y acepta el permiso que pide Google. Repetirlo no duplica el activador.
function instalarActivador() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'revisarFinDePlan')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('revisarFinDePlan').timeBased().everyDays(1).atHour(7).inTimezone(ZONA_HORARIA).create();
  Logger.log('Activador instalado: revisarFinDePlan cada día hacia las 7:00.');
}

// Si crees que el token se ha filtrado: crea uno nuevo (el anterior deja de funcionar).
function cambiarToken() {
  PropertiesService.getScriptProperties().deleteProperty('APP_TOKEN');
  crearToken();
}

function cargarSiVacia_(nombre, objetos) {
  if (hoja_(nombre).getLastRow() <= 1) anadirFilas_(nombre, objetos);
}

// Una hoja nueva trae «Hoja 1» vacía: se elimina si no la usamos.
function borrarHojaInicial_(libro) {
  libro.getSheets().forEach(hoja => {
    if (!PESTANAS[hoja.getName()] && hoja.getLastRow() === 0 && libro.getSheets().length > 1) {
      libro.deleteSheet(hoja);
    }
  });
}
