// Supabase falsa en memoria, para los tests y para `npm run servidor`. Imita lo que usa la app:
//   · Auth: entrar con email y contraseña, renovar la sesión (cada renovación se puede usar una vez), cambiar
//     la contraseña y salir. Con la clave secreta, lo que usan los scripts (admin): listar, crear y cambiar la
//     contraseña de usuarios, y generar un enlace mágico, que se canjea por una sesión (verify).
//   · REST: leer (order, offset, limit), añadir, añadir o actualizar (merge-duplicates), cambiar y borrar con
//     los filtros que genera web/supabase.js (col=eq., col=in.(…), or=(and(…),…)).
// Con las reglas de supabase/esquema.sql: columnas y valores permitidos, claves, valores por defecto,
// reglas por fila (RLS), borrado en cascada de las comidas de un plan y jsonb (que reordena las claves).

const COMUNES = ['alimentos', 'recetas'];
const ESQUEMA = {
  alimentos: { pk: ['id'], columnas: ['id', 'nombre', 'grupo', 'kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100',
    'gramos_por_unidad', 'estado', 'fuente', 'verificado', 'codigo_barras', 'creado_por', 'creado'],
  noNulas: ['grupo', 'kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100', 'estado', 'verificado'] },
  recetas: { pk: ['id'], columnas: ['id', 'comida', 'nombre', 'preparacion', 'ingredientes_fijos', 'ingredientes_escalables',
    'origen', 'activa', 'creado_por', 'creado'], noNulas: ['comida', 'nombre', 'origen', 'activa'],
  jsonb: ['ingredientes_fijos', 'ingredientes_escalables'] },
  config: { pk: ['user_id', 'clave'], columnas: ['user_id', 'clave', 'valor'], jsonb: ['valor'] },
  valoraciones: { identidad: true, columnas: ['id', 'user_id', 'receta_id', 'valor', 'fecha'], noNulas: ['receta_id', 'valor', 'fecha'] },
  preferencias: { identidad: true, unica: ['user_id', 'tipo', 'alimento_id'], columnas: ['id', 'user_id', 'tipo', 'alimento_id', 'nota'],
    noNulas: ['tipo', 'alimento_id'] },
  planes: { pk: ['user_id', 'plan_id'], columnas: ['user_id', 'plan_id', 'inicio', 'fin', 'estado', 'objetivos', 'creado'],
    noNulas: ['inicio', 'fin', 'estado'], jsonb: ['objetivos'] },
  plan_comidas: { pk: ['user_id', 'plan_id', 'fecha', 'comida'], columnas: ['user_id', 'plan_id', 'fecha', 'comida', 'receta_id',
    'gramos', 'kcal', 'P', 'C', 'G', 'hecha', 'cambiada_por', 'fijados'], noNulas: ['receta_id', 'gramos', 'hecha'], jsonb: ['gramos', 'fijados'] },
  pesos: { pk: ['user_id', 'fecha'], columnas: ['user_id', 'fecha', 'peso_kg', 'cintura_cm'], noNulas: ['peso_kg'] },
  ajustes_historial: { identidad: true, columnas: ['id', 'user_id', 'fecha', 'plan_id', 'ritmo_semanal_pct', 'adherencia_pct',
    'propuesta_kcal', 'aceptada'], noNulas: ['fecha'] },
};
const NUMERICAS = new Set(['kcal_100', 'proteina_100', 'carbohidratos_100', 'grasa_100', 'gramos_por_unidad', 'kcal', 'P', 'C', 'G',
  'peso_kg', 'cintura_cm', 'ritmo_semanal_pct', 'adherencia_pct', 'propuesta_kcal']);
const FECHAS = new Set(['fecha', 'inicio', 'fin']);
const PERMITIDOS = {
  grupo: ['proteina', 'carbohidrato', 'grasa', 'lacteo', 'fruta', 'verdura_condimento'],
  estado: ['crudo', 'cocinado', 'borrador', 'siguiente', 'activo', 'archivado'],
  verificado: ['si', 'no'],
  comida: ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'],
  origen: ['semilla', 'ia', 'manual'],
  activa: ['si', 'no', 'propuesta', 'descartada'],
  hecha: ['si', 'no', 'libre', 'saltada'],
  tipo: ['excluido', 'alergia', 'favorito'],
  aceptada: ['si', 'no'],
  valor: ['me_encanta', 'normal', 'no_repetir'],
};

