"""Semana de prueba: recetas apetecibles cuyos ingredientes 'escalables' se ajustan
con mínimos cuadrados acotados para cuadrar los macros por comida de la dieta de referencia."""
import json
import math
import numpy as np
from scipy.optimize import lsq_linear
from alimentos import F

F["aceite_ml"] = (828, 0, 0, 92, None)  # aceite de oliva por 100 ml

# Objetivo por comida = media real de la dieta "Ajustes Fran. Déficit"
TARGET = {
    "Desayuno": (405, 24.9, 48.3, 11.6),
    "Almuerzo": (542, 41.1, 48.0, 20.0),
    "Merienda": (335, 30.9, 33.8, 8.7),
    "Cena": (373, 34.9, 29.1, 12.3),
}

# Receta: nombre, comida, descripción corta, fijos [(alimento, g)], escalables [(alimento, min, max)]
# unidades: alimentos que se redondean a piezas enteras
UNIT = {"huevo", "fajita_trigo", "fajita_pequena", "tortita_arroz", "pan_brioche_burger", "pan_molde_integral"}

R = [
    # ---------------- DESAYUNOS
    ("D1", "Desayuno", "Huevos revueltos cremosos con aguacate y pimentón sobre pan de masa madre",
     "Revuelve a fuego bajo huevos y claras con sal; sirve sobre el pan tostado con aguacate machacado, pimentón de la Vera y lima.",
     [("tomate", 60)], [("pan_masa_madre", 50, 110), ("huevo", 53, 106), ("claras", 0, 200), ("aguacate", 15, 50)]),
    ("D2", "Desayuno", "Tortitas de avena y plátano con yogur, frutos rojos y un hilo de miel",
     "Bate harina de avena, claras, plátano y canela; haz tortitas en sartén antiadherente y corona con yogur, frutos rojos y miel.",
     [("platano", 50), ("frutos_rojos", 80), ("miel", 5)], [("harina_avena", 35, 70), ("claras", 80, 220), ("yogur_proteina", 60, 150), ("crema_cacahuete", 0, 10)]),
    ("D3", "Desayuno", "Overnight oats de cacao, plátano y crema de cacahuete",
     "La noche antes mezcla avena, proteína, cacao y bebida de almendras en un tarro; por la mañana añade plátano y crema de cacahuete.",
     [("leche_almendras_cero", 150), ("cacao_desgrasado", 8)], [("avena", 40, 75), ("proteina_whey", 10, 30), ("platano", 40, 100), ("crema_cacahuete", 5, 15)]),
    ("D4", "Desayuno", "Tosta de salmón ahumado con queso batido, eneldo y limón",
     "Unta el pan tostado con queso batido, eneldo y ralladura de limón; coloca el salmón y termina con pimienta y alcaparras.",
     [("pepino", 40)], [("pan_masa_madre", 60, 110), ("queso_fresco_batido", 50, 150), ("salmon_ahumado", 30, 80)]),
    # ---------------- MERIENDAS
    ("M1", "Merienda", "Bowl de skyr con granola casera crujiente, frutos rojos y cacahuete",
     "Tuesta la avena 5 min en sartén con canela y una pizca de miel; sirve sobre el yogur con frutos rojos y crema de cacahuete.",
     [("frutos_rojos", 100), ("miel", 5)], [("yogur_proteina", 150, 300), ("avena", 15, 40), ("crema_cacahuete", 5, 15)]),
    ("M2", "Merienda", "Sándwich mixto tostado de pavo, queso y mostaza",
     "Monta el sándwich con pavo, queso, tomate y mostaza de Dijon; tuéstalo en sandwichera o sartén hasta que el queso funda.",
     [("tomate", 40), ("mostaza", 5)], [("pan_molde_integral", 54, 81), ("pechuga_fiambre_90", 40, 110), ("queso_light_loncha", 20, 40)]),
    ("M3", "Merienda", "Frappé de café, cacao y plátano con proteína",
     "Tritura café frío, bebida de almendras, proteína, plátano, cacao, avena y hielo hasta que quede espumoso.",
     [("leche_almendras_cero", 250), ("cacao_desgrasado", 5)], [("proteina_whey", 20, 40), ("platano", 60, 120), ("avena", 0, 30), ("crema_cacahuete", 0, 10)]),
    ("M4", "Merienda", "Tortitas de arroz con hummus, pavo y tomate",
     "Unta las tortitas con hummus, añade pavo, rodajas de tomate, comino y un toque de pimentón.",
     [("tomate", 60)], [("tortita_arroz", 15, 45), ("hummus", 15, 40), ("pechuga_fiambre_90", 50, 130)]),
    # ---------------- ALMUERZOS
    ("A1", "Almuerzo", "Pollo al curry con yogur y arroz basmati",
     "Marca el pollo en dados, sofríe cebolla, ajo y jengibre con curry; añade tomate y espinacas, y al final el yogur fuera del fuego.",
     [("yogur_griego_light", 60), ("cebolla", 60), ("tomate_triturado", 80), ("espinacas", 50)], [("pechuga_pollo", 120, 200), ("arroz_basmati", 50, 90), ("aceite_ml", 3, 15)]),
    ("A2", "Almuerzo", "Espaguetis a la boloñesa con parmesano",
     "Sofrito de cebolla y pimiento, dora la carne, añade tomate, orégano y laurel 20 min; sirve con la pasta y parmesano rallado.",
     [("tomate_triturado", 150), ("pimiento_cebolla", 80)], [("pasta", 50, 90), ("ternera_picada_5", 100, 180), ("parmesano", 5, 15), ("aceite_ml", 0, 8)]),
    ("A3", "Almuerzo", "Poke de salmón con arroz, edamame, mango y sésamo",
     "Arroz templado, salmón en dados marinado en soja y lima, edamame, mango, pepino, cebolleta y sésamo tostado.",
     [("mango", 60), ("pepino", 60), ("salsa_soja", 15), ("sesamo", 5)], [("salmon", 80, 150), ("arroz", 50, 90), ("edamame", 50, 80)]),
    ("A4", "Almuerzo", "Fajitas de pollo al pimentón con pico de gallo y guacamole",
     "Saltea tiras de pollo con pimientos, cebolla, pimentón ahumado y comino; rellena las tortillas con pico de gallo y guacamole.",
     [("pimiento_cebolla", 120), ("tomate", 60)], [("fajita_trigo", 40, 120), ("pechuga_pollo", 120, 200), ("guacamole", 15, 40), ("aceite_ml", 0, 5)]),
    ("A5", "Almuerzo", "Garbanzos salteados con langostinos, espinacas y pimentón",
     "Saltea ajo y langostinos en aceite, añade garbanzos, espinacas, pimentón de la Vera, comino y un chorrito de limón.",
     [("espinacas", 100)], [("garbanzos_cocidos", 150, 330), ("langostinos", 100, 200), ("aceite_ml", 5, 15)]),
    ("A6", "Almuerzo", "Hamburguesa casera de ternera con queso y patatas en freidora de aire",
     "Forma la burger con la carne, sal y pimienta; plancha y funde el queso. Patatas en gajos con pimentón en la freidora 20 min.",
     [("lechuga", 30), ("tomate", 50), ("cebolla", 20), ("queso_light_loncha", 20)], [("pan_brioche_burger", 60, 60), ("ternera_picada_5", 120, 180), ("patata", 100, 250), ("aceite_ml", 3, 8)]),
    ("A7", "Almuerzo", "Arroz de pollo y verduras al estilo paella",
     "Dora el pollo, sofríe pimiento, judía verde y tomate, añade pimentón, azafrán, el arroz y caldo; 18 min sin remover.",
     [("verduras", 150), ("tomate", 50)], [("arroz", 60, 90), ("pechuga_pollo", 100, 180), ("aceite_ml", 5, 15)]),
    # ---------------- CENAS
    ("C1", "Cena", "Salmón al horno con costra de mostaza y miel, patatas asadas y salsa de eneldo",
     "Pinta el salmón con mostaza antigua y miel; hornea a 200 °C 12 min junto a patatas en rodajas finas y judías verdes. Salsa: queso batido, eneldo, limón y una pizca de mostaza.",
     [("mostaza", 10), ("miel", 5), ("verduras", 100)], [("salmon", 90, 160), ("patata", 80, 250), ("queso_fresco_batido", 0, 80)]),
    ("C2", "Cena", "Tacos de merluza cajún con col morada, aguacate y salsa de yogur y lima",
     "Marca la merluza en tacos con especias cajún (pimentón, ajo, comino, cayena); tortillas tostadas con col morada, aguacate, cilantro y salsa de yogur con lima.",
     [("col_lombarda", 80), ("yogur_griego_light", 40)], [("fajita_pequena", 50, 75), ("merluza", 120, 250), ("aguacate", 0, 40)]),
    ("C3", "Cena", "Pizza casera de base fina con pavo, champiñones y mozzarella",
     "Base fina con tomate y orégano, mozzarella, pavo, champiñones y cebolla roja; horno fuerte 10 min y rúcula al salir.",
     [("tomate_triturado", 60), ("champinon", 80)], [("masa_pizza_fina", 50, 90), ("pechuga_fiambre_90", 60, 130), ("mozzarella_light", 30, 70)]),
    ("C4", "Cena", "Tortilla de patatas jugosa con ensalada de tomate",
     "Patata y cebolla confitadas en freidora de aire con poco aceite; cuaja con huevos y claras, jugosa por dentro.",
     [("cebolla", 50), ("tomate", 150)], [("patata", 100, 220), ("huevo", 106, 159), ("claras", 0, 200), ("aceite_ml", 3, 10)]),
    ("C5", "Cena", "Pinchos morunos de lomo con pan de pita y salsa de yogur y pepino",
     "Marina el lomo con comino, pimentón, cúrcuma y ajo; plancha y sirve en pita con tzatziki ligero, tomate y cebolla.",
     [("yogur_griego_light", 60), ("pepino", 60), ("tomate", 60), ("cebolla", 20)], [("lomo_cerdo", 110, 200), ("pan_pita", 30, 60)]),
    ("C6", "Cena", "Ensalada César con pollo crujiente y salsa de yogur",
     "Pollo empanado en corn flakes en freidora; lechuga romana, picatostes, parmesano y salsa de yogur, mostaza, limón y ajo.",
     [("lechuga", 150), ("yogur_griego_light", 40)], [("pechuga_pollo", 120, 200), ("corn_flakes", 10, 30), ("pan_masa_madre", 10, 40), ("parmesano", 5, 15), ("aceite_ml", 0, 5)]),
    ("C7", "Cena", "Pulpo a la gallega con cachelos",
     "Pulpo cocido sobre patata cocida en rodajas, sal gruesa, pimentón dulce y picante y un buen hilo de aceite de oliva virgen.",
     [], [("pulpo_cocido", 150, 260), ("patata", 100, 250), ("aceite_ml", 5, 12)]),
]

