// Funciones puras (sin SpreadsheetApp ni PropertiesService).
// Funcionan en Apps Script y en Node, así los tests prueban este mismo código.

const ZONA_HORARIA = 'Europe/Madrid';

// Cabeceras exactas de cada pestaña (ver docs/DATOS.md). El orden importa.
const PESTANAS = {
  config: ['clave', 'valor'],
  alimentos: ['id', 'nombre', 'grupo', 'kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100',
    'gramos_por_unidad', 'estado', 'fuente', 'verificado', 'codigo_barras'],
  recetas: ['id', 'comida', 'nombre', 'preparacion', 'ingredientes_fijos', 'ingredientes_escalables',
    'origen', 'activa'],
  valoraciones: ['receta_id', 'valor', 'fecha'],
  preferencias: ['tipo', 'alimento_id', 'nota'],
  planes: ['plan_id', 'inicio', 'fin', 'estado', 'objetivos', 'creado'],
  plan_comidas: ['plan_id', 'fecha', 'comida', 'receta_id', 'gramos', 'kcal', 'P', 'C', 'G', 'hecha',
    'cambiada_por'],
  pesos: ['fecha', 'peso_kg', 'cintura_cm'],
  ajustes_historial: ['fecha', 'plan_id', 'ritmo_semanal_pct', 'adherencia_pct', 'propuesta_kcal', 'aceptada'],
};

// Columnas que se guardan como texto para que Sheets no convierta '2026-10-16' en fecha.
const COLUMNAS_FECHA = ['fecha', 'inicio', 'fin', 'creado'];

// Compara el token recibido con el guardado. Sin token guardado, se rechaza todo.
function tokenValido_(recibido, guardado) {
  if (!guardado || typeof recibido !== 'string' || recibido.length !== guardado.length) return false;
  let diferencia = 0;
  for (let i = 0; i < guardado.length; i++) diferencia |= recibido.charCodeAt(i) ^ guardado.charCodeAt(i);
  return diferencia === 0;
}

// Procesa una petición: comprueba el token y llama a la acción. Nunca lanza: devuelve {ok, datos|error}.
function manejar_(peticion, tokenGuardado, acciones) {
  if (!tokenValido_(peticion.token, tokenGuardado)) return { ok: false, error: 'Token no válido' };
  const accion = acciones[peticion.accion];
  if (!accion) return { ok: false, error: 'Acción desconocida: ' + peticion.accion };
  try {
    return { ok: true, datos: accion(peticion) };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

// Fecha → 'AAAA-MM-DD' en hora de Madrid.
function fechaIso_(fecha) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(fecha);
}

// Valor de celda → valor JS. Las fechas que Sheets haya convertido vuelven a ISO.
function normalizarCelda_(valor) {
  if (valor instanceof Date) return fechaIso_(valor);
  return valor;
}

// [[cabeceras], [fila], ...] → [{cabecera: valor}, ...]. Ignora filas vacías.
function filasAObjetos_(valores) {
  if (!valores.length) return [];
  const cabeceras = valores[0];
  return valores.slice(1)
    .filter(fila => fila.some(celda => celda !== '' && celda !== null))
    .map(fila => {
      const obj = {};
      cabeceras.forEach((cab, i) => { obj[cab] = normalizarCelda_(fila[i]); });
      return obj;
    });
}

// {cabecera: valor} → fila en el orden de las cabeceras. Los objetos/arrays se guardan como JSON.
function objetoAFila_(obj, cabeceras) {
  return cabeceras.map(cab => {
    const v = obj[cab];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  });
}

// Los valores de `config` se guardan como texto. Si son JSON (objetos, números, true/false) se devuelven
// ya convertidos; si no, como texto tal cual.
function parsearValor_(texto) {
  if (typeof texto !== 'string') return texto;
  try {
    return JSON.parse(texto);
  } catch (err) {
    return texto;
  }
}

// Valor JS → texto para la pestaña `config`. Siempre JSON, también los textos ('"16/10/2026"'):
// así Sheets no los confunde con fechas o números aunque cambie el formato de la celda.
function serializarValor_(valor) {
  return JSON.stringify(valor);
}

// Filas de `config` → {clave: valor}.
function configAObjeto_(filas) {
  const config = {};
  filas.forEach(f => { config[f.clave] = parsearValor_(f.valor); });
  return config;
}

// 'P20261016-0900' → el mismo si está libre; si no, 'P20261016-0900-2', '-3'…
function idUnico_(base, existentes) {
  let id = base;
  for (let n = 2; existentes.indexOf(id) >= 0; n++) id = base + '-' + n;
  return id;
}

// Fila de la pestaña `recetas` → receta con los ingredientes ya como listas.
function filaAReceta_(fila) {
  const leer = (texto, campo) => {
    if (Array.isArray(texto)) return texto;
    try {
      return JSON.parse(texto || '[]');
    } catch (err) {
      throw new Error('Receta ' + fila.id + ': la columna ' + campo + ' no es JSON válido.');
    }
  };
  return Object.assign({}, fila, {
    ingredientes_fijos: leer(fila.ingredientes_fijos, 'ingredientes_fijos'),
    ingredientes_escalables: leer(fila.ingredientes_escalables, 'ingredientes_escalables'),
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    PESTANAS, COLUMNAS_FECHA, tokenValido_, manejar_, fechaIso_, normalizarCelda_, filasAObjetos_,
    objetoAFila_, parsearValor_, serializarValor_, configAObjeto_, filaAReceta_, idUnico_,
  };
}
