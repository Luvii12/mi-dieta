from alimentos import macros, ud

# ---- Dieta "Ajustes Fran. Déficit" (verano): objetivo declarado 1900 kcal, P159 C189 G50
AJUSTES = {
    "Desayuno": {
        "A Tostada pollo, cottage y miel": [("pan_molde_integral", ud("pan_molde_integral", 4)), ("pechuga_fiambre_90", 70), ("queso_cottage", 40), ("miel", 10)],
        "B Tostada jamón, tomate y aceite": [("pan_blanco", 70), ("jamon_serrano", 60), ("aceite_oliva", 9), ("tomate", 50)],
        "C Avena con arándanos y chocolate": [("avena", 70), ("proteina_whey", 20), ("arandanos", 50), ("chocolate_70", 15)],
        "D Corn flakes con proteína": [("leche_almendras_cero", 150), ("corn_flakes", 45), ("proteina_whey", 20), ("chocolate_70", 15)],
    },
    "Almuerzo": {
        "A Ensalada pasta, salmón y brócoli": [("pasta", 80), ("huevo", ud("huevo", 1)), ("salmon", 120), ("brocoli", 100), ("salsa_0", 15)],
        "B Salmorejo con jamón, huevo y pan": [("salmorejo", 300), ("jamon_serrano", 50), ("huevo", ud("huevo", 1)), ("pan_blanco", 40)],
        "C Pavo con boniato y cottage": [("pechuga_pavo", 150), ("boniato", 180), ("queso_cottage", 30), ("verduras", 100)],
        "D Pizzas barbacoa en fajita": [("fajita_trigo", ud("fajita_trigo", 2)), ("salsa_barbacoa_0", 20), ("ternera_picada_5", 110), ("jamon_serrano", 30), ("verduras", 100), ("mozzarella_rallada", 30)],
    },
    "Merienda": {
        "A Yogur con nueces y miel": [("yogur_proteina", 250), ("corn_flakes", 30), ("arandanos", 100), ("nueces", 10), ("miel", 10)],
        "B Batido de proteína con fruta": [("leche_almendras_cero", 100), ("proteina_whey", 20), ("manzana", 130)],
        "C Tortas de arroz con queso y jamón": [("tortita_arroz", ud("tortita_arroz", 4)), ("queso_light_loncha", ud("queso_light_loncha", 4)), ("jamon_cocido", ud("jamon_cocido", 8))],
    },
    "Cena": {
        "A Burger de pollo con guacamole": [("pan_cristal", ud("pan_cristal", 1)), ("burger_pollo", 90), ("queso_light_loncha", 20), ("jamon_cocido", 15), ("verduras", 100), ("guacamole", 20)],
        "B Ensalada de atún y garbanzos": [("lechuga", 100), ("atun_natural", ud("atun_natural", 2)), ("garbanzos_cocidos", 80), ("verduras", 150), ("aguacate", 40)],
        "C Lomo con tortas de arroz": [("lomo_cerdo", 160), ("tortita_arroz", ud("tortita_arroz", 5)), ("guacamole", 25), ("verduras", 150)],
        "D Tortilla de atún y patata": [("huevo", ud("huevo", 2)), ("atun_natural", ud("atun_natural", 1)), ("verduras", 200), ("patata", 100)],
    },
}

