# Progreso del proyecto

> Memoria entre sesiones. Claude Code lo lee al empezar y lo actualiza al terminar cada tarea o antes de `/clear`. Mantenerlo por debajo de ~80 líneas: resumir lo antiguo.

## Estado actual
- **Fase:** 0 · Esqueleto — código local hecho y probado; falta la parte en la nube.
- **Hecho en la nube:** hoja «Dieta» y script vinculado creados con clasp (IDs en `.clasp.json`); código subido con `clasp push --force` (autorizado por el usuario, para sobrescribir el manifiesto con zona Europe/Madrid).
- **Siguiente paso:** el usuario ejecuta `configurarHoja` y `crearToken` en el editor, publica el web app y crea el repo de GitHub (ver `docs/DESPLIEGUE.md`); luego commit + push y prueba en el móvil.

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
| 2026-10-16 | Datos iniciales: `scripts/generar_semilla.js` genera `apps-script/Semilla.js`; `configurarHoja()` carga solo en pestañas vacías. `nombre` de alimentos generado desde el `id` (el CSV no lo traía); `codigo_barras` vacío |

## Preguntas abiertas
- Valores de `data/alimentos.csv` sin verificar (aproximados).
- El usuario está probando la semana de prueba (22 recetas); sus valoraciones decidirán qué recetas se quedan.

## Hecho
- **2026-10-16 · Fase 0 (local):** Apps Script (`Main`, `Hoja`, `Setup`, `Util`, `Semilla`) con token y acciones `config` (lee/escribe) y `hoy` (vacía); PWA con Hoy, Ajustes (URL + token, prueba de escritura, objetivos), service worker, iconos; workflow de Pages; 14 tests en verde; prueba en navegador contra API simulada sin errores.
