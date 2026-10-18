# Puesta en marcha y publicación

La PWA está en GitHub Pages y los datos en Supabase. No hay servidor propio.

## 1. Publicar la PWA
1. Al cambiar archivos de `web/`, subir `VERSION` en `web/sw.js` (y añadir a su lista los archivos nuevos) para que el móvil descargue la versión nueva.
2. Push a `main`. El workflow `.github/workflows/pages.yml` publica `web/` en https://luvii12.github.io/mi-dieta/.

Si hubiera que montarlo desde cero: repositorio público (no contiene secretos), *Settings → Pages → Source: GitHub Actions*, y Supabase según `docs/SUPABASE.md`.

## 2. Altas
El registro libre está cerrado. Para dar de alta a alguien (lo hace Fran en su terminal; necesita `"clave_secreta"` en `.supabase.local.json`, ver `docs/SUPABASE.md` §9):
```
npm run invitar -- email@de.la.persona                → cuenta nueva con una contraseña temporal
npm run invitar -- email@de.la.persona --nueva-clave  → otra temporal, si ha olvidado la suya
```
El script enseña el mensaje para mandarle (enlace, email, contraseña temporal y la guía `docs/INSTALAR.md`). La persona la cambia en **Ajustes › Cuenta › Cambiar contraseña**.

## 3. Probar en el ordenador
- Tests: `npm test`
- PWA sin red: `npm run servidor` (Supabase falsa en memoria; entra con `prueba@mi-dieta.test` / `prueba`). Con `-- borrador` o `-- fin`, otros estados del plan; con `-- real`, el Supabase de verdad.
- Si cambian `data/alimentos.csv` o `data/recetas_semilla.json`: `npm run semilla` (regenera `data/semilla.js`). Para pasar alimentos o recetas nuevos a Supabase: `npm run supabase-semilla` (solo añade lo que falta).

## 4. La hoja de Google (copia de seguridad)
Hasta el 18-10-2026 los datos estaban en una hoja de Google con un Apps Script como API (fases 0–5). Se migró a Supabase en M3 y Apps Script se retiró en M6: ni la app ni los scripts usan ya la hoja, que queda como copia de seguridad de solo lectura. El código de Apps Script (`apps-script/`, clasp) y el script de migración están en el historial de git (hasta el commit `3a81c73`).