STEP = {"aceite_ml": 5, "sesamo": 5, "parmesano": 5, "crema_cacahuete": 5, "miel": 5}


def mat(names):
    return np.array([[F[n][1] / 100, F[n][2] / 100, F[n][3] / 100] for n in names]).T  # 3 x n


def solve(fixed, scal, target, locked=None):
    locked = locked or {}
    t = np.array(target[1:4], dtype=float)
    base = np.zeros(3)
    for n, g in fixed:
        base += np.array(F[n][1:4]) * g / 100
    for n, g in locked.items():
        base += np.array(F[n][1:4]) * g / 100
    free = [(n, lo, hi) for n, lo, hi in scal if n not in locked]
    if not free:
        return dict(locked)
    names = [f[0] for f in free]
    A = mat(names)
    w = 1 / t  # error relativo
    # también incluimos las kcal para no desviarnos
    kc = np.array([F[n][0] / 100 for n in names])
    kc_base = sum(F[n][0] * g / 100 for n, g in list(fixed) + list(locked.items()))
    A2 = np.vstack([A * w[:, None], kc / target[0]])
    b2 = np.concatenate([(t - base) * w, [(target[0] - kc_base) / target[0]]])
    lo = np.array([f[1] for f in free], dtype=float)
    hi = np.array([f[2] for f in free], dtype=float)
    hi = np.maximum(hi, lo + 1e-6)
    res = lsq_linear(A2, b2, bounds=(lo, hi))
    out = dict(locked)
    out.update({n: v for n, v in zip(names, res.x)})
    return out


