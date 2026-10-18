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

Tu cuenta de verdad se crea más adelante (fase M3), no ahora.

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

## Más adelante
- **Administrador** (fase M3, cuando exista tu cuenta): en el SQL Editor,
  `insert into public.administradores (user_id) select id from auth.users where email = 'tu@email';`
- **Invitar** a tu hermano y a tu novia (fase M6): *Authentication → Users → Invite user*.
- Si el proyecto se pausa por no usarse en 7 días: *Restore project* en el panel; no se pierde nada.
