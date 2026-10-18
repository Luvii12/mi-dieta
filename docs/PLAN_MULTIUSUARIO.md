# Plan: Supabase y varios usuarios

> Objetivo: que Fran, su hermano y su novia usen la misma app, cada uno con su perfil, sus objetivos, sus planes y su progreso, y con la biblioteca de recetas en común. Se hace por fases; la app sigue funcionando con Google Sheets hasta la fase M3.

## Decisiones (2026-10-18, confirmadas por Fran)
| Tema | Decisión |
| --- | --- |
| Base de datos | **Supabase** gratis (Postgres 500 MB, login incluido). Se pausa tras 7 días sin uso; con uso diario no pasa (si pasa, se reactiva desde el panel sin perder datos) |
| Acceso a datos | La PWA habla directamente con Supabase por `fetch` (API REST y Auth), **sin librerías**. La clave pública (`anon`) puede ir en el frontend; la seguridad la ponen las reglas por fila (RLS) |
| Login | **Email y contraseña**, registro cerrado: solo entran las cuentas que Fran invita desde el panel |
| Recetas y alimentos | **Biblioteca común** para todos. Cada uno tiene sus valoraciones, alimentos excluidos y objetivos, así que a cada uno le salen planes distintos |
| Objetivos de una persona nueva | **Los calcula la app** al darse de alta (Mifflin-St Jeor + actividad + meta, proteína por kg) y los reparte entre las comidas; se pueden editar después |
| Motor | Optimizador, generador, progreso y validación de recetas pasan a ejecutarse **en el navegador** (ya son JS sin dependencias de Sheets). Apps Script se retira al final |
| Generación automática | Sustituye al activador de Apps Script: al abrir la app, si al plan activo le quedan ≤ 2 días y no hay borrador, se genera |

## Esquema propuesto (Postgres)
Común (lo leen todos los usuarios con sesión; añadir sí, borrar no):
- `alimentos` — igual que ahora + `creado_por`.
- `recetas` — igual que ahora (`activa`: si / no / propuesta / descartada) + `propuesta_por`.

Personal (cada fila con `user_id`; RLS: solo `user_id = auth.uid()`):
- `perfiles` — nombre, sexo, fecha de nacimiento, altura, actividad, meta, `peso_objetivo`, `config` (JSON: objetivos por comida, tolerancias, comida libre semanal…).
- `valoraciones`, `preferencias` (excluidos), `planes`, `plan_comidas`, `pesos`, `ajustes_historial` — las columnas de `DATOS.md` + `user_id`.

El esquema vive en el repo (`supabase/esquema.sql`) con permisos explícitos (`grant`) para la API, como exige Supabase desde octubre de 2026.

## Fases
Cada fase acaba en algo que se prueba en el móvil. Parar al final de cada una.

### M0 · Proyecto Supabase y esquema
- Fran crea la cuenta y el proyecto (guiado paso a paso); se desactiva el registro libre.
- `supabase/esquema.sql`: tablas, índices, RLS y permisos. Se carga desde el editor SQL del panel.
- La URL y la clave `anon` van en la PWA; la clave `service_role` **nunca** va al repo.
- **Hecho cuando**: con 2 usuarios de prueba, cada uno solo ve sus filas personales y los dos ven las recetas.

### M1 · Motor en el navegador (sin cambios visibles)
- Separar la lógica pura (`Nutricion`, `Generador`, `Planes`, `Progreso`, validación de `RecetasIA`, `Util`) en `web/motor/`, usable desde la PWA y desde los tests de Node.
- Los 107 tests siguen pasando; se añade uno que genera un plan de 14 días en el navegador.
- **Hecho cuando**: los tests pasan y Apps Script sigue funcionando igual (usa la misma lógica).

### M2 · Capa de datos Supabase + pantalla de entrada
- `web/api.js` pasa a Supabase: login, sesión guardada y renovada, y las mismas acciones que hoy (`hoy`, `plan`, `marcarComida`, `cambiarPlato`, `valorar`, `progreso`…), ahora resueltas con el motor del navegador.
- Pantalla de entrada (email y contraseña) con el estilo de `design/`; «Cerrar sesión» en Ajustes (borra la copia local).
- Pruebas sin red con una base falsa en memoria (como el `servidor_local.js` actual).
- **Hecho cuando**: en local, con un usuario de prueba, se sigue un día completo.