def round_g(n, g, lo, hi):
    if n in UNIT:
        u = F[n][4]
        k = max(round(g / u), math.ceil(lo / u - 1e-9))
        k = min(k, math.floor(hi / u + 1e-9))
        return k * u
    s = STEP.get(n, 5)
    v = round(g / s) * s
    return min(max(v, lo), hi) if lo > 0 else min(max(v, 0), hi)


def fit(recipe):
    code, meal, title, how, fixed, scal = recipe
    target = TARGET[meal]
    g = solve(fixed, scal, target)
    # redondear unidades y fijarlas, re-optimizar el resto
    locked = {n: round_g(n, g[n], lo, hi) for n, lo, hi in scal if n in UNIT}
    g = solve(fixed, scal, target, locked)
    final = {n: round_g(n, g[n], lo, hi) for n, lo, hi in scal}
    items = [(n, v) for n, v in fixed] + [(n, v) for n, v in final.items() if v > 0]
    k = sum(F[n][0] * v / 100 for n, v in items)
    p = sum(F[n][1] * v / 100 for n, v in items)
    c = sum(F[n][2] * v / 100 for n, v in items)
    f_ = sum(F[n][3] * v / 100 for n, v in items)
    return {
        "code": code, "meal": meal, "title": title, "how": how,
        "fixed": [n for n, _ in fixed],
        "items": [(n, v) for n, v in items],
        "kcal": k, "P": p, "C": c, "G": f_,
        "target": target,
    }