# ---- Otras dietas (opciones medias, para comparar)
JUNIO = {
    "Desayuno": [
        [("pan_blanco", 100), ("pechuga_pollo", 80), ("aceite_oliva", 4.6)],
        [("huevo", ud("huevo", 1)), ("claras", 150), ("harina_avena", 50), ("fresas", 100)],
        [("leche_almendras_cero", 300), ("corn_flakes", 50), ("proteina_whey", 25), ("cacao_desgrasado", 10)],
    ],
    "Almuerzo (+ yogur proteína)": [
        [("arroz_bolsa_congelado", 250), ("pechuga_pollo", 180), ("verduras", 150), ("yogur_proteina", 120)],
        [("pasta", 70), ("filete_ternera", 100), ("verduras", 150), ("yogur_proteina", 120)],
        [("noquis", 150), ("atun_natural", ud("atun_natural", 2)), ("verduras", 150), ("yogur_proteina", 120)],
        [("patata", 250), ("salmon", 120), ("verduras", 150), ("yogur_proteina", 120)],
    ],
    "Merienda": [
        [("yogur_proteina", 180), ("corn_flakes", 30), ("fresas", 100), ("crema_cacahuete", 10)],
        [("tortita_arroz", ud("tortita_arroz", 4)), ("jamon_serrano", 30), ("guacamole", 20)],
        [("crema_arroz", 50), ("proteina_whey", 40), ("crema_cacahuete", 10)],
    ],
    "Cena (+ yogur proteína)": [
        [("fajita_pequena", ud("fajita_pequena", 2)), ("pechuga_pollo", 150), ("guacamole", 20), ("verduras", 100), ("yogur_proteina", 120)],
        [("pan_brioche_burger", 60), ("ternera_picada_5", 90), ("queso_light_loncha", 20), ("verduras", 80), ("yogur_proteina", 120)],
        [("patata", 150), ("merluza", 200), ("aceite_oliva", 9), ("verduras", 150), ("yogur_proteina", 120)],
    ],
}

MAYO = {
    "Desayuno": [
        [("pan_molde_integral", ud("pan_molde_integral", 4)), ("pechuga_pavo", 80), ("manzana", 180)],
        [("pan_molde_integral", ud("pan_molde_integral", 4)), ("huevo", ud("huevo", 2)), ("claras", 50), ("tomate", 50), ("manzana", 180)],
        [("claras", 240), ("harina_avena", 60), ("crema_cacahuete", 10), ("manzana", 180)],
        [("yogur_proteina", 250), ("fresas", 100), ("corn_flakes", 30), ("crema_cacahuete", 10)],
    ],
    "Almuerzo": [
        [("pasta", 80), ("ternera_picada_5", 140), ("tomate_triturado", 100), ("verduras", 100)],
        [("patata", 300), ("pechuga_pollo", 180), ("queso_curado", 20), ("verduras", 100)],
        [("noquis", 200), ("atun_natural", ud("atun_natural", 2)), ("queso_cottage", 20), ("verduras", 100)],
        [("arroz", 80), ("atun_natural", ud("atun_natural", 2)), ("huevo", ud("huevo", 1)), ("verduras", 100)],
    ],
    "Merienda": [
        [("tortita_arroz", ud("tortita_arroz", 4)), ("guacamole", 15), ("lomo_embuchado", 40)],
        [("leche_almendras_cero", 150), ("proteina_whey", 15), ("corn_flakes", 35)],
        [("crema_arroz", 70), ("proteina_whey", 35), ("crema_cacahuete", 10)],
    ],
    "Cena": [
        [("merluza", 300), ("queso_burgos_0", 75), ("verduras", 200)],
        [("burger_pollo", 150), ("queso_burgos_0", 75), ("verduras", 200)],
        [("filete_ternera", 200), ("queso_burgos_0", 75), ("verduras", 200)],
    ],
}

CICLADO_LXV = {
    "Desayuno": [
        [("pan_blanco", 80), ("jamon_serrano", 50), ("aceite_oliva", 9)],
        [("avena", 80), ("proteina_whey", 30), ("crema_cacahuete", 10)],
        [("crema_arroz", 80), ("proteina_whey", 30), ("crema_cacahuete", 10)],
    ],
    "Almuerzo": [
        [("arroz", 70), ("pechuga_pollo", 200), ("verduras", 150)],
        [("pasta", 70), ("filete_ternera", 200), ("verduras", 150)],
        [("noquis", 180), ("garbanzos_cocidos", 300), ("verduras", 150)],
    ],
    "Merienda": [
        [("tortita_arroz", ud("tortita_arroz", 4)), ("pechuga_pavo", 100), ("guacamole", 30)],
        [("queso_fresco_batido", 250), ("corn_flakes", 30), ("fresas", 200)],
    ],
    "Cena": [
        [("patata", 150), ("atun_natural", ud("atun_natural", 2)), ("verduras", 150)],
        [("boniato", 150), ("merluza", 200), ("verduras", 150)],
        [("arroz", 50), ("huevo", ud("huevo", 2)), ("claras", 100), ("verduras", 150)],
    ],
}

