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
- `web/` — PWA sin build: `app.js` (navegación), `comun.js` (utilidades), `datos.js` (copia local + acciones), una pantalla por archivo (`hoy.js`, `plan.js`, `receta.js`, `cambiar.js`, `ajustes.js`). Al cambiar algo de `web/`, subir `VERSION` en `sw.js` y añadir archivos nuevos a su lista.
- `prototipo/` — prototipo en Python que ya funciona: `semana.py` (optimizador de gramos con mínimos cuadrados acotados) y `dietas_entrenador.py` (cálculo de macros de las dietas originales). Úsalo como referencia y para tests de regresión: el port a JS debe dar resultados equivalentes.

## Diseño de la interfaz (desde la Fase 3)
**Fuente de verdad:** `design/<pantalla>/screen.png` (cómo se ve) + `design/<pantalla>/code.html` (estructura y clases) + `design/mediterranean_culinary/DESIGN.md` (colores, tipografía, radios, espaciados). El **estilo visual** se sigue fielmente (colores, tipografía, componentes, espaciado, estructura de cada pantalla): no rediseñar ni «mejorar». Pero los **botones y datos de las capturas son orientativos**: solo se implementa lo que tiene datos o función real y aporta; lo demás se omite (nada de botones decorativos ni de «Próximamente»). Prioridad: no sobrecargar la app. Ante la duda sobre un elemento, preguntar.

Decidido (2026-10-16): sin fotos de platos hasta la Fase 6 (en su hueco, tesela de color con el icono de la comida); sin horas de comida; sin lista de la compra, «Reordenar», favorito/compartir, tiempo/dificultad, consejo de saciedad, avatar ni versión.

| Pantalla de la app | Carpeta de `design/` | Fase |
| --- | --- | --- |
| Hoy (claro / oscuro) | `mi_dieta_hoy_modo_claro`, `mi_dieta_hoy_modo_oscuro` | 3 |
| Plan (14 días) | `mi_dieta_plan_14_d_as` | 3 |
| Receta | `mi_dieta_receta_pollo_al_curry` | 3 |
| Ajustes | `mi_dieta_ajustes` | 3 |
| Progreso | `mi_dieta_progreso` | 4 |
| Nuevo plan | `mi_dieta_nuevo_plan_fin_de_bloque` | 4 |

**Cómo implementar cada pantalla (en este orden):**
1. **Mirar** `screen.png` (con Read) y leer su `code.html` antes de escribir nada.
2. **Extraer** de la captura, sin adivinar (reglas adaptadas de la skill `image-to-code` de Leonxlnx/taste-skill, MIT; aquí **nunca se generan imágenes nuevas**):
   - **Textos:** títulos, etiquetas, botones y menús tal como aparecen (cambiando solo los datos de ejemplo por datos reales).
   - **Tipografía:** tamaños relativos, pesos, interlineado, mayúsculas/espaciado de letras; Plus Jakarta Sans.
   - **Espaciado:** márgenes laterales, separación entre bloques, relleno de tarjetas y botones, ritmo vertical. No compactar lo que en el diseño es amplio.
   - **Componentes:** forma, radio, relleno o contorno, iconos (Material Symbols), insignias, separadores, sombras, barras de progreso, barra de navegación inferior.
   - **Color:** siempre con los tokens de `DESIGN.md` (fondo, superficies, primario, secundario, texto, bordes), en claro y oscuro.
3. **Traducir** `code.html` a HTML/CSS propio en `web/`: **sin Tailwind ni otros CDN de JS**; los tokens de `DESIGN.md` como variables CSS en `estilos.css`. Google Fonts (Plus Jakarta Sans y Material Symbols) sí, cacheadas por el service worker para que funcione sin conexión.
4. **Fidelidad (anti-deriva):** el resultado debe parecer la misma pantalla que `screen.png` (quitando los elementos omitidos). No sustituir secciones por filas genéricas, no aplanar la jerarquía tipográfica, no añadir cajas dentro de cajas que no estén en el diseño. Solo si la captura no aclara un detalle (un estado vacío, un error, un texto largo), resolverlo con el estilo de lo que ya existe.
5. **Revisar a mano** los archivos de `web/` que se han tocado (la skill `web-design-guidelines` no se instala) y corregir sin cambiar el aspecto visual: foco visible (`:focus-visible`), objetivos táctiles ≥ 44 px, `aria-label` en botones con solo icono, iconos decorativos con `aria-hidden`, estados con `aria-pressed`/`aria-current`, `role="status"` en mensajes, contraste y modo oscuro, `prefers-reduced-motion`.
6. **Comprobar** en el navegador a ancho de móvil (390 px, claro y oscuro) comparando con `screen.png`. Se puede probar sin Google con `npm run servidor` (`scripts/servidor_local.js`: Apps Script real sobre una hoja en memoria, con un plan activo que incluye hoy), y Playwright está en la caché de `npx` (Chromium en `~/.cache/ms-playwright/chromium-1248`).

`awesome-design-md` (VoltAgent) **no se usa**: es un catálogo de estilos de otras marcas y esta app ya tiene su propio `DESIGN.md`.

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
