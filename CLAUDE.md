# App de dieta personal — contexto para Claude Code

## Qué es
App personal (un solo usuario, Fran) instalada en el móvil Android como PWA. Su trabajo principal es **generar automáticamente cada 2 semanas un plan de dieta de 14 días** con platos apetecibles que cumplan unos objetivos de calorías y macros, y registrar el progreso (peso y adherencia) para ajustar el siguiente plan.

El usuario venía de un entrenador personal que le daba dietas en PDF. La app las sustituye: mantiene sus objetivos nutricionales pero cambia los platos por otros más ricos y variados.

## Fuera de alcance por ahora
- **Chat con IA**: se hará más adelante, cuando la app funcione. No implementarlo.
- ~~Login y multiusuario~~: ahora sí, en migración (2026-10-18, ver `docs/PLAN_MULTIUSUARIO.md`).
- Imágenes de platos, lista de la compra y recordatorios: fases finales.

## Decisiones ya tomadas (no cambiar sin preguntar)
| Tema | Decisión |
| --- | --- |
| Plataforma | PWA en **GitHub Pages**, interfaz en **español**, pensada para móvil |
| Independencia | **App separada**: su propio repositorio y su propio Supabase. No tocar, integrar ni reutilizar la app de fitness/rutinas que el usuario ya tiene |
| Datos | **Supabase gratis** desde M3 (2026-10-18; `docs/PLAN_MULTIUSUARIO.md`, `docs/SUPABASE.md`). La hoja de Google queda como copia de seguridad: no se escribe en ella |
| Servidor | Ninguno propio: la PWA habla con Supabase por `fetch` y ejecuta el motor en el navegador (también la generación automática del siguiente plan, al abrirla). Apps Script retirado en M6 (en el historial de git) |
| Acceso | Email y contraseña (Supabase Auth), registro cerrado: altas con `npm run invitar` (contraseña temporal que se cambia en Ajustes); reglas por fila (RLS) |
| Secretos | La clave de la API de Claude **nunca** va en el repo ni en el frontend (GitHub Pages es público) |
| Generación | **Híbrida**: platos de una biblioteca de recetas (más adelante propuestos por IA) + **gramos calculados por código** con un optimizador. La IA nunca da valores nutricionales |
| Macros | Siempre calculados en código a partir de la tabla `alimentos` |
| Referencia | Dieta «Ajustes Fran. Déficit»: ~1.655 kcal/día (ver `docs/NUTRICION.md`). Es provisional y configurable |

## Documentación
- `docs/PROGRESO.md` — estado del proyecto y decisiones: **leer primero en cada sesión**.
- `docs/SPEC.md` — funcionalidades, pantallas y flujo de generación.
- `docs/NUTRICION.md` — objetivos, tolerancias, reglas de ajuste quincenal, intercambios.
- `docs/DATOS.md` — tablas (columnas) y acciones del motor.
- `docs/SUPABASE.md` — proyecto Supabase, cuentas, clave secreta y altas. `docs/DESPLIEGUE.md` — publicar y probar. `docs/INSTALAR.md` — guía para quien empieza a usar la app.
- `docs/RECETAS.md` — modelo de receta (ingredientes fijos y escalables) y criterios de los platos.
- `docs/FASES.md` — orden de desarrollo y criterios de «terminado».
- `data/alimentos.csv` — tabla de alimentos inicial (valores **aproximados**, `verificado = no`).
- `data/recetas_semilla.json` — 22 recetas probadas con el optimizador y sus macros de prueba. `data/semilla.js` se genera de los dos con `npm run semilla` (lo usan los tests y los scripts).
- `web/` — PWA sin build: `app.js` (navegación), `comun.js` (utilidades), `datos.js` (copia local + acciones), `api.js` (sesión y `llamar(accion)`), `supabase.js` (Auth y REST por `fetch`, guarda solo las filas cambiadas), `conexion.js` (URL y clave pública de Supabase), una pantalla por archivo (`entrar.js`, `perfil.js` (alta y Mi objetivo), `hoy.js`, `plan.js`, `recetas.js`, `receta.js`, `editor.js` (crear, mi versión y editar recetas), `cambiar.js`, `ajustes.js`). Al cambiar algo de `web/`, subir `VERSION` en `sw.js` y añadir archivos nuevos a su lista. `web/package.json` (`type: module`) y `web/motor/package.json` (`commonjs`) solo sirven para Node.
- `web/motor/` — motor (desde M1): `Acciones.js` (lo que hace cada petición), `Nutricion` (incluye el escalado de raciones), `Perfil` (objetivos según el perfil), `Generador`, `Planes`, `Progreso`, `RecetasIA`, `MisRecetas` (recetas creadas en la app), `Util` y `Memoria.js` (el almacén: las tablas del usuario en memoria). Solo JavaScript estándar. La PWA lo carga con `<script>` y ejecuta las acciones en el navegador sobre Supabase; `tests/acciones.test.js` prueba las acciones, `tests/supabase.test.js` exige que con Supabase den lo mismo que el motor solo, y `tests/motor_navegador.js` lo carga en Node (también para los scripts y `npm run servidor`).
- `prototipo/` — prototipo en Python que ya funciona: `semana.py` (optimizador de gramos con mínimos cuadrados acotados) y `dietas_entrenador.py` (cálculo de macros de las dietas originales). Úsalo como referencia y para tests de regresión: el port a JS debe dar resultados equivalentes.