REESTRUCT_LV = {
    "Desayuno": [
        [("pan_integral", 90), ("jamon_serrano", 50), ("tomate", 50), ("aceite_oliva", 9)],
        [("crema_arroz", 60), ("proteina_whey", 25), ("crema_cacahuete", 15)],
        [("harina_avena", 60), ("claras", 220), ("crema_cacahuete", 15)],
    ],
    "Almuerzo (+ yogur 0% y fresas)": [
        [("arroz", 80), ("pechuga_pollo", 180), ("verduras", 150), ("yogur_desnatado", 125), ("fresas", 100)],
        [("noquis", 100), ("filete_ternera", 180), ("verduras", 150), ("yogur_desnatado", 125), ("fresas", 100)],
        [("pasta", 80), ("atun_natural", ud("atun_natural", 3)), ("verduras", 150), ("yogur_desnatado", 125), ("fresas", 100)],
        [("fajita_trigo", ud("fajita_trigo", 2)), ("pechuga_pavo", 180), ("guacamole", 25), ("verduras", 100), ("yogur_desnatado", 125), ("fresas", 100)],
        [("patata", 300), ("merluza", 250), ("verduras", 150), ("yogur_desnatado", 125), ("fresas", 100)],
    ],
    "Merienda": [
        [("queso_fresco_batido", 300), ("corn_flakes", 35), ("fresas", 150), ("nueces", 10)],
        [("tortita_arroz", ud("tortita_arroz", 4)), ("lomo_embuchado", 60), ("aguacate", 20)],
        [("proteina_whey", 30), ("leche_almendras_cero", 200), ("manzana", 180), ("nueces", 10)],
    ],
    "Cena (+ yogur 0% y piña)": [
        [("salmon", 200), ("huevo", ud("huevo", 1)), ("claras", 100), ("verduras", 200), ("yogur_desnatado", 125), ("pina", 100)],
        [("huevo", ud("huevo", 3)), ("jamon_serrano", 40), ("queso_light_loncha", 20), ("verduras", 200), ("yogur_desnatado", 125), ("pina", 100)],
        [("lechuga", 200), ("atun_natural", ud("atun_natural", 2)), ("jamon_serrano", 40), ("tomate", 100), ("pepino", 100), ("yogur_desnatado", 125), ("pina", 100)],
    ],
}


def avg(opts):
    ms = [macros(o) for o in opts]
    n = len(ms)
    return tuple(sum(m[i] for m in ms) / n for i in range(4))


def fmt(m):
    return f"{m[0]:6.0f} kcal  P{m[1]:5.1f}  C{m[2]:5.1f}  G{m[3]:5.1f}"


if __name__ == "__main__":
    print("=== AJUSTES FRAN. DÉFICIT (objetivo declarado 1900 kcal · P159 C189 G50)")
    tot = [0, 0, 0, 0]
    for meal, opts in AJUSTES.items():
        print(f"-- {meal}")
        for name, items in opts.items():
            print(f"   {name:40s} {fmt(macros(items))}")
        a = avg(list(opts.values()))
        print(f"   {'MEDIA':40s} {fmt(a)}")
        tot = [t + x for t, x in zip(tot, a)]
    print(f"TOTAL MEDIO DÍA: {fmt(tot)}\n")

    for title, d in [("APRETADA JUNIO", JUNIO), ("BAJADA GRASA MAYO", MAYO), ("CICLADO L-X-V", CICLADO_LXV), ("REESTRUCTURACIÓN L-V", REESTRUCT_LV)]:
        tot = [0, 0, 0, 0]
        print(f"=== {title}")
        for meal, opts in d.items():
            a = avg(opts)
            print(f"   {meal:34s} {fmt(a)}")
            tot = [t + x for t, x in zip(tot, a)]
        print(f"   {'TOTAL MEDIO DÍA':34s} {fmt(tot)}\n")
