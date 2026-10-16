# Datos: Google Sheets + Apps Script

Un único archivo de Google Sheets. Cada pestaña es una tabla; la primera fila son las cabeceras exactas indicadas aquí. Fechas en ISO (`AAAA-MM-DD`).

## Pestañas

### `config` (clave / valor)
`clave`, `valor` — p. ej. `objetivo_desayuno` (JSON `{"kcal":405,"P":24.9,"C":48.3,"G":11.6}`), igual para `almuerzo`, `merienda`, `cena`; `tolerancias` (JSON), `max_rep_desayuno`, `max_rep_merienda`, `dias_flexibles`, `kcal_minimas`, `comida_libre_semanal` (true/false; sin fila = true), `peso_objetivo` (kg o null).

### `alimentos`
`id`, `nombre`, `grupo` (proteina, carbohidrato, grasa, lacteo, fruta, verdura_condimento), `kcal_100`, `proteina_100`, `carbohidratos_100`, `grasa_100`, `gramos_por_unidad`, `estado` (crudo / cocinado), `fuente`, `verificado` (si/no), `codigo_barras`.
Carga inicial: `data/alimentos.csv` (valores aproximados, revisar contra BEDCA o etiqueta).

### `recetas`
`id`, `comida` (Desayuno, Almuerzo, Merienda, Cena), `nombre`, `preparacion`, `ingredientes_fijos` (JSON `[{"alimento","gramos"}]`), `ingredientes_escalables` (JSON `[{"alimento","min_g","max_g","unidad"}]`), `origen` (semilla / ia / manual), `activa` (si/no).
Carga inicial: `data/recetas_semilla.json`.

### `valoraciones`
`receta_id`, `valor` (me_encanta / normal / no_repetir), `fecha`.

### `preferencias`
`tipo` (excluido / alergia / favorito), `alimento_id`, `nota`.

### `planes`
`plan_id`, `inicio`, `fin`, `estado` (borrador / siguiente / activo / archivado; «siguiente» = ya activado, empieza al acabar el activo y pasa a activo ese día), `objetivos` (JSON copiado al crear), `creado`.

### `plan_comidas`
`plan_id`, `fecha`, `comida`, `receta_id`, `gramos` (JSON `{"alimento": g}`), `kcal`, `P`, `C`, `G`, `hecha` (si/no/libre), `cambiada_por` (receta_id o vacío).

### `pesos`
`fecha`, `peso_kg`, `cintura_cm`.

### `ajustes_historial`
`fecha`, `plan_id`, `ritmo_semanal_pct`, `adherencia_pct`, `propuesta_kcal`, `aceptada` (si/no).

## Apps Script (web app)
- `doGet` / `doPost` con parámetro `accion`; todas las peticiones llevan `token` y se rechazan si no coincide con `PropertiesService` (`APP_TOKEN`).
- Acciones hechas: `config`, `recetas` (Fase 1), `hoy`, `plan` (activo + borrador por días), `generarPlan` (borrador desde el lunes siguiente o al acabar el activo; sustituye al borrador anterior), `activarPlan` (`plan_id`; el activo anterior pasa a archivado) (Fase 2); `marcarComida` (`plan_id`, `fecha`, `comida`, `hecha`: si/no/libre), `alternativas` (`plan_id`, `fecha`, `comida`), `cambiarPlato` (`+ receta_id`; guarda la nueva en `cambiada_por` y recalcula gramos y macros), `valorar` (`receta_id`, `valor`) (Fase 3).
- Fase 4: `progreso` (pesos de 6 semanas con media de 7 días, cambio semanal, meta, bloque activo con adherencia, racha), `registrarPeso` (`peso_kg`, `fecha?`; uno por día), `alimentos`, `renombrarAlimento` (`id`, `nombre`), `guardarExcluidos` (`alimentos`: [ids]). `plan` devuelve también `siguiente` y, en el borrador, `bloque` y `balance` (adherencia, ritmo y propuesta con 2 opciones). `activarPlan` acepta `ajuste_kcal` (una de las opciones): cambia los objetivos de config, recalcula los gramos del borrador (mismos platos) y lo apunta en `ajustes_historial`.
- La generación vive en Apps Script (V8). Respetar el límite de tiempo por ejecución; si hace falta, generar por semanas.
- Activador temporal diario (`revisarFinDePlan`, se instala ejecutando `instalarActivador()` en el editor): si faltan 2 días o menos para el fin del plan activo y no hay borrador ni siguiente, genera el borrador.
- Más adelante: `ANTHROPIC_API_KEY` en propiedades del script, llamada con `UrlFetchApp`.

## Frontend (PWA)
- `manifest.json` + service worker para instalar y abrir sin conexión (último plan en caché).
- La URL de Apps Script y el token se introducen una vez en Ajustes y se guardan en `localStorage` (envolver en try/catch). Los datos reales viven en Sheets.
