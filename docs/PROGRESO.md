# Progreso del proyecto

> Memoria entre sesiones. Claude Code lo lee al empezar y lo actualiza al terminar cada tarea o antes de `/clear`. Mantenerlo por debajo de ~80 líneas: resumir lo antiguo.

## Estado actual
- **Fase:** 5 · Recetas con IA — desplegada el 2026-10-16 (web app versión 8, misma URL; PWA `dieta-v8`). 107 tests. Fase 4 desplegada (web app versión 7).
- **URLs:** PWA https://luvii12.github.io/mi-dieta/ · repo https://github.com/Luvii12/mi-dieta · web app: implementación `AKfycbwVOiJ…` (URL /exec completa la tiene el usuario; el token NUNCA va al repo).
- **Siguiente paso (nuevo):** M0 hecha (2026-10-18; proyecto `umzalhsxowdwteqursyc`, `npm run probar-rls` 30/30; usuarios de prueba = los dos emails de Fran con contraseña débil: cambiarla si uno pasa a cuenta real en M3). M1 hecha (111 tests) y desplegada el 2026-10-18 (web app versión 9; si fallara, volver a la 8 con `clasp deploy -i AKfycbwVOiJ… -V 8`): config, hoy, plan, recetas, progreso, alimentos y propuestas responden bien en la web app real. Falta que Fran lo vea en el móvil. Después: M2. Pendiente de antes: comprobar en el móvil que la app sigue respondiendo tras el despliegue. El usuario crea `.conexion.local.json` con `{"url": "<URL /exec>", "token": "<APP_TOKEN>"}` para `scripts/recetas_ia.js`. Después, primera tanda real de recetas (proceso en `CLAUDE.md`).
- **Desplegar:** (desde la raíz; sube `appsscript.json`, `apps-script/` y `web/motor/`) `clasp push --force` y `clasp deploy -i <id del despliegue AKfycbwVOiJ…> -d "…"` (mantiene la URL); la PWA se publica sola al hacer push a `main`. Desplegar el servidor **antes** que la PWA.

## Decisiones tomadas
| Fecha | Decisión |
| --- | --- |
| 2026-10-15 | PWA en GitHub Pages + Google Sheets + Apps Script; sin login, con token secreto |
| 2026-10-15 | Chat con IA aplazado; prioridad: generar la dieta automáticamente cada 2 semanas |
| 2026-10-15 | Generación híbrida: recetas con ingredientes fijos/escalables + optimizador de gramos en código |
| 2026-10-15 | Referencia provisional: «Ajustes Fran. Déficit» ≈ 1.655 kcal (P132 · C159 · G53), según lo que suman sus menús |
| 2026-10-16 | Sin plugins ni skills instaladas: memoria en este archivo; nada se instala sin confirmación. `awesome-design-md` y `web-design-guidelines` descartados |
| 2026-10-16 | **App independiente** de la de fitness/rutinas (repo, PWA, hoja y Apps Script propios) |
| 2026-10-16 | PWA en JS sin build (`web/`); motor en `apps-script/` probado en Node (`node --test`, `tests/simulador_gas.js`). POST `text/plain` con el token en el cuerpo. `clasp push --force` autorizado siempre |
| 2026-10-16 | Valores de `config` siempre como JSON. Optimizador propio (descenso por coordenadas), mismos gramos que el prototipo |
| 2026-10-16 | Tolerancia por comida solo informativa en las recetas semilla (D2, D4, C1, C3, C4 fuera, las compensa el día); la del día es obligatoria. **Las recetas de IA sí deben cumplir la de su comida** |
| 2026-10-16 | Planes empiezan el lunes siguiente (o al acabar el activo). Generador: 20 combinaciones por día, hasta 50 planes, valida con macros a 1 decimal |
| 2026-10-16 | Diseño: `design/` manda en el estilo; botones y datos de las capturas son orientativos. Sin fotos ni horas. CSS propio con tokens de `DESIGN.md`, Google Fonts cacheadas |
| 2026-10-16 | Barra de 5: Hoy · Plan · Recetas · Progreso · Ajustes. «Cambiar plato» guarda en `cambiada_por`; «Comida libre» = `hecha: libre`. Marcar y valorar necesitan conexión (se deshacen si falla) |
| 2026-10-16 | Fase 4 (decidido por el usuario): Progreso con meta de peso y racha (sin cintura, momento de la toma ni proteína media); Nuevo plan con 2 opciones de ajuste; Ajustes edita objetivos, excluidos, nombres de alimentos e interruptor «Comida libre semanal» (sin favoritos); activador instalado con `instalarActivador()` |
| 2026-10-16 | Activar un borrador con el plan activo aún en curso lo deja como «siguiente» (no se pierden los últimos días). «Nuevo plan» es la vista del borrador dentro de la pestaña Plan. Elegir un ajuste recalcula los gramos del borrador con los mismos platos |
| 2026-10-16 | Comida libre semanal apagada: «Cambiar plato» no ofrece comida libre y todas las libres cuentan como no hechas en la adherencia |
| 2026-10-16 | Fase 5 (decidido por el usuario): **las recetas las escribe Claude Code con la suscripción, sin API de pago** (`scripts/recetas_ia.js`: pedido → probar → enviar). El usuario revisa cada propuesta en Recetas y la añade o descarta; si falta un alimento, **el usuario mete sus macros** (etiqueta/BEDCA), la IA nunca da valores. La versión con API (`claude-sonnet-5-5`) se quitó antes de desplegar: `UrlFetchApp` obligaba a dar un permiso nuevo y, sin darlo, la web app entera dejaría de responder. Está en el commit `3fb63e7` |
| 2026-10-16 | Repo renombrado `dieta_app` → **`mi-dieta`** (PWA en `/mi-dieta/`): Android tenía registrada una instalación rota de `/dieta_app/` (no salía en `chrome://webapks`) y no dejaba instalarla. Manifest con `id: "./"`. No borrar datos del sitio `luvii12.github.io`: la app de gym guarda ahí sus entrenos (IndexedDB) |
| 2026-10-18 | Apps Script tarda ~2–3,5 s por llamada (unos 2 s fijos). Al abrir la app, tras la pantalla actual, se precargan Recetas (+ propuestas) y Progreso en segundo plano; todas las pantallas pintan primero lo guardado |
| 2026-10-16 | Recetas IA: ids `IA1, IA2…`; `activa` = propuesta/descartada; las descartadas no se borran (para que la IA no las repita). Un reintento con los motivos si se descarta alguna; descarta nombres repetidos |
| 2026-10-18 | Skill **dietista** (claude.ai, fuera del repo, en `~/Escritorio/claude/dietista/`): diseña recetas en el JSON de la app, interpreta progreso y recomienda ajustes; nunca da macros para la app ni hace planes con gramos a mano |
| 2026-10-18 | **Migración a Supabase y multiusuario** (Fran, su hermano y su novia): Supabase gratis por `fetch`, email + contraseña con registro cerrado, biblioteca de recetas común, objetivos calculados al darse de alta, motor en el navegador. Plan por fases M0–M6 en `docs/PLAN_MULTIUSUARIO.md` |
| 2026-10-18 | M0: tablas con las mismas columnas que las pestañas + `user_id` (planes con clave `user_id, plan_id`); `config` sigue siendo clave/valor por usuario; `perfiles` para el alta de M4. Comunes: leer y añadir todos, cambiar/borrar quien lo creó o un administrador (tabla `administradores`, solo por SQL) |
| 2026-10-18 | M1: la lógica pasa a `web/motor/` (incluidas las acciones, `Acciones.js`). En el navegador se cargan las tablas del usuario en memoria (`Memoria.js`), se ejecuta la misma acción y se guardan las tablas cambiadas. `appsscript.json` a la raíz y clasp con `rootDir: "."` + `.claspignore` |

