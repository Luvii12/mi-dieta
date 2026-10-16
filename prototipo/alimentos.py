# Tabla de alimentos aproximada (por 100 g o 100 ml), valores tipo BEDCA / etiquetas Mercadona.
# kcal, proteína, carbohidratos, grasa. "ud" = gramos por unidad cuando la dieta usa unidades.
# Son aproximaciones para estimar: la app final debe usar valores verificados.

F = {
    # nombre: (kcal, P, C, G, gramos_por_unidad)
    "pan_molde_integral": (250, 10, 41, 4, 27),      # 1 rebanada ~27 g
    "pan_blanco": (265, 9, 52, 1.5, None),
    "pan_integral": (250, 9.5, 45, 3, None),
    "pan_cristal": (260, 9, 51, 2.5, 50),
    "pan_brioche_burger": (300, 9, 50, 7, 60),
    "pan_masa_madre": (250, 9, 49, 1.5, None),
    "pan_pita": (275, 9, 55, 1.2, 60),
    "pechuga_fiambre_90": (100, 19, 1.5, 1.5, None),
    "queso_cottage": (90, 12, 3, 3.5, None),
    "miel": (304, 0.3, 82, 0, None),
    "jamon_serrano": (230, 30, 0, 12, None),
    "aceite_oliva": (900, 0, 0, 100, None),             # por 100 g; 10 ml ~ 9 g
    "tomate": (20, 0.9, 3.5, 0.2, None),
    "avena": (370, 13, 60, 7, None),
    "harina_avena": (370, 13, 60, 7, None),
    "proteina_whey": (380, 75, 8, 6, None),
    "arandanos": (57, 0.7, 14, 0.3, None),
    "frutos_rojos": (45, 1, 9, 0.4, None),
    "fresas": (32, 0.7, 6, 0.3, None),
    "platano": (90, 1.1, 21, 0.3, None),
    "manzana": (52, 0.3, 12, 0.2, 180),
    "pina": (50, 0.5, 11.5, 0.1, None),
    "mango": (60, 0.8, 14, 0.4, None),
    "chocolate_70": (570, 8, 34, 42, None),
    "cacao_desgrasado": (300, 23, 13, 12, None),
    "leche_almendras_cero": (13, 0.5, 0, 1.1, None),
    "corn_flakes": (380, 7, 84, 0.9, None),
    "crema_arroz": (370, 7, 82, 1, None),
    "pasta": (355, 12, 71, 1.5, None),
    "arroz": (350, 7, 78, 0.6, None),
    "arroz_basmati": (350, 8, 77, 0.8, None),
    "arroz_bolsa_congelado": (150, 3, 31, 1.5, None),   # ya cocinado
    "noquis": (150, 4, 32, 0.4, None),
    "huevo": (140, 12.5, 0.5, 10, 53),                  # huevo M sin cáscara ~53 g
    "claras": (48, 11, 0.7, 0.2, None),
    "salmon": (200, 20, 0, 13, None),
    "salmon_ahumado": (180, 23, 0, 10, None),
    "brocoli": (34, 2.8, 4, 0.4, None),
    "salsa_0": (20, 0.5, 4, 0, None),
    "salmorejo": (95, 1.5, 7, 6.8, None),
    "pechuga_pavo": (105, 24, 0, 1, None),
    "pechuga_pollo": (110, 23, 0, 1.5, None),
    "muslo_pollo_deshuesado": (150, 19, 0, 8, None),
    "boniato": (86, 1.6, 20, 0.1, None),
    "patata": (80, 2, 17, 0.1, None),
    "verduras": (25, 1.5, 4, 0.2, None),
    "lechuga": (15, 1.3, 1.5, 0.2, None),
    "pimiento_cebolla": (30, 1, 5.5, 0.2, None),
    "champinon": (22, 3, 0.5, 0.3, None),
    "espinacas": (23, 2.9, 1.4, 0.4, None),
    "pepino": (12, 0.6, 2, 0.1, None),
    "col_lombarda": (30, 1.4, 5, 0.2, None),
    "edamame": (120, 11, 7, 5, None),
    "fajita_trigo": (310, 8.5, 51, 7.5, 40),            # mediana ~40 g
    "fajita_pequena": (310, 8.5, 51, 7.5, 25),
    "salsa_barbacoa_0": (40, 0.5, 9, 0, None),
    "ternera_picada_5": (135, 21, 0, 5.5, None),
    "filete_ternera": (130, 22, 0, 4.5, None),
    "mozzarella_rallada": (300, 24, 2, 22, None),
    "mozzarella_light": (165, 19, 1.5, 9, None),
    "parmesano": (400, 33, 0, 29, None),
    "queso_curado": (420, 28, 0, 34, None),
    "yogur_proteina": (58, 10, 4, 0.2, None),
    "yogur_griego_light": (75, 7, 5, 3, None),
    "queso_fresco_batido": (46, 8, 3.5, 0.1, None),
    "nueces": (654, 15, 7, 65, None),
    "almendras": (600, 21, 7, 52, None),
    "crema_cacahuete": (600, 26, 12, 50, None),
    "tortita_arroz": (385, 8, 80, 2.8, 7.5),
    "queso_light_loncha": (250, 28, 1, 15, 20),
    "jamon_cocido": (100, 19, 1, 2.5, 15),
    "burger_pollo": (140, 18, 3, 6, None),
    "guacamole": (160, 1.6, 4.5, 14.6, None),
    "atun_natural": (105, 24, 0, 1, 56),                 # 1 lata escurrida ~56 g
    "garbanzos_cocidos": (120, 7, 15, 2.5, None),
    "lentejas_cocidas": (100, 8, 13, 0.5, None),
    "aguacate": (160, 2, 2, 15, None),
    "lomo_cerdo": (140, 21.5, 0, 6, None),
    "lomo_embuchado": (250, 40, 1, 10, None),
    "merluza": (80, 17, 0, 1.2, None),
    "pulpo_cocido": (85, 18, 2, 1, None),
    "langostinos": (90, 19, 0, 1.5, None),
    "queso_burgos_0": (65, 12, 4, 0.2, 75),
    "yogur_desnatado": (40, 4.5, 5.5, 0.1, 125),
    "tomate_triturado": (30, 1.3, 4.5, 0.2, None),
    "salsa_soja": (55, 8, 5, 0, None),
    "mostaza": (80, 5, 4, 4, None),
    "sesamo": (580, 18, 12, 50, None),
    "harina_trigo": (350, 10, 73, 1.2, None),
    "masa_pizza_fina": (280, 8, 54, 3, None),
    "chorizo": (450, 22, 2, 39, None),
    "cebolla": (40, 1.1, 8, 0.1, None),
    "zumo_lima_especias": (0, 0, 0, 0, None),            # sabor sin calorías relevantes
    "hummus": (250, 7, 12, 19, None),
}


def macros(items):
    """items: lista de (alimento, gramos). Devuelve (kcal, P, C, G)."""
    k = p = c = g = 0.0
    for name, grams in items:
        kc, pp, cc, gg, _ = F[name]
        f = grams / 100.0
        k += kc * f; p += pp * f; c += cc * f; g += gg * f
    return k, p, c, g


def ud(name, n):
    return F[name][4] * n
