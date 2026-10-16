# App de dieta personal — contexto para Claude Code

## Qué es
App personal (un solo usuario, Fran) instalada en el móvil Android como PWA. Su trabajo principal es **generar automáticamente cada 2 semanas un plan de dieta de 14 días** con platos apetecibles que cumplan unos objetivos de calorías y macros, y registrar el progreso (peso y adherencia) para ajustar el siguiente plan.

El usuario venía de un entrenador personal que le daba dietas en PDF. La app las sustituye: mantiene sus objetivos nutricionales pero cambia los platos por otros más ricos y variados.

## Fuera de alcance por ahora
- **Chat con IA**: se hará más adelante, cuando la app funcione. No implementarlo.
- Login y multiusuario: no hacen falta.
- Imágenes de platos, lista de la compra y recordatorios: fases finales.

## Decisiones ya tomadas (no cambiar sin preguntar)
| Tema | Decisión |
| --- | --- |
| Plataforma | PWA en **GitHub Pages**, interfaz en **español**, pensada para móvil |
| Independencia | **App separada**: su propio repositorio, hoja de Google y Apps Script. No tocar, integrar ni reutilizar la app de fitness/rutinas que el usuario ya tiene |
| Datos | **Google Sheets** (una pestaña por tabla), sin base de datos de pago |
| Servidor | **Google Apps Script** publicado como web app; la PWA solo habla con él |
| Acceso | Sin login: token secreto en cada petición, guardado en las propiedades del script |
| Secretos | La clave de la API de Claude **nunca** va en el repo ni en el frontend (GitHub Pages es público) |
| Generación | **Híbrida**: platos de una biblioteca de recetas (más adelante propuestos por IA) + **gramos calculados por código** con un optimizador. La IA nunca da valores nutricionales |
| Macros | Siempre calculados en código a partir de la pestaña `alimentos` |
| Referencia | Dieta «Ajustes Fran. Déficit»: ~1.655 kcal/día (ver `docs/NUTRICION.md`). Es provisional y configurable |

## Documentación
- `docs/PROGRESO.md` — estado del proyecto y decisiones: **leer primero en cada sesión**.
- `docs/SPEC.md` — funcionalidades, pantallas y flujo de generación.
- `docs/NUTRICION.md` — objetivos, tolerancias, reglas de ajuste quincenal, intercambios.
- `docs/DATOS.md` — esquema de Google Sheets (pestañas y columnas) y endpoints de Apps Script.
- `docs/RECETAS.md` — modelo de receta (ingredientes fijos y escalables) y criterios de los platos.
- `docs/FASES.md` — orden de desarrollo y criterios de «terminado».
- `data/alimentos.csv` — tabla de alimentos inicial (valores **aproximados**, `verificado = no`).
- `data/recetas_semilla.json` — 22 recetas probadas con el optimizador y sus macros de prueba.
- `prototipo/` — prototipo en Python que ya funciona: `semana.py` (optimizador de gramos con mínimos cuadrados acotados) y `dietas_entrenador.py` (cálculo de macros de las dietas originales). Úsalo como referencia y para tests de regresión: el port a JS debe dar resultados equivalentes.

## Reglas de trabajo
1. Trabaja **por fases** (`docs/FASES.md`) y para al terminar cada una para que el usuario pruebe en el móvil.
2. Antes de escribir código de una fase, propone la estructura y espera confirmación si hay decisiones abiertas.
3. Tests obligatorios para: cálculo de macros, optimizador de gramos, redondeos, tolerancias y regla de ajuste quincenal.
4. Nada de macros inventados: si un alimento no está en `alimentos`, el plan no se genera y se avisa.
5. Pesos: distinguir siempre crudo/seco frente a cocinado (columna `estado`).
6. Código simple y sin dependencias pesadas; el usuario no es programador profesional.
7. Textos de la app en español de España; unidades en gramos y ml.
8. **No instales skills, plugins, servidores MCP ni dependencias nuevas sin pedirme confirmación**, enseñándome antes el repositorio, qué hace y su licencia. Nunca uses flags que salten la confirmación (`-y`, `--yes`).
9. **Memoria entre sesiones: `docs/PROGRESO.md`.** Léelo al empezar cada sesión. Al terminar una tarea o antes de `/clear`, actualízalo: fase actual, qué se hizo, decisiones tomadas (con fecha) y siguiente paso. Mantenlo corto: resume lo antiguo en lugar de acumular.
