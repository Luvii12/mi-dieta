# Especificación funcional

## Objetivo
Generar cada 14 días un plan con 4 comidas diarias (desayuno, almuerzo, merienda, cena) que cumpla los objetivos de `NUTRICION.md`, con platos variados y apetecibles, y ajustar los objetivos según el progreso.

## Pantallas (móvil primero)
1. **Hoy**: las 4 comidas del día con nombre del plato, ingredientes en gramos, macros de cada comida y total del día frente al objetivo. Botón para marcar cada comida como hecha y botón «cambiar plato».
2. **Plan**: los 14 días del bloque actual, navegables por día.
3. **Receta**: ingredientes (escalables en negrita, fijos aparte), preparación y valoración (Me encanta / Normal / No lo repetiría).
4. **Progreso**: registro de peso (fecha, kg, opcional cintura), gráfica con la media móvil de 7 días y adherencia del bloque.
5. **Ajustes**: objetivos por comida, tolerancias, alimentos excluidos, favoritos, días flexibles, número de repeticiones permitidas.
6. **Nuevo plan**: resumen del bloque que termina (peso, adherencia), propuesta de ajuste de calorías (aceptar / rechazar) y borrador del siguiente plan para revisar y activar.

## Flujo de generación de un plan de 14 días
1. Leer objetivos por comida, preferencias, exclusiones, valoraciones y los platos de los 2 últimos planes.
2. Para cada día y comida, elegir una receta de la biblioteca:
   - Desayunos y meriendas pueden rotar (máximo 4 veces cada receta en 14 días).
   - Almuerzos y cenas: sin repetir en el bloque si hay recetas suficientes; si no, máximo 2 veces y nunca en días consecutivos.
   - Peso de selección: «Me encanta» ×3, «Normal» ×1, «No lo repetiría» excluida. Penalizar recetas usadas en el plan anterior.
   - Nunca usar recetas con alimentos excluidos o alérgenos (filtro duro en código).
3. Ajustar los gramos de los ingredientes escalables con el optimizador para cuadrar los macros de esa comida.
4. Redondear (5 g, 5 ml de aceite o piezas enteras) y recalcular macros.
5. Validar el día completo con las tolerancias. Si un día falla, probar otra combinación de recetas (máx. 20 intentos) y, si sigue fallando, marcarlo para revisión.
6. Guardar como **borrador**; el usuario lo revisa y lo activa.

## Automatización
- Activador temporal de Apps Script: 2 días antes de terminar el plan activo, calcula el progreso, propone el ajuste y genera el borrador.
- Botón manual «Generar nuevo plan» en cualquier momento.

## Fases posteriores (no ahora)
- IA (API de Claude) que propone recetas nuevas en JSON con ingredientes fijos/escalables; el código las valida y calcula.
- Chat de dudas.
- Fotos de platos, lista de la compra agregada de 14 días, recordatorios.
