# Datos: tablas de Supabase

Desde M3 (2026-10-18) los datos están en **Supabase** (Postgres; esquema, reglas por fila y permisos en `supabase/esquema.sql`, puesta en marcha en `docs/SUPABASE.md`). Las tablas tienen las columnas de abajo, que son las que conoce el motor (`PESTANAS` en `web/motor/Util.js`), y además:
- **Comunes** (`alimentos`, `recetas`): `creado_por` y `creado`. Las leen y amplían todos; las cambia quien las creó o un administrador.
- **Personales** (el resto): `user_id`. Cada persona solo ve y cambia sus filas.

Fechas en ISO (`AAAA-MM-DD`). La app empezó con una hoja de Google (una pestaña por tabla, con estas mismas cabeceras); queda como copia de seguridad de los datos de Fran hasta el 18-10-2026 y ya no se lee ni se escribe.

## Tablas

### `config` (clave / valor)
`clave`, `valor` — p. ej. `objetivo_desayuno` (JSON `{"kcal":405,"P":24.9,"C":48.3,"G":11.6}`), igual para `almuerzo`, `merienda`, `cena`; `tolerancias` (JSON), `max_rep_desayuno`, `max_rep_merienda`, `dias_flexibles`, `kcal_minimas`, `comida_libre_semanal` (true/false; sin fila = true), `peso_objetivo` (kg o null). Desde M4, `perfil` (JSON `{nombre, sexo, nacimiento, altura_cm, peso_kg, trabajo, entreno, ejercicio, andar, meta, comidas}`; `entreno`: días de ejercicio (no, 1_2, 3_4, 5_mas); `ejercicio`: no / fuerza / cardio (sin él, fuerza); `andar`: true/false; lo escribe la acción `guardarPerfil`, que también pone los `objetivo_*`). `gramos_receta` (JSON `{receta_id: {alimento: g}}`): los gramos que la persona quiere siempre en una receta («Siempre en esta receta»; sin fila, ninguno). En `tolerancias.dia`, `P_exceso` (opcional, por defecto 15): cuánto % puede pasarse la proteína del día. Las comidas que hace cada persona son las que tienen `objetivo_*`: quien no desayuna o no merienda no tiene esa fila (el almuerzo y la cena, siempre). La tabla `perfiles` de Supabase no se usa: el motor solo conoce estas tablas.

### `alimentos`
`id`, `nombre`, `grupo` (proteina, carbohidrato, grasa, lacteo, fruta, verdura_condimento), `kcal_100`, `proteina_100`, `carbohidratos_100`, `grasa_100`, `gramos_por_unidad`, `estado` (crudo / cocinado), `fuente`, `verificado` (si/no), `codigo_barras`.
Carga inicial: `data/alimentos.csv` (valores aproximados, revisar contra BEDCA o etiqueta).

### `recetas`
`id`, `comida` (Desayuno, Almuerzo, Merienda, Cena), `nombre`, `preparacion`, `ingredientes_fijos` (JSON `[{"alimento","gramos"}]`), `ingredientes_escalables` (JSON `[{"alimento","min_g","max_g","unidad"}]`), `origen` (semilla / ia / manual: las creadas en la app, ids `R1, R2…`), `activa` (si / no / propuesta / descartada; borrar una receta la deja en `no`). Las propuestas de la IA esperan revisión; si necesitan un alimento que no está en `alimentos`, el ingrediente lleva `nuevo: {nombre, grupo, estado}` (se quita al aceptarla).
Carga inicial: `data/recetas_semilla.json`.

### `valoraciones`
`receta_id`, `valor` (me_encanta / normal / no_repetir), `fecha`.

### `preferencias`
`tipo` (excluido / alergia / favorito), `alimento_id`, `nota`.

### `planes`
`plan_id`, `inicio`, `fin`, `estado` (borrador / siguiente / activo / archivado; «siguiente» = ya activado, empieza al acabar el activo y pasa a activo ese día), `objetivos` (JSON copiado al crear), `creado`.

### `plan_comidas`
`plan_id`, `fecha`, `comida`, `receta_id`, `gramos` (JSON `{"alimento": g}`), `kcal`, `P`, `C`, `G`, `hecha` (si/no/libre/saltada; saltada = «No la he hecho»), `cambiada_por` (receta_id o vacío), `fijados` (JSON `{"alimento": g}` con los gramos que eligió la persona, o vacío; el resto de `gramos` lo calcula el optimizador y se respetan al recalcular).

### `pesos`
`fecha`, `peso_kg`, `cintura_cm`.

### `ajustes_historial`
`fecha`, `plan_id`, `ritmo_semanal_pct`, `adherencia_pct`, `propuesta_kcal`, `aceptada` (si/no).

