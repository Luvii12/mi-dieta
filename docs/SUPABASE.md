# Supabase: crear el proyecto (fase M0)

Pasos que hace Fran en el panel de Supabase, una sola vez. Ningún dato secreto va al repo.

## 1. Cuenta y proyecto
1. Entra en https://supabase.com y crea una cuenta (con GitHub o con email). Plan **Free**.
2. **New project**:
   - Nombre: `mi-dieta`.
   - Contraseña de la base de datos: genera una y guárdala en tu gestor de contraseñas (la app no la usa).
   - Región: **Central EU (Frankfurt)** o **West EU (Ireland)**.
   - Si aparece la opción de la Data API, déjala **activada**. Si pregunta si exponer automáticamente las tablas nuevas, da igual: el esquema da los permisos él mismo.
3. Espera a que el proyecto termine de crearse (1–2 min).

## 2. Cerrar el registro
**Authentication → Sign In / Providers** (o *Settings*):
- Desactiva **Allow new users to sign up**. Así solo entra quien tú invites o crees.
- Deja activado el proveedor **Email**.

## 3. Cargar el esquema
**SQL Editor → New query**: pega el contenido entero de `supabase/esquema.sql` y pulsa **Run**. Tiene que acabar con «Success. No rows returned». Si algún día cambia el esquema, se vuelve a ejecutar: no borra datos.

## 4. Dos usuarios de prueba
**Authentication → Users → Add user → Create new user**, dos veces:
- `prueba1@mi-dieta.test` y `prueba2@mi-dieta.test`, cada uno con una contraseña inventada.
- Marca **Auto Confirm User**.

Tu cuenta de verdad se crea más adelante (fase M3), no ahora. (Al final, en M3, la cuenta real es `franluvi2015@gmail.com`, que era uno de los usuarios de pruebas.)

## 5. Conexión para los scripts
**Project Settings → API Keys** (o *Data API*): copia la **URL del proyecto** (`https://xxxx.supabase.co`) y la clave **publishable** (`sb_publishable_…`; si solo aparece la antigua, la **anon public**). **Nunca** copies la `secret` ni la `service_role`.

Crea en la raíz del repo el archivo `.supabase.local.json` (está en `.gitignore`):
```json
{
  "url": "https://xxxx.supabase.co",
  "clave": "sb_publishable_…",
  "pruebas": [
    {"email": "prueba1@mi-dieta.test", "password": "…"},
    {"email": "prueba2@mi-dieta.test", "password": "…"}
  ]
}
```

## 6. Comprobar
```
npm run probar-rls
```
Tiene que terminar con «Todo correcto: cada usuario solo ve lo suyo». Con eso la fase M0 está hecha.

## 7. Probar la app con Supabase (fase M2)
```
npm run supabase-semilla     # biblioteca común (alimentos y recetas semilla) y config del 2.º usuario de pruebas; no pisa nada
npm run probar-supabase      # un día completo con el 2.º usuario de pruebas; compara con el motor solo y lo deja limpio (--dejar: no)
npm run servidor -- real     # la PWA en http://localhost:8099 contra el Supabase de verdad (entra con un usuario de pruebas)
```
Sin red: `npm run servidor` (base falsa en memoria; entra con `prueba@mi-dieta.test` / `prueba`).

## 8. Cuenta real y migración de la hoja (fase M3)
En `.supabase.local.json`, la cuenta real va aparte de las de pruebas (los scripts de Claude Code entran con ella):
```json
  "cuenta": {"email": "franluvi2015@gmail.com", "password": "…"},
```
```
npm run migrar -- --probar     # qué cambiaría en Supabase, sin escribir nada
npm run migrar                 # copia la hoja (Apps Script, acción exportar) a la cuenta real y lo comprueba
npm run migrar -- --comprobar  # solo compara: tablas y acciones de lectura, hoja frente a Supabase
npm run cambiar-contrasena     # en una terminal propia: nueva contraseña de la cuenta real (la guarda en el archivo)
```
La migración no borra nada de la biblioteca común; los datos personales quedan igual que en la hoja (si la cuenta ya tenía otros, pide `--sustituir`). `npm run probar-supabase` se niega a usar la cuenta real (borra los datos del usuario con el que prueba).

**Administrador** (para cambiar alimentos y recetas que haya añadido otra persona): en el SQL Editor,
`insert into public.administradores (user_id) select id from auth.users where email = 'franluvi2015@gmail.com';`
- **Invitar** a tu hermano y a tu novia (fase M6): *Authentication → Users → Invite user*.
- Si el proyecto se pausa por no usarse en 7 días: *Restore project* en el panel; no se pierde nada.
