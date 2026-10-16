# Puesta en marcha (Fase 0)

Pasos que hace el usuario a mano. Claude Code puede ejecutar los comandos de clasp y git una vez hecho el login.

## 1. Google: hoja + Apps Script
1. Activar la API de Apps Script: https://script.google.com/home/usersettings
2. `clasp login` (en Claude Code: `! clasp login`). Elegir la cuenta donde vivirá la hoja.
3. Crear la hoja con el script vinculado (desde la raíz del repo):
   `clasp create --type sheets --title "Dieta" --rootDir apps-script`
   Si clasp sobrescribe `apps-script/appsscript.json`, restaurarlo con `git checkout apps-script/appsscript.json`.
4. Subir el código: `clasp push`
5. En el editor (`clasp open-script`), ejecutar una vez, por este orden:
   - `configurarHoja` → crea las 9 pestañas y carga 95 alimentos, 22 recetas y la configuración. Google pedirá permisos la primera vez.
   - `crearToken` → el token aparece en el *Registro de ejecución*. Copiarlo.
6. Publicar: *Implementar → Nueva implementación → Aplicación web*, «Ejecutar como: yo», «Quién tiene acceso: cualquier usuario». Copiar la URL que termina en `/exec`.
   Al cambiar el código más adelante (lo hace Claude Code):
   `clasp push --force` y `clasp update-deployment <id de la URL /exec>` → nueva versión con la misma URL.
   Sin `--force`, clasp pide confirmación por el manifiesto y, fuera de una terminal interactiva, no sube nada.

## 2. GitHub Pages
1. Crear un repositorio vacío (p. ej. `dieta_app`). Puede ser público: no contiene secretos.
2. *Settings → Pages → Source: GitHub Actions*.
3. Subir la rama `main`. El workflow `.github/workflows/pages.yml` publica `web/` en `https://<usuario>.github.io/<repo>/`.

## 3. Móvil (Android)
1. Abrir la URL de Pages en Chrome → ⋮ → **Instalar aplicación**.
2. En **Ajustes**: pegar la URL `/exec` y el token → *Guardar y probar*.
3. *Escribir fila de prueba* → comprobar que aparece `ultima_prueba` en la pestaña `config` de la hoja.

## Probar en el ordenador
- Tests: `npm test`
- PWA en local: `npm run local` y abrir http://localhost:8080
- Si cambian `data/alimentos.csv` o `data/recetas_semilla.json`: `npm run semilla`. `configurarHoja` solo carga datos en pestañas vacías.
- Al cambiar archivos de `web/`, subir `VERSION` en `web/sw.js` para que el móvil descargue la versión nueva.
