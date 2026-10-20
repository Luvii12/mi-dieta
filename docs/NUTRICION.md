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
2. **Gasto del día** = reposo × factor de actividad (PAL de la FAO/OMS/UNU 2004: una vida sedentaria es 1,40–1,69; una hora diaria de ejercicio moderado o intenso suma ~0,2). Trabajo: sentado 1,4 · de pie 1,55 · físico 1,7. Ejercicio (días/semana, fuerza o cardio): no +0 · 1–2 +0,05 · 3–4 +0,1 · 5 o más +0,15. Andar a diario (≈ 1 hora o 10.000 pasos): +0,1. De 1,4 a 1,95. (Hasta el 2026-10-20 el trabajo sentado era 1,2 y el entrenamiento sumaba 0,15/0,3/0,45: con 3–4 días daba lo mismo, 1,5, pero sin ejercicio subestimaba el gasto.)
3. **Objetivo**: perder grasa −20 % (como mucho −500 kcal) · mantener · ganar músculo +10 % (como mucho +300). Redondeo a 10 kcal y nunca por debajo del mínimo: **1.200 kcal mujeres / 1.500 hombres** (o el `kcal_minimas` que ya tenga la persona: Fran, 1.400).
4. **Proteína** (g/kg), según el objetivo y si hace fuerza (pesas, máquinas, calistenia; quien hace de todo, fuerza):

   | Objetivo | Sin ejercicio o solo andar | Cardio o deporte 1–2 / 3 o más días | Fuerza 1–2 / 3 o más días |
   | --- | --- | --- | --- |
   | Perder grasa | 1,4 | 1,4 / 1,6 | 2,0 / 2,2 |
   | Mantener | 1,4 | 1,6 / 1,8 | 1,6 / 1,8 |
   | Ganar músculo | 1,6 | 1,8 / 2,0 | 1,8 / 2,0 |

   Perder grasa sin fuerza: 1,2–1,6 g/kg basta para el apetito y el control del peso (Leidy 2015); con fuerza hace falta más para no perder músculo (ISSN 2017: 1,4–2,0, y más en déficit). Mantener y ganar se quedan como antes de separar el tipo de ejercicio (bajarles la proteína deja los planes sin cuadrar con esta biblioteca). Tope 2,2. Con IMC > 30 se calcula sobre el peso que daría un IMC de 25. Los perfiles de antes de preguntar el tipo de ejercicio cuentan como fuerza.
5. **Grasa** 25 % de las kcal (baja hasta el 20 % si los hidratos no llegan a 100 g); **hidratos**, el resto.
6. **Reparto por comidas**: cada macro con las proporciones de la tabla de arriba (la merienda sigue siendo rica en proteína); las kcal de cada comida salen de sus macros. El almuerzo y la cena van siempre; quien no desayuna o no merienda los quita en el perfil y el día (mismas kcal y macros) se reparte entre sus otras comidas en las mismas proporciones. Si lo cambia con un plan en curso, desde el día siguiente sus planes quitan o añaden esa comida y recalculan los gramos con los mismos platos.
7. Avisos: ganar músculo sin entrenar fuerza; déficit recortado por el mínimo de kcal. Siempre: «la app no sustituye a un dietista-nutricionista».

**Raciones** (`racionesReceta_`, Nutricion.js): las cantidades de las recetas (fijas, `min_g`, `max_g`) están pensadas para los objetivos de arriba. Para otros objetivos se escalan antes de optimizar, cada ingrediente según el macro de su grupo y el objetivo de esa comida: proteína y lácteos con P, hidratos y fruta con C, grasa con G, verdura y condimentos con las kcal (factor entre 0,4 y 3; piezas enteras). Con los objetivos de Fran el factor es 1 y nada cambia. La biblioteca actual es de cocina con mucha proteína: con poca proteína respecto a las kcal los días tienden a pasarse de proteína (por eso el día admite hasta +15 %, ver Tolerancias) y una mujer pequeña con 1.200 kcal aún tiene 3 de 14 días «a revisar» hasta que haya recetas con más hidratos (simulación del 2026-10-20 con 12 perfiles: los demás, 13–14 de 14).

