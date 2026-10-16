# Progreso del proyecto

> Memoria entre sesiones. Claude Code lo lee al empezar y lo actualiza al terminar cada tarea o antes de `/clear`. Mantenerlo por debajo de ~80 líneas: resumir lo antiguo.

## Estado actual
- **Fase:** 5 · Recetas con IA — código hecho el 2026-10-16, **sin desplegar** (PWA `dieta-v8`). 109 tests. Fase 4 desplegada (web app versión 7).
- **URLs:** PWA https://luvii12.github.io/dieta_app/ · repo https://github.com/Luvii12/dieta_app · web app: implementación `AKfycbwVOiJ…` (URL /exec completa la tiene el usuario; el token NUNCA va al repo).
- **Siguiente paso:** desplegar la Fase 5 (`clasp push` + `clasp deploy`, y luego push de la PWA). El usuario crea `.conexion.local.json` con `{"url": "<URL /exec>", "token": "<APP_TOKEN>"}` para `scripts/recetas_ia.js`. Después, primera tanda real de recetas (proceso en `CLAUDE.md`).
- **Desplegar:** `clasp push --force` y `clasp deploy -i <id del despliegue AKfycbwVOiJ…> -d "…"` (mantiene la URL); la PWA se publica sola al hacer push a `main`. Desplegar el servidor **antes** que la PWA.

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
| 2026-10-16 | Fase 5 (decidido por el usuario): **las recetas las escribe Claude Code con la suscripción, sin API de pago** (`scripts/recetas_ia.js`: pedido → probar → enviar). El usuario revisa cada propuesta en Recetas y la añade o descarta; si falta un alimento, **el usuario mete sus macros** (etiqueta/BEDCA), la IA nunca da valores. La llamada a la API (`claude-sonnet-5-5`) queda en el servidor sin usar y sin botón |
| 2026-10-16 | Recetas IA: ids `IA1, IA2…`; `activa` = propuesta/descartada; las descartadas no se borran (para que la IA no las repita). Un reintento con los motivos si se descarta alguna; descarta nombres repetidos |

## Preguntas abiertas
- Nombres de alimentos generados desde el `id` («Ternera picada 5», «Aceite ml»): ya se pueden renombrar en Ajustes › Nombres de alimentos.
- Valores de `data/alimentos.csv` sin verificar (aproximados).
- El usuario está probando la semana de prueba (22 recetas); sus valoraciones decidirán qué recetas se quedan.

## Hecho
- **2026-10-16 · Fase 5 (sin desplegar):** `RecetasIA.js` (instrucciones y esquema, validación, alimentos nuevos), acciones `propuestas`, `pedidoRecetas`, `importarPropuestas`, `aceptarPropuesta`, `descartarPropuesta`, `anadirAlimento` (+ `proponerRecetas`/`probarClaude()` sin usar). `scripts/recetas_ia.js`. PWA: sección «Propuestas de la IA» en Recetas, Receta con Añadir/Descartar y formulario de alimento nuevo (`abrirFormulario` pasa a `comun.js`). Corregido un «null» al pie de las recetas de la biblioteca. Probado con 2 cenas reales en el servidor local. 109 tests.
- **2026-10-16 · Fase 4 (desplegada):** `Progreso.js` (media móvil, ritmo, adherencia, racha, regla de ajuste, reparto), acciones `progreso`, `registrarPeso`, `alimentos`, `renombrarAlimento`, `guardarExcluidos`, `activarPlan` con ajuste, estado «siguiente», `revisarFinDePlan` + `instalarActivador`. PWA: `progreso.js` (gráfica SVG + hoja de peso), `nuevoplan.js`, Ajustes editable, aviso de nuevo plan en Hoy. 97 tests.
- **2026-10-16 · Fase 3:** acciones `marcarComida`, `alternativas`, `cambiarPlato`, `valorar` (+ `grupo` en ingredientes y `valoracion`/`cambiada` en cada comida). PWA rehecha con el diseño de `design/` en módulos (`comun`, `datos`, `hoy`, `plan`, `recetas`, `receta`, `cambiar`, `ajustes`); fuentes de Google cacheadas por el service worker (v4). 74 tests.
- **2026-10-16 · Fases 0–2:** esqueleto (token, `config`, PWA instalable), motor nutricional (`Nutricion.js`, 34 tests de regresión con el prototipo) y generador de 14 días (`Generador.js`, `Planes.js`; plan en 4,4 s en Google). Git guarda el token de GitHub en `~/.git-credentials`.
