# Lógica nutricional

## Objetivo de referencia (provisional, editable en Ajustes)
Sale de sumar los menús de la dieta «Ajustes Fran. Déficit» del entrenador. El PDF declaraba 1.900 kcal (P159 · C189 · G50), pero sus menús suman ~1.655 kcal; se usa lo que suman los menús porque es lo que el usuario ha comido mientras bajaba de peso.

| Comida | kcal | Proteína (g) | Carbohidratos (g) | Grasa (g) |
| --- | --- | --- | --- | --- |
| Desayuno | 405 | 24.9 | 48.3 | 11.6 |
| Almuerzo | 542 | 41.1 | 48.0 | 20.0 |
| Merienda | 335 | 30.9 | 33.8 | 8.7 |
| Cena | 373 | 34.9 | 29.1 | 12.3 |
| **Día** | **1.655** | **131.8** | **159.2** | **52.6** |

Conversión: proteína y carbohidratos 4 kcal/g, grasa 9 kcal/g. Las kcal se calculan desde la tabla de alimentos, no desde los macros.

## Tolerancias
| Nivel | kcal | Proteína | Carbohidratos | Grasa |
| --- | --- | --- | --- | --- |
| Día | ±5 % | ±5 % (nunca < objetivo − 10 g) | ±10 % | ±10 % |
| Comida | ±12 % | ±15 % | ±15 % | ±20 % |

## Optimizador de gramos
- Variables: gramos de los ingredientes **escalables** de la receta, cada uno con `min_g`/`max_g`.
- Los ingredientes **fijos** se suman como constante.
- Minimizar el error relativo en P, C, G y kcal (pesos 1/objetivo): mínimos cuadrados acotados (ver `prototipo/semana.py`, `solve`).
- Ingredientes por unidad (huevo, tortillas, rebanadas, tortitas): optimizar, redondear a piezas enteras, fijarlas y reoptimizar el resto.
- Redondeo final: 5 g; aceite en múltiplos de 5 ml; respetar límites.
- Implementación en JS: bounded least squares propio (pocas variables, 2–5) o `javascript-lp-solver` (Unlicense). Validar contra los resultados de `data/recetas_semilla.json`.

## Ajuste cada 2 semanas
1. Media de peso de los últimos 7 días frente a la de 7 días, 14 días antes.
2. Ritmo semanal = diferencia / 2 / peso medio (en %).
3. Adherencia = comidas marcadas hechas / comidas planificadas.
4. Reglas:
   - Adherencia < 80 %: no tocar calorías; proponer recetas más sencillas o más días flexibles.
   - Ritmo entre 0,5 % y 1 % semanal: mantener.
   - Ritmo < 0,25 %/semana con adherencia ≥ 80 %: −100 a −150 kcal, quitando de carbohidratos o grasa (nunca proteína).
   - Ritmo > 1 %/semana: +100 a +150 kcal.
   - Menos de 4 pesajes en el bloque: no proponer ajuste.
5. El ajuste se reparte proporcionalmente entre comidas y siempre es una **propuesta** que el usuario acepta.

Implementación (`apps-script/Progreso.js`): ajuste de **120 kcal**, repartido por comidas según sus kcal y, dentro de cada una, entre C y G según su peso en kcal. Se ofrecen siempre **2 opciones**: la de la regla («Recomendado») y la otra: «Mantener» si la regla propone cambiar, o «Acelerar déficit (−120)» si la regla dice mantener. Las que rompen los límites de seguridad salen desactivadas. Si no hay pesajes 14 días antes (primer bloque), se compara con la primera semana con pesajes. Adherencia: días pasados + comidas de hoy ya marcadas; con «Comida libre semanal», la primera comida libre de cada semana no cuenta.

## Límites de seguridad
- No bajar de 1.400 kcal/día ni de 1,6 g de proteína por kg de peso sin confirmación explícita.
- No proponer pérdidas > 1 % del peso por semana.
- La app no sustituye a un dietista-nutricionista.

## Días flexibles
Opcional (configurable): un día flexible puede llevar +15 % kcal, compensado entre los demás días de la semana sin bajar la proteína. Una comida libre semanal se marca como «libre» y no cuenta para adherencia.

## Fuentes
ISSN (proteína 1,4–2,0 g/kg; más en déficit), Helms 2014 (0,5–1 %/semana), Mifflin-St Jeor como comprobación, EFSA (grasa 20–35 %). Detalle en el informe de investigación previo.
