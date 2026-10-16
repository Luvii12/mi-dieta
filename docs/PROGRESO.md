# Progreso del proyecto

> Memoria entre sesiones. Claude Code lo lee al empezar y lo actualiza al terminar cada tarea o antes de `/clear`. Mantenerlo por debajo de ~80 líneas: resumir lo antiguo.

## Estado actual
- **Fase:** 2 · Generador de 14 días — hecha y desplegada; falta que el usuario la pruebe en el móvil. Hay un borrador real generado el 2026-10-16 (P20261016-105919, 19 oct–1 nov) pendiente de que lo active.
- **URLs:** PWA https://luvii12.github.io/dieta_app/ · repo https://github.com/Luvii12/dieta_app · web app: implementación `AKfycbwVOiJ…` (URL /exec completa la tiene el usuario; el token NUNCA va al repo).
- **Hecho en la nube:** hoja «Dieta» y script vinculado creados con clasp (IDs en `.clasp.json`); código subido con `clasp push --force` (autorizado por el usuario, para sobrescribir el manifiesto con zona Europe/Madrid).
- **Siguiente paso:** prueba del usuario (pestaña Plan → Activar; Hoy desde el lunes 19). Luego explicar y proponer la Fase 3 (pantallas de uso diario: marcar hecha/libre, cambiar plato, valorar).

## Decisiones tomadas
| Fecha | Decisión |
| --- | --- |
| 2026-10-15 | PWA en GitHub Pages + Google Sheets + Apps Script; sin login, con token secreto |
| 2026-10-15 | Chat con IA aplazado; prioridad: generar la dieta automáticamente cada 2 semanas |
| 2026-10-15 | Generación híbrida: recetas con ingredientes fijos/escalables + optimizador de gramos en código |
| 2026-10-15 | Referencia provisional: «Ajustes Fran. Déficit» ≈ 1.655 kcal (P132 · C159 · G53), según lo que suman sus menús |
| 2026-10-16 | Sin plugins de memoria ni de tokens: memoria en este archivo; no instalar nada sin confirmación |
| 2026-10-16 | **App independiente**: repositorio, PWA, hoja de Google y Apps Script propios. No se integra ni comparte código o datos con la app de fitness/rutinas del usuario |
| 2026-10-16 | PWA en JS sin build ni dependencias (`web/`); motor en `apps-script/` compatible con Node para tests (`node --test`) |
| 2026-10-16 | La PWA llama por POST `text/plain` (evita CORS); el token va en el cuerpo, nunca en la URL. `doGet` no da datos |
| 2026-10-16 | Usuario autoriza `clasp push --force` siempre en este proyecto (el repo es la fuente de verdad del código de Apps Script) |
| 2026-10-16 | Valores de `config` siempre como JSON (también textos, entre comillas): Sheets convertía «16/10/2026, 10:22» en fecha |
| 2026-10-16 | Optimizador propio sin dependencias: descenso por coordenadas sobre mínimos cuadrados acotados (`Nutricion.js`). Da los mismos gramos que el prototipo en las 22 recetas |
| 2026-10-16 | Pantalla «Recetas» (Fase 1) con gramos ajustados, crudo/cocinado, macros frente a objetivo y aviso si una comida queda fuera de su tolerancia |
| 2026-10-16 | Las 5 recetas fuera de margen por comida (D2, D4, C1, C3, C4) se quedan como están: el generador las compensa en el día. La tolerancia por comida es solo informativa; la del día es obligatoria |
| 2026-10-16 | Planes empiezan el lunes siguiente (o el día después de acabar el activo). «Hoy» muestra el plan activo (solo lectura hasta la Fase 3) |
| 2026-10-16 | Generador: elige recetas por día con reglas de repetición y pesos; prueba 20 combinaciones por día y hasta 50 planes completos, se queda el primero sin días a revisar. Valida con macros redondeados a 1 decimal (lo mismo que se guarda) |
| 2026-10-16 | Datos iniciales: `scripts/generar_semilla.js` genera `apps-script/Semilla.js`; `configurarHoja()` carga solo en pestañas vacías. `nombre` de alimentos generado desde el `id` (el CSV no lo traía); `codigo_barras` vacío |

## Preguntas abiertas
- Valores de `data/alimentos.csv` sin verificar (aproximados).
- El usuario está probando la semana de prueba (22 recetas); sus valoraciones decidirán qué recetas se quedan.

## Hecho
- **2026-10-16 · Fase 2:** `Generador.js` + `Planes.js` + acciones `plan`/`generarPlan`/`activarPlan`/`hoy`; pestaña Plan (generar, revisar 14 días, activar) y Hoy con el plan activo (y sin conexión desde el plan guardado). `tests/simulador_gas.js` ejecuta el código real de Apps Script sobre una hoja en memoria. 67 tests. En Google: plan en 4,4 s, 0 días a revisar.
- **2026-10-16 · Fase 1:** `Nutricion.js` (macros, optimizador, redondeo a 5 g/piezas, tolerancias comida y día con margen de proteína) + acción `recetas` + pantalla Recetas. 34 tests (regresión: mismos gramos que el prototipo, kcal ±0,15 %).
- **2026-10-16 · Fase 0 terminada:** funciona en el móvil (instalada, conectada, lee/escribe). Git guarda el token de GitHub en `~/.git-credentials` (Hyprland no tiene servicio de secretos).
- **2026-10-16 · Fase 0 (detalle):** Apps Script (`Main`, `Hoja`, `Setup`, `Util`, `Semilla`) con token y acciones `config` (lee/escribe) y `hoy` (vacía); PWA con Hoy, Ajustes (URL + token, prueba de escritura, objetivos), service worker, iconos; workflow de Pages; 14 tests en verde; prueba en navegador contra API simulada sin errores.
