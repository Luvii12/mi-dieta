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
La IA devuelve JSON con el mismo formato que la semilla (`nombre`, `comida`, `preparacion`, `ingredientes_fijos`, `ingredientes_escalables`), usando solo `id` de la pestaña `alimentos`. Las cantidades son siempre para la **ración de referencia** (la del plan de Fran, `REFERENCIA_COMIDAS`), también cuando la receta es para otra persona: la app las escala después a cada uno (2026-10-19; antes se pedían para el objetivo de esa persona y se escalaban dos veces). El código:
1. Rechaza alimentos desconocidos o excluidos.
2. Ejecuta el optimizador; si no cuadra la comida dentro de tolerancia, la receta se descarta.
3. Guarda la receta con `origen = ia` y `activa = propuesta`; el usuario la revisa en Recetas y la añade o la descarta.

Si la IA necesita un alimento que no está en la tabla, lo declara en `alimentos_nuevos` (id, nombre, grupo, crudo/cocinado, **sin macros**). La propuesta queda «Falta alimento» hasta que el usuario lo añade con los valores de la etiqueta o de BEDCA; entonces pasa el optimizador como las demás. Máximo 2 alimentos nuevos por receta.

## Pedir recetas a la IA desde la app (sin Fran)
Recetas › «Pedir a la IA» (`web/pedir.js`, 2026-10-19): cada persona elige comida, cuántas (1–3) e idea; la app prepara el encargo (lo mismo que `recetas_ia.js pedido`, con sus excluidos y sus gustos, más un ejemplo del JSON) para **copiarlo o compartirlo** a su chat de IA (Claude, ChatGPT, Gemini; gratis, sin API ni servidor). Pega la respuesta tal cual (la app saca el JSON aunque venga en un bloque de código o con texto alrededor) y pulsa «Añadir a mis propuestas»: se valida con el optimizador y las que valen quedan en sus «Propuestas de la IA» para añadirlas o descartarlas. Si alguna no vale, «Copiar corrección para la IA» da el mensaje para pedírsela corregida. Lo escrito se guarda en el móvil por si Android cierra la app mientras está en el chat.

## Recetas propias (creadas en la app)
Cualquiera crea recetas en Recetas › «Crear receta», hace «Mi versión» de una de la biblioteca o edita las suyas (`web/editor.js`, motor en `web/motor/MisRecetas.js`). Decidido por Fran (2026-10-19):
- Pone los gramos de **una ración como la haría**. La app decide qué se ajusta: proteína, lácteos, hidratos y grasas son escalables entre **0,5 y 1,6 veces** lo que puso (las piezas, en unidades enteras); verduras y condimentos quedan fijos. Con las 22 semillas y gramos «a ojo» (±30–40 %) cuadra el 95 % de las veces.
- Se guarda a la **escala del plan de Fran** (dividiendo por el factor de ración de quien la crea, `factorRacion_`), como todas las recetas, para que a cada persona le salga su ración.
- Va a la **biblioteca común** (`origen = manual`, ids `R1, R2…`): puede salir en los planes de todos.
- Si no cuadra con el objetivo de su comida, **se puede guardar con un aviso** que dice qué cambiar («le falta proteína: añade claras…»): el día la compensa, aunque puede haber días «a revisar».
- «Mi versión» marca la original como «No repetiría» para quien la hace.
- Editar y borrar: solo quien la creó (la base lo impone; Fran es el creador de las 22 semillas). Al editar no se cambia la comida y se recalculan las comidas sin comer de los planes de quien edita. Borrar la deja en `activa = no`: los platos ya planificados se quedan.
- Si falta un alimento, se añade desde el buscador con los valores de su etiqueta (como en las propuestas de la IA).
