# Recetas

## Principio
Los macros los ponen pocos ingredientes (proteína, carbohidrato, grasa principal); el sabor lo ponen especias, hierbas, ácidos, aromáticos, salsas ligeras y técnica (horno, plancha fuerte, freidora de aire). Por eso cada receta separa:

- **Ingredientes escalables**: los que el optimizador ajusta, con límites realistas (`min_g`, `max_g`). Ej.: pollo 120–200 g, arroz 50–90 g, aceite 3–15 ml.
- **Ingredientes fijos**: dan sabor y textura; cuentan en los macros pero no se escalan. Ej.: 60 g yogur para el curry, 150 g tomate triturado.
- Especias, hierbas, ajo, limón, vinagre, café: se citan en la preparación y no se cuentan.

## Criterios de una buena receta
- Que apetezca: platos reconocibles (fajitas, poke, boloñesa, pulpo a la gallega, pizza, tacos, tortilla), no «pechuga con brócoli».
- Cocina española y de otros países, con ingredientes de supermercado español (Mercadona).
- Preparación de ≤ 25 min entre semana; algo más el fin de semana.
- El aceite siempre medido.
- Versiones ligeras: yogur o queso batido en lugar de nata, carne picada 5 %, freidora de aire, mozzarella light.

## Semilla
`data/recetas_semilla.json` contiene 22 recetas ya probadas (4 desayunos, 4 meriendas, 7 almuerzos, 7 cenas) con sus límites y los gramos que dio el optimizador. Una semana de prueba con ellas quedó dentro de ±3 % kcal y ±4 % proteína cada día.

El usuario las está probando y puntuando. Las puntuaciones decidirán qué recetas se quedan.

## Recetas generadas por IA (Fase 5)
La IA devuelve JSON con el mismo formato que la semilla (`nombre`, `comida`, `preparacion`, `ingredientes_fijos`, `ingredientes_escalables`), usando solo `id` de la pestaña `alimentos`. El código:
1. Rechaza alimentos desconocidos o excluidos.
2. Ejecuta el optimizador; si no cuadra la comida dentro de tolerancia, la receta se descarta.
3. Guarda la receta con `origen = ia` y `activa = propuesta`; el usuario la revisa en Recetas y la añade o la descarta.

Si la IA necesita un alimento que no está en la tabla, lo declara en `alimentos_nuevos` (id, nombre, grupo, crudo/cocinado, **sin macros**). La propuesta queda «Falta alimento» hasta que el usuario lo añade con los valores de la etiqueta o de BEDCA; entonces pasa el optimizador como las demás. Máximo 2 alimentos nuevos por receta.