## Diseño de la interfaz (desde la Fase 3)
**Fuente de verdad:** `design/<pantalla>/screen.png` (cómo se ve) + `design/<pantalla>/code.html` (estructura y clases) + `design/mediterranean_culinary/DESIGN.md` (colores, tipografía, radios, espaciados). El **estilo visual** se sigue fielmente (colores, tipografía, componentes, espaciado, estructura de cada pantalla): no rediseñar ni «mejorar». Pero los **botones y datos de las capturas son orientativos**: solo se implementa lo que tiene datos o función real y aporta; lo demás se omite (nada de botones decorativos ni de «Próximamente»). Prioridad: no sobrecargar la app. Ante la duda sobre un elemento, preguntar.

Decidido (2026-10-16): sin fotos de platos hasta la Fase 6 (en su hueco, tesela de color con el icono de la comida); sin horas de comida; sin lista de la compra, «Reordenar», favorito/compartir, tiempo/dificultad, consejo de saciedad, avatar ni versión.

| Pantalla de la app | Carpeta de `design/` | Fase |
| --- | --- | --- |
| Hoy (claro / oscuro) | `mi_dieta_hoy_modo_claro`, `mi_dieta_hoy_modo_oscuro` | 3 |
| Plan (14 días) | `mi_dieta_plan_14_d_as` | 3 |
| Receta | `mi_dieta_receta_pollo_al_curry` | 3 |
| Recetas (biblioteca) | — sin diseño: mismas tarjetas que Plan | 3 |
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
6. **Comprobar** en el navegador a ancho de móvil (390 px, claro y oscuro) comparando con `screen.png`. Se puede probar sin red con `npm run servidor` (`scripts/servidor_local.js`: Supabase falsa en memoria, `tests/supabase_falso.js`, en el puerto siguiente; entrar con `prueba@mi-dieta.test` / `prueba`; plan activo que incluye hoy; `-- real` usa el Supabase de verdad), y Playwright está en la caché de `npx` (`~/.npm/_npx/*/node_modules/playwright`; lanzar con `executablePath` = `~/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`, porque esa versión de Playwright busca la 1247).

`awesome-design-md` (VoltAgent) **no se usa**: es un catálogo de estilos de otras marcas y esta app ya tiene su propio `DESIGN.md`.

## Recetas nuevas con IA (Fase 5): las escribe Claude Code
Cuando Fran pida recetas nuevas («propón 3 cenas mexicanas»), las escribe Claude Code dentro de su suscripción; **no se usa la API de Claude** (se paga aparte; la versión con API está en git, commit `3fb63e7`). Pasos:
1. `node scripts/recetas_ia.js pedido <Comida> [cantidad] [idea]` → instrucciones, tabla de alimentos, objetivo, recetas existentes y valoraciones (lo da Supabase con la cuenta real de Fran: `"cuenta"` en `.supabase.local.json`, fuera del repo). Si son para otra persona (su hermano, su novia), añadir `--para <email>` en los tres pasos: entra como ella con `"clave_secreta"` (`docs/SUPABASE.md` §9) y usa su objetivo, sus excluidos y sus valoraciones.
2. Escribir las recetas en un JSON del scratchpad con el formato del esquema (`nombre`, `preparacion`, `ingredientes_fijos`, `ingredientes_escalables`, `alimentos_nuevos`) siguiendo esas instrucciones. Nunca macros.
3. `node scripts/recetas_ia.js probar <Comida> <archivo>` → gramos y macros, o por qué se descarta. Corregir y repetir hasta que valgan.
4. Enseñar a Fran las recetas (nombre, idea, macros) y, con su visto bueno, `enviar`: quedan como propuestas en la pestaña Recetas de quien las pidió (o de la persona de `--para`) para que las acepte o descarte en el móvil (y meta los macros de los alimentos nuevos). Al aceptarlas pasan a la biblioteca común.

## Skill «dietista» (fuera del repo)
Agente dietista de Fran como skill de claude.ai (móvil, web y Claude Code): fuente en `~/Escritorio/claude/dietista/dietista/`, se sube como `dietista.zip` con `SKILL.md` y `references/` en la **raíz** del zip (`cd …/dietista/dietista && zip -r ../dietista.zip SKILL.md references`); si van dentro de una carpeta, claude.ai lo rechaza. Copia `NUTRICION.md`, las instrucciones de `web/motor/RecetasIA.js` y los ids de `data/alimentos.csv`: si cambian objetivos, reglas de ajuste, tolerancias o el formato de recetas, actualizar también la skill, regenerar el zip y avisar a Fran de que lo vuelva a subir.

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