class ErrorBase extends Error {
  constructor(estado, codigo, mensaje) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

// Como jsonb: las claves de los objetos se guardan ordenadas (primero las cortas).
function comoJsonb(v) {
  if (Array.isArray(v)) return v.map(comoJsonb);
  if (v && typeof v === 'object') {
    const claves = Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(claves.map(k => [k, comoJsonb(v[k])]));
  }
  return v;
}

// "a","b\"c",d → ['a', 'b"c', 'd'] (separando solo las comas de primer nivel).
function partir(texto) {
  const partes = [];
  let actual = '';
  let comillas = false;
  let nivel = 0;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas && ch === '\\') { actual += ch + texto[++i]; continue; }
    if (ch === '"') comillas = !comillas;
    else if (!comillas && ch === '(') nivel++;
    else if (!comillas && ch === ')') nivel--;
    if (!comillas && nivel === 0 && ch === ',') { partes.push(actual); actual = ''; continue; }
    actual += ch;
  }
  if (actual !== '') partes.push(actual);
  return partes;
}
const sinComillas = v => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1).replace(/\\(.)/g, '$1') : v);
const sinParentesis = (v, prefijo = '') => {
  if (!v.startsWith(prefijo + '(') || !v.endsWith(')')) throw new ErrorBase(400, 'PGRST100', 'Filtro no válido: ' + v);
  return v.slice(prefijo.length + 1, -1);
};

// Parámetros de la URL → función que dice si una fila cumple los filtros.
function filtroDe(params) {
  const condiciones = [];
  params.forEach((valor, col) => {
    if (['select', 'order', 'offset', 'limit', 'on_conflict', 'columns'].includes(col)) return;
    if (col === 'or') {
      const alternativas = partir(sinParentesis(valor)).map(y => partir(sinParentesis(y, 'and')).map(c => {
        const m = c.match(/^(\w+)\.eq\.(.*)$/);
        if (!m) throw new ErrorBase(400, 'PGRST100', 'Filtro no válido: ' + c);
        return [m[1], sinComillas(m[2])];
      }));
      condiciones.push(f => alternativas.some(y => y.every(([c, v]) => String(f[c]) === v)));
    } else if (valor.startsWith('eq.')) {
      const v = sinComillas(valor.slice(3));
      condiciones.push(f => String(f[col]) === v);
    } else if (valor.startsWith('in.')) {
      const lista = partir(sinParentesis(valor.slice(3))).map(sinComillas);
      condiciones.push(f => lista.includes(String(f[col])));
    } else {
      throw new ErrorBase(400, 'PGRST100', 'Filtro no soportado: ' + col + '=' + valor);
    }
  });
  return f => condiciones.every(c => c(f));
}