## Preguntas abiertas
- Nombres de alimentos generados desde el `id` («Ternera picada 5», «Aceite ml»): ya se pueden renombrar en Ajustes › Nombres de alimentos.
- Valores de `data/alimentos.csv` sin verificar (aproximados).
- El usuario está probando la semana de prueba (22 recetas); sus valoraciones decidirán qué recetas se quedan.

## Hecho
- **2026-10-16 · Fase 5 (sin desplegar):** `RecetasIA.js` (instrucciones y esquema, validación, alimentos nuevos), acciones `propuestas`, `pedidoRecetas`, `importarPropuestas`, `aceptarPropuesta`, `descartarPropuesta`, `anadirAlimento`. `scripts/recetas_ia.js`. PWA: sección «Propuestas de la IA» en Recetas, Receta con Añadir/Descartar y formulario de alimento nuevo (`abrirFormulario` pasa a `comun.js`). Corregido un «null» al pie de las recetas de la biblioteca. Probado con 2 cenas reales en el servidor local. 107 tests.
- **2026-10-16 · Fase 4 (desplegada):** `Progreso.js` (media móvil, ritmo, adherencia, racha, regla de ajuste, reparto), acciones `progreso`, `registrarPeso`, `alimentos`, `renombrarAlimento`, `guardarExcluidos`, `activarPlan` con ajuste, estado «siguiente», `revisarFinDePlan` + `instalarActivador`. PWA: `progreso.js` (gráfica SVG + hoja de peso), `nuevoplan.js`, Ajustes editable, aviso de nuevo plan en Hoy. 97 tests.
- **2026-10-16 · Fase 3:** acciones `marcarComida`, `alternativas`, `cambiarPlato`, `valorar` (+ `grupo` en ingredientes y `valoracion`/`cambiada` en cada comida). PWA rehecha con el diseño de `design/` en módulos (`comun`, `datos`, `hoy`, `plan`, `recetas`, `receta`, `cambiar`, `ajustes`); fuentes de Google cacheadas por el service worker (v4). 74 tests.
- **2026-10-16 · Fases 0–2:** esqueleto (token, `config`, PWA instalable), motor nutricional (`Nutricion.js`, 34 tests de regresión con el prototipo) y generador de 14 días (`Generador.js`, `Planes.js`; plan en 4,4 s en Google). Git guarda el token de GitHub en `~/.git-credentials`.