### M3 · Migrar los datos de Fran y cambiar — hecha (2026-10-18)
- La biblioteca semilla ya está en Supabase desde M2 (añadida por `franluvi2015`): la migración actualiza nombres de alimentos y añade las recetas de IA y los alimentos nuevos de la hoja. Fusionar la rama `supabase` en `main`.
- Script `scripts/migrar_sheets.js`: lee todo de la hoja (con el Apps Script actual) y lo carga en Supabase con el `user_id` de Fran. Comprueba que coinciden los recuentos y los macros del plan activo.
- Publicar la PWA nueva. La hoja se queda como copia de seguridad (solo lectura).
- **Hecho cuando**: Hoy, Plan, Recetas y Progreso muestran en el móvil lo mismo que antes.
- Hecho así: se migró el domingo 18-10, la víspera del primer día del bloque (nada a medias). Cuenta real `franluvi2015`. La hoja se lee con una acción `exportar` (solo en Apps Script, versión 10). `scripts/recetas_ia.js` ya va contra Supabase con la cuenta real (adelantado de M5, sin la parte de «para quién»).

### M4 · Alta de usuarios y objetivos calculados
- Alta: nombre, sexo, edad, altura, peso, actividad y meta (perder / mantener / ganar) → kcal, proteína (g/kg), grasa (% kcal) e hidratos, repartidos por comidas con las proporciones del plan de Fran. Con tests (regla 3).
- Límites de seguridad por persona (los de `NUTRICION.md` pasan a depender del perfil; ver preguntas abiertas).
- Aviso de que la app no sustituye a un dietista-nutricionista.
- **Hecho cuando**: un usuario nuevo invitado entra, se da de alta, genera su plan y no ve nada de Fran salvo las recetas.
- Hecho así (2026-10-18, sin publicar): el alta pregunta objetivo (perder grasa / mantener / ganar músculo), días de entrenamiento, tipo de trabajo, sexo, nacimiento, altura y peso; **Ajustes › Mi objetivo** permite cambiar de objetivo cuando se quiera (Fran pasará a ganar músculo) y recalcula. Fórmulas en `docs/NUTRICION.md` › «Objetivos según el perfil»; el ajuste quincenal depende del objetivo. Las raciones de las recetas se escalan a cada persona. Proteína por g/kg según la persona (no forzada a lo que dan las recetas): la biblioteca la ampliará el agente de Fran. El perfil va en `config.perfil` (la tabla `perfiles` no se usa). Primer plan: mañana. Propuestas de IA y «Nombres de alimentos», solo para quien las creó.

### M5 · Recetas con IA y automatización — hecha en local (2026-10-18)
- `scripts/recetas_ia.js` contra Supabase con el login de Fran (en `.supabase.local.json`). `pedido` acepta para quién es (sus excluidos y valoraciones); las propuestas se ven en Recetas de quien las pidió y, al aceptarlas, pasan a la biblioteca común.
- Generación automática al abrir la app (sustituye a `revisarFinDePlan`).
- Actualizar la skill `dietista` (datos de Supabase, varias personas).
- **Hecho cuando**: una receta pedida para el hermano llega a su móvil y entra en su siguiente plan.
- Hecho así (2026-10-18, sin publicar): `recetas_ia.js … --para <email>` entra como esa persona con la **clave secreta** del proyecto (`"clave_secreta"` en `.supabase.local.json`, decidido por Fran): comprueba que la cuenta existe y canjea un enlace mágico de administrador (`entrarComo` en `web/supabase.js`), sin contraseñas ni cambios en la base. Las propuestas de otra persona llegan al motor como descartadas (no se ven, pero cuentan para no repetir nombre ni id `IA…`). Generación automática: acción `revisarFinDePlan` en el motor; la PWA la pide una vez al día al abrirse (Apps Script la usa desde ahí hasta M6). Skill dietista actualizada. Probado con la Supabase falsa (`tests/supabase.test.js`) y en el navegador (`npm run servidor -- fin`); el «entrar como» probado también contra el Supabase real (pedido para `franluvi2022`).

### M6 · Entrega y limpieza
- Invitar al hermano y a la novia; guía corta para instalar la PWA en su móvil.
- Retirar Apps Script (activador incluido) y `clasp`; actualizar `CLAUDE.md`, `DATOS.md`, `SPEC.md`, `DESPLIEGUE.md`.
- **Hecho cuando**: los tres usan la app una semana sin incidencias.

## Preguntas abiertas (decidir en su fase)
- Decidido en M4 (2026-10-18): mínimo 1.200 kcal mujeres / 1.500 hombres (Fran mantiene 1.400); proteína según la persona (objetivo y entrenamiento); 4 comidas para todos; alimentos comunes: añadir cualquiera, cambiar solo Fran.
