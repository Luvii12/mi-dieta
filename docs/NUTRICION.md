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

## Objetivos según el perfil (M4, `web/motor/Perfil.js`)
Al darse de alta, y cada vez que alguien cambia de objetivo en Ajustes › Mi objetivo, la app calcula sus objetivos (sin perfil, como Fran hasta que lo rellene, se quedan los de arriba):
1. **Gasto en reposo** (Mifflin-St Jeor): 10·peso + 6,25·altura − 5·edad + 5 (hombre) / − 161 (mujer).
2. **Gasto del día** = reposo × (trabajo + entrenamiento). Trabajo: sentado 1,2 · de pie 1,3 · físico 1,45. Entrenamiento (días/semana): no +0 · 1–2 +0,15 · 3–4 +0,3 · 5 o más +0,45 (de 1,2 a 1,9).
3. **Objetivo**: perder grasa −20 % (como mucho −500 kcal) · mantener · ganar músculo +10 % (como mucho +300). Redondeo a 10 kcal y nunca por debajo del mínimo: **1.200 kcal mujeres / 1.500 hombres** (o el `kcal_minimas` que ya tenga la persona: Fran, 1.400).
4. **Proteína** (g/kg): perder 1,8 · mantener 1,4 · ganar 1,6, más 0,2 si entrena 1–2 días y 0,4 si entrena 3 o más; tope 2,2. Con IMC > 30 se calcula sobre el peso que daría un IMC de 25.
5. **Grasa** 25 % de las kcal (baja hasta el 20 % si los hidratos no llegan a 100 g); **hidratos**, el resto.
6. **Reparto por comidas**: cada macro con las proporciones de la tabla de arriba (la merienda sigue siendo rica en proteína); las kcal de cada comida salen de sus macros.
7. Avisos: ganar músculo sin entrenar; déficit recortado por el mínimo de kcal. Siempre: «la app no sustituye a un dietista-nutricionista».

**Raciones** (`racionesReceta_`, Nutricion.js): las cantidades de las recetas (fijas, `min_g`, `max_g`) están pensadas para los objetivos de arriba. Para otros objetivos se escalan antes de optimizar, cada ingrediente según el macro de su grupo y el objetivo de esa comida: proteína y lácteos con P, hidratos y fruta con C, grasa con G, verdura y condimentos con las kcal (factor entre 0,4 y 3; piezas enteras). Con los objetivos de Fran el factor es 1 y nada cambia. Con la biblioteca actual (cocina con mucha proteína), los perfiles con proteína baja respecto a sus kcal (mantener sin entrenar, ganar músculo comiendo mucho) tienen días «a revisar» hasta que haya recetas con más hidratos.

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
5. El ajuste se reparte proporcionalmente entre comidas y siempre es una **propuesta** que el usuario acepta. Si no activa el borrador, el día que empieza se activa solo manteniendo las calorías.
6. **Según el objetivo del perfil** (las reglas de arriba son las de perder grasa, y las de quien no tiene perfil):
   - Mantener: ritmo entre −0,25 % y +0,25 % semanal → mantener; pierde más → +120; gana más → −120. Alternativa a mantener: −120.
   - Ganar músculo: ritmo < +0,1 % → +120; entre +0,1 % y +0,5 % → mantener (alternativa: «Acelerar ganancia», +120); > +0,5 % → −120.
   - La adherencia < 80 % y los menos de 4 pesajes funcionan igual para todos.

Implementación (`web/motor/Progreso.js`): ajuste de **120 kcal**, repartido por comidas según sus kcal y, dentro de cada una, entre C y G según su peso en kcal. Se ofrecen siempre **2 opciones**: la de la regla («Recomendado») y la otra: «Mantener» si la regla propone cambiar, o «Acelerar déficit (−120)» si la regla dice mantener. Las que rompen los límites de seguridad salen desactivadas. Si no hay pesajes 14 días antes (primer bloque), se compara con la primera semana con pesajes. Adherencia: días pasados + comidas de hoy ya marcadas; con «Comida libre semanal», la primera comida libre de cada semana no cuenta.

## Límites de seguridad
- No bajar de las kcal mínimas de cada persona (`kcal_minimas`: 1.200 mujeres / 1.500 hombres al darse de alta; Fran, 1.400) ni de la proteína mínima según el objetivo (perder 1,6 g/kg; mantener y ganar 1,2 g/kg; con IMC > 30, sobre el peso de un IMC de 25) sin confirmación explícita.
- No proponer pérdidas > 1 % del peso por semana.
- La app no sustituye a un dietista-nutricionista.

## Días flexibles
Opcional (configurable): un día flexible puede llevar +15 % kcal, compensado entre los demás días de la semana sin bajar la proteína. Una comida libre semanal se marca como «libre» y no cuenta para adherencia.

## Fuentes
ISSN (proteína 1,4–2,0 g/kg; más en déficit), Helms 2014 (0,5–1 %/semana), Mifflin-St Jeor como comprobación, EFSA (grasa 20–35 %). Detalle en el informe de investigación previo.
