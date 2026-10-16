# Fases de desarrollo

Cada fase termina con algo usable en el móvil. Parar al final de cada una.

## Fase 0 · Esqueleto
- Repo con PWA mínima (HTML/JS o Vite) desplegada en GitHub Pages.
- Hoja de Google Sheets con todas las pestañas de `DATOS.md`; cargar `alimentos.csv` y `recetas_semilla.json`.
- Apps Script con token y acciones `config` y `hoy` (vacía).
- **Hecho cuando**: la app se instala en Android, se conecta con URL + token y lee/escribe una fila.

## Fase 1 · Motor nutricional
- Cálculo de macros y optimizador de gramos en JS (Apps Script), con redondeos.
- Tests comparando con `macros_prueba` de `recetas_semilla.json` (diferencia ≤ 2 % kcal).
- **Hecho cuando**: dada una receta y un objetivo, devuelve gramos y macros correctos.

## Fase 2 · Generador de 14 días
- Selección de recetas con rotación, exclusiones y valoraciones; validación de tolerancias diarias.
- Guardar borrador en `planes` y `plan_comidas`; activar plan.
- **Hecho cuando**: se genera un plan de 14 días que cumple tolerancias todos los días y sin alimentos excluidos.

## Fase 3 · Pantallas de uso diario
- Hoy, Plan, Receta; marcar comida hecha / libre; cambiar plato (otra receta de la misma comida, reoptimizada); valorar.
- **Hecho cuando**: el usuario sigue un día completo desde el móvil.

## Fase 4 · Progreso y ajuste quincenal
- Registro de peso, gráfica con media de 7 días, adherencia.
- Regla de ajuste de `NUTRICION.md`, propuesta aceptable/rechazable, historial.
- Activador automático 2 días antes del fin del plan.
- Edición en Ajustes: objetivos por comida, alimentos excluidos y nombres de alimentos.
- **Hecho cuando**: al acabar un bloque se genera solo el borrador siguiente con la propuesta de ajuste.

## Fase 5 · Recetas con IA
- Llamada a la API de Claude desde Apps Script para proponer recetas nuevas (JSON validado).
- **Hecho cuando**: la biblioteca crece con recetas IA que pasan el optimizador.

## Fase 6 · Extras
Fotos de platos, lista de la compra, recordatorios, exportar datos, chat.