function crearSupabaseFalso({ clave = 'clave-falsa', claveSecreta = 'clave-secreta-falsa', usuarios = [], administradores = [], ahora = () => new Date() } = {}) {
  usuarios = usuarios.map(u => Object.assign({}, u)); // las altas y los cambios de contraseña no tocan los del test
  const tablas = Object.fromEntries(Object.keys(ESQUEMA).map(n => [n, []]));
  const accesos = new Map(); // token de acceso → user_id
  const renovaciones = new Map(); // token de renovación → user_id
  let siguienteId = 1;
  let siguienteToken = 1;
  const enlaces = new Map(); // token de un enlace mágico → user_id (se canjea una vez)
  let creadoExtra = 0; // para que las filas cargadas a la vez guarden su orden por `creado`

  const marcaDeTiempo = () => new Date(ahora().getTime() + creadoExtra++).toISOString().replace('Z', '+00:00');
  const fechaDeHoy = () => ahora().toISOString().slice(0, 10);

  function sesionPara(usuario) {
    const access = `acceso-${siguienteToken}`;
    const refresh = `renovar-${siguienteToken++}`;
    accesos.set(access, usuario.id);
    renovaciones.set(refresh, usuario.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, refresh_token: refresh,
      user: { id: usuario.id, email: usuario.email } };
  }

  // Fila recibida → fila guardada: columnas conocidas, valores por defecto, tipos y valores permitidos.
  function normalizar(nombre, entrada, quien) {
    const e = ESQUEMA[nombre];
    Object.keys(entrada).forEach(c => {
      if (!e.columnas.includes(c)) throw new ErrorBase(400, 'PGRST204', `Could not find the '${c}' column of '${nombre}'`);
    });
    const fila = {};
    e.columnas.forEach(c => { fila[c] = c in entrada ? entrada[c] : null; });
    if (COMUNES.includes(nombre)) {
      if (!('creado_por' in entrada)) fila.creado_por = quien;
    } else if (!('user_id' in entrada)) fila.user_id = quien;
    if (e.columnas.includes('creado') && !fila.creado) fila.creado = marcaDeTiempo();
    if (e.identidad && !('id' in entrada)) fila.id = siguienteId++;
    if (nombre === 'plan_comidas') {
      if (fila.hecha === null && !('hecha' in entrada)) fila.hecha = 'no';
      if (fila.gramos === null && !('gramos' in entrada)) fila.gramos = {};
    }
    if (nombre === 'recetas') {
      ['ingredientes_fijos', 'ingredientes_escalables'].forEach(c => { if (!(c in entrada)) fila[c] = []; });
      if (!('origen' in entrada)) fila.origen = 'manual';
      if (!('activa' in entrada)) fila.activa = 'si';
    }
    if (nombre === 'alimentos' && !('verificado' in entrada)) fila.verificado = 'no';
    if (nombre === 'valoraciones' && !('fecha' in entrada)) fila.fecha = fechaDeHoy();
    if (nombre === 'ajustes_historial' && !('fecha' in entrada)) fila.fecha = fechaDeHoy();
    return comprobarTipos(nombre, fila);
  }

  function comprobarTipos(nombre, fila) {
    const e = ESQUEMA[nombre];
    e.columnas.forEach(c => {
      const v = fila[c];
      if (v === null || v === undefined) {
        if ((e.noNulas || []).concat(e.pk || []).includes(c)) throw new ErrorBase(400, '23502', `null value in column "${c}" of relation "${nombre}"`);
        fila[c] = null;
        return;
      }
      if (NUMERICAS.has(c)) {
        if (v === '' || !Number.isFinite(Number(v))) throw new ErrorBase(400, '22P02', `invalid input syntax for type numeric: "${v}"`);
        fila[c] = Number(v);
      } else if ((e.jsonb || []).includes(c)) {
        fila[c] = comoJsonb(JSON.parse(JSON.stringify(v)));
      } else if (FECHAS.has(c) && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        throw new ErrorBase(400, '22007', `invalid input syntax for type date: "${v}"`);
      } else if (PERMITIDOS[c] && !PERMITIDOS[c].includes(v)) {
        throw new ErrorBase(400, '23514', `new row for relation "${nombre}" violates check constraint (${c} = ${v})`);
      }
    });
    if (nombre === 'pesos' && !(fila.peso_kg >= 25 && fila.peso_kg <= 300)) throw new ErrorBase(400, '23514', 'peso_kg fuera de rango');
    return fila;
  }

  const puedeVer = (nombre, fila, quien) => COMUNES.includes(nombre) || fila.user_id === quien;
  const puedeCambiar = (nombre, fila, quien) => (COMUNES.includes(nombre)
    ? fila.creado_por === quien || administradores.includes(quien)
    : fila.user_id === quien);
  const mismaClave = (nombre, a, b) => ESQUEMA[nombre].pk.every(c => String(a[c]) === String(b[c]));

  function comprobarUnicas(nombre, filas) {
    const e = ESQUEMA[nombre];
    [e.pk, e.unica].filter(Boolean).forEach(columnas => {
      const vistas = new Set();
      filas.forEach(f => {
        const k = JSON.stringify(columnas.map(c => f[c]));
        if (vistas.has(k)) throw new ErrorBase(409, '23505', `duplicate key value violates unique constraint on ${nombre} (${columnas})`);
        vistas.add(k);
      });
    });
    if (nombre === 'plan_comidas') {
      filas.forEach(f => {
        if (!tablas.planes.some(p => p.user_id === f.user_id && p.plan_id === f.plan_id)) {
          throw new ErrorBase(409, '23503', `insert or update on table "plan_comidas" violates foreign key constraint (${f.plan_id})`);
        }
      });
    }
    if (nombre === 'valoraciones') {
      filas.forEach(f => {
        if (!tablas.recetas.some(r => r.id === f.receta_id)) throw new ErrorBase(409, '23503', `valoraciones: no existe la receta ${f.receta_id}`);
      });
    }
  }

  function leer(nombre, params, quien) {
    let filas = tablas[nombre].filter(f => puedeVer(nombre, f, quien)).filter(filtroDe(params));
    const orden = (params.get('order') || '').split(',').filter(Boolean);
    if (orden.length) {
      filas = filas.slice().sort((a, b) => {
        for (const c of orden) {
          if (a[c] < b[c]) return -1;
          if (a[c] > b[c]) return 1;
        }
        return 0;
      });
    }
    const desde = Number(params.get('offset') || 0);
    const limite = Math.min(Number(params.get('limit') || 1000), 1000);
    return filas.slice(desde, desde + limite);
  }

  function anadir(nombre, cuerpo, prefer, quien) {
    const entradas = Array.isArray(cuerpo) ? cuerpo : [cuerpo];
    const claves = JSON.stringify(Object.keys(entradas[0] || {}).sort());
    if (entradas.some(f => JSON.stringify(Object.keys(f).sort()) !== claves)) throw new ErrorBase(400, 'PGRST102', 'All object keys must match');
    const nuevas = entradas.map(f => normalizar(nombre, f, quien));
    nuevas.forEach(f => {
      const dueno = COMUNES.includes(nombre) ? f.creado_por : f.user_id;
      if (dueno !== quien) throw new ErrorBase(403, '42501', `new row violates row-level security policy for table "${nombre}"`);
    });
    const resultado = tablas[nombre].slice();
    const fusionar = /resolution=merge-duplicates/.test(prefer || '');
    nuevas.forEach((f, i) => {
      const j = ESQUEMA[nombre].pk ? resultado.findIndex(x => mismaClave(nombre, x, f)) : -1;
      if (j >= 0 && fusionar) {
        if (!puedeCambiar(nombre, resultado[j], quien)) throw new ErrorBase(403, '42501', `new row violates row-level security policy for table "${nombre}"`);
        const cambios = {};
        Object.keys(entradas[i]).forEach(c => { cambios[c] = f[c]; });
        resultado[j] = Object.assign({}, resultado[j], cambios);
      } else {
        resultado.push(f);
      }
    });
    comprobarUnicas(nombre, resultado);
    tablas[nombre] = resultado;
    return nuevas;
  }

  function cambiar(nombre, params, cuerpo, quien) {
    const coincide = filtroDe(params);
    const cambiadas = [];
    const resultado = tablas[nombre].map(f => {
      if (!puedeVer(nombre, f, quien) || !coincide(f) || !puedeCambiar(nombre, f, quien)) return f;
      const nueva = comprobarTipos(nombre, Object.assign({}, f, normalizarCambios(nombre, cuerpo)));
      cambiadas.push(nueva);
      return nueva;
    });
    comprobarUnicas(nombre, resultado);
    tablas[nombre] = resultado;
    return cambiadas;
  }

  function normalizarCambios(nombre, cuerpo) {
    Object.keys(cuerpo).forEach(c => {
      if (!ESQUEMA[nombre].columnas.includes(c)) throw new ErrorBase(400, 'PGRST204', `Could not find the '${c}' column of '${nombre}'`);
    });
    return cuerpo;
  }

  function borrar(nombre, params, quien) {
    if ([...params.keys()].every(k => ['select', 'order', 'offset', 'limit'].includes(k))) {
      throw new ErrorBase(400, '21000', 'DELETE requires a WHERE clause');
    }
    const coincide = filtroDe(params);
    const borradas = tablas[nombre].filter(f => puedeVer(nombre, f, quien) && coincide(f) && puedeCambiar(nombre, f, quien));
    tablas[nombre] = tablas[nombre].filter(f => !borradas.includes(f));
    if (nombre === 'planes') {
      tablas.plan_comidas = tablas.plan_comidas.filter(c => !borradas.some(p => p.user_id === c.user_id && p.plan_id === c.plan_id));
    }
    return borradas;
  }

  // Como Supabase: al menos 6 caracteres y, al cambiarla, distinta de la anterior. Devuelve el error o null.
  function claveNueva(u, password) {
    if (typeof password !== 'string' || password.length < 6) {
      return [422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' }];
    }
    if (password === u.password) {
      return [422, { code: 422, error_code: 'same_password', msg: 'New password should be different from the old password.' }];
    }
    u.password = password;
    return null;
  }

  function auth(metodo, url, cuerpo, cabeceras) {
    const tipo = url.searchParams.get('grant_type');
    if (metodo === 'POST' && url.pathname === '/auth/v1/token' && tipo === 'password') {
      const u = usuarios.find(x => x.email === (cuerpo || {}).email && x.password === cuerpo.password);
      if (!u) return [400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }];
      return [200, sesionPara(u)];
    }
    if (metodo === 'POST' && url.pathname === '/auth/v1/token' && tipo === 'refresh_token') {
      const id = renovaciones.get((cuerpo || {}).refresh_token);
      if (!id) return [400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }];
      renovaciones.delete(cuerpo.refresh_token);
      return [200, sesionPara(usuarios.find(x => x.id === id))];
    }
    if (metodo === 'POST' && url.pathname === '/auth/v1/logout') {
      const id = accesos.get(String(cabeceras.authorization || '').replace(/^Bearer /, ''));
      if (id) {
        [...renovaciones].filter(([, u]) => u === id).forEach(([t]) => renovaciones.delete(t));
        [...accesos].filter(([, u]) => u === id).forEach(([t]) => accesos.delete(t));
      }
      return [204, null];
    }
    if (metodo === 'PUT' && url.pathname === '/auth/v1/user') {
      const u = usuarios.find(x => x.id === accesos.get(String(cabeceras.authorization || '').replace(/^Bearer /, '')));
      if (!u) return [401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }];
      const r = claveNueva(u, (cuerpo || {}).password);
      if (r) return r;
      return [200, { id: u.id, email: u.email }];
    }
    if (url.pathname.startsWith('/auth/v1/admin/') && cabeceras.apikey !== claveSecreta) {
      return [403, { code: 403, error_code: 'not_admin', msg: 'User not allowed' }];
    }
    if (metodo === 'GET' && url.pathname === '/auth/v1/admin/users') {
      return [200, { aud: 'authenticated', users: usuarios.map(u => ({ id: u.id, email: u.email })) }];
    }
    if (metodo === 'POST' && url.pathname === '/auth/v1/admin/users') {
      const email = String((cuerpo || {}).email || '');
      if (usuarios.some(x => x.email === email)) return [422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' }];
      const u = { id: `00000000-0000-4000-8000-${String(900 + usuarios.length).padStart(12, '0')}`, email };
      const r = claveNueva(u, cuerpo.password);
      if (r) return r;
      usuarios.push(u);
      return [200, { id: u.id, email: u.email, email_confirmed_at: cuerpo.email_confirm ? ahora().toISOString() : null }];
    }
    const editar = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    if (metodo === 'PUT' && editar) {
      const u = usuarios.find(x => x.id === editar[1]);
      if (!u) return [404, { code: 404, error_code: 'user_not_found', msg: 'User not found' }];
      const r = claveNueva(u, (cuerpo || {}).password);
      if (r) return r;
      return [200, { id: u.id, email: u.email }];
    }
    if (metodo === 'POST' && url.pathname === '/auth/v1/admin/generate_link') {
      const u = usuarios.find(x => x.email === (cuerpo || {}).email);
      if (!u) return [404, { code: 404, error_code: 'user_not_found', msg: 'User with this email not found' }];
      const token = `enlace-${siguienteToken++}`;
      enlaces.set(token, u.id);
      return [200, { id: u.id, email: u.email, action_link: 'http://supabase.falso/auth/v1/verify?token=' + token,
        hashed_token: token, verification_type: cuerpo.type }];
    }
    if (metodo === 'POST' && url.pathname === '/auth/v1/verify') {
      const id = enlaces.get((cuerpo || {}).token_hash);
      if (!id) return [403, { code: 403, error_code: 'otp_expired', msg: 'Email link is invalid or has expired' }];
      enlaces.delete(cuerpo.token_hash);
      return [200, sesionPara(usuarios.find(x => x.id === id))];
    }
    return [404, { msg: 'No existe ' + url.pathname }];
  }

  // Una petición HTTP → [estado, cuerpo (objeto o null)].
  function responder(metodo, direccion, cabeceras, texto) {
    const url = new URL(direccion, 'http://localhost');
    const h = Object.fromEntries(Object.entries(cabeceras || {}).map(([k, v]) => [k.toLowerCase(), v]));
    if (h.apikey !== clave && h.apikey !== claveSecreta) return [401, { message: 'Invalid API key' }];
    let cuerpo;
    try {
      cuerpo = texto ? JSON.parse(texto) : undefined;
    } catch (err) {
      return [400, { code: 'PGRST102', message: 'Empty or invalid json' }];
    }
    if (url.pathname.startsWith('/auth/v1/')) return auth(metodo, url, cuerpo, h);
    const m = url.pathname.match(/^\/rest\/v1\/(\w+)$/);
    if (!m) return [404, { message: 'No existe ' + url.pathname }];
    const nombre = m[1];
    if (!ESQUEMA[nombre]) return [404, { code: '42P01', message: `relation "public.${nombre}" does not exist` }];
    const quien = accesos.get(String(h.authorization || '').replace(/^Bearer /, ''));
    if (!quien) return [401, { code: 'PGRST301', message: 'JWT expired' }];
    const prefer = h.prefer || '';
    const devolver = /return=representation/.test(prefer);
    try {
      if (metodo === 'GET') return [200, leer(nombre, url.searchParams, quien)];
      if (metodo === 'POST') {
        const filas = anadir(nombre, cuerpo, prefer, quien);
        return devolver ? [201, filas] : [201, null];
      }
      if (metodo === 'PATCH') {
        const filas = cambiar(nombre, url.searchParams, cuerpo || {}, quien);
        return devolver ? [200, filas] : [204, null];
      }
      if (metodo === 'DELETE') {
        const filas = borrar(nombre, url.searchParams, quien);
        return devolver ? [200, filas] : [204, null];
      }
      return [405, { message: 'Método no permitido' }];
    } catch (err) {
      if (!(err instanceof ErrorBase)) throw err;
      return [err.estado, { code: err.codigo, message: err.message }];
    }
  }

  // Igual que fetch(), para pasárselo a web/supabase.js en los tests.
  async function fetchFalso(direccion, opciones = {}) {
    const [estado, cuerpo] = responder(opciones.method || 'GET', direccion, opciones.headers, opciones.body);
    const texto = cuerpo === null ? '' : JSON.stringify(cuerpo);
    return { status: estado, ok: estado >= 200 && estado < 300, text: async () => texto };
  }

  // Carga filas directamente, sin reglas (como el editor SQL del panel). Las filas de cada llamada quedan
  // con `creado` creciente, para que se lean en el mismo orden.
  function cargar(nombre, filas, quien) {
    tablas[nombre] = tablas[nombre].concat(filas.map(f => normalizar(nombre, f, quien)));
    comprobarUnicas(nombre, tablas[nombre]);
  }

  // Invalida los tokens de acceso (como si hubiera pasado una hora). Los de renovación siguen valiendo.
  const caducarAccesos = () => accesos.clear();

  return { tablas, responder, fetch: fetchFalso, cargar, caducarAccesos };
}

module.exports = { crearSupabaseFalso, ESQUEMA };