**Gramos elegidos por la persona** (`ajustarReceta_` con `fijados`): en una comida del plan cualquiera puede poner los gramos de algún ingrediente (su bollo de pan pesa 50 g) y el optimizador cuadra el resto de escalables dentro de sus límites. Esos gramos se usan tal cual (0 = sin ese ingrediente), se guardan en la comida y se respetan al recalcularla; con «Siempre en esta receta» también en sus demás comidas con ese plato y en los planes nuevos. Si el resto no llega a compensar, la comida queda fuera de margen y la app lo avisa antes de guardar.

## Tolerancias
| Nivel | kcal | Proteína | Carbohidratos | Grasa |
| --- | --- | --- | --- | --- |
| Día | ±5 % | −5 % / +15 % (nunca < objetivo − 10 g) | ±10 % | ±10 % |
| Comida | ±12 % | ±15 % | ±15 % | ±20 % |

## Optimizador de gramos
- Variables: gramos de los ingredientes **escalables** de la receta, cada uno con `min_g`/`max_g`.
- Los ingredientes **fijos** se suman como constante.
- Minimizar el error relativo en P, C, G y kcal (pesos 1/objetivo): mínimos cuadrados acotados (ver `prototipo/semana.py`, `solve`).
- Ingredientes por unidad (huevo, tortillas, rebanadas, tortitas): optimizar, redondear a piezas enteras, fijarlas y reoptimizar el resto.
- Redondeo final: 5 g; aceite de 1 en 1 ml (desde 2026-10-19; con 5 ml las raciones pequeñas no cuadraban la grasa de la comida: se mide con cuchara medidora o pulverizador); respetar límites. El prototipo en Python sigue con 5 ml: los tests de regresión solo admiten esa diferencia.
- Implementación en JS: bounded least squares propio (pocas variables, 2–5) o `javascript-lp-solver` (Unlicense). Validar contra los resultados de `data/recetas_semilla.json`.

## Ajuste cada 2 semanas
1. Media de peso de los últimos 7 días frente a la de 7 días, 14 días antes.
2. Ritmo semanal = diferencia / 2 / peso medio (en %).
3. Adherencia = comidas marcadas hechas / comidas planificadas (las marcadas «No la he hecho» cuentan como no hechas).
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
- No bajar de las kcal mínimas de cada persona (`kcal_minimas`: 1.200 mujeres / 1.500 hombres al darse de alta; Fran, 1.400) ni de la proteína mínima según el objetivo (perder grasa 1,6 g/kg con fuerza o sin perfil y 1,2 g/kg sin fuerza; mantener y ganar 1,2 g/kg; con IMC > 30, sobre el peso de un IMC de 25) sin confirmación explícita.
- No proponer pérdidas > 1 % del peso por semana.
- La app no sustituye a un dietista-nutricionista.

## Días flexibles
Opcional (configurable): un día flexible puede llevar +15 % kcal, compensado entre los demás días de la semana sin bajar la proteína. Una comida libre semanal se marca como «libre» y no cuenta para adherencia.

## Fuentes
ISSN 2017, Jäger et al. (proteína 1,4–2,0 g/kg con ejercicio; 2,3–3,1 con fuerza en déficit; en resistencia, prioridad a los hidratos), Leidy et al. 2015, AJCN (perder peso: 1,2–1,6 g/kg y 25–30 g por comida), Morton et al. 2018, BJSM (con fuerza, más allá de 1,62 g/kg no se gana más masa magra), Helms 2014 y Garthe 2011 (0,5–1 %/semana), Frankenfield 2005 (Mifflin-St Jeor, la más precisa: dentro del 10 % en la mayoría), FAO/OMS/UNU 2004, cap. 5 (factores de actividad), EFSA (proteína de referencia 0,83 g/kg; grasa 20–35 %). Estudio de perfiles y fuentes del 2026-10-20 en `docs/PROGRESO.md`.