## Acciones (`web/motor/Acciones.js`)
La PWA las ejecuta en el navegador (`llamar(accion)` en `web/api.js`): baja las tablas del usuario y las comunes, ejecuta la acción en memoria (`Memoria.js`) y guarda en Supabase solo las filas que cambian (`web/supabase.js`). La sesión de Supabase decide qué filas se ven.
- Uso diario: `config`, `recetas`, `hoy`, `plan` (activo, siguiente y borrador por días), `generarPlan` (borrador desde el lunes siguiente o, si hay activo, el día después de que acabe, u hoy si ya acabó; sustituye al borrador anterior), `activarPlan` (`plan_id`, `ajuste_kcal?`; el borrador que llega a su día de inicio sin plan en curso se activa solo, sin ajuste, en cualquier acción: `planesAlDia_`), `marcarComida` (`plan_id`, `fecha`, `comida`, `hecha`: si/no/libre/saltada; solo en el plan activo, y saltada solo hasta hoy), `alternativas` (`plan_id`, `fecha`, `comida`), `cambiarPlato` (`+ receta_id`; guarda la nueva en `cambiada_por` y recalcula gramos y macros con los `gramos_receta` de esa receta; las dos en el activo de hoy en adelante y en el siguiente y el borrador cualquier día), `ajustarGramos` (`plan_id`, `fecha`, `comida`, `gramos`: {alimento: g} elegidos, de 0 a 2.000, vacío = lo calculado; `siempre`; `probar`; mismos días que `cambiarPlato`: guarda `fijados` y recalcula el resto; con `siempre` guarda `gramos_receta` y lo aplica a las demás comidas con esa receta que quedan por comer, y al quitarlo las que tenían esos gramos vuelven a lo calculado; con `probar` devuelve `{comida, dia, objetivoDia}` sin guardar; si no, `{dia, gramos_receta}`), `valorar` (`receta_id`, `valor`).
- Progreso: `progreso` (pesos de 6 semanas con media de 7 días, cambio semanal, meta, bloque activo con adherencia, racha), `registrarPeso` (`peso_kg`, `fecha?`; uno por día), `alimentos`, `renombrarAlimento` (`id`, `nombre`), `guardarExcluidos` (`alimentos`: [ids]). `plan` devuelve también, en el borrador, `bloque` y `balance` (adherencia, ritmo y propuesta con 2 opciones). `activarPlan` con `ajuste_kcal` (una de las opciones) cambia los objetivos de config, recalcula los gramos del borrador (mismos platos) y lo apunta en `ajustes_historial`.
- Perfil (M4): `guardarPerfil` (`perfil`, `probar?`): valida el perfil, calcula los objetivos (`web/motor/Perfil.js`) y, sin `probar`, guarda `perfil` y los `objetivo_*` en config (a quien se da de alta, también la configuración inicial: tolerancias, `kcal_minimas`…) y el peso como pesaje de hoy; si cambian las comidas que hace (`perfil.comidas`: el desayuno y la merienda son opcionales), borra los `objetivo_*` que sobran y adapta desde mañana el activo, el siguiente y el borrador (quita o añade esas comidas y recalcula gramos). Devuelve `{perfil, calculo, config, comidas_cambiadas}`. `recetas`, el generador y `pedidoRecetas` solo usan las comidas que hace la persona. El primer plan de quien tiene perfil y aún no tiene planes empieza mañana. Las recetas en `propuesta`/`descartada` solo las ve quien las creó (`web/supabase.js`).
- Generación automática (M5): `revisarFinDePlan`. La PWA la pide al abrirse, una vez al día: si al plan activo le quedan 2 días o menos (o ya terminó) y no hay borrador ni siguiente, genera el borrador.
- Recetas propias (`MisRecetas.js`): `guardarReceta` (`receta: {id?, comida, nombre, preparacion, ingredientes: [{alimento, gramos}]}`, `version_de?`, `probar?` → `{id, nombre, comida, ajuste, aviso}`; sin `probar` la guarda nueva o cambia la propia y recalcula sus comidas del plan con ella desde hoy; `version_de` valora la original «No repetiría»), `borrarReceta` (`receta_id`). Qué recetas puede editar cada cuenta lo dice `recetasPropias` de `web/supabase.js` (`creado_por`), no el motor. `alimentos` devuelve también `unidad` (gramos por unidad).
- Recetas con IA (Fase 5, `RecetasIA.js`): `propuestas`, `pedidoRecetas` (`comida`, `cantidad?`, `idea?` → instrucciones, mensaje y esquema para escribir recetas en Claude Code, y `encargo`: todo junto con un ejemplo del formato, para pegarlo en un chat), `importarPropuestas` (`comida`, `recetas` o `texto` (la respuesta del chat pegada tal cual), `probar?`: valida y, sin `probar`, guarda como propuestas; con descartadas devuelve `correccion`, el mensaje para que el chat las corrija), `aceptarPropuesta` / `descartarPropuesta` (`receta_id`), `anadirAlimento` (`alimento`: valores por 100 g que mete el usuario; `fuente` = usuario, `verificado` = si). Sin API de Claude (la versión con API está en el commit `3fb63e7`).

## Frontend (PWA)
- `manifest.json` + service worker para instalar y abrir sin conexión (cada pantalla pinta primero lo último guardado).
- En `localStorage` (siempre con try/catch y solo claves `dieta.`: el dominio se comparte con la app del gimnasio) van la sesión y una copia de lo último visto. Los datos reales viven en Supabase.