WEEK = [  # (día, desayuno, almuerzo, merienda, cena)
    ("Lunes", "D1", "A1", "M1", "C1"),
    ("Martes", "D2", "A2", "M2", "C2"),
    ("Miércoles", "D3", "A3", "M3", "C3"),
    ("Jueves", "D4", "A4", "M4", "C4"),
    ("Viernes", "D1", "A5", "M2", "C5"),
    ("Sábado", "D2", "A6", "M1", "C6"),
    ("Domingo", "D3", "A7", "M3", "C7"),
]

if __name__ == "__main__":
    fitted = {r[0]: fit(r) for r in R}
    for code, d in fitted.items():
        t = d["target"]
        print(f"{code} {d['title'][:55]:55s} {d['kcal']:4.0f} kcal ({(d['kcal']/t[0]-1)*100:+4.0f}%)  "
              f"P{d['P']:5.1f}/{t[1]:.0f}  C{d['C']:5.1f}/{t[2]:.0f}  G{d['G']:5.1f}/{t[3]:.0f}")
        print("     " + ", ".join(f"{n} {v:.0f}" for n, v in d["items"]))
    print()
    tday = [sum(TARGET[m][i] for m in TARGET) for i in range(4)]
    days = []
    for day, *codes in WEEK:
        k = sum(fitted[c]["kcal"] for c in codes)
        p = sum(fitted[c]["P"] for c in codes)
        c_ = sum(fitted[c]["C"] for c in codes)
        g = sum(fitted[c]["G"] for c in codes)
        days.append((day, k, p, c_, g))
        print(f"{day:10s} {k:5.0f} kcal ({(k/tday[0]-1)*100:+4.1f}%)  P{p:5.1f} ({(p/tday[1]-1)*100:+4.1f}%)  "
              f"C{c_:5.1f} ({(c_/tday[2]-1)*100:+4.1f}%)  G{g:5.1f} ({(g/tday[3]-1)*100:+4.1f}%)")
    print("objetivo  ", [round(x, 1) for x in tday])
    json.dump({"fitted": fitted, "week": WEEK, "days": days, "target_day": tday, "target": TARGET},
              open("semana.json", "w"), ensure_ascii=False, indent=1, default=float)
